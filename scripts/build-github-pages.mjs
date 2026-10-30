import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = path.join(repoRoot, 'site');
const toolsRoot = path.join(siteRoot, 'tools');
const outputRoot = path.join(repoRoot, 'public');
const basePath = (process.env.PAGES_BASE_PATH || '/After-hours').replace(/\/$/, '');
const siteUrl = (process.env.PAGES_SITE_URL || `https://ibrahimbinselimbd.github.io${basePath}`).replace(/\/$/, '');
const workerOrigin = 'https://afterhours-district.bird-timimus.workers.dev';
const ignoredSourceFiles = new Set(['_headers', '_redirects', 'sitemap.xml']);
const rootDirectories = new Set([
  'tools', 'media', 'assets', 'images', 'fonts', 'api', 'districts', 'article', 'info',
  'favicon', 'css', 'js',
]);
const allowedAssetExtensions = /\.(?:css|js|mjs|json|webmanifest|ttf|otf|woff2?|png|jpe?g|webp|gif|svg|ico|wasm|mp3|wav|mp4)$/i;
const infoPages = ['about', 'privacy', 'disclaimer', 'advertising', 'terms', 'cookies', 'editorial', 'contact'];

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

function mapStaticRoute(route) {
  const clean = route.replace(/\\/g, '/');
  const withoutTrailingSlash = clean.replace(/\/+$/, '');
  if (withoutTrailingSlash === 'article') return 'article.html';
  if (withoutTrailingSlash === 'info') return 'info.html';
  return clean;
}

function isProjectPath(route) {
  const mapped = mapStaticRoute(route);
  const first = route.replace(/^\/+/, '').split('/')[0].replace(/\/+$/, '').toLowerCase();
  return rootDirectories.has(first) || allowedAssetExtensions.test(mapped);
}

