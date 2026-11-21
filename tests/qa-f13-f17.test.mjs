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
