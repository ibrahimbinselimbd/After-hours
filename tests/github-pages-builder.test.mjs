import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve('.');
const output = path.join(root, 'public');
async function filesUnder(directory) {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...await filesUnder(full)); else out.push(full);
  }
  return out;
}

test('GitHub Pages build contains only the English Tools Hub and 256 functioning routes', async () => {
  const build = spawnSync(process.execPath, ['scripts/build-github-pages.mjs'], { cwd: root, encoding: 'utf8', timeout: 120_000 });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
  const html = (await filesUnder(path.join(output, 'tools'))).filter(file => file.endsWith('.html'));
  assert.equal(html.length, 258, 'expected one hub, 256 active tools, and the disabled AI detector preview');
  const catalogData = await readFile(path.join(output, 'tools', '_shared', 'planner-catalog-data.js'), 'utf8');
  const plannerSlugs = [...catalogData.matchAll(/"slug":"([^"]+)"/g)].map(match => match[1]);
  assert.equal(plannerSlugs.length, 100, 'hub catalog data should contain exactly 100 planner routes');
  for (const slug of plannerSlugs) assert.equal(await stat(path.join(output, 'tools', slug, 'index.html')).then(() => true), true, `${slug} planner page should be built`);
  for (const slug of ['animated-gif-optimizer','json-schema-validator','image-cropper','video-trimmer','percentage-calculator','text-detector','toml-validator-formatter','cache-control-evaluator','github-actions-matrix-preview','kubernetes-manifest-validator','terraform-plan-explorer','har-privacy-waterfall','css-clamp-fluid-scale','cross-platform-game-backlog-session-tracker','stream-bitrate-recording-storage-planner','offline-travel-emergency-card-generator','phishing-message-explainer','font-pairing-type-scale-previewer','screenshot-photo-text-editor']) {
    assert.equal(await stat(path.join(output,'tools',slug,'index.html')).then(()=>true),true,`${slug} page should be present`);
  }
  assert.match(await readFile(path.join(output,'tools','text-detector','index.html'),'utf8'),/coming soon/i);
  assert.equal(await stat(path.join(output,'districts')).then(()=>true).catch(()=>false),false);
  assert.equal(await stat(path.join(output,'journal')).then(()=>true).catch(()=>false),false);
  const sitemap=await readFile(path.join(output,'sitemap.xml'),'utf8');
  assert.equal((sitemap.match(/<loc>/g)||[]).length,257,'sitemap should contain the hub and 256 live tools, but not the disabled detector');
  assert.doesNotMatch(sitemap,/text-detector/,'disabled AI Text Detector must not appear in the sitemap');
  const allFiles=await filesUnder(path.join(output,'tools'));
  for(const file of allFiles.filter(file=>/\.(?:html|js|mjs|css)$/.test(file))){
    const source=await readFile(file,'utf8');
    assert.doesNotMatch(source,/(?:href|src)=(['"])\/(?:tools|districts|journal)\//,`${path.relative(output,file)} retains a root-relative site route`);
    assert.doesNotMatch(source,/\/districts\//i,`${path.relative(output,file)} retains a Journal taxonomy route`);
  }
  for(const file of allFiles.filter(file=>file.endsWith('.js'))){
    const check=spawnSync(process.execPath,['--check',file],{encoding:'utf8',timeout:15_000});
    assert.equal(check.status,0,`${path.relative(output,file)} does not parse: ${check.stderr}`);
  }
});
