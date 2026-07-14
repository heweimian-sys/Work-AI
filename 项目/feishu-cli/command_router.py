"""飞书固定指令的确定性路由，不经过 Agent/LLM。"""

import re
from datetime import datetime

from ai_news import build_digest, load_profile, profile_summary, record_feedback
from daily_report import DAILY_TEMPLATE
from feishu_cli import append_to_log, check_ddl
from news_store import NewsStore


FEEDBACK_PATTERN = re.compile(
    r"^AI资讯反馈\s+(N-[0-9a-f]{8})\s+(useful|irrelevant|known|later)$",
    re.IGNORECASE,
)


def command_name(text):
    """返回确定性指令名；普通对话返回 None。"""
    value = (text or "").strip()
    folded = value.casefold()
    if folded in {"ai资讯", "ai日报", "今天有什么ai新闻"}:
        return "news"
    if value in {"日报", "写日报"}:
        return "daily"
    if folded in {"ddl", "截止日期"}:
        return "ddl"
    if value.startswith(("录入:", "录入：")):
        return "note"
    if FEEDBACK_PATTERN.fullmatch(value):
        return "feedback"
    if value == "AI资讯画像":
        return "profile"
    return None


def is_write_command(name):
    return name in {"note", "feedback"}


def execute(text, store=None, fetchers=None):
    """执行固定指令并返回要发送到原会话的纯文本。"""
    value = (text or "").strip()
    name = command_name(value)
    if name is None:
        return None

    store = store or NewsStore()
    if name == "news":
        content, selected = build_digest(
            fetchers=fetchers,
            store=store,
            profile=load_profile(),
        )
        if selected:
            store.record_sent(selected)
        return content
    if name == "daily":
        today = datetime.now().strftime("%m月%d日 %A")
        return DAILY_TEMPLATE.format(date=today)
    if name == "ddl":
        alerts = check_ddl()
        return "\n".join(alerts) if alerts else "近期没有 3 天内到期的 DDL。"
    if name == "note":
        content = re.split(r"[:：]", value, maxsplit=1)[1].strip()
        if not content:
            return "录入内容不能为空。"
        append_to_log(content)
        return f"已记入日志：\n{content[:300]}"
    if name == "feedback":
        match = FEEDBACK_PATTERN.fullmatch(value)
        return record_feedback(store, match.group(1), match.group(2).casefold())
    if name == "profile":
        return profile_summary(store)
    return None
