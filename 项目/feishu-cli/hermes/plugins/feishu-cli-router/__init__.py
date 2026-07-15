"""Hermes 插件：固定指令绕过 LLM，并实施飞书身份分级。"""

from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import sys
from pathlib import Path


logger = logging.getLogger(__name__)
PUBLIC_GROUP_COMMANDS = {"news", "profile", "intro"}
WRITE_COMMANDS = {"note", "feedback"}
RESEARCH_HINTS = ("搜索", "找找", "调研", "查找", "去推特", "github", "GitHub")


def _cli_dir():
    return Path(os.environ.get("FEISHU_CLI_DIR", Path.home() / "hermes-agent" / "scripts"))


def _owner_id():
    return (os.environ.get("FEISHU_OWNER_OPEN_ID") or os.environ.get("FEISHU_OPEN_ID") or "").strip()


def _command_name(text):
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
    if folded.startswith("ai资讯反馈 "):
        return "feedback"
    if value == "AI资讯画像":
        return "profile"
    if value in {"自我介绍", "自我介绍一下", "你是谁"}:
        return "intro"
    return None


def _policy(event, command):
    if command is None:
        return "ignore"
    source = event.source
    owner = _owner_id()
    is_owner = bool(owner and source.user_id == owner)
    chat_type = (source.chat_type or "").lower()
    if is_owner:
        return "execute"
    if chat_type in {"group", "forum", "channel"} and command in PUBLIC_GROUP_COMMANDS:
        return "execute"
    if command in WRITE_COMMANDS or chat_type in {"group", "forum", "channel"}:
        return "deny"
    return "ignore"


async def _send(gateway, source, text):
    adapter = gateway.adapters.get(source.platform)
    if adapter is None:
        logger.error("feishu-cli-router: adapter unavailable for %s", source.platform)
        return
    await adapter.send(source.chat_id, text)


def _run_router(text):
    cli_dir = _cli_dir()
    code = (
        "import sys; "
        f"sys.path.insert(0, {str(cli_dir)!r}); "
        "from command_router import execute; "
        f"result=execute({text!r}); "
        "print(result or '')"
    )
    completed = subprocess.run(
        [sys.executable, "-c", code],
        cwd=cli_dir,
        text=True,
        capture_output=True,
        timeout=180,
        check=False,
    )
    if completed.returncode != 0:
        logger.error("feishu-cli-router failed: %s", completed.stderr[-1000:])
        return "指令执行失败，请稍后重试。"
    return completed.stdout.strip()


async def _execute_and_reply(gateway, source, text):
    try:
        result = await asyncio.to_thread(_run_router, text)
    except Exception as error:
        logger.exception("feishu-cli-router exception: %s", error)
        result = "指令执行失败，请稍后重试。"
    await _send(gateway, source, result or "指令已执行，但没有返回内容。")


def pre_gateway_dispatch(event, gateway, **_kwargs):
    if getattr(event.source.platform, "value", "") != "feishu":
        return None
    command = _command_name(event.text)
    if command is None and source_is_owner(event.source) and any(
        hint in (event.text or "") for hint in RESEARCH_HINTS
    ):
        asyncio.get_running_loop().create_task(
            _send(gateway, event.source, "收到，正在检索并筛选。预计 1-3 分钟；若耗时更久，我会继续报告进度。")
        )
    policy = _policy(event, command)
    if policy == "ignore":
        return None
    if policy == "deny":
        asyncio.get_running_loop().create_task(
            _send(gateway, event.source, "该操作仅限管理员。群成员目前只能查询公开 AI 资讯。")
        )
        return {"action": "skip", "reason": "feishu-role-policy"}
    asyncio.get_running_loop().create_task(
        _execute_and_reply(gateway, event.source, event.text)
    )
    return {"action": "skip", "reason": f"deterministic-command:{command}"}


def source_is_owner(source):
    owner = _owner_id()
    return bool(owner and source.user_id == owner)


def register(ctx):
    ctx.register_hook("pre_gateway_dispatch", pre_gateway_dispatch)
