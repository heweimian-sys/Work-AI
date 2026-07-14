# AGENTS.md — 飞书 CLI 工作助手

> 本文档供 AI Agent（Codex、Hermes、Claude Code 等）阅读，用于理解项目架构和配置方式。

## 项目概述

飞书 CLI 工作助手是一套 Python 脚本，通过飞书开放平台 API 实现：
- 消息推送（日报/周报/DDL 提醒）
- 飞书文档读写（日志、周报、笔记）
- 多源资讯聚合（HN/GitHub/Dev.to/Lobsters/ArXiv）
- 技能训练对话（周报思维、Agent 日志、任务拆解）

交互方式：通过 Hermes Agent Gateway 在飞书中自然对话；或通过 Craft Agent 命令行直接调用脚本。

## 配置入口

所有敏感信息从 `~/.hermes/.env` 读取，代码中不含密钥。

### 必需配置

```env
FEISHU_APP_ID        # 飞书应用 App ID
FEISHU_APP_SECRET    # 飞书应用 App Secret
FEISHU_OPEN_ID       # 用户飞书 Open ID（消息推送目标）
GLM_API_KEY          # 智谱 AI API Key（资讯翻译）
OPENAI_API_KEY       # DeepSeek API Key（Hermes 模型）
OPENAI_BASE_URL      # https://api.deepseek.com/v1
```

### 文档 Token 配置

复制 `config.example.yaml` 为 `config.yaml`，填写工作日志、CLI 笔记、正式周报和参考周报的 token。个人 token 不写入本文档，也不提交到 Git。

### Hermes Gateway 配置

Gateway 负责飞书消息的接收和回复。配置文件：`~/.hermes/config.yaml`

```yaml
model:
  default: "deepseek-chat"
  provider: "openai"
  base_url: "https://api.deepseek.com/v1"
toolsets: [terminal, file, web, skills, todo]
agent:
  language: "zh"
```

Skill 文件：`~/.hermes/skills/feishu-cli/SKILL.md`

## 脚本依赖关系

```
config.py ──────────────────────────────────────────┐
  (读取 ~/.hermes/.env，提供 OPEN_ID, GLM_KEY)       │
                                                     │
feishu_api.py ─────────────────────────────────────┐ │
  (飞书 API: 文档/消息/日历)                        │ │
    ├── feishu_cli.py ── (DDL/搜索/录入/提醒)      │ │
    │     ├── daily_report.py ── (日报系统)         │ │
    │     └── skill_trainer.py ── (技能训练)        │ │
    ├── ai_news.py ── (AI 资讯聚合, 用 GLM 翻译)   │─┘
    │     └── news_store.py ── (推送历史/反馈/偏好) │
    └── weekly_data.py ── (周报数据采集)            │
```

## 网络要求

- 飞书 API (`open.feishu.cn`): 直连
- DeepSeek API (`api.deepseek.com`): 直连
- 智谱 API (`open.bigmodel.cn`): 直连
- HN/GitHub/Dev.to/Lobsters/ArXiv: 默认直连；需要代理时配置 `FEISHU_CLI_HTTP_PROXY`

## 关键限制

1. **知识库写入**: 飞书知识库文档需要 wiki 编辑权限，当前应用只能写入独立 docx
2. **群聊消息**: 核心群未添加机器人，无法自动读取群消息
3. **raw_content vs block API**: 文档读取优先 raw_content（速度快），纯 block 文档回退到 block API
4. **Gateway 持久化**: 通过 `install-autostart.ps1` 安装 Windows 登录自启动，不使用 `--accept-hooks`
5. **运行时归属**: Hermes 是当前消息编排层，DeepSeek 是默认模型；Codex 不在在线消息链路中
6. **训练状态**: 按用户保存在 `FEISHU_CLI_DATA_DIR`，该目录不得提交
7. **资讯反馈**: `ai_news.py feedback <ID> <useful|irrelevant|known|later>`
8. **资讯画像**: `config.yaml.news_profile` 可编辑，SQLite 历史不得提交

## 开发说明

- 脚本入口在 `~/hermes-agent/scripts/`（开发版）
- GitHub 版本在 `Work-AI/项目/feishu-cli/`（发布版）
- `项目/feishu-cli/` 是唯一发布源；部署时由发布流程同步，不手工维护两份源码
- 密钥/Token 绝不在 Git 中提交
- 提交前运行 `python -m unittest discover -s tests -v`
- 部署先运行 `deploy.ps1` 预览，确认后运行 `deploy.ps1 -Apply`
- 自启动使用 `install-autostart.ps1 -StartNow`，不得恢复自动批准未知 Hook 的旧脚本
