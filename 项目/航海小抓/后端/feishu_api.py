"""
飞书 API 封装：纯 HTTP 调用，不依赖 lark-oapi SDK
自动管理 tenant_access_token (2h 有效期)
"""
import os, json, sys, time
import requests

APP_ID = os.environ["FEISHU_APP_ID"]
APP_SECRET = os.environ["FEISHU_APP_SECRET"]
BASE = "https://open.feishu.cn/open-apis"

_token = None
_token_expire = 0


def _get_token():
    global _token, _token_expire
    if _token and time.time() < _token_expire:
        return _token
    resp = requests.post(f"{BASE}/auth/v3/tenant_access_token/internal",
                         json={"app_id": APP_ID, "app_secret": APP_SECRET}, timeout=10)
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
    return r.json()


def _post(path, body=None, params=None):
    token = _get_token()
    r = requests.post(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"},
                      json=body, params=params, timeout=30)
    return r.json()


def _put(path, body=None):
    token = _get_token()
    r = requests.put(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"},
                     json=body, timeout=30)
    return r.json()


def _delete(path, body=None):
    token = _get_token()
    r = requests.delete(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"},
                         json=body, timeout=30)
    try:
        return r.json()
    except:
        return {"code": r.status_code}


# ══════════════ 文档操作 ══════════════

def _load_env():
    """加载 .env 文件（若存在）。在脚本目录下查找。"""
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key, val = key.strip(), val.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = val


# 模块加载时自动读取 .env
_load_env()


def read_doc(doc_token: str) -> str:
    """读取飞书文档。raw_content 优先，仅纯 block 文档才回退"""
    data = _get(f"/docx/v1/documents/{doc_token}/raw_content")
    if data.get("code") == 0:
        content = data.get("data", {}).get("content", "")
        if content.strip():
            return content
    # raw_content 为空 → 纯 block 文档，逐页读文本块
    return _read_from_blocks(doc_token)


def _read_from_blocks(doc_token: str) -> str:
    """通过 block API 读取所有文本块（仅用于纯 block 文档）"""
    all_text = []
    page_token = None
    for _ in range(20):  # 最多 20 页
        params = {"page_size": 200}
        if page_token:
            params["page_token"] = page_token
        data = _get(f"/docx/v1/documents/{doc_token}/blocks", params=params)
        if data.get("code") != 0:
            raise Exception(f"block读取失败: {data.get('msg')}")
        for item in data["data"]["items"]:
            if item.get("block_type") == 2:
                for elem in item.get("text", {}).get("elements", []):
                    c = elem.get("text_run", {}).get("content", "")
                    if c:
                        all_text.append(c)
        if not data["data"].get("has_more"):
            break
        page_token = data["data"].get("page_token")
    return '\n'.join(all_text)


def create_doc(title: str, folder_token: str = None) -> dict:
    """创建空飞书文档，返回 {token, url}"""
    body = {"title": title}
    if folder_token:
        body["folder_token"] = folder_token
    data = _post("/docx/v1/documents", body=body)
    if data.get("code") != 0:
        raise Exception(f"创建文档失败: code={data['code']} msg={data.get('msg')}")
    doc = data["data"]["document"]
    token = doc["document_id"]
    return {"token": token, "url": f"https://shengcaiyoushu01.feishu.cn/wiki/{token}"}


def _make_text_block(text: str, bold: bool = False) -> dict:
    return {"block_type": 2, "text": {"elements": [
        {"text_run": {"content": text, "text_element_style": {"bold": bold}}}
    ], "style": {}}}


def _clear_doc_children(doc_token: str):
    """清除文档所有子block"""
    data = _get(f"/docx/v1/documents/{doc_token}/blocks")
    if data.get("code") != 0:
        return
    items = data["data"]["items"]
    child_ids = [it["block_id"] for it in items if it.get("parent_id") == doc_token and it["block_id"] != doc_token]
    if child_ids:
        _delete(f"/docx/v1/documents/{doc_token}/blocks/{doc_token}/children/batch_delete",
                body={"start_index": 0, "end_index": len(child_ids)})


def write_doc(doc_token: str, lines: list, title: str = None):
    """写入文档内容（先清空再写入）。lines: [(text, bold), ...]"""
    if title:
        # 更新标题
        pass  # 标题在创建时已设定
    
    _clear_doc_children(doc_token)
    api = f"/docx/v1/documents/{doc_token}/blocks/{doc_token}/children"
    blocks = [_make_text_block(text, bold) for text, bold in lines]
    
    offset = 0
    for i in range(0, len(blocks), 30):
        batch = blocks[i:i+30]
        data = _post(api, body={"children": batch, "index": offset})
        if data.get("code") != 0:
            raise Exception(f"写入文档失败: code={data['code']} msg={data.get('msg')}")
        offset += len(batch)

    return {"code": 0, "msg": "success"}


