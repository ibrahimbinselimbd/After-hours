import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'site');
const toolsRoot = path.join(site, 'tools');
const shared = path.join(toolsRoot, '_shared');
const newRoot = path.join(shared, 'new-tools');
const manifestRoot = path.join(newRoot, 'manifests');
const handlerRoot = path.join(newRoot, 'handlers');
const sourceOrigin = 'https://afterhours-district.bird-timimus.workers.dev';
const expectedExistingTools = 256;
const expectedAddedTools = 244;
const expectedCategories = [
  { id: 'money-shopping', title: 'Money & Shopping', count: 24 },
  { id: 'wellbeing-fitness', title: 'Wellbeing & Fitness', count: 24 },
  { id: 'travel-relocation', title: 'Travel & Relocation', count: 24 },
  { id: 'home-household', title: 'Home & Household', count: 25 },
  { id: 'writing-language', title: 'Writing & Language', count: 24 },
  { id: 'learning-study', title: 'Learning & Study', count: 24 },
  { id: 'work-delivery', title: 'Work & Project Delivery', count: 25 },
  { id: 'food-kitchen', title: 'Food & Kitchen', count: 24 },
  { id: 'sustainable-living', title: 'Sustainable Living', count: 25 },
  { id: 'events-community', title: 'Events & Community', count: 25 },
];
const expectedById = new Map(expectedCategories.map(category => [category.id, category]));
const categoryIcons = {
  'money-shopping': { icon: '¤', path: 'M6 8h20v17H6zM6 13h20M10 18h4M18 18h4M9 4h17' },
  'wellbeing-fitness': { icon: '⌁', path: 'M3 17h6l3-9 5 16 3-11 3 4h6' },
  'travel-relocation': { icon: '↗', path: 'M4 20 27 5l-8 23-4-10-11 2zM15 18 27 5' },
  'home-household': { icon: '⌂', path: 'M3 15 16 4l13 11M7 13v14h18V13M13 27v-8h6v8' },
  'writing-language': { icon: '¶', path: 'M8 5h12v22H8zM12 10h5M12 15h5M12 20h5M5 8v19h12' },
  'learning-study': { icon: '▤', path: 'M3 8q7-4 13 0v19q-6-4-13 0zM29 8q-7-4-13 0v19q6-4 13 0zM16 8v19' },
  'work-delivery': { icon: '▣', path: 'M4 10h24v17H4zM11 10V6h10v4M4 16h24M13 16v4h6v-4' },
  'food-kitchen': { icon: '◒', path: 'M4 17h24q-2 10-12 10T4 17zM8 13q2-7 8-7t8 7M16 6V3' },
  'sustainable-living': { icon: '◇', path: 'M27 5Q10 4 7 13q-4 11 10 14 11-6 10-22zM5 28Q13 18 24 9' },
  'events-community': { icon: '✦', path: 'M16 3v7m0 12v7M3 16h7m12 0h7M7 7l5 5m8 8 5 5M25 7l-5 5m-8 8-5 5' },
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const norm = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

async function readExistingCatalog() {
  const window = {};
  const sandbox = { window, document: { querySelector: () => null, querySelectorAll: () => [] }, console };
  vm.createContext(sandbox);
  const plannerCatalog = await fs.readFile(path.join(shared, 'planner-catalog-data.js'), 'utf8');
  vm.runInContext(plannerCatalog, sandbox, { filename: 'planner-catalog-data.js', timeout: 3000 });
  const catalogSource = await fs.readFile(path.join(toolsRoot, 'catalog.js'), 'utf8');
  vm.runInContext(`${catalogSource}\n;globalThis.__toolCategories = categories;`, sandbox, { filename: 'catalog.js', timeout: 3000 });
  return sandbox.__toolCategories;
}

const existingCategories = await readExistingCatalog();
const existingTools = existingCategories.flatMap(category => category.availableTools.map(tool => ({ ...tool, categoryId: category.id })));
if (existingTools.length !== expectedExistingTools) throw new Error(`Expected ${expectedExistingTools} existing active tools before expansion; found ${existingTools.length}.`);
const existingSlugs = new Set(existingTools.map(tool => String(tool.href).match(/^\/tools\/([^/]+)\/$/)?.[1]).filter(Boolean));
const existingTitles = new Set(existingTools.map(tool => norm(tool.title)));
const existingDescriptions = new Set(existingTools.map(tool => norm(tool.description)));
const categoryIds = new Set(existingCategories.map(category => category.id));
const categoryTitles = new Set(existingCategories.map(category => norm(category.title)));

const manifestNames = (await fs.readdir(manifestRoot)).filter(name => name.endsWith('.json')).sort();
if (manifestNames.length !== expectedCategories.length) throw new Error(`Expected ${expectedCategories.length} category manifests; found ${manifestNames.length}.`);
const manifests = [];
for (const expected of expectedCategories) {
  const file = path.join(manifestRoot, `${expected.id}.json`);
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
  if (manifest.category?.id !== expected.id || manifest.category?.title !== expected.title) throw new Error(`${expected.id} category identity does not match its assigned taxonomy.`);
  if (!Array.isArray(manifest.tools) || manifest.tools.length !== expected.count) throw new Error(`${expected.id} must contain exactly ${expected.count} tools; found ${manifest.tools?.length ?? 0}.`);
  if (!/^#[0-9a-f]{6}$/i.test(manifest.category.accent_color || '')) throw new Error(`${expected.id} needs a valid accent color.`);
  if (!String(manifest.category.description || '').trim()) throw new Error(`${expected.id} needs a useful category description.`);
  if (categoryIds.has(expected.id) || categoryTitles.has(norm(expected.title))) throw new Error(`${expected.id} duplicates an existing category.`);
  manifests.push(manifest);
}

const slugSet = new Set(existingSlugs);
const titleSet = new Set(existingTitles);
const descriptionSet = new Set(existingDescriptions);
const toolCategoryIds = new Map();
let addedCount = 0;
for (const manifest of manifests) {
  for (const tool of manifest.tools) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tool.slug || '')) throw new Error(`Invalid slug in ${manifest.category.id}: ${tool.slug}`);
    if (slugSet.has(tool.slug)) throw new Error(`Duplicate active route: ${tool.slug}`);
    if (!String(tool.title || '').trim() || titleSet.has(norm(tool.title))) throw new Error(`Missing or duplicate tool title: ${tool.title || tool.slug}`);
    if (norm(tool.description).length < 35 || norm(tool.description).length > 240 || descriptionSet.has(norm(tool.description))) throw new Error(`${tool.slug} needs a distinct, descriptive 35–240 character summary.`);
    if (!Array.isArray(tool.fields) || tool.fields.length < 2 || tool.fields.length > 7) throw new Error(`${tool.slug} must define 2–7 input fields.`);
    const keys = new Set();
    for (const field of tool.fields) {
      if (!/^[a-zA-Z][\w-]{0,40}$/.test(field.id || '') || !['text', 'textarea', 'number', 'date', 'select', 'checkbox'].includes(field.type)) throw new Error(`${tool.slug} has an unsupported field.`);
      if (keys.has(field.id)) throw new Error(`${tool.slug} repeats field ${field.id}.`);
      keys.add(field.id);
      if (field.type === 'select' && (!Array.isArray(field.options) || field.options.length < 2 || field.options.length > 40)) throw new Error(`${tool.slug}.${field.id} has an invalid select list.`);
      if (field.type === 'number' && ((field.min !== undefined && !Number.isFinite(Number(field.min))) || (field.max !== undefined && !Number.isFinite(Number(field.max))) || (field.min !== undefined && field.max !== undefined && Number(field.min) > Number(field.max)))) throw new Error(`${tool.slug}.${field.id} has invalid numeric bounds.`);
    }
    if (!tool.testValues || typeof tool.testValues !== 'object') throw new Error(`${tool.slug} needs representative testValues.`);
    for (const field of tool.fields) if (!Object.prototype.hasOwnProperty.call(tool.testValues, field.id)) throw new Error(`${tool.slug} testValues are missing ${field.id}.`);
    slugSet.add(tool.slug);
    titleSet.add(norm(tool.title));
    descriptionSet.add(norm(tool.description));
    toolCategoryIds.set(tool.slug, manifest.category.id);
    addedCount++;
  }
}
if (addedCount !== expectedAddedTools) throw new Error(`Expected exactly ${expectedAddedTools} new tools; found ${addedCount}.`);

