import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('./site/', import.meta.url));
const routes = new Map([
  ['/', 'index.html'], ['/tools', 'tools/index.html'], ['/tools/', 'tools/index.html'],
  ['/tools.html', 'tools/index.html'],
  ['/tools/background-remover', 'tools/background-remover/index.html'],
  ['/tools/background-remover/', 'tools/background-remover/index.html'],
  ['/tools/text-detector', 'tools/text-detector/index.html'],
  ['/tools/text-detector/', 'tools/text-detector/index.html'],
  ['/article', 'article.html'], ['/article/', 'article.html'],
  ['/info', 'info.html'], ['/info/', 'info.html']
]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const MAX_BODY_BYTES = 320 * 1024;
const countWords = value => (value.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu) || []).length;

function writeJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('body_too_large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('invalid_json'), { statusCode: 400 }); }
}

function upstreamCode(data) {
  if (typeof data.code === 'string') return data.code;
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data.detail?.error === 'string') return data.detail.error;
  if (Array.isArray(data.detail)) return 'invalid_input';
  return typeof data.error === 'string' ? data.error : 'detector_error';
}

// No configured origin means unavailable, never a heuristic or mock response.
export function createAppServer({
  detectorOrigin = process.env.TEXT_DETECTOR_API_ORIGIN || '',
  detectorApiKey = process.env.TEXT_DETECTOR_API_KEY || '',
  upstreamTimeoutMs = 120000
} = {}) {
  detectorOrigin = detectorOrigin.replace(/\/$/, '');
  if (detectorOrigin) {
    const url = new URL(detectorOrigin);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('TEXT_DETECTOR_API_ORIGIN must be an HTTPS origin (HTTP is allowed only for loopback development).');
    }
  }
  async function detectorRequest(pathname, req, res) {
    if (!detectorOrigin) return writeJson(res, 503, { ok: false, status: 'not_configured', code: 'service_not_configured', message: 'Coming soon: analysis hosting has not been configured.' });
    const headers = { accept: 'application/json', ...(detectorApiKey ? { 'x-api-key': detectorApiKey } : {}) };
    try {
      const isHealth = pathname === '/api/v1/text/health';
      let payload;
      if (!isHealth) {
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return writeJson(res, 415, { ok: false, code: 'invalid_content_type' });
        payload = await readJsonBody(req);
        if (!payload || typeof payload !== 'object' || typeof payload.text !== 'string') return writeJson(res, 422, { ok: false, code: 'invalid_input' });
        payload = { text: payload.text, mode: payload.mode ?? 'article' };
        if (!['article', 'prompt'].includes(payload.mode)) return writeJson(res, 422, { ok: false, code: 'invalid_mode' });
        const words = countWords(payload.text);
        if (payload.text.length > 50000 || words > 8000) return writeJson(res, 413, { ok: false, code: 'text_too_long' });
        if (words < (payload.mode === 'article' ? 80 : 60)) return writeJson(res, 422, { ok: false, code: 'text_too_short' });
      }
      const upstream = await fetch(`${detectorOrigin}${isHealth ? '/health' : '/v1/text/analyze'}`, {
        method: isHealth ? 'GET' : 'POST',
        headers: isHealth ? headers : { ...headers, 'content-type': 'application/json' },
        ...(isHealth ? {} : { body: JSON.stringify(payload) }),
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(upstreamTimeoutMs)
      });
      let data;
      try { data = await upstream.json(); } catch { return writeJson(res, 502, { ok: false, code: 'invalid_upstream_response' }); }
      if (!data || typeof data !== 'object') return writeJson(res, 502, { ok: false, code: 'invalid_upstream_response' });
      if (!upstream.ok) {
        const code = upstreamCode(data);
        const aliases = { inference_busy: 'rate_limited', model_unavailable: 'detector_not_ready', inference_unavailable: 'detector_not_ready' };
        const publicCodes = ['text_too_short', 'text_too_long', 'invalid_mode', 'invalid_input', 'rate_limited', 'detector_not_ready'];
        const mapped = aliases[code] || code;
        return writeJson(res, [413, 422, 429, 503].includes(upstream.status) ? upstream.status : 502,
          { ok: false, ...(isHealth ? { status: 'not_ready' } : {}), code: publicCodes.includes(mapped) ? mapped : 'detector_error' });
      }
      if (isHealth) return writeJson(res, data.status === 'ready' ? 200 : 503, { status: data.status === 'ready' ? 'ready' : 'not_ready', model: data.model });
      if (data.ok !== true || !data.result || data.coverage?.complete !== true || data.coverage.scored_words !== data.word_count || data.word_count !== countWords(payload.text)) {
        return writeJson(res, 502, { ok: false, code: 'invalid_upstream_response' });
      }
      return writeJson(res, 200, data);
    } catch (error) {
      const localCodes = ['body_too_large', 'invalid_json'];
      const code = localCodes.includes(error?.message) ? error.message : error?.name === 'TimeoutError' ? 'detector_timeout' : 'detector_unreachable';
      return writeJson(res, error?.statusCode || 502, { ok: false, code });
    }
  }
  return http.createServer(async (req, res) => {
    const pathname = req.url?.split('?')[0];
    if (pathname?.startsWith('/api/')) {
      if (req.method === 'POST' && pathname === '/api/v1/text/analyze') return detectorRequest(pathname, req, res);
      if (req.method === 'GET' && pathname === '/api/v1/text/health') return detectorRequest(pathname, req, res);
      return writeJson(res, 405, { ok: false, code: 'method_not_allowed' });
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, routes.get(pathname) || pathname.replace(/^\/+/, ''));
      if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
      const content = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '127.0.0.1';
  createAppServer().listen(port, host, () => console.log(`AFTERHOURS site server listening on ${host}:${port}`));
}
