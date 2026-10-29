import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shared = path.join(root, 'site/tools/_shared');
const groups = ['gaming', 'streaming', 'writing', 'learning', 'freelance', 'home', 'work', 'privacy', 'design', 'travel'];
const siteOrigin = 'https://afterhours-district.bird-timimus.workers.dev';
const categoryNames = {
  'pdf-documents': 'PDF & Documents', 'image-design': 'Image & Design', 'video-tools': 'Video Tools',
  'audio-tools': 'Audio Tools', 'web-seo': 'Web & SEO', 'developer-utilities': 'Developer Utilities',
  'data-spreadsheets': 'Data & Spreadsheets', 'files-archives': 'Files & Archives',
  'privacy-security': 'Privacy & Security', 'ai-everyday-utilities': 'AI & Everyday Utilities'
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const browserWindow = {AHPlannerTools: [], AHPlannerHandlers: {}};
const moduleSandbox = {window: browserWindow, document: {querySelector: () => null, querySelectorAll: () => []}, console};
const ownerBySlug = new Map();
for (const group of groups) {
  const file = path.join(shared, `planner-${group}.js`);
  const before = browserWindow.AHPlannerTools.length;
  vm.runInNewContext(await fs.readFile(file, 'utf8'), moduleSandbox, {filename: file, timeout: 3000});
  for (const tool of browserWindow.AHPlannerTools.slice(before)) ownerBySlug.set(tool.slug, group);
}
const tools = browserWindow.AHPlannerTools;
const handlers = browserWindow.AHPlannerHandlers;
if (!Array.isArray(tools) || tools.length !== 100) throw new Error(`Expected exactly 100 planner definitions; found ${tools?.length ?? 0}.`);
if (Object.keys(handlers).length !== 100) throw new Error(`Expected exactly 100 planner handlers; found ${Object.keys(handlers).length}.`);
const allowedTypes = new Set(['text', 'textarea', 'number', 'date', 'select', 'checkbox']);
const slugSet = new Set();
const titleSet = new Set();
for (const tool of tools) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tool.slug || '')) throw new Error(`Invalid planner slug: ${tool.slug}`);
  if (slugSet.has(tool.slug)) throw new Error(`Duplicate planner slug: ${tool.slug}`);
  if (titleSet.has(tool.title)) throw new Error(`Duplicate planner title: ${tool.title}`);
  if (!categoryNames[tool.categoryId]) throw new Error(`${tool.slug} uses a category outside the existing taxonomy: ${tool.categoryId}`);
  if (!ownerBySlug.has(tool.slug) || typeof handlers[tool.slug] !== 'function') throw new Error(`Missing module or handler for ${tool.slug}`);
  if (!Array.isArray(tool.fields) || !tool.fields.length || tool.fields.length > 20) throw new Error(`${tool.slug} must declare 1–20 fields.`);
  const fieldIds = new Set();
  for (const field of tool.fields) {
    const key = field?.id || field?.name || '';
    if (!/^[a-zA-Z][\w-]{0,40}$/.test(key) || !allowedTypes.has(field?.type)) throw new Error(`${tool.slug} has an unsupported field definition.`);
    if (fieldIds.has(key)) throw new Error(`${tool.slug} has duplicate field id ${key}.`);
    fieldIds.add(key);
  }
  slugSet.add(tool.slug);
  titleSet.add(tool.title);
}

// The hub only needs short catalog metadata; full handler modules load on their own tool pages.
const catalogData = tools.map(({slug, title, categoryId, description}) => ({slug, title, categoryId, description}));
await fs.writeFile(path.join(shared, 'planner-catalog-data.js'), `window.AHPlannerTools=${safeJson(catalogData)};\n`);

const catalogPath = path.join(root, 'site/tools/catalog.js');
const catalogSource = await fs.readFile(catalogPath, 'utf8');
const catalogSandbox = {window: browserWindow, document: {querySelector: () => null, querySelectorAll: () => []}, console};
vm.runInNewContext(`${catalogSource}\n;globalThis.__categories = categories;`, catalogSandbox, {filename: catalogPath, timeout: 3000});
const categories = catalogSandbox.__categories;
const activeTools = categories.flatMap(category => category.availableTools);
if (activeTools.length !== 256) throw new Error(`Expected 256 active catalog routes after integration; found ${activeTools.length}.`);
const routes = activeTools.map(tool => tool.href);
if (new Set(routes).size !== 256 || new Set(activeTools.map(tool => tool.title)).size !== 256) throw new Error('Catalog routes and titles must be unique.');
const routeSet = new Set(routes);
for (const tool of tools) {
  if (!routeSet.has(`/tools/${tool.slug}/`)) throw new Error(`Catalog is missing planner ${tool.slug}.`);
}
if (!routeSet.has('/tools/screenshot-photo-text-editor/')) throw new Error('Catalog is missing the screenshot editor.');
if (routeSet.has('/tools/text-detector/')) throw new Error('The disabled AI Text Detector must not be an active catalog route.');