def append_to_doc(doc_token: str, lines: list):
    """追加内容到文档末尾。lines: [(text, bold), ...]"""
    api = f"/docx/v1/documents/{doc_token}/blocks/{doc_token}/children"
    blocks = [_make_text_block(text, bold) for text, bold in lines]
    data = _post(api, body={"children": blocks, "index": -1})
    if data.get("code") != 0:
        raise Exception(f"追加文档失败: code={data['code']} msg={data.get('msg')}")
    return data


# ══════════════ 日历操作 ══════════════

def get_primary_calendar():
    """获取主日历"""
    data = _post("/calendar/v4/calendars/primary")
    if data.get("code") != 0:
        raise Exception(f"获取主日历失败: code={data['code']} msg={data.get('msg')}")
    return data["data"]["calendars"][0]["calendar"]["calendar_id"]


def list_events(start_time: str = None, end_time: str = None, page_size: int = 50):
    """读取日历事件。时间格式: 2026-07-06T00:00:00+08:00"""
    calendar_id = get_primary_calendar()
    events = []
    page_token = None
    
    while True:
        params = {"page_size": page_size}
        if start_time:
            params["start_time"] = start_time
        if end_time:
            params["end_time"] = end_time
        if page_token:
            params["page_token"] = page_token
        
        data = _get(f"/calendar/v4/calendars/{calendar_id}/events", params=params)
        if data.get("code") != 0:
            raise Exception(f"读取日历事件失败: code={data['code']} msg={data.get('msg')}")
        
        for item in data.get("data", {}).get("items", []):
            events.append({
                "event_id": item.get("event_id", ""),
                "summary": item.get("summary", ""),
                "description": item.get("description", ""),
                "start": item.get("start_time", {}).get("date_time", ""),
                "end": item.get("end_time", {}).get("date_time", ""),
                "organizer": item.get("organizer", {}).get("display_name", ""),
            })
        
        if not data.get("data", {}).get("has_more"):
            break
        page_token = data["data"].get("page_token")
    
    return events


# ══════════════ 消息操作 ══════════════

def send_text(open_id: str, text: str) -> dict:
    """发送文本消息给指定用户"""
    body = {
        "receive_id": open_id,
        "msg_type": "text",
        "content": json.dumps({"text": text}, ensure_ascii=False)
    }
    data = _post("/im/v1/messages", body=body, params={"receive_id_type": "open_id"})
    if data.get("code") != 0:
        raise Exception(f"发送消息失败: code={data['code']} msg={data.get('msg')}")
    return data


def send_interactive(open_id: str, title: str, content: str, confirm_text: str = "确认更新", cancel_text: str = "再看看") -> dict:
    """发送交互式卡片消息"""
    card = {
        "config": {"wide_screen_mode": True},
        "header": {"title": {"tag": "plain_text", "content": title}, "template": "blue"},
        "elements": [
            {"tag": "markdown", "content": content},
            {"tag": "action", "actions": [
                {"tag": "button", "text": {"tag": "plain_text", "content": confirm_text}, "type": "primary", "value": json.dumps({"action": "confirm"})},
                {"tag": "button", "text": {"tag": "plain_text", "content": cancel_text}, "type": "default", "value": json.dumps({"action": "cancel"})}
            ]}
        ]
    }
    body = {
        "receive_id": open_id,
        "msg_type": "interactive",
        "content": json.dumps(card, ensure_ascii=False)
    }
    data = _post("/im/v1/messages", body=body, params={"receive_id_type": "open_id"})
    if data.get("code") != 0:
        raise Exception(f"发送卡片失败: code={data['code']} msg={data.get('msg')}")
    return data


# ══════════════ CLI ══════════════

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    
    if cmd == "read_doc":
        print(read_doc(sys.argv[2]))
    elif cmd == "create_doc":
        r = create_doc(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
        print(json.dumps(r, ensure_ascii=False))
    elif cmd == "update_doc":
        update_doc_content(sys.argv[2], sys.argv[3])
        print("OK")
    elif cmd == "append_doc":
        append_to_doc(sys.argv[2], sys.argv[3])
        print("OK")
    elif cmd == "calendar":
        events = list_events(sys.argv[2] if len(sys.argv) > 2 else None,
                             sys.argv[3] if len(sys.argv) > 3 else None)
        print(json.dumps(events, ensure_ascii=False, indent=2))
    else:
        print("Commands:")
        print("  read_doc <token>              - Read document content")
        print("  create_doc <title> [folder]   - Create new document")
        print("  update_doc <token> <content>  - Full update document")
        print("  append_doc <token> <content>  - Append to document")
        print("  calendar [start] [end]        - List calendar events")
