"""
日报系统 — 模板提醒、录入归档、周报汇总
"""
import sys, os, json
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from feishu_api import send_text
from feishu_cli import append_to_log
from config import OPEN_ID

DAILY_TEMPLATE = """📝 逐风今日日报 | {date}

上午完成了什么？
下午推进了什么？
今天有什么思考/卡点？

回复「日报: 1.xxx 2.xxx / 思考: xxx」我来归档"""


def send_daily_reminder():
    """推送日报提醒"""
    today = datetime.now().strftime("%m月%d日 %A")
    msg = DAILY_TEMPLATE.format(date=today)
    send_text(OPEN_ID, msg)
    return True


def parse_daily(text):
    """解析日报回复"""
    tasks = []
    thoughts = ""
    
    # 去掉日报前缀
    text = text.strip()
    for prefix in ["日报:", "日报："]:
        if text.startswith(prefix):
            text = text[len(prefix):].strip()
            break
    
    # 分离思考
    for sep in [" / 思考:", " / 思考：", "/思考:", "/思考：", " 思考:", " 思考："]:
        if sep in text:
            parts = text.split(sep, 1)
            text = parts[0].strip()
            thoughts = parts[1].strip()
            break
    
    # 提取任务（按 " / " 或换行分割）
    import re
    task_text = text.replace(" / ", "\n")
    for line in task_text.split('\n'):
        line = line.strip()
        if not line:
            continue
        # 匹配 "1. xxx" "1、xxx" "1) xxx" "- xxx"
        m = re.match(r'^[\d]+[\.\、\)]\s*(.+)', line)
        if m:
            tasks.append(m.group(1))
        elif line:
            tasks.append(line)
    
    return tasks, thoughts


def archive_daily(raw_text):
    """归档日报到笔记文档"""
    today = datetime.now().strftime("%Y.%m.%d")
    tasks, thoughts = parse_daily(raw_text)
    
    lines = [f"{today} 日报"]
    if tasks:
        lines.append("完成:")
        for t in tasks:
            lines.append(f"  • {t}")
    if thoughts:
        lines.append(f"思考: {thoughts}")
    
    entry = '\n'.join(lines)
    append_to_log(entry)
    return entry


def collect_week_dailies():
    """收集本周所有日报，供周报生成使用"""
    from feishu_cli import extract_logs
    today = datetime.now()
    monday = today - timedelta(days=today.weekday())
    start = monday.strftime("%Y-%m-%d")
    end = today.strftime("%Y-%m-%d")
    logs = extract_logs(start, end)
    
    # 只筛选日报条目
    dailies = [e for e in logs if "日报" in e["content"]]
    return dailies


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "remind"
    
    if cmd == "remind":
        send_daily_reminder()
        print("✅ 日报提醒已推送")
    elif cmd == "archive":
        text = ' '.join(sys.argv[2:])
        if text:
            entry = archive_daily(text)
            print(entry)
            send_text(OPEN_ID, f"✅ 日报已归档\n\n{entry}")
        else:
            print("用法: archive <日报内容>")
    elif cmd == "collect":
        dailies = collect_week_dailies()
        print(json.dumps(dailies, ensure_ascii=False, indent=2))
    else:
        print("日报系统")
        print("  remind     推送日报提醒")
        print("  archive    归档日报")
        print("  collect    收集本周日报")
