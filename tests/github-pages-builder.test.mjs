import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = path.resolve('.');
const site = path.join(root, 'site');
const output = path.join(root, 'public');
const base = 'https://ibrahimbinselimbd.github.io/After-hours';

async function filesUnder(directory) {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...await filesUnder(full));
    else out.push(full);
  }
  return out;
}

async function storyIds() {
  const source = await readFile(path.join(site, 'content.js'), 'utf8');
  const match = source.match(/^window\.STORIES\s*=\s*([\s\S]*);\s*$/);
  assert.ok(match, 'Journal story data should be parseable');
  return JSON.parse(match[1]).map(story => story.id);
}

async function activeToolSlugs() {
  const slugs = [];
  for (const entry of await readdir(path.join(site, 'tools'), { withFileTypes: true })) {
    if (!entry.isDirectory() || ['_shared', 'text-detector'].includes(entry.name)) continue;
    try {
      if ((await stat(path.join(site, 'tools', entry.name, 'index.html'))).isFile()) slugs.push(entry.name);
    } catch {
      // Folders without an index page are not published tool routes.
    }
  }
  return slugs.sort();
}

function decodeHtml(value = '') {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/gi, "'");
}

test('unknown Journal story IDs render a truthful noindex state and never fall back to the first story', async () => {
  const vm = await import('node:vm');
  const source = await readFile(path.join(site, 'article.js'), 'utf8');
  for (const search of ['?story=unknown-story', '']) {
    const metas = new Map();
    let canonicalPresent = true;
    const canonical = {remove() { canonicalPresent = false; }};
    const main = {innerHTML: ''};
    const document = {
      title: '',
      head: {
        querySelector(selector) {
          if (selector === 'link[rel="canonical"]') return canonicalPresent ? canonical : null;
          const match = selector.match(/^meta\[(name|property)="([^"]+)"\]$/);
          return match ? metas.get(`${match[1]}:${match[2]}`) || null : null;
        },
        appendChild(element) { metas.set(`${element.attribute}:${element.value}`, element); },
      },
      getElementById(id) { return id === 'main' ? main : null; },
      createElement() { return {setAttribute(attribute, value) { this.attribute = attribute; this.value = value; }}; },
    };
    const context = vm.createContext({
      window: {STORIES: [{id: 'first-story', title: 'FIRST STORY MUST NEVER APPEAR'}]},
      document,
      location: {search, origin: 'https://example.test', pathname: '/After-hours/article.html'},
      URLSearchParams,
    });
    vm.runInContext(source, context);
    assert.equal(document.title, 'Story not found | AFTERHOURS');
    assert.equal(metas.get('name:robots')?.content, 'noindex,follow');
    assert.equal(canonicalPresent, false);
    assert.match(main.innerHTML, /Story not found/);
    assert.doesNotMatch(main.innerHTML, /FIRST STORY MUST NEVER APPEAR/);
    assert.match(main.innerHTML, /href="\/districts\/"/);
    assert.match(main.innerHTML, /href="\/"/);
  }
});

