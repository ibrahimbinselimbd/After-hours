import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL(`../site/${name}`, import.meta.url), 'utf8');
const html = read('index.html');
const touch = read('touch.js');
const model = read('city-model.js');
const css = read('city-model.css');

test('city model is constrained to horizontal yaw, without pan or zoom', () => {
  assert.match(html, /camera-orbit="20deg 70deg 92%"/);
  assert.match(html, /min-camera-orbit="auto 70deg 92%"/);
  assert.match(html, /max-camera-orbit="auto 70deg 92%"/);
  assert.match(html, /disable-pan disable-tap disable-zoom touch-action="pan-y"/);
  assert.doesNotMatch(touch, /targetTilt\s*=.*clientY/);
});

test('single accessible horizontal slider retains keyboard support', () => {
  assert.match(html, /role="slider" tabindex="0" aria-label="Rotate the 3D scene horizontally/);
  assert.match(html, /aria-orientation="horizontal"/);
  assert.match(html, /Home resets/);
  assert.match(touch, /ArrowLeft.*ArrowRight.*Home/);
  assert.match(touch, /deg 70deg 92%/);
  assert.match(model, /camera-change/);
  assert.match(model, /aria-valuenow/);
});

test('canvas fallback remains available until model readiness and after errors', () => {
  assert.match(html, /<canvas aria-hidden="true"><\/canvas><model-viewer/);
  assert.match(touch, /image\.src='earth\.jpg'/);
  assert.match(model, /addEventListener\('error',.*remove\('model-ready'\)/);
  assert.match(css, /\.touch-stage\.model-ready > canvas/);
  assert.doesNotMatch(read('touch.css'), /\.touch-stage>canvas\{display:none!important\}/);
});

test('larger responsive stage retains reduced-motion handling', () => {
  assert.match(css, /max-width: 500px/);
  assert.match(css, /height: 400px/);
  assert.match(css, /max-width: 420px/);
  assert.match(css, /height: clamp\(250px, 76vw, 320px\)/);
  assert.match(model, /prefers-reduced-motion: reduce/);
  assert.match(model, /classList\.contains\('reduce-motion'\)/);
  assert.match(model, /toggleAttribute\('auto-rotate', enabled\)/);
});
