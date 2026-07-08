# 飞书知识库机器人 · 项目进度文档

> **项目名称**：feishu-kb（生财航海知识库机器人「航海资料小抓」）
> **文档日期**：2026-06-25
> **当前版本**：Phase 2（语义检索 + 多轮对话）

---

## 一、项目概述

飞书群聊机器人，自动归档群内文件/链接到云空间 + 多维表格，并支持自然语言查询。

**技术栈**：
- 运行时：Node.js（ES Modules）
- 飞书 SDK：`@larksuiteoapi/node-sdk`（WebSocket 长连接，国内直连，无需 ngrok）
- LLM：DeepSeek v4-flash（通过 OpenAI SDK 兼容接口调用）
- 存储：飞书云空间（文件）+ 飞书多维表格 Bitable（元数据）+ 本地 JSON 向量库

**核心能力**：
1. 群内发文件/图片 → 自动归档到云空间 + AI 提取字段写入 Bitable
2. 群内发飞书文档链接 → 自动录入 Bitable
3. @机器人 + 关键词 → 语义检索（同义词扩展）返回匹配资料
4. 多轮对话：`第三个` / `再发一个` / `上一个` → 基于上一轮结果继续回复

---

## 二、架构总览

```
飞书事件 (WebSocket)
    │
    ▼
bot/index.js ── 事件解析 (parseEvent)
    │               ├── 双重去重 (message_id + 时间窗口)
    │               ├── URL 检测
    │               └── 统一事件对象
    │
    ▼
agent/core.js ── Agent 主循环
    │               ├── 1. 加载上下文 (session + state + chatType)
    │               ├── 2. 意图路由 (routeIntent)
    │               ├── 3. 必要时反问澄清
    │               ├── 4. 调用工具 (runTool)
    │               └── 5. 发送回复 + 保存会话状态
    │
    ▼
agent/router.js ── 意图路由
    │               ├── 状态机优先 (awaiting_clarify / query_context)
    │               ├── LLM 意图分类 (7 种意图)
    │               └── 降级规则 (fallbackRoute)
    │
    ▼
tools/index.js ── 工具注册表
    │
    ├── tools/archive.js    归档文件/链接
    ├── tools/query.js      查询入口 → bot/query.js
    ├── tools/continue.js   多轮延续 (上一个/再发一个/第N个)
    ├── tools/chat.js       闲聊引导
    ├── tools/feedback.js   反馈收集
    └── tools/send-message.js  消息发送 + 表情回复
```

**记忆层**：
- `memory/session.js`：会话历史 + 状态机（`idle` / `awaiting_clarify` / `query_context`）
- `memory/chat.js`：群类型管理（混合群/查询群/归档群）

---

## 三、Phase 1 改造记录（Agent 架构升级）

### 3.1 改造目标
从硬编码的 Workflow 升级为 Agent 架构：意图路由 + 工具抽象 + 会话记忆。

### 3.2 新增文件

| 文件 | 职责 |
|------|------|
| `agent/core.js` | Agent 主循环：加载上下文 → 意图路由 → 工具执行 → 回复 + 状态保存 |
| `agent/router.js` | 意图路由：LLM 分类 7 种意图（archive/query/feedback/help/chat/clarify/continue），降级规则兜底 |
| `tools/index.js` | 工具注册表：统一 `runTool(intent, args)` 入口 |
| `tools/archive.js` | 归档工具：从原 `bot/archive.js` 抽取，Agent 调用 |
| `tools/query.js` | 查询工具：从原 `bot/query.js` 抽取，Agent 调用 |
| `tools/chat.js` | 闲聊工具：友好引导文案 |
| `tools/feedback.js` | 反馈工具：收集用户点赞/点踩 |
| `tools/send-message.js` | 消息发送封装：文本/卡片/表情回复/sticker |
| `memory/session.js` | 会话记忆：`loadSession` / `saveSession` + 状态机 |
| `memory/chat.js` | 群类型管理：`isMonitoredChat` / `getChatType` |

### 3.3 修改文件

| 文件 | 改动 |
|------|------|
| `bot/index.js` | 事件解析后交给 `agent/core.js` 的 `handleEvent()` 统一处理；保留去重、URL 检测、自动授权逻辑 |
| `lib/feishu.js` | 新增 `uploadImage()` 上传图片换取 `image_key`；`addReaction()` 表情回复 |
| `scripts/init.js` | 支持 `--force` 重建资源；机器人自行创建云空间文件夹和 Bitable，自动把用户拉为协作者 |

