"""Hermes no-agent Cron 入口：生成晚间复盘，stdout 由 Gateway 投递。"""

import os
import sys

cli_dir = os.environ.get("FEISHU_CLI_DIR", os.path.expanduser("~/hermes-agent/scripts"))
sys.path.insert(0, cli_dir)
from nightly_review import build_review

print(build_review())
