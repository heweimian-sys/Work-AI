# 项目库采集器

项目库采集器是一个本地优先的浏览器扩展，用于从小红书、B站、YouTube、X 等公开网页中捕获浏览器已经收到的结构化接口数据，再转换为项目库收件箱记录。

## 采集路径

```text
平台页面 → fetch/XHR 响应监听 → 原始 JSON → 平台字段解析 → 内容 ID 去重 → 本地收件箱 → 飞书多维表格
```

页面 DOM 只作为兜底，不作为主要数据源。图片和视频 CDN 地址只作为媒体附件保存，不作为内容唯一 ID。

## 安装

1. 打开 Chrome `chrome://extensions/`。
2. 开启“开发者模式”。
3. 选择 `extension/` 文件夹。
4. 打开支持的平台页面后刷新页面，再点击插件按钮。

## 飞书同步

浏览器扩展不保存飞书 App Secret，也不在仓库保存 Webhook。同步脚本复用仓库已有的 `项目/航海小抓/lib/feishu.js` 和 `项目/航海小抓/lib/bitable.js`。

在 `项目/航海小抓/.env` 配置 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`BITABLE_APP_TOKEN`、`BITABLE_TABLE_ID` 后，在本目录运行：

```bash
npm run sync:feishu
```

建议飞书视图把日常阅读字段放在最前面：`标题`、`平台`、`作者`、`原文链接`、`内容摘要`、`项目相关性`、`采集时间`。评论、互动数据、图片链接和原始记录放在后面，作为核验字段，不占用前面的阅读空间。

## 机会模式

先运行 `npm run opportunity`。它会读取本地 `inbox/`，进行去重、信号分类、相似机会聚簇和优先级排序，生成 `exports/opportunity-radar.json` 与 `exports/opportunity-daily.md`，按项目库规则输出：

- `new_opportunity`：可进入定向 Research；
- `existing_opportunity_case`：已有项目的补充案例；
- `signal_observation`：有信号但商业链路不完整；
- `excluded`：缺少可研究的项目信号。

聚簇和优先级只是 Radar 辅助，不等于收入验证；单一来源不会因为热度或关键词自动升级为项目卡。

每条结果都保留来源、事实、推断、未知、材料缺口和机会三问。关键词只是信号，不等于收入证明。

## 检查

```bash
npm run check
```

## 数据原则

- 优先使用平台内容 ID 去重，其次使用标准化 URL。
- 始终保留原始网络响应，解析失败时不伪造字段。
- 采集结果是待分析素材，不直接等同于正式项目卡。
- 飞书同步失败不删除本地收件箱记录。
