# 订阅模板

想让订阅按自己的规则、策略组和 DNS 来，可以用 **订阅模板**：把自己的 Mihomo、sing-box 或 Surge 配置当骨架，面板只负责把订阅里的节点放进去，其余内容原样下发。网上现成的模板大多可以直接用，不需要再套一层 subconverter。

## 添加模板

**订阅** 页右上角点 **模板** → **新建模板**：

- **格式**：Mihomo、sing-box 或 Surge，一个模板只对应一种格式
- **内容**：
  - **粘贴**：直接粘贴配置，可以随时修改。节点列表留空即可（`proxies: []`），面板会填进去
  - **从网址获取**：填模板地址（例如 GitHub 上的 raw 链接），面板每天下载一次，下载失败继续用上次的内容。网址模板不能直接改，点 **复制为本地模板** 得到一份可编辑的副本
- **插入分组**：点 🇭🇰 香港、🇯🇵 日本等按钮，在合适的位置插入一个按地区自动收节点的测速组；记得在“节点选择”之类的组里引用它
- **用示例开始**：内容为空时可以用一份最小的示例起步
- **检查**：检查格式，并用某个订阅的节点预演每个策略组能收到哪些节点；没有节点的组标为“空组”

## 节点怎么进策略组

按各客户端**本来就支持**的写法，模板里写好，面板不改：

| 格式 | 写法 | 说明 |
|------|------|------|
| Mihomo | `include-all: true`，可加 `filter: "(?i)港\|HK"`、`exclude-filter` | 客户端自己按 filter 收节点；多个表达式用 `` ` `` 分隔 |
| sing-box | `"outbounds": ["{all}"]`，可加 `"filter": [{"action": "include", "keywords": ["港\|HK"]}]` | 面板把 `{all}` 换成符合 filter 的节点名（sing-box-subscribe 的写法）；`action` 为 `exclude` 时排除；组里一个节点都没有时换成 `direct`，避免 sing-box 报错 |
| Surge | `include-all-proxies=1`，可加 `policy-regex-filter=港\|HK` | 客户端自己按正则收节点 |

例如 Mihomo：

```yaml
proxies: [] # 面板填入订阅里的节点
proxy-groups:
  - name: 🚀 节点选择
    type: select
    proxies: [🇭🇰 香港, DIRECT]
  - name: 🇭🇰 香港
    type: url-test
    include-all: true
    filter: "(?i)港|HK|Hong Kong"
rules:
  - GEOIP,CN,DIRECT
  - MATCH,🚀 节点选择
```

面板在生成配置时：

- Mihomo：只替换 `proxies` 这一段，模板的其余文字（包括注释和顺序）原样保留
- sing-box：节点加在 `outbounds` 末尾，WireGuard 节点放进 `endpoints`
- Surge：节点写在 `[Proxy]` 段原有内容之后；没有 `[Proxy]` 段时自动加上
- 开了 [链式代理](./subscription-rules.md#链式代理) 时，自动加上“落地节点”“中转节点”两个组
- 节点名和模板里的组名重复时，节点名后面加 `#2`

## 在订阅里使用

编辑订阅 → **规则** → **订阅模板**，Mihomo、sing-box、Surge 各选一个模板：

- 选了模板的客户端拿到按模板生成的配置，下面的 **内置分组与规则** 对它不生效
- 没选模板的客户端照旧用内置规则；Stash、Shadowrocket、Loon、Quantumult X 暂不支持模板
- 筛选、改名、加国旗、去重和脚本照常先执行，处理后的节点才放进模板
- **预览** 页的 **模板策略组** 里能看到每个组收到了哪些节点

有订阅在用的模板不能删除，也不能改格式；先在订阅里换掉。备份会包含模板。
