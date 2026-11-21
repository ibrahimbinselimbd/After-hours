import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('district-map indices and planned-post counts have explicit readable Day-theme colors', () => {
  const homeTheme = read('site/theme-toggle.css');
  assert.match(homeTheme, /html\[data-theme="day"\] \.district-grid \.district-index \{ color: #244e55; \}/);
  assert.match(read('site/index.html'), /class="district-index" data-district-count=/);
  const districts = read('site/districts.css');
  assert.match(districts, /html\[data-theme="day"\] body #category-detail \.allocation-badge strong \{ color: #244e55; \}/);
  assert.match(districts, /html\[data-theme="day"\] body \.cat-plan,[\s\S]*?\.allocation-value b \{ color: #405861; \}/);
});

test('sports match tabs support arrow navigation and retain normal Tab focusability', () => {
  const script = read('site/sports-scores/sports-scores.js');
  assert.match(script, /\['ArrowRight', 'ArrowLeft', 'Home', 'End'\]/);
  assert.match(script, /tabs\[next\]\.focus\(\);\s*tabs\[next\]\.click\(\);/);
  assert.match(script, /tab\.removeAttribute\('tabindex'\)/);
  assert.match(script, /tab\.tabIndex = 0/);
  const routes = read('scripts/sports-score-routes.mjs');
  assert.match(routes, /role="tab"/);
});


test('F16 expanded directory code and share text retain WCAG AA Day contrast', () => {
  const css=read('site/districts.css');
  assert.match(css,/html\[data-theme="day"\] body \.directory-card \.card-code,[\s\S]*?\.directory-share \{ color: #405861 !important; \}/);
  assert.match(css,/html\[data-theme="day"\] body \.directory-card \.directory-share small \{ color: #52616c !important; \}/);
  const contrast=(fg,bg)=>{const lum=h=>{const a=h.match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2]};const [a,b]=[lum(fg),lum(bg)].sort((x,y)=>y-x);return (a+.05)/(b+.05)};
  assert.ok(contrast('#405861','#f8faf7')>=4.5);
  assert.ok(contrast('#52616c','#f8faf7')>=4.5);
});
