const allowedSports = new Set(['football', 'cricket']);
const routeSport = document.querySelector('meta[name="score-sport"]')?.content || 'all';
const routeSportLabel = document.querySelector('meta[name="score-sport-label"]')?.content || 'Football + Cricket';
const feedUrl = document.querySelector('meta[name="score-feed-endpoint"]')?.content || './scores.json';
const stateLabels = {all: 'All matches', live: 'Live', upcoming: 'Upcoming', finished: 'Results'};
const ui = {
  list: document.querySelector('#score-list'), empty: document.querySelector('#score-empty'),
  notice: document.querySelector('#feed-notice'), feedState: document.querySelector('#feed-state'),
  feedCopy: document.querySelector('#feed-copy'), feedUpdated: document.querySelector('#feed-updated'),
  summary: document.querySelector('#board-summary'), liveCount: document.querySelector('#live-count'),
  matchCount: document.querySelector('#match-count'), refresh: document.querySelector('#refresh-scores')
};
let matches = [];
let connected = false;
let failed = false;
let selectedState = 'all';
let isChecking = false;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const pad = value => String(value).padStart(2, '0');
const labelStatus = status => status === 'live' ? 'LIVE' : status === 'finished' ? 'FINAL' : 'UP NEXT';

function normalizeMatch(item, index) {
  if (!item || typeof item !== 'object') return null;
  const sport = String(item.sport || '').toLowerCase();
  if (!allowedSports.has(sport) || (routeSport !== 'all' && sport !== routeSport)) return null;
  const status = String(item.status || '').toLowerCase();
  if (!['live', 'upcoming', 'finished'].includes(status)) return null;
  const home = item.home && typeof item.home === 'object' ? item.home : {};
  const away = item.away && typeof item.away === 'object' ? item.away : {};
  const clean = value => String(value ?? '').trim().slice(0, 120);
  return {id: clean(item.id) || `${sport}-${index}`, sport, league: clean(item.league), status,
    home: {name: clean(home.name), score: home.score}, away: {name: clean(away.name), score: away.score},
    period: clean(item.period), startTime: clean(item.startTime), venue: clean(item.venue)};
}

function renderCard(match) {
  const team = side => `<div class="match-team"><span class="team-mark" aria-hidden="true">${esc((side.name || '—').replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase())}</span><span class="team-name">${esc(side.name || 'Team not supplied')}</span><strong class="team-score">${side.score === null || side.score === undefined || side.score === '' ? '—' : esc(side.score)}</strong></div>`;
  return `<article class="match-card" data-match-id="${esc(match.id)}"><div class="match-top"><span class="match-league">${esc(match.league || (match.sport === 'football' ? 'Football' : 'Cricket'))}</span><span class="match-state ${esc(match.status)}">${labelStatus(match.status)}</span></div><div class="match-teams">${team(match.home)}${team(match.away)}</div><div class="match-bottom"><span>${esc(match.period || match.startTime || 'Match details not supplied')}</span><span>${esc(match.venue || match.sport.toUpperCase())}</span></div></article>`;
}

