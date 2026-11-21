import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve('.');
const read = file => fs.readFile(path.join(root, file), 'utf8');

class Element {
  constructor(tag, id, attrs = {}, content = '') {
    this.tagName = tag.toUpperCase(); this.id = id; this.attrs = attrs; this.listeners = {};
    this.textContent = content.replace(/<[^>]*>/g, '').trim(); this.hidden = Boolean(attrs.hidden);
    this.disabled = Boolean(attrs.disabled); this.value = attrs.value || ''; this.checked = Boolean(attrs.checked);
    this.required = Boolean(attrs.required); this.min = attrs.min ?? ''; this.max = attrs.max ?? '';
    this.type = attrs.type || ''; this.className = attrs.class || ''; this.dataset = {};
    this.selectedIndex = 0; this.labels = [];
  }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  dispatch(type, event = {}) { return this.listeners[type]?.({preventDefault() {}, ...event}); }
  focus() {}
}

function parseAttrs(text) {
  const attrs = {};
  for (const match of text.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[match[1]] = match[2] ?? true;
  return attrs;
}
function makeRuntimeHarness(kind, {handler, fields, title = 'Regression tool'} = {}) {
  const slug = kind === 'planner' ? 'runtime-race-test' : 'new-runtime-race-test';
  const elements = new Map();
  const host = {innerHTML: '', setContent(html) {
    this.innerHTML = html;
    const re = /<(input|textarea|select|button|section|div|pre)\b([^>]*\bid="([^"]+)"[^>]*)>/g;
    for (const match of html.matchAll(re)) {
      const [,tag, attrText,id] = match;
      if (elements.has(id)) continue;
      const attrs = parseAttrs(attrText);
      let close = '';
      if (!['input'].includes(tag)) {
        const start = match.index + match[0].length;
        const end = html.indexOf(`</${tag}>`, start);
        if (end >= 0) close = html.slice(start, end);
      }
      elements.set(id, new Element(tag, id, attrs, close));
    }
  }};
  elements.set('tool-content', host);
  const document = {
    body: {dataset: {slug}},
    getElementById(id) { return elements.get(id) || null; },
  };
  const charged = {count: 0}; const copied = []; const downloaded = [];
  const api = {
    escape: text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    mount(html) { host.setContent(html); return host; },
    credits: {canRun: () => true, charge: () => { charged.count++; return true; }},
    status(element, text, level = '') { element.textContent = text; element.dataset.level = level; element.hidden = !text; },
    copy: async text => { copied.push(text); return true; },
    downloadText: (text, filename) => downloaded.push({text, filename}),
  };
  const window = {AHToolkit: api};
  if (kind === 'planner') {
    window.AHPlannerTools = [{slug, title, description: 'test', fields: fields || [{id:'value',label:'Value',type:'text'}]}];
    window.AHPlannerHandlers = {[slug]: handler};
  } else { window.AHNewToolHandlers = {[slug]: handler}; }
  const config = {slug, title, description: 'test', limitations: 'test', fields: fields || [{id:'value',label:'Value',type:'text'}]};
  elements.set('new-tool-config', {textContent: JSON.stringify(config)});
  const local = new Map();
  const localStorage = {getItem: key => local.get(key) || null, setItem: (key,value) => local.set(key,value), removeItem: key => local.delete(key)};
  const sandbox = {window, document, localStorage, console, Map, Set, String, Number, Object, Array, JSON, Promise};
  return {sandbox, elements, charged, copied, downloaded, local, slug};
}

async function mountRuntime(kind, options) {
  const h = makeRuntimeHarness(kind, options);
  const file = kind === 'planner' ? 'site/tools/_shared/planner-runtime.js' : 'site/tools/_shared/new-tools/runtime.js';
  vm.runInNewContext(await read(file), h.sandbox, {filename:file, timeout:5000});
  return h;
}