### 3.4 关键配置

```
.env 关键项：
  FEISHU_APP_ID          飞书应用 ID
  FEISHU_APP_SECRET      飞书应用密钥
  DRIVE_FOLDER_TOKEN     云空间文件夹 token
  BITABLE_APP_TOKEN      多维表格 app_token
  BITABLE_TABLE_ID       多维表格 table_id
  OPENAI_API_KEY         DeepSeek API Key
  OPENAI_BASE_URL        https://api.deepseek.com/v1
  OPENAI_MODEL           deepseek-v4-flash
  BOT_NAME               航海资料小抓
  OPS_USER_OPEN_ID       运营负责人 open_id（自动授权）
```

### 3.5 飞书权限配置

已开通的权限：
- `im:message`（接收消息）
- `im:message:send_as_bot`（发送消息）
- `bitable:app`（多维表格读写）
- `drive:drive`（云空间读写）

**未开通（导致 sticker 发送失败）**：
- `im:resource:upload` / `im:resource`（上传图片资源）
- 已暂时关闭 `sendSticker()` 调用，避免日志刷屏

---

## 四、Phase 2 改造记录（语义检索 + 多轮对话）

### 4.1 改造目标
1. **语义检索**：让机器人理解同义词（如「人工智能」匹配「AI」），不只是字面关键词匹配
2. **多轮对话**：支持上下文追问（「上一个」「再发一个」「第三个」）

### 4.2 语义检索方案

**问题**：DeepSeek 官方当前只有 `deepseek-v4-flash` / `deepseek-v4-pro` 两个对话模型，**没有 Embedding 模型**，无法做真正的向量语义检索。

**方案**：LLM 同义词扩展 + 关键词搜索（不依赖 Embedding）

```
用户查询 "我要人工智能文档"
    │
    ├── extractSearchKeywords()   → 本地分词：["人工智能", "文档"]
    ├── expandQueryKeywords()     → DeepSeek 扩展：["人工智能","AI","大模型","机器学习","深度学习","自然语言处理"]
    │
    ▼
合并去重 → ["人工智能","AI","大模型","机器学习","深度学习","自然语言处理","人工智能文档"]
    │
    ▼
searchMultiKeywords()  → 一次 OR 查询 Bitable（文件名 + 主题标签）
    │
    ▼
命中 "从零搭建AI知识库让AI替你工作(1).pdf"
```

**向量检索（预留）**：
- `lib/embedding.js`：封装 `embed()` / `embedBatch()` / `buildDocumentText()` / `buildQueryText()`
- `lib/vector-store.js`：本地 JSON 向量库，`upsert()` / `search()` / `listAll()` / `remove()`
- `scripts/build-vectors.js`：批量为已有 Bitable 记录重建向量
- `bot/archive.js`：归档成功后异步调用 `buildVectorForRecord()` 生成向量
- 当前 `ENABLE_SEMANTIC_SEARCH=false`，未来接入支持 Embedding 的 provider（如 OpenAI、SiliconFlow、智谱）后设为 `true` 即可启用

### 4.3 多轮对话方案

**会话状态机**：

| 状态 | 含义 | 触发条件 |
|------|------|----------|
| `idle` | 空闲 | 初始状态 / 闲聊后 |
| `awaiting_clarify` | 等待澄清 | 查询过于模糊，机器人反问后 |
| `query_context` | 有上一轮查询结果 | 查询成功后保存 `previousResults` |

**continue 工具**（`tools/continue.js`）支持的指令：

| 用户输入 | 行为 |
|----------|------|
| `第一个` / `第一条` / `最开始` | 返回第 1 条 |
| `第二个` / `第二条` | 返回第 2 条 |
| `第三个` / `第三条` | 返回第 3 条 |
| `第N个` / `第N条` | 返回第 N 条（支持中文数字） |
| `3`（纯数字） | 返回第 3 条 |
| `上一个` / `last` | 返回最后一条 |
| `再发一个` / `换一个` / `不是这个` | 返回第 2 条（第一个未展示的） |
| 其他 | 重新列出全部结果 |

### 4.4 新增文件

