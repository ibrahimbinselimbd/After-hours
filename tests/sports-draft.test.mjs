import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { publicSportScorePages, sportScorePages } from '../scripts/sports-score-routes.mjs';

test('legacy route source remains intact while only Football and Cricket are active in the public draft', () => {
  assert.equal(sportScorePages.length, 7);
  assert.deepEqual(publicSportScorePages.map(page => page.slug), ['football', 'cricket']);
});

test('public hub contains only two sport lanes and truthful offline/global target copy', async () => {
  const html = await readFile(new URL('../site/sports-scores/index.html', import.meta.url), 'utf8');
  assert.match(html, /Football \+ Cricket/);
  assert.match(html, /Worldwide coverage is the goal—not a verified promise/);
  assert.match(html, /Football Starter is limited to five leagues/);
  assert.match(html, /no provider request/);
  assert.doesNotMatch(html, /Tennis|Basketball|Badminton|Formula 1|More sports/i);
  assert.match(html, /robots" content="noindex,nofollow/);
  assert.match(html, /scores\.json/);
});

test('draft script calls only a same-origin local snapshot and restricts sports to two', async () => {
  const script = await readFile(new URL('../site/sports-scores/sports-scores.js', import.meta.url), 'utf8');
  assert.match(script, /new Set\(\['football', 'cricket'\]\)/);
  assert.match(script, /url\.origin !== window\.location\.origin/);
  assert.doesNotMatch(script, /afterhours-district|api-sports|sportmonks\.com\/api/);
  assert.doesNotMatch(script, /setInterval/);
});

test('detail controls label each panel unavailable without sample score data', async () => {
  const {renderSportScorePage, publicSportScorePages} = await import('../scripts/sports-score-routes.mjs');
  for (const page of publicSportScorePages) {
    const html = renderSportScorePage(page, `https://example.test/sports-scores/${page.slug}/`);
    assert.match(html, /Unavailable — no verified/);
    assert.match(html, /data-detail-section/);
    assert.match(html, /score-feed-endpoint/);
    assert.doesNotMatch(html, /TEST fixture|SAMPLE SCORE|2-1|120\/3/i);
  }
});
