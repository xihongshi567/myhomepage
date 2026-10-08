import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const homepageFile = '首页方案-1（可爱极简便当）.htm';
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
const systemPrompt = '你是何媛的数字分身。请用可爱、友好、简洁的中文回答，只回答与何媛本人、经历、技能、作品、兴趣或联系方式相关的问题。何媛就读于成都理工大学（双一流）本科，大数据管理与应用专业，是27届应届生，擅长AI应用与知识整理，兴趣包括用AI给生活赋能、阅读、旅行和打太极。邮箱是3432419466@qq.com，GitHub是https://github.com/xihongshi567，Gitee是https://gitee.com/he-xihongshi，代表作品是个人主页×数字分身。';

function getSafePath(rootDir, requestPath) {
  const decodedPath = decodeURIComponent(requestPath.split('?')[0]);
  const requestedFile = decodedPath === '/' || decodedPath === '/index.html'
    ? homepageFile
    : decodedPath.replace(/^[/\\]+/, '');
  const filePath = resolve(rootDir, normalize(requestedFile));
  return filePath.startsWith(resolve(rootDir)) ? filePath : null;
}

function writeJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(body);
}

function readRequestBody(request) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64000) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => resolveBody(body));
    request.on('error', reject);
  });
}

function readLikesCount(likesFile) {
  if (!existsSync(likesFile)) return 0;
  try {
    const payload = JSON.parse(readFileSync(likesFile, 'utf8'));
    return Number.isSafeInteger(payload.count) && payload.count >= 0 ? payload.count : 0;
  } catch {
    return 0;
  }
}

function saveLikesCount(likesFile, count) {
  mkdirSync(dirname(likesFile), { recursive: true });
  const tempFile = `${likesFile}.tmp`;
  writeFileSync(tempFile, `${JSON.stringify({ count })}\n`, 'utf8');
  renameSync(tempFile, likesFile);
}

// Rate limit: at most N requests per IP inside a sliding window. Fail-open on errors.
const chatRateBuckets = new Map();
function getRateLimit() { return Number(process.env.CHAT_RATE_LIMIT || 5); }
function getRateWindowMs() { return Number(process.env.CHAT_RATE_WINDOW_MS || 60_000); }

function getClientKey(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return request.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(key, limit, windowMs) {
  if (!Number.isFinite(limit) || limit <= 0) return { allowed: true, remaining: limit, resetMs: 0 };
  const now = Date.now();
  const bucket = chatRateBuckets.get(key) || [];
  const recent = bucket.filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) {
    const oldest = recent[0];
    return { allowed: false, remaining: 0, resetMs: Math.max(0, windowMs - (now - oldest)) };
  }
  recent.push(now);
  chatRateBuckets.set(key, recent);
  return { allowed: true, remaining: limit - recent.length, resetMs: windowMs };
}

async function handleChat(request, response, fetchImpl) {
  if (request.method !== 'POST') {
    writeJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    writeJson(response, 503, {
      error: 'LLM_NOT_CONFIGURED',
      message: '服务端尚未配置 LLM_API_KEY，当前使用本地兜底回复。'
    });
    return;
  }

  const rateKey = getClientKey(request);
  const rate = checkRateLimit(rateKey, getRateLimit(), getRateWindowMs());
  if (!rate.allowed) {
    const retryAfterSec = Math.ceil(rate.resetMs / 1000);
    if (typeof response.setHeader === 'function') response.setHeader('Retry-After', retryAfterSec);
    writeJson(response, 429, {
      error: 'RATE_LIMITED',
      message: '请求太频繁，请稍后再试',
      retryAfterMs: rate.resetMs
    });
    return;
  }

  let input;
  try {
    input = JSON.parse(await readRequestBody(request));
  } catch {
    writeJson(response, 400, { error: 'INVALID_JSON' });
    return;
  }

  const messages = Array.isArray(input.messages) ? input.messages : [];
  if (!messages.length || messages.length > 20 || messages.some((message) => {
    return !['user', 'assistant'].includes(message?.role)
      || typeof message.content !== 'string'
      || !message.content.trim()
      || message.content.length > 4000;
  })) {
    writeJson(response, 400, { error: 'INVALID_MESSAGES' });
    return;
  }

  const endpoint = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  try {
    const upstream = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.7
      }),
      signal: AbortSignal.timeout(20000)
    });
    if (!upstream.ok) {
      writeJson(response, 502, { error: 'LLM_UPSTREAM_ERROR' });
      return;
    }
    const result = await upstream.json();
    const reply = result?.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) {
      writeJson(response, 502, { error: 'LLM_EMPTY_RESPONSE' });
      return;
    }
    writeJson(response, 200, { reply: reply.trim(), source: 'llm' });
  } catch {
    writeJson(response, 502, { error: 'LLM_UNAVAILABLE' });
  }
}

export function createStaticServer(rootDir = projectRoot, options = {}) {
  const absoluteRoot = resolve(rootDir);
  const fetchImpl = options.fetchImpl || fetch;
  const likesFile = resolve(options.likesFile || join(absoluteRoot, 'data', 'likes.json'));
  let likesCount = readLikesCount(likesFile);

  return createServer((request, response) => {
    const pathname = (request.url || '').split('?')[0];
    if (pathname === '/api/likes') {
      if (request.method === 'GET') {
        writeJson(response, 200, { count: likesCount });
        return;
      }
      if (request.method === 'POST') {
        try {
          likesCount += 1;
          saveLikesCount(likesFile, likesCount);
          writeJson(response, 200, { count: likesCount });
        } catch {
          likesCount -= 1;
          writeJson(response, 500, { error: 'LIKE_SAVE_FAILED' });
        }
        return;
      }
      writeJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
      return;
    }
    if (pathname === '/api/chat/status') {
      writeJson(response, 200, { configured: Boolean(process.env.LLM_API_KEY) });
      return;
    }
    if (pathname === '/api/chat') {
      void handleChat(request, response, fetchImpl);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method Not Allowed');
      return;
    }

    let filePath;
    try {
      filePath = getSafePath(absoluteRoot, request.url || '/');
    } catch {
      response.writeHead(400);
      response.end('Bad Request');
      return;
    }

    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not Found');
      return;
    }

    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream'
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  createStaticServer().listen(port, '127.0.0.1', () => {
    console.log(`何媛的个人主页运行于 http://127.0.0.1:${port}`);
  });
}
