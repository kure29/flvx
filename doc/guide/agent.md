# 安装 agent

agent 装在要搭节点或当中转的服务器上：连接面板，负责转发流量、下载和运行内核、测延迟和回程。

## 准备

- Linux amd64 / arm64，root 权限（Alpine 也支持）
- 面板 **设置 → 基本** 里已填好“面板后端地址”
- 搭节点的服务器建议安装 nftables（`apt install nftables`）：入站流量统计、白名单、订阅流量上限和 Hysteria2 端口跳跃依赖它；没有时服务器照常工作，只是没有这些功能

## 用面板生成的命令安装（推荐）

1. **服务器** 页新建服务器，点击 **安装**，在弹出的窗口里选 **一键脚本** 或 **Docker**，点 **复制**
2. 到服务器上以 root 执行，等服务器状态变为 **在线**

## 用 Docker 安装

服务器已装好 Docker 时，可以用容器运行 agent。在安装窗口切到 **Docker**，复制的命令形如：

```bash
docker rm -f flux_agent >/dev/null 2>&1; docker run -d --name flux_agent \
  --restart unless-stopped --network host --cap-add NET_ADMIN \
  -v /etc/flux_agent:/etc/flux_agent \
  -e FLUX_AGENT_ADDR=<面板地址> -e FLUX_AGENT_SECRET=<密钥> \
  ghcr.io/kure29/flux-agent:<版本>
```

- `--network host`：转发和入站要按需监听任意端口，必须用宿主机网络
- `--cap-add NET_ADMIN`：入站流量统计和白名单要用 nftables
- `/etc/flux_agent`：配置、下载的内核和 agent 程序都在这里，删掉容器重建不会丢
- `--restart unless-stopped`：不能去掉，面板一键升级靠它把容器拉起来
- 不要和一键脚本安装的 agent 同时运行，二者会抢端口；换成 Docker 前先在原机器上卸载脚本版

**升级**：和脚本安装一样，在 **服务器** 页点 **升级**，agent 下载新版本替换数据目录里的程序后自动重启容器；也可以拉取新版本镜像后重新执行安装命令，镜像里的版本会覆盖数据目录里的程序。

**调优**：容器默认改不了宿主机内核参数，要用调优需要把 `--cap-add NET_ADMIN` 换成 `--privileged`；宿主机重启后需要在面板重新应用一次。

**查看日志**：`docker logs -f flux_agent`

## 服务器调优

**服务器** 页的服务器卡片上点 **调优**（列表视图在操作菜单里），会先显示服务器当前的网络参数，可调的项目默认全部勾选：

| 项目 | 作用 |
|------|------|
| BBR 拥塞控制 | 高延迟、有丢包的线路上明显提速，需要内核 4.9 以上 |
| 加大缓冲区 | 跨境长距离线路单连接更快 |
| TCP 连接优化 | Fast Open、空闲后不降速、自动探测 MTU |
| 高并发队列 | 连接多时不丢新连接 |
| IPv4 转发 | 内核转发（nftables 端口转发）需要 |
| 文件句柄上限 | 允许打开更多连接和文件 |

- 点 **应用** 后立即生效，并写入 `/etc/sysctl.d/99-flyx-tuning.conf`，重启后保持
- 只会调大的上限类参数（缓冲区、队列、句柄数）如果服务器本来就更高，保持原值不动
- 之后取消勾选某一项再应用，这一项会恢复成调优前的值；**恢复默认** 撤销全部调优
- 系统不支持的项（比如内核没有 BBR）会跳过并提示
- 需要 agent 为 3.3.10 及以上，旧版本请先升级

## 国内服务器安装慢

安装脚本、agent 程序、Xray / sing-box 等内核和分流数据都来自 GitHub，国内服务器直接下载很慢，默认经公共加速站下载，速度看加速站当时的情况。

面板在海外时，可以让服务器改从面板下载：**设置** → **服务器与监控** → 打开 **GitHub 加速** → 加速地址点 **面板中转**，保存。地址是“面板后端地址”加上 `/api/v1/open_api/gh`，例如 `http://1.2.3.4:6365/api/v1/open_api/gh`（按钮会自动填，带 `https://` 的地址请核对一下）。之后：

- 新生成的安装命令、服务器升级、内核安装和分流数据更新都经面板下载，服务器只需要能连上面板
- 面板第一次下载某个文件时从 GitHub 拉取并缓存在数据目录的 `github-cache` 里（最多约 2 GB，超出自动清理最早的），之后直接给服务器，多个服务器只下载一次
- 只提供面板用到的仓库（本项目、Xray、sing-box、shadow-tls 和分流数据），不能当通用 GitHub 代理用
- 面板自己升级时仍直接访问 GitHub

面板也在国内、同样访问不了 GitHub 时，继续用公共加速站，或者换成你自己的加速地址。

## 手动安装

在服务器上运行：

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
- **密钥**: 服务器页里该服务器的密钥。

或者直接使用带参数的命令（适用于自动化部署）：

```bash
# 替换 <面板地址> 和 <密钥>
./install.sh -a "http://1.2.3.4:6365" -s "your_node_secret"
```

## 验证安装
安装完成后，服务会自动启动。
- systemd 查看状态: `systemctl status flux_agent`
- Alpine/OpenRC 查看状态: `rc-service flux_agent status`
- Docker 查看状态: `docker ps -f name=flux_agent`
- 回到面板 **服务器** 页，该服务器状态应显示为 **在线**

服务器离线的排查见 [常见问题](./faq.md#服务器显示离线)。

## 升级 agent

**服务器** 页选择服务器 → **升级**（可以多选批量升级），留空版本即使用最新版。新功能（例如回程检测）需要 agent 跟面板一起升级，见 [升级](./upgrade.md#agent-升级)。
