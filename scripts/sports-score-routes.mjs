const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));

// Keep every pre-existing sport definition in source for rollback/reference. Only the two requested lanes are built publicly.
export const sportScorePages = [
  {
    slug: 'football', sport: 'football', label: 'Football', icon: '⚽', title: 'Football Scores & Fixtures | ByteAfter',
    description: 'Unpublished Football scoreboard draft. No Sportmonks feed or API access is connected; worldwide coverage is a target, not a verified promise.',
    intro: 'A dedicated association-football lane. The worldwide coverage target is not yet verified, and this draft shows no fixtures, scores or match events until coverage and API access are confirmed.',
    guide: 'Sportmonks Football v3 fixture responses document scores, participants, events, lineups and statistics includes. This draft keeps those match-detail surfaces unavailable until a verified fixture and the relevant fields are returned.',
    coverage: 'Football Starter is limited to five leagues and cannot meet the all-world target. Football Enterprise requires a custom quote; selected-league coverage, trial status and API access remain unverified.',
    source: 'https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/livescores-and-fixtures/fixtures', sourceLabel: 'Sportmonks Football fixtures documentation',
  },
  {
    slug: 'cricket', sport: 'cricket', label: 'Cricket', icon: '◉', title: 'Cricket Scores & Fixtures | ByteAfter',
    description: 'Unpublished Cricket scoreboard draft. No Sportmonks feed or API access is connected; worldwide coverage is not verified.',
    intro: 'A dedicated cricket lane for innings-based scorecards. Cricket coverage is not verified for the requested worldwide scope, and no fixtures or results are displayed in this disconnected draft.',
    guide: 'Sportmonks Cricket v2 fixture and livescore docs list runs, scoreboards, batting, bowling, lineup, balls and venue includes. The scorecard and delivery panels remain unavailable until a verified fixture response supplies those fields.',
    coverage: 'The requested scope is worldwide Cricket. Exact competition access under the selected plan, trial status and API access are not verified, so this page does not claim global availability.',
    source: 'https://docs.sportmonks.com/v2/cricket-api/our-api/fixtures/get-fixture-by-id', sourceLabel: 'Sportmonks Cricket fixture documentation',
  },
  {
    slug: 'tennis', sport: 'tennis', label: 'Tennis', icon: '◌', title: 'Tennis Scores & Match Results | ByteAfter',
    description: 'Explore the ByteAfter tennis score page. No verified tennis feed is connected, so live scores, fixtures, and results are not available here yet.',
    intro: 'A dedicated tennis route for tournament matches and player or doubles-pair score summaries when a verified first-party feed supplies them. No tennis feed is connected, and there are no live matches or results on this page yet.',
    guide: 'The shared score card can hold two participants and one score string, but it does not yet format set-by-set games or point-by-point data. A tennis-specific adapter is needed before detailed tennis scoring can be represented accurately.',
    coverage: 'Goalserve’s public tennis page lists tours and competition types such as ATP, WTA, Challenger, ITF and Davis Cup. The exact coverage and fields for the intended subscription still need confirmation.',
    source: 'https://www.goalserve.com/en/sport-data-feeds/tennis-api/description/14', sourceLabel: 'Goalserve tennis feed details',
  },
  {
    slug: 'basketball', sport: 'basketball', label: 'Basketball', icon: '◉', title: 'Basketball Scores & Fixtures | ByteAfter',
    description: 'Check the ByteAfter Basketball page for API-Sports snapshots. Basketball is the only connected score feed; snapshots may be delayed and are not real-time.',
    intro: 'A dedicated basketball route for cached game snapshots, team scores and status from the ByteAfter first-party Worker. Snapshots may be up to 15 minutes delayed, or longer if unavailable or the free daily quota is reached; this is not 15-second realtime data.',
    guide: 'The current shared card can display two teams, a score and a period label. It does not yet model a game clock, quarter-by-quarter score or player box score; those require verified source fields and a basketball-specific adapter.',
    coverage: 'Basketball data is sourced through API-Sports and exposed by the ByteAfter first-party Worker as cached snapshots. The free API-Sports plan is limited to 100 requests per day; no purchase is enabled.',
    source: 'https://api-sports.io/documentation/basketball/v1', sourceLabel: 'API-Sports Basketball documentation',
    feedEndpoint: 'https://afterhours-district.bird-timimus.workers.dev/api/v1/scores/basketball', pollSeconds: 900,
  },
  {
    slug: 'badminton', sport: 'badminton', label: 'Badminton', icon: '⌁', title: 'Badminton Scores & Match Results | ByteAfter',
    description: 'The ByteAfter badminton score page is reserved for verified match data. No badminton feed is connected, and no scores or fixtures are available yet.',
    intro: 'A dedicated badminton route for singles or doubles matches if a suitable feed is confirmed and connected. There is no badminton score data here today, and no provider coverage is assumed.',
    guide: 'The generic card can represent two players or pairs and a plain-text score, but it does not parse game-by-game badminton scoring. A badminton-specific adapter and a confirmed data source are required before this page can report results.',
    coverage: 'Badminton is not explicitly named in the Goalserve public sports catalogue we checked. That absence does not prove the data is unavailable, but coverage remains unverified and must not be advertised as active.',
    source: 'https://www.goalserve.com/en/sport-data-feeds', sourceLabel: 'Goalserve public sports-feed catalogue',
  },
  {
    slug: 'formula-1', sport: 'f1', label: 'Formula 1', icon: '↗', title: 'Formula 1 Scores & Race Sessions | ByteAfter',
    description: 'Follow the ByteAfter Formula 1 score page for verified race-session information. No Formula 1 feed is connected, and no session data or results are displayed yet.',
    intro: 'A dedicated Formula 1 route for verified race-weekend session information. No Formula 1 feed is connected, and this page currently contains no qualifying, sprint or race results.',
    guide: 'The current shared card is designed for a two-side match, not a race-session timetable or driver classification. An F1-specific feed adapter and leaderboard rendering are required before the page can publish session or finishing-order data.',
    coverage: 'Goalserve’s public F1 page lists Formula 1 and other racing series. This is public catalogue information only; the intended subscription, session fields and account access have not been verified.',
    source: 'https://www.goalserve.com/en/sport-data-feeds/f1-api/description/14', sourceLabel: 'Goalserve F1 feed details',
  },
  {
    slug: 'more-sports', sport: 'other', label: 'More sports', icon: '＋', title: 'More Sports Scores | ByteAfter',
    description: 'Browse the ByteAfter additional-sports score lane. No extra sports feed is connected or verified, so this page does not claim live coverage.',
    intro: 'This route is a placeholder for sports beyond the six named lanes. No additional sports are currently being reported; a sport will appear here only after its provider coverage, data fields and first-party feed are verified.',
    guide: 'The current page model supports a small set of match-style fields. Every added sport needs an explicit provider-coverage check and a suitable data mapping; formats that need a different model must not be squeezed into a misleading match card.',
    coverage: 'Goalserve describes a broad Full Package and publishes a sports catalogue, but neither statement proves which feeds are included in an unpurchased account. The exact package and each sport must be confirmed before adding coverage claims.',
    source: 'https://www.goalserve.com/en/sport-data-feeds', sourceLabel: 'Goalserve public sports-feed catalogue',
  },
];

