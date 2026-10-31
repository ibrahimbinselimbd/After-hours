const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));

export const sportScorePages = [
  {
    slug: 'football', sport: 'football', label: 'Football', icon: '⚽', title: 'Football Scores & Fixtures | AFTERHOURS',
    description: 'Follow the AFTERHOURS football score page for live matches, fixtures and results. No verified football feed is connected, so no score data is displayed yet.',
    intro: 'A dedicated page for association football (often called soccer): match status, two sides, score and competition details when a verified first-party feed supplies them. No live football feed is connected, and this page currently has no fixtures or results.',
    guide: 'The current score card can represent two sides, a competition, a score, match status, period, start time and venue when those fields are supplied. Competition coverage will depend on the verified feed and the account package; no league availability is promised here.',
    coverage: 'Goalserve’s public catalogue lists Football and Soccer data-feed categories. That confirms the categories are advertised publicly, not that any specific league is included in the selected subscription or active for AFTERHOURS.',
    source: 'https://www.goalserve.com/en/sport-data-feeds', sourceLabel: 'Goalserve public sports-feed catalogue',
  },
  {
    slug: 'cricket', sport: 'cricket', label: 'Cricket', icon: '◉', title: 'Cricket Scores & Fixtures | AFTERHOURS',
    description: 'Check the AFTERHOURS cricket score page for live matches, schedules and results. No verified cricket feed is connected, so no score data is displayed yet.',
    intro: 'A dedicated cricket route for match status, teams and score summaries when an approved first-party feed supplies them. No cricket feed is connected, and no live scorecard, fixture or result is being simulated.',
    guide: 'The shared score card currently treats each side’s score as plain text; it does not yet parse innings, overs or wickets into a cricket scorecard. A cricket-specific adapter and review are required before those fields can be promised or shown.',
    coverage: 'Goalserve’s public cricket page describes cricket feeds and names competitions including the Bangladesh Premier League. This does not confirm coverage in the intended Full Package subscription or the owner’s account.',
    source: 'https://www.goalserve.com/en/sport-data-feeds/cricket-api/description/14', sourceLabel: 'Goalserve cricket feed details',
  },
  {
    slug: 'tennis', sport: 'tennis', label: 'Tennis', icon: '◌', title: 'Tennis Scores & Match Results | AFTERHOURS',
    description: 'Follow the AFTERHOURS tennis score page for match updates, fixtures and results. No verified tennis feed is connected, so no score data is displayed yet.',
    intro: 'A dedicated tennis route for tournament matches and player or doubles-pair score summaries when a verified first-party feed supplies them. No tennis feed is connected, and there are no live matches or results on this page yet.',
    guide: 'The shared score card can hold two participants and one score string, but it does not yet format set-by-set games or point-by-point data. A tennis-specific adapter is needed before detailed tennis scoring can be represented accurately.',
    coverage: 'Goalserve’s public tennis page lists tours and competition types such as ATP, WTA, Challenger, ITF and Davis Cup. The exact coverage and fields for the intended subscription still need confirmation.',
    source: 'https://www.goalserve.com/en/sport-data-feeds/tennis-api/description/14', sourceLabel: 'Goalserve tennis feed details',
  },
  {
    slug: 'basketball', sport: 'basketball', label: 'Basketball', icon: '◉', title: 'Basketball Scores & Fixtures | AFTERHOURS',
    description: 'Check the AFTERHOURS basketball score page for live games, fixtures and results. No verified basketball feed is connected, so no score data is displayed yet.',
    intro: 'A dedicated basketball route for games, team scores and status when an approved first-party feed supplies them. No basketball feed is connected, so there are no live games, schedules or results to report here.',
    guide: 'The current shared card can display two teams, a score and a period label. It does not yet model a game clock, quarter-by-quarter score or player box score; those require verified source fields and a basketball-specific adapter.',
    coverage: 'Goalserve’s public basketball page lists competitions including NBA and NCAA. Those examples are not a confirmation that they are enabled in the intended Full Package subscription or account.',
    source: 'https://www.goalserve.com/en/sport-data-feeds/nba-api/description/14', sourceLabel: 'Goalserve basketball feed details',
  },
  {
    slug: 'badminton', sport: 'badminton', label: 'Badminton', icon: '⌁', title: 'Badminton Scores & Match Results | AFTERHOURS',
    description: 'The AFTERHOURS badminton score page is reserved for verified match data. No badminton feed is connected, and no scores or fixtures are available yet.',
    intro: 'A dedicated badminton route for singles or doubles matches if a suitable feed is confirmed and connected. There is no badminton score data here today, and no provider coverage is assumed.',
    guide: 'The generic card can represent two players or pairs and a plain-text score, but it does not parse game-by-game badminton scoring. A badminton-specific adapter and a confirmed data source are required before this page can report results.',
    coverage: 'Badminton is not explicitly named in the Goalserve public sports catalogue we checked. That absence does not prove the data is unavailable, but coverage remains unverified and must not be advertised as active.',
    source: 'https://www.goalserve.com/en/sport-data-feeds', sourceLabel: 'Goalserve public sports-feed catalogue',
  },
  {
    slug: 'formula-1', sport: 'f1', label: 'Formula 1', icon: '↗', title: 'Formula 1 Scores & Race Sessions | AFTERHOURS',
    description: 'Follow the AFTERHOURS Formula 1 score page for verified race-session information. No Formula 1 feed is connected, and no session data or results are displayed yet.',
    intro: 'A dedicated Formula 1 route for verified race-weekend session information. No Formula 1 feed is connected, and this page currently contains no qualifying, sprint or race results.',
    guide: 'The current shared card is designed for a two-side match, not a race-session timetable or driver classification. An F1-specific feed adapter and leaderboard rendering are required before the page can publish session or finishing-order data.',
    coverage: 'Goalserve’s public F1 page lists Formula 1 and other racing series. This is public catalogue information only; the intended subscription, session fields and account access have not been verified.',
    source: 'https://www.goalserve.com/en/sport-data-feeds/f1-api/description/14', sourceLabel: 'Goalserve F1 feed details',
  },
  {
    slug: 'more-sports', sport: 'other', label: 'More sports', icon: '＋', title: 'More Sports Scores | AFTERHOURS',
    description: 'Browse the AFTERHOURS additional-sports score lane. No extra sports feed is connected or verified, so this page does not claim live coverage.',
    intro: 'This route is a placeholder for sports beyond the six named lanes. No additional sports are currently being reported; a sport will appear here only after its provider coverage, data fields and first-party feed are verified.',
    guide: 'The current page model supports a small set of match-style fields. Every added sport needs an explicit provider-coverage check and a suitable data mapping; formats that need a different model must not be squeezed into a misleading match card.',
    coverage: 'Goalserve describes a broad Full Package and publishes a sports catalogue, but neither statement proves which feeds are included in an unpurchased account. The exact package and each sport must be confirmed before adding coverage claims.',
    source: 'https://www.goalserve.com/en/sport-data-feeds', sourceLabel: 'Goalserve public sports-feed catalogue',
  },
];

