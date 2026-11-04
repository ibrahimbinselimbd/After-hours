import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import { networkTools } from '../site/tools/_shared/network-tools/definitions.mjs';

const root = path.resolve('.');
const toolsRoot = path.join(root, 'site/tools');
const engineSource = await fs.readFile(path.join(toolsRoot, '_shared/network-tools/engine.js'), 'utf8');
const read = relative => fs.readFile(path.join(root, relative), 'utf8');

function makeEngine({fetch = async () => { throw new Error('Unexpected network request'); }, localStorage, navigator = {}} = {}) {
  const window = {};
  let tick = 0;
  const sandbox = {
    window,
    fetch,
    URL,
    URLSearchParams,
    AbortController,
    performance: {now: () => ++tick},
    setTimeout,
    clearTimeout,
    Date,
    crypto: webcrypto,
    navigator,
    location: {origin: 'https://ibrahimbinselimbd.github.io'},
    localStorage: localStorage || {getItem: () => null, setItem: () => {}},
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(engineSource, sandbox, {filename: 'network-tools/engine.js', timeout: 5000});
  return {handlers: window.AHNetworkTools, sandbox};
}

const response = data => ({ok: true, status: 200, json: async () => data});

test('network manifest contains exactly 50 unique routes with one usable engine handler each', async () => {
  assert.equal(networkTools.length, 50);
  assert.equal(new Set(networkTools.map(tool => tool.slug)).size, 50);
  assert.equal(new Set(networkTools.map(tool => tool.title)).size, 50);
  assert.equal(new Set(networkTools.map(tool => tool.handler)).size, 50);
  const pageCount = (await fs.readdir(toolsRoot, {withFileTypes: true})).filter(entry => entry.isDirectory() && networkTools.some(tool => tool.slug === entry.name)).length;
  assert.equal(pageCount, 50);
  const generatedCatalog = {window: {}};
  vm.runInNewContext(await read('site/tools/_shared/network-tools-catalog-data.js'), generatedCatalog);
  assert.equal(generatedCatalog.window.AHNetworkToolCatalog.tools.length, 50);
  const {handlers} = makeEngine();
  for (const tool of networkTools) {
    assert.equal(typeof handlers[tool.handler], 'function', `${tool.slug} has an engine handler`);
    const page = await read(`site/tools/${tool.slug}/index.html`);
    const app = await read(`site/tools/${tool.slug}/app.js`);
    assert.match(page, new RegExp(`data-slug="${tool.slug}"`));
    assert.match(page, new RegExp(`canonical" href="https://ibrahimbinselimbd\\.github\\.io/After-hours/tools/${tool.slug}/`));
    assert.match(page, /All tools are free\. Existing shared daily credit limit: 10 successful actions\. Failed actions use no credit\./);
    assert.match(page, /id="new-tool-config"/);
    assert.match(app, /AHNetworkTools/);
  }
});

test('network catalog is discoverable inside twenty existing categories and page sources disclose request modes', async () => {
  const catalogSandbox = {window: {}, document: {querySelector: () => null, querySelectorAll: () => []}, console};
  vm.createContext(catalogSandbox);
  for (const file of ['planner-catalog-data.js', 'new-tools-catalog-data.js', 'network-tools-catalog-data.js']) {
    vm.runInContext(await read(`site/tools/_shared/${file}`), catalogSandbox);
  }
  vm.runInContext(`${await read('site/tools/catalog.js')}\n;globalThis.__categories=categories;`, catalogSandbox);
  const categories = catalogSandbox.__categories;
  assert.equal(categories.length, 20);
  const active = categories.flatMap(category => category.availableTools);
  assert.equal(active.length, 550);
  const routeSet = new Set(active.map(tool => tool.href));
  for (const tool of networkTools) assert.ok(routeSet.has(`/tools/${tool.slug}/`), `${tool.slug} is linked from the Tools Hub`);

  const remote = await read('site/tools/what-is-my-ip/index.html');
  assert.match(remote, /The live query is not sent unless JavaScript is enabled and you press Run/);
  assert.match(remote, /ipify public IP API/);
  const local = await read('site/tools/ipv4-cidr-calculator/index.html');
  assert.match(local, /This browser-only calculation requires JavaScript/);
  const sameOrigin = await read('site/tools/download-speed-sample/index.html');
  assert.match(sameOrigin, /SAME-SITE TRANSFER/);
  const vpn = await read('site/tools/vpn-webrtc-leak-check/index.html');
  assert.match(vpn, /I understand this test contacts Google STUN/);
  assert.match(vpn, /after you confirm the checkbox/);
  assert.doesNotMatch(vpn, /checkbox" checked/);

  const runtime = await read('site/tools/_shared/network-tools/runtime.js');
  assert.match(runtime, /DIRECT NETWORK REQUEST — This check runs only when you press Run/);
  assert.match(runtime, /response\?\.ok===false[\s\S]*?api\.status/);
  assert.match(runtime, /const charged=api\.credits\.charge\(\)/);
  assert.match(runtime, /No credit was used\./);
});

test('local IP, IPv4/IPv6 prefix, overlap, range-summary and hostname utilities calculate deterministic outputs', async () => {
  const {handlers} = makeEngine();
  const ip = await handlers['ip-address-validator']({address: '2001:db8::1'});
  assert.equal(ip.ok, true);
  assert.match(ip.text, /Address family: IPv6/);
  assert.match(ip.text, /Normalized form: 2001:db8::1/);
  assert.match(ip.text, /Processing: local only/);

  const subnet = await handlers['ipv4-cidr-calculator']({cidr: '192.168.1.25/24'});
  assert.match(subnet.text, /Network: 192\.168\.1\.0\/24/);
  assert.match(subnet.text, /Subnet mask: 255\.255\.255\.0/);
  assert.match(subnet.text, /Broadcast: 192\.168\.1\.255/);
  assert.match(subnet.text, /192\.168\.1\.1 – 192\.168\.1\.254/);
  const pointToPoint = await handlers['ipv4-cidr-calculator']({cidr: '192.0.2.0/31'});
  assert.match(pointToPoint.text, /Broadcast: Not defined/);
  assert.match(pointToPoint.text, /Both addresses are usable on a point-to-point \/31/);
  const hostRoute = await handlers['ipv4-cidr-calculator']({cidr: '192.0.2.9/32'});
  assert.match(hostRoute.text, /Single-address host route/);

  const mask = await handlers['ipv4-subnet-mask-converter']({mask: '255.255.255.192'});
  assert.match(mask.text, /CIDR prefix: \/26/);
  const badMask = await handlers['ipv4-subnet-mask-converter']({mask: '255.0.255.0'});
  assert.equal(badMask.ok, false);
  assert.match(badMask.text, /not contiguous/);

  const summary = await handlers['cidr-range-summarizer']({ranges: '10.0.0.0/25\n10.0.0.128/25'});
  assert.match(summary.text, /10\.0\.0\.0\/24/);
  const overlap = await handlers['ip-range-overlap-checker']({rangeA: '192.168.1.0/24', rangeB: '192.168.1.128/25'});
  assert.match(overlap.text, /Overlap: yes/);
  assert.match(overlap.text, /First range contains the second/);

  const prefix = await handlers['ipv6-prefix-calculator']({cidr: '2001:db8:1234::1/48'});
  assert.match(prefix.text, /Network prefix: 2001:db8:1234::\/48/);
  assert.match(prefix.text, /Address count: 1208925819614629174706176/);
  const idn = await handlers['hostname-idn-converter']({hostname: '例え.テスト'});
  assert.match(idn.text, /ASCII\/Punycode: xn--r8jz45g\.xn--zckzah/);
  const doh = await handlers['doh-query-url-builder']({domain: 'example.com', recordType: 'AAAA', resolver: 'Google Public DNS'});
  assert.match(doh.text, /https:\/\/dns\.google\/resolve\?name=example\.com&amp;type=AAAA|https:\/\/dns\.google\/resolve\?name=example\.com&type=AAAA/);
  assert.match(doh.text, /does not send the query/);
});

test('public DNS handler displays the resolver response, timestamp, TTL, and live endpoint provenance', async () => {
  const seen = [];
  const engine = makeEngine({fetch: async (url, options) => {
    seen.push({url, options});
    return response({Status: 0, AD: true, Answer: [{name: 'example.com.', TTL: 300, data: '93.184.216.34'}]});
  }});
  const output = await engine.handlers['dns-a-record-lookup']({domain: 'example.com'});
  assert.equal(output.ok, true);
  assert.match(output.text, /93\.184\.216\.34/);
  assert.match(output.text, /300s/);
  assert.match(output.text, /Observed: 20/);
  assert.match(output.text, /Cloudflare 1\.1\.1\.1 DNS-over-HTTPS/);
  assert.match(seen[0].url, /^https:\/\/cloudflare-dns\.com\/dns-query\?/);
  assert.equal(seen[0].options.headers.Accept, 'application/dns-json');
  assert.equal(seen[0].options.credentials, 'omit');
  assert.equal(seen[0].options.referrerPolicy, 'no-referrer');
});

test('IP location input is validated before a direct lookup, IP change tracking stores only the last observed address, and unconsented STUN never runs', async () => {
  const seen = [];
  const storage = new Map([['byteafter:network:last-public-ip', '203.0.113.3']]);
  const engine = makeEngine({
    fetch: async (url, options) => { seen.push({url, options}); return response({ip: '203.0.113.4'}); },
    localStorage: {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value)},
  });
  const invalid = await engine.handlers['ip-geolocation-lookup']({ip: 'not-an-ip'});
  assert.equal(invalid.ok, false);
  assert.equal(seen.length, 0, 'invalid inputs do not contact the public provider');
  const tracked = await engine.handlers['public-ip-change-tracker']({});
  assert.match(tracked.text, /Change detected: yes/);
  assert.equal(storage.size, 1, 'the tool stores only its last comparison value');
  assert.equal(storage.get('byteafter:network:last-public-ip'), '203.0.113.4');

  const before = seen.length;
  const refused = await engine.handlers['vpn-webrtc-leak-check']({consent: false});
  assert.equal(refused.ok, false);
  assert.equal(seen.length, before, 'the STUN/IP check stays idle without explicit consent');
  assert.match(refused.text, /No credit was used/);
});

test('a failed public DNS lookup is reported as unavailable instead of invented data', async () => {
  const engine = makeEngine({fetch: async () => ({ok: false, status: 429, json: async () => ({})})});
  const output = await engine.handlers['dns-a-record-lookup']({domain: 'example.com'});
  assert.equal(output.ok, false);
  assert.match(output.text, /HTTP 429 \(rate limit\)/);
  assert.match(output.text, /No credit was used/);
  assert.doesNotMatch(output.text, /93\.184\.216\.34/);
});
