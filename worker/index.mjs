// Cloudflare Workers entry. Serves the static site and the /api/* endpoints
// (likes via KV, chat via the upstream LLM with rate limiting and secrets).

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Likes API: store count in Cloudflare KV.
    if (url.pathname === '/api/likes') {
      if (request.method === 'GET') {
        const raw = await env.LIKES.get('count');
        const count = raw ? Number.parseInt(raw, 10) : 0;
        return Response.json({ count: Number.isSafeInteger(count) && count >= 0 ? count : 0 });
      }
      if (request.method === 'POST') {
        const raw = await env.LIKES.get('count');
        const current = raw ? Number.parseInt(raw, 10) : 0;
        const next = (Number.isSafeInteger(current) && current >= 0 ? current : 0) + 1;
        await env.LIKES.put('count', String(next));
        return Response.json({ count: next });
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Chat status: presence of LLM_API_KEY secret.
    if (url.pathname === '/api/chat/status') {
      return Response.json({ configured: Boolean(env.LLM_API_KEY) });
    }

    // Chat API: rate-limited, proxied to the upstream LLM.
    if (url.pathname === '/api/chat') {
      return handleChat(request, env, ctx);
    }

    // Static files: build a Node-style IncomingMessage and let the existing
    // server handle it, then translate the response back to a Web Response.
    return serveStatic(request, env);
  }
};

// ------- Chat handler (rate-limited LLM proxy) -------

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const buckets = new Map();

function getClientKey(request) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || 'unknown';
}

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
  if (/(作品|项目|主页|做过什么)/.test(t)) return '何媛正在整理作品集，这个个人主页就是最新的一份：从设计到搭建独立完成。她关注 AI 应用方向。';
  if (/(技能|擅长|能力|会什么|方向)/.test(t)) return '她最关心两个方向：AI 应用（让 AI 给生活赋能）和知识整理（把散落的信息变成能用的知识）。';
  if (/(身份|应届|届|秋招|学校|专业|求职|在做什么|最近)/.test(t)) return '何媛本科就读于成都理工大学（双一流），专业是大数据管理与应用，是 27 届应届生。';
  if (/(兴趣|爱好|喜欢|太极|阅读|旅行|看书)/.test(t)) return '她的兴趣一动一静：用 AI 给生活赋能、阅读、旅行，还有打太极。';
  if (/(你好|您好|hi|hello|在吗|是谁|介绍)/.test(t)) return '你好呀！我是何媛的数字分身。想了解她的作品、技能还是联系方式？直接问我就好。';
  return '这个问题我还在学习中。你可以尝试下面的快捷问题，或者发邮件到 3432419466@qq.com，直接和何媛本人交流。';
}

async function handleChat(request, env) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }
  if (!env.LLM_API_KEY) {
    return Response.json({
      error: 'LLM_NOT_CONFIGURED',
      message: '服务端尚未配置 LLM_API_KEY，当前使用本地兜底回复。'
    }, { status: 503 });
  }

  const rate = checkRate(getClientKey(request), RATE_LIMIT, RATE_WINDOW_MS);
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
  try { body = await request.json(); }
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

  const endpoint = env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';
  const model = env.LLM_MODEL || 'gpt-4o-mini';
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
  } catch (err) {
    // Upstream failed: fall back to the local rule-based answer so the user
    // still gets a useful response instead of an error.
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const reply = fallbackAnswer(typeof lastUser?.content === 'string' ? lastUser.content : '');
    return Response.json({ reply, source: 'fallback' });
  }
}

// ------- Static file serving via Workers Assets -------

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const HOMEPAGE = '首页方案-1（可爱极简便当）.htm';

async function serveStatic(request, env) {
  const url = new URL(request.url);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '/index.html') pathname = '/' + HOMEPAGE;
  pathname = pathname.replace(/^\/+/, '');

  // env.ASSETS is provided by the [assets] section in wrangler.toml.
  const assetResponse = await env.ASSETS.fetch(new URL(pathname, url));
  if (assetResponse.ok) {
    const ext = pathname.slice(pathname.lastIndexOf('.')).toLowerCase();
    const ct = contentTypes[ext];
    if (ct) {
      const headers = new Headers(assetResponse.headers);
      headers.set('content-type', ct);
      headers.set('cache-control', 'no-cache');
      return new Response(assetResponse.body, { status: assetResponse.status, headers });
    }
    return assetResponse;
  }
  return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
