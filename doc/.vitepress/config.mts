import { defineConfig } from "vitepress";

export default defineConfig({
  lang: "zh-CN",
  title: "FLVX",
  description: "转发 + 节点搭建面板",
  base: "/flvx/",
  cleanUrls: true,
  lastUpdated: true,
  head: [["link", { rel: "icon", type: "image/png", href: "/flvx/logo.png" }]],
  themeConfig: {
    logo: "/logo.png",
    nav: [
      { text: "指南", link: "/guide/getting-started" },
      { text: "下载", link: "https://github.com/kure29/flvx/releases" },
    ],
    sidebar: [
      {
        text: "开始",
        items: [
          { text: "快速上手", link: "/guide/getting-started" },
          { text: "安装部署", link: "/guide/install" },
          { text: "升级", link: "/guide/upgrade" },
        ],
      },
      {
        text: "节点",
        items: [
          { text: "搭建节点", link: "/guide/nodes" },
          { text: "对接中转", link: "/guide/relay" },
          { text: "导入节点", link: "/guide/import" },
        ],
      },
      {
        text: "更多",
        items: [
          { text: "流量转发与管理", link: "/guide/forward" },
          { text: "PostgreSQL", link: "/guide/postgresql" },
          { text: "通行证密钥登录", link: "/guide/passkey" },
          { text: "常见问题", link: "/guide/faq" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/kure29/flvx" }],
    search: { provider: "local" },
    outline: { level: [2, 3], label: "本页目录" },
    docFooter: { prev: "上一页", next: "下一页" },
    lastUpdated: { text: "最后更新" },
    returnToTopLabel: "回到顶部",
    sidebarMenuLabel: "菜单",
    darkModeSwitchLabel: "外观",
    footer: {
      message: "基于 GPLv3 发布 · 仅供学习研究使用",
    },
  },
});
