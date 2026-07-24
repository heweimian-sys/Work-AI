# 航海小抓

飞书群资料归档 Agent，用于把群文件、飞书链接、生财 MCP 资料整理进云盘和多维表格，并支持客服/运营用自然语言查询。

## 核心能力

- 群内文件、图片、飞书链接自动归档。
- 群聊非 @ 静默收集，@ 或私聊时回复查询结果。
- 多维表格资料壳子补全、去重、低价值记录治理。
- 生财 MCP 项目库、高手领航、航海手册同步。
- 航海手册专用链路：`activityList -> activityManualToc -> activityManualDetail`。

## 航海资料智能归档

系统识别航海月份、项目、阶段和资料类型。阶段包括开营、航行、中期、结营、高手领航；资料类型包括 PPT、飞书文档、回放、作业模板、SOP 和海报。

高置信度资料自动标记为“已归档”。缺少字段或置信度低于 0.6 时，资料进入“待补分类”，机器人发送确认卡片。运营负责人可以接受分类，或进入多维表格修改。

客服查询只返回已归档或尚未迁移状态字段的历史资料，并要求资料有效、属于当前版本且链接可打开。资料链接保持公开可读，不设置单独的外发审批。

## 常用命令

```powershell
npm install
npm run bot
```

验证生财 MCP 航海手册工具链，不写入多维表格：

```powershell
npm run verify:mcp-manual
```

只读体检资料库健康度，不修改记录：

```powershell
npm run audit:library
```

导出标准知识包，可导入 MaxKB/Dify/向量库：

```powershell
npm run export:knowledge
```

一键体检 Agent 关键链路：

```powershell
npm run doctor
```

本地验证航海字段识别与查询状态：

```powershell
npm run test:voyage
```

导出结果默认在 `exports/kb-export-时间戳/`，包含：

- `knowledge.jsonl`
- `knowledge.md`
- `manifest.json`

小批量验证参数：

```powershell
node scripts/verify-mcp-manual.js --activityLimit=1 --chapterLimit=3 --limit=3
```

## 私聊机器人指令

- `检查MCP工具`：列出生财 MCP 当前可用工具。
- `同步MCP资料`：按关键词同步项目库、高手领航、手册搜索等资料。
- `同步航海手册`：专门同步航海列表、手册目录和章节详情。
- `同步航海手册 5条`：限制本轮最多处理 5 条章节详情。
- `测试同步航海手册`：dryRun 预览，不写入多维表格。
- `资料库体检`：只读检查多维表格健康度，不删除、不修改。

## 运营闭环

查询没有结果时，Agent 会把搜索词写入：

```text
data/no-result-searches.jsonl
```

这份文件可以定期查看，用来判断用户缺什么资料。

## 重要配置

复制 `.env.example` 为 `.env`，并填写飞书、OpenAI 和生财 MCP 配置。不要提交 `.env`。

```env
SCYS_MCP_URL=https://mcp.scys.com/shengcai-web/mcp
SCYS_MCP_TOKEN=
SCYS_MCP_SYNC_MANUAL_CHAPTERS=true
SCYS_MCP_ACTIVITY_LIMIT=3
SCYS_MCP_CHAPTER_LIMIT=10
SCYS_MCP_MANUAL_SYNC_LIMIT=20
```

## 运行目录

当前生产测试运行目录通常是：

```text
C:\Users\18786\WorkBuddy\2026-06-09-12-01-15\feishu-kb
```

GitHub 仓库内目录是：

```text
项目/航海小抓
```