export const publicSportScorePages = sportScorePages.filter(page => ['football', 'cricket'].includes(page.slug));

function detailPanel(page) {
  const isFootball = page.slug === 'football';
  const tabs = isFootball
    ? [['overview', 'Overview & score'], ['events', 'Events'], ['lineups', 'Line-ups'], ['statistics', 'Statistics']]
    : [['overview', 'Overview & innings'], ['scorecard', 'Scorecard'], ['balls', 'Ball-by-ball'], ['lineup', 'Playing XI'], ['match', 'Match info']];
  const labels = tabs.map(([id, label], index) => `<button type="button" role="tab" class="state-tab${index === 0 ? ' is-active' : ''}" data-detail-section="${id}" aria-selected="${index === 0}"${index ? ' tabindex="-1"' : ''}>${label}</button>`).join('');
  const placeholder = isFootball
    ? 'Unavailable — no verified Football fixture is connected. Scores, events, lineups and statistics will remain empty until returned by an authorized fixture response.'
    : 'Unavailable — no verified Cricket fixture is connected. Innings, batting, bowling, balls and lineup will remain empty until returned by an authorized fixture response.';
  const docs = isFootball
    ? '<a href="https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/livescores-and-fixtures/fixtures" target="_blank" rel="noopener noreferrer">fixtures</a>, <a href="https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/events" target="_blank" rel="noopener noreferrer">events</a>, <a href="https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/lineups" target="_blank" rel="noopener noreferrer">lineups</a> and <a href="https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/statistics/fixture-statistics" target="_blank" rel="noopener noreferrer">fixture statistics</a>'
    : '<a href="https://docs.sportmonks.com/v2/cricket-api/our-api/fixtures/get-fixture-by-id" target="_blank" rel="noopener noreferrer">fixture by ID</a> and <a href="https://docs.sportmonks.com/v2/cricket-api/our-api/livescores-and-fixtures/get-all-livescores" target="_blank" rel="noopener noreferrer">livescores</a>';
  return `<section class="draft-match-centres" id="match-centres" aria-labelledby="match-centres-title"><div class="board-heading"><div><div class="board-kicker">MATCH CENTRE / DATA-BACKED ONLY</div><h2 id="match-centres-title">Full match detail. <span>Unavailable for now.</span></h2><p>These sections are placeholders only. They stay unavailable until verified feed access supplies the sport-specific fields.</p></div></div><div class="detail-panel" data-detail-group="${page.slug}"><h3>${escapeHtml(page.label)} match centre</h3><div class="detail-tabs" role="tablist" aria-label="${escapeHtml(page.label)} match detail sections">${labels}</div><div class="detail-content" data-detail-panel role="tabpanel"><p class="detail-empty">${placeholder}</p></div><p class="detail-source">Documented fields: ${docs}.</p></div></section>`;
}

