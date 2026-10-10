import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createStaticServer } from './server.mjs';

test('serves the homepage and image asset from the project root', async () => {
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /何媛的小角落/);
    assert.doesNotMatch(html, /嗨，见到你真好/);
    assert.match(html, /把好奇心变成一点点有用的东西。/);
    assert.match(html, /教育背景/);
    assert.match(html, /成都理工大学（双一流）/);
    assert.match(html, /本科 · 大数据管理与应用/);
    assert.doesNotMatch(html, /大数据管理与应用专业 · 27 届应届生/);
    assert.match(html, /成都理工大学\s*<span class="sig-edu-badge">双一流<\/span>/);
    assert.match(html, /\.sig-edu-badge\s*\{/);
    assert.match(html, /\.sig-school-line\s*\{[\s\S]*?white-space:\s*nowrap;/);
    assert.doesNotMatch(html, /最近在忙/);
    assert.match(html, /实习经历/);
    assert.match(html, /四川爱迪沛霖数据信息技术有限公司/);
    assert.match(html, /AI 应用实习生/);
    assert.match(html, /深圳乐木骆科技有限公司/);
    assert.match(html, /AI 数据实习生/);
    assert.match(html, /class="sig-experience-points/);
    assert.match(html, /\.sig-experience-points\s*\{/);
    assert.match(html, /\.sig-experience-item\s*\{/);
    assert.doesNotMatch(html, /正在探索/);
    assert.match(html, /href="#chat"/);
    const portfolioIndex = html.indexOf('知识图谱');
    const experienceIndex = html.indexOf('实习经历');
    const leisureIndex = html.indexOf('闲下来会做的事');
    assert.ok(portfolioIndex >= 0);
    assert.ok(experienceIndex >= 0);
    assert.ok(portfolioIndex < experienceIndex);
    assert.ok(portfolioIndex < leisureIndex);
    assert.match(html, /id="wf-wrap"/);
    assert.match(html, /id="wf-svg"/);
    assert.match(html, /d3@7\.9\.0\/\+esm/);
    assert.match(html, /novel-ai-agent-v2/);
    assert.match(html, /modou-tools-mcp/);
    assert.match(html, /agent-skill/);
    assert.match(html, /tomotobot/);
    assert.match(html, /modelscope\.cn\/profile\/lelexihongshi/);
    assert.doesNotMatch(html, /@font-face|QianTuXiaoTu|ResourceHanRoundedCN|resource-static\.bj\.bcebos\.com/);
    assert.match(html, /\.sig-display\s*\{\s*font-family:\s*inherit;/);
    assert.doesNotMatch(html, /#FFB84C|#FFF1D9|#8A5A17/);
    assert.doesNotMatch(html, /#D6393E|#A8262B/);
    assert.match(html, /--sig-tomato:\s*#DFA3AA/);
    assert.match(html, /--sig-lilac:\s*#F3F0FB/);
    assert.match(html, /\.sig-room-card::after/);
    assert.match(html, /\.sig-avatar-wrap::after/);
    assert.match(html, /\.sig-chat-card::before/);
    assert.match(html, /class="sig-avatar-wrap/);
    assert.match(html, /id="chat" class="sig-chat-card/);
    assert.match(html, /class="sig-gitee-mark/);
    assert.doesNotMatch(html, />GIT<\/span>/);
    assert.match(html, /id="like-button"/);
    assert.match(html, /id="like-count"/);
    assert.match(html, /fetch\('\/api\/likes'/);
    assert.match(html, /#bento\s*>\s*:nth-child\(3\)/);
    assert.match(html, /@media\s*\(max-width:\s*767px\)/);
    assert.match(html, /#bento\s*>\s*:nth-child\(5\)\s*\{\s*order:\s*2;/);
    assert.match(html, /id="pet-button"/);
    assert.match(html, /class="sig-pixel-robot/);
    assert.match(html, /id="chat-close"/);
    assert.match(html, /id="chat-backdrop"/);
    assert.match(html, /\.sig-chat-card\.is-mobile-open/);
    assert.match(html, /\.sig-pet-note\s*\{[\s\S]*?right:\s*0;[\s\S]*?bottom:\s*76px;/);
    assert.match(html, /body\.sig-chat-open\s+main\s*\{\s*z-index:\s*auto;/);
    assert.match(html, /function openMobileChat\(\)/);
    assert.doesNotMatch(html, /id="chat" class="[^"]*order-last/);

    const image = await fetch(`http://127.0.0.1:${port}/屏幕截图2026.10.07.png`);
    assert.equal(image.status, 200);
    assert.match(image.headers.get('content-type'), /^image\/png/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('proxies chat requests through the server-side LLM configuration', async () => {
  const previousKey = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = 'test-secret';
  let upstreamRequest;
  const server = createStaticServer(undefined, {
    fetchImpl: async (url, options) => {
      upstreamRequest = { url, options };
      return new Response(JSON.stringify({ choices: [{ message: { content: '真实模型回复' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '你有哪些作品？' }] })
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.reply, '真实模型回复');
    assert.equal(upstreamRequest.options.headers.authorization, 'Bearer test-secret');
    assert.match(JSON.parse(upstreamRequest.options.body).messages[0].content, /成都理工大学（双一流）本科，大数据管理与应用专业/);
    assert.equal(JSON.stringify(payload).includes('test-secret'), false);
  } finally {
    if (previousKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previousKey;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('reports missing LLM configuration without calling an upstream service', async () => {
  const previousKey = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  const server = createStaticServer(undefined, {
    fetchImpl: async () => { throw new Error('upstream should not be called'); }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '你好' }] })
    });
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.error, 'LLM_NOT_CONFIGURED');
  } finally {
    if (previousKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previousKey;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('exposes whether real LLM chat is configured', async () => {
  const previousKey = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const unconfigured = await fetch(`http://127.0.0.1:${port}/api/chat/status`);
    assert.deepEqual(await unconfigured.json(), { configured: false });

    process.env.LLM_API_KEY = 'test-secret';
    const configured = await fetch(`http://127.0.0.1:${port}/api/chat/status`);
    assert.deepEqual(await configured.json(), { configured: true });
  } finally {
    if (previousKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previousKey;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('stores likes and restores the count after a server restart', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'homepage-likes-'));
  const likesFile = join(tempDir, 'likes.json');
  let server = createStaticServer(undefined, { likesFile });
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    let port = server.address().port;
    const initial = await fetch(`http://127.0.0.1:${port}/api/likes`);
    assert.deepEqual(await initial.json(), { count: 0 });

    const liked = await fetch(`http://127.0.0.1:${port}/api/likes`, { method: 'POST' });
    assert.deepEqual(await liked.json(), { count: 1 });
    assert.deepEqual(JSON.parse(await readFile(likesFile, 'utf8')), { count: 1 });

    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    server = createStaticServer(undefined, { likesFile });
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;

    const restored = await fetch(`http://127.0.0.1:${port}/api/likes`);
    assert.deepEqual(await restored.json(), { count: 1 });
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('enforces the IP rate limit on /api/chat', async () => {
  const previousKey = process.env.LLM_API_KEY;
  const previousLimit = process.env.CHAT_RATE_LIMIT;
  process.env.LLM_API_KEY = 'test-secret';
  process.env.CHAT_RATE_LIMIT = '3';
  const { createStaticServer } = await import('./server.mjs');
  const server = createStaticServer(undefined, {
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const post = () => fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
  });

  try {
    const r1 = await post();
    const r2 = await post();
    const r3 = await post();
    const r4 = await post();
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 200);
    assert.equal(r4.status, 429);
    const body4 = await r4.json();
    assert.equal(body4.error, 'RATE_LIMITED');
    assert.ok(body4.retryAfterMs > 0);
    assert.equal(r4.headers.get('retry-after'), String(Math.ceil(body4.retryAfterMs / 1000)));
  } finally {
    if (previousKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previousKey;
    if (previousLimit === undefined) delete process.env.CHAT_RATE_LIMIT;
    else process.env.CHAT_RATE_LIMIT = previousLimit;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('does not count rate-limited requests toward later successful calls', async () => {
  const previousKey = process.env.LLM_API_KEY;
  const previousLimit = process.env.CHAT_RATE_LIMIT;
  const previousWindow = process.env.CHAT_RATE_WINDOW_MS;
  process.env.LLM_API_KEY = 'test-secret';
  process.env.CHAT_RATE_LIMIT = '2';
  process.env.CHAT_RATE_WINDOW_MS = '50';
  const { createStaticServer } = await import('./server.mjs');
  const server = createStaticServer(undefined, {
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const post = () => fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.8' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
  });

  try {
    await post();
    await post();
    const blocked = await post();
    assert.equal(blocked.status, 429);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const recovered = await post();
    assert.equal(recovered.status, 200);
  } finally {
    if (previousKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previousKey;
    if (previousLimit === undefined) delete process.env.CHAT_RATE_LIMIT;
    else process.env.CHAT_RATE_LIMIT = previousLimit;
    if (previousWindow === undefined) delete process.env.CHAT_RATE_WINDOW_MS;
    else process.env.CHAT_RATE_WINDOW_MS = previousWindow;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

