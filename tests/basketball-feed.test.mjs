import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test, describe } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  DAILY_REQUEST_CAP,
  SNAPSHOT_INTERVAL_MS,
  getBasketballFeed,
  handleBasketballRequest,
  normalizeBasketballGame
} from '../services/scores/basketball.mjs';

const migration = await readFile(new URL('../migrations/0001_basketball_feed.sql', import.meta.url), 'utf8');

function makeDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration);
  return {
    sqlite,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              return sqlite.prepare(sql).get(...values) ?? null;
            },
            async run() {
              const result = sqlite.prepare(sql).run(...values);
              return { success: true, meta: result };
            }
          };
        },
        async first() {
          return sqlite.prepare(sql).get() ?? null;
        },
        async run() {
          const result = sqlite.prepare(sql).run();
          return { success: true, meta: result };
        }
      };
    }
  };
}

function response(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

function upstreamGame(status, overrides = {}) {
  return {
    id: 42,
    date: '2026-01-01T19:30:00+00:00',
    status: { short: status, long: status === 'Q2' ? 'Second Quarter' : status === 'NS' ? 'Not Started' : 'Finished', timer: status === 'Q2' ? '04:12' : null },
    league: { name: 'Test League' },
    teams: { home: { name: 'Home Hawks' }, away: { name: 'Away Bears' } },
    scores: { home: { total: 0 }, away: { total: 7 } },
    venue: { name: 'Test Arena' },
    ...overrides
  };
}

function successfulFetch(body = { response: [upstreamGame('Q2')] }, calls = []) {
  return async (url, options) => {
    calls.push({ url, options });
    return response(body, { headers: { 'x-ratelimit-requests-remaining': '99' } });
  };
}

function env(db, key = 'test-api-key') {
  return { SCORES_DB: db, API_SPORTS_KEY: key };
}

describe('basketball normalization', () => {
  test('maps live quarter and halftime, upcoming, and finished statuses', () => {
    const cases = [
      ['Q1', 'live'], ['Q2', 'live'], ['Q3', 'live'], ['Q4', 'live'], ['OT', 'live'], ['BT', 'live'], ['HT', 'live'],
      ['NS', 'upcoming'], ['FT', 'finished'], ['AOT', 'finished'], ['AWD', 'finished']
    ];
    for (const [source, expected] of cases) {
      const game = normalizeBasketballGame(upstreamGame(source));
      assert.equal(game.status, expected, source);
      assert.equal(game.sport, 'basketball');
    }
    assert.equal(normalizeBasketballGame(upstreamGame('Q2')).period, 'Second Quarter · 04:12');
    assert.equal(normalizeBasketballGame(upstreamGame('HT')).period, 'Finished');
  });

  test('ignores cancelled, suspended, unknown, malformed, and non-basketball-shaped records', () => {
    for (const status of ['CANC', 'PST', 'SUSP', 'ABD', 'UNKNOWN', 'LIVE']) {
      assert.equal(normalizeBasketballGame(upstreamGame(status)), null, status);
    }
    assert.equal(normalizeBasketballGame(upstreamGame('FT', { teams: { home: { name: '' }, away: { name: 'Away' } } })), null);
    assert.equal(normalizeBasketballGame(upstreamGame('FT', { date: 'not-a-date' })), null);
  });

  test('preserves zero scores and only emits basketball records', () => {
    const game = normalizeBasketballGame(upstreamGame('FT', {
      id: 7,
      scores: { home: { total: 0 }, away: { total: 0 } }
    }));
    assert.equal(game.home.score, 0);
    assert.equal(game.away.score, 0);
    assert.equal(game.sport, 'basketball');
  });
});

describe('basketball feed cache and quota', () => {
  test('coalesces concurrent requests into one upstream call, then observes the 15-minute cache', async () => {
    const db = makeDb();
    const calls = [];
    const fetchImpl = successfulFetch(undefined, calls);
    const now = Date.parse('2026-01-01T12:00:00Z');
    const [first, second] = await Promise.all([
      getBasketballFeed(env(db), { now, fetchImpl }),
      getBasketballFeed(env(db), { now, fetchImpl })
    ]);
    assert.equal(calls.length, 1);
    assert.equal(first.connected || second.connected, true);
    const cached = await getBasketballFeed(env(db), { now: now + SNAPSHOT_INTERVAL_MS - 1, fetchImpl });
    assert.equal(calls.length, 1);
    assert.equal(cached.stale, false);
    assert.equal(cached.matches.length, 1);
    const refreshed = await getBasketballFeed(env(db), { now: now + SNAPSHOT_INTERVAL_MS, fetchImpl });
    assert.equal(calls.length, 2);
    assert.equal(refreshed.stale, false);
  });

  test('uses the fixed UTC upstream URL and header without putting the credential in the payload', async () => {
    const db = makeDb();
    const calls = [];
    const key = 'super-secret-key';
    await getBasketballFeed(env(db, key), {
      now: Date.parse('2026-02-03T08:09:10Z'),
      fetchImpl: successfulFetch(undefined, calls)
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://v1.basketball.api-sports.io/games?date=2026-02-03&timezone=UTC');
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[0].options.headers['x-apisports-key'], key);
    assert.equal(calls[0].options.headers.accept, 'application/json');
    assert.equal(calls[0].options.body, undefined);
    assert.equal(calls[0].url.includes(key), false);
    assert.equal(String(calls[0].options.body ?? '').includes(key), false);
  });

  test('failed calls consume cooldown, preserve the old snapshot, and mark it stale', async () => {
    const db = makeDb();
    const old = JSON.stringify({ date: '2026-02-03', matches: [normalizeBasketballGame(upstreamGame('FT'))] });
    db.sqlite.prepare("UPDATE basketball_feed SET payload = ?, updated_at = ?, next_fetch_at = 0, last_error = NULL").run(old, Date.parse('2026-02-03T07:00:00Z'));
    let calls = 0;
    const failing = async () => { calls += 1; return response({ errors: { token: 'bad' } }, { status: 503 }); };
    const now = Date.parse('2026-02-03T08:00:00Z');
    const failed = await getBasketballFeed(env(db), { now, fetchImpl: failing });
    assert.equal(calls, 1);
    assert.equal(failed.stale, true);
    assert.equal(failed.matches.length, 1);
    assert.equal(failed.matches[0].status, 'finished');
    await getBasketballFeed(env(db), { now: now + 1, fetchImpl: failing });
    assert.equal(calls, 1);
    assert.equal((await db.prepare('SELECT last_error FROM basketball_feed').first()).last_error, 'upstream_unavailable');
  });

  test('enforces 96 requests per UTC day and resets at the next UTC day', async () => {
    const db = makeDb();
    const calls = [];
    const fetchImpl = successfulFetch(undefined, calls);
    const start = Date.parse('2026-03-01T00:00:00Z');
    for (let i = 0; i < DAILY_REQUEST_CAP; i += 1) {
      await getBasketballFeed(env(db), { now: start + i * SNAPSHOT_INTERVAL_MS, fetchImpl });
    }
    assert.equal(calls.length, DAILY_REQUEST_CAP);
    const capped = await getBasketballFeed(env(db), { now: start + (DAILY_REQUEST_CAP - 1) * SNAPSHOT_INTERVAL_MS + 1, fetchImpl });
    assert.equal(calls.length, DAILY_REQUEST_CAP);
    assert.equal(capped.nextUpdateAt, new Date(Date.parse('2026-03-02T00:00:00Z')).toISOString());
    await getBasketballFeed(env(db), { now: Date.parse('2026-03-02T00:00:00Z'), fetchImpl });
    assert.equal(calls.length, DAILY_REQUEST_CAP + 1);
    assert.equal((await db.prepare('SELECT request_day, request_count FROM basketball_feed').first()).request_day, '2026-03-02');
  });

  test('fails closed when the database or API key is missing', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response({ response: [] }); };
    const noDb = await getBasketballFeed({ API_SPORTS_KEY: 'key' }, { fetchImpl });
    const noKey = await getBasketballFeed({ SCORES_DB: makeDb() }, { fetchImpl });
    assert.equal(noDb.connected, false);
    assert.equal(noKey.connected, false);
    assert.deepEqual(noDb.matches, []);
    assert.equal(calls, 0);
  });
});

