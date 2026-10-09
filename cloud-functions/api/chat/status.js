// GET /api/chat/status — whether the LLM_API_KEY secret is configured.
// The frontend uses this to show "真实大模型" vs "本地兜底" hints.

export function onRequestGet(context) {
  const env = context.env || {};
  return Response.json({ configured: Boolean(env.LLM_API_KEY) });
}
