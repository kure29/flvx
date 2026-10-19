# 快速上手

用一台落地机搭一个 VLESS Reality 节点，再经中转机对接，最后用订阅导入客户端。

## 1. 安装面板

```bash
curl -L https://github.com/kure29/flyx/releases/latest/download/panel_install.sh -o panel_install.sh && chmod +x panel_install.sh && ./panel_install.sh
```

选 `1. 安装面板`，完成后访问 `http://服务器IP:6366`，默认账号 `admin_user` / `admin_user`，**登录后立即修改密码**。

详见 [安装部署](./install.md)。

## 2. 添加节点

1. **网站配置** 里填好“面板后端地址”（节点用它连接面板）
2. **节点** 页新建落地机和中转机，复制生成的安装命令，到对应服务器上执行
3. 等节点状态变为 **在线**

## 3. 搭建节点

1. **落地** 页 → **内核** 标签 → **安装内核**，在落地机上安装 Xray
2. **入站** 标签 → **新建入站** → 选落地机和 Xray → 点模板 **VLESS + Reality + Vision** → 保存

详见 [搭建节点](./nodes.md)。

## 4. 对接中转（可选）

1. **中转** 页 → **隧道** 标签新建隧道，入口选中转机
2. **中转** 页 → **线路** 标签，点落地 → 选这条隧道（也可以在落地页点入站 → **中转**）

详见 [对接中转](./relay.md)。已有别处搭好的节点，可以用 [导入节点](./import.md)。

## 5. 订阅

**订阅** 页里默认有一个“我的订阅”，点开它选客户端一键导入（Clash、sing-box、Shadowrocket、Loon、Quantumult X、Surge、Stash），或点复制按钮复制链接，直连和中转线路都在里面。想按地区拆分、改名或分享给朋友，见 [订阅](./subscription.md)。

::: tip 复制失败？
浏览器只在 HTTPS 页面里完全开放复制功能。建议给面板配置域名和 HTTPS，见 [安装部署 - 反向代理](./install.md#反向代理-可选)。
:::
