(() => {
  'use strict';

  // Browser reads an AFTERHOURS endpoint only. Goalserve credentials belong in a server secret.
  const configuredFeed = document.querySelector('meta[name="score-feed-endpoint"]')?.content || './scores.json';
  const feedUrl = new URL(configuredFeed, window.location.href);
  if (feedUrl.origin !== window.location.origin) throw new Error('Use an AFTERHOURS first-party feed endpoint, never Goalserve directly.');
  const allowedSports = new Set(['football', 'cricket', 'tennis', 'basketball', 'badminton', 'f1', 'other']);
  const selectors = {
    list: document.querySelector('#score-list'),
    empty: document.querySelector('#score-empty'),
    notice: document.querySelector('#feed-notice'),
    feedState: document.querySelector('#feed-state'),
    feedUpdated: document.querySelector('#feed-updated'),
    boardSummary: document.querySelector('#board-summary'),
    liveCount: document.querySelector('#live-count'),
    matchCount: document.querySelector('#match-count'),
    refresh: document.querySelector('#refresh-scores')
  };

  let matches = [];
  let feedConnected = false;
  let feedUpdatedAt = null;
  let selectedSport = 'all';
  let selectedState = 'all';
  let isRefreshing = false;
  let lastAttemptAt = 0;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const pad = value => String(value).padStart(2, '0');

  function normalizeMatch(item, index) {
    if (!item || typeof item !== 'object') return null;
    const sport = String(item.sport || 'other').toLowerCase();
    const home = item.home && typeof item.home === 'object' ? item.home : {};
    const away = item.away && typeof item.away === 'object' ? item.away : {};
    const name = value => String(value || '').trim().slice(0, 100);
    const team = value => ({
      name: name(value.name) || 'Team TBC',
      shortName: name(value.shortName) || name(value.name).slice(0, 3).toUpperCase() || '—',
      score: value.score === null || value.score === undefined || value.score === '' ? '—' : String(value.score).slice(0, 12)
    });
    const state = String(item.status || 'upcoming').toLowerCase();
    const status = ({in_progress: 'live', live: 'live', scheduled: 'upcoming', pre: 'upcoming', completed: 'finished', final: 'finished', post: 'finished'})[state] || state;
    if (!['live', 'upcoming', 'finished'].includes(status)) return null;
    return {
      id: name(item.id) || `${sport}-${index}`,
      sport: allowedSports.has(sport) ? sport : 'other',
      league: name(item.league) || 'Fixture',
      home: team(home),
      away: team(away),
      status,
      period: name(item.period).slice(0, 50),
      startTime: name(item.startTime),
      venue: name(item.venue).slice(0, 80)
    };
  }

  function initials(team) {
    const value = team.shortName || team.name;
    return value.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || '—';
  }

  function timeLabel(match) {
    if (match.status === 'live') return match.period || 'In play';
    if (match.status === 'finished') return match.period || 'Full time';
    if (!match.startTime) return 'Scheduled';
    const date = new Date(match.startTime);
    if (Number.isNaN(date.getTime())) return 'Scheduled';
    return new Intl.DateTimeFormat(undefined, {weekday: 'short', hour: '2-digit', minute: '2-digit'}).format(date);
  }

  function statusLabel(status) {
    return status === 'live' ? 'LIVE' : status === 'finished' ? 'FINAL' : 'UP NEXT';
  }

  function renderMatch(match) {
    return `<article class="match-card" data-match-id="${escapeHtml(match.id)}">
      <div class="match-top"><span class="match-league">${escapeHtml(match.league)}</span><span class="match-state ${match.status}">${statusLabel(match.status)}</span></div>
      <div class="match-teams">
        <div class="match-team" data-team-side="home"><span class="team-mark" aria-hidden="true">${escapeHtml(initials(match.home))}</span><span class="team-name">${escapeHtml(match.home.name)}</span><strong class="team-score">${escapeHtml(match.home.score)}</strong></div>
        <div class="match-team" data-team-side="away"><span class="team-mark" aria-hidden="true">${escapeHtml(initials(match.away))}</span><span class="team-name">${escapeHtml(match.away.name)}</span><strong class="team-score">${escapeHtml(match.away.score)}</strong></div>
      </div>
      <div class="match-bottom"><span class="match-period">${escapeHtml(timeLabel(match))}</span><span>${escapeHtml(match.venue || match.sport.toUpperCase())}</span></div>
    </article>`;
  }

  function setScore(scoreNode, score) {
    const nextScore = String(score);
    if (scoreNode.textContent === nextScore) return;
    scoreNode.textContent = nextScore;
    scoreNode.classList.remove('score-updated');
    void scoreNode.offsetWidth;
    scoreNode.classList.add('score-updated');
  }

  function updateMatchCard(card, match) {
    card.dataset.matchId = match.id;
    card.querySelector('.match-league').textContent = match.league;
    const state = card.querySelector('.match-state');
    state.className = `match-state ${match.status}`;
    state.textContent = statusLabel(match.status);
    for (const side of ['home', 'away']) {
      const team = match[side];
      const row = card.querySelector(`[data-team-side="${side}"]`);
      row.querySelector('.team-mark').textContent = initials(team);
      row.querySelector('.team-name').textContent = team.name;
      setScore(row.querySelector('.team-score'), team.score);
    }
    card.querySelector('.match-period').textContent = timeLabel(match);
    card.querySelector('.match-bottom span:last-child').textContent = match.venue || match.sport.toUpperCase();
  }

  function createMatchCard(match) {
    const template = document.createElement('template');
    template.innerHTML = renderMatch(match).trim();
    const card = template.content.firstElementChild;
    updateMatchCard(card, match);
    return card;
  }

  function syncCards(visible) {
    const existing = new Map(Array.from(selectors.list.querySelectorAll('.match-card'), card => [card.dataset.matchId, card]));
    const ordered = visible.map(match => {
      const card = existing.get(match.id) || createMatchCard(match);
      updateMatchCard(card, match);
      return card;
    });
    const current = Array.from(selectors.list.children);
    if (current.length !== ordered.length || current.some((card, index) => card !== ordered[index])) {
      selectors.list.replaceChildren(...ordered);
    }
    selectors.list.hidden = !visible.length;
  }

  function render() {
    const visible = matches.filter(match => (selectedSport === 'all' || match.sport === selectedSport) && (selectedState === 'all' || match.status === selectedState));
    const live = matches.filter(match => match.status === 'live').length;
    selectors.liveCount.textContent = pad(live);
    selectors.matchCount.textContent = pad(matches.length);
    selectors.boardSummary.textContent = feedConnected
      ? `${live} live · ${matches.length} fixture${matches.length === 1 ? '' : 's'} on the board`
      : 'Waiting for the site’s score feed';
    syncCards(visible);
    selectors.empty.hidden = visible.length > 0;
    selectors.empty.querySelector('h3').textContent = feedConnected
      ? 'No matches in this lane right now.'
      : 'No scores on the board—yet.';
    selectors.empty.querySelector('.empty-kicker').textContent = feedConnected
      ? 'FILTER CHECK / NO MATCH DATA'
      : 'SIGNAL CHECK / NO MATCH DATA';
    selectors.empty.querySelector('.empty-copy p').textContent = feedConnected
      ? 'There are no fixtures for the selected sport and status. Try another lane or check again later.'
      : 'The interface is ready, but this static site needs a first-party feed to supply real fixtures and results. Nothing here is simulated.';
  }

  function updateFeedStatus(message, isError = false) {
    selectors.feedState.textContent = message;
    selectors.notice.classList.toggle('has-error', isError);
  }

  function updateTimestamp() {
    if (!feedUpdatedAt) {
      selectors.feedUpdated.textContent = feedConnected ? 'UPDATED / TIME UNKNOWN' : 'NO FEED / WAITING';
      return;
    }
    const date = new Date(feedUpdatedAt);
    selectors.feedUpdated.textContent = Number.isNaN(date.getTime())
      ? 'UPDATED / TIME UNKNOWN'
      : `UPDATED / ${new Intl.DateTimeFormat(undefined, {hour: '2-digit', minute: '2-digit'}).format(date)}`;
  }

  async function refreshFeed() {
    if (isRefreshing) return;
    lastAttemptAt = Date.now();
    isRefreshing = true;
    selectors.refresh.disabled = true;
    selectors.list.setAttribute('aria-busy', 'true');
    try {
      const url = new URL(feedUrl.href);
      url.searchParams.set('check', String(Date.now()));
      const response = await fetch(url, {method: 'GET', cache: 'no-store', credentials: 'same-origin', headers: {Accept: 'application/json'}});
      if (!response.ok) throw new Error(`Feed returned ${response.status}`);
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.matches)) throw new Error('The same-site score file has an invalid format');
      matches = payload.matches.map(normalizeMatch).filter(Boolean).slice(0, 250);
      feedConnected = payload.connected === true;
      feedUpdatedAt = payload.updatedAt || null;
      updateFeedStatus(feedConnected ? 'First-party score feed connected' : 'First-party feed not connected');
    } catch (error) {
      matches = [];
      feedConnected = false;
      feedUpdatedAt = null;
      updateFeedStatus('The same-site score feed is unavailable', true);
      console.warn('AFTERHOURS score feed could not be loaded:', error.message);
    } finally {
      updateTimestamp();
      render();
      selectors.refresh.disabled = false;
      selectors.list.setAttribute('aria-busy', 'false');
      isRefreshing = false;
    }
  }

  document.querySelectorAll('[data-sport]').forEach(button => {
    button.addEventListener('click', () => {
      selectedSport = button.dataset.sport || 'all';
      document.querySelectorAll('[data-sport]').forEach(tab => {
        const active = tab === button;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-pressed', String(active));
      });
      render();
    });
  });

  document.querySelectorAll('[data-state]').forEach(button => {
    button.addEventListener('click', () => {
      selectedState = button.dataset.state || 'all';
      document.querySelectorAll('[data-state]').forEach(tab => {
        const active = tab === button;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-pressed', String(active));
      });
      render();
    });
  });

  selectors.refresh.addEventListener('click', refreshFeed);
  render();
  refreshFeed();
  window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (feedConnected || Date.now() - lastAttemptAt >= 60_000) refreshFeed();
  }, 1_000);
})();
