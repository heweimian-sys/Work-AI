"""周报确定性工具：采集输入、校验草稿、确认后写入飞书。"""

import argparse
import json
import os
from pathlib import Path

import yaml

from feishu_api import append_to_doc, read_doc
from weekly_data import collect_week_data


PERSONAL_SECTIONS = ("核心工作", "项目进展", "思考沉淀", "下周计划")
DEPARTMENT_SECTIONS = ("核心工作", "常规性事务工作", "个人思考", "下周工作计划")


def _load_config():
    path = Path(__file__).with_name("config.yaml")
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def required_sections(report_type):
    if report_type == "personal":
        return PERSONAL_SECTIONS
    if report_type == "department":
        return DEPARTMENT_SECTIONS
    raise ValueError(f"未知周报类型: {report_type}")


def validate_draft(content, report_type):
    """校验栏目、空内容和高风险占位符，不评价业务事实。"""
    errors = []
    text = (content or "").strip()
    if not text:
        return ["周报内容为空"]

    missing = [section for section in required_sections(report_type) if section not in text]
    if missing:
        errors.append("缺少栏目: " + "、".join(missing))

    placeholders = ("待补充", "TODO", "TBD", "XXX", "不知道")
    found = [value for value in placeholders if value.casefold() in text.casefold()]
    if found:
        errors.append("仍含待确认占位符: " + "、".join(found))

    if report_type == "personal" and "下周计划" in text and len(text.split("下周计划", 1)[-1].strip()) < 8:
        errors.append("下周计划内容过短")
    if report_type == "department" and "下周工作计划" in text and len(text.split("下周工作计划", 1)[-1].strip()) < 8:
        errors.append("下周工作计划内容过短")
    return errors


def collect_inputs(report_type, week_offset=0):
    """返回 Hermes 生成草稿需要的事实输入和明确约束。"""
    data = collect_week_data(week_offset)
    data["report_type"] = report_type
    data["required_sections"] = list(required_sections(report_type))
    data["decision_rules"] = {
        "include": [
            "推动重要项目并产生结果",
            "解决阻塞问题或暴露业务风险",
            "形成可复用的方法、判断或沉淀",
            "下周仍需继续推进的事项",
        ],
        "exclude": [
            "无结果的琐碎动作",
            "重复描述",
            "与核心工作无关的临时事项",
            "只有过程没有意义或结果的流水账",
        ],
        "never_invent": ["事实", "数据", "完成状态", "业务影响"],
    }

    if report_type == "department":
        config = _load_config()
        report_token = config.get("documents", {}).get("report", "")
        data["confirmed_personal_report"] = ""
        if report_token:
            try:
                report_text = read_doc(report_token)
                data["confirmed_personal_report"] = report_text[-12000:]
            except Exception as error:
                data["errors"].append(f"个人周报读取失败: {error}")
    return data


def publish(report_type, draft_path, confirmed=False):
    """确认后把已校验草稿追加到对应飞书文档。"""
    if not confirmed:
        raise RuntimeError("发布前必须由用户确认，并显式传入 --confirm")

    content = Path(draft_path).read_text(encoding="utf-8").strip()
    errors = validate_draft(content, report_type)
    if errors:
        raise RuntimeError("；".join(errors))

    config = _load_config()
    docs = config.get("documents", {})
    key = "report" if report_type == "personal" else "department_report"
    token = docs.get(key, "")
    if not token:
        raise RuntimeError(f"documents.{key} 未配置")

    lines = [(line, False) for line in content.splitlines()]
    lines.append(("", False))
    append_to_doc(token, lines)
    return {"report_type": report_type, "line_count": len(lines) - 1}


def main():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    collect_parser = subparsers.add_parser("collect")
    collect_parser.add_argument("--type", choices=("personal", "department"), required=True)
    collect_parser.add_argument("--week-offset", type=int, default=0)

    validate_parser = subparsers.add_parser("validate")
    validate_parser.add_argument("--type", choices=("personal", "department"), required=True)
    validate_parser.add_argument("--file", required=True)

    publish_parser = subparsers.add_parser("publish")
    publish_parser.add_argument("--type", choices=("personal", "department"), required=True)
    publish_parser.add_argument("--file", required=True)
    publish_parser.add_argument("--confirm", action="store_true")

    args = parser.parse_args()
    if args.command == "collect":
        result = collect_inputs(args.type, args.week_offset)
    elif args.command == "validate":
        content = Path(args.file).read_text(encoding="utf-8")
        result = {"errors": validate_draft(content, args.type)}
    else:
        result = publish(args.type, args.file, args.confirm)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
