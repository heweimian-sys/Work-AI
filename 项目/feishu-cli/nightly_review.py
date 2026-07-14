"""每晚工作复盘：生成报告并提出候选记忆，不直接修改长期画像。"""

import re
from datetime import datetime

from feishu_cli import extract_logs
from memory_candidates import CandidateMemoryStore


LEARNING_PATTERN = re.compile(r"(?:反思|经验|学到|教训)[:：]\s*(.+)")


def build_review(date=None, entries=None, store=None):
    target = date or datetime.now().strftime("%Y-%m-%d")
    if entries is None:
        entries = extract_logs(target, target)
    store = store or CandidateMemoryStore()
    contents = [entry.get("content", "").strip() for entry in entries if entry.get("content", "").strip()]
    candidates = []
    for content in contents:
        for match in LEARNING_PATTERN.finditer(content):
            lesson = match.group(1).strip()
            if lesson:
                candidates.append(store.propose(lesson, "lesson", f"nightly-review:{target}"))

    lines = [f"工作复盘 | {target}", ""]
    if contents:
        lines.append(f"今天记录了 {len(contents)} 条工作内容。")
        for index, content in enumerate(contents, 1):
            summary = " ".join(content.split())[:180]
            lines.append(f"{index}. {summary}")
    else:
        lines.append("今天还没有找到日志，请补充：完成事项、未完成原因、明日重点和反思。")
    lines.extend([
        "",
        "复盘问题：",
        "1. 今天真正推进结果的动作是什么？",
        "2. 哪件事反复卡住，明天先验证什么？",
        "3. 有什么经验值得进入长期记忆？",
    ])
    if candidates:
        lines.append("")
        lines.append("已生成候选记忆（不会自动写入）：" + "、".join(candidates))
        lines.append("发送“候选记忆”查看，确认后才能批准。")
    return "\n".join(lines)


if __name__ == "__main__":
    print(build_review())
