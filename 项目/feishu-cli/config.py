"""飞书 CLI 配置 — 所有敏感信息从 ~/.hermes/.env 读取"""
import os

def _load():
    env_file = os.path.expanduser("~/.hermes/.env")
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    if k not in os.environ:
                        os.environ[k] = v.strip()

_load()

OPEN_ID = os.environ.get("FEISHU_OPEN_ID", "")
GLM_KEY = os.environ.get("GLM_API_KEY", "")