describe('basketball HTTP request gating', () => {
  test('HEAD and OPTIONS, disallowed methods, and disallowed origins do not spend upstream', async () => {
    const db = makeDb();
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response({ response: [] }); };
    const base = 'https://ibrahimbinselimbd.github.io';
    const options = await handleBasketballRequest(new Request('https://example.test/api', { method: 'OPTIONS', headers: { origin: base } }), env(db));
    const head = await handleBasketballRequest(new Request('https://example.test/api', { method: 'HEAD', headers: { origin: base } }), env(db));
    const post = await handleBasketballRequest(new Request('https://example.test/api', { method: 'POST', headers: { origin: base } }), env(db));
    const forbidden = await handleBasketballRequest(new Request('https://example.test/api', { method: 'GET', headers: { origin: 'https://evil.example' } }), { ...env(db), fetchImpl });
    assert.equal(options.status, 204);
    assert.equal(head.status, 200);
    assert.equal(post.status, 405);
    assert.equal(forbidden.status, 403);
    assert.equal(calls, 0);
    assert.equal(options.headers.get('access-control-allow-origin'), base);
    assert.equal(forbidden.headers.get('access-control-allow-origin'), null);
  });

  test('allows both configured origins for GET while preserving fail-closed behavior without a key', async () => {
    const origins = [
      'https://ibrahimbinselimbd.github.io',
      'https://afterhours-district.bird-timimus.workers.dev'
    ];
    for (const origin of origins) {
      const db = makeDb();
      const request = new Request('https://example.test/api', { method: 'GET', headers: { origin } });
      const result = await handleBasketballRequest(request, { SCORES_DB: db });
      assert.equal(result.status, 200);
      assert.equal(result.headers.get('access-control-allow-origin'), origin);
    }
  });
});
