import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

function previewUrl(tool, pageUrl) {
  const artBase = new URL('./_shared/tool-art/', pageUrl);
  const slug = tool.href.split('/').filter(Boolean).pop();
  return new URL(`${slug}.svg`, artBase).href;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

test('each active tool resolves to its own local animated SVG under either site base path', async () => {
  const source = await read('site/tools/category-panel.js');
  assert.match(source, /new\s+URL\(\s*['"]\.\/\_shared\/tool-art\//, 'art must resolve relative to the Tools Hub page');
  assert.match(source, /const slug = item\.href\.split\('\/'\)\.filter\(Boolean\)\.pop\(\)/, 'the SVG filename must derive from its tool route');
  assert.match(source, /new URL\(`\$\{slug\}\.svg`, toolPreviewBase\)\.href/);
  assert.match(source, /image\.loading\s*=\s*['"]lazy['"]/, 'animated artwork must load lazily');
  assert.match(source, /image\.decoding\s*=\s*['"]async['"]/, 'artwork should decode asynchronously');

  const categories = await loadCategories();
  const active = categories.flatMap(category => category.availableTools);
  assert.equal(categories.length, 20);
  assert.equal(active.length, 500);
  assert.equal(new Set(active.map(item => item.href)).size, 500);
  for (const pageUrl of ['https://example.test/tools/', 'https://example.test/After-hours/tools/?category=developer-utilities']) {
    const urls = active.map(tool => previewUrl(tool, pageUrl));
    assert.equal(new Set(urls).size, 500, 'every tool should have its own artwork URL');
    for (const url of urls) {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://example.test');
      assert.match(parsed.pathname, pageUrl.includes('/After-hours/') ? /^\/After-hours\/tools\/_shared\/tool-art\/[a-z0-9-]+\.svg$/ : /^\/tools\/_shared\/tool-art\/[a-z0-9-]+\.svg$/);
    }
  }
});

test('all 500 animated assets are unique, title-specific, local-only, and lightweight', async () => {
  const categories = await loadCategories();
  const tools = categories.flatMap(category => category.availableTools);
  const expected = Array.from(tools, tool => `${tool.href.split('/').filter(Boolean).pop()}.svg`).sort();
  const files = (await fs.readdir(artRoot)).filter(file => file.endsWith('.svg')).sort();
  assert.equal(files.length, 500, 'exactly one animated artwork file is expected per active tool');
  assert.deepEqual(files, expected, 'asset filenames must exactly match all active tool routes');

  const hashes = new Set();
  const sceneTypes = new Set();
  const animationNames = new Set();
  let totalBytes = 0;
  for (const tool of tools) {
    const slug = tool.href.split('/').filter(Boolean).pop();
    const asset = await fs.readFile(path.join(artRoot, `${slug}.svg`));
    const svg = asset.toString('utf8');
    assert.ok(asset.length <= 40 * 1024, `${slug}.svg should stay below 40 KB`);
    assert.match(svg, new RegExp(`<svg[^>]*data-tool="${slug}"`), `${slug}.svg must identify its tool`);
    assert.ok(svg.includes(`<title id="title">${escapeXml(tool.title)} — animated tool preview</title>`), `${slug}.svg should use the actual tool title`);
    assert.ok(svg.includes(escapeXml(tool.description)), `${slug}.svg should describe the actual tool function`);
    assert.match(svg, /data-scene="[a-z-]+-[a-z]+"/);
    assert.match(svg, /@keyframes motion-[a-z0-9]+\{/);
    assert.match(svg, /\.motion\{animation:motion-[a-z0-9]+/);
    assert.match(svg, /prefers-reduced-motion:reduce\)\{\.motion\{animation:none!important/);
    assert.doesNotMatch(svg, /<script\b|href=["']https?:|url\(["']?https?:/i, 'SVGs must not load scripts or third-party resources');
    const scene = svg.match(/data-scene="([^"]+)"/)?.[1];
    const animation = svg.match(/@keyframes (motion-[a-z0-9]+)\{/)?.[1];
    sceneTypes.add(scene);
    animationNames.add(animation);
    hashes.add(createHash('sha256').update(asset).digest('hex'));
    totalBytes += asset.length;
  }
  assert.equal(hashes.size, 500, 'every tool must have different artwork content');
  assert.equal(animationNames.size, 500, 'every tool must have its own animation identifier');
  assert.ok(sceneTypes.size >= 50, `artwork should use many function-specific scene types, found ${sceneTypes.size}`);
  assert.ok(totalBytes <= 4 * 1024 * 1024, `all local animated previews should stay below 4 MB, found ${totalBytes}`);
});

test('card behavior preserves click-through, responsive columns, reduced motion, and disabled detector semantics', async () => {
  const panel = await read('site/tools/category-panel.js');
  const css = await read('site/tools/category-panel.css');
  assert.match(panel, /className\s*=\s*['"]tool-preview['"]/);
  assert.match(panel, /className\s*=\s*['"]open-label['"]/);
  assert.match(panel, /link\.href = item\.href/, 'each animated card remains a direct tool link');
  assert.match(panel, /image\.alt = ['"]['"]/);
  assert.match(panel, /preview\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(panel, /className\s*=\s*['"]planned-tool disabled-tool['"]/);
  assert.match(panel, /const row\s*=\s*document\.createElement\(['"]div['"]\)/, 'the disabled detector must remain a non-link row');
  assert.doesNotMatch(panel, /disabled-tool[\s\S]{0,500}\.href\s*=/, 'the disabled detector must not receive an href');
  assert.match(css, /#dialog-tools\s*\{[^}]*grid-template-columns:\s*repeat\(3\s*,/s);
  assert.match(css, /@media\s*\(max-width:\s*1000px\)[\s\S]*?#dialog-tools\s*\{[^}]*grid-template-columns:\s*repeat\(2\s*,/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*no-preference\)[\s\S]*?tool-preview img\s*\{[^}]*animation:\s*tool-preview-drift/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none\s*!important/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?transition:\s*none\s*!important/s);
});
