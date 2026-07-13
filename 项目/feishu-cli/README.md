# 飞书 CLI 工作助手

逐风的 AI 同事——通过飞书交互，帮你写日报/周报、追踪 DDL、推送 AI 资讯、训练工作思维。

## 功能

| 功能 | 飞书指令 | 说明 |
|------|---------|------|
| 🤖 AI 资讯日报 | `AI资讯` | HN + GitHub + Dev.to + Lobsters + ArXiv，去重、来源配额、自动翻译 |
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
pip install -r requirements.txt

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

# 可选：资讯源需要代理时配置；留空则直连
FEISHU_CLI_HTTP_PROXY=http://127.0.0.1:10809

# 技能训练会话默认保存到 ~/.hermes/data/feishu-cli
FEISHU_CLI_DATA_DIR=~/.hermes/data/feishu-cli
FEISHU_NOTES_DOC=xxx         # 使用 Agent 日志功能时需要
```

复制业务配置模板并填写自己的文档 token 和 DDL：

```bash
cp config.example.yaml config.yaml
python feishu_cli.py doctor
```

`config.yaml` 包含个人飞书资源标识，已被 Git 忽略。

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
├── requirements.txt    # Python 运行依赖
├── config.example.yaml # 无敏感信息的业务配置模板
├── date_utils.py       # 日志日期解析
├── feishu_api.py       # 飞书 API 封装（文档/日历/消息）
├── feishu_cli.py       # CLI 工具集（DDL/搜索/录入）
├── ai_news.py          # AI 资讯聚合（6 源）
├── daily_report.py     # 日报系统
├── skill_trainer.py    # 技能训练师
├── weekly_data.py      # 周报数据采集
└── config.py           # 安全配置（从 ~/.hermes/.env 读取）
```

## 架构说明

当前运行时由 Hermes Agent Gateway 编排，默认通过 OpenAI 兼容接口调用 DeepSeek；Codex 不在飞书消息运行链路中，主要适合承担本仓库的开发、测试和维护工作。

资讯筛选时，模型只返回候选 ID、中文标题和价值说明。最终来源、链接和热度由代码从抓取结果回填，避免模型生成错误链接。外部标题会被当作不可信数据，不能作为 Agent 指令。

## 测试

```bash
python -m unittest discover -s tests -v
python ai_news.py dry
```

`dry` 会访问公开资讯源，但不会发送飞书消息。未配置 GLM 时自动使用确定性排序。

## 常见问题

**Q: 飞书机器人没反应？**
A: 确认 Gateway 在运行。终端执行 `ps aux | grep hermes` 看进程。

**Q: AI 日报全是英文？**
A: 检查 GLM_API_KEY 是否配置正确。

**Q: 换了电脑怎么迁移？**
A: 克隆 Work-AI 仓库 → 配置 .env → 安装依赖 → 启动 Gateway。
