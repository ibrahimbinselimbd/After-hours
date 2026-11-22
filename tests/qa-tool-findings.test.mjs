import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = slug => fs.readFileSync(path.join(root, `site/tools/${slug}/app.js`), 'utf8');
const paletteContrast = createRequire(import.meta.url)(path.join(root, 'site/tools/color-palette-generator/contrast.js'));

test('age calculator uses calendar-month clamping and a browser-local today date', () => {
  const code = source('age-calculator');
  assert.match(code, /const localToday = \(\) =>/);
  assert.match(code, /getFullYear\(\).*getMonth\(\).*getDate\(\)/s);
  assert.match(code, /const addMonthsFromBirth = \(birth, offset\) =>/);
  assert.match(code, /Math\.min\(birth\.day, daysInMonth\(year, monthIndex\)\)/);
});

test('fraction calculator performs integer operations with BigInt', () => {
  const code = source('fraction-calculator');
  assert.match(code, /BigInt\(parts\[0\]\)/);
  assert.match(code, /BigInt\(parts\[1\]\)/);
  assert.match(code, /b\[0\]\s*===\s*0n/);
  assert.match(code, /numerator\s*\/\=\s*divisor/);
  assert.match(code, /denominator\s*\/\=\s*divisor/);
});

test('palette CSS copy uses actual line breaks and swatch labels choose a contrast color', () => {
  const code = source('color-palette-generator');
  assert.match(code, /const css=`:root \{\\n/);
  assert.doesNotMatch(code, /const css=`:root \{\\\\n/);
  assert.match(code, /style="background:\$\{c\};color:/);
});

test('palette swatch label colors meet WCAG AA across every grayscale background', () => {
  const code = source('color-palette-generator');
  assert.match(code, /AHPaletteContrast\.foregroundForSwatch\(c\)/);
  assert.equal(paletteContrast.foregroundForSwatch('#808080'), '#000000');
  for (let value = 0; value <= 255; value += 1) {
    const channel = value.toString(16).padStart(2, '0');
    const background = `#${channel}${channel}${channel}`;
    const foreground = paletteContrast.foregroundForSwatch(background);
    assert.ok(paletteContrast.contrastRatio(foreground, background) >= 4.5, `${foreground} on ${background}`);
  }
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

test('Base64, fraction and tip outputs are invalidated after edits', () => {
  for (const slug of ['base64-encoder-decoder','fraction-calculator','tip-split-calculator']) {
    const code=source(slug);
    assert.match(code,/addEventListener\('input', (?:invalidateResult|clearResult)/, `${slug} clears output on edits`);
    assert.match(code,/addEventListener\('change', (?:invalidateResult|clearResult)/, `${slug} clears output on change`);
  }
});

test('Image OCR output textarea has an accessible visible label', () => {
  const code = source('image-ocr');
  assert.match(code, /<label class="field"><span>Recognized text<\/span><textarea id="ocr-text"/);
});
