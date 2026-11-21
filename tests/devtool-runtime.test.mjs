import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve('.');
const runtimePath = path.join(root, 'site/tools/_shared/devtool-runtime.js');
const runtimeSource = await fs.readFile(runtimePath, 'utf8');

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.attributes = {};
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
  }

  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  dispatch(type) { return this.listeners.get(type)?.({target: this, preventDefault() {}}); }
}

function descendants(node) {
  return [node, ...node.children.flatMap(descendants)];
}

function harness(engine) {
  const host = new Element('div');
  host.id = 'tool-content';
  const document = {
    createElement: tag => new Element(tag),
    getElementById(id) { return descendants(host).find(node => node.id === id) || null; },
  };
  const charged = {count: 0};
  const copied = [];
  const downloaded = [];
  const api = {
    status(target, message, kind = '') {
      target.textContent = message;
      target.className = `status${kind ? ` ${kind}` : ''}`;
      target.hidden = !message;
    },
    copy: async text => { copied.push(String(text)); return true; },
    download: (blob, filename) => downloaded.push({blob, filename}),
    credits: {
      canRun: () => true,
      charge: () => { charged.count += 1; return true; },
    },
  };
  const window = {};
  const sandbox = {window, document, Blob, console, String, Number, Set, Math};
  vm.runInNewContext(runtimeSource, sandbox, {filename: runtimePath, timeout: 5000});
  window.AHDeveloperRuntime.mount(engine, api, api.credits);
  const find = selector => {
    if (selector.startsWith('#')) return document.getElementById(selector.slice(1));
    return descendants(host).find(node => selector === '.result' ? node.className === 'result' : node.tagName === selector.toUpperCase()) || null;
  };
  return {host, document, window, find, all: () => descendants(host), charged, copied, downloaded};
}

test('developer-tool input edits hide stale output and disable copy/download actions', async () => {
  const h = harness({
    slug: 'runtime-test',
    fields: [{id: 'status', label: 'Input status', type: 'text'}],
    run: values => ({text: `Result for ${values.status}`}),
  });
  const input = h.find('#devtool-input-status');
  const run = h.find('button');
  const buttons = h.all().filter(node => node.tagName === 'BUTTON');
  const copy = buttons.find(node => node.textContent === 'Copy result');
  const download = buttons.find(node => node.textContent === 'Download result');
  const status = h.find('#devtool-runtime-status');
  const result = h.find('.result');
  const output = h.all().find(node => node.getAttribute('aria-label') === 'Tool result');

  assert.ok(input && run && copy && download && status && result && output);
  await run.dispatch('click');
  assert.equal(result.hidden, false);
  assert.equal(output.textContent, 'Result for ');
  assert.equal(copy.disabled, false);
  assert.equal(download.disabled, false);
  assert.equal(h.charged.count, 1);

  input.value = 'updated input';
  input.dispatch('input');
  assert.equal(result.hidden, true);
  assert.equal(output.textContent, '');
  assert.equal(copy.disabled, true);
  assert.equal(download.disabled, true);
  assert.match(status.textContent, /Inputs changed\. Run again/);

  await run.dispatch('click');
  assert.equal(result.hidden, false);
  assert.equal(output.textContent, 'Result for updated input');
  await copy.dispatch('click');
  download.dispatch('click');
  assert.match(h.copied[0], /updated input/);
  assert.equal(h.downloaded[0].filename, 'runtime-test-result.txt');
  assert.equal(h.charged.count, 2);
});

test('developer-tool input edits discard pending asynchronous results without charging', async () => {
  let resolve;
  const h = harness({
    slug: 'async-runtime-test',
    fields: [{id: 'value', label: 'Value', type: 'textarea'}],
    run: () => new Promise(done => { resolve = done; }),
  });
  const input = h.find('#devtool-input-value');
  const run = h.find('button');
  const result = h.find('.result');
  const output = h.all().find(node => node.getAttribute('aria-label') === 'Tool result');

  input.value = 'before';
  const pending = run.dispatch('click');
  input.value = 'after';
  input.dispatch('input');
  resolve({text: 'stale result'});
  await pending;

  assert.equal(result.hidden, true);
  assert.equal(output.textContent, '');
  assert.equal(h.charged.count, 0);
  assert.equal(run.disabled, false);
});

test('developer-tool status IDs remain unique when an input is named status', async () => {
  const h = harness({
    slug: 'status-collision-test',
    fields: [{id: 'status', label: 'HTTP status', type: 'text'}],
    run: values => ({text: `HTTP status ${values.status || 'missing'}`}),
  });
  const ids = h.all().map(node => node.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, 'the generated DOM must not contain duplicate IDs');
  assert.ok(h.find('#devtool-input-status'));
  assert.equal(h.find('#devtool-runtime-status').getAttribute('role'), 'status');
  h.find('#devtool-input-status').value = '403';
  await h.find('button').dispatch('click');
  assert.equal(h.find('#devtool-runtime-status').textContent, 'Completed locally. One shared daily credit was used.');
});
