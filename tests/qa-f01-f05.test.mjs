import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const contrast = (foreground, background) => {
  const luminance = hex => {
    const rgb = hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255);
    const channels = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

test('F01: media tool file pickers stay keyboard-focusable with a visible focus ring', () => {
  for (const route of ['animated-gif-optimizer', 'audio-format-converter', 'video-compressor', 'video-to-gif']) {
    const css = read(`site/tools/${route}/style.css`);
    assert.doesNotMatch(css, /\.drop input\s*\{\s*display\s*:\s*none\s*\}/);
    assert.match(css, /\.drop input\s*\{[^}]*clip-path\s*:\s*inset\(50%\)/);
    assert.match(css, /\.drop:focus-within\s*\{[^}]*outline\s*:\s*3px/);
  }
});

test('F02: Day mode gives dark media cards readable light text', () => {
  const css = read('site/pages-theme.css');
  for (const title of ['Animated GIF Optimizer', 'Audio Format Converter', 'Speech to Text', 'Video Compressor', 'Video to GIF']) {
    assert.ok(css.includes(`body[data-title="${title}"] .tool-main .workspace .card`), `missing selector for ${title}`);
  }
  const textRoles = ['p','small','label','strong','span','div','li','th','td','code','pre','output','.status','.metric','.network-consent','.result','.output-text','.hint','.notice','.drop-zone'];
  const start = css.indexOf('/* These five media workspaces intentionally retain dark cards');
  const end = css.indexOf('/* Sports score pages', start);
  const roleRules = css.slice(start, end);
  for (const title of ['Animated GIF Optimizer', 'Audio Format Converter', 'Speech to Text', 'Video Compressor', 'Video to GIF']) {
    assert.ok(roleRules.includes(`body[data-title="${title}"] .tool-main .workspace .card :is(`), `${title} targets its actual dark card text`);
  }
  for (const role of textRoles) assert.ok(roleRules.includes(role), `Day override covers descendant text role ${role}`);
  assert.match(roleRules,/color: #cbd6e3 !important/);
  assert.match(roleRules,/background-color: #1a2738; border-color: #42536a/);
  assert.ok(contrast('#cbd6e3', '#101a29') >= 4.5);
});

test('F03: the two image-tool heroes use a readable Day-theme foreground', () => {
  for (const route of ['heic-to-jpg', 'image-size-optimizer']) {
    const css = read(`site/tools/${route}/style.css`);
    assert.match(css, /html\[data-theme="day"\] \.hero h1\s*\{[^}]*color:\s*#f3f5f8/i);
    assert.match(css, /html\[data-theme="day"\] \.hero p\s*\{[^}]*color:\s*#c1ccda/i);
  }
  assert.ok(contrast('#f3f5f8', '#080b12') >= 4.5);
  assert.ok(contrast('#c1ccda', '#080b12') >= 4.5);
});

test('F04: Day-theme footer link styling covers footers outside tool-main', () => {
  const css = read('site/pages-theme.css');
  assert.match(css, /html\[data-theme="day"\] \.tool-footer\s*\{[^}]*color:\s*#586a72/i);
  assert.match(css, /html\[data-theme="day"\] \.tool-footer a\s*,/i);
  assert.ok(contrast('#286f78', '#f8faf7') >= 4.5);
});

test('F05: native file status text receives a high-contrast Day-theme color', () => {
  const css = read('site/pages-theme.css');
  assert.match(css, /html\[data-theme="day"\] body \.tool-main input\[type="file"\]\s*\{\s*color:\s*#405861\s*;?\s*\}/i);
  assert.ok(contrast('#405861', '#f8faf7') >= 4.5);
});
