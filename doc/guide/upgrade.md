# 升级

## 面板内升级

**设置** → **系统与升级** → **面板自升级** → **检查更新** → **立即升级**。

升级会拉取新镜像并重建前后端容器，约 1 分钟后刷新页面即可。页面没有变化时，通常是浏览器或 CDN 缓存，刷新或清理缓存即可。

## 脚本升级

在面板部署目录（存放 `docker-compose.yml` 和 `.env` 的目录）重新运行安装脚本，选 `2. 更新面板`：

```bash
curl -L https://github.com/kure29/flyx/releases/latest/download/panel_install.sh -o panel_install.sh && chmod +x panel_install.sh && ./panel_install.sh
```

数据会保留，更新前会自动备份到部署目录的 `backups/`。

## 指定版本

到 [Releases](https://github.com/kure29/flyx/releases) 复制对应版本的命令，例如：

```bash
curl -L https://github.com/kure29/flyx/releases/download/3.0.7/panel_install.sh -o panel_install.sh && chmod +x panel_install.sh && ./panel_install.sh
```

## agent 升级

**服务器** 页选择服务器 → **升级**，留空版本即使用最新版；点 **多选** 可以批量升级。也可以在服务器上重新运行服务器安装脚本。

面板升级后建议把 agent 也升级到同一版本：新功能（例如回程检测、订阅流量统计）需要新 agent，旧 agent 能照常转发，只是用不了这些功能。内核（Xray / sing-box / Snell）的版本在 **落地 → 内核** 里单独更换，见 [内核与协议](./kernels.md)。

## 修复面板内升级

面板内升级提示“部署docker-compose.yml不可用”时：3.0.6 及更早版本的面板内升级会把后端容器的部署目录挂载弄丢，之后面板内升级会一直提示这个错误。数据不受影响，修复一次即可：

1. 在服务器上进入存放 `docker-compose.yml` 和 `.env` 的目录（常见为 `/root`，或当初运行安装脚本的目录），用 `ls` 确认这两个文件都在
2. 执行：

   ```bash
   docker compose up -d --force-recreate backend frontend
   ```

也可以在该目录运行 3.0.7 及以后的安装脚本，选“更新面板”，会顺带修复。
