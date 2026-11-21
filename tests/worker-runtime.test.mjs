import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker.js';

const themeCount = (html, expression) => (html.match(expression) || []).length;

test('Cloudflare Worker adds shared theme control and day styling to static HTML responses', async () => {
  const source = '<!doctype html><html><head><meta name="theme-color" content="#080a16"></head><body><main>Article</main></body></html>';
  const response = await worker.fetch(new Request('https://byteafter.example/article.html?story=test'), {
    ASSETS: { fetch: async () => new Response(source, { headers: { 'content-type': 'text/html; charset=utf-8', etag: 'stale-source-etag', 'content-length': String(source.length) } }) }
  });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(themeCount(html, /theme-toggle\.css/g), 1);
  assert.equal(themeCount(html, /pages-theme\.css/g), 1);
  assert.equal(themeCount(html, /theme-toggle\.js/g), 1);
  assert.match(html, /name="theme-color" content="#080a16"/);
  assert.equal(response.headers.get('content-length'), null);
  assert.equal(response.headers.get('etag'), null);
});

test('Cloudflare Worker does not duplicate theme assets already present in HTML', async () => {
  const source = '<html><head><link rel="stylesheet" href="theme-toggle.css?v=1"><link rel="stylesheet" href="pages-theme.css?v=1"></head><body><script defer src="theme-toggle.js?v=1"></script></body></html>';
  const response = await worker.fetch(new Request('https://byteafter.example/'), {
    ASSETS: { fetch: async () => new Response(source, { headers: { 'content-type': 'text/html' } }) }
  });
  const html = await response.text();
  assert.equal(themeCount(html, /theme-toggle\.css/g), 1);
  assert.equal(themeCount(html, /pages-theme\.css/g), 1);
  assert.equal(themeCount(html, /theme-toggle\.js/g), 1);
});

test('passport-photo proxy rejects an oversized body stream before calling the model service', async () => {
  const maxBytes = 15 * 1024 * 1024;
  const chunks = [new Uint8Array(maxBytes - 8), new Uint8Array(16), new Uint8Array(32)];
  let nextChunk = 0;
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      if (nextChunk < chunks.length) controller.enqueue(chunks[nextChunk++]);
      else controller.close();
    },
    cancel() { cancelled = true; }
  });
  const request = new Request('https://byteafter.example/api/v1/passport-photo/background-remove', {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body,
    duplex: 'half'
  });
  const previousFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => { upstreamCalls++; return new Response('unexpected'); };
  try {
    const response = await worker.fetch(request, {
      PASSPORT_PHOTO_SERVICE_ORIGIN: 'https://model.example',
      PASSPORT_PHOTO_SERVICE_TOKEN: 'test-only-token-that-is-long-enough-for-the-guard'
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).code, 'image_too_large');
    assert.equal(upstreamCalls, 0);
    assert.ok(cancelled);
    assert.equal(nextChunk, 2, 'the reader must cancel instead of consuming the remaining stream');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('passport-photo proxy forwards a bounded streamed body intact', async () => {
  const request = new Request('https://byteafter.example/api/v1/passport-photo/background-remove', {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }),
    duplex: 'half'
  });
  const previousFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (_url, options) => {
    forwarded = new Uint8Array(options.body);
    return new Response(new Uint8Array([7]), { headers: { 'content-type': 'image/png' } });
  };
  try {
    const response = await worker.fetch(request, {
      PASSPORT_PHOTO_SERVICE_ORIGIN: 'https://model.example',
      PASSPORT_PHOTO_SERVICE_TOKEN: 'test-only-token-that-is-long-enough-for-the-guard'
    });
    assert.equal(response.status, 200);
    assert.deepEqual([...forwarded], [1, 2, 3]);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [7]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
