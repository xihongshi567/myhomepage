# 部署到腾讯云 EdgeOne（免费）

把个人主页部署到腾讯云 EdgeOne Makers（边缘函数 + 静态托管），**月费用 0**，自带 HTTPS，国内访问速度快，绑定域名只需几分钟。

> 本项目原部署在 Cloudflare Workers 上，现已整体迁移到 EdgeOne：静态资源由 Makers 托管，
> `/api/likes`、`/api/chat`、`/api/chat/status` 三个接口由 `cloud-functions/` 里的 Node 云函数实现，
> 点赞数存在 Blob 存储（首次请求自动创建命名空间，无需手动开通）。

## 1. 准备

- 已有 [腾讯云账号](https://cloud.tencent.com/)（免费注册）。
- 安装 Node.js 20+（你已经有）。
- 准备好 OpenAI 兼容的 API Key（DeepSeek、OpenAI、中转服务都可以）。当前默认使用 DeepSeek。

## 2. 安装 edgeone CLI 并登录

```powershell
npm install -g edgeone
edgeone login --site china
```

`edgeone login` 会在浏览器弹窗让你授权腾讯云账号。登录后可以用 `edgeone whoami` 确认账号。

## 3. 本地预览

先启动本地服务看页面效果（不需要登录）：

```powershell
node server.mjs
```

浏览器打开 <http://127.0.0.1:4173/>。聊天功能因为没设 `LLM_API_KEY`，会走本地兜底问答库（不影响点赞和首页）。

要连函数一起联调（云函数 + 静态站都在 8088 端口）：

```powershell
edgeone makers dev
```

浏览器打开 <http://localhost:8088/>。首次使用前建议先关联项目（把控制台里配置的环境变量同步到本地）：

```powershell
edgeone makers link
```

## 4. 设置 API Key 密钥

在 [EdgeOne Pages 控制台](https://console.cloud.tencent.com/edgeone/pages) 打开你的项目 → **环境变量**：

| 变量名 | 值 | 说明 |
| --- | --- | --- |
| `LLM_API_KEY` | 你的 DeepSeek / OpenAI / 中转 Key | 必填，密钥不会进 Git |
| `LLM_API_URL` | `https://api.deepseek.com/v1/chat/completions` | 可选，默认就是这个 |
| `LLM_MODEL` | `deepseek-chat` | 可选，默认就是这个 |

也可以用 CLI 设置（需要先 `edgeone makers link`）：

```powershell
edgeone makers env set LLM_API_KEY 你的Key
edgeone makers env set LLM_API_URL https://api.deepseek.com/v1/chat/completions
edgeone makers env set LLM_MODEL deepseek-chat
```

不设 `LLM_API_URL` / `LLM_MODEL` 就用默认的 DeepSeek 端点 + deepseek-chat 模型（`cloud-functions/api/chat.js` 里有写）。

## 5. 部署上线

```powershell
edgeone makers deploy -n he-yuan-personal-homepage
```

或者双击根目录的 `部署.bat`。部署成功后会得到一个 `*.edgeone.app` 的临时域名，打开它能看到完整效果，包括聊天和点赞。

## 6. 绑定自己的域名

1. 在 [EdgeOne Pages 控制台](https://console.cloud.tencent.com/edgeone/pages) 打开你的项目。
2. 进入 **域名管理** → 添加你想绑定的域名（比如 `heyuan.com`）。
3. 按提示复制 CNAME 记录，到你的域名解析商（阿里云、腾讯云等）加一条 CNAME。
4. 等解析生效（几分钟到几小时），HTTPS 证书会自动配置。

> 域名托管在 Cloudflare 也能用：在 Cloudflare 里把原来的 CNAME 改成 EdgeOne 给出的值即可。

## 7. 后续更新

修改代码后重新部署：

```powershell
edgeone makers deploy -n he-yuan-personal-homepage
```

修改密钥：

```powershell
edgeone makers env set LLM_API_KEY 新Key
```

查看日志：EdgeOne 没有命令行看日志的工具，在 [控制台](https://console.cloud.tencent.com/edgeone/pages) 的项目里打开「日志分析」（或双击 `看日志.bat`）。

查看点赞数据：控制台 → **存储 → Blob**，命名空间 `likes` 里能看到 `count` 记录（首次有人点赞后才会自动创建）。

## 8. 关于数字分身

上线后聊天接口 `/api/chat` 已经在工作。要让你的数字分身越来越像你，可以：

- 改 `cloud-functions/api/chat.js` 里的 `systemPrompt` 字符串（人设描述）。
- 替换 `fallbackAnswer` 函数里的关键词-回复映射，覆盖更多高频问题。
- 等 Key 余额充足后，考虑接 RAG（把简历、博客、笔记向量化后让模型检索），在 `onRequestPost` 里加一步检索即可。

## 9. 常见问题

**Q: 部署后聊天一直走本地兜底？**
A: 检查控制台项目的环境变量里 `LLM_API_KEY` 是否设置成功（`edgeone makers env ls` 可看当前项目变量）。

**Q: 点赞数不增？**
A: 打开控制台日志分析看有没有报错，确认 Blob 命名空间 `likes` 已创建。点赞接口用的是 Blob 强一致性读，正常不会有缓存问题。

**Q: 想换国内访问更快的 Key？**
A: 用 `edgeone makers env set LLM_API_URL` 设置中转地址，Key 也用中转的。

**Q: 本地 `node server.mjs` 还能用吗？**
A: 继续用，本地开发模式不变。它和线上函数是两套独立实现（本地存 `data/likes.json`，线上存 Blob），互不影响。
