# 航海运营工作台

面向航海项目负责人的只读运营驾驶舱。当前版本只使用生财 MCP 的项目级聚合数据，不读取群聊 ZIP，不保存成员身份、作业原文或问答原文。

线上地址：<https://voyage-ops-workbench.heweimian.workers.dev/>

## 业务目标

- 看清今天需要处理的 3-5 件事，以及信号、建议时间和待分配状态。
- 按项目识别未来 72 小时关卡、24 小时新增问题和 48 小时未首答问题。
- 用固定主题聚合定位集中答疑与手册补充机会，同时保留覆盖和新鲜度说明。
- 对外只提供项目级安全聚合；个人案例与“航海好事”必须另行核验和授权。

## 页面

- 今日运营：未来 72 小时关卡、首答压力和最多 5 条待确认行动。
- 项目作战室：逐项目查看完整关卡时间线、答疑压力和主题结构。
- 答疑雷达：按创建时间、首答状态和 48 小时老化识别优先事项。
- 航海好事：展示人工流转和明确空状态，不把作业量冒充好事。
- 行动台账：将可靠信号整理为待确认、待分配的建议；首版只读。
- 数据健康：列出 MCP 覆盖、可用指标、停用指标和公开边界。

## 数据流

```text
生财 MCP（只读任务与问答）
  -> 本地生成任务时间与问答时效安全快照
  -> 显式字段白名单投影
  -> scripts/sync-scys-projects.ps1
  -> Cloudflare D1 scys_ops_snapshots/latest
  -> /api/dashboard 显式字段白名单
  -> 六个运营页面
```

`examples/scys-ops-dashboard.public.json` 是当前可同步的安全投影。同步时会再次执行显式字段白名单，只把允许的项目与运营聚合写入 MCP 专用表。同步脚本不会调用 MCP；MCP 拉取仍需由已授权的 Agent/Codex 执行，拉取失败时不得复用旧数据冒充最新结果。

## 本地验证

需要 Node.js 22.13 或更高版本。Windows 和 Linux 均可直接构建：

```bash
npm test
```

Cloudflare 部署使用构建产物中的配置：

```bash
npx wrangler deploy --config dist/server/wrangler.json
```

## 安全边界

公开 Worker 不接收 ZIP，不提供写入、确认或发布接口。旧群聊同步入口已永久停用；历史 `dashboard_snapshots` 仅作为不可见备份保留，Worker 和同步脚本都不会读取或更新它。禁止写入或返回成员姓名、头像、联系方式、作业/问答原文、来源 ID、群名、消息 ID、文件 Key、证据编号和凭证。完整规则见 [DATA_BOUNDARY.md](DATA_BOUNDARY.md)。