test('GitHub Pages builds the complete English site, Journal, and all 500 active tools', async () => {
  const build = spawnSync(process.execPath, ['scripts/build-github-pages.mjs'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, PAGES_BASE_PATH: '/After-hours', PAGES_SITE_URL: base },
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
  assert.match(build.stdout, /published active tool routes: 500/);

  for (const relative of [
    'index.html', 'districts/index.html', 'article.html', 'info.html', '404.html', 'tools/index.html',
    'style.css', 'app.js', 'content.js', 'districts.js', 'sitemap.xml', 'robots.txt', '.nojekyll',
  ]) {
    assert.equal(await stat(path.join(output, relative)).then(() => true).catch(() => false), true, `${relative} should be published`);
  }
  assert.equal(await stat(path.join(output, '.env.example')).then(() => true).catch(() => false), false, 'repository environment examples must not be copied to the public artifact');

  const slugs = await activeToolSlugs();
  assert.equal(slugs.length, 500, 'source should contain exactly 500 active tool routes');
  const html = (await filesUnder(path.join(output, 'tools'))).filter(file => file.endsWith('.html'));
  assert.equal(html.length, 502, 'expected the Tools Hub, 500 active tools, and the disabled detector preview');
  const toolTitles = new Set();
  const toolCanonicals = new Set();
  for (const slug of slugs) {
    assert.equal(await stat(path.join(output, 'tools', slug, 'index.html')).then(() => true), true, `${slug} should be published`);
    const page = await readFile(path.join(output, 'tools', slug, 'index.html'), 'utf8');
    const title = page.match(/<title>([^<]+)<\/title>/i)?.[1] || '';
    const description = page.match(/<meta\s+name=["']description["']\s+content=(['"])([\s\S]*?)\1/i)?.[2] || '';
    const canonicalTags = [...page.matchAll(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/gi)];
    assert.ok(title.length > 12, `${slug} needs a descriptive title before JavaScript runs`);
    assert.ok(description.length > 40, `${slug} needs a useful meta description before JavaScript runs`);
    assert.equal(canonicalTags.length, 1, `${slug} should have exactly one canonical URL`);
    const canonical = canonicalTags[0][1].replace(/&amp;/g, '&');
    assert.equal(canonical, `${base}/tools/${slug}/`, `${slug} needs a self-referencing static canonical`);
    assert.ok(!toolTitles.has(title), `${slug} should have a unique title`);
    assert.ok(!toolCanonicals.has(canonical), `${slug} should have a unique canonical URL`);
    toolTitles.add(title);
    toolCanonicals.add(canonical);

    const body = page.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '';
    const beforeScripts = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
    const headings = [...beforeScripts.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
    assert.equal(headings.length, 1, `${slug} should expose exactly one meaningful H1 in the initial HTML`);
    const visibleText = beforeScripts.replace(/<[^>]+>/g, ' ').replace(/&(?:amp|lt|gt|quot|#39);/g, ' ').replace(/\s+/g, ' ').trim();
    assert.ok(visibleText.length > 200, `${slug} needs useful primary content before JavaScript runs`);
    assert.match(beforeScripts, /<(?:input|textarea|select|button)\b/i, `${slug} needs initial controls before JavaScript runs`);
    if (/\bid=["']tool-shell["']/i.test(page)) {
      assert.match(page, /class=["']tool-static-description["']/, `${slug} needs a static primary description`);
      assert.match(page, /Enable JavaScript to run this tool/, `${slug} needs an honest non-JavaScript fallback state`);
      const bodyTitle = page.match(/<body\b[^>]*\bdata-title=(['"])(.*?)\1/i)?.[2];
      const bodyDescription = page.match(/<body\b[^>]*\bdata-description=(['"])(.*?)\1/i)?.[2];
      const h1Text = headings[0][1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const staticDescription = page.match(/<p\s+class=["']tool-static-description["']>([\s\S]*?)<\/p>/i)?.[1];
      assert.equal(decodeHtml(h1Text), decodeHtml(bodyTitle), `${slug} H1 should match its catalog title`);
      assert.equal(decodeHtml(staticDescription), decodeHtml(bodyDescription), `${slug} should expose its complete catalog description before JavaScript runs`);
      if (/id=["']new-tool-config["']|planner-runtime\.js/i.test(page)) {
        assert.match(beforeScripts, /<(?:input|textarea|select)\b[^>]*\bdisabled\b/i, `${slug} should render its catalog-defined fields in the initial HTML`);
      }
    }
  }
  assert.equal(toolTitles.size, 500, 'all active tool titles should be unique');
  assert.equal(toolCanonicals.size, 500, 'all active tool canonical URLs should be unique');

  const hub = await readFile(path.join(output, 'tools', 'index.html'), 'utf8');
  assert.match(hub, new RegExp(`rel=["']canonical["'] href=["']${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/tools/`));
  const toolkitCss = await readFile(path.join(output, 'tools', '_shared', 'toolkit.css'), 'utf8');
  assert.match(toolkitCss, /\.tool-hero h1\{[^}]*overflow-wrap:\s*anywhere/i, 'long tool headings should wrap instead of widening the mobile viewport');
  const detector = await readFile(path.join(output, 'tools', 'text-detector', 'index.html'), 'utf8');
  assert.match(detector, /coming soon/i);
  assert.match(detector, /<meta\s+name=["']robots["']\s+content=["']noindex,follow["']/i);

  const home = await readFile(path.join(output, 'index.html'), 'utf8');
  const district = await readFile(path.join(output, 'districts', 'index.html'), 'utf8');
  const article = await readFile(path.join(output, 'article.html'), 'utf8');
  const info = await readFile(path.join(output, 'info.html'), 'utf8');
  const notFound = await readFile(path.join(output, '404.html'), 'utf8');
  assert.match(home, /AFTERHOURS/);
  assert.match(home, new RegExp(`rel=["']canonical["'] href=["']${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/["']`));
  assert.match(district, /JOURNAL DISTRICT MAP/);
  assert.match(district, new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/districts/`));
  assert.match(article, /article\.html\?story=/);
  assert.doesNotMatch(article, /<link\s+rel=["']canonical["']/i, 'query-story template must not canonically identify every request as the first story');
  assert.match(article, /robots\.content='noindex,follow'/, 'unknown query story IDs must be excluded from indexing');
  assert.match(article, /ids\.includes\(requested\)/, 'only known story IDs should receive self canonicals');
  assert.match(info, /info\.html\?page=/);
  assert.match(notFound, /noindex,nofollow/);
  assert.match(notFound, /href="\/After-hours\/districts\/"/);
  assert.match(notFound, /href="\/After-hours\/"/);

  const storyRouteScript = await readFile(path.join(output, 'districts.js'), 'utf8');
  const homeRouteScript = await readFile(path.join(output, 'app.js'), 'utf8');
  assert.match(storyRouteScript, /\/After-hours\/article\.html\?story=/, 'Journal map story links should target the static article template');
  assert.match(homeRouteScript, /\/After-hours\/article\.html\?story=/, 'homepage story links should target the static article template');

  const ids = await storyIds();
  const sitemap = await readFile(path.join(output, 'sitemap.xml'), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].replace(/&amp;/g, '&'));
  const expected = [
    `${base}/`, `${base}/districts/`,
    ...['about', 'privacy', 'disclaimer', 'advertising', 'terms', 'cookies', 'editorial', 'contact'].map(page => `${base}/info.html?page=${page}`),
    ...ids.map(id => `${base}/article.html?story=${encodeURIComponent(id)}`),
    `${base}/tools/`, ...slugs.map(slug => `${base}/tools/${slug}/`),
  ];
  assert.equal(locations.length, 529, 'sitemap should include the homepage, map, 8 info pages, every Journal story, the Tools Hub, and 500 active tools');
  assert.equal(new Set(locations).size, locations.length, 'sitemap URLs should be unique');
  assert.deepEqual([...locations].sort(), [...expected].sort(), 'sitemap should match the complete English canonical route inventory');
  assert.doesNotMatch(sitemap, /text-detector/i, 'disabled AI Text Detector must not appear in the sitemap');
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(await readFile(path.join(output, 'robots.txt'), 'utf8'), new RegExp(`Sitemap: ${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sitemap\\.xml`));

  const publicTextFiles = (await filesUnder(output)).filter(file => /\.(?:html|js|mjs|css|json|xml|txt)$/.test(file));
  for (const file of publicTextFiles) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /afterhours-district\.bird-timimus\.workers\.dev/i, `${path.relative(output, file)} should use GitHub Pages URLs`);
    assert.doesNotMatch(source, /(?:href|src)=(['"])\/(?:tools|districts|journal|article|info)\//i, `${path.relative(output, file)} should not retain a root-relative project route`);
  }

  for (const file of (await filesUnder(path.join(output, 'tools'))).filter(file => file.endsWith('.js'))) {
    const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 15_000 });
    assert.equal(check.status, 0, `${path.relative(output, file)} does not parse: ${check.stderr}`);
  }
});
