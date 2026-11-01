import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const groupNames = ['learning', 'home', 'work'];
const plannerWindow = {AHPlannerTools: [], AHPlannerHandlers: {}};
const plannerSandbox = {window: plannerWindow, document: {querySelector: () => null, querySelectorAll: () => []}, console};
for (const group of groupNames) {
  const source = fs.readFileSync(path.join(root, `site/tools/_shared/planner-${group}.js`), 'utf8');
  vm.runInNewContext(source, plannerSandbox, {filename: `planner-${group}.js`, timeout: 3000});
}

const parserCases = [
  ['academic-reading-queue-annotation-organizer', {readings: 'Paper A | high | 12\nPaper B | medium | 8\nZero pages | low | 0'}, ['Paper A — priority High — 12 pages', 'Paper B — priority Medium — 8 pages', 'Zero pages — priority Low — 0 pages']],
  ['syllabus-study-time-allocator', {subjects: 'Advanced Algebra | 12 | 2026-11-02\nApplied Statistics | 8 | 2026-11-09', hours: 20}, ['Advanced Algebra: 12.00 hours (weight 12, due 2026-11-02)', 'Applied Statistics: 8.00 hours (weight 8, due 2026-11-09)']],
  ['capsule-wardrobe-outfit-planner', {wardrobe: 'Long sleeve shirt 12 | top | midnight blue\nBlack jeans 0 | bottom | charcoal\nWhite sneakers 24 | shoes | white', outfits: 2}, ['Long sleeve shirt 12 + Black jeans 0 + White sneakers 24']],
  ['emergency-supplies-rotation-tracker', {supplies: 'Bottled water | 12 | 2027-01-01 | rotate first\nBattery pack | 0 | 2027-04-01 | replace if needed'}, ['Bottled water (12)', 'rotate first', 'Battery pack (0)', 'replace if needed']],
  ['home-inventory-warranty-tracker', {items: 'Desk lamp 12 | Study room | SN-000012345678 / $0.00 | 2025-01-01 | 2027-01-01'}, ['Desk lamp 12 — Study room — SN-000012345678 / $0.00 — warranty 2027-01-01']],
  ['home-maintenance-schedule-planner', {tasks: 'HVAC filter | 2026-01-01 | 30'}, ['HVAC filter']],
  ['household-chore-rotation-planner', {people: 'Alex 12, Sam 0', chores: 'Clean the long kitchen counter\nTake out recycling', startDate: '2026-11-01', weeks: 2}, ['WEEK 1 (2026-11-01)', 'Clean the long kitchen counter: Alex 12', 'WEEK 2 (2026-11-08)', 'Take out recycling: Sam 0']],
  ['moving-box-inventory-label-planner', {boxes: 'B-0012 | Upstairs bedroom | 12 books and zero fragile items | open first'}, ['B-0012 | Upstairs bedroom | OPEN FIRST | 12 books and zero fragile items']],
  ['pantry-expiry-use-first-planner', {items: 'Black beans | 12 | 2026-11-15\nTea bags | 0 | 2027-02-01'}, ['Black beans (12)', 'Tea bags (0)']],
  ['plant-care-vacation-watering-planner', {plants: 'Fern 12 | 4 | 2026-10-28 | indirect light\nCactus 0 | 2 | 2026-10-30 | low water', startDate: '2026-11-01', endDate: '2026-11-05'}, ['2026-11-01 — Fern 12 (indirect light)', '2026-11-05 — Fern 12 (indirect light)', '2026-11-01 — Cactus 0 (low water)']],
  ['utility-bill-usage-cost-trend-analyzer', {bills: '2026-08 | 420 | 98.40\n2026-09 | 390 | 93.10\n2026-10 | 0 | 0.00'}, ['2026-08: usage 420, cost $98.40', '2026-09: usage 390, cost $93.10', '2026-10: usage 0, cost $0.00']],
  ['weekly-meal-plan-consolidated-grocery-list', {meals: 'Monday 12 | Dinner | rice + beans + onion\nTuesday 0 | Lunch | rice + 0g salt'}, ['Monday 12: Dinner — rice + beans + onion', 'Tuesday 0: Lunch — rice + 0g salt', 'rice (mentioned 2×)', '0g salt']],
  ['community-book-club-discussion-kit-maker', {book: 'Book title 12', author: 'Author 0', notes: 'A supplied passage 12 with the full ending intact.', themes: 'Long supplied theme 12', questions: 'Question 0 remains complete?', meetingDate: '2026-11-01'}, ['Book title 12 — Author 0', 'Long supplied theme 12', 'A supplied passage 12 with the full ending intact.', 'Question 0 remains complete?']],
  ['deadline-buffer-workload-planner', {startDate: '2026-11-01', deadline: '2026-11-20', dailyHours: 5, bufferPercent: 0, tasks: 'Research plan 12 | 12 | high\nZero hour item | 0 | low'}, ['Research plan 12: 12.00 h [high]', 'Zero hour item: 0.00 h [low]', 'TASK HOURS: 12.00']],
  ['event-seating-table-assignment-planner', {tableCount: 2, capacity: 3, guests: 'Ari 12|group-12|near window 0\nBea|group-b|quiet corner'}, ['Ari 12 [group-12] — near window 0', 'Bea [group-b] — quiet corner']],
  ['focus-distraction-pattern-log', {logs: '2026-10-01|0|zero-category|12-minute alert|writing task 12\n2026-10-02|15|message|long urgent ping|draft 0', threshold: 12}, ['zero-category: 0.0 min', 'message: 15.0 min', '12-minute alert: 0.0 min']],
  ['manual-time-audit-analyzer', {entries: '2026-10-01|Zero-minute entry 12|0|zero-minute category|no\n2026-10-02|Focused task 0|120|deep work 12|yes', targetMinutes: 0}, ['TOTAL TIME: 120.0 minutes', 'zero-minute category: 0.0 min', 'deep work 12: 120.0 min']],
  ['meeting-action-item-follow-through-board', {asOf: '2026-11-01', items: 'A-12|Owner 12|2026-10-20|open|Send final draft 12 pages\nA-0|Owner 0|2026-11-10|done|Confirm zero changes'}, ['A-12 | Owner 12 | due 2026-10-20 | open | next: Send final draft 12 pages', 'Owner 12: 1 item(s)', 'Owner 0: 1 item(s)']],
  ['meeting-agenda-speaking-time-balancer', {duration: 60, opening: 0, items: 'Status update 12|12|Ari 0|high\nDecision 0|0|Bea 12|low'}, ['Status update 12 — 12 min — Ari 0 [high]', 'Decision 0 — 0 min — Bea 12 [low]']],
  ['personal-budget-scenario-cash-flow-planner', {income: 1200, fixed: 0, variable: 300, savingsTarget: 100, oneTime: 0, scenarioChange: 0}, ['BASE EXPENSES + ONE-TIME COST: 300.00', 'SAVINGS TARGET: 100.00', 'SCENARIO REMAINING AFTER TARGET: 800.00']],
  ['remote-team-async-handoff-brief-generator', {project: 'Project 12', recipient: 'Owner 0', context: 'Context text stays intact through its final word.', completed: 'Completed item 12', next: 'Next task 0', blockers: 'No blockers 12', decisions: 'Decision 0', due: '2026-11-12', links: 'Reference path 12'}, ['Project 12 → Owner 0', 'Context text stays intact through its final word.', '- Completed item 12', '- Next task 0', 'Reference path 12']],
  ['volunteer-shift-fairness-rotator', {volunteers: 'Ari 12\nBea 0', shifts: '2026-11-01|morning shift 12|door role 0\n2026-11-02|afternoon|cleanup 12', past: 'Ari 12|2026-10-01|morning|door', seatsPerShift: 1}, ['morning shift 12', 'door role 0', 'afternoon', 'cleanup 12', 'Ari 12: 2 assignment(s)']],
];

