"""技能训练师：按用户持久化多轮训练状态。"""

import json
import os
import sys
import tempfile
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
from config import DATA_DIR, OPEN_ID
from feishu_api import _post, send_text


NOTE_DOC = os.environ.get("FEISHU_NOTES_DOC", "")
SESSION_FILE = os.path.join(DATA_DIR, "trainer-sessions.json")


class SessionStore:
    """使用原子替换持久化轻量会话，避免进程重启丢失状态。"""

    def __init__(self, path=SESSION_FILE):
        self.path = path

    def load(self):
        try:
            with open(self.path, encoding="utf-8") as file:
                data = json.load(file)
                return data if isinstance(data, dict) else {}
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return {}

    def save(self, data):
        directory = os.path.dirname(self.path)
        os.makedirs(directory, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(prefix="trainer-", suffix=".json", dir=directory)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as file:
                json.dump(data, file, ensure_ascii=False, indent=2)
            os.replace(temporary, self.path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def get(self, user_id, flow):
        return self.load().get(user_id, {}).get(flow)

    def set(self, user_id, flow, state):
        data = self.load()
        data.setdefault(user_id, {})[flow] = state
        self.save(data)

    def delete(self, user_id, flow):
        data = self.load()
        user = data.get(user_id, {})
        user.pop(flow, None)
        if not user:
            data.pop(user_id, None)
        self.save(data)


def _user_id(user_id=None):
    return user_id or OPEN_ID or "local-user"


def _ask(question, user_id=None, send=True):
    if send:
        if not (user_id or OPEN_ID):
            raise RuntimeError("发送训练问题前请配置 FEISHU_OPEN_ID")
        send_text(_user_id(user_id), question)
    return question


def weekly_trainer(answer=None, user_id=None, store=None, send=True):
    """推进周报训练；首次空输入开始，之后每次输入作为上一问答案。"""
    store = store or SessionStore()
    uid = _user_id(user_id)
    state = store.get(uid, "weekly")

    if not state or answer in (None, "start"):
        store.set(uid, "weekly", {"step": 1})
        return _ask(
            "周报思维训练 · 第一步\n\n这周让你最有成就感的一个词是什么？回复一个词。",
            uid,
            send,
        )

    answer = answer.strip()
    if not answer:
        return _ask("请先回答当前问题，我会继续下一步。", uid, send)
    if state["step"] == 1:
        state.update({"keyword": answer, "step": 2})
        store.set(uid, "weekly", state)
        return _ask(
            f"「{answer}」——第二步：你具体做了什么？为什么重要？带来了什么？3 句话以内。",
            uid,
            send,
        )
    if state["step"] == 2:
        state.update({"content": answer, "step": 3})
        store.set(uid, "weekly", state)
        return _ask("第三步：这件事里你学到了什么？一句话。", uid, send)

    store.delete(uid, "weekly")
    return _ask(
        "周报思维训练完成\n\n"
        f"核心词：{state['keyword']}\n"
        f"做了什么：{state['content']}\n"
        f"学到了：{answer}\n\n"
        "周报重点不是罗列动作，而是说明解决了什么问题、产生了什么结果、学到了什么。",
        uid,
        send,
    )


def agent_log(text, user_id=None, send=True):
    if not NOTE_DOC:
        raise RuntimeError("请配置 FEISHU_NOTES_DOC 后再记录 Agent 日志")
    today = datetime.now().strftime("%Y.%m.%d")
    entry = f"{today} Agent日志\n{text.strip()}"
    api = f"/docx/v1/documents/{NOTE_DOC}/blocks/{NOTE_DOC}/children"
    blocks = [
        {"block_type": 2, "text": {"elements": [{"text_run": {"content": entry, "text_element_style": {}}}], "style": {}}},
        {"block_type": 2, "text": {"elements": [{"text_run": {"content": "", "text_element_style": {}}}], "style": {}}},
    ]
    _post(api, body={"children": blocks, "index": -1})
    return _ask(f"已记录：{text[:80]}", user_id, send)


def breakdown(text, user_id=None, store=None, send=True):
    """开始或推进任务拆解，四个回答会被完整保存并用于最终报告。"""
    store = store or SessionStore()
    uid = _user_id(user_id)
    state = store.get(uid, "breakdown")

    if not state:
        goal = text.strip()
        if not goal:
            return _ask("请提供要拆解的目标，例如：拆解 发布一份课程。", uid, send)
        state = {"goal": goal, "answers": []}
        store.set(uid, "breakdown", state)
        return _ask(f"拆解目标：「{goal}」\n\nQ1：完成后理想的输出是什么样？", uid, send)

    answer = text.strip()
    if not answer:
        return _ask("请先回答当前问题，我会继续下一步。", uid, send)
    state["answers"].append(answer)
    questions = [
        "Q2：你有哪些现成资源可以用？",
        "Q3：最大的不确定性，也就是最怕做不出来的点是什么？",
        "Q4：如果只给 2 小时，你先做哪一步来验证这个风险？",
    ]
    if len(state["answers"]) <= len(questions):
        store.set(uid, "breakdown", state)
        return _ask(questions[len(state["answers"]) - 1], uid, send)

    store.delete(uid, "breakdown")
    answers = state["answers"]
    return _ask(
        f"拆解完成：{state['goal']}\n\n"
        f"1. 理想输出：{answers[0]}\n"
        f"2. 现有资源：{answers[1]}\n"
        f"3. 最大风险：{answers[2]}\n"
        f"4. 第一步：{answers[3]}\n\n"
        "先用第 4 步验证第 3 点；验证通过后再扩大投入。",
        uid,
        send,
    )


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "help"
    content = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else ""
    if command == "weekly-train":
        print(weekly_trainer(content or None))
    elif command == "agent":
        print(agent_log(content))
    elif command == "breakdown":
        print(breakdown(content))
    else:
        print("技能训练师\n  weekly-train [回答]  周报思维训练\n  agent <内容>         Agent日志\n  breakdown <目标/回答> 任务拆解")
