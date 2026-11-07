import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const [homepage, css, controller] = await Promise.all([
  readFile(new URL('../site/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../site/theme-toggle.css', import.meta.url), 'utf8'),
  readFile(new URL('../site/theme-toggle.js', import.meta.url), 'utf8')
]);

function createPage(savedTheme = null, storageUnavailable = false) {
  const attrs = new Map();
  const handlers = {};
  const button = {
    id: '', type: '', className: '', title: '', innerHTML: '',
    setAttribute(name, value) { attrs.set(name, value); },
    getAttribute(name) { return attrs.get(name) ?? null; },
    addEventListener(name, handler) { handlers[name] = handler; }
  };
  const themeMeta = {
    content: '#080a16',
    setAttribute(name, value) { if (name === 'content') this.content = value; }
  };
  const root = { dataset: {} };
  const state = { savedTheme, appended: null, domReady: null };
  const localStorage = {
    getItem(key) {
      if (storageUnavailable) throw new Error('storage blocked');
      assert.equal(key, 'byteafter-theme');
      return state.savedTheme;
    },
    setItem(key, value) {
      if (storageUnavailable) throw new Error('storage blocked');
      assert.equal(key, 'byteafter-theme');
      state.savedTheme = value;
    }
  };
  const document = {
    documentElement: root,
    body: { append(element) { state.appended = element; } },
    getElementById(id) { return id === 'theme-toggle' ? state.appended : null; },
    querySelector(selector) { return selector === 'meta[name="theme-color"]' ? themeMeta : null; },
    createElement(tag) { assert.equal(tag, 'button'); return button; },
    addEventListener(name, handler, options) {
      assert.equal(name, 'DOMContentLoaded');
      assert.equal(options?.once, true);
      state.domReady = handler;
    }
  };
  vm.runInNewContext(controller, { document, localStorage }, { timeout: 1000 });
  return { root, button, state, themeMeta, handlers, fireDomReady: () => state.domReady() };
}

test('homepage loads one local theme stylesheet and controller', () => {
  assert.equal((homepage.match(/href="theme-toggle\.css\?v=1"/g) || []).length, 1);
  assert.equal((homepage.match(/src="theme-toggle\.js\?v=1"/g) || []).length, 1);
  assert.match(homepage, /name="theme-color" content="#080a16"/);
});

test('the switch is fixed at the marked viewport position and remains accessible on small screens', () => {
  assert.match(css, /\.theme-toggle\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /top:\s*52vh/);
  assert.match(css, /env\(safe-area-inset-right/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)/);
  assert.match(css, /\.theme-toggle:focus-visible\s*\{[^}]*outline:/s);
  assert.match(css, /\.theme-toggle:active\s*\{[^}]*transform:\s*translateY\(-50%\)/s);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(controller, /aria-label',\s*'Day and night mode'/);
  assert.match(controller, /aria-pressed/);
});

test('night is the default, and activating the switch applies and saves day mode', () => {
  const page = createPage();
  assert.equal(page.root.dataset.theme, 'night');
  assert.equal(page.themeMeta.content, '#080a16');
  page.fireDomReady();
  assert.equal(page.button.getAttribute('aria-label'), 'Day and night mode');
  assert.equal(page.button.getAttribute('aria-pressed'), 'false');
  assert.equal(page.button.title, 'Switch to day mode');
  const nightIcon = page.button.innerHTML;
  page.handlers.click();
  assert.equal(page.root.dataset.theme, 'day');
  assert.equal(page.button.getAttribute('aria-pressed'), 'true');
  assert.equal(page.button.title, 'Switch to night mode');
  assert.notEqual(page.button.innerHTML, nightIcon);
  assert.equal(page.themeMeta.content, '#f1f4ed');
  assert.equal(page.state.savedTheme, 'day');
});

test('a saved day preference restores across page loads and toggles back to night', () => {
  const page = createPage('day');
  assert.equal(page.root.dataset.theme, 'day');
  assert.equal(page.themeMeta.content, '#f1f4ed');
  page.fireDomReady();
  assert.equal(page.button.getAttribute('aria-pressed'), 'true');
  assert.equal(page.button.title, 'Switch to night mode');
  page.handlers.click();
  assert.equal(page.root.dataset.theme, 'night');
  assert.equal(page.button.getAttribute('aria-pressed'), 'false');
  assert.equal(page.button.title, 'Switch to day mode');
  assert.equal(page.state.savedTheme, 'night');
});

test('the switch remains usable when browser storage is unavailable', () => {
  const page = createPage(null, true);
  assert.equal(page.root.dataset.theme, 'night');
  page.fireDomReady();
  page.handlers.click();
  assert.equal(page.root.dataset.theme, 'day');
  assert.equal(page.button.getAttribute('aria-pressed'), 'true');
});