function toText(value) {
  if (typeof value === 'string') return value;
  return [value?.summary, value?.details, ...(Array.isArray(value?.warnings) ? value.warnings : [])].filter(Boolean).join('\n\n');
}

test('all 22 tracked planner routes preserve complete input values and column positions', () => {
  assert.equal(parserCases.length, 22);
  for (const [slug, values, expected] of parserCases) {
    const handler = plannerWindow.AHPlannerHandlers[slug];
    assert.equal(typeof handler, 'function', `${slug} handler exists`);
    const output = toText(handler(values));
    for (const text of expected) assert.ok(output.includes(text), `${slug} output should include ${JSON.stringify(text)}; received:\n${output}`);
  }
  for (const group of ['learning', 'home', 'work']) {
    const source = fs.readFileSync(path.join(root, `site/tools/_shared/planner-${group}.js`), 'utf8');
    assert.doesNotMatch(source, /\.map\(clean\)/, `${group} must not pass Array.map's index to clean()`);
  }
});

test('home planner output preserves line breaks and all 15 maintenance rows past 300 characters', () => {
  const tasks = Array.from({length: 15}, (_, index) => `Task ${String(index + 1).padStart(2, '0')} | 2026-01-01 | 30`).join('\n');
  const result = plannerWindow.AHPlannerHandlers['home-maintenance-schedule-planner']({tasks});
  assert.equal(result.summary, '15 maintenance task(s) scheduled.');
  assert.ok(result.details.length > 300);
  assert.match(result.details, /Task 15: 2026-01-31/);
  assert.equal((result.details.match(/\n/g) || []).length, 14);
  assert.deepEqual(Array.from(result.warnings), []);
});

