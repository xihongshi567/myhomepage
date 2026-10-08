# 部署到 Cloudflare Workers

把个人主页免费部署到 Cloudflare 边缘网络，**月费用 0**，自带 HTTPS，绑定域名只需几分钟。

## 1. 准备

- 已有 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)（免费）。
- 安装 Node.js 20+（你已经有）。
- 准备好 [OpenAI 兼容](https://platform.openai.com/api-keys) 的 API Key（或国内中转服务提供的 Key）。

## 2. 安装 wrangler

```powershell
npm install -g wrangler
wrangler login
```

`wrangler login` 会在浏览器弹窗让你授权 Cloudflare 账号。

## 3. 创建 KV 命名空间（用来存点赞数）

```powershell
wrangler kv namespace create LIKES
```

复制命令输出里的 `id = "xxxxxxxxxxxxxxxxxxxxxxxxxx"`，打开 `wrangler.toml`，把里面 `id = "REPLACE_ME_AFTER_KV_CREATE"` 替换成这个值。

## 4. 设置 API Key 密钥

```powershell
wrangler secret put LLM_API_KEY
```

回车后粘贴你的 OpenAI（或中转服务）API Key，Ctrl+Z + 回车保存。Key 会被加密存到 Cloudflare 仪表盘，**不会进 Git**。

可选：自定义端点和模型

```powershell
wrangler secret put LLM_API_URL    # 比如 https://your-relay.example.com/v1/chat/completions
wrangler secret put LLM_MODEL      # 比如 gpt-4o-mini
```

不设就用默认的 OpenAI 官方端点 + gpt-4o-mini。

## 5. 本地预览

```powershell
wrangler dev
```

浏览器打开 `http://127.0.0.1:8787` 看看效果。聊天功能因为没设 `LLM_API_KEY`，会走本地兜底问答库（不影响点赞和首页）。

## 6. 部署上线

```powershell
wrangler deploy
```

部署成功后会得到一个 `*.workers.dev` 的临时域名，比如 `he-yuan-personal-homepage.你的子域名.workers.dev`。打开它，能看到完整效果，包括聊天和点赞。

## 7. 绑定自己的域名

1. 在 Cloudflare 仪表盘选 **Workers & Pages** → 你的项目 → **Settings** → **Triggers** → **Custom Domains**。
2. 添加你想绑定的域名（比如 `heyuan.com` 或 `heyuan.pages.dev`）。
3. 如果域名已经在 Cloudflare 托管，**点一下就生效**，1 分钟内 HTTPS 自动配置好。
4. 如果域名在别处（阿里云、腾讯云等），把 Cloudflare 给出的 CNAME 记录加到你域名解析里。

## 8. 后续更新

修改代码后重新部署：

```powershell
wrangler deploy
```

修改密钥：

```powershell
wrangler secret put LLM_API_KEY
```

查看实时日志：

```powershell
wrangler tail
```

## 9. 关于数字分身

上线后聊天接口 `/api/chat` 已经在工作。要让你的数字分身越来越像你，可以：

- 改 `worker/index.mjs` 里的 `systemPrompt` 字符串（人设描述）。
- 替换 `fallbackAnswer` 函数里的关键词-回复映射，覆盖更多高频问题。
- 等 Key 余额充足后，考虑接 RAG（把简历、博客、笔记向量化后让模型检索），文件结构不用动，只在 `handleChat` 里加一步 `env.VECTOR_INDEX.query(...)`。

## 10. 常见问题

**Q: 部署后聊天一直走本地兜底？**
A: 检查 `wrangler secret list` 看看 `LLM_API_KEY` 是否设置成功。

**Q: 点赞数不增？**
A: 打开 `wrangler tail` 看日志，确认 KV 命名空间 `id` 已经填好。

**Q: 想换国内访问更快的 Key？**
A: 用 `wrangler secret put LLM_API_URL` 设置中转地址，Key 也用中转的。

**Q: 旧文件 `index.html`、`首页方案-1（可爱极简便当）.htm` 在根目录还能用吗？**
A: 本地开发（`node server.mjs`）继续用根目录那份。线上 `wrangler deploy` 只会把 `public/` 里的资源上传上去，根目录文件不会暴露，安全。
