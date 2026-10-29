import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = path.join(repoRoot, 'site');
const toolsRoot = path.join(siteRoot, 'tools');
const outputRoot = path.join(repoRoot, 'public');
const basePath = (process.env.PAGES_BASE_PATH || '/After-hours').replace(/\/$/, '');
const siteUrl = (process.env.PAGES_SITE_URL || `https://ibrahimbinselimbd.github.io${basePath}`).replace(/\/$/, '');
const allowedAssetExtensions = new Set(['.css', '.js', '.mjs', '.json', '.webmanifest', '.ttf', '.otf', '.woff', '.woff2', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.wasm', '.mp3', '.wav', '.mp4']);
const ignoredTopLevelRoutes = new Set(['api', 'districts', 'article', 'info', 'robots.txt']);

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}

function referencedRootPaths(text) {
  const found = new Set();
  const quoted = /["'`]\/(?!\/)([^"'`\s?#)]+)(?=[?#"'`])/g;
  const unquotedCss = /\burl\(\s*\/(?!\/)([^)'"\s?#]+)/g;
  for (const match of text.matchAll(quoted)) found.add(match[1]);
  for (const match of text.matchAll(unquotedCss)) found.add(match[1]);
  return found;
}

async function copyReferencedAssets(sourceFiles) {
  const paths = new Set();
  for (const file of sourceFiles) {
    const ext = path.extname(file).toLowerCase();
    if (!['.html', '.js', '.mjs', '.css', '.json', '.webmanifest'].includes(ext)) continue;
    const text = await fs.readFile(file, 'utf8');
    for (const rootPath of referencedRootPaths(text)) {
      const clean = rootPath.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!clean || clean.startsWith('tools/')) continue;
      const first = clean.split('/')[0];
      if (ignoredTopLevelRoutes.has(first)) continue;
      if (!allowedAssetExtensions.has(path.extname(clean).toLowerCase())) continue;
      const source = path.resolve(siteRoot, clean);
      if (!source.startsWith(siteRoot + path.sep)) continue;
      try {
        const stat = await fs.stat(source);
        if (!stat.isFile()) continue;
        const target = path.join(outputRoot, clean);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(source, target);
        paths.add(clean);
      } catch {
        // A route may reference an optional browser feature that has no static asset.
      }
    }
  }
  return [...paths];
}

function applyProjectBase(text, filePath) {
  let result = text;
  const rootDirectories = new Set(['tools', 'media', 'assets', 'images', 'fonts', 'api', 'districts', 'article', 'info', 'favicon', 'css', 'js']);
  const isProjectPath = route => rootDirectories.has(route.split('/')[0].toLowerCase()) || /\.(?:css|js|mjs|json|webmanifest|ttf|otf|woff2?|png|jpe?g|webp|gif|svg|ico|wasm|mp3|wav|mp4)$/i.test(route);
  // Replace quoted root-relative paths (but not external URLs or relative paths).
  result = result.replace(/(["'`])\/(?!\/)([^"'`\s?#)]+)(?=[?#"'`])/g, (match, quote, route) => {
    const first = route.split('/')[0];
    if (first === 'After-hours' || first.startsWith('http') || !isProjectPath(route)) return match;
    return `${quote}${basePath}/${route}`;
  });
  // CSS commonly leaves root-relative URLs unquoted inside url(...).
  if (path.extname(filePath).toLowerCase() === '.css') {
    result = result.replace(/(\burl\(\s*)\/(?!\/)([^)'"\s?#]+)/g, (match, prefix, route) => isProjectPath(route) ? `${prefix}${basePath}/${route}` : match);
  }
  // The only exact-root navigation in the utility shell should stay inside this project site.
  result = result.replace(/href=(['"])\/(\1)/g, `href=$1${basePath}/$2`);
  result = result.replace(/href=(['"])\/#/g, `href=$1${basePath}/#`);
  result = result.replaceAll(`${basePath}/districts/`, `${basePath}/tools/`);
  result = result.replaceAll(`${basePath}/#feed`, `${basePath}/tools/#categories`);
  result = result.replace(/>The journal<\/a>/gi, '>Browse tools</a>');
  result = result.replace(/>The districts<\/a>/gi, '>Tools Hub</a>');
  return result;
}

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });
await fs.cp(toolsRoot, path.join(outputRoot, 'tools'), { recursive: true });
const sourceFiles = await walk(path.join(outputRoot, 'tools'));
const copiedAssets = await copyReferencedAssets(sourceFiles);

for (const file of await walk(outputRoot)) {
  const ext = path.extname(file).toLowerCase();
  if (!['.html', '.js', '.mjs', '.css', '.json', '.webmanifest'].includes(ext)) continue;
  let text = await fs.readFile(file, 'utf8');
  if (ext === '.html') {
    text = text.replace(/<meta\s+name=["']robots["']\s+content=["']noindex\s*,\s*nofollow["']\s*\/?>/i, '<meta name="robots" content="index,follow">');
    // The Journal taxonomy stays on the source branch and is deliberately absent from this Tools-only site.
    text = text.replace(/<a\s+href=["']\/districts\/["'][^>]*>\s*JOURNAL MAP\s*↗\s*<\/a>/i, '<a href="/tools/#categories">EXPLORE TOOLS ↗</a>');
    if (file.endsWith(path.join('heic-to-jpg', 'index.html'))) {
      const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; worker-src \'self\'; style-src \'self\'; font-src \'self\'; img-src \'self\' blob: data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">';
      text = text.replace(/<head([^>]*)>/i, `<head$1>${csp}<meta name="referrer" content="no-referrer">`);
    }
  }
  text = applyProjectBase(text, file);
  await fs.writeFile(file, text);
}

await fs.writeFile(path.join(outputRoot, '.nojekyll'), '');
await fs.writeFile(path.join(outputRoot, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><meta http-equiv="refresh" content="0;url=${basePath}/tools/"><title>AFTERHOURS Tools</title><link rel="canonical" href="${siteUrl}/tools/"></head><body><main><h1>AFTERHOURS Tools</h1><p><a href="${basePath}/tools/">Open the Tools Hub</a></p></main><script>location.replace(${JSON.stringify(`${basePath}/tools/`)});</script></body></html>`);
await fs.writeFile(path.join(outputRoot, 'tools.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><meta http-equiv="refresh" content="0;url=${basePath}/tools/"><title>AFTERHOURS Tools</title></head><body><p><a href="${basePath}/tools/">Open the Tools Hub</a></p><script>location.replace(${JSON.stringify(`${basePath}/tools/`)});</script></body></html>`);
await fs.writeFile(path.join(outputRoot, '404.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Page not found · AFTERHOURS Tools</title></head><body><main><h1>Page not found</h1><p><a href="${basePath}/tools/">Return to the AFTERHOURS Tools Hub</a></p></main></body></html>`);

const catalog = await fs.readFile(path.join(outputRoot, 'tools', 'catalog.js'), 'utf8');
const escapedBase = basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const routePattern = new RegExp(`\\{title:'[^']+',href:'(?:${escapedBase})?(\\/tools\\/[^']+)'`, 'g');
const routes = [...catalog.matchAll(routePattern)].map(match => match[1]).filter(route => route !== '/tools/text-detector/');
const urls = [`${siteUrl}/tools/`, ...new Set(routes.map(route => `${siteUrl}${route}`))];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${url.replace(/&/g, '&amp;')}</loc></url>`).join('\n')}\n</urlset>\n`;
await fs.writeFile(path.join(outputRoot, 'sitemap.xml'), sitemap);

console.log(`Built GitHub Pages artifact at ${outputRoot}`);
console.log(`Base path: ${basePath}; published tool routes: ${new Set(routes).size}; copied root assets: ${copiedAssets.length}`);
console.log('Only site/tools and referenced non-HTML assets are included; Journal pages are excluded.');