test('invalid home maintenance and plant rows are omitted and name the row and field', () => {
  const maintenance = plannerWindow.AHPlannerHandlers['home-maintenance-schedule-planner']({tasks: 'HVAC filter | 2026-09-01 | ninety'});
  assert.equal(maintenance.summary, '0 maintenance task(s) scheduled.');
  assert.equal(maintenance.details, '');
  assert.ok(maintenance.warnings.some(message => /Row 1: interval days must be a positive whole number/.test(message)));
  const plant = plannerWindow.AHPlannerHandlers['plant-care-vacation-watering-planner']({plants: 'Fern | nope | not-a-date | test', startDate: '2026-11-01', endDate: '2026-11-04'});
  assert.equal(plant.summary, '0 plant(s); 0 watering/checklist date(s) in range.');
  assert.equal(plant.details, '');
  assert.ok(plant.warnings.some(message => /Row 1: interval days must be a positive whole number/.test(message)));
  assert.ok(plant.warnings.some(message => /Row 1: last watered date must be a valid YYYY-MM-DD date/.test(message)));
  const rollover = plannerWindow.AHPlannerHandlers['home-maintenance-schedule-planner']({tasks: 'Impossible date | 2026-02-30 | 2'});
  assert.equal(rollover.summary, '0 maintenance task(s) scheduled.');
  assert.ok(rollover.warnings.some(message => /valid YYYY-MM-DD date/.test(message)));
});

test('home and learning civil-date calculations are stable in UTC, Dhaka, and a negative-offset timezone', () => {
  const source = `
    const fs = require('node:fs'); const vm = require('node:vm');
    const window = {AHPlannerTools: [], AHPlannerHandlers: {}};
    vm.runInNewContext(fs.readFileSync('site/tools/_shared/planner-learning.js', 'utf8'), {window, document: {querySelector: () => null, querySelectorAll: () => []}, console});
    vm.runInNewContext(fs.readFileSync('site/tools/_shared/planner-home.js', 'utf8'), {window, document: {querySelector: () => null, querySelectorAll: () => []}, console});
    const syllabus = window.AHPlannerHandlers['syllabus-study-time-allocator']({subjects: 'Algebra | 12 | 2026-11-02', hours: 12});
    const maintenance = window.AHPlannerHandlers['home-maintenance-schedule-planner']({tasks: 'HVAC filter | 2026-01-01 | 30'});
    const plant = window.AHPlannerHandlers['plant-care-vacation-watering-planner']({plants: 'Fern | 4 | 2026-10-28 | indirect light', startDate: '2026-11-01', endDate: '2026-11-05'});
    const chores = window.AHPlannerHandlers['household-chore-rotation-planner']({people: 'Alex', chores: 'Bins', startDate: '2026-11-01', weeks: 2});
    process.stdout.write(JSON.stringify({syllabus: syllabus.details, maintenance: maintenance.details, plant: plant.details, chores: chores.details}));
  `;
  for (const TZ of ['UTC', 'Asia/Dhaka', 'America/Los_Angeles']) {
    const result = spawnSync(process.execPath, ['-e', source], {cwd: root, env: {...process.env, TZ}, encoding: 'utf8'});
    assert.equal(result.status, 0, `${TZ}: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.match(output.syllabus, /due 2026-11-02/);
    assert.match(output.maintenance, /2026-01-31/);
    assert.match(output.plant, /2026-11-01 — Fern/);
    assert.match(output.plant, /2026-11-05 — Fern/);
    assert.match(output.chores, /WEEK 1 \(2026-11-01\)[\s\S]*WEEK 2 \(2026-11-08\)/);
  }
});

test('sports lane generator sets the shared polling interval and live status contract on every page', async () => {
  const {sportScorePages, renderSportScorePage} = await import('../scripts/sports-score-routes.mjs');
  assert.equal(sportScorePages.length, 7);
  for (const page of sportScorePages) {
    const html = renderSportScorePage(page, `https://example.test/sports-scores/${page.slug}/`);
    assert.match(html, /name="score-poll-interval-seconds" content="60"/);
    assert.match(html, /Automatic same-site feed checks run every 60 seconds/);
    assert.match(html, /id="board-summary" role="status" aria-live="polite"/);
    assert.match(html, /id="feed-notice" role="status" aria-live="polite"/);
    assert.match(html, /id="score-list" aria-live="off"/);
    assert.match(html, /sports-scores\.js\?v=4/);
  }
});
