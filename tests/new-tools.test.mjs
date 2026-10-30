import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';

const root = path.resolve('.');
const toolsRoot = path.join(root, 'site/tools');
const shared = path.join(toolsRoot, '_shared');
const newRoot = path.join(shared, 'new-tools');
const expected = new Map([
  ['money-shopping', 24], ['wellbeing-fitness', 24], ['travel-relocation', 24],
  ['home-household', 25], ['writing-language', 24], ['learning-study', 24],
  ['work-delivery', 25], ['food-kitchen', 24], ['sustainable-living', 25], ['events-community', 25],
]);
const decode = text => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const normalized = value => String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

async function loadCategories() {
  const window = {};
  const sandbox = { window, document: { querySelector: () => null, querySelectorAll: () => [] }, console };
  vm.createContext(sandbox);
  vm.runInContext(await fs.readFile(path.join(shared, 'planner-catalog-data.js'), 'utf8'), sandbox);
  vm.runInContext(await fs.readFile(path.join(shared, 'new-tools-catalog-data.js'), 'utf8'), sandbox);
  vm.runInContext(`${await fs.readFile(path.join(toolsRoot, 'catalog.js'), 'utf8')}\n;globalThis.__categories=categories;`, sandbox);
  return sandbox.__categories;
}

const manifests = [];
for (const id of expected.keys()) {
  manifests.push(JSON.parse(await fs.readFile(path.join(newRoot, 'manifests', `${id}.json`), 'utf8')));
}
const newTools = manifests.flatMap(manifest => manifest.tools.map(tool => ({ ...tool, categoryId: manifest.category.id })));

 test('new tool packs contain exactly 244 unique tools in ten new categories', async () => {
  assert.equal(manifests.length, 10);
  assert.equal(newTools.length, 244);
  for (const manifest of manifests) {
    const expectedCount = expected.get(manifest.category.id);
    assert.ok(expectedCount, `unexpected category ${manifest.category.id}`);
    assert.equal(manifest.tools.length, expectedCount, `${manifest.category.id} tool count`);
  }
  assert.equal(new Set(newTools.map(tool => tool.slug)).size, 244, 'new routes are unique');
  assert.equal(new Set(newTools.map(tool => normalized(tool.title))).size, 244, 'new titles are unique');
  assert.equal(new Set(newTools.map(tool => normalized(tool.description))).size, 244, 'new descriptions are unique');
  for (const tool of newTools) {
    assert.match(tool.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(tool.title.trim().length >= 8);
    assert.ok(tool.description.trim().length >= 35);
    assert.ok(Array.isArray(tool.fields) && tool.fields.length >= 2 && tool.fields.length <= 7);
    assert.ok(tool.testValues && typeof tool.testValues === 'object');
    for (const field of tool.fields) assert.ok(Object.hasOwn(tool.testValues, field.id), `${tool.slug} testValues missing ${field.id}`);
  }
});

test('expanded catalog and hub expose exactly 500 active routes across twenty categories', async () => {
  const categories = await loadCategories();
  const active = categories.flatMap(category => category.availableTools);
  assert.equal(categories.length, 20);
  assert.equal(active.length, 500);
  assert.equal(new Set(active.map(tool => tool.href)).size, 500);
  assert.equal(new Set(active.map(tool => normalized(tool.title))).size, 500);
  assert.ok(!active.some(tool => tool.href === '/tools/text-detector/'));
  const hub = await fs.readFile(path.join(toolsRoot, 'index.html'), 'utf8');
  assert.ok(hub.indexOf('new-tools-catalog-data.js') < hub.indexOf('catalog.js'));
  assert.ok(hub.indexOf('catalog.js') < hub.indexOf('category-panel.js'));
  for (const id of expected.keys()) assert.match(hub, new RegExp(`data-category=["']${id}["']`), `${id} has a visible category card`);
  const itemListText = hub.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)?.[1];
  assert.ok(itemListText, 'hub has static JSON-LD');
  const itemList = JSON.parse(itemListText)['@graph'].find(item => item['@type'] === 'ItemList');
  assert.equal(itemList.numberOfItems, 500);
  assert.equal(itemList.itemListElement.length, 500);
  assert.ok(!itemList.itemListElement.some(item => /text-detector/i.test(item.url)));
});

