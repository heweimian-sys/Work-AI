"""日志日期条目的解析与周范围过滤工具。"""

import re
from datetime import datetime, timedelta
from typing import Optional


DATE_PATTERN = re.compile(r"^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\b")


def parse_date(text: str) -> Optional[str]:
    """从行首解析日期，返回 YYYY-MM-DD；无有效日期时返回 None。"""
    match = DATE_PATTERN.match(text.strip())
    if not match:
        return None
    try:
        year, month, day = (int(value) for value in match.groups())
        return datetime(year, month, day).strftime("%Y-%m-%d")
    except ValueError:
        return None


def parse_date_entries(text: str) -> list[dict]:
    """把包含日期标题的纯文本解析成日期条目列表。"""
    if not text or not text.strip():
        return []

    entries = []
    current_date = None
    current_lines = []
    for line in text.splitlines():
        parsed = parse_date(line)
        if parsed:
            if current_date and current_lines:
                entries.append({
                    "date": current_date,
                    "content": "\n".join(current_lines).strip(),
                })
            current_date = parsed
            current_lines = [line.strip()]
        elif current_date:
            current_lines.append(line)

    if current_date and current_lines:
        entries.append({
            "date": current_date,
            "content": "\n".join(current_lines).strip(),
        })
    return entries


def filter_entries_by_week(
    entries: list[dict], offset: int = 0
) -> tuple[list[dict], datetime, datetime]:
    """返回指定周的条目及周一、周日时间。"""
    today = datetime.now()
    monday = today - timedelta(days=today.weekday()) + timedelta(weeks=offset)
    sunday = monday + timedelta(days=6)
    start = monday.strftime("%Y-%m-%d")
    end = sunday.strftime("%Y-%m-%d")
    return [item for item in entries if start <= item["date"] <= end], monday, sunday
