"""资讯历史、反馈和偏好统计的本地 SQLite 存储。"""

import hashlib
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from config import DATA_DIR


ACTIONS = {"useful", "irrelevant", "known", "later"}
ACTION_LABELS = {
    "useful": "有用",
    "irrelevant": "不相关",
    "known": "已知",
    "later": "稍后读",
}
ACTION_WEIGHTS = {"useful": 2.0, "irrelevant": -2.0, "known": -0.5, "later": 1.0}


def fingerprint(url):
    """从规范 URL 生成可在飞书中手工输入的稳定短 ID。"""
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:8]
    return f"N-{digest}"


def _now():
    return datetime.now(timezone.utc).isoformat()


class NewsStore:
    def __init__(self, path=None):
        self.path = path or os.path.join(DATA_DIR, "news.db")
        directory = os.path.dirname(self.path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        self._initialize()

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def _initialize(self):
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS news_items (
                    item_id TEXT PRIMARY KEY,
                    url TEXT NOT NULL,
                    title TEXT NOT NULL,
                    source TEXT NOT NULL,
                    first_seen_at TEXT NOT NULL,
                    last_sent_at TEXT
                );
                CREATE TABLE IF NOT EXISTS news_feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(item_id) REFERENCES news_items(item_id)
                );
                CREATE INDEX IF NOT EXISTS idx_news_sent ON news_items(last_sent_at);
                CREATE INDEX IF NOT EXISTS idx_feedback_item ON news_feedback(item_id);
                """
            )

    def enrich(self, items):
        enriched = []
        for item in items:
            copy = dict(item)
            copy["item_id"] = fingerprint(copy["url"])
            enriched.append(copy)
        return enriched

    def filter_recent(self, items, days=14):
        """过滤最近已推送内容；从未推送或超过窗口的内容保留。"""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        item_ids = [item["item_id"] for item in items]
        if not item_ids:
            return []
        placeholders = ",".join("?" for _ in item_ids)
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT item_id FROM news_items WHERE item_id IN ({placeholders}) "
                "AND last_sent_at >= ?",
                [*item_ids, cutoff],
            ).fetchall()
        recent = {row["item_id"] for row in rows}
        return [item for item in items if item["item_id"] not in recent]

    def record_sent(self, items):
        now = _now()
        with self._connect() as connection:
            for item in items:
                connection.execute(
                    """
                    INSERT INTO news_items(item_id, url, title, source, first_seen_at, last_sent_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(item_id) DO UPDATE SET
                        url=excluded.url,
                        title=excluded.title,
                        source=excluded.source,
                        last_sent_at=excluded.last_sent_at
                    """,
                    (item["item_id"], item["url"], item["title"], item["source"], now, now),
                )

    def add_feedback(self, item_id, action):
        action = action.casefold()
        if action not in ACTIONS:
            raise ValueError("反馈类型应为 useful/irrelevant/known/later")
        with self._connect() as connection:
            item = connection.execute(
                "SELECT item_id, title, source FROM news_items WHERE item_id = ?", (item_id,)
            ).fetchone()
            if not item:
                raise KeyError(f"没有找到资讯 {item_id}，请确认它来自已推送日报")
            connection.execute(
                "INSERT INTO news_feedback(item_id, action, created_at) VALUES (?, ?, ?)",
                (item_id, action, _now()),
            )
        return {"item_id": item_id, "action": action, "title": item["title"]}

    def source_affinity(self):
        """根据显式反馈计算来源偏好，限制幅度避免形成信息茧房。"""
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT i.source, f.action, COUNT(*) AS count
                FROM news_feedback f
                JOIN news_items i ON i.item_id = f.item_id
                GROUP BY i.source, f.action
                """
            ).fetchall()
        scores = {}
        for row in rows:
            scores[row["source"]] = scores.get(row["source"], 0) + (
                ACTION_WEIGHTS.get(row["action"], 0) * row["count"]
            )
        return {source: max(-4.0, min(4.0, score)) for source, score in scores.items()}

    def feedback_summary(self):
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT action, COUNT(*) AS count FROM news_feedback GROUP BY action"
            ).fetchall()
        counts = {action: 0 for action in ACTIONS}
        counts.update({row["action"]: row["count"] for row in rows})
        return counts