| 文件 | 职责 |
|------|------|
| `lib/embedding.js` | Embedding 抽象层（预留，当前关闭） |
| `lib/vector-store.js` | 本地 JSON 向量库（预留，当前关闭） |
| `tools/continue.js` | 多轮延续工具 |
| `scripts/build-vectors.js` | 批量重建向量脚本 |
| `scripts/test-phase2.js` | 多轮对话本地测试（7/7 通过） |
| `scripts/test-semantic-query.js` | 语义检索端到端测试 |

### 4.5 修改文件

| 文件 | 改动 |
|------|------|
| `lib/ai.js` | 新增 `expandQueryKeywords()`：用 DeepSeek 做同义词扩展；新增 `localTokenize()` 支持中英文边界分词 |
| `lib/bitable.js` | 新增 `searchMultiKeywords()`：多关键词合并为一次 OR 查询，避免并发 `Data not ready`；新增 `getByRecordIds()` |
| `bot/query.js` | 升级为「关键词 + LLM 扩展 + 语义检索」混合排序；返回 `_records` 供多轮使用 |
| `bot/archive.js` | 归档后异步生成向量（预留） |
| `agent/core.js` | 加载/保存会话状态；查询后保存 `previousResults` 到 `query_context` |
| `agent/router.js` | 新增 `continue` 意图；`isContinuation()` 判断上下文延续 |
| `memory/session.js` | 新增 `loadSessionState()` / `setSessionState()` |
| `tools/index.js` | 注册 `continue` 工具 |
| `bot/index.js` | 关闭 `sendSticker()`（缺 `im:resource` 权限） |
| `.env` | 新增 `ENABLE_SEMANTIC_SEARCH=false` |

---

## 五、已解决的问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| DeepSeek Embedding API 404 | DeepSeek 官方无 embedding 模型 | 默认关闭语义检索，改用 LLM 同义词扩展 |
| DeepSeek v4-flash 返回空 content | `reasoning_content` 占满 `max_tokens` | 扩展调用 `max_tokens` 提升到 300，改用 system+user prompt |
| 「人工智能文档」扩展失败 | 6 个汉字触发 `<=6` 跳过条件 | 阈值从 `<=6` 放宽到 `<=4` |
| Bitable `Data not ready` + 13s 耗时 | 8 个关键词并发查询 | 新增 `searchMultiKeywords()` 合并为一次 OR 查询 |
| Bitable 搜索某些字段报错 | `分享人`/`活动名称` 的 `contains` 不稳定 | 检索字段收窄到 `文件名` + `主题标签` |
| sticker 发送权限错误 | 缺 `im:resource:upload` 权限 | 暂时关闭 `sendSticker()`，保留 DONE 表情 |
| 「一个」中「一」被误判为数字 | `parseCnNumber` 匹配范围过宽 | 改为先匹配明确指令，再兜底 `第N个` 模式 |

---

## 六、本地测试结果

### 6.1 语法检查
```
node --check bot/query.js       ✅
node --check lib/ai.js           ✅
node --check lib/bitable.js      ✅
node --check agent/core.js       ✅
node --check agent/router.js     ✅
node --check tools/continue.js   ✅
node --check lib/embedding.js    ✅
node --check lib/vector-store.js ✅
node --check bot/index.js        ✅
```

### 6.2 多轮对话测试（test-phase2.js）
```
"第一个"     → 返回第 1 条  ✅
"第二个"     → 返回第 2 条  ✅
"第三个"     → 返回第 3 条  ✅
"上一个"     → 返回最后一条  ✅
"再发一个"   → 返回第 2 条  ✅
"全部"       → 列出全部 3 条  ✅
7/7 通过
```

### 6.3 语义检索测试（test-semantic-query.js）
```
用户查询："我要人工智能文档"
LLM 扩展：["人工智能","AI","大模型","机器学习","深度学习","自然语言处理"]
合并关键词一次 OR 查询 → 命中 "从零搭建AI知识库让AI替你工作(1).pdf"
✅ 语义检索成功
```

### 6.4 飞书群测（2026-06-24）
```
@航海资料小抓 我要人工智能文档 → 命中 1 条 AI 文档 ✅（耗时 13s，已优化为单次查询）
@航海资料小抓 第三个          → continue 工具执行 ✅（意图路由正确）
@航海资料小抓 再发一个        → continue 工具执行 ✅（意图路由正确）
```

---

## 七、Phase 3 改造记录（真 Agent + 主动搜集 + 文件读取）

2026-06-25 完成。

### 7.1 改造目标

从「意图路由 + 硬编码工具管道」升级为 **真 Agent 架构**：

