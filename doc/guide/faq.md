# 常见问题

## 面板与安装

### 安装脚本提示 "Docker command not found"？
请确保您的系统已安装 Docker 和 Docker Compose。
- Ubuntu/Debian 安装 Docker: `curl -fsSL https://get.docker.com | bash`

### 面板无法访问 (Connection Refused)？
1. 检查防火墙是否放行了前端端口（默认 `6366`）。
2. 检查容器是否正常运行: `docker ps`。
3. 查看容器日志: `docker logs flux-panel-backend` 或 `docker logs vite-frontend`。

### 节点显示离线？
1. 检查节点服务器与面板服务器之间的网络连通性。
2. 确认在节点端安装时输入的 **面板地址** 和 **密钥** 是否正确。
3. 检查节点端服务状态: `systemctl status flux_agent`。
4. 查看节点端日志: `journalctl -u flux_agent -f`。

### 只有 TCP 能通，UDP 不通？
请检查服务器防火墙和安全组（AWS/阿里云/腾讯云等）是否同时放行了对应端口的 **TCP 和 UDP** 协议。

### IPv6 无法使用？
面板安装脚本会自动尝试配置 Docker 的 IPv6。如果失败，请手动检查 `/etc/docker/daemon.json` 配置，确保 `ipv6: true` 且分配了正确的 `fixed-cidr-v6` 子网。

### 如何切换到 PostgreSQL？
在 `.env` 文件中设置 `DB_TYPE=postgres`，并让 `DATABASE_URL` 与 `POSTGRES_*` 保持一致，然后执行 `docker compose up -d` 重启服务即可。使用安装脚本部署时，`POSTGRES_PASSWORD` 会自动随机生成并写入 `.env`。详见 [PostgreSQL](./postgresql.md)。

### 从 SQLite 迁移到 PostgreSQL 后数据丢失？
1. 确认迁移前已备份 SQLite 文件（`gost.db.bak`）。
2. 确认 `pgloader` 命令执行成功，检查其输出是否有报错。
3. 确认 `.env` 中 `DATABASE_URL` 的密码与 `POSTGRES_PASSWORD` 一致。
4. 详细迁移步骤参考 [PostgreSQL](./postgresql.md)。

### PostgreSQL 容器启动失败？
1. 检查 `POSTGRES_PASSWORD` 是否已设置（不能为空）。
2. 查看容器日志：`docker logs flux-panel-postgres`。
3. 如果是首次启动后修改了密码，需要删除旧的数据卷重新初始化：`docker volume rm postgres_data`。

## 节点与订阅

### 内核状态显示“异常”

在“内核”标签里点击该内核 → “日志”查看原因，常见的有端口被占用、证书路径不存在、IPv6 被禁用（见 [搭建节点 - 监听地址](./nodes.md#监听地址)）。

### 流量一直是 0

检查节点是否安装了 nftables；流量每分钟左右同步一次。

### ACME 一直申请不到证书

确认域名已解析到节点；HTTP 验证时 80 端口不能被其他程序占用，并且要能从公网访问；也可以改用 DNS 验证。

### Snell 用哪个版本

入站的 Snell 版本不能高于节点安装的 Snell 主版本，v5 入站需要节点安装 Snell 5.x。

### Reality 用 Clash / Mihomo 连不上

Xray 26.7.11 起，Reality 未设置“最低客户端版本”时默认只接受 26.3.27 及以上的客户端，而 Mihomo（Clash Verge、Stash、FlClash 等）上报的版本是 1.8.2，会被拒绝。面板默认把最低客户端版本设为 `1.0.0`，所有客户端都能连接；如需调整，在 Reality 设置里修改“最低客户端版本”。也可以在安装内核时选择旧版本的 Xray。

### 面板自升级提示“部署docker-compose.yml不可用”

见 [升级](./upgrade.md#修复面板内升级)。

### 用 IP 访问时复制失败

浏览器只在 HTTPS 页面里完全开放复制功能。面板会自动改用兼容方式复制，仍失败时会提示；建议通过 HTTPS 域名访问面板，或长按文字手动复制。
