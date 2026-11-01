import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve('.');
const site = path.join(root, 'site');
const tools = path.join(site, 'tools');

function capture(html, pattern, label) {
  const match = html.match(pattern);
  assert.ok(match, `${label} is present`);
  return match[1].trim();
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function activeToolPages() {
  const directories = await readdir(tools, { withFileTypes: true });
  const pages = [];
  for (const entry of directories) {
    if (!entry.isDirectory() || ['_shared', 'text-detector'].includes(entry.name)) continue;
    const page = path.join(tools, entry.name, 'index.html');
    try {
      await readFile(page, 'utf8');
      pages.push({ slug: entry.name, path: page });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return pages.sort((a, b) => a.slug.localeCompare(b.slug));
}

test('all 500 active source tool routes have unique canonicals, excluding the disabled detector', async () => {
  const hubHtml = await readFile(path.join(tools, 'index.html'), 'utf8');
  const hubCanonical = capture(hubHtml, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i, 'Tools Hub canonical');
  const origin = new URL(hubCanonical).origin;
  const pages = await activeToolPages();
  assert.equal(pages.length, 500, 'expected exactly 500 active tool routes');

  const canonicalRoutes = new Set([hubCanonical]);
  for (const { slug, path: pagePath } of pages) {
    const html = await readFile(pagePath, 'utf8');
    const canonical = capture(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i, `${slug} canonical`);
    assert.equal(canonical, `${origin}/tools/${slug}/`, `${slug} should use its canonical route`);
    assert.ok(!canonicalRoutes.has(canonical), `${slug} canonical should be unique`);
    canonicalRoutes.add(canonical);
  }

  const detector = await readFile(path.join(tools, 'text-detector', 'index.html'), 'utf8');
  assert.match(detector, /<meta\s+name=["']robots["']\s+content=["']noindex,follow["']/i);
});

test('the 101 newly added tool pages have unique, aligned metadata and valid application schema', async () => {
  const hubHtml = await readFile(path.join(tools, 'index.html'), 'utf8');
  const origin = new URL(capture(hubHtml, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i, 'Tools Hub canonical')).origin;
  const pages = await activeToolPages();
  const newPages = [];
  for (const page of pages) {
    const html = await readFile(page.path, 'utf8');
    const indexMatch = html.match(/<body\b[^>]*\bdata-index=["'](\d+)["']/i);
    if (!indexMatch) continue;
    const dataIndex = Number(indexMatch[1]);
    if (dataIndex >= 156 && dataIndex <= 256) newPages.push({ ...page, html, dataIndex });
  }
  assert.equal(newPages.length, 101, 'expected exactly 101 newly added active tool pages');
  assert.equal(new Set(newPages.map(page => page.dataIndex)).size, 101, 'new tool indexes should be unique');

  const titles = new Set();
  const descriptions = new Set();
  for (const { slug, html, dataIndex } of newPages) {
    const title = capture(html, /<title[^>]*>(.*?)<\/title>/is, `${slug} title`);
    const description = decodeHtml(capture(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i, `${slug} meta description`));
    const canonical = capture(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i, `${slug} canonical`);
    const ogUrl = capture(html, /<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i, `${slug} Open Graph URL`);
    const robots = capture(html, /<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i, `${slug} robots directive`);
    const jsonLd = capture(html, /<script\s+type=["']application\/ld\+json["']>(.*?)<\/script>/is, `${slug} JSON-LD`);
    const graph = JSON.parse(jsonLd)['@graph'];
    assert.equal(canonical, `${origin}/tools/${slug}/`, `${slug} canonical should match its route`);
    assert.equal(ogUrl, canonical, `${slug} social URL should match its canonical`);
    assert.equal(robots.toLowerCase(), 'index,follow', `${slug} should be indexable`);
    assert.ok(!titles.has(title), `duplicate title: ${title}`);
    assert.ok(!descriptions.has(description), `duplicate description: ${description}`);
    titles.add(title);
    descriptions.add(description);
    assert.ok(Array.isArray(graph), `${slug} JSON-LD should contain a graph`);
    const webpage = graph.find(entity => entity['@type'] === 'WebPage');
    const application = graph.find(entity => entity['@type'] === 'WebApplication');
    assert.ok(webpage, `${slug} should describe its WebPage`);
    assert.ok(application, `${slug} should describe its real tool application`);
    assert.equal(webpage.url, canonical, `${slug} WebPage URL should match its canonical`);
    assert.equal(application.url, canonical, `${slug} application URL should match its canonical`);
    assert.equal(webpage.description, description, `${slug} WebPage description should match its visible metadata`);
    assert.equal(application.description, description, `${slug} application description should match its visible metadata`);
    assert.match(html, /<noscript>[\s\S]*?<h1\b/i, `${slug} should have a useful no-script heading fallback`);
    if (dataIndex < 256) assert.doesNotMatch(application.browserRequirements || '', /canvas/i, `${slug} should not claim a canvas requirement`);
  }
});
