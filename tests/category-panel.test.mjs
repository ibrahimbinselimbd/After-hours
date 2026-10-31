import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsRoot = path.join(root, 'site', 'tools');
const previewRoot = path.join(toolsRoot, '_shared', 'previews');
const read = relative => fs.readFile(path.join(root, relative), 'utf8');

async function loadCategories() {
  const window = {};
  const sandbox = { window, document: { querySelector: () => null, querySelectorAll: () => [] }, console };
  vm.createContext(sandbox);
  vm.runInContext(await read('site/tools/_shared/planner-catalog-data.js'), sandbox);
  vm.runInContext(await read('site/tools/_shared/new-tools-catalog-data.js'), sandbox);
  vm.runInContext(`${await read('site/tools/catalog.js')}\n;globalThis.__categories = categories;`, sandbox);
  return sandbox.__categories;
}

function previewUrl(item, pageUrl) {
  const slug = item.href.split('/').filter(Boolean).pop();
  const toolPreviewBase = new URL('./_shared/previews/', pageUrl);
  return new URL(`${slug}.webp`, toolPreviewBase).href;
}

test('category panel generates local preview URLs for every active catalog item under either site base path', async () => {
  const source = await read('site/tools/category-panel.js');
  assert.match(source, /new\s+URL\(\s*['"]\.\/_shared\/previews\//, 'the panel must resolve previews relative to the current tools page');
  assert.match(source, /split\(['"]\/['"]\).*filter\(Boolean\).*pop\(\)/, 'preview filenames must derive from the catalog route slug');
  const categories = await loadCategories();
  const active = categories.flatMap(category => category.availableTools);
  assert.equal(categories.length, 20);
  assert.equal(active.length, 500);
  assert.equal(new Set(active.map(item => item.href)).size, 500);
  for (const pageUrl of ['https://example.test/tools/', 'https://example.test/After-hours/tools/?category=developer-utilities']) {
    for (const item of active) {
      const url = new URL(previewUrl(item, pageUrl));
      assert.equal(url.origin, 'https://example.test');
      assert.match(url.pathname, /^\/(?:After-hours\/)?tools\/_shared\/previews\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/);
    }
  }
});

test('all 500 active tools have distinct bounded preview assets', async () => {
  const categories = await loadCategories();
  const slugs = categories.flatMap(category => category.availableTools).map(item => item.href.split('/').filter(Boolean).pop());
  assert.equal(slugs.length, 500);
  const files = (await fs.readdir(previewRoot)).filter(file => file.endsWith('.webp'));
  assert.equal(files.length, 500, 'preview generation must produce one asset per active tool');
  assert.equal(new Set(files).size, 500);
  for (const slug of slugs) {
    const file = path.join(previewRoot, `${slug}.webp`);
    const metadata = await fs.stat(file).catch(() => null);
    assert.ok(metadata?.isFile(), `${slug} preview is missing`);
    assert.ok(metadata.size <= 250 * 1024, `${slug} preview should remain reasonably small`);
  }
  assert.deepEqual([...files].sort(), [...slugs].map(slug => `${slug}.webp`).sort());
});

test('category panel source and CSS preserve card layout, reduced motion, and disabled detector semantics', async () => {
  const panel = await read('site/tools/category-panel.js');
  const css = await read('site/tools/category-panel.css');
  assert.match(panel, /className\s*=\s*['"]tool-preview['"]/);
  assert.match(panel, /className\s*=\s*['"]open-label['"]/);
  assert.match(panel, /className\s*=\s*['"]planned-tool disabled-tool['"]/);
  assert.match(panel, /const row\s*=\s*document\.createElement\(['"]div['"]\)/, 'the disabled detector must remain a non-link row');
  assert.doesNotMatch(panel, /disabled-tool[\s\S]{0,500}\.href\s*=/, 'disabled detector must not receive an href');
  assert.match(css, /#dialog-tools\s*\{[^}]*grid-template-columns:\s*repeat\(3\s*,/s);
  assert.match(css, /@media\s*\(max-width:\s*1000px\)[\s\S]*?#dialog-tools\s*\{[^}]*grid-template-columns:\s*repeat\(2\s*,/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none\s*!important/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?transition:\s*none\s*!important/s);
});
