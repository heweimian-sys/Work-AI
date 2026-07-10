"""
AI 日报聚合 — 6 个免费源，每天推送
"""
import json, sys, os
from datetime import datetime, timedelta
import requests

sys.path.insert(0, os.path.dirname(__file__))
from feishu_api import send_text
from config import OPEN_ID, GLM_KEY

PROXY = {"http": "http://127.0.0.1:10809", "https": "http://127.0.0.1:10809"}

def _llm(prompt):
    """智谱 GLM 翻译分析"""
    try:
        r = requests.post('https://open.bigmodel.cn/api/paas/v4/chat/completions',
            headers={'Authorization': f'Bearer {GLM_KEY}'},
            json={'model': 'glm-4-flash', 'messages': [{'role': 'user', 'content': prompt}], 'max_tokens': 400},
            timeout=20)
        if r.status_code == 200:
            return r.json()['choices'][0]['message']['content']
    except: pass
    return None

def _get(url, **kw):
    return requests.get(url, proxies=PROXY, timeout=15, **kw)

# ═══ 资讯源 ═══

def fetch_hackernews(n=5):
    try:
        r = _get(f"https://hn.algolia.com/api/v1/search_by_date?query=AI+OR+LLM+OR+agent+OR+GPT&tags=story&hitsPerPage={n*2}")
        seen = set()
        items = []
        for h in r.json().get("hits", []):
            t = h.get("title", "")
            if t in seen: continue
            seen.add(t)
            items.append({"title": t, "url": h.get("url", f"https://news.ycombinator.com/item?id={h['objectID']}"), "score": h.get("points", 0), "source": "HN"})
            if len(items) >= n: break
        return items
    except: return []

def fetch_github_ai(n=5):
    try:
        week = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        qs = [f"topic:mcp+topic:ai-agent+created:>{week}", f"topic:claude-code+created:>{week}", f"topic:llm+topic:tool+created:>{week}"]
        seen = {}
        for q in qs:
            r = _get(f"https://api.github.com/search/repositories?q={q}&sort=stars&order=desc&per_page=5", headers={"Accept": "application/vnd.github.v3+json", "User-Agent": "FeishuCLI"})
            for repo in r.json().get("items", []):
                fid = repo["full_name"]
                if fid not in seen:
                    seen[fid] = {"title": fid, "url": repo["html_url"], "score": repo["stargazers_count"], "source": "GitHub", "desc": (repo.get("description") or "")[:100]}
        return sorted(seen.values(), key=lambda x: x["score"], reverse=True)[:n]
    except: return []

def fetch_arxiv(n=4):
    try:
        import xml.etree.ElementTree as ET
        r = _get("http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL&sortBy=submittedDate&max_results=10")
        ns = '{http://www.w3.org/2005/Atom}'
        root = ET.fromstring(r.text)
        items = []
        for entry in root.findall(f'{ns}entry')[:n]:
            title = entry.find(f'{ns}title').text.strip().replace('\n', ' ')
            link = entry.find(f'{ns}id').text
            items.append({"title": title[:100], "url": link, "score": 0, "source": "ArXiv"})
        return items
    except: return []

def fetch_devto(n=4):
    try:
        r = _get("https://dev.to/api/articles?tag=ai&per_page=10&top=1")
        items = []
        for a in r.json()[:n]:
            items.append({"title": a["title"], "url": a["url"], "score": a.get("positive_reactions_count", 0), "source": "Dev.to"})
        return items
    except: return []

def fetch_lobsters(n=4):
    try:
        r = _get("https://lobste.rs/t/ai.json")
        items = []
        for s in r.json()[:n]:
            items.append({"title": s["title"], "url": s.get("url", f"https://lobste.rs/s/{s['short_id']}"), "score": s.get("score", 0), "source": "Lobsters"})
        return items
    except: return []

# ═══ 生成 ═══

def generate():
    """生成中文 AI 日报：抓取 → GLM翻译 → 个性化筛选"""
    today = datetime.now().strftime("%m月%d日")
    
    # 1. 抓取所有源
    all_items = []
    for fetcher, n in [(fetch_hackernews, 6), (fetch_github_ai, 5), (fetch_devto, 4), (fetch_lobsters, 4)]:
        try:
            items = fetcher(n)
            all_items.extend(items)
        except: pass
    
    if not all_items:
        return f"🤖 AI 日报 | {today}\n\n⚠️ 资讯源暂时访问异常"
    
    # 2. GLM 翻译和筛选
    titles = "\n".join([f"{i+1}. [{it['source']}] {it['title']}" for i, it in enumerate(all_items[:15])])
    prompt = f"""你是逐风的 AI 同事。他做航海运营+AI开发，用5个Agent(Codex/Claude Code/Hermes等)。
从以下资讯中筛选 8 条最相关的，翻译成中文，标注「为什么对逐风有用」：

{titles}

输出格式：
1. 中文标题 (来源, 热度)
   🔗 链接
   💡 价值: 一句话"""
    
    result = _llm(prompt)
    if result:
        return f"🤖 AI 日报 | {today} — 逐风定制\n\n{result}\n\n📰 中文生态: 机器之心 | 量子位 | 秀米排版 | 即时设计UI"
    
    # 回退：基础格式
    lines = [f"🤖 AI 日报 | {today}", ""]
    for item in all_items[:10]:
        lines.append(f"[{item['source']}] {item['title'][:80]}")
        lines.append(f"🔗 {item['url']}")
    return "\n".join(lines)

# ═══ CLI ═══

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "push"
    if cmd in ("push", "send"):
        send_text(OPEN_ID, generate())
        print("✅ 已推送")
    elif cmd == "dry":
        print(generate())
