import { BASKETBALL_PATH, handleBasketballRequest } from './services/scores/basketball.mjs';
import { ensureThemeAssets } from './scripts/theme-assets.mjs';

const MAX_PASSPORT_IMAGE_BYTES = 15 * 1024 * 1024;

async function readBoundedBody(request, maxBytes) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function fetchPageAsset(request, env) {
  const asset = await env.ASSETS.fetch(request);
  if (request.method !== 'GET' || asset.status !== 200 || !/\btext\/html\b/i.test(asset.headers.get('content-type') || '')) return asset;

  const html = ensureThemeAssets(await asset.text());
  const headers = new Headers(asset.headers);
  for (const header of ['content-length', 'content-encoding', 'content-md5', 'etag']) headers.delete(header);
  return new Response(html, { status: asset.status, statusText: asset.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === BASKETBALL_PATH) return handleBasketballRequest(request, env);

    if (url.pathname === '/api/v1/passport-photo/background-remove') {
      const reply = (code, status, message) => new Response(JSON.stringify({ ok: false, code, message }), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
      if (request.method !== 'POST') return reply('method_not_allowed', 405, 'POST required');
      const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return reply('unsupported_image_type', 415, 'JPEG, PNG or WebP required');
      const declaredLength = Number(request.headers.get('content-length') || 0);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_PASSPORT_IMAGE_BYTES) return reply('image_too_large', 413, 'Image exceeds the size limit');

      const origin = String(env.PASSPORT_PHOTO_SERVICE_ORIGIN || '').replace(/\/+$/, '');
      const token = String(env.PASSPORT_PHOTO_SERVICE_TOKEN || '');
      if (!origin || token.length < 32) return reply('service_not_configured', 503, 'Self-hosted photo model is not configured');
      try {
        const target = new URL(origin);
        if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash || target.pathname !== '/') throw Error('bad origin');
        const body = await readBoundedBody(request, MAX_PASSPORT_IMAGE_BYTES);
        if (body === null) return reply('image_too_large', 413, 'Image exceeds the size limit');
        const upstream = await fetch(origin + '/v1/background-remove', { method: 'POST', headers: { 'content-type': type, accept: 'image/png', authorization: 'Bearer ' + token }, body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(120000) });
        return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate', pragma: 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } });
      } catch {
        return reply('model_unreachable', 502, 'Self-hosted photo model is not reachable');
      }
    }

    return fetchPageAsset(request, env);
  }
};
