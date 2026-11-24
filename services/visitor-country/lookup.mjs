import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { gunzipSync } from 'node:zlib';

const BITS = Object.freeze({ 4: 32, 6: 128 });

function ipv4ToBigInt(address) {
  return address.split('.').reduce((value, part) => (value << 8n) | BigInt(Number(part)), 0n);
}

function ipv6ToBigInt(address) {
  let normalized = address.toLowerCase();
  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    const ipv4 = normalized.slice(lastColon + 1);
    if (isIP(ipv4) !== 4) return null;
    const value = ipv4ToBigInt(ipv4);
    normalized = `${normalized.slice(0, lastColon)}:${((value >> 16n) & 0xffffn).toString(16)}:${(value & 0xffffn).toString(16)}`;
  }
  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right];
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}

export function parseIpAddress(input) {
  if (typeof input !== 'string' || input.length > 64) return null;
  const address = input.trim();
  const family = isIP(address);
  if (family === 4) return { family, value: ipv4ToBigInt(address) };
  if (family !== 6) return null;
  let value = ipv6ToBigInt(address);
  if (value === null) return null;
  if ((value >> 32n) === 0xffffn) return { family: 4, value: value & 0xffffffffn };
  return { family: 6, value };
}

function parsePrefix(line) {
  const match = /^([A-Z]{2})\|([^|]+)$/i.exec(line.trim());
  if (!match) return null;
  const countryCode = match[1].toUpperCase();
  const [address, rawPrefix] = match[2].split('/');
  const parsed = parseIpAddress(address);
  if (!parsed) return null;
  const prefixLength = rawPrefix === undefined ? BITS[parsed.family] : Number(rawPrefix);
  const bits = BITS[parsed.family];
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > bits) return null;
  return { countryCode, family: parsed.family, prefixLength, network: parsed.value >> BigInt(bits - prefixLength) };
}

export function createCountryPrefixLookup(prefixLines) {
  const indexes = {
    4: Array.from({ length: BITS[4] + 1 }, () => new Map()),
    6: Array.from({ length: BITS[6] + 1 }, () => new Map())
  };
  for (const line of String(prefixLines).split(/\r?\n/)) {
    if (!line) continue;
    const prefix = parsePrefix(line);
    if (!prefix) continue;
    const index = indexes[prefix.family][prefix.prefixLength];
    if (index.has(prefix.network)) {
      if (index.get(prefix.network) !== prefix.countryCode) index.set(prefix.network, null);
    } else {
      index.set(prefix.network, prefix.countryCode);
    }
  }
  return input => {
    const parsed = parseIpAddress(input);
    if (!parsed) return null;
    const bits = BITS[parsed.family];
    const familyIndexes = indexes[parsed.family];
    for (let prefixLength = bits; prefixLength >= 0; prefixLength--) {
      const key = parsed.value >> BigInt(bits - prefixLength);
      const index = familyIndexes[prefixLength];
      if (index.has(key)) return index.get(key);
    }
    return null;
  };
}

export async function loadVisitorCountryLookup() {
  const [compressed, centroidsText] = await Promise.all([
    readFile(new URL('./ip-country-prefixes.txt.gz', import.meta.url)),
    readFile(new URL('./country-centroids.json', import.meta.url), 'utf8')
  ]);
  const findCountry = createCountryPrefixLookup(gunzipSync(compressed).toString('utf8'));
  const centroids = JSON.parse(centroidsText);
  return input => {
    const countryCode = findCountry(input);
    const point = countryCode ? centroids[countryCode] : null;
    if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
    return { countryCode, longitude: point[0], latitude: point[1] };
  };
}
