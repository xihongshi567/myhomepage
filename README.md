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
$env:LLM_API_URL = "https://api.openai.com/v1/chat/completions"
$env:LLM_MODEL = "gpt-4o-mini"
node server.mjs
```

也可以参考 `.env.example`。`LLM_API_URL` 需要提供 OpenAI-compatible Chat Completions 接口；如果使用其他兼容平台，请替换 URL 和模型名。未配置或调用失败时，页面会自动回退到本地规则回复。

如果使用 npm：

```powershell
npm start
```

## 点赞数据

访客点赞后，数量会保存在 `data/likes.json`。同一浏览器会通过本地标记避免重复点赞；更换浏览器或清除站点数据后可以再次点赞。


## 部署到 Cloudflare Workers（免费）

完整步骤见 [DEPLOY.md](./DEPLOY.md)。简要流程：

```powershell
npm install -g wrangler
wrangler login
wrangler kv namespace create LIKES         # 把输出里的 id 填到 wrangler.toml
wrangler secret put LLM_API_KEY            # 粘贴你的 OpenAI / 中转服务 Key
wrangler deploy
```

部署后得到一个 `*.workers.dev` 临时域名，绑定自己的域名只需在 Cloudflare 仪表盘点几下。

线上版的所有接口（`/api/likes`、`/api/chat`、`/api/chat/status`）在 `worker/index.mjs` 里实现，点赞存 KV、聊天限流保护 Key。