test('each new route has unique aligned metadata, a category handler, and the shared local runtime', async () => {
  const hub = await fs.readFile(path.join(toolsRoot, 'index.html'), 'utf8');
  const hubCanonical = hub.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1];
  assert.ok(hubCanonical);
  const origin = new URL(hubCanonical).origin;
  const titles = new Set();
  const descriptions = new Set();
  const indices = new Set();
  for (let offset = 0; offset < newTools.length; offset++) {
    const tool = newTools[offset];
    const html = await fs.readFile(path.join(toolsRoot, tool.slug, 'index.html'), 'utf8');
    const title = decode(html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1] || '');
    const description = decode(html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1] || '');
    const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1];
    const ogUrl = html.match(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i)?.[1];
    const robots = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i)?.[1];
    const index = Number(html.match(/<body\b[^>]*\bdata-index=["'](\d+)["']/i)?.[1]);
    assert.equal(title, `${tool.title} | AFTERHOURS`);
    assert.equal(description, tool.description);
    assert.equal(canonical, `${origin}/tools/${tool.slug}/`);
    assert.equal(ogUrl, canonical);
    assert.equal(robots, 'index,follow');
    assert.equal(index, 257 + offset);
    assert.ok(!indices.has(index));
    indices.add(index);
    assert.ok(!titles.has(title));
    assert.ok(!descriptions.has(description));
    titles.add(title);
    descriptions.add(description);
    assert.match(html, new RegExp(`/tools/_shared/new-tools/handlers/${tool.categoryId}\\.js`));
    assert.match(html, /new-tools\/runtime\.js/);
    assert.match(html, /id="new-tool-config" type="application\/json"/);
    assert.match(html, /<noscript>[\s\S]*?<h1\b/i);
    assert.match(html, /connect-src (?:'none'|&#39;none&#39;)/);
    const graph = JSON.parse(html.match(/<script\s+type=["']application\/ld\+json["']>(.*?)<\/script>/is)?.[1] || '{}')['@graph'];
    assert.ok(graph?.some(item => item['@type'] === 'WebPage'));
    const application = graph?.find(item => item['@type'] === 'WebApplication');
    assert.ok(application);
    assert.equal(application.url, canonical);
    assert.equal(application.description, tool.description);
  }
  const runtime = await fs.readFile(path.join(newRoot, 'runtime.js'), 'utf8');
  assert.match(runtime, /credits\.canRun\(/);
  assert.match(runtime, /credits\.charge\(/);
  assert.match(runtime, /maxFieldChars\s*=\s*25000/);
  assert.match(runtime, /maxTotalChars\s*=\s*60000/);
  assert.doesNotMatch(runtime, /fetch\s*\(|XMLHttpRequest|WebSocket/);
});

test('writing suggestion controls toggle review prompts and rhetorical questions retain punctuation', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(newRoot, 'manifests', 'writing-language.json'), 'utf8'));
  const window = { AHNewToolHandlers: {} };
  const sandbox = { window };
  vm.createContext(sandbox);
  vm.runInContext(await fs.readFile(path.join(newRoot, 'handlers', 'writing-language.js'), 'utf8'), sandbox);
  const handlers = window.AHNewToolHandlers;
  const prompt = 'Editorial review prompt: keep a suggested change only when it supports your intended meaning and voice.';
  for (const tool of manifest.tools.filter(item => item.fields.some(field => field.id === 'includeSuggestions'))) {
    const enabled = handlers[tool.slug]({ ...tool.testValues, includeSuggestions: true });
    const disabled = handlers[tool.slug]({ ...tool.testValues, includeSuggestions: false });
    assert.ok(enabled.warnings.includes(prompt), `${tool.slug} adds the requested review prompt`);
    assert.ok(!disabled.warnings.includes(prompt), `${tool.slug} removes the prompt when disabled`);
  }
  const result = handlers['rhetorical-question-finder']({ text: 'Who would want this change? What time does the review begin?', includeSuggestions: true });
  assert.match(result.summary, /2 questions found; 1 match common rhetorical cues/);
  assert.match(result.details, /cue-based rhetorical candidate/);
});

test('every route has a real local handler that returns a distinct, bounded result for representative input', async () => {
  const handlerWindow = { AHNewToolHandlers: {} };
  const sandbox = { window: handlerWindow };
  vm.createContext(sandbox);
  for (const id of expected.keys()) {
    const source = await fs.readFile(path.join(newRoot, 'handlers', `${id}.js`), 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|\bnew\s+(?:XMLHttpRequest|WebSocket|EventSource)\b|\bdocument\s*\.\s*(?:querySelector|querySelectorAll|getElementById|createElement|body|documentElement)\b|\bnavigator\s*\.\s*(?:sendBeacon|clipboard|mediaDevices)\b|\beval\s*\(|\bimport\s*\(/);
    vm.runInContext(source, sandbox, { filename: `${id}.js`, timeout: 5000 });
  }
  const handlers = handlerWindow.AHNewToolHandlers;
  assert.equal(Object.keys(handlers).length, 244);
  const summaries = new Set();
  for (const tool of newTools) {
    assert.equal(typeof handlers[tool.slug], 'function', `${tool.slug} handler exists`);
    const values = JSON.parse(JSON.stringify(tool.testValues));
    const result = handlers[tool.slug](values);
    const summary = typeof result === 'string' ? result : result?.summary ?? result?.text ?? result?.output ?? result?.result;
    assert.equal(typeof summary, 'string', `${tool.slug} returns plain text`);
    assert.ok(summary.trim().length >= 12 && summary.length <= 12000, `${tool.slug} output is useful and bounded`);
    assert.doesNotMatch(JSON.stringify(result), /\b(?:coming soon|placeholder|not implemented|sample output|inputs processed locally)\b|review this browser-local planning aid/i, `${tool.slug} is not a placeholder`);
    assert.doesNotMatch(summary, /^local .+ result$/i, `${tool.slug} does not use a generic local-result template`);
    const key = normalized(summary);
    assert.ok(!summaries.has(key), `${tool.slug} does not clone another tool's sample result`);
    summaries.add(key);
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
        try { if (JSON.stringify(handlers[tool.slug](changedValues)) !== JSON.stringify(result)) { fieldResponsive = true; break; } }
        catch { /* Try another valid field value. */ }
      }
      assert.ok(fieldResponsive, `${tool.slug}.${field.id} affects its result`);
    }
  }
  assert.equal(summaries.size, 244);
});
