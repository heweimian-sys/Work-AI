# 飞书 CLI 工作助手

逐风的 AI 同事——通过飞书交互，帮你写日报/周报、追踪 DDL、推送 AI 资讯、训练工作思维。

## 功能

| 功能 | 飞书指令 | 说明 |
|------|---------|------|
| 🤖 AI 资讯日报 | `AI资讯` | HN + GitHub + Dev.to + Lobsters + ArXiv，自动翻译中文 |
| 📝 日报 | `日报` | 推送模板，回复归档，周末自动汇总 |
| 📊 周报 | `周报` | 从日报+日志生成汇报版 |
| 📋 DDL 管理 | `DDL` | 截止日期看板 + 自动预警 |
| 🔍 文档搜索 | `搜: xxx` | 跨飞书文档搜索 |
| ✏️ 快速录入 | `录入: xxx` | 一句话归档到笔记 |
| 🧠 技能训练 | `训练周报` | 三步思维训练法 |
| 🔧 任务拆解 | `拆解: xxx` | 引导式任务分解 |

## 快速开始（换电脑时看这里）

### 1. 前置条件

```bash
# 克隆仓库
git clone https://github.com/heweimian-sys/Work-AI.git
cd Work-AI/项目/feishu-cli

# 安装依赖
pip install requests

# 安装 Hermes Agent（用于飞书对话交互）
# 参考: https://github.com/NousResearch/hermes-agent
```

### 2. 配置

在 `~/.hermes/.env` 中填入：

```env
FEISHU_APP_ID=cli_xxx        # 飞书应用 ID
FEISHU_APP_SECRET=xxx        # 飞书应用密钥
FEISHU_OPEN_ID=ou_xxx        # 你的飞书用户 ID
FEISHU_DOMAIN=feishu
FEISHU_CONNECTION_MODE=websocket
FEISHU_ALLOWED_USERS=ou_xxx
GLM_API_KEY=xxx              # 智谱 API Key（AI 日报翻译用）
OPENAI_API_KEY=sk-xxx        # DeepSeek API Key（Hermes 大脑用）
OPENAI_BASE_URL=https://api.deepseek.com/v1
```

### 3. 启动

```bash
# 方式1: 开机自启（推荐）
# 将 start-gateway.bat 放入 Windows 启动文件夹：
# Win+R → shell:startup → 粘贴 bat 文件

# 方式2: 手动启动
cd ~/hermes-agent
./venv/Scripts/hermes gateway run --accept-hooks
```

### 4. 验证

飞书搜索机器人 `逐风的飞书 CLI`，发消息 `你好`，收到回复即成功。

## 项目结构

```
feishu-cli/
├── README.md           # 你正在看的
├── AGENTS.md           # 给 AI Agent 看的配置说明
├── feishu_api.py       # 飞书 API 封装（文档/日历/消息）
├── feishu_cli.py       # CLI 工具集（DDL/搜索/录入）
├── ai_news.py          # AI 资讯聚合（6 源）
├── daily_report.py     # 日报系统
├── skill_trainer.py    # 技能训练师
├── weekly_data.py      # 周报数据采集
└── config.py           # 安全配置（从 ~/.hermes/.env 读取）
```

## 常见问题

**Q: 飞书机器人没反应？**
A: 确认 Gateway 在运行。终端执行 `ps aux | grep hermes` 看进程。

**Q: AI 日报全是英文？**
A: 检查 GLM_API_KEY 是否配置正确。

**Q: 换了电脑怎么迁移？**
A: 克隆 Work-AI 仓库 → 配置 .env → 安装依赖 → 启动 Gateway。
