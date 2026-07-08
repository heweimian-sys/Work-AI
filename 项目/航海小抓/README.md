# 飞书知识库 - 开发说明

## 目录结构

```
feishu-kb/
├── .env.example          # 环境变量模板（复制为 .env 填写）
├── package.json
├── lib/                  # 基础能力
│   ├── feishu.js         # 飞书客户端单例 + 工具函数
│   ├── bitable.js        # 多维表格读写封装
│   └── ai.js             # AI 字段提取 + 关键词理解
├── agent/                # Agent 核心（新增）
│   ├── core.js           # Agent 主循环：加载上下文 → 意图路由 → 执行工具 → 发送回复
│   └── router.js         # 基于 LLM 的意图路由
├── tools/                # 工具层（新增）
│   ├── index.js          # 工具注册表
│   ├── archive.js        # 文件/链接归档工具
│   ├── query.js          # 自然语言查询工具
│   ├── send-message.js   # 发送消息工具
│   └── feedback.js       # 反馈处理工具
├── memory/               # 记忆层（新增）
│   ├── session.js        # 会话历史（内存实现）
│   └── chat.js           # 监听群配置（当前单群混合模式）
├── scripts/
│   ├── init.js           # 一键初始化（创建云空间+多维表格）
│   ├── setup-table.js    # 表格字段设置
│   ├── test-api.js       # API 权限验证
│   └── debug-records.js  # 调试记录
├── bot/
│   ├── index.js          # Bot 主入口（WebSocket 长连接 + 事件解析）
│   ├── archive.js        # 文件归档处理器（现由 tools/archive.js 调用）
│   └── query.js          # 自然语言查询处理器（现由 tools/query.js 调用）
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 FEISHU_APP_ID 和 FEISHU_APP_SECRET
```

### 3. 飞书开发者后台配置

在 [飞书开放平台](https://open.feishu.cn) 创建/选择企业自建应用，开启以下权限：

| 权限标识 | 用途 |
|---------|------|
| `drive:drive` | 访问云空间 |
| `drive:file` | 上传/下载文件 |
| `bitable:app` | 创建多维表格 |
| `bitable:app:readonly` | 读取多维表格 |
| `bitable:record` | 读写表格记录 |
| `im:message` | 接收消息 |
| `im:message.group_msg` | 接收群聊中所有用户消息（直接上传文件时需要） |
| `im:message:send_as_bot` | 发送消息 |
| `im:chat` | 读取群信息 |

> 修改权限后需重新发布应用版本

### 4. 初始化云空间和多维表格

```bash
node scripts/init.js
```

将输出的三个 token 填入 `.env`：
- `DRIVE_FOLDER_TOKEN`（云空间文件夹 token，归档文件会存到这里）
- `BITABLE_APP_TOKEN`
- `BITABLE_TABLE_ID`

> 手动获取 `DRIVE_FOLDER_TOKEN`：在飞书云空间打开目标文件夹，复制 URL 中 `folder/` 后面的字符串即可。例如 `https://bytedance.feishu.cn/drive/folder/fldbcO1UuPz8VwnpPx5a92abcef`，则 token 为 `fldbcO1UuPz8VwnpPx5a92abcef`。

### 5. 验证 API 权限

```bash
node scripts/test-api.js
```

全部通过后进入 Bot 阶段。

### 6. 本地开发启动 Bot

安装 ngrok（一次性）：
```bash
npm install -g ngrok
# 或直接下载：https://ngrok.com/download
```

开两个终端：

**终端 1 - 启动 Bot 服务：**
```bash
node bot/index.js
```

**终端 2 - 开启内网穿透：**
```bash
ngrok http 3000
```

将 ngrok 输出的 `https://xxxx.ngrok.io/webhook` 填入飞书开发者后台：
- 事件订阅 -> 请求地址 -> `https://xxxx.ngrok.io/webhook`

订阅以下事件：
- `im.message.receive_v1`（接收消息）

### 7. 将 Bot 加入群组

飞书开发者后台 -> 应用功能 -> 机器人 -> 开启

然后在目标群中添加该机器人，并把群 chat_id 填入 `.env` 的 `MONITORED_CHAT_IDS`。留空则监听所有群。

## Agent 改造说明

本项目已完成 **Phase 1** 的 Agent 化改造：

1. **bot/index.js** 不再直接处理业务，只负责：
   - 接收飞书 WebSocket 事件
   - 双重去重
   - 解析为统一的 `event` 对象
   - 交给 `agent/core.js` 处理

2. **agent/core.js** 是新的 Agent 主循环：
   - 加载会话记忆（`memory/session.js`）
   - 获取群类型（`memory/chat.js`）
   - 调用 `agent/router.js` 判断意图
   - 根据意图调用 `tools/` 层执行
   - 统一发送回复并保存会话

3. **agent/router.js** 基于 LLM 判断意图：
   - `archive`：归档文件/链接
   - `query`：查询资料
   - `feedback`：反馈处理
   - `help`：使用帮助
   - `chat`：闲聊
   - `clarify`：需要反问澄清

4. **tools/** 是 Agent 可调用的能力：
   - `tools/archive.js` 调用 `bot/archive.js` 的现有逻辑（兼容 Phase 1）
   - `tools/query.js` 调用 `bot/query.js` 的现有逻辑（兼容 Phase 1）
   - 后续 Phase 会把业务逻辑逐步内聚到 tools 中，并统一由 core 发送消息

### 环境变量补充

升级后需要在 `.env` 中补充：

```bash
# 机器人名称，用于判断用户是否@了本机器人
BOT_NAME=航海助手

# 机器人监听的群 chat_id（多个用逗号分隔）
# 当前客服与运营共用一个群，直接填写该群 chat_id
# 留空则监听所有群（测试方便，生产建议填写）
MONITORED_CHAT_IDS=
```



### 单群混合模式

当前客服与运营在同一个群，机器人在该群内同时支持两类行为：

1. **上传文件/链接自动归档**
   直接发送 PPT/PDF/云文档链接，机器人默认归档到知识库。
2. **@机器人查询**
   ```
   @机器人 AI沙龙的PPT
   @机器人 张三老师分享的大模型文档
   @机器人 第12期所有资料
   ```

机器人返回文件名 + 飞书云空间直链，客服直接复制发给微信用户。

---

## 生产部署

将 Bot 服务部署到腾讯云函数（SCF）或云托管，替代 ngrok。

```bash
# 腾讯云托管部署（参考）
# 1. 在项目根目录创建 Dockerfile
# 2. 推送到 TCR
# 3. 在云托管创建服务
```
