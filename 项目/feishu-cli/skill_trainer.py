"""
技能训练师 — 不替代你，训练你思考
"""
import sys, os
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
from feishu_api import send_text, _post
from config import OPEN_ID
NOTE_DOC = "JWxZdd77kozT9FxGd2Tc3d41nTg"

_state = {}

def _ask(question):
    send_text(OPEN_ID, question)
    return question


# ═══ 1. 周报思维训练 ═══

def weekly_trainer(step=None):
    uid = "wr"
    if step is None or step == "start":
        _state[uid] = {"s": 1}
        return _ask(
            "📝 周报思维训练 · 第一步\n\n"
            "这周让你最有成就感的一个词是什么？回复一个词。"
        )
    
    st = _state.get(uid, {"s": 1})
    
    if st["s"] == 1:
        st["kw"] = step.strip()
        st["s"] = 2; _state[uid] = st
        return _ask(f"「{st['kw']}」——好。第二步：\n你具体做了什么？为什么重要？带来了什么？\n3句话以内。")
    
    elif st["s"] == 2:
        st["content"] = step.strip()
        st["s"] = 3; _state[uid] = st
        return _ask("第三步：这件事里你学到了什么？一句话。")
    
    elif st["s"] == 3:
        kw = st["kw"]; content = st["content"]; learning = step.strip()
        del _state[uid]
        return _ask(
            f"📊 周报思维训练完成\n\n"
            f"核心词：{kw}\n"
            f"做了什么：{content}\n"
            f"学到了：{learning}\n\n"
            f"💡 周报用这个思路：不是列你做了什么，是说「我解决了什么问题，学到了什么」。领导想看的是成长。"
        )


# ═══ 2. Agent 日志 ═══

def agent_log(text):
    today = datetime.now().strftime("%Y.%m.%d")
    entry = f"{today} Agent日志\n{text.strip()}"
    api = f"/docx/v1/documents/{NOTE_DOC}/blocks/{NOTE_DOC}/children"
    blocks = [
        {"block_type": 2, "text": {"elements": [{"text_run": {"content": entry, "text_element_style": {}}}], "style": {}}},
        {"block_type": 2, "text": {"elements": [{"text_run": {"content": "", "text_element_style": {}}}], "style": {}}}
    ]
    _post(api, body={"children": blocks, "index": -1})
    return _ask(f"✅ 已记录：{text[:80]}")


# ═══ 3. 任务拆解 ═══

def breakdown(goal):
    uid = "bd"
    st = _state.get(uid, {"s": 0, "answers": [], "goal": goal})
    
    questions = [
        f"拆解目标：「{goal}」\n\nQ1: 完成后理想的输出是什么样？",
        "Q2: 你有哪些现成的资源可以用？",
        "Q3: 最大的不确定性（最怕做不出来的点）是什么？",
        "Q4: 如果只给2小时，你先做哪步？（必须能验证Q3的风险点）"
    ]
    
    if st["s"] < len(questions):
        q = questions[st["s"]]
        st["s"] += 1; _state[uid] = st
        return _ask(q)
    
    # 先存最后答案再生成报告
    if st["s"] == len(questions):
        st["answers"].append(step if 'step' in dir() else "")
    
    answers = st.get("answers", [])
    del _state[uid]
    return _ask(
        f"🔧 拆解完成：{goal}\n\n"
        f"1️⃣ 理想输出：{answers[0] if len(answers)>0 else '?'}\n"
        f"2️⃣ 现有资源：{answers[1] if len(answers)>1 else '?'}\n"
        f"3️⃣ 最大风险：{answers[2] if len(answers)>2 else '?'}\n"
        f"4️⃣ 第一步：{answers[3] if len(answers)>3 else '?'}\n\n"
        f"💡 先做第4步验证第3点，2小时能跑通就继续。"
    )


# ═══ CLI ═══

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    text = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else ""
    
    if cmd == "weekly-train":
        print(weekly_trainer(text if text else None))
    elif cmd == "agent":
        print(agent_log(text))
    elif cmd == "breakdown":
        print(breakdown(text))
    else:
        print("技能训练师\n  weekly-train    周报思维训练\n  agent <内容>    Agent日志\n  breakdown <目标> 任务拆解")
