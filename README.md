# 何媛的个人主页

## 运行

Windows 下可以直接双击 `启动主页.bat`，页面会在浏览器中打开。

也可以在当前目录执行：

```powershell
node server.mjs
```

然后访问 <http://127.0.0.1:4173/>。

## 启用真实 LLM

当前不配置密钥时，聊天区会自动使用本地关键词兜底；这不是实时大模型。

要启用真实调用，请在启动服务器前设置服务端环境变量（密钥不会发到浏览器）：

```powershell
$env:LLM_API_KEY = "你的模型平台密钥"
$env:LLM_API_URL = "https://api.deepseek.com/v1/chat/completions"
$env:LLM_MODEL = "deepseek-chat"
node server.mjs
```

也可以参考 `.env.example`。`LLM_API_URL` 需要提供 OpenAI-compatible Chat Completions 接口；如果使用其他兼容平台，请替换 URL 和模型名。未配置或调用失败时，页面会自动回退到本地规则回复。

如果使用 npm：

```powershell
npm start
```

## 点赞数据

访客点赞后，数量会保存在 `data/likes.json`。同一浏览器会通过本地标记避免重复点赞；更换浏览器或清除站点数据后可以再次点赞。


## 部署到腾讯云 EdgeOne（免费）

完整步骤见 [DEPLOY.md](./DEPLOY.md)。简要流程：

```powershell
npm install -g edgeone
edgeone login --site china
edgeone makers deploy -n he-yuan-personal-homepage   # 或双击 部署.bat
```

部署后得到一个 `*.edgeone.app` 临时域名；`LLM_API_KEY` 等环境变量在控制台项目的「环境变量」里配置，绑定域名也在控制台里完成。

线上版的所有接口（`/api/likes`、`/api/chat`、`/api/chat/status`）在 `cloud-functions/api/` 里实现（Node 云函数），点赞数存在 Blob 存储（首次请求自动创建命名空间）、聊天限流保护 Key。