export function renderSportScorePage(page, canonicalUrl) {
  const otherPages = sportScorePages.map(item => {
    const current = item.slug === page.slug;
    return `<a class="sport-tab${current ? ' is-active' : ''}" href="/sports-scores/${item.slug}/"${current ? ' aria-current="page"' : ''}><span class="sport-tab-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>${escapeHtml(item.label)}</a>`;
  }).join('');
  const statusName = page.label.toLowerCase();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#080a16">
  <meta name="description" content="${escapeHtml(page.description)}">
  <meta name="robots" content="noindex,follow">
  <meta name="score-feed-endpoint" content="../scores.json">
  <meta name="score-poll-interval-seconds" content="60">
  <meta name="score-sport" content="${escapeHtml(page.sport)}">
  <meta name="score-sport-label" content="${escapeHtml(page.label)}">
  <meta property="og:site_name" content="AFTERHOURS">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(page.title)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <title>${escapeHtml(page.title)}</title>
  <link rel="stylesheet" href="/fonts.css">
  <link rel="stylesheet" href="../sports-scores.css?v=3">
  <script defer src="../sports-scores.js?v=4"></script>
</head>
<body class="sports-page" data-score-page="${escapeHtml(page.slug)}">
  <a class="skip-link" href="#scoreboard">Skip to the ${escapeHtml(statusName)} scoreboard</a>
  <header class="sports-header">
    <a class="sports-brand" href="/" aria-label="AFTERHOURS home"><span class="brand-mark">a<span>h</span></span><span class="brand-name">AFTER<span>HOURS</span><small> / SPORTS SIGNAL</small></span></a>
    <nav class="sports-nav" aria-label="Main navigation"><a href="/#feed">The journal</a><a href="/districts/">The districts</a><a href="/tools/">Tools</a><a href="/sports-scores/" aria-current="page">Scores</a></nav>
    <a class="sports-header-badge" href="/sports-scores/" aria-label="All sports scores"><span>SPORTS<small>LIVE BOARD</small></span><i aria-hidden="true"></i></a>
  </header>
  <main>
    <div class="score-wrap">
      <div class="score-breadcrumb"><a href="/">AFTERHOURS</a><span aria-hidden="true">/</span><a href="/sports-scores/">ALL SPORTS</a><span aria-hidden="true">/</span><span>${escapeHtml(page.label.toUpperCase())}</span></div>
      <section class="score-hero" aria-labelledby="score-title">
        <div class="score-hero-copy">
          <div class="score-eyebrow"><i aria-hidden="true"></i> SPORT SCORE PAGE <span>${escapeHtml(page.label.toUpperCase())}</span></div>
          <h1 id="score-title">${escapeHtml(page.label)}<br><em>scores.</em></h1>
          <p>${escapeHtml(page.intro)}</p>
          <div class="score-hero-actions"><a class="score-primary" href="#scoreboard">View ${escapeHtml(page.label)} board <span aria-hidden="true">↓</span></a><span class="score-clean-note"><b aria-hidden="true">✳</b> No simulated scores. Feed status is shown plainly.</span></div>
        </div>
        <div class="score-hero-art" aria-hidden="true"><div class="score-orbit orbit-one"></div><div class="score-orbit orbit-two"></div><div class="score-orbit orbit-three"></div><div class="score-art-core"><span>${escapeHtml(page.label.toUpperCase())}</span></div></div>
      </section>
      <section class="score-board" id="scoreboard" aria-labelledby="board-title">
        <div class="board-heading"><div><div class="board-kicker">SPORT LANE / ${escapeHtml(page.label.toUpperCase())}</div><h2 id="board-title">${escapeHtml(page.label)} <span>score signal.</span></h2><p>${escapeHtml(page.intro)}</p></div>
          <div class="board-stats" aria-label="Scoreboard summary"><div><strong id="live-count">00</strong><small>LIVE NOW</small></div><div><strong id="match-count">00</strong><small>ON THIS PAGE</small></div><div><strong>01</strong><small>SPORT LANE</small></div></div>
        </div>
        <nav class="sport-filter" aria-label="Other sports score pages"><a class="sport-tab" href="/sports-scores/">✳ All sports</a>${otherPages}</nav>
        <div class="board-controls">
          <div class="state-filter" role="group" aria-label="Filter ${escapeHtml(page.label)} matches by status"><button type="button" class="state-tab is-active" data-state="all" aria-pressed="true">All matches</button><button type="button" class="state-tab" data-state="live" aria-pressed="false">Live <i aria-hidden="true"></i></button><button type="button" class="state-tab" data-state="upcoming" aria-pressed="false">Upcoming</button><button type="button" class="state-tab" data-state="finished" aria-pressed="false">Results</button></div>
          <div class="board-tools"><span id="board-summary" role="status" aria-live="polite">Waiting for the site’s ${escapeHtml(statusName)} score feed</span><button type="button" id="refresh-scores"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.2 9A6.5 6.5 0 0 1 17 6l3 6M4 12l3 6a6.5 6.5 0 0 0 10.8-3"/></svg> Refresh</button></div>
        </div>
        <div class="feed-notice" id="feed-notice" role="status" aria-live="polite"><span class="notice-mark" aria-hidden="true">i</span><div><strong id="feed-state">First-party feed not connected</strong><p>No ${escapeHtml(statusName)} provider call or score key is active in this page. Coverage and data fields must be verified for the selected subscription before live information can appear.</p><p id="feed-polling-copy">Automatic same-site feed checks run every 60 seconds while this page is visible. Use Refresh to check now.</p></div><span class="feed-update" id="feed-updated">NO FEED / WAITING</span></div>
        <div class="score-grid" id="score-list" aria-live="off" aria-busy="false"></div>
        <div class="score-empty" id="score-empty"><div class="empty-orbit" aria-hidden="true"><span>0</span></div><div class="empty-copy"><span class="empty-kicker">${escapeHtml(page.label.toUpperCase())} / NO VERIFIED DATA</span><h3>No ${escapeHtml(statusName)} scores available yet.</h3><p>No live scores, fixtures or results are served for this lane today. The site will show feed-backed data only after the provider feed and its sport-specific fields are verified.</p></div></div>
      </section>
      <section class="score-data-note" aria-labelledby="page-guide-title"><div class="data-note-icon" aria-hidden="true">${escapeHtml(page.icon)}</div><div><span class="board-kicker">PAGE GUIDE / ${escapeHtml(page.label.toUpperCase())}</span><h2 id="page-guide-title">What this lane<br><em>can show.</em></h2></div><div><p>${escapeHtml(page.guide)}</p><p>${escapeHtml(page.coverage)} <a href="${escapeHtml(page.source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(page.sourceLabel)}</a>.</p><p><strong>Indexing status:</strong> This route is crawlable but intentionally marked noindex while its verified feed and useful live content are unavailable. Review page quality and data accuracy before changing that directive.</p></div></section>
    </div>
  </main>
  <footer class="score-footer"><a href="/" class="footer-brand">AFTER<span>HOURS</span></a><span>LESS NOISE. MORE SIGNAL.</span><a href="/sports-scores/">All sports scores ↗</a></footer>
</body>
</html>
`;
}
