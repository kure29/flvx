# 搭建节点

在落地机上部署代理节点（入站）。所有配置由面板生成，节点上的 agent 只负责下载内核、写入配置、运行和守护进程。

## 准备

- 落地机已按 [安装部署](./install.md) 装好节点 agent，并在面板里显示在线
- Linux amd64 / arm64，root 权限
- 建议安装 nftables（`apt install nftables`）：入站流量统计、白名单和 Hysteria2 端口跳跃依赖它；没有 nftables 时节点照常工作，只是没有这些功能

## 安装内核

入站页 → **内核** 标签 → **安装内核** → 选择节点和内核。

| 内核 | 版本 | 说明 |
|------|------|------|
| Xray | 默认最新版，可指定 | 从 GitHub Release 下载，用官方校验文件校验 |
| sing-box | 默认最新版，可指定 | 从 GitHub Release 下载，用 Release 资产的 SHA256 校验 |
| Snell | 5.0.1 / 4.1.1 | 只从官方 `dl.nssurge.com` 下载，使用内置的校验值 |

一台节点可以同时安装多个内核，内核按节点分组显示。点击内核可以启停、重启、查看日志、更换版本或卸载；节点重启后内核会自动恢复运行。

## 新建入站

入站页 → **入站** 标签 → **新建入站** → 选择节点和内核 → 点击一个快速模板 → 填名称 → **创建并下发**。

端口留空会随机分配，UUID、密码、密钥留空会自动生成。

| 模板 | 内核 | 说明 |
|------|------|------|
| VLESS + Reality + Vision | Xray / sing-box | 推荐，无需域名和证书 |
| VLESS + XHTTP + Reality | Xray | |
| Shadowsocks 2022 | Xray / sing-box | |
| Trojan + TLS（自签） | Xray / sing-box | 需要填写域名 |
| VMess + WS + TLS | Xray / sing-box | 兼容老客户端 |
| Hysteria2 | sing-box | 基于 QUIC，可选端口跳跃 |
| TUIC v5 | sing-box | 基于 QUIC |
| AnyTLS | sing-box | |
| SS2022 + ShadowTLS | sing-box | 仅 TCP |
| NaïveProxy | sing-box | 需要域名和真实证书 |
| Snell / Snell + ShadowTLS | Snell | Surge 专用 |

### 证书

TLS 类入站有三种证书来源：

- **自动生成自签证书**：开箱即用，客户端需要允许不安全证书（分享链接已自动带上）
- **使用节点上的证书文件**：填写证书和私钥在节点上的绝对路径
- **自动申请证书（ACME）**：仅 sing-box，需要 sing-box 1.14 及以上
  - 域名必须解析到该节点
  - HTTP 验证：节点 80 端口要能从公网访问
  - DNS 验证：支持 Cloudflare（API Token）和阿里云（AccessKey），不需要 80 端口
  - 证书由 sing-box 自动续期

NaïveProxy 必须使用真实证书（ACME 或证书文件）。

### Hysteria2 端口跳跃

在 Hysteria2 入站里填写一段 UDP 端口，例如 `20000-30000`。节点会用 nftables 把这段端口转到入站端口，客户端在其中随机切换，缓解运营商对单个 UDP 端口的限速。

- 范围不能包含入站端口本身，不能和其他入站、转发或节点的转发端口段重叠
- 只有直连地址带跳跃参数；经中转连接时只转发一个端口，不跳跃

### 监听地址

默认监听 `::`（同时支持 IPv4 和 IPv6）。如果节点在内核启动参数里完全禁用了 IPv6（`ipv6.disable=1`），部分内核会绑定失败，此时在高级选项里把监听地址改为 `0.0.0.0`。

## 分享与订阅

- 点击入站 → **分享**（电脑上也可以直接点行内的“分享”按钮）：显示通用分享链接和二维码；Snell 没有通用链接，显示 Surge 配置行。Surge 用户请使用 Surge 订阅
- 入站页的 **订阅** 标签：包含所有已启用的入站和中转线路，客户端定期更新即可同步

| 订阅格式 | 适用客户端 | 不包含 |
|----------|------------|--------|
| 自动识别 | 按客户端 UA 返回对应格式 | |
| Clash / Mihomo | Clash Verge、Stash、FlClash | XHTTP、Snell、NaïveProxy |
| sing-box | SFA / SFI / SFM | XHTTP、Snell |
| 通用 base64 | v2rayN、Shadowrocket、NekoBox | Snell |
| Surge | Surge | VLESS、Reality、gRPC、XHTTP、NaïveProxy |

订阅链接可以在订阅标签里重置，旧链接随即失效。

下一步：[对接中转](./relay.md)
