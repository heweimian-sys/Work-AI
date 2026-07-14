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

复制 `.env.example` 的字段到 `~/.hermes/.env`，再填入自己的值：

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

可以在 `config.yaml` 的 `news_profile` 中修改关注主题、历史去重天数和单一来源上限。反馈、推送历史和来源偏好保存在 `FEISHU_CLI_DATA_DIR/news.db`。

### 3. 启动

推荐安装 Windows 登录自启动。它不依赖 Codex，但电脑必须开机、完成登录且不能休眠：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-autostart.ps1 -StartNow
```

该命令会创建安全启动脚本和启动文件夹快捷方式。启动命令不包含 `--accept-hooks`，不会自动批准未来未知的 Shell Hook。

手动启动：

```powershell
cd $HOME\hermes-agent
.\venv\Scripts\hermes.exe gateway run
```

### 4. 验证

飞书搜索机器人 `逐风的飞书 CLI`，发消息 `你好`，收到回复即成功。

## 项目结构

```
feishu-cli/
├── README.md           # 你正在看的
├── AGENTS.md           # 给 AI Agent 看的配置说明
├── requirements.txt    # Python 运行依赖
├── .env.example        # 无密钥的环境变量模板
├── config.example.yaml # 无敏感信息的业务配置模板
├── start-gateway-safe.bat # 安全启动 Gateway
├── install-autostart.ps1  # 安装 Windows 登录自启动
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

## 资讯反馈

日报中的每条资讯都有稳定 ID，例如 `N-12ab34cd`。通过 Hermes 或命令行记录反馈：

```bash
python ai_news.py feedback N-12ab34cd useful
python ai_news.py feedback N-12ab34cd irrelevant
python ai_news.py feedback N-12ab34cd known
python ai_news.py feedback N-12ab34cd later
python ai_news.py profile
```

`useful` 和 `later` 会提高对应来源的后续排序，`irrelevant` 和 `known` 会降低；权重设有上下限，系统仍会保留新来源和探索内容。

Hermes Skill 可增加两条路由：

```text
“AI资讯反馈 <ID> <类型>” -> python ai_news.py feedback <ID> <类型>
“AI资讯画像” -> python ai_news.py profile
```

## 部署到 Hermes

先预览文件差异，确认后再应用：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy.ps1 -Apply
```

脚本只同步白名单文件，不覆盖在线环境中扩展过的 `feishu_api.py`；被替换文件会先备份到 Hermes `scripts/backup/`。

## 常见问题

**Q: 飞书机器人没反应？**
A: 执行 `hermes gateway status`。显示 `stopped` 时，运行 `install-autostart.ps1 -StartNow`。

**Q: 关机后机器人还能回复吗？**
A: 不能。本机模式要求电脑开机、登录 Windows、网络和代理正常且没有休眠；需要全天在线时应部署到云服务器。

**Q: AI 日报全是英文？**
A: 检查 GLM_API_KEY 是否配置正确。

**Q: 换了电脑怎么迁移？**
A: 克隆 Work-AI 仓库 → 配置 .env → 安装依赖 → 启动 Gateway。
