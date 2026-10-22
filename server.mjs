import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('./site/', import.meta.url));
const routes = new Map([['/', 'index.html'], ['/tools', 'tools.html'], ['/tools/', 'tools.html'], ['/article', 'article.html'], ['/article/', 'article.html'], ['/info', 'info.html'], ['/info/', 'info.html']]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
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
