import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(repoRoot, 'site/tools/password-generator/app.js'), 'utf8');

test('password generator reports clipboard failure as an error and success only when copy succeeds', async () => {
  const listeners = new Map();
  const nodes = new Map();
  const makeNode = selector => {
    const node = {value: selector === '#pg-mode' ? 'password' : selector === '#pg-length' ? '20' : '', checked: true, hidden: false, disabled: false, textContent: '', addEventListener(type, callback) { listeners.set(`${selector}:${type}`, callback); }};
    nodes.set(selector, node);
    return node;
  };
  for (const selector of ['#pg-mode', '#pg-length', '#pg-output', '#pg-status', '#pg-generate', '#pg-copy', '#pg-download']) makeNode(selector);
  let copySucceeds = false;
  const api = {
    mount() {},
    credits: {canRun: () => true, charge() {}},
    status(node, message, kind) { node.textContent = message; node.kind = kind; node.hidden = false; },
    async copy() { return copySucceeds; },
    downloadText() {},
  };
  const document = {querySelector(selector) { return nodes.get(selector) || null; }};
  vm.runInNewContext(source, {window: {AHToolkit: api}, document});
  const copy = listeners.get('#pg-copy:click');
  assert.equal(typeof copy, 'function', 'copy button handler should be registered');

  await copy();
  assert.equal(nodes.get('#pg-status').kind, 'error');
  assert.match(nodes.get('#pg-status').textContent, /Copy failed/);
  assert.match(nodes.get('#pg-status').textContent, /copy it manually/);

  copySucceeds = true;
  await copy();
  assert.equal(nodes.get('#pg-status').kind, 'success');
  assert.equal(nodes.get('#pg-status').textContent, 'Copied to clipboard.');
});
