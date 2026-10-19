# 通知

在 **网站配置 → 通知** 里填写 Telegram 机器人或 Webhook 地址（两个都填就都发），打开 **启用通知** 后保存。点 **发送测试** 可以先用当前填写的内容试发一条，不用先保存。

## 事件

| 事件 | 什么时候提醒 |
|------|--------------|
| 节点掉线 / 恢复 | 节点断开超过 90 秒才提醒，重启、升级等短暂断线不打扰；重新连上后再发一条恢复 |
| 导入节点连不上 / 恢复 | [连通性检测](./import.md#连通性检测) 连续两次失败（约 6 分钟）才提醒，恢复后再发一条 |
| 内核运行出错 | 节点上的 Xray / sing-box / Snell 状态变成出错时提醒，附带错误信息 |
| 节点即将到期 | 节点设置了到期时间，到期前 3 天内提醒一次（在节点页关掉到期提醒的节点不会提醒） |
| 用户流量 / 到期 | 转发用户流量用到 90%、用完，或 3 天内到期；[分享订阅](./subscription.md#流量上限) 流量用到 90%、用完，或 3 天内到期 |
| 每日汇总 | 每天在设定的时间发一条：节点在线数、内核出错数、导入节点连不上的数量、入站和转发流量、分享订阅情况 |

同一个问题只提醒一次，恢复后才会再次提醒。不想收的事件取消勾选即可。

每日汇总默认早上 9 点发送，可以在 **每日汇总发送时间** 里改（0–23 点）。时间按面板服务器的时区，安装脚本默认 `Asia/Shanghai`。

## Telegram

1. 找 [@BotFather](https://t.me/BotFather) 发 `/newbot` 创建机器人，拿到 Bot Token（形如 `123456:ABC-DEF...`）
2. 给你的机器人发一条消息（或把它拉进群），再用 [@userinfobot](https://t.me/userinfobot) 查自己的 Chat ID；群组的 ID 以 `-100` 开头
3. 填入面板，点 **发送测试**

面板服务器在国内、连不上 `api.telegram.org` 时，可以在 **Telegram API 地址** 里填一个反代地址（例如 Cloudflare Workers 反代），面板会请求 `<地址>/bot<Token>/sendMessage`。

## Webhook

面板会向填写的地址发送 `POST` 请求，内容是 JSON：

```json
{
  "event": "node_offline",
  "title": "节点掉线",
  "message": "节点：东京-1",
  "text": "[FLYX] 节点掉线\n节点：东京-1\n时间：2026-10-16 10:00:00 UTC",
  "time": 1792130385331,
  "app": "FLYX"
}
```

- `event`：`node_offline`、`inbound_down`、`kernel_error`、`node_expiry`、`user_quota`、`daily_report`，测试消息是 `test`
- `text`：拼好的完整文本，直接转发给企业微信、钉钉、Bark、Server 酱等服务时用它即可
- 返回 2xx 视为发送成功

Bot Token 和 Webhook 地址只有管理员能看到，也不会写进 JSON 备份。
