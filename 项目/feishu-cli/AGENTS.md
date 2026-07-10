# AGENTS.md — 飞书 CLI 工作助手

> 本文档供 AI Agent（Craft Agent、Hermes、Claude Code 等）阅读，用于理解项目架构和配置方式。

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

| 用途 | Token | 说明 |
|------|-------|------|
| 工作日志 | `EZc9wq9phi1ggUk6RDvcuUAMnuG` | 逐风每日日志（知识库文档） |
| CLI 笔记 | `JWxZdd77kozT9FxGd2Tc3d41nTg` | CLI 私聊录入归档 |
| 正式周报 | `VApTdvmZhoH2TBx3hGbcGIYCn0g` | 独立 docx，CLI 可全自动写入 |

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
    └── weekly_data.py ── (周报数据采集)            │
```

## 网络要求

- 飞书 API (`open.feishu.cn`): 直连
- DeepSeek API (`api.deepseek.com`): 直连
- 智谱 API (`open.bigmodel.cn`): 直连
- HN/GitHub/Dev.to/Lobsters/ArXiv: 需要代理 `127.0.0.1:10809`

## 关键限制

1. **知识库写入**: 飞书知识库文档需要 wiki 编辑权限，当前应用只能写入独立 docx
2. **群聊消息**: 核心群未添加机器人，无法自动读取群消息
3. **raw_content vs block API**: 文档读取优先 raw_content（速度快），纯 block 文档回退到 block API
4. **Gateway 持久化**: 通过 Windows 启动文件夹实现开机自启

## 开发说明

- 脚本入口在 `~/hermes-agent/scripts/`（开发版）
- GitHub 版本在 `Work-AI/项目/feishu-cli/`（发布版）
- 修改脚本后需同步两个位置
- 密钥/Token 绝不在 Git 中提交