function render() {
  const visible = matches.filter(match => selectedState === 'all' || match.status === selectedState);
  const live = visible.filter(match => match.status === 'live').length;
  if (ui.liveCount) ui.liveCount.textContent = pad(live);
  if (ui.matchCount) ui.matchCount.textContent = pad(visible.length);
  if (ui.summary) ui.summary.textContent = failed ? 'Preview error — local draft file unavailable'
    : connected ? `${routeSportLabel}; ${stateLabels[selectedState]}, ${visible.length} fixture${visible.length === 1 ? '' : 's'}, ${live} live.`
    : 'Draft — provider feed not connected; no matches loaded';
  if (ui.list) { ui.list.innerHTML = visible.map(renderCard).join(''); ui.list.hidden = !visible.length; }
  if (ui.empty) {
    ui.empty.hidden = visible.length > 0;
    const heading = ui.empty.querySelector('h3');
    const copy = ui.empty.querySelector('.empty-copy p');
    const kicker = ui.empty.querySelector('.empty-kicker');
    if (heading) heading.textContent = failed ? 'The local preview could not load.' : connected ? 'No matching fixtures.' : 'No scores are being shown.';
    if (copy) copy.textContent = failed ? 'The local draft snapshot could not be read. Try Check draft again. No provider request has been made.'
      : connected ? 'No fixtures match this sport and status filter in the connected response.'
      : 'Football and Cricket feeds are not connected. Fixtures, scores, live status and match details remain unavailable until coverage and API access are verified. Nothing here is simulated.';
    if (kicker) kicker.textContent = failed ? 'PREVIEW / ERROR' : connected ? 'FILTER / NO MATCHES' : 'DRAFT / NO VERIFIED MATCH DATA';
  }
  if (ui.feedState) ui.feedState.textContent = failed ? 'Draft file error' : connected ? 'Feed reports connected' : 'Draft — not connected';
  if (ui.feedCopy) ui.feedCopy.textContent = failed ? 'The local draft snapshot could not be loaded. No external provider was contacted.'
    : connected ? 'The local snapshot reports a connection, but this UI draft does not verify provider coverage or API access.'
    : 'No Sportmonks access or feed has been verified. This preview makes no provider request, and no score, event or match state is simulated.';
  if (ui.feedUpdated) ui.feedUpdated.textContent = failed ? 'PREVIEW / ERROR' : connected ? 'LOCAL SNAPSHOT' : 'DRAFT / OFFLINE';
  if (ui.notice) ui.notice.classList.toggle('has-error', failed);
}

async function checkLocalDraft() {
  if (isChecking || !ui.refresh) return;
  isChecking = true; ui.refresh.disabled = true;
  if (ui.list) ui.list.setAttribute('aria-busy', 'true');
  failed = false; render();
  try {
    const url = new URL(feedUrl, window.location.href);
    if (url.origin !== window.location.origin) throw new Error('Draft file must be same-origin');
    const response = await fetch(url, {method: 'GET', cache: 'no-store', credentials: 'same-origin', headers: {Accept: 'application/json'}});
    if (!response.ok) throw new Error(`Draft file returned ${response.status}`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.matches)) throw new Error('Invalid local draft format');
    connected = payload.connected === true;
    matches = connected ? payload.matches.map(normalizeMatch).filter(Boolean).slice(0, 250) : [];
  } catch (error) {
    connected = false; matches = []; failed = true;
    console.warn('ByteAfter local sports draft could not be read:', error.message);
  } finally {
    render(); ui.refresh.disabled = false;
    if (ui.list) ui.list.setAttribute('aria-busy', 'false');
    isChecking = false;
  }
}

for (const button of document.querySelectorAll('[data-state]')) {
  button.addEventListener('click', () => {
    selectedState = button.dataset.state || 'all';
    for (const tab of document.querySelectorAll('[data-state]')) {
      const active = tab === button; tab.classList.toggle('is-active', active); tab.setAttribute('aria-pressed', String(active));
    }
    render();
  });
}

for (const button of document.querySelectorAll('[data-detail-section]')) {
  button.addEventListener('click', () => {
    const group = button.closest('[data-detail-group]');
    if (!group) return;
    for (const tab of group.querySelectorAll('[data-detail-section]')) {
      const active = tab === button; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    }
    const panel = group.querySelector('[data-detail-panel]');
    const sport = group.dataset.detailGroup === 'football' ? 'Football' : 'Cricket';
    const label = button.textContent.trim();
    panel.innerHTML = `<p class="detail-empty">Unavailable — no verified ${sport} fixture or feed is connected. ${esc(label)} data will appear only if supplied by an authorized provider response.</p>`;
  });
}

ui.refresh?.addEventListener('click', checkLocalDraft);
render();
checkLocalDraft();
