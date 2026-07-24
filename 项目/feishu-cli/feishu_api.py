"""飞书 API 封装，凭据从 Hermes 规范配置目录自动加载。"""
import os, json, time
import requests


def _env_paths():
    """返回 Hermes 配置候选路径，新目录优先、旧目录仅兼容迁移。"""
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    paths = []
    if local_app_data:
        paths.append(os.path.join(local_app_data, "hermes", ".env"))
    paths.append(os.path.expanduser("~/.hermes/.env"))
    return paths


def _load_env():
    """从 Hermes 配置目录加载环境变量，不覆盖进程已有配置。"""
    for env_file in _env_paths():
        if not os.path.exists(env_file):
            continue
        with open(env_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    if k not in os.environ:
                        os.environ[k] = v.strip()

_load_env()

APP_ID = os.environ.get("FEISHU_APP_ID", "")
APP_SECRET = os.environ.get("FEISHU_APP_SECRET", "")
BASE = "https://open.feishu.cn/open-apis"

_token = None
_token_expire = 0


def validate_credentials():
    """在真正访问飞书前校验凭据，允许工具模块被离线测试。"""
    if not APP_ID or not APP_SECRET:
        raise RuntimeError(
            "请设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET 环境变量，"
            "或在 %LOCALAPPDATA%/hermes/.env 中配置"
        )

def _get_token():
    global _token, _token_expire
    validate_credentials()
    if _token and time.time() < _token_expire:
        return _token
    resp = requests.post(f"{BASE}/auth/v3/tenant_access_token/internal",
                         json={"app_id": APP_ID, "app_secret": APP_SECRET}, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    if data.get("code") != 0:
        raise Exception(f"获取token失败: {data}")
    _token = data["tenant_access_token"]
    _token_expire = time.time() + data.get("expire", 7200) - 300
    return _token

def _get(path, params=None):
    token = _get_token()
    r = requests.get(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"},
                     params=params, timeout=30)
    r.raise_for_status()
    return r.json()

def _post(path, body=None, params=None):
    token = _get_token()
    r = requests.post(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"},
                      json=body, params=params, timeout=30)
    r.raise_for_status()
    return r.json()

def _delete(path, body=None):
    token = _get_token()
    r = requests.delete(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"},
                         json=body, timeout=30)
    r.raise_for_status()
    try:
        return r.json()
    except requests.exceptions.JSONDecodeError:
        return {"code": 0}

# ═══ 文档操作 ═══

def read_doc(doc_token: str) -> str:
    data = _get(f"/docx/v1/documents/{doc_token}/raw_content")
    if data.get("code") == 0:
        content = data.get("data", {}).get("content", "")
        if content.strip(): return content
    return _read_blocks(doc_token)

def _read_blocks(doc_token: str) -> str:
    all_text = []
    page_token = None
    for _ in range(20):
        params = {"page_size": 200}
        if page_token: params["page_token"] = page_token
        data = _get(f"/docx/v1/documents/{doc_token}/blocks", params=params)
        if data.get("code") != 0: break
        for item in data["data"]["items"]:
            if item.get("block_type") == 2:
                for e in item.get("text", {}).get("elements", []):
                    c = e.get("text_run", {}).get("content", "")
                    if c: all_text.append(c)
        if not data["data"].get("has_more"): break
        page_token = data["data"].get("page_token")
    return '\n'.join(all_text)

def _make_text_block(text: str, bold: bool = False) -> dict:
    return {"block_type": 2, "text": {"elements": [
        {"text_run": {"content": text, "text_element_style": {"bold": bold}}}
    ], "style": {}}}

def create_doc(title: str) -> dict:
    data = _post("/docx/v1/documents", body={"title": title})
    if data.get("code") != 0:
        raise Exception(f"创建失败: {data.get('msg')}")
    token = data["data"]["document"]["document_id"]
    return {"token": token, "url": f"https://shengcaiyoushu01.feishu.cn/docx/{token}"}

def write_doc(doc_token: str, lines: list):
    api = f"/docx/v1/documents/{doc_token}/blocks/{doc_token}/children"
    blocks = [_make_text_block(t, b) for t, b in lines]
    for i in range(0, len(blocks), 30):
        data = _post(api, body={"children": blocks[i:i+30], "index": i})
        if data.get("code") != 0:
            raise Exception(f"写入失败: {data.get('msg')}")

def append_to_doc(doc_token: str, lines: list):
    api = f"/docx/v1/documents/{doc_token}/blocks/{doc_token}/children"
    blocks = [_make_text_block(t, b) for t, b in lines]
    for i in range(0, len(blocks), 30):
        data = _post(api, body={"children": blocks[i:i+30], "index": -1})
        if data.get("code") != 0:
            raise Exception(f"追加失败: {data.get('msg')}")

# ═══ 日历操作 ═══

def get_primary_calendar():
    """获取当前用户主日历 ID。"""
    data = _post("/calendar/v4/calendars/primary")
    if data.get("code") != 0:
        raise Exception(f"获取主日历失败: {data.get('msg')}")
    calendars = data.get("data", {}).get("calendars", [])
    if not calendars:
        raise Exception("获取主日历失败: 返回结果为空")
    return calendars[0]["calendar"]["calendar_id"]


def list_events(start_time=None, end_time=None, page_size=50):
    """读取指定时间范围的日历事件。"""
    calendar_id = get_primary_calendar()
    events = []
    page_token = None
    for _ in range(20):
        params = {"page_size": page_size}
        if start_time:
            params["start_time"] = start_time
        if end_time:
            params["end_time"] = end_time
        if page_token:
            params["page_token"] = page_token

        data = _get(f"/calendar/v4/calendars/{calendar_id}/events", params=params)
        if data.get("code") != 0:
            raise Exception(f"读取日历事件失败: {data.get('msg')}")
        payload = data.get("data", {})
        for item in payload.get("items", []):
            events.append({
                "event_id": item.get("event_id", ""),
                "summary": item.get("summary", ""),
                "description": item.get("description", ""),
                "start": item.get("start_time", {}).get("date_time", ""),
                "end": item.get("end_time", {}).get("date_time", ""),
                "organizer": item.get("organizer", {}).get("display_name", ""),
            })
        if not payload.get("has_more"):
            break
        page_token = payload.get("page_token")
        if not page_token:
            break
    return events

# ═══ 消息 ═══

def send_text(open_id: str, text: str) -> dict:
    body = {"receive_id": open_id, "msg_type": "text",
            "content": json.dumps({"text": text}, ensure_ascii=False)}
    data = _post("/im/v1/messages", body=body, params={"receive_id_type": "open_id"})
    if data.get("code") != 0:
        raise Exception(f"发送失败: {data.get('msg')}")
    return data