for (const kind of ['planner', 'new-tool']) {
  test(`${kind} runtime discards a pending async result after input edit without charging`, async () => {
    let resolve;
    const handler = () => new Promise(done => { resolve = done; });
    const h = await mountRuntime(kind, {handler});
    const prefix = kind === 'planner' ? 'planner' : 'new-tool';
    const inputId = kind === 'planner' ? `planner-${h.slug}-value` : `new-tool-${h.slug}-value`;
    const run = h.elements.get(`${prefix}-run`), input = h.elements.get(inputId), result = h.elements.get(`${prefix}-result`);
    const pending = run.dispatch('click');
    input.value = 'edited'; input.dispatch('input');
    resolve({summary:'stale result', details:['must not be exposed']});
    await pending;
    assert.equal(result.hidden, true);
    assert.equal(h.elements.get(`${prefix}-output`).textContent, '');
    assert.equal(h.charged.count, 0);
  });

  test(`${kind} runtime invalidates pending work on Clear and displays/copies/downloads current details`, async () => {
    let resolve;
    const handler = values => values.value === 'pending' ? new Promise(done => { resolve = done; }) : ({summary:'Current summary', details:['Current detail row'], warnings:['Current caveat']});
    const h = await mountRuntime(kind, {handler});
    const prefix = kind === 'planner' ? 'planner' : 'new-tool';
    const inputId = kind === 'planner' ? `planner-${h.slug}-value` : `new-tool-${h.slug}-value`;
    const input = h.elements.get(inputId), run = h.elements.get(`${prefix}-run`), clear = h.elements.get(`${prefix}-clear`);
    input.value = 'pending';
    const pending = run.dispatch('click');
    clear.dispatch('click');
    resolve({summary:'cleared stale result'});
    await pending;
    assert.equal(h.charged.count, 0, 'Clear must invalidate and avoid charging the pending result');
    assert.equal(h.elements.get(`${prefix}-result`).hidden, true);

    input.value = 'current';
    await run.dispatch('click');
    const output = h.elements.get(`${prefix}-output`);
    assert.match(output.textContent, /Current summary[\s\S]*Current detail row[\s\S]*Current caveat/);
    await h.elements.get(`${prefix}-copy`).dispatch('click');
    h.elements.get(`${prefix}-download`).dispatch('click');
    assert.match(h.copied[0], /Current detail row/);
    assert.match(h.downloaded[0].text, /Current detail row/);
    assert.equal(h.charged.count, 1);
  });
}

function appHarness(file) {
  const ids = file.includes('age-calculator') ? ['birth','asof','run','out','status'] : ['date','amount','unit','run','out','status'];
  const elements = new Map(ids.map(id => [id,new Element(id==='run'?'button':id==='out'?'div':id==='status'?'div':id==='unit'?'select':'input',id)]));
  const rootNode = {querySelector: selector => elements.get(selector.slice(1))};
  let charges = 0;
  const api = {mount: () => rootNode, credits:{canRun:()=>true,charge:()=>{charges++;return true;}},status:(el,text,level)=>{el.textContent=text;el.dataset.level=level;}};
  const sandbox = {window:{AHToolkit:api},Intl,Date,String,Number,Math};
  return {elements,sandbox,get charges(){return charges;}};
}

test('age calculator uses clamped calendar anniversaries for leap-day and month-end dates', async () => {
  const h=appHarness('age-calculator'); vm.runInNewContext(await read('site/tools/age-calculator/app.js'),h.sandbox);
  const birth=h.elements.get('birth'), asof=h.elements.get('asof'), run=h.elements.get('run'), out=h.elements.get('out');
  birth.value='2000-01-31'; asof.value='2000-02-29'; run.onclick();
  assert.match(out.innerHTML,/0 years, 1 month, 0 days/);
  birth.value='2000-02-29'; asof.value='2001-02-28'; run.onclick();
  assert.match(out.innerHTML,/1 year, 0 months, 0 days/);
  birth.value='2000-01-31'; asof.value='2000-03-01'; run.onclick();
  assert.match(out.innerHTML,/0 years, 1 month, 1 day/);
  assert.equal(h.charges,3);
});

test('date planner month-end arithmetic keeps displayed local date and ISO date aligned', async () => {
  const h=appHarness('date-add-subtract-planner'); vm.runInNewContext(await read('site/tools/date-add-subtract-planner/app.js'),h.sandbox);
  const date=h.elements.get('date'),amount=h.elements.get('amount'),unit=h.elements.get('unit'),run=h.elements.get('run'),out=h.elements.get('out');
  date.value='2025-01-31'; amount.value='1'; unit.value='months'; run.onclick();
  assert.match(out.innerHTML,/February 28, 2025/);
  assert.match(out.innerHTML,/\(2025-02-28\)/);
  date.value='2024-02-29'; amount.value='1'; unit.value='years'; run.onclick();
  assert.match(out.innerHTML,/February 28, 2025/);
  assert.match(out.innerHTML,/\(2025-02-28\)/);
});
