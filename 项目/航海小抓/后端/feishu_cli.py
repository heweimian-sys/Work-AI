"""
飞书 CLI 核心功能：提醒、问答、工作流
"""
import json
import logging
import sys
import os
import re
from datetime import datetime, timedelta

import yaml

sys.path.insert(0, os.path.dirname(__file__))
from feishu_api import _get_token, read_doc, send_text, _post, _make_text_block
from date_utils import parse_date_entries, filter_entries_by_week

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ── 从环境变量读取 ──
OPEN_ID = os.environ.get("FEISHU_OPEN_ID", "")

# ── 从配置文件读取 ──
def _load_config():
    """加载 config.yaml，返回配置字典。"""
    config_path = os.path.join(os.path.dirname(__file__), "config.yaml")
    if not os.path.exists(config_path):
        logger.warning("config.yaml 未找到，使用默认空配置")
        return {}
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}

_config = _load_config()
_docs = _config.get("documents", {})
LOG_DOC = _docs.get("log", "")
NOTES_DOC = _docs.get("notes", "")
REPORT_DOC = _docs.get("report", "")

# ══════════════ 📋 智能提醒 ══════════════

REMINDERS = {
    "daily": "📝 逐风，今天的日志写了吗？\n\n记得记录：\n• 今日工作任务\n• 完成情况\n• 反思与收获",
    "weekly": "📊 逐风，周五啦！本周周报该整理了。\n\n在飞书私聊里对我说「生成本周周报」，我来帮你自动生成。",
}

DDL_WATCH = _config.get("ddl_watch", [])

def check_ddl():
    today = datetime.now()
    alerts = []
    for item in DDL_WATCH:
        ddl = datetime.strptime(item["ddl"], "%Y-%m-%d")
        days = (ddl - today).days
        if 0 <= days <= 3:
            label = str(days) + "天" if days > 0 else "就在今天"
            alerts.append(item["msg"].format(days=label))
    return alerts

def send_reminder(rtype):
    labels = {"daily": "每日日志提醒", "weekly": "周末周报提醒", "ddl": "截止日期预警"}
    if rtype in REMINDERS:
        send_text(OPEN_ID, f"⏰ {labels[rtype]}\n\n{REMINDERS[rtype]}")
    elif rtype == "ddl":
        alerts = check_ddl()
        if alerts:
            send_text(OPEN_ID, "⚠️ 截止日期预警\n\n" + "\n".join(alerts))

# ══════════════ 🧠 知识库搜索 ══════════════

def search_docs(query, doc_tokens=None):
    if doc_tokens is None:
        doc_tokens = [LOG_DOC, REPORT_DOC]
    results = []
    for token in doc_tokens:
        try:
            content = read_doc(token)
            lines = content.split('\n')
            for i, line in enumerate(lines):
                if query.lower() in line.lower():
                    ctx_start = max(0, i-2)
                    ctx_end = min(len(lines), i+3)
                    results.append({
                        "token": token,
                        "snippet": '\n'.join(lines[ctx_start:ctx_end])[:300]
                    })
                    if len(results) >= 10:
                        break
        except:
            pass
    return results

# ══════════════ 📊 日志提取 ══════════════

def extract_logs(start, end):
    """提取日志 + CLI 笔记，按日期合并。"""
    # 读日志文档
    log_content = read_doc(LOG_DOC)
    # 读笔记文档（允许缺失）
    notes_content = ""
    try:
        notes_content = read_doc(NOTES_DOC)
    except Exception as e:
        logger.warning("读取笔记文档失败: %s", e)

    # 合并两份内容
    combined = log_content
    if notes_content.strip():
        combined += "\n" + notes_content

    # 用公共模块解析
    all_entries = parse_date_entries(combined)

    # 过滤日期范围
    start_dt = datetime.strptime(start, "%Y-%m-%d")
    end_dt = datetime.strptime(end, "%Y-%m-%d")
    start_str = start_dt.strftime("%Y-%m-%d")
    end_str = end_dt.strftime("%Y-%m-%d")

    return [e for e in all_entries if start_str <= e["date"] <= end_str]


