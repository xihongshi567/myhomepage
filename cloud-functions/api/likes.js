// GET/POST /api/likes — like counter backed by EdgeOne Blob storage.
//
// Blob is the Node.js runtime's persistent key-value store; the first call to
// getStore('likes') auto-creates a per-project namespace named "likes".
// Reads use strong consistency so a fresh like is visible immediately.

import { getStore } from '@edgeone/pages-blob';

const store = getStore('likes');
const KEY = 'count';

async function readCount(consistency) {
  const raw = await store.get(KEY, { type: 'text', consistency });
  const count = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

export async function onRequestGet() {
  // Eventual consistency is fine for display; strong would be a per-read cost.
  const count = await readCount('eventual');
  return Response.json({ count });
}

export async function onRequestPost() {
  // Read-modify-write: read the latest value (strong) before incrementing.
  const count = (await readCount('strong')) + 1;
  await store.set(KEY, String(count));
  return Response.json({ count });
}
