import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsRoot = path.join(root, 'site', 'tools');
const artRoot = path.join(toolsRoot, '_shared', 'tool-art');
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

function previewUrl(category, pageUrl) {
  const toolArtBase = new URL('./_shared/tool-art/', pageUrl);
  return new URL(`${category.id}.webp`, toolArtBase).href;
}

test('category panel resolves one local category artwork for all active cards under either site base path', async () => {
  const source = await read('site/tools/category-panel.js');
  assert.match(source, /new\s+URL\(\s*['"]\.\/_shared\/tool-art\//, 'the panel must resolve artwork relative to the current tools page');
  assert.match(source, /new URL\(`\$\{data\.id\}\.webp`, toolPreviewBase\)\.href/, 'artwork filenames must derive from the catalog category ID');
  assert.match(source, /image\.loading\s*=\s*['"]lazy['"]/, 'artwork must load lazily');
  const categories = await loadCategories();
  const active = categories.flatMap(category => category.availableTools);
  assert.equal(categories.length, 20);
  assert.equal(active.length, 500);
  assert.equal(new Set(active.map(item => item.href)).size, 500);
  for (const pageUrl of ['https://example.test/tools/', 'https://example.test/After-hours/tools/?category=developer-utilities']) {
    for (const category of categories) {
      const url = new URL(previewUrl(category, pageUrl));
      assert.equal(url.origin, 'https://example.test');
      assert.equal(url.pathname, `${pageUrl.includes('/After-hours/') ? '/After-hours' : ''}/tools/_shared/tool-art/${category.id}.webp`);
    }
  }
});

test('all 20 categories have distinct, bounded local WebP artwork', async () => {
  const categories = await loadCategories();
  const expected = [...categories].map(category => `${category.id}.webp`).sort();
  const files = (await fs.readdir(artRoot)).filter(file => file.endsWith('.webp'));
  assert.equal(files.length, 20, 'one shared artwork asset per category keeps the 500-card catalog lightweight');
  assert.deepEqual([...files].sort(), expected);
  let totalBytes = 0;
  for (const file of files) {
    const metadata = await fs.stat(path.join(artRoot, file));
    assert.ok(metadata.isFile(), `${file} artwork is missing`);
    assert.ok(metadata.size <= 250 * 1024, `${file} artwork should remain reasonably small`);
    totalBytes += metadata.size;
  }
  assert.ok(totalBytes <= 3 * 1024 * 1024, 'the full category-art set should stay within a 3 MB transfer budget');
});

test('category panel source and CSS preserve card layout, reduced motion, and disabled detector semantics', async () => {
  const panel = await read('site/tools/category-panel.js');
  const css = await read('site/tools/category-panel.css');
  assert.match(panel, /className\s*=\s*['"]tool-preview['"]/) ;
  assert.match(panel, /className\s*=\s*['"]open-label['"]/) ;
  assert.match(panel, /className\s*=\s*['"]planned-tool disabled-tool['"]/) ;
  assert.match(panel, /const row\s*=\s*document\.createElement\(['"]div['"]\)/, 'the disabled detector must remain a non-link row');
  assert.doesNotMatch(panel, /disabled-tool[\s\S]{0,500}\.href\s*=/, 'disabled detector must not receive an href');
  assert.match(css, /#dialog-tools\s*\{[^}]*grid-template-columns:\s*repeat\(3\s*,/s);
  assert.match(css, /@media\s*\(max-width:\s*1000px\)[\s\S]*?#dialog-tools\s*\{[^}]*grid-template-columns:\s*repeat\(2\s*,/s);
  assert.match(css, /perspective:\s*900px[\s\S]*?transform-style:\s*preserve-3d/);
  assert.match(css, /@keyframes\s+tool-preview-drift[\s\S]*?rotateY/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none\s*!important/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?transition:\s*none\s*!important/s);
});
