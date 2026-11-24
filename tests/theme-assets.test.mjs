import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ensureThemeAssets } from '../scripts/theme-assets.mjs';

const count = (value, expression) => (value.match(expression) || []).length;

test('shared theme injection emits root-relative assets for Cloudflare routes', () => {
  const html = ensureThemeAssets('<html><head></head><body></body></html>');
  assert.equal(count(html, /theme-toggle\.css/g), 1);
  assert.equal(count(html, /pages-theme\.css/g), 1);
  assert.equal(count(html, /display-settings\.css/g), 1);
  assert.equal(count(html, /theme-toggle\.js/g), 1);
  assert.match(html, /href="\/theme-toggle\.css\?v=1"/);
  assert.match(html, /href="\/pages-theme\.css\?v=1"/);
  assert.match(html, /href="\/display-settings\.css\?v=6"/);
  assert.match(html, /src="\/theme-toggle\.js\?v=1"/);
  assert.match(html, /name="theme-color" content="#080a16"/);
});

test('display settings stylesheet is cache-busted but remains absent from the standalone analytics preview', () => {
  const existing = '<html><head><link rel="stylesheet" href="/display-settings.css?v=5"></head><body></body></html>';
  const html = ensureThemeAssets(existing);
  assert.match(html, /href="\/display-settings\.css\?v=6"/);
  const preview = ensureThemeAssets('<html><head></head><body></body></html>', '/admin/analytics-preview/assets');
  assert.doesNotMatch(preview, /display-settings\.css/);
});

test('shared theme injection preserves GitHub Pages base paths and existing assets', () => {
  const existing = '<html><head><link rel="stylesheet" href="/After-hours/theme-toggle.css?v=1"><link rel="stylesheet" href="/After-hours/pages-theme.css?v=1"></head><body><script defer src="/After-hours/theme-toggle.js?v=1"></script></body></html>';
  const html = ensureThemeAssets(existing, '/After-hours');
  assert.equal(count(html, /theme-toggle\.css/g), 1);
  assert.equal(count(html, /pages-theme\.css/g), 1);
  assert.equal(count(html, /theme-toggle\.js/g), 1);
  assert.match(html, /href="\/After-hours\/theme-toggle\.css\?v=1"/);
});

test('320px footer mode wraps the mini-world label within its compact column', async () => {
  const css = await readFile(new URL('../site/footer-signal.css', import.meta.url), 'utf8');
  assert.match(css, /@media\s*\(max-width:\s*360px\)[\s\S]*?\.ah-footer__world \.ah-footer__world-tag[\s\S]*?max-width:\s*100%[\s\S]*?white-space:\s*normal/);
});
