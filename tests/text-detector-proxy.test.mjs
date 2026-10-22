import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createAppServer } from '../server.mjs';

// TEST ONLY upstream responses. These are never imported by production code.
const text = Array(80).fill('word').join(' ');
async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; }
async function close(server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
const post = (url, body = { text, mode: 'article' }) => fetch(`${url}/api/v1/text/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('unconfigured service is explicitly unavailable; static routes still work', async () => {
  const server = createAppServer({ detectorOrigin: '' }); const url = await listen(server);
  try {
    for (const response of [await fetch(`${url}/api/v1/text/health`), await post(url)]) {
      assert.equal(response.status, 503); assert.equal((await response.json()).code, 'service_not_configured');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    const page = await fetch(`${url}/tools/text-detector/`); assert.equal(page.status, 200); assert.match(await page.text(), /COMING SOON — NOT LIVE/);
    assert.equal((await fetch(`${url}/tools/`)).status, 200);
    assert.equal((await fetch(`${url}/api/v1/text/analyze`)).status, 405);
  } finally { await close(server); }
});

test('real proxy path, private auth forwarding, validation and fail-closed responses', async () => {
  let kind = 'success'; let requests = 0; let lastBody; let lastKey;
  const upstream = http.createServer(async (req, res) => {
    requests++; lastKey = req.headers['x-api-key'];
    const chunks = []; for await (const c of req) chunks.push(c);
    if (chunks.length) lastBody = JSON.parse(Buffer.concat(chunks).toString());
    res.setHeader('content-type', 'application/json');
    if (kind === 'invalid-json') return res.end('<html>not JSON</html>');
    if (kind === 'error') { res.statusCode = 422; return res.end(JSON.stringify({ detail: { error: 'text_too_short' } })); }
    if (kind === 'private-error') { res.statusCode = 401; return res.end(JSON.stringify({ error: 'unauthorized', secret: 'TEST ONLY private detail' })); }
    if (kind === 'busy') { res.statusCode = 503; return res.end(JSON.stringify({ detail: { error: 'inference_busy' } })); }
    if (kind === 'health') return res.end(JSON.stringify({ status: 'ready', model: 'TEST ONLY model' }));
    if (kind === 'not-ready') return res.end(JSON.stringify({ status: 'not_ready' }));
    const words = lastBody.text.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu).length;
    res.end(JSON.stringify({ ok: true, word_count: words, coverage: { complete: kind !== 'partial', scored_words: words }, result: { assessment: 'mixed_signals', ai_signal_score: 50, segments: [] } }));
  });
  const origin = await listen(upstream);
  const server = createAppServer({ detectorOrigin: origin, detectorApiKey: 'TEST-ONLY-NOT-A-REAL-KEY' }); const url = await listen(server);
  try {
    let response = await post(url); assert.equal(response.status, 200); assert.equal((await response.json()).ok, true);
    assert.equal(lastKey, 'TEST-ONLY-NOT-A-REAL-KEY'); assert.equal(lastBody.text, text);
    response = await post(url, { text: Array(8000).fill('word').join(' '), mode: 'article' }); assert.equal(response.status, 200); assert.equal((await response.json()).word_count, 8000);
    const before = requests;
    for (const [payload, status, code] of [
      [{ text: 'short', mode: 'article' }, 422, 'text_too_short'],
      [{ text: Array(59).fill('word').join(' '), mode: 'prompt' }, 422, 'text_too_short'],
      [{ text, mode: 'unknown' }, 422, 'invalid_mode'],
      [{ text: Array(8001).fill('word').join(' '), mode: 'article' }, 413, 'text_too_long'],
      [{ text: 'x'.repeat(50001), mode: 'article' }, 413, 'text_too_long']
    ]) { response = await post(url, payload); assert.equal(response.status, status); assert.equal((await response.json()).code, code); }
    assert.equal(requests, before, 'invalid input never sent to upstream');
    response = await post(url, { text: Array(60).fill('word').join(' '), mode: 'prompt' }); assert.equal(response.status, 200);
    response = await fetch(`${url}/api/v1/text/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken' }); assert.equal(response.status, 400); assert.equal((await response.json()).code, 'invalid_json');
    response = await post(url, { text: 'x'.repeat(330000) }); assert.equal(response.status, 413); assert.equal((await response.json()).code, 'body_too_large');
    for (const [value, status, code] of [['error', 422, 'text_too_short'], ['private-error', 502, 'detector_error'], ['busy', 503, 'rate_limited'], ['partial', 502, 'invalid_upstream_response'], ['invalid-json', 502, 'invalid_upstream_response']]) {
      kind = value; response = await post(url); assert.equal(response.status, status); assert.equal((await response.json()).code, code);
    }
    kind = 'health'; response = await fetch(`${url}/api/v1/text/health`); assert.equal(response.status, 200); assert.equal((await response.json()).status, 'ready');
    kind = 'not-ready'; response = await fetch(`${url}/api/v1/text/health`); assert.equal(response.status, 503);
  } finally { await close(server); await close(upstream); }
});

test('timeouts and invalid/insecure origin fail closed', async () => {
  assert.throws(() => createAppServer({ detectorOrigin: 'http://example.com' }), /HTTPS/);
  assert.throws(() => createAppServer({ detectorOrigin: 'https://example.com/private-path' }), /HTTPS/);
  const upstream = http.createServer(() => {}); const origin = await listen(upstream);
  const server = createAppServer({ detectorOrigin: origin, upstreamTimeoutMs: 30 }); const url = await listen(server);
  try { const response = await post(url); assert.equal(response.status, 502); assert.equal((await response.json()).code, 'detector_timeout'); }
  finally { await close(server); await close(upstream); }
});
