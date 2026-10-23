# GitHub 登录（可选）

开启后，用户可以在个人资料页绑定自己的 GitHub 账号，之后在登录页点 **使用 GitHub 登录** 一键登录。面板用户仍由管理员创建：**没有绑定过的 GitHub 账号无法登录**，也不会自动注册新用户。密码登录默认仍然可用，也可以[禁止密码登录](#禁止密码登录)。

## 管理员：开启

1. 打开 GitHub → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**：
   - **Homepage URL**：面板网址，例如 `https://panel.example.com`
   - **Authorization callback URL**：面板网址的**根路径**，例如 `https://panel.example.com/`。填浏览器地址栏里访问面板的地址（前端地址），不是后端 API 地址；登录回到 `/`，绑定回到 `/profile`，都在这个地址下面
2. 创建后记下 **Client ID**，再点 **Generate a new client secret** 生成 **Client Secret**
3. 面板 **设置** → **安全与登录**：打开 **启用 GitHub 登录**，填入 Client ID 和 Client Secret，保存

Client Secret 只有管理员能看到，也不会写进 JSON 备份。

## 用户：绑定和登录

1. 先用密码登录，进入个人资料页（桌面端右上角“个人资料”，手机端底部“我的”）
2. 在 **GitHub 登录** 卡片输入当前密码，点 **绑定 GitHub 账号**，到 GitHub 页面授权后自动回到面板，显示已绑定的 GitHub 用户名
3. 以后在登录页点 **使用 GitHub 登录**，GitHub 授权后直接进入面板

- 一个面板用户只能绑定一个 GitHub 账号，一个 GitHub 账号也只能绑定一个面板用户
- 解绑同样在个人资料页，需要输入当前密码
- 账号被停用后，GitHub 登录也会被拒绝；删除用户时会一并删除绑定
- 面板只读取 GitHub 账号的 ID 和用户名，不申请任何仓库或邮箱权限

## 禁止密码登录

开启 GitHub 登录后，**设置** → **安全与登录** 里可以打开 **禁止密码登录**：登录页不再显示用户名和密码，只能用 GitHub 或通行证密钥登录，直接调用密码登录接口也会被拒绝。

- 打开前必须先在个人资料页绑定你自己的 GitHub 账号，否则保存会被拒绝，避免把自己锁在外面
- 没有绑定 GitHub 的用户将无法登录，打开前先让需要登录的用户都完成绑定
- 手机 App（WebView）里不能用 GitHub 登录，打开后 App 只能用通行证密钥登录
- 关闭 GitHub 登录，或者 Client ID / Secret 被清空时，密码登录会自动恢复
- 已禁止密码登录时不能解绑 GitHub；要解绑先关闭这个开关

GitHub 访问不了、OAuth App 配错等原因导致谁都登录不了时，在面板服务器上执行下面的命令，重新允许密码登录（无需重启面板）：

```bash
docker exec flux-panel-backend /app/paneld enable-password-login
```

不是用 Docker 部署时，在后端所在机器上，用和面板相同的环境变量（`DB_TYPE`、`DB_PATH` 或 `DATABASE_URL`）运行 `paneld enable-password-login`。

## 注意

- 手机 App（WebView）里不显示 GitHub 登录入口，请在浏览器里使用
- 面板换了域名时，要同步修改 OAuth App 的 callback URL，否则 GitHub 会提示 redirect_uri 不匹配
- 后端需要能访问 `github.com` 和 `api.github.com`；面板在访问不了 GitHub 的网络里时无法使用此功能
- 授权过程中的临时状态保存在后端内存里，有效期 10 分钟，后端重启后需要重新点一次
- 面板的 JSON 导出不包含 GitHub 绑定，用 JSON 导入迁移后，用户需要重新绑定