export function renderSportScorePage(page, canonicalUrl) {
  const otherPages = publicSportScorePages.map(item => {
    const current = item.slug === page.slug;
    return `<a class="sport-tab${current ? ' is-active' : ''}" href="/sports-scores/${item.slug}/"${current ? ' aria-current="page"' : ''}><span class="sport-tab-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>${escapeHtml(item.label)}</a>`;
  }).join('');
  const statusName = page.label.toLowerCase();
  const feedEndpoint = '../scores.json';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#080a16">
  <meta name="description" content="${escapeHtml(page.description)}"><meta name="robots" content="noindex,nofollow">
  <meta name="score-feed-endpoint" content="${feedEndpoint}"><meta name="score-sport" content="${escapeHtml(page.sport)}"><meta name="score-sport-label" content="${escapeHtml(page.label)}">
  <meta property="og:site_name" content="ByteAfter"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(page.title)}"><meta property="og:description" content="${escapeHtml(page.description)}"><meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}"><title>${escapeHtml(page.title)} — Draft</title><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="../sports-scores.css?v=4"><link rel="stylesheet" href="../sports-draft.css?v=1"><link rel="stylesheet" href="../match-details.css?v=1"><script type="module" src="../sports-scores.js?v=6"></script>
</head>
<body class="sports-page sports-draft-page" data-score-page="${escapeHtml(page.slug)}">
  <a class="skip-link" href="#scoreboard">Skip to the ${escapeHtml(statusName)} scoreboard</a>
  <header class="sports-header"><a class="sports-brand" href="/" aria-label="ByteAfter home"><span class="brand-mark brand-mark-3d" aria-hidden="true"><img src="/byteafter-mark.webp" alt=""></span><span class="brand-name brand-word">Byte<span>After</span><small> / SPORTS SIGNAL</small></span></a><nav class="sports-nav" aria-label="Main navigation"><a href="/#feed">The journal</a><a href="/districts/">The districts</a><a href="/tools/">Tools</a><a href="/sports-scores/" aria-current="page">Scores</a></nav><a class="sports-header-badge" href="/sports-scores/" aria-label="Sports draft"><span>SPORTS<small>DRAFT / OFFLINE</small></span><i aria-hidden="true"></i></a></header>
  <main><div class="score-wrap"><div class="score-breadcrumb"><a href="/">ByteAfter</a><span aria-hidden="true">/</span><a href="/sports-scores/">SPORTS DRAFT</a><span aria-hidden="true">/</span><span>${escapeHtml(page.label.toUpperCase())}</span></div>
    <section class="score-hero draft-hero" aria-labelledby="score-title"><div class="score-hero-copy"><div class="score-eyebrow"><i aria-hidden="true"></i> DRAFT / FEED NOT CONNECTED <span>${escapeHtml(page.label.toUpperCase())}</span></div><h1 id="score-title">${escapeHtml(page.label)}<br><em>scores.</em></h1><p>${escapeHtml(page.intro)}</p><div class="score-hero-actions"><a class="score-primary" href="#scoreboard">View ${escapeHtml(page.label)} board <span aria-hidden="true">↓</span></a><span class="score-clean-note"><b aria-hidden="true">✳</b> No live data / no simulation</span></div></div><div class="score-hero-art" aria-hidden="true"><div class="score-orbit orbit-one"></div><div class="score-orbit orbit-two"></div><div class="score-orbit orbit-three"></div><div class="score-art-core"><span>${escapeHtml(page.label.toUpperCase())}</span></div><span class="score-coordinate coordinate-a">WORLDWIDE<br>TARGET ONLY</span><span class="score-coordinate coordinate-b">NOT<br>CONNECTED</span></div></section>
    <section class="score-board" id="scoreboard" aria-labelledby="board-title"><div class="board-heading"><div><div class="board-kicker">SPORT LANE / ${escapeHtml(page.label.toUpperCase())}</div><h2 id="board-title">${escapeHtml(page.label)} <span>score signal.</span></h2><p>${escapeHtml(page.coverage)}</p></div><div class="board-stats" aria-label="Scoreboard summary"><div><strong id="live-count">00</strong><small>LIVE / VERIFIED ONLY</small></div><div><strong id="match-count">00</strong><small>ON THIS PAGE</small></div><div><strong>01</strong><small>SPORT LANE</small></div></div></div>
      <nav class="sport-filter" aria-label="Choose a sport lane">${otherPages}</nav><div class="board-controls"><div class="state-filter" role="group" aria-label="Filter ${escapeHtml(page.label)} matches by status"><button type="button" class="state-tab is-active" data-state="all" aria-pressed="true">All matches</button><button type="button" class="state-tab" data-state="live" aria-pressed="false">Live <i aria-hidden="true"></i></button><button type="button" class="state-tab" data-state="upcoming" aria-pressed="false">Upcoming</button><button type="button" class="state-tab" data-state="finished" aria-pressed="false">Results</button></div><div class="board-tools"><span id="board-summary" role="status" aria-live="polite">Draft — provider feed not connected</span><button type="button" id="refresh-scores">Check draft</button></div></div>
      <div class="feed-notice draft-feed-notice" id="feed-notice" role="status" aria-live="polite"><span class="notice-mark" aria-hidden="true">i</span><div><strong id="feed-state">Draft — not connected</strong><p id="feed-copy">${escapeHtml(page.coverage)} No provider API request is made here. No score or match state is simulated.</p><p id="feed-polling-copy">Manual local snapshot check only. No background polling.</p></div><span class="feed-update" id="feed-updated">DRAFT / OFFLINE</span></div>
      <div class="score-grid" id="score-list" aria-live="off" aria-busy="false" hidden></div><div class="score-empty" id="score-empty"><div class="empty-orbit" aria-hidden="true"><span>0</span></div><div class="empty-copy"><span class="empty-kicker">${escapeHtml(page.label.toUpperCase())} / UNAVAILABLE</span><h3>No ${escapeHtml(statusName)} scores are being shown.</h3><p>${escapeHtml(page.intro)} Nothing is simulated.</p></div></div>
    </section>${detailPanel(page)}
    <section class="score-data-note draft-data-note"><div class="data-note-icon" aria-hidden="true">⌁</div><div><span class="board-kicker">DOCUMENTED FIELDS / NOT LIVE</span><h2>Scope, fields<br><em>and limits.</em></h2></div><p>${escapeHtml(page.guide)} ${escapeHtml(page.coverage)} <a href="${escapeHtml(page.source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(page.sourceLabel)}</a>. This route is noindex while feed access and useful live content are unavailable.</p></section>
  </div></main><footer class="score-footer"><a href="/" class="brand footer-brand" aria-label="ByteAfter home"><span class="brand-mark brand-mark-3d" aria-hidden="true"><img src="/byteafter-mark.webp" alt=""></span><span class="brand-word">Byte<span>After</span></span></a><span>LESS NOISE. MORE SIGNAL.</span><a href="/sports-scores/">Back to two-sport draft ↗</a></footer>
</body>
</html>`;
}
