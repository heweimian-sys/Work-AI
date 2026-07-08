"""
日期工具模块 — 日志文档的日期条目解析，消除 feishu_cli 和 weekly_data 的重复逻辑。

用法:
    from date_utils import parse_date_entries, DATE_PATTERN

    entries = parse_date_entries(text)
    week_entries = [e for e in entries if monday_str <= e["date"] <= sunday_str]
"""

import re
from datetime import datetime, timedelta
from typing import Optional

# 日期行匹配：2026.6.8 / 2026.06.08 / 2026-06-08 / 2026/06/08
DATE_PATTERN = re.compile(r"^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\b")


def parse_date(text: str) -> Optional[str]:
    """尝试从行首解析日期，返回 YYYY-MM-DD 格式或 None。"""
    m = DATE_PATTERN.match(text.strip())
    if not m:
        return None
    try:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        dt = datetime(y, mo, d)
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return None


def parse_date_entries(text: str) -> list[dict]:
    """从日志文档纯文本中提取按日期分组的条目。

    Returns:
        [{"date": "2026-07-08", "content": "..."}, ...]
    """
    if not text or not text.strip():
        return []

    lines = text.split("\n")
    entries: list[dict] = []
    current_date: Optional[str] = None
    current_lines: list[str] = []

    for line in lines:
        parsed = parse_date(line)
        if parsed:
            # 保存上一个条目
            if current_date and current_lines:
                entries.append({
                    "date": current_date,
                    "content": "\n".join(current_lines).strip(),
                })
            current_date = parsed
            current_lines = [line.strip()]
        elif current_date:
            current_lines.append(line)

    # 最后一个条目
    if current_date and current_lines:
        entries.append({
            "date": current_date,
            "content": "\n".join(current_lines).strip(),
        })

    return entries


def filter_entries_by_week(
    entries: list[dict],
    offset: int = 0,
) -> tuple[list[dict], datetime, datetime]:
    """过滤指定周的条目。

    Args:
        entries: parse_date_entries 的输出
        offset: 0 = 本周, -1 = 上周

    Returns:
        (filtered_entries, monday, sunday)
    """
    today = datetime.now()
    monday = today - timedelta(days=today.weekday()) + timedelta(weeks=offset)
    sunday = monday + timedelta(days=6)

    monday_str = monday.strftime("%Y-%m-%d")
    sunday_str = sunday.strftime("%Y-%m-%d")

    filtered = [e for e in entries if monday_str <= e["date"] <= sunday_str]
    return filtered, monday, sunday
