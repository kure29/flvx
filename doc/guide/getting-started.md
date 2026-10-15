# 快速上手

用一台落地机搭一个 VLESS Reality 节点，再经中转机对接，最后用订阅导入客户端。

## 1. 安装面板

```bash
curl -L https://github.com/kure29/flvx/releases/latest/download/panel_install.sh -o panel_install.sh && chmod +x panel_install.sh && ./panel_install.sh
```

选 `1. 安装面板`，完成后访问 `http://服务器IP:6366`，默认账号 `admin_user` / `admin_user`，**登录后立即修改密码**。

详见 [安装部署](./install.md)。

## 2. 添加节点

1. **网站配置** 里填好“面板后端地址”（节点用它连接面板）
2. **节点** 页新建落地机和中转机，复制生成的安装命令，到对应服务器上执行
3. 等节点状态变为 **在线**

## 3. 搭建节点

1. **入站** 页 → **内核** 标签 → **安装内核**，在落地机上安装 Xray
2. **入站** 标签 → **新建入站** → 选落地机和 Xray → 点模板 **VLESS + Reality + Vision** → 保存

详见 [搭建节点](./nodes.md)。

## 4. 对接中转（可选）

1. **隧道** 页新建隧道，入口选中转机
2. 回到入站，点击入站 → **中转** → 选这条隧道

详见 [对接中转](./relay.md)。已有别处搭好的节点，可以用 [导入节点](./import.md)。

## 5. 订阅

**入站** 页 → **订阅** 标签 → 复制订阅链接，导入 Clash Verge、Mihomo、sing-box、Surge、v2rayN、Shadowrocket 等客户端即可，直连和中转线路都在里面。

::: tip 复制失败？
浏览器只在 HTTPS 页面里完全开放复制功能。建议给面板配置域名和 HTTPS，见 [安装部署 - 反向代理](./install.md#反向代理-可选)。
:::
