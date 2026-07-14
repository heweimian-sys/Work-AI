"""候选记忆审批：Agent 只能提议，用户确认后才能写入长期记忆。"""

import argparse
import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

from config import DATA_DIR


ALLOWED_CATEGORIES = {"lesson", "project", "workflow"}
PROTECTED_CATEGORIES = {"security", "permission", "persona", "identity", "preference"}


def _now():
    return datetime.now(timezone.utc).isoformat()


class CandidateMemoryStore:
    def __init__(self, path=None, memory_path=None):
        self.path = path or os.path.join(DATA_DIR, "memory-candidates.db")
        canonical_home = os.environ.get(
            "HERMES_CANONICAL_HOME",
            os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "hermes"),
        )
        self.memory_path = memory_path or os.path.join(canonical_home, "memories", "MEMORY.md")
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
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS memory_candidates (
                    id TEXT PRIMARY KEY,
                    category TEXT NOT NULL,
                    content TEXT NOT NULL,
                    source TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    decided_at TEXT
                )
                """
            )

    def propose(self, content, category="lesson", source="manual"):
        category = category.casefold().strip()
        if category in PROTECTED_CATEGORIES or category not in ALLOWED_CATEGORIES:
            raise ValueError("只允许提出 lesson/project/workflow 类候选记忆")
        content = " ".join(content.split()).strip()
        if not content:
            raise ValueError("候选记忆不能为空")
        candidate_id = f"M-{uuid.uuid4().hex[:8]}"
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO memory_candidates VALUES (?, ?, ?, ?, 'pending', ?, NULL)",
                (candidate_id, category, content, source, _now()),
            )
        return candidate_id

    def list(self, status="pending"):
        with self._connect() as connection:
            return [dict(row) for row in connection.execute(
                "SELECT * FROM memory_candidates WHERE status = ? ORDER BY created_at", (status,)
            ).fetchall()]

    def _get_pending(self, candidate_id):
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM memory_candidates WHERE id = ? AND status = 'pending'", (candidate_id,)
            ).fetchone()
        if not row:
            raise KeyError(f"没有找到待审批候选 {candidate_id}")
        return dict(row)

    def approve(self, candidate_id, confirmed=False):
        if not confirmed:
            raise PermissionError("批准长期记忆必须显式传入 confirmed=True")
        candidate = self._get_pending(candidate_id)
        os.makedirs(os.path.dirname(self.memory_path), exist_ok=True)
        entry = (
            f"\n<!-- approved-memory:{candidate_id} -->\n"
            f"- [{candidate['category']}] {candidate['content']}\n"
        )
        with open(self.memory_path, "a", encoding="utf-8") as file:
            file.write(entry)
        with self._connect() as connection:
            connection.execute(
                "UPDATE memory_candidates SET status='approved', decided_at=? WHERE id=?",
                (_now(), candidate_id),
            )
        return candidate

    def reject(self, candidate_id):
        candidate = self._get_pending(candidate_id)
        with self._connect() as connection:
            connection.execute(
                "UPDATE memory_candidates SET status='rejected', decided_at=? WHERE id=?",
                (_now(), candidate_id),
            )
        return candidate


def _print_candidates(items):
    if not items:
        print("暂无待审批记忆。")
        return
    for item in items:
        print(f"{item['id']} [{item['category']}] {item['content']} (来源: {item['source']})")


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    propose = sub.add_parser("propose")
    propose.add_argument("content")
    propose.add_argument("--category", default="lesson")
    propose.add_argument("--source", default="manual")
    sub.add_parser("list")
    approve = sub.add_parser("approve")
    approve.add_argument("candidate_id")
    approve.add_argument("--confirm", action="store_true", required=True)
    reject = sub.add_parser("reject")
    reject.add_argument("candidate_id")
    args = parser.parse_args()
    store = CandidateMemoryStore()
    if args.command == "propose":
        print(f"已创建候选记忆 {store.propose(args.content, args.category, args.source)}，等待确认。")
    elif args.command == "list":
        _print_candidates(store.list())
    elif args.command == "approve":
        item = store.approve(args.candidate_id, confirmed=args.confirm)
        print(f"已批准并写入长期记忆：{item['content']}")
    elif args.command == "reject":
        item = store.reject(args.candidate_id)
        print(f"已拒绝候选记忆：{item['content']}")


if __name__ == "__main__":
    main()