const handlerFiles = await Promise.all(manifests.map(manifest => fs.readFile(path.join(handlerRoot, `${manifest.category.id}.js`), 'utf8')));
if (handlerFiles.some(source => /\bfetch\s*\(|\bnew\s+(?:XMLHttpRequest|WebSocket|EventSource)\b|\bdocument\s*\.\s*(?:querySelector|querySelectorAll|getElementById|createElement|body|documentElement)\b|\bnavigator\s*\.\s*(?:sendBeacon|clipboard|mediaDevices)\b|\beval\s*\(|\bimport\s*\(/.test(source))) throw new Error('A local handler contains a prohibited browser/network capability.');
const handlerWindow = { AHNewToolHandlers: {} };
const handlerSandbox = { window: handlerWindow };
vm.createContext(handlerSandbox);
for (let index = 0; index < handlerFiles.length; index++) vm.runInContext(handlerFiles[index], handlerSandbox, { filename: `new-tools-handler-${index}.js`, timeout: 5000 });
const handlers = handlerWindow.AHNewToolHandlers;
const expectedSlugs = manifests.flatMap(manifest => manifest.tools.map(tool => tool.slug));
const handlerSlugs = Object.keys(handlers).sort();
if (handlerSlugs.length !== expectedAddedTools || handlerSlugs.some((slug, index) => slug !== [...expectedSlugs].sort()[index])) throw new Error(`Expected one distinct handler for every route; found ${handlerSlugs.length}.`);
const sampleSummaries = new Map();
for (const manifest of manifests) {
  for (const tool of manifest.tools) {
    const handler = handlers[tool.slug];
    if (typeof handler !== 'function') throw new Error(`${tool.slug} has no callable local implementation.`);
    const values = JSON.parse(JSON.stringify(tool.testValues));
    const output = handler(values);
    const summary = typeof output === 'string' ? output : output?.summary ?? output?.text ?? output?.output ?? output?.result;
    if (typeof summary !== 'string' || summary.trim().length < 12 || summary.length > 12000) throw new Error(`${tool.slug} did not return a useful bounded test result.`);
    if (/\b(?:coming soon|placeholder|not implemented|sample output|inputs processed locally)\b/i.test(JSON.stringify(output)) || /^local .+ result$/i.test(summary.trim()) || /review this browser-local planning aid/i.test(JSON.stringify(output))) throw new Error(`${tool.slug} returned placeholder-like output.`);
    const folded = norm(summary);
    if (sampleSummaries.has(folded)) throw new Error(`Two tools produced identical sample output: ${sampleSummaries.get(folded)} and ${tool.slug}.`);
    sampleSummaries.set(folded, tool.slug);
    for (const field of tool.fields) {
      const original = values[field.id];
      let fieldResponsive = false;
      let candidates = [];
      if (field.type === 'checkbox') candidates = [!Boolean(original)];
      else if (field.type === 'select') candidates = field.options.map(option => typeof option === 'object' ? option.value : option).filter(option => String(option) !== String(original));
      else if (field.type === 'number') {
        const low = Number(field.min ?? 0), high = Number(field.max ?? Math.max(10, Number(original) + 10));
        candidates = [low, high, (low + high) / 2, Number(original) + 1].filter(value => Number.isFinite(value) && value >= low && value <= high && value !== Number(original));
      } else if (field.type === 'date') candidates = [original === '2031-07-19' ? '2032-08-20' : '2031-07-19'];
      else candidates = [
        `${String(original || '')}\n\nPerhaps this may be useful; it might be possible to revise the sample. The additional example was prepared by the team. It is useful? Why would anyone need to change the plan? The clue was "example"yesterday. “Example” contains API and api, QZK-921 and 404; their notes were revised. Alice told Morgan that she should revise the draft. Their result is there. The color, colour, center, centre, organize, organise examples have  three items. The team reviewed the plan and now review it. According to the source, the results were measured. Download the sample today.`,
        `${String(original || '')}\nAdditional item | topic 987 | 5`,
        'Maybe.',
      ];
      for (const candidate of candidates) {
        const changedValues = { ...values, [field.id]: field.type === 'number' ? String(candidate) : candidate };
        try {
          if (JSON.stringify(handler(changedValues)) !== JSON.stringify(output)) { fieldResponsive = true; break; }
        } catch { /* A different valid field or marker may still exercise the handler. */ }
      }
      if (!fieldResponsive) throw new Error(`${tool.slug}.${field.id} does not respond to tested field values.`);
    }
  }
}

const catalogCategories = manifests.map(manifest => ({
  id: manifest.category.id,
  title: manifest.category.title,
  description: manifest.category.description,
  accent_color: manifest.category.accent_color,
  tools: manifest.tools.map(tool => ({
    slug: tool.slug,
    title: tool.title,
    href: `/tools/${tool.slug}/`,
    description: tool.description,
    icon: categoryIcons[manifest.category.id].icon,
  })),
}));
const catalogTools = catalogCategories.flatMap(category => category.tools.map(tool => ({ ...tool, categoryId: category.id })));
const catalogDataPath = path.join(shared, 'new-tools-catalog-data.js');
let previousToolSlugs = [];
try {
  const previousSandbox = { window: {} };
  vm.runInNewContext(await fs.readFile(catalogDataPath, 'utf8'), previousSandbox, { filename: 'previous-new-tools-catalog-data.js', timeout: 3000 });
  previousToolSlugs = (previousSandbox.window.AHNewToolCatalog?.tools || []).map(tool => tool.slug);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const currentToolSlugs = new Set(catalogTools.map(tool => tool.slug));
for (const staleSlug of previousToolSlugs) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(staleSlug) || currentToolSlugs.has(staleSlug)) continue;
  const staleDirectory = path.join(toolsRoot, staleSlug);
  try {
    const staleHtml = await fs.readFile(path.join(staleDirectory, 'index.html'), 'utf8');
    if (staleHtml.includes('id="new-tool-config"')) await fs.rm(staleDirectory, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const dataSource = `window.AHNewToolCatalog=${safeJson({ categories: catalogCategories, tools: catalogTools })};\n`;
await fs.writeFile(catalogDataPath, dataSource);

const csp = "default-src 'none'; script-src 'self'; worker-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
for (let index = 0; index < catalogTools.length; index++) {
  const tool = catalogTools[index];
  const manifest = manifests.find(item => item.category.id === tool.categoryId);
  const definition = manifest.tools.find(item => item.slug === tool.slug);
  const canonical = `${sourceOrigin}${tool.href}`;
  const pageTitle = `${tool.title} | AFTERHOURS`;
  const description = String(tool.description).replace(/\s+/g, ' ').trim().slice(0, 220);
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': `${canonical}#webpage`, url: canonical, name: pageTitle, description, inLanguage: 'en', isPartOf: { '@type': 'WebSite', name: 'AFTERHOURS', url: `${sourceOrigin}/` }, mainEntity: { '@id': `${canonical}#application` } },
      { '@type': 'WebApplication', '@id': `${canonical}#application`, name: tool.title, url: canonical, description, applicationCategory: 'UtilitiesApplication', isAccessibleForFree: true, browserRequirements: 'JavaScript enabled; modern browser with local storage' },
    ],
  };
  const config = { slug: tool.slug, title: tool.title, description, limitations: definition.limitations, fields: definition.fields };
  const html = `<!doctype html>\n<html lang="en"><head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="theme-color" content="#080b12">\n<meta http-equiv="Content-Security-Policy" content="${esc(csp)}">\n<link rel="stylesheet" href="/tools/_shared/toolkit.css">\n<link rel="stylesheet" href="/tools/_shared/planner.css">\n<script defer src="/tools/_shared/toolkit.js"></script>\n<script defer src="/tools/_shared/new-tools/handlers/${tool.categoryId}.js"></script>\n<script defer src="/tools/_shared/new-tools/runtime.js"></script>\n<title>${esc(pageTitle)}</title>\n<meta name="description" content="${esc(description)}">\n<meta name="robots" content="index,follow">\n<link rel="canonical" href="${esc(canonical)}">\n<meta property="og:site_name" content="AFTERHOURS">\n<meta property="og:type" content="website">\n<meta property="og:title" content="${esc(pageTitle)}">\n<meta property="og:description" content="${esc(description)}">\n<meta property="og:url" content="${esc(canonical)}">\n<meta property="og:locale" content="en_US">\n<meta name="twitter:card" content="summary">\n<meta name="twitter:title" content="${esc(pageTitle)}">\n<meta name="twitter:description" content="${esc(description)}">\n<script type="application/ld+json">${safeJson(structuredData)}</script>\n</head><body data-title="${esc(tool.title)}" data-category="${esc(manifest.category.title)}" data-index="${257 + index}" data-description="${esc(description)}" data-slug="${esc(tool.slug)}"><div id="tool-shell"></div><script id="new-tool-config" type="application/json">${safeJson(config)}</script><noscript><main><h1>${esc(tool.title)}</h1><p>${esc(description)}</p><p>This free utility runs in your browser. Its inputs are not sent to a server.</p></main></noscript></body></html>\n`;
  const directory = path.join(toolsRoot, tool.slug);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'index.html'), html);
}

const catalogFile = path.join(toolsRoot, 'catalog.js');
let catalogSource = await fs.readFile(catalogFile, 'utf8');
const categoryMarker = '// BEGIN GENERATED 20-CATEGORY EXPANSION';
const categoryCode = `${categoryMarker}\nconst newCategorySpecs=(window.AHNewToolCatalog||{}).categories||[];\nfor(const spec of newCategorySpecs){\n  if(categories.some(item=>item.id===spec.id)) throw new Error(\`Duplicate catalog category: \${spec.id}\`);\n  categories.push({id:spec.id,title:spec.title,description:spec.description,accent_color:spec.accent_color,availableTools:spec.tools.map(tool=>({title:tool.title,href:tool.href,description:tool.description,icon:tool.icon||'✦'})),upcomingTools:[]});\n}\n// END GENERATED 20-CATEGORY EXPANSION`;
if (!catalogSource.includes(categoryMarker)) {
  if (!catalogSource.includes('const search=document.querySelector')) throw new Error('Could not locate the catalog runtime insertion point.');
  catalogSource = catalogSource.replace('const search=document.querySelector', `${categoryCode}\nconst search=document.querySelector`);
}
catalogSource = catalogSource.replace('the 231 new tools share one existing', 'the new browser-local tools share one existing');
catalogSource = catalogSource.replace('`${availableCount} TOOLS AVAILABLE · 231 NEW TOOLS`', '`${availableCount} TOOLS AVAILABLE · ALL FREE`');
await fs.writeFile(catalogFile, catalogSource);

const hubFile = path.join(toolsRoot, 'index.html');
let hub = await fs.readFile(hubFile, 'utf8');
if (!hub.includes('/tools/_shared/new-tools-catalog-data.js')) {
  hub = hub.replace('<script defer src="/tools/catalog.js', '<script defer src="/tools/_shared/new-tools-catalog-data.js"></script><script defer src="/tools/catalog.js');
}
const cardStart = '<!-- NEW TOOL CATEGORIES START -->';
const cardEnd = '<!-- NEW TOOL CATEGORIES END -->';
const pathEsc = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cards = catalogCategories.map((category, index) => {
  const icon = categoryIcons[category.id];
  const label = `${index + 11} / DISTRICT`;
  return `<button class="category" style="--accent:${esc(category.accent_color)}" data-category="${esc(category.id)}" aria-label="${esc(category.title)} — ${category.tools.length} available tools"><div class="card-head"><span>${label}</span><span class="planned">${category.tools.length} TOOLS AVAILABLE</span></div><div class="category-art"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="${icon.path}"/></svg></div><h3>${esc(category.title)}</h3><p>${esc(category.description)}</p><div class="card-bottom"><span>${category.tools.length} TOOLS READY</span><b aria-hidden="true">↗</b></div></button>`;
}).join('');
const markerRegExp = new RegExp(`${pathEsc(cardStart)}[\\s\\S]*?${pathEsc(cardEnd)}`);
const markedCards = `${cardStart}${cards}${cardEnd}`;
if (markerRegExp.test(hub)) hub = hub.replace(markerRegExp, markedCards);
else {
  const insertion = '</div><p id="empty-state"';
  if (!hub.includes(insertion)) throw new Error('Could not locate the end of the category-card grid.');
  hub = hub.replace(insertion, `${markedCards}</div><p id="empty-state"`);
}
hub = hub.replace(/<title>[^<]*<\/title>/i, '<title>Free Online Tools for Everyday Work &amp; Life | AFTERHOURS</title>');
hub = hub.replace(/(<meta name="description" content=")[^"]*(">)/i, '$1Explore 500 free browser-local tools in 20 useful categories for daily work and life. Process your inputs on this device; no paid APIs or live lookups are required.$2');
hub = hub.replace(/(<meta property="og:title" content=")[^"]*(">)/i, '$1Free Online Tools for Everyday Work &amp; Life | AFTERHOURS$2');
hub = hub.replace(/(<meta property="og:description" content=")[^"]*(">)/i, '$1Explore 500 free browser-local tools across 20 useful categories. Use practical local utilities for everyday work and life.$2');
hub = hub.replace(/(<meta name="twitter:title" content=")[^"]*(">)/i, '$1Free Online Tools for Everyday Work &amp; Life | AFTERHOURS$2');
hub = hub.replace(/(<meta name="twitter:description" content=")[^"]*(">)/i, '$1Browse 500 free browser-local tools across 20 categories for everyday work, home, travel, learning and more.$2');
hub = hub.replace(/256 free browser-based tools/gi, '500 free browser-based tools');
hub = hub.replace(/256 active AFTERHOURS browser tools/g, '500 active AFTERHOURS browser tools');
hub = hub.replace(/Explore 256 free browser-based tools/g, 'Explore 500 free browser-based tools');
hub = hub.replace(/256 FREE TOOLS AVAILABLE/g, '500 FREE TOOLS AVAILABLE');
hub = hub.replace(/256 TOOLS AVAILABLE/g, '500 TOOLS AVAILABLE');
hub = hub.replace(/10 DISTRICTS · 256 TOOLS AVAILABLE/g, '20 DISTRICTS · 500 TOOLS AVAILABLE');
const schemaMatch = hub.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
if (!schemaMatch) throw new Error('Tools Hub JSON-LD could not be found.');
const schema = JSON.parse(schemaMatch[1]);
const graph = schema['@graph'] || [];
const collection = graph.find(item => item['@type'] === 'CollectionPage');
const itemList = graph.find(item => item['@type'] === 'ItemList');
if (!collection || !itemList) throw new Error('Tools Hub CollectionPage or ItemList schema is missing.');
collection.description = 'Explore 500 free browser-local tools across 20 useful categories for everyday work and life. Process your inputs on this device, with no paid APIs or live-data claims.';
itemList.name = '500 active AFTERHOURS browser tools';
itemList.numberOfItems = expectedExistingTools + expectedAddedTools;
itemList.itemListElement = [...existingTools.map(tool => ({ title: tool.title, href: tool.href })), ...catalogTools.map(tool => ({ title: tool.title, href: tool.href }))]
  .sort((left, right) => left.title.localeCompare(right.title))
  .map((tool, index) => ({ '@type': 'ListItem', position: index + 1, name: tool.title, url: `${sourceOrigin}${tool.href}` }));
hub = hub.replace(schemaMatch[0], `<script type="application/ld+json">${safeJson(schema)}</script>`);
await fs.writeFile(hubFile, hub);

console.log(`Generated ${expectedAddedTools} unique local tools in ${manifests.length} new categories; total active routes: ${expectedExistingTools + expectedAddedTools}.`);
console.log(`Validated ${handlerSlugs.length} distinct handler functions with non-empty sample outputs.`);