# ══════════════ 📝 日志录入 ══════════════

def append_to_log(text, date_str=None):
    """录入笔记到 CLI 笔记文档，带日期戳"""
    if date_str is None:
        date_str = datetime.now().strftime("%Y.%m.%d")
    
    api = f"/docx/v1/documents/{NOTES_DOC}/blocks/{NOTES_DOC}/children"
    
    blocks = [
        _make_text_block(f"{date_str} CLI录入", True),
        _make_text_block(text, False),
        _make_text_block("", False),
    ]
    _post(api, body={"children": blocks, "index": -1})
    return True


def update_ddl(keyword, new_date):
    """更新 DDL 跟踪，并写回 config.yaml。"""
    for item in DDL_WATCH:
        if keyword in item.get("keyword", ""):
            old = item["ddl"]
            item["ddl"] = new_date
            # 写回配置文件
            config_path = os.path.join(os.path.dirname(__file__), "config.yaml")
            _config["ddl_watch"] = DDL_WATCH
            with open(config_path, "r", encoding="utf-8") as f:
                old_yaml = f.read()
            # 简单文本替换更新
            pattern = rf'("{re.escape(keyword)}"\s*\n\s*ddl:\s*"){re.escape(old)}"'
            if re.search(pattern, old_yaml):
                new_yaml = re.sub(pattern, rf'\g<1>{new_date}"', old_yaml)
                with open(config_path, "w", encoding="utf-8") as f:
                    f.write(new_yaml)
            logger.info("DDL 已更新并持久化: %s %s → %s", keyword, old, new_date)
            return f"✅ {item['keyword']} DDL 已更新：{old} → {new_date}"
    return f"⚠️ 未找到关键词「{keyword}」的DDL"


# ══════════════ CLI ══════════════

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    
    if cmd == "remind":
        rtype = sys.argv[2] if len(sys.argv) > 2 else "ddl"
        send_reminder(rtype)
        print(f"已发送 {rtype} 提醒")
    elif cmd == "search":
        q = sys.argv[2] if len(sys.argv) > 2 else ""
        if q:
            print(json.dumps(search_docs(q), ensure_ascii=False, indent=2))
    elif cmd == "logs":
        s = sys.argv[2] if len(sys.argv) > 2 else datetime.now().strftime("%Y-%m-%d")
        e = sys.argv[3] if len(sys.argv) > 3 else s
        print(json.dumps(extract_logs(s, e), ensure_ascii=False, indent=2))
    elif cmd == "ddl":
        alerts = check_ddl()
        print('\n'.join(alerts) if alerts else "✅ 近期无紧急 DDL")
    elif cmd == "note":
        text = ' '.join(sys.argv[2:])
        if text:
            append_to_log(text)
            send_text(OPEN_ID, f"📝 已记入今日日志：\n{text[:200]}")
            print("✅ 已录入日志")
        else:
            print("用法: note <内容>")
    elif cmd == "ddl-set":
        kw = sys.argv[2] if len(sys.argv) > 2 else ""
        dt = sys.argv[3] if len(sys.argv) > 3 else ""
        if kw and dt:
            result = update_ddl(kw, dt)
            print(result)
            send_text(OPEN_ID, result)
        else:
            print("用法: ddl-set <关键词> <日期>")
    else:
        print("📱 逐风的飞书 CLI 工具集\n"
              "  remind daily    每日日志提醒\n"
              "  remind weekly   周报提醒\n"
              "  remind ddl      截止日期预警\n"
              "  search <关键词>  搜索飞书文档\n"
              "  logs 开始 结束   提取日志条目\n"
              "  note <内容>     录入今日日志\n"
              "  ddl-set <关键词> <日期>  更新DDL\n"
              "  ddl             查看近期截止日")
