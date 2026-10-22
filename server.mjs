import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('./site/', import.meta.url));
const routes = new Map([
  ['/', 'index.html'],
  ['/tools', 'tools/index.html'],
  ['/tools/', 'tools/index.html'],
  ['/tools.html', 'tools/index.html'],
  ['/tools/background-remover', 'tools/background-remover/index.html'],
  ['/tools/background-remover/', 'tools/background-remover/index.html'],
  ['/tools/text-detector', 'tools/text-detector/index.html'],
  ['/tools/text-detector/', 'tools/text-detector/index.html'],
  ['/article', 'article.html'],
  ['/article/', 'article.html'],
  ['/info', 'info.html'],
  ['/info/', 'info.html']
]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const detectorOrigin = (process.env.TEXT_DETECTOR_API_ORIGIN || '').replace(/\/$/, '');
const MAX_BODY_BYTES = 320 * 1024;

function writeJson(res, status, payload, extra = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra });
  res.end(body);
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('body_too_large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('invalid_json'), { statusCode: 400 }); }
}

async function detectorRequest(pathname, req, res) {
  if (!detectorOrigin) return writeJson(res, 503, { ok: false, code: 'service_not_configured', message: 'TEXT_DETECTOR_API_ORIGIN is not configured.' });
  const target = `${detectorOrigin}${pathname}`;
  try {
    if (pathname === '/api/v1/text/health') {
      const upstream = await fetch(`${detectorOrigin}/health`, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(5000) });
      const data = await upstream.json().catch(() => ({}));
      return writeJson(res, upstream.status, { status: upstream.ok ? 'ready' : 'offline', model: data.model });
    }
    const payload = await readJsonBody(req);
    const upstream = await fetch(target.replace('/api/v1/text/analyze', '/v1/text/analyze'), {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(120000)
    });
    const data = await upstream.json().catch(() => ({ ok: false, code: 'invalid_upstream_response' }));
    if (!upstream.ok && data.detail) {
      const detail = data.detail;
      const code = typeof detail === 'string' ? detail : 'detector_error';
      return writeJson(res, upstream.status === 422 ? 422 : upstream.status === 413 ? 413 : 502, { ok: false, code });
    }
    return writeJson(res, upstream.status, data);
  } catch (error) {
    const status = error?.statusCode || 502;
    const code = error?.name === 'TimeoutError' ? 'detector_timeout' : error?.message === 'body_too_large' ? 'body_too_large' : 'detector_unreachable';
    return writeJson(res, status, { ok: false, code, message: 'The analysis service could not be reached.' });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url?.split('?')[0] === '/api/v1/text/analyze') return detectorRequest('/api/v1/text/analyze', req, res);
  if (req.method === 'GET' && req.url?.split('?')[0] === '/api/v1/text/health') return detectorRequest('/api/v1/text/health', req, res);
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, routes.get(pathname) || pathname.replace(/^\/+/, ''));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});
const port = Number(process.env.PORT || 4173);
server.listen(port, '127.0.0.1', () => console.log(`AFTERHOURS local preview: http://127.0.0.1:${port}`));
