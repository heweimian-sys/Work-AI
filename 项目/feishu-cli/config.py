"""飞书 CLI 配置。敏感信息只从环境变量或 ~/.hermes/.env 读取。"""
import os

def _load():
    env_file = os.path.expanduser("~/.hermes/.env")
    if os.path.exists(env_file):
        with open(env_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    if k not in os.environ:
                        os.environ[k] = v.strip()

_load()

OPEN_ID = os.environ.get("FEISHU_OPEN_ID", "")
GLM_KEY = os.environ.get("GLM_API_KEY", "")
HTTP_PROXY = os.environ.get("FEISHU_CLI_HTTP_PROXY", "").strip()
DATA_DIR = os.path.expanduser(
    os.environ.get("FEISHU_CLI_DATA_DIR", "~/.hermes/data/feishu-cli")
)
