# 抖音 CPS 五期航海情报站

这是当前航海群聊情报站的完整源码版本。

## Cloudflare Pages 部署配置

- Root directory：`项目/抖音CPS航海情报站`
- Build command：`pnpm build`
- Output directory：`dist`
- Node.js：`22`

构建后会在 `dist/` 生成 Cloudflare Pages 可识别的 `_worker.js`，并把静态资源合并到同一目录。
