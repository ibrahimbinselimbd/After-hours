export const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;
export const DAILY_REQUEST_CAP = 96; // Leaves four of the free account's 100 requests for diagnostics.
export const BASKETBALL_PATH = '/api/v1/scores/basketball';
export const RESERVE_SQL = `UPDATE basketball_feed
  SET request_count = CASE WHEN request_day = ? THEN request_count + 1 ELSE 1 END,
      request_day = ?, next_fetch_at = ?, last_attempt_at = ?
  WHERE id = 1 AND next_fetch_at <= ?
    AND (request_day <> ? OR request_count < ?)
  RETURNING request_count`;

const LIVE_STATUSES = new Set(['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'BT', 'HT']);
const FINAL_STATUSES = new Set(['FT', 'AOT', 'AWD']);
const ALLOWED_ORIGINS = new Set([
  'https://ibrahimbinselimbd.github.io',
  'https://afterhours-district.bird-timimus.workers.dev'
]);
const clean = (value, limit = 100) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const nextUtcDay = now => Date.parse(new Date(now).toISOString().slice(0, 10) + 'T00:00:00Z') + 86400000;
const score = value => Number.isInteger(value) && value >= 0 && value < 10000 ? value : null;

export function normalizeBasketballGame(game) {
  if (!game || typeof game !== 'object') return null;
  const sourceStatus = clean(game.status?.short, 8).toUpperCase();
  const status = LIVE_STATUSES.has(sourceStatus) ? 'live' : FINAL_STATUSES.has(sourceStatus) ? 'finished' : sourceStatus === 'NS' ? 'upcoming' : null;
  // Cancelled, postponed, suspended and abandoned games are not labelled LIVE or UP NEXT.
  const homeName = clean(game.teams?.home?.name);
  const awayName = clean(game.teams?.away?.name);
  if (!status || !homeName || !awayName || !Number.isSafeInteger(Number(game.id))) return null;
  const start = Date.parse(game.date);
  if (!Number.isFinite(start)) return null;
  const team = (side, name) => ({
    name,
    shortName: name.split(/\s+/).map(part => part[0]).join('').slice(0, 3).toUpperCase(),
    score: score(game.scores?.[side]?.total)
  });
  const timer = clean(String(game.status?.timer ?? ''), 16);
  const period = clean(game.status?.long, 40) || sourceStatus;
  return {
    id: `basketball-${game.id}`, sport: 'basketball',
    league: clean(game.league?.name) || 'Basketball',
    home: team('home', homeName), away: team('away', awayName), status,
    period: status === 'live' && timer ? `${period} · ${timer}` : period,
    startTime: new Date(start).toISOString(),
    venue: clean(typeof game.venue === 'object' ? game.venue?.name : game.venue, 80)
  };
}

function snapshot(row, now, forcedError = false) {
  let cached = null;
  try { cached = row?.payload ? JSON.parse(row.payload) : null; } catch { /* Fail closed if the saved snapshot is invalid. */ }
  const connected = Array.isArray(cached?.matches) && Number(row?.updated_at) > 0;
  const stale = !connected || forcedError || !!row?.last_error || now - Number(row.updated_at) > SNAPSHOT_INTERVAL_MS;
  const day = new Date(now).toISOString().slice(0, 10);
  const quotaReached = row?.request_day === day && Number(row.request_count) >= DAILY_REQUEST_CAP;
  const next = Math.max(Number(row?.next_fetch_at) || 0, quotaReached ? nextUtcDay(now) : 0);
  return {
    schemaVersion: 1, connected, source: 'API-Sports Basketball', supportedSports: ['basketball'],
    date: cached?.date || day, updatedAt: connected ? new Date(Number(row.updated_at)).toISOString() : null,
    snapshotIntervalSeconds: SNAPSHOT_INTERVAL_MS / 1000,
    nextUpdateAt: next > 0 ? new Date(next).toISOString() : null,
    stale,
    message: !connected ? 'Basketball data is temporarily unavailable. No scores are simulated.'
      : stale ? 'Showing the last saved Basketball snapshot. Updates are delayed by provider availability or the free request budget.'
      : 'Basketball snapshots refresh at most every 15 minutes. Scores are not real-time; other sports are not connected.',
    matches: connected ? cached.matches : []
  };
}

export async function getBasketballFeed(env, {now = Date.now(), fetchImpl = fetch} = {}) {
  if (!env.SCORES_DB || !env.API_SPORTS_KEY) return snapshot(null, now, true);
  const db = env.SCORES_DB;
  let row = null;
  try {
    row = await db.prepare('SELECT * FROM basketball_feed WHERE id = 1').first();
    if (!row) return snapshot(null, now, true);
    if (Number(row.next_fetch_at) > now) return snapshot(row, now);
    const day = new Date(now).toISOString().slice(0, 10);
    // One atomic primary-database UPDATE reserves both time slot and budget before any network call.
    // A crashed/failed request still consumes its slot, preventing retries from draining the quota.
    const claim = await db.prepare(RESERVE_SQL).bind(day, day, now + SNAPSHOT_INTERVAL_MS, now, now, day, DAILY_REQUEST_CAP).first();
    if (!claim) return snapshot(await db.prepare('SELECT * FROM basketball_feed WHERE id = 1').first(), now);
    try {
      const upstream = await fetchImpl(`https://v1.basketball.api-sports.io/games?date=${day}&timezone=UTC`, {
        method: 'GET', headers: {'x-apisports-key': env.API_SPORTS_KEY, accept: 'application/json'},
        redirect: 'manual', signal: AbortSignal.timeout(12000)
      });
      const remaining = Number(upstream.headers.get('x-ratelimit-requests-remaining'));
      const guardUntil = (upstream.status === 429 || (upstream.headers.has('x-ratelimit-requests-remaining') && Number.isFinite(remaining) && remaining <= 4)) ? nextUtcDay(now) : now + SNAPSHOT_INTERVAL_MS;
      if (!upstream.ok) {
        await db.prepare('UPDATE basketball_feed SET next_fetch_at = ? WHERE id = 1').bind(guardUntil).run();
        throw new Error('provider_unavailable');
      }
      const data = await upstream.json();
      if (!data || !Array.isArray(data.response) || (data.errors && Object.keys(data.errors).length)) throw new Error('provider_data_unavailable');
      const order = {live: 0, upcoming: 1, finished: 2};
      const matches = data.response.map(normalizeBasketballGame).filter(Boolean)
        .sort((a, b) => order[a.status] - order[b.status] || a.startTime.localeCompare(b.startTime)).slice(0, 250);
      const seen = new Set();
      const payload = JSON.stringify({date: day, matches: matches.filter(item => !seen.has(item.id) && seen.add(item.id))});
      await db.prepare('UPDATE basketball_feed SET payload = ?, updated_at = ?, next_fetch_at = ?, last_error = NULL WHERE id = 1')
        .bind(payload, now, guardUntil).run();
    } catch {
      // Never log upstream headers, credentials or raw provider error bodies.
      await db.prepare("UPDATE basketball_feed SET last_error = 'upstream_unavailable' WHERE id = 1").run();
    }
    row = await db.prepare('SELECT * FROM basketball_feed WHERE id = 1').first();
    return snapshot(row, now);
  } catch {
    // Storage failures must not bypass the global request cap.
    return snapshot(row, now, true);
  }
}

export async function handleBasketballRequest(request, env) {
  const origin = request.headers.get('origin');
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'vary': 'Origin'
  });
  if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(JSON.stringify({error: 'origin_not_allowed'}), {status: 403, headers});
  if (origin) headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET, HEAD, OPTIONS');
  headers.set('access-control-allow-headers', 'Accept');
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  if (!['GET', 'HEAD'].includes(request.method)) {
    headers.set('allow', 'GET, HEAD, OPTIONS');
    return new Response(JSON.stringify({error: 'method_not_allowed'}), {status: 405, headers});
  }
  if (request.method === 'HEAD') return new Response(null, {status: 200, headers});
  return new Response(JSON.stringify(await getBasketballFeed(env)), {status: 200, headers});
}
