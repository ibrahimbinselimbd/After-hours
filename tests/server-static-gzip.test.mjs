import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import { createAppServer } from '../server.mjs';

const assetPath = '/tools/heic-to-jpg/vendor/heic-engine-1.6.6.js';
const assetFile = new URL('../site/tools/heic-to-jpg/vendor/heic-engine-1.6.6.js', import.meta.url);

function request(port, { method = 'GET', acceptEncoding } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Connection: 'close' };
    if (acceptEncoding !== undefined) headers['Accept-Encoding'] = acceptEncoding;
    const req = http.request({ hostname: '127.0.0.1', port, path: assetPath, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('static HEIC engine JavaScript negotiates gzip without changing its content', async t => {
  const server = createAppServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const { port } = server.address();
  const original = await readFile(assetFile);

  const compressed = await request(port, { acceptEncoding: 'gzip, deflate, br' });
  assert.equal(compressed.status, 200);
  assert.equal(compressed.headers['content-encoding'], 'gzip');
  assert.ok(compressed.headers.vary?.split(',').map(value => value.trim()).includes('Accept-Encoding'));
  assert.equal(Number(compressed.headers['content-length']), compressed.body.length);
  assert.ok(compressed.body.length < original.length / 2);
  assert.deepEqual(gunzipSync(compressed.body), original);

  const spaced = await request(port, { acceptEncoding: 'gzip ; Q = 1, identity;Q=0' });
  assert.equal(spaced.status, 200);
  assert.equal(spaced.headers['content-encoding'], 'gzip');
  assert.deepEqual(gunzipSync(spaced.body), original);

  const identity = await request(port, { acceptEncoding: 'gzip;Q=0, *;Q=1' });
  assert.equal(identity.status, 200);
  assert.equal(identity.headers['content-encoding'], undefined);
  assert.equal(Number(identity.headers['content-length']), original.length);
  assert.deepEqual(identity.body, original);

  const noSupportedEncoding = await request(port, { acceptEncoding: 'gzip;q=0, identity;q=0' });
  assert.equal(noSupportedEncoding.status, 406);
  assert.equal(noSupportedEncoding.body.length, 0);

  const head = await request(port, { method: 'HEAD', acceptEncoding: 'gzip' });
  assert.equal(head.status, 200);
  assert.equal(head.headers['content-encoding'], 'gzip');
  assert.equal(Number(head.headers['content-length']), compressed.body.length);
  assert.equal(head.body.length, 0);
});
