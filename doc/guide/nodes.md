# 搭建节点

在落地机上部署代理节点（入站）。所有配置由面板生成，节点上的 agent 只负责下载内核、写入配置、运行和守护进程。

## 准备

- 落地机已按 [安装部署](./install.md) 装好节点 agent，并在面板里显示在线
- Linux amd64 / arm64，root 权限
- 建议安装 nftables（`apt install nftables`）：入站流量统计、白名单和 Hysteria2 端口跳跃依赖它；没有 nftables 时节点照常工作，只是没有这些功能

## 安装内核

**落地** 页 → **内核** 标签 → **安装内核** → 选择节点和内核。

| 内核 | 版本 | 说明 |
|------|------|------|
| Xray | 默认最新版，可指定 | 从 GitHub Release 下载，用官方校验文件校验 |
| sing-box | 默认最新版，可指定 | 从 GitHub Release 下载，用 Release 资产的 SHA256 校验 |
| Snell | 5.0.1 / 4.1.1 | 只从官方 `dl.nssurge.com` 下载，使用内置的校验值 |

一台节点可以同时安装多个内核，内核按节点分组显示。点击内核可以启停、重启、查看日志、更换版本或卸载；节点重启后内核会自动恢复运行。

## 新建入站

**落地** 页 → **入站** 标签 → **新建入站** → 选择节点和内核 → 点击一个快速模板 → 填名称 → **创建并下发**。

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

### 分流

服务器侧的分流和链式：客户端照常连本节点，由节点内核决定流量从哪里出去。想在客户端订阅里组合“中转 → 落地”，见 [订阅的链式代理](./subscription.md#链式代理)。

点入站 → **分流**，有两部分：

- **默认出口**：直连（从本节点出去），或选另一个入站（其他节点上的入站、导入的节点），流量再经它出去，网站看到的是它的 IP（链式代理）
- **分流规则**：按目标把一部分流量送到别处，从上到下匹配，先命中先生效，都不命中的走默认出口

每条分流规则选分类或填自定义域名 / IP，再选去向：**直连**、**阻断** 或某个出站节点。

| 分类 | 内容 |
|------|------|
| 流媒体 | Netflix、Disney+、YouTube、HBO、Prime Video、Spotify、TikTok |
| AI | ChatGPT、Claude、Gemini |
| 常用 | Google、Telegram |
| 其他 | 广告、BT 下载、回国流量（中国大陆的域名和 IP） |

常见用法：

- 只让 Netflix / ChatGPT 走有解锁 IP 的节点（例如导入的机场节点），其他流量照常直连
- 落地机阻断 BT 和回国流量，避免被投诉或滥用
- A → B → C 多级：给 A 的入站选 B 作为默认出口，再给 B 的入站选 C；每个节点只连下一跳
- 自定义域名包含子域名，例如填 `example.com` 也匹配 `www.example.com`

注意事项：

- 分类数据自动更新：Xray 用 v2fly 的 geosite / geoip 数据，节点每天检查一次，有新版本就下载、校验后替换并重启 Xray（启动失败会恢复原文件），内核日志里可以看到更新记录；sing-box 首次使用某个分类时下载规则集并缓存，之后每天更新。两者都经 **网站配置** 里的 GitHub 加速地址下载，落地机需要能访问
- Xray 能连接 VLESS / VMess / Trojan / Shadowsocks（不含插件和 ShadowTLS）/ SOCKS5 / HTTP 出站节点；Hysteria2、TUIC、AnyTLS 等请用 sing-box 内核；Snell 内核不支持分流，也不能作为出站节点
- 出站节点是本面板的自签证书入站时，Xray 用证书指纹校验；导入的节点如果跳过了证书验证，Xray 无法连接（新版 Xray 已移除 `allowInsecure`），请改用 sing-box
- 开启了“获取真实客户端 IP”的入站只能经中转连接，不能作为出站节点；只监听本机的入站只能被同一节点上的入站选用
- 出站节点开启了白名单时，会自动放行经它出站的节点；规则之间形成循环（A 经 B、B 又经 A）时无法保存
- 被选作默认出口或分流去向的入站不能直接删除，需先解除；订阅源刷新时也会保留这些节点。出站节点如果随内核或节点一起被删除，原本经它出去的流量会被丢弃（不会改为直连），请重新选择
- 用户流量统计照常按用户计算
- 保存会重启节点内核，正在经这个节点连接的会断开一下重连。如果你正用这个节点打开面板，保存时连接会中断，面板会在节点恢复后自动确认是否已保存
- 新配置让内核启动失败时（例如下载分流规则集失败），节点会自动恢复上一次能运行的配置并显示错误，不会因此掉线

## 分享与订阅

- 点击入站 → **分享**（电脑上也可以直接点行内的“分享”按钮）：显示通用分享链接和二维码；Snell 没有通用链接，显示 Surge 配置行。Surge 用户请使用 Surge 订阅
- **订阅** 页：一个链接包含落地和中转线路，可以建多个、分别过滤和改名，也可以分享给别人，见 [订阅](./subscription.md)

| 订阅格式 | 适用客户端 | 不包含 |
|----------|------------|--------|
| 自动识别 | 按客户端 UA 返回对应格式 | |
| Clash / Mihomo | Clash Verge、Stash、FlClash | XHTTP、Snell、NaïveProxy |
| sing-box | SFA / SFI / SFM | XHTTP、Snell |
| Shadowrocket | Shadowrocket | XHTTP、Snell、NaïveProxy |
| Loon | Loon | TUIC、gRPC、XHTTP、Snell、NaïveProxy |
| Quantumult X | Quantumult X | Hysteria2、TUIC、gRPC、XHTTP、ShadowTLS、Snell、NaïveProxy |
| 通用 base64 | v2rayN、NekoBox | Snell |
| Surge | Surge | VLESS、Reality、gRPC、XHTTP、NaïveProxy |

## 批量操作

入站多了不好管理时，点列表上方的 **多选**：点卡片勾选，**全选** 会选中当前列表里显示的全部入站（可以先用搜索或节点筛选缩小范围），然后可以批量 **启用**、**停用** 或 **删除**。每个受影响的内核只下发一次配置。

## 备份

在 **网站配置 → 数据备份与恢复** 里勾选 **内核与入站**，会导出节点上的内核、所有入站（包括导入的节点）、中转线路和流量统计基准。所有订阅（包括分享出去的）也包含在内。恢复后面板会把内核配置重新推到在线的节点，离线的节点重连时自动补上。3.0.9 之前导出的备份不包含这部分，升级后请重新导出一次。

下一步：[对接中转](./relay.md)
