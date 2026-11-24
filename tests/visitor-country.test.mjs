import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'node:http';
import { createCountryPrefixLookup, parseIpAddress } from '../services/visitor-country/lookup.mjs';
import { createAppServer } from '../server.mjs';

let activeServers = new Set();
after(async () => {
  await Promise.all([...activeServers].map(server => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections?.();
  })));
});

function makeServer(lookup) {
  const server = createAppServer({ visitorCountryLookup: lookup });
  activeServers.add(server);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      baseUrl: `http://127.0.0.1:${server.address().port}`
    }));
  });
}

test('IPv4 addresses match their country prefix', () => {
  const lookup = createCountryPrefixLookup('BD|103.197.52.0/24\n');
  assert.equal(lookup('103.197.52.9'), 'BD');
  assert.equal(lookup('103.197.53.9'), null);
});

test('IPv6 addresses match their country prefix', () => {
  const lookup = createCountryPrefixLookup('JP|2001:db8:abcd::/48\n');
  assert.equal(lookup('2001:db8:abcd::1234'), 'JP');
  assert.equal(lookup('2001:db8:abce::1'), null);
});

test('IPv4-mapped IPv6 addresses are normalized to IPv4', () => {
  const lookup = createCountryPrefixLookup('BD|203.0.113.0/24\n');
  assert.deepEqual(parseIpAddress('::ffff:203.0.113.11'), parseIpAddress('203.0.113.11'));
  assert.equal(lookup('::ffff:203.0.113.11'), 'BD');
});

test('the most specific matching prefix takes precedence', () => {
  const lookup = createCountryPrefixLookup('US|198.51.100.0/24\nBD|198.51.100.128/25\n');
  assert.equal(lookup('198.51.100.127'), 'US');
  assert.equal(lookup('198.51.100.128'), 'BD');
  assert.equal(lookup('198.51.100.255'), 'BD');
});

test('unknown, malformed, and conflicting addresses do not receive a country', () => {
  const lookup = createCountryPrefixLookup('US|198.51.100.0/24\nBD|203.0.113.0/24\nUS|203.0.113.0/24\n');
  assert.equal(lookup('192.0.2.1'), null);
  assert.equal(lookup('not-an-ip'), null);
  assert.equal(lookup('203.0.113.10'), null);
});

test('visitor-country endpoint returns only country and approximate coordinates with no-store headers', async () => {
  let seenIp;
  const { server, baseUrl } = await makeServer(ip => {
    seenIp = ip;
    return { countryCode: 'BD', latitude: 23.685, longitude: 90.356 };
  });
  try {
    const response = await fetch(`${baseUrl}/api/v1/visitor-country`, {
      headers: { 'x-real-ip': '103.197.52.9' },
      cache: 'no-store'
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(seenIp, '103.197.52.9');
    assert.deepEqual(body, { countryCode: 'BD', latitude: 23.685, longitude: 90.356 });
    assert.deepEqual(Object.keys(body).sort(), ['countryCode', 'latitude', 'longitude']);
    assert.equal(JSON.stringify(body).includes('103.197.52.9'), false);
  } finally {
    activeServers.delete(server);
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
});

test('unknown visitor address returns null location without echoing the address', async () => {
  const { server, baseUrl } = await makeServer(() => null);
  try {
    const response = await fetch(`${baseUrl}/api/v1/visitor-country`, {
      headers: { 'x-real-ip': 'not-an-ip' },
      cache: 'no-store'
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { countryCode: null, latitude: null, longitude: null });
  } finally {
    activeServers.delete(server);
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
});

test('visitor-country endpoint accepts GET only', async () => {
  const { server, baseUrl } = await makeServer(() => null);
  try {
    const response = await fetch(`${baseUrl}/api/v1/visitor-country`, { method: 'POST' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { ok: false, code: 'method_not_allowed' });
  } finally {
    activeServers.delete(server);
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
});
