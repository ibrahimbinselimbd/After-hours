import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = slug => fs.readFileSync(path.join(root, `site/tools/${slug}/app.js`), 'utf8');

test('age calculator normalizes completed-age day borrowing', () => {
  const code = source('age-calculator');
  assert.match(code, /anchorDay=Math\.min\(bd\.getDate\(\),dim\(/);
  assert.match(code, /d=Math\.floor\(\(ad-prevMonth\)\/86400000\)/);
});

test('fraction calculator performs integer operations with BigInt', () => {
  const code = source('fraction-calculator');
  assert.match(code, /BigInt\(p\[0\]\)/);
  assert.match(code, /BigInt\(p\[1\]\)/);
  assert.match(code, /b\[0\]===0n/);
  assert.match(code, /n\/=g;d\/=g/);
});

test('palette CSS copy uses actual line breaks and swatch labels choose a contrast color', () => {
  const code = source('color-palette-generator');
  assert.match(code, /const css=`:root \{\\n/);
  assert.doesNotMatch(code, /const css=`:root \{\\\\n/);
  assert.match(code, /style="background:\$\{c\};color:/);
});

test('contrast checker applies selected foreground to preview text and paragraph', () => {
  const code = source('color-contrast-checker');
  assert.match(code, /preview\.querySelector\('strong'\)\.style\.color=th\.value/);
  assert.match(code, /preview\.querySelector\('p'\)\.style\.color=th\.value/);
});

test('XLSX extractor reads inline and plain string cells', () => {
  const code = source('xlsx-to-csv');
  assert.match(code, /type==='inlineStr'/);
  assert.match(code, /querySelectorAll\('is t'\)/);
  assert.match(code, /type==='str'/);
});