- **工具循环**：LLM 看到工具 JSON schema → 自主决定调哪个 → 执行 → 结果送回 LLM → LLM 决定继续或回复
- **链式调用**：支持多步决策（先查知识库 → 没有就去翻群历史 → 找到后归档 → 回复客服）
- **主动搜集**：Agent 新入群时主动扫描历史消息，回溯归档过往文件/链接
- **文件读取**：接入 AI 读取 PDF/图片内容，更精准打标签
- **自诊断**：操作失败时 Agent 自行排查原因并告知运营

### 7.2 架构变化

```
Phase 2（旧）：
  收到消息 → 意图分类器 → 调固定工具 → 回复 → 结束
              ↑ 只做一次分类

Phase 3（新）：
  收到消息 → LLM 看到 [archive_file, archive_link, query_knowledge,
              read_file_content, scan_chat_history, diagnose, ...]
              ↑ 自主选择工具 → 执行 → 结果回顾 →
              LLM 决定继续调另一个工具 或 回复用户
```

### 7.3 新增文件

| 文件 | 职责 |
|------|------|
| `tools/file_content_extractor.js` | AI 读取 PDF/图片文字内容，用于精准分类 |
| `tools/chat_scanner.js` | 飞书群历史消息扫描，回溯归档过往文件/链接 |

### 7.4 修改文件

| 文件 | 改动 |
|------|------|
| `agent/core.js` | **完全重写** — 从「意图路由调度」改为真 Agent Loop（OpenAI Function Calling），LLM 自主决策工具调用链 |
| `tools/index.js` | **完全重写** — 从函数注册表改为 LLM Function Calling JSON schema 定义，暴露 8 个工具 |
| `bot/index.js` | 精简事件解析，去掉旧路由逻辑，直接喂给 Agent Loop |
| `agent/router.js` | **已废弃** — 由 Agent Loop 替代（保留文件但不再被引用） |

### 7.5 工具定义（LLM 可见）

Agent 现在向 LLM 暴露以下工具的 JSON schema，由 LLM 自主决定何时调用：

| 工具名 | 功能 | 典型触发场景 |
|--------|------|------------|
| `archive_file` | 下载群文件 → 上传云空间 → AI 提取标签 → 写入多维表格 | 运营群收到 PDF/PPT |
| `archive_link` | 读取飞书链接 → 提取 metadata → 写入多维表格 | 运营群分享飞书文档 |
| `query_knowledge` | 自然语言查询多维表格资料 | 客服 @机器人 问资料 |
| `continue_query` | 处理「上一个」「再发一个」「第3个」等延续指令 | 多轮对话延续 |
| `read_file_content` | 从云空间下载文件并用 AI 提取文字内容 | 归档时想更精准打标签 |
| `scan_chat_history` | 翻页拉取群历史消息，自动归档过往文件/链接 | 新加入群时回溯；查询不到时去群里搜 |
| `diagnose` | 分析错误原因并给出排查建议 | 上传/下载失败时自诊断 |
| `record_feedback` | 记录用户点赞/点踩 | 用户说「有用」「不对」|

### 7.6 典型 Agent 行为链（预期）

```
场景：客服在群里 @机器人 「AI沙龙PPT」
  Agent 思考：用户要查资料 → 调 query_knowledge(query="AI沙龙PPT")
    → 命中 1 条记录 → LLM 判断：够了，直接回复
    → 回复：「AI沙龙PPT分享.pdf ·张三 [AI·沙龙] 🚢第12期 https://...」

场景：新加入运营群
  Agent 思考：我刚入群，应该先看看群里有哪些老资料 → 调 scan_chat_history(chatId)
    → 找到 15 个历史文件和 8 个飞书链接 → 逐个归档 → 向运营发送归档报告

场景：运营上传一个文件模糊的图片（文件名是 "20250501_1430.jpg"）
  Agent 思考：这是个图片，文件名没信息，调 read_file_content 提取文字
    → AI 读取到图片文字 → 再用 extractFields 打标签 → 归档到多维表格
```

## 八、待办事项

### 8.1 需重启验证
- [ ] 重启机器人后验证 Agent Loop 是否能正常启动（LLM Function Calling 连通性）
- [ ] 验证 `query_knowledge` 工具能被 LLM 正确选择并传出正确参数
- [ ] 验证多步决策（如先查知识库、没有就扫历史）
- [ ] 验证兜底：Agent 崩溃时 sendFallbackMessage 是否发送