function applyProjectBase(text, filePath) {
  let result = text;
  const quotedRootPath = /(["'`])\/(?!\/)([^"'`\s?#)]+)(?=[?#"'`])/g;
  result = result.replace(quotedRootPath, (match, quote, route) => {
    const first = route.split('/')[0];
    if (first === 'After-hours' || first.startsWith('http') || !isProjectPath(route)) return match;
    return `${quote}${basePath}/${mapStaticRoute(route)}`;
  });

  if (path.extname(filePath).toLowerCase() === '.css') {
    result = result.replace(/(\burl\(\s*)\/(?!\/)([^)'"\s?#]+)/g, (match, prefix, route) =>
      isProjectPath(route) ? `${prefix}${basePath}/${mapStaticRoute(route)}` : match);
  }

  result = result.replace(/href=(['"])\/\1/g, (_, quote) => `href=${quote}${basePath}/${quote}`);
  result = result.replace(/href=(['"])\/#/g, `href=$1${basePath}/#`);
  return result;
}

function upsertCanonical(html, href) {
  const tag = `<link rel="canonical" href="${href}">`;
  if (/<link\s+rel=["']canonical["'][^>]*>/i.test(html)) {
    return html.replace(/<link\s+rel=["']canonical["'][^>]*>/i, tag);
  }
  return html.replace(/<\/head>/i, `${tag}</head>`);
}

function addPageCanonical(html, relativePath, storyIds) {
  if (relativePath === 'index.html') return upsertCanonical(html, `${siteUrl}/`);

  if (relativePath === 'article.html') {
    const initialStory = storyIds[0] || '';
    html = upsertCanonical(html, `${siteUrl}/article.html?story=${encodeURIComponent(initialStory)}`);
    const script = `<script>(()=>{const ids=${JSON.stringify(storyIds)};const requested=new URLSearchParams(location.search).get('story');const id=ids.includes(requested)?requested:(ids[0]||'');const link=document.querySelector('link[rel="canonical"]');if(link&&id)link.href=${JSON.stringify(`${siteUrl}/article.html?story=`)}+encodeURIComponent(id)})()</script>`;
    return html.replace(/<\/body>/i, `${script}</body>`);
  }

  if (relativePath === 'info.html') {
    html = upsertCanonical(html, `${siteUrl}/info.html?page=about`);
    const script = `<script>(()=>{const pages=${JSON.stringify(infoPages)};const requested=new URLSearchParams(location.search).get('page');const page=pages.includes(requested)?requested:'about';const link=document.querySelector('link[rel="canonical"]');if(link)link.href=${JSON.stringify(`${siteUrl}/info.html?page=`)}+encodeURIComponent(page)})()</script>`;
    return html.replace(/<\/body>/i, `${script}</body>`);
  }

  return html;
}

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });
await fs.cp(siteRoot, outputRoot, {
  recursive: true,
  filter(source) {
    const relative = path.relative(siteRoot, source).replace(/\\/g, '/');
    return relative === '' || !ignoredSourceFiles.has(relative);
  },
});

const storySource = await fs.readFile(path.join(outputRoot, 'content.js'), 'utf8');
const storyMatch = storySource.match(/^window\.STORIES\s*=\s*([\s\S]*);\s*$/);
if (!storyMatch) throw new Error('Could not read the English Journal story index for route generation.');
const stories = JSON.parse(storyMatch[1]);
const storyIds = stories.map(story => story.id).filter(Boolean);
if (!storyIds.length || new Set(storyIds).size !== storyIds.length) {
  throw new Error('The English Journal story index is empty or contains duplicate IDs.');
}

for (const file of await walk(outputRoot)) {
  const ext = path.extname(file).toLowerCase();
  if (!['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.txt', '.xml'].includes(ext)) continue;
  const relativePath = path.relative(outputRoot, file).replace(/\\/g, '/');
  let text = await fs.readFile(file, 'utf8');

  if (ext === '.html') {
    const isDetector = relativePath.startsWith('tools/text-detector/');
    const isToolPage = relativePath.startsWith('tools/') && !isDetector;
    if (isToolPage) {
      text = text.replace(/<meta\s+name=["']robots["']\s+content=["']noindex\s*,\s*nofollow["']\s*\/?>/i, '<meta name="robots" content="index,follow">');
    }
    if (relativePath === 'tools/heic-to-jpg/index.html') {
      const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; worker-src \'self\'; style-src \'self\'; font-src \'self\'; img-src \'self\' blob: data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">';
      text = text.replace(/<head([^>]*)>/i, `<head$1>${csp}<meta name="referrer" content="no-referrer">`);
    }
  }

  text = applyProjectBase(text, file);
  text = text.replaceAll(workerOrigin, siteUrl);
  if (ext === '.html') text = addPageCanonical(text, relativePath, storyIds);
  await fs.writeFile(file, text);
}

await fs.writeFile(path.join(outputRoot, '.nojekyll'), '');
await fs.writeFile(path.join(outputRoot, 'tools.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="0;url=${basePath}/tools/"><title>AFTERHOURS Tools</title></head><body><p><a href="${basePath}/tools/">Open the Tools Hub</a></p><script>location.replace(${JSON.stringify(`${basePath}/tools/`)});</script></body></html>`);
await fs.writeFile(path.join(outputRoot, '404.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Page not found · AFTERHOURS</title></head><body><main><h1>Page not found</h1><p><a href="${basePath}/">Return to AFTERHOURS</a></p></main></body></html>`);

const catalog = await fs.readFile(path.join(outputRoot, 'tools', 'catalog.js'), 'utf8');
const escapedBase = basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const routePattern = new RegExp(`\\{title:'[^']+',href:'(?:${escapedBase})?(\\/tools\\/[^']+)'`, 'g');
const routes = [...catalog.matchAll(routePattern)].map(match => match[1]).filter(route => route !== '/tools/text-detector/');
for (const entry of await fs.readdir(toolsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === '_shared' || entry.name === 'text-detector') continue;
  try {
    const page = await fs.stat(path.join(toolsRoot, entry.name, 'index.html'));
    if (page.isFile()) routes.push(`/tools/${entry.name}/`);
  } catch {
    // Folders without an index page are assets, not public routes.
  }
}
const uniqueRoutes = [...new Set(routes)];
if (uniqueRoutes.length !== 500) throw new Error(`Expected 500 active tool routes; found ${uniqueRoutes.length}.`);

const urls = [
  `${siteUrl}/`,
  `${siteUrl}/districts/`,
  ...infoPages.map(page => `${siteUrl}/info.html?page=${encodeURIComponent(page)}`),
  ...storyIds.map(id => `${siteUrl}/article.html?story=${encodeURIComponent(id)}`),
  `${siteUrl}/tools/`,
  ...uniqueRoutes.map(route => `${siteUrl}${route}`),
];
const uniqueUrls = [...new Set(urls)];
if (uniqueUrls.length !== urls.length) throw new Error('The GitHub Pages sitemap contains duplicate URLs.');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${uniqueUrls.map(url => `  <url><loc>${url.replace(/&/g, '&amp;')}</loc></url>`).join('\n')}\n</urlset>\n`;
await fs.writeFile(path.join(outputRoot, 'sitemap.xml'), sitemap);

const robotsPath = path.join(outputRoot, 'robots.txt');
try {
  let robots = await fs.readFile(robotsPath, 'utf8');
  robots = robots.replace(/Sitemap:\s*\S+/gi, `Sitemap: ${siteUrl}/sitemap.xml`);
  if (!/^Sitemap:/im.test(robots)) robots = `${robots.trimEnd()}\nSitemap: ${siteUrl}/sitemap.xml\n`;
  await fs.writeFile(robotsPath, robots);
} catch {
  await fs.writeFile(robotsPath, `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
}

console.log(`Built complete English GitHub Pages artifact at ${outputRoot}`);
console.log(`Base path: ${basePath}; published active tool routes: ${uniqueRoutes.length}; Journal stories: ${storyIds.length}; Info pages: ${infoPages.length}; sitemap URLs: ${uniqueUrls.length}`);
console.log('The homepage, Journal map, article/info routes, Tools Hub and all active tools are included; the AI Text Detector preview is noindex and omitted from the sitemap.');
