"""Hermes no-agent Cron 入口：生成资讯并记录历史，stdout 交给 Gateway 投递。"""

import os
import sys


cli_dir = os.environ.get("FEISHU_CLI_DIR", os.path.expanduser("~/hermes-agent/scripts"))
sys.path.insert(0, cli_dir)
from command_router import execute


print(execute("AI资讯") or "今天没有新的 AI 资讯。")
