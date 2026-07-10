"""
周报数据采集：读取日志文档 + 日历事件，输出结构化 JSON
用法: python weekly_data.py [--week-offset 0]
  --week-offset 0 = 本周, -1 = 上周
"""
import logging
import sys
import json
import os
import re
from datetime import datetime, timedelta

import yaml

sys.path.insert(0, os.path.dirname(__file__))
from feishu_api import read_doc, list_events
from date_utils import parse_date_entries, filter_entries_by_week

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ── 从配置文件读取 ──
def _load_doc_tokens():
    """从 config.yaml 读取文档 Token。"""
    config_path = os.path.join(os.path.dirname(__file__), "config.yaml")
    if not os.path.exists(config_path):
        logger.warning("config.yaml 未找到")
        return "", ""
    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}
    docs = config.get("documents", {})
    return docs.get("log", ""), docs.get("report_ref", "")

LOG_DOC_TOKEN, REPORT_DOC_TOKEN = _load_doc_tokens()

def get_week_range(offset=0):
    """返回本周(或偏移周)的起止日期，中国时区。"""
    today = datetime.now()
    monday = today - timedelta(days=today.weekday()) + timedelta(weeks=offset)
    sunday = monday + timedelta(days=6)
    return monday, sunday

def extract_week_entries(text, monday, sunday):
    """从日志文档中提取指定周的条目（使用公共 date_utils 模块）。"""
    entries = parse_date_entries(text)
    monday_str = monday.strftime("%Y-%m-%d")
    sunday_str = sunday.strftime("%Y-%m-%d")
    return [e for e in entries if monday_str <= e["date"] <= sunday_str]

def main():
    offset = 0
    for i, arg in enumerate(sys.argv):
        if arg == "--week-offset" and i+1 < len(sys.argv):
            offset = int(sys.argv[i+1])
    
    monday, sunday = get_week_range(offset)
    
    result = {
        "week": {
            "start": monday.strftime("%Y-%m-%d"),
            "end": sunday.strftime("%Y-%m-%d"),
            "label": f"{monday.strftime('%m.%d')}-{sunday.strftime('%m.%d')}"
        },
        "log_entries": [],
        "calendar_events": [],
        "errors": []
    }
    
    # 读取日志
    try:
        log_text = read_doc(LOG_DOC_TOKEN)
        result["log_entries"] = extract_week_entries(log_text, monday, sunday)
    except Exception as e:
        result["errors"].append(f"日志读取失败: {e}")
    
    # 读取日历
    try:
        start = f"{monday.strftime('%Y-%m-%d')}T00:00:00+08:00"
        end = f"{sunday.strftime('%Y-%m-%d')}T23:59:59+08:00"
        result["calendar_events"] = list_events(start, end)
    except Exception as e:
        result["errors"].append(f"日历读取失败: {e}")
    
    # 读取上周报（参考格式）
    try:
        report = read_doc(REPORT_DOC_TOKEN)
        result["last_report_preview"] = report[:500]
    except:
        pass
    
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