for (let index = 0; index < tools.length; index++) {
  const tool = tools[index];
  const description = String(tool.description || `A browser-local ${tool.title.toLowerCase()} utility.`).replace(/\s+/g, ' ').trim().slice(0, 220);
  const pageTitle = `${tool.title} | AFTERHOURS`;
  const canonical = `${siteOrigin}/tools/${tool.slug}/`;
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {'@type':'WebPage','@id':`${canonical}#webpage`,url:canonical,name:pageTitle,description,inLanguage:'en',isPartOf:{'@type':'WebSite',name:'AFTERHOURS',url:`${siteOrigin}/`},mainEntity:{'@id':`${canonical}#application`}},
      {'@type':'WebApplication','@id':`${canonical}#application`,name:tool.title,url:canonical,description,applicationCategory:'UtilitiesApplication',isAccessibleForFree:true,browserRequirements:'JavaScript enabled; modern browser with local storage and canvas support'}
    ]
  };
  const html = `<!doctype html>\n<html lang="en"><head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="theme-color" content="#080b12">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; worker-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">\n<link rel="stylesheet" href="/tools/_shared/toolkit.css">\n<link rel="stylesheet" href="/tools/_shared/planner.css">\n<script defer src="/tools/_shared/toolkit.js"></script>\n<script defer src="/tools/_shared/planner-${ownerBySlug.get(tool.slug)}.js"></script>\n<script defer src="/tools/_shared/planner-runtime.js"></script>\n<title>${escapeHtml(pageTitle)}</title>\n<meta name="description" content="${escapeHtml(description)}">\n<meta name="robots" content="index,follow">\n<link rel="canonical" href="${escapeHtml(canonical)}">\n<meta property="og:site_name" content="AFTERHOURS">\n<meta property="og:type" content="website">\n<meta property="og:title" content="${escapeHtml(pageTitle)}">\n<meta property="og:description" content="${escapeHtml(description)}">\n<meta property="og:url" content="${escapeHtml(canonical)}">\n<meta property="og:locale" content="en_US">\n<meta name="twitter:card" content="summary">\n<meta name="twitter:title" content="${escapeHtml(pageTitle)}">\n<meta name="twitter:description" content="${escapeHtml(description)}">\n<script type="application/ld+json">${safeJson(structuredData)}</script>\n</head><body data-title="${escapeHtml(tool.title)}" data-category="${escapeHtml(categoryNames[tool.categoryId])}" data-index="${156 + index}" data-description="${escapeHtml(description)}" data-slug="${escapeHtml(tool.slug)}"><div id="tool-shell"></div><noscript><main><h1>${escapeHtml(tool.title)}</h1><p>${escapeHtml(description)}</p><p>This browser-local utility needs JavaScript. Its fields are not sent to a server.</p></main></noscript></body></html>\n`;
  const dir = path.join(root, 'site/tools', tool.slug);
  await fs.mkdir(dir, {recursive: true});
  await fs.writeFile(path.join(dir, 'index.html'), html);
}

// Refresh the hub's crawlable metadata and truthful active-tool ItemList.
const hubPath = path.join(root, 'site/tools/index.html');
let hub = await fs.readFile(hubPath, 'utf8');
hub = hub.replace(/Explore 155 free browser-based tools/gi, 'Explore 256 free browser-based tools');
hub = hub.replace(/155 active AFTERHOURS browser tools/g, '256 active AFTERHOURS browser tools');
hub = hub.replace(/155 free browser-based tools/g, '256 free browser-based tools');
const schemaMatch = hub.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
if (!schemaMatch) throw new Error('Tools Hub JSON-LD could not be found.');
const schema = JSON.parse(schemaMatch[1]);
const list = schema['@graph']?.find(item => item['@type'] === 'ItemList');
const collection = schema['@graph']?.find(item => item['@type'] === 'CollectionPage');
if (!list || !collection) throw new Error('Tools Hub CollectionPage or ItemList schema is missing.');
collection.description = 'Explore 256 free browser-based tools for PDFs, images, video, audio, code, files, SEO, privacy, planning and everyday tasks. Work with your data in your browser.';
list.name = '256 active AFTERHOURS browser tools';
list.numberOfItems = 256;
list.itemListElement = activeTools.slice().sort((a, b) => a.title.localeCompare(b.title)).map((tool, index) => ({'@type':'ListItem',position:index + 1,name:tool.title,url:`${siteOrigin}${tool.href}`}));
hub = hub.replace(schemaMatch[0], `<script type="application/ld+json">${safeJson(schema)}</script>`);
hub = hub.replace(/155 FREE TOOLS AVAILABLE/g, '256 FREE TOOLS AVAILABLE');
hub = hub.replace(/155 TOOLS AVAILABLE/g, '256 TOOLS AVAILABLE');
hub = hub.replace(/(<meta name="description" content=")[^"]*(">)/i, '$1Explore 256 free browser-based tools for PDFs, images, video, audio, code, files, privacy and everyday planning. Work with your files in your browser.$2');
hub = hub.replace(/(<meta property="og:description" content=")[^"]*(">)/i, '$1Explore 256 free browser-based utilities organized by the existing AFTERHOURS categories. Process files locally in your browser.$2');
hub = hub.replace(/(<meta name="twitter:description" content=")[^"]*(">)/i, '$1Browse 256 free browser-based tools for documents, images, code, privacy, creator workflows and everyday planning.$2');
await fs.writeFile(hubPath, hub);
console.log(`Generated ${tools.length} distinct planner pages plus one screenshot editor; active catalog and hub schema list ${activeTools.length} tools.`);
