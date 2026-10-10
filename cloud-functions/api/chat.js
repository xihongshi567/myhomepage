// POST /api/chat — rate-limited proxy to the upstream LLM (DeepSeek).
//
// Reuses the same logic that lived in the Cloudflare Worker: validate the
// message list, check the per-IP rate bucket, call the OpenAI-compatible
// endpoint, and fall back to local rule-based answers when the upstream fails.
//
// Environment variables (set in the Makers console, or locally via
// `edgeone makers link` + `edgeone makers env set ...`):
//   LLM_API_KEY   (secret, required for real replies)
//   LLM_API_URL   (default https://api.deepseek.com/v1/chat/completions)
//   LLM_MODEL     (default deepseek-chat)

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const buckets = new Map();

function checkRate(key, limit, windowMs) {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    const oldest = recent[0];
    return { allowed: false, resetMs: Math.max(0, windowMs - (now - oldest)) };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { allowed: true, resetMs: windowMs };
}

function fallbackAnswer(text) {
  const t = text.toLowerCase();
  if (/(联系|邮箱|邮件|微信|qq)/.test(t)) return '最靠谱的方式是邮箱：3432419466@qq.com，欢迎来信和何媛聊聊！';
  if (/(作品|项目|主页|做过什么)/.test(t)) return '何媛的作品都在主页的「作品集 · 知识图谱」里：模型微调（Kaggle）、写作 Agent、电商售后 Chatbot、情报收集 MCP 与 Agent 技术选型 Skill，还有 vibecoding 做的小工具们。她关注 AI 应用方向。';
  if (/(技能|擅长|能力|会什么|方向)/.test(t)) return '她最关心两个方向：AI 应用（让 AI 给生活赋能）和知识整理（把散落的信息变成能用的知识）。';
  if (/(身份|应届|届|秋招|学校|专业|求职|在做什么|最近)/.test(t)) return '何媛本科就读于成都理工大学（双一流），专业是大数据管理与应用，是 27 届应届生。';
  if (/(兴趣|爱好|喜欢|太极|阅读|旅行|看书)/.test(t)) return '她的兴趣一动一静：用 AI 给生活赋能、阅读、旅行，还有打太极。';
  if (/(你好|您好|hi|hello|在吗|是谁|介绍)/.test(t)) return '你好呀！我是何媛的数字分身。想了解她的作品、技能还是联系方式？直接问我就好。';
  return '这个问题我还在学习中。你可以尝试下面的快捷问题，或者发邮件到 3432419466@qq.com，直接和何媛本人交流。';
}

export async function onRequestPost(context) {
  const env = context.env || {};

  if (!env.LLM_API_KEY) {
    return Response.json({
      error: 'LLM_NOT_CONFIGURED',
      message: '服务端尚未配置 LLM_API_KEY，当前使用本地兜底回复。'
    }, { status: 503 });
  }

  const rate = checkRate(context.clientIp || 'unknown', RATE_LIMIT, RATE_WINDOW_MS);
  if (!rate.allowed) {
    return new Response(JSON.stringify({
      error: 'RATE_LIMITED',
      message: '请求太频繁，请稍后再试',
      retryAfterMs: rate.resetMs
    }), {
      status: 429,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'retry-after': String(Math.ceil(rate.resetMs / 1000))
      }
    });
  }

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400 }); }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length || messages.length > 20 || messages.some((m) =>
    !['user', 'assistant'].includes(m?.role)
    || typeof m.content !== 'string'
    || !m.content.trim()
    || m.content.length > 4000
  )) {
    return Response.json({ error: 'INVALID_MESSAGES' }, { status: 400 });
  }

  const systemPrompt = '你是何媛的数字分身。请用可爱、友好、简洁的中文回答，只回答与何媛本人、经历、技能、作品、兴趣或联系方式相关的问题。何媛就读于成都理工大学（双一流）本科，大数据管理与应用专业，是27届应届生，擅长AI应用与知识整理，兴趣包括用AI给生活赋能、阅读、旅行和打太极。邮箱是3432419466@qq.com，GitHub是https://github.com/xihongshi567，Gitee是https://gitee.com/he-xihongshi，代表作品是个人主页・数字分身。';

  const endpoint = env.LLM_API_URL || 'https://api.deepseek.com/v1/chat/completions';
  const model = env.LLM_MODEL || 'deepseek-chat';
  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.LLM_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.7
      }),
      signal: AbortSignal.timeout(20_000)
    });
    if (!upstream.ok) {
      return Response.json({ error: 'LLM_UPSTREAM_ERROR' }, { status: 502 });
    }
    const result = await upstream.json();
    const reply = result?.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) {
      return Response.json({ error: 'LLM_EMPTY_RESPONSE' }, { status: 502 });
    }
    return Response.json({ reply: reply.trim(), source: 'llm' });
  } catch {
    // Upstream failed: fall back to the local rule-based answer so the user
    // still gets a useful response instead of an error.
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const reply = fallbackAnswer(typeof lastUser?.content === 'string' ? lastUser.content : '');
    return Response.json({ reply, source: 'fallback' });
  }
}
