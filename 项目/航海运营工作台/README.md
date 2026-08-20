# 航海运营工作台

面向航海项目负责人的只读运营驾驶舱。当前版本只使用生财 MCP 的项目级聚合数据，不读取群聊 ZIP，不保存成员身份、作业原文或问答原文。

线上地址：<https://voyage-ops-workbench.heweimian.workers.dev/>

## 业务目标

- 看清本期项目规模、报名、任务、产出、点评与问答压力。
- 按项目识别临期节点、数据边界和需要人工判断的运营动作。
- 以同一组指标横向比较项目，同时保留口径和新鲜度说明。
- 对外只提供项目级安全聚合；个人案例与“航海好事”必须另行核验和授权。

## 页面

- 运营总览：本期核心指标、项目矩阵和关键判断。
- 项目驾驶舱：逐项目查看时间线、里程碑、产出与运营压力。
- 成果观察：展示审核可见产出和点评聚合，不把作业量冒充好事。
- 运营行动：根据临期、问答、点评和查询边界生成待人工确认建议。
- 项目快照：显示 MCP 拉取时间、上游时间和数据健康度。
- 项目对比：按类型、方向比较报名、产出、点评和问答。
- 数据口径：列出 MCP 工具、指标定义、公开边界和缺失项。

## 数据流

```text
生财 MCP（只读）
  -> 本地生成项目级安全快照
  -> 显式字段白名单投影
  -> scripts/sync-scys-projects.ps1
  -> Cloudflare D1 scys_ops_snapshots/latest
  -> /api/dashboard 显式字段白名单
  -> 七个只读页面
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
