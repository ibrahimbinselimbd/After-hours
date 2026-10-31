import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

function previewUrl(tool, pageUrl) {
  const previewBase = new URL('./_shared/previews/', pageUrl);
  const slug = tool.href.split('/').filter(Boolean).pop();
  return new URL(`${slug}.webp`, previewBase).href;
}

function slugFor(tool) {
  return tool.href.split('/').filter(Boolean).pop();
}

test('each active tool resolves to its own local WebP workspace preview under either site base path', async () => {
  const source = await read('site/tools/category-panel.js');
  assert.match(source, /new\s+URL\(\s*['"]\.\/_shared\/previews\//, 'previews must resolve relative to the Tools Hub page');
  assert.match(source, /const slug = item\.href\.split\('\/'\)\.filter\(Boolean\)\.pop\(\)/, 'the preview filename must derive from its tool route');
  assert.match(source, /new URL\(`\$\{slug\}\.webp`, toolPreviewBase\)\.href/);
  assert.match(source, /image\.loading\s*=\s*['"]lazy['"]/, 'previews must load only as needed');
  assert.match(source, /image\.decoding\s*=\s*['"]async['"]/, 'preview decoding must be asynchronous');
  assert.match(source, /image\.fetchPriority\s*=\s*['"]low['"]/, 'preview images should not compete with primary content');

  const categories = await loadCategories();
  const active = categories.flatMap(category => category.availableTools);
  assert.equal(categories.length, 20);
  assert.equal(active.length, 500);
  assert.equal(new Set(active.map(item => item.href)).size, 500);
  for (const pageUrl of ['https://example.test/tools/', 'https://example.test/After-hours/tools/?category=developer-utilities']) {
    const urls = active.map(tool => previewUrl(tool, pageUrl));
    assert.equal(new Set(urls).size, 500, 'each active tool should have its own preview URL');
    for (const url of urls) {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://example.test');
      assert.match(parsed.pathname, pageUrl.includes('/After-hours/') ? /^\/After-hours\/tools\/_shared\/previews\/[a-z0-9-]+\.webp$/ : /^\/tools\/_shared\/previews\/[a-z0-9-]+\.webp$/);
    }
  }
});

test('all 500 real workspace screenshots map one-to-one, remain unique and stay lightweight', async () => {
  const categories = await loadCategories();
  const tools = categories.flatMap(category => category.availableTools);
  const expected = Array.from(tools, tool => `${slugFor(tool)}.webp`).sort();
  const files = (await fs.readdir(previewRoot)).filter(file => file.endsWith('.webp')).sort();
  assert.equal(files.length, 500, 'exactly one WebP preview is expected for every active tool');
  assert.deepEqual(files, expected, 'preview filenames must exactly match the active tool routes');

  const hashes = new Set();
  let totalBytes = 0;
  for (const tool of tools) {
    const slug = slugFor(tool);
    const asset = await fs.readFile(path.join(previewRoot, `${slug}.webp`));
    assert.ok(asset.length <= 40 * 1024, `${slug}.webp should stay below 40 KB`);
    assert.equal(asset.toString('ascii', 0, 4), 'RIFF', `${slug}.webp must be a RIFF image`);
    assert.equal(asset.toString('ascii', 8, 12), 'WEBP', `${slug}.webp must use WebP encoding`);
    hashes.add(createHash('sha256').update(asset).digest('hex'));
    totalBytes += asset.length;
  }
  assert.equal(hashes.size, 500, 'every tool must have a distinct real-interface screenshot');
  assert.ok(totalBytes <= 6 * 1024 * 1024, `all local previews should stay below 6 MiB, found ${totalBytes}`);
});

test('card behavior preserves click-through, responsive columns, reduced motion and disabled detector semantics', async () => {
  const panel = await read('site/tools/category-panel.js');
  const css = await read('site/tools/category-panel.css');
  const index = await read('site/tools/index.html');
  assert.match(panel, /className\s*=\s*['"]tool-preview['"]/);
  assert.match(panel, /className\s*=\s*['"]open-label['"]/);
  assert.match(panel, /link\.href = item\.href/, 'every real preview card remains a direct tool link');
  assert.match(panel, /image\.alt = ['"]['"]/);
  assert.match(panel, /preview\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(panel, /caption\.textContent = ['"]REAL TOOL WORKSPACE['"]/, 'the visual label should describe a static real interface preview');
  assert.match(panel, /pointermove/);
  assert.match(panel, /cardTiltMotion\.matches/);
  assert.match(panel, /event\.pointerType === ['"]touch['"]/, 'touch input should not trigger pointer tilt');
  assert.match(panel, /className\s*=\s*['"]planned-tool disabled-tool['"]/, 'the detector remains a disabled, non-tool row');
  assert.match(panel, /const row\s*=\s*document\.createElement\(['"]div['"]\)/);
  assert.doesNotMatch(panel, /disabled-tool[\s\S]{0,500}\.href\s*=/, 'the disabled detector must not receive an href');
  assert.match(css, /#dialog-tools\s*\{[^}]*grid-template-columns:\s*repeat\(3\s*,/s);
  assert.match(css, /@media\s*\(max-width:\s*1000px\)[\s\S]*?#dialog-tools\s*\{[^}]*grid-template-columns:\s*repeat\(2\s*,/s);
  assert.match(css, /\.tool-preview\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/s, 'the original screenshot composition should not be cropped');
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*no-preference\)[\s\S]*?tool-preview img\s*\{[^}]*animation:\s*tool-preview-drift/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none\s*!important/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?transition:\s*none\s*!important/s);
  assert.match(index, /category-panel\.css\?v=8-authentic-tool-previews/);
  assert.match(index, /category-panel\.js\?v=12-authentic-tool-previews/);
});