### 8.2 权限申请
- [ ] 在飞书开发者后台申请 `im:resource:upload` 和 `im:resource` 权限，恢复 @机器人 时的表情包回复
- [ ] `im:message.group_msg` — 接收群中所有消息（必要，否则收不到非 @ 的文件消息）

### 8.3 后续增强（Phase 4 可选）
- [ ] 接入支持 Embedding 的 provider（如 SiliconFlow、智谱），开启真向量语义检索
- [ ] 运营反馈闭环：用户点踩 → 调整搜索权重 → 运营后台统计
- [ ] 定时统计：每周生成归档/查询/热门关键词报表
- [ ] 多群适配：不同群配置不同的归档/查询策略
- [ ] 用户可直接在生财平台自助查询（端到端去中间环节）

---

## 八、文件清单

```
feishu-kb/
├── .env                          环境变量配置
├── package.json                  依赖与脚本
├── agent/
│   ├── core.js                   Agent 主循环（真 Tool-Use Loop）
│   └── router.js                 意图路由（Phase 3 已废弃，由 Agent Loop 替代）
├── bot/
│   ├── index.js                  Bot 入口（WebSocket 长连接）
│   ├── archive.js                归档逻辑
│   └── query.js                  查询逻辑（语义混合检索）
├── lib/
│   ├── feishu.js                 飞书 API 封装
│   ├── bitable.js                多维表格操作
│   ├── ai.js                     AI 字段提取 + 关键词扩展
│   ├── embedding.js              Embedding 抽象层（预留）
│   └── vector-store.js           本地向量库（预留）
├── memory/
│   ├── session.js                会话记忆 + 状态机
│   └── chat.js                   群类型管理
├── tools/
│   ├── index.js                  LLM Function Calling 工具注册表（Phase 3 核心）
│   ├── archive.js                归档工具
│   ├── query.js                  查询工具
│   ├── continue.js               多轮延续工具
│   ├── chat.js                   闲聊工具
│   ├── feedback.js               反馈工具
│   ├── diagnose.js               诊断工具
│   ├── send-message.js           消息发送
│   ├── file_content_extractor.js AI 文件内容提取（Phase 3 新增）
│   └── chat_scanner.js           群历史扫描（Phase 3 新增）
├── scripts/
│   ├── init.js                   资源初始化
│   ├── setup-table.js            表格结构初始化
│   ├── build-vectors.js          批量重建向量
│   ├── test-api.js               API 权限测试
│   ├── test-phase2.js            多轮对话测试
│   ├── test-semantic-query.js    语义检索测试
│   └── debug-records.js          调试记录查看
└── data/
    └── vectors.json              本地向量库数据（运行时生成）
├── scripts/
│   ├── init.js                   资源初始化
│   ├── setup-table.js            表格结构初始化
│   ├── build-vectors.js          批量重建向量
│   ├── test-api.js               API 权限测试
│   ├── test-phase2.js            多轮对话测试
│   ├── test-semantic-query.js    语义检索测试
│   └── debug-records.js          调试记录查看
└── data/
    └── vectors.json              本地向量库数据（运行时生成）
```

---

## 九、关键配置与资源

| 配置项 | 值 |
|--------|-----|
| 飞书应用 ID | `cli_aaa880b32464dbc9` |
| 机器人名称 | 航海资料小抓 |
| 云空间文件夹 | `AGnNfPJ3HlTmQMdV6AEcKQtvnld` |
| 多维表格 App Token | `VQHmbEaOraXtl7sLuoWcPrdwnpn` |
| 多维表格 Table ID | `tblDDWU78FVnuxUm` |
| LLM 模型 | `deepseek-v4-flash` |
| LLM 接口 | `https://api.deepseek.com/v1` |
| 运营负责人 | `ou_c63f1fee5011bacfdef063aa926b483c` |
| 语义检索开关 | `ENABLE_SEMANTIC_SEARCH=false` |

---

## 十、启动命令

```bash
cd C:/Users/18786/WorkBuddy/2026-06-09-12-01-15/feishu-kb
npm run bot
```

**测试命令**：
```bash
# 语法检查
node --check bot/query.js && node --check lib/ai.js && node --check agent/core.js

# 多轮对话测试
node scripts/test-phase2.js

# 语义检索测试
node scripts/test-semantic-query.js

# API 权限测试
node scripts/test-api.js
```
