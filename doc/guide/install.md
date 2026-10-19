# 安装部署

面板端管理所有节点、隧道和入站；节点端（agent）装在中转机和落地机上，负责转发和运行内核。

## 面板端

面板端负责管理用户、节点和转发规则。

### 环境要求
- 操作系统：Linux (推荐 Debian 10+ / Ubuntu 20.04+)
- 必须安装 Docker 和 Docker Compose

### 一键安装

使用以下命令即可快速安装面板：

```bash
curl -L https://github.com/kure29/flyx/releases/latest/download/panel_install.sh -o panel_install.sh && chmod +x panel_install.sh && ./panel_install.sh
```

**安装过程中会提示输入以下信息：**
- **前端端口**: 默认为 `6366`
- **后端端口**: 默认为 `6365`

脚本会自动检测系统是否支持 IPv6，并自动配置 Docker 的 IPv6 支持。

### 访问面板

安装完成后，访问：
`http://<服务器IP>:<前端端口>` (默认: `http://<服务器IP>:6366`)

**默认管理员账号：**
- 用户名: `admin_user`
- 密码: `admin_user`

::: warning
首次登录后请立即在“我的 / 个人资料”里修改默认密码。
:::

### 维护菜单

再次运行 `./panel_install.sh` 脚本可以看到管理菜单：
1. 安装面板
2. 更新面板
3. 卸载面板
4. 迁移到 PostgreSQL
5. 退出


## 节点端

节点端运行在实际进行流量转发的服务器上，需要连接到面板端进行管理。

### 用面板生成的命令安装（推荐）

1. **网站配置** 里填好“面板后端地址”，节点通过它连接面板（通常是 `http://面板IP:6365`，或反向代理后的地址）
2. **节点** 页新建节点，点击 **安装**，安装命令会复制到剪贴板（复制失败时会弹出命令框）
3. 到节点服务器上以 root 执行

### 国内节点安装慢

安装脚本、agent 程序、Xray / sing-box 等内核和分流数据都来自 GitHub，国内节点直接下载很慢，默认经公共加速站下载，速度看加速站当时的情况。

面板在海外时，可以让节点改从面板下载：**网站配置** → **节点与监控** → 打开 **GitHub 加速** → 加速地址点 **面板中转**，保存。地址是“面板后端地址”加上 `/api/v1/open_api/gh`，例如 `http://1.2.3.4:6365/api/v1/open_api/gh`（按钮会自动填，带 `https://` 的地址请核对一下）。之后：

- 新生成的安装命令、节点升级、内核安装和分流数据更新都经面板下载，节点只需要能连上面板
- 面板第一次下载某个文件时从 GitHub 拉取并缓存在数据目录的 `github-cache` 里（最多约 2 GB，超出自动清理最早的），之后直接给节点，多个节点只下载一次
- 只提供面板用到的仓库（本项目、Xray、sing-box、shadow-tls 和分流数据），不能当通用 GitHub 代理用
- 面板自己升级时仍直接访问 GitHub

面板也在国内、同样访问不了 GitHub 时，继续用公共加速站，或者换成你自己的加速地址。

### 手动安装

在节点服务器上运行：

```bash
curl -L https://github.com/kure29/flyx/releases/latest/download/install.sh -o install.sh && chmod +x install.sh && ./install.sh
```

Alpine Linux 最小化安装若未包含 `curl`，可使用系统自带的 `wget` 下载：

```bash
wget -O install.sh https://github.com/kure29/flyx/releases/latest/download/install.sh && chmod +x install.sh && ./install.sh
```

脚本会在 Alpine 上自动安装 Bash、`curl` 和 CA 证书，并使用 OpenRC 注册、启动和管理 `flux_agent` 服务；其他受支持的 Linux 发行版继续使用 systemd。

**安装过程中会提示输入：**
- **服务器地址**: 面板端的通信地址（通常是 `http://<面板IP>:<后端端口>`，例如 `http://1.2.3.4:6365`）。
- **密钥**: 节点页里该节点的密钥。

或者直接使用带参数的命令（适用于自动化部署）：

```bash
# 替换 <面板地址> 和 <密钥>
./install.sh -a "http://1.2.3.4:6365" -s "your_node_secret"
```

### 验证安装
安装完成后，服务会自动启动。
- systemd 查看状态: `systemctl status flux_agent`
- Alpine/OpenRC 查看状态: `rc-service flux_agent status`
- 回到面板 **节点管理** 页面，该节点状态应显示为 **在线**。


## 反向代理（可选）

如果需要通过域名访问面板并自动获取 HTTPS 证书，可以使用 Caddy 作为反向代理。

### 安装 Caddy

```bash
# Debian / Ubuntu
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudflare.com/content/v1/e2qwFJ2fRP2b2q/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudflare.com/content/v1/e2qwFJ2fRP2b2q/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

其他系统请参考 [Caddy 官方安装文档](https://caddyserver.com/docs/install)。

### 配置 Caddyfile

编辑 Caddy 配置文件：

```bash
sudo nano /etc/caddy/Caddyfile
```

#### 面板域名配置

将 `panel.example.com` 替换为你自己的域名：

```txt
panel.example.com {
    reverse_proxy localhost:6366
}
```

Caddy 会自动为域名申请和续期 HTTPS 证书，无需额外配置。

### 重启 Caddy

```bash
sudo systemctl restart caddy
```

### 注意事项

- 确保域名已正确解析到服务器 IP。
- 确保服务器防火墙放行了 **80** 和 **443** 端口（Caddy 自动申请证书需要）。
- 使用 Caddy 反向代理后，可以在 `.env` 中将前端端口改为仅监听本地，避免直接暴露：
  ```
  FRONTEND_PORT=127.0.0.1:6366
  ```

升级见 [升级](./upgrade.md)。
