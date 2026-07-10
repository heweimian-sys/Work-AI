# 常驻运行说明

飞书机器人使用 WebSocket 长连接接收事件，`npm run bot` 所在的 Node 进程必须一直存活。终端关闭、电脑睡眠、网络断开，机器人就无法处理消息；MCP 自动同步也只会在这个进程存活时运行。

## 推荐：服务器 + PM2

```powershell
npm install
npm install -g pm2
npm run bot:pm2:start
pm2 save
```

常用命令：

```powershell
npm run bot:pm2:logs
npm run bot:pm2:restart
npm run bot:pm2:stop
```

生产环境建议放在不会睡眠的云服务器或公司常驻主机上，并开启：

```env
SCYS_MCP_AUTO_SYNC_ENABLED=true
SCYS_MCP_AUTO_SYNC_INTERVAL_MINUTES=360
SCYS_MCP_AUTO_SYNC_LIMIT=20
```

## Windows 本机临时常驻

如果只能先跑在 Windows 本机，至少需要关闭睡眠，并用 PM2 托管进程。这样窗口关掉后进程仍会由 PM2 管理，但电脑关机、断网、退出登录仍会影响机器人。

## 验证

启动后运行：

```powershell
npm run doctor
```

再私聊机器人发送：

```text
检查MCP工具
资料库体检
```

如果 `doctor` 通过但机器人不回消息，优先检查飞书应用事件订阅、WebSocket 模式、应用是否发布，以及运行机器是否能访问飞书开放平台和 MCP 地址。
