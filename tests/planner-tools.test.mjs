import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const groups = ['gaming', 'streaming', 'writing', 'learning', 'freelance', 'home', 'work', 'privacy', 'design', 'travel'];
const allowedCategories = new Set(['pdf-documents', 'image-design', 'video-tools', 'audio-tools', 'web-seo', 'developer-utilities', 'data-spreadsheets', 'files-archives', 'privacy-security', 'ai-everyday-utilities']);
const expectedTitles = [
  'Cross-Platform Game Backlog & Session Tracker','eDPI & cm/360 Sensitivity Converter','Game Audio Mix & Voice-Chat Balance Planner','Controller Deadzone & Input Tester','PC Game Upgrade Compatibility Planner','Game Install & Storage Planner','Mod Load-Order Conflict Planner','Tabletop RPG Encounter Difficulty Planner','Tabletop Initiative & Condition Tracker','Tournament Bracket & Seeding Builder',
  'Stream Bitrate & Recording Storage Planner','Livestream Run-of-Show Cue Sheet Builder','YouTube Chapter Timestamp Builder','Podcast Transcript-to-Show-Notes Drafter','Creator Content Repurposing Draft Assistant','Sponsorship Deliverables & Deal Planner','Brand Voice Consistency Checker','Podcast Guest Brief Generator','Creative Asset License & Attribution Ledger','Creator Upload Readiness Checklist',
  'Manuscript Character/Name Consistency Finder','Long-Form Outline Coverage Checker','Repetition & Overused Phrase Finder','Dialogue Tag & Character Voice Pattern Inspector','Newsletter Subject/Preheader Previewer','Newsletter Responsive Email Previewer','Reading-Level & Jargon Simplifier','Inclusive Language Review Assistant','Translation Glossary Consistency Checker','Citation/Bibliography Completeness Checker',
  'Notes-to-Flashcards Generator','Notes-to-Quiz Generator','Spaced Repetition Study Planner','Syllabus-Based Study Time Allocator','Academic Reading Queue & Annotation Organizer','Pronunciation Practice Feedback Coach','Reading Comprehension Question Maker','Classroom Group Randomizer & Balancer','Debate Argument Map Builder','Lecture Notes Topic-Coverage Checker',
  'Freelance Quote & Margin Planner','Effective Hourly Rate Tracker','Client Capacity & Workload Planner','Proposal Scope & Assumption Draft Builder','Invoice Follow-Up Message Drafter','Marketplace Fee & Net-Profit Comparator','SKU/Variant Matrix Builder','Inventory Reorder-Point Planner','Shipping Dimensional-Weight Calculator','Wholesale Pricing & Break-Even Planner',
  'Home Inventory & Warranty Tracker','Moving Box Inventory & Label Planner','Pantry Expiry & Use-First Planner','Weekly Meal Plan & Consolidated Grocery List','Household Chore Rotation Planner','Home Maintenance Schedule Planner','Emergency Supplies Rotation Tracker','Capsule Wardrobe Outfit Planner','Plant Care & Vacation Watering Planner','Utility Bill Usage/Cost Trend Analyzer',
  'Focus Distraction Pattern Log','Deadline Buffer & Workload Planner','Manual Time Audit Analyzer','Personal Budget Scenario & Cash-Flow Planner','Remote Team Async Handoff Brief Generator','Event Seating & Table Assignment Planner','Volunteer Shift Fairness Rotator','Meeting Agenda & Speaking-Time Balancer','Community Book-Club Discussion Kit Maker','Meeting Action-Item Follow-Through Board',
  'Phishing Message Explainer','Personal Data Portability Request Organizer','Data Deletion Request Draft Generator','Home Wi-Fi Device & Guest Access Inventory','Privacy Policy Plain-English Explainer','Terms-of-Service Change Explainer','Data-Broker Removal Request Tracker','Personal Backup & Restore Drill Planner','Purchase Return-Window Tracker','Subscription Renewal Cost Tracker',
  'Font Pairing & Type-Scale Previewer','Color-Vision Simulation Previewer','Alt-Text Draft & Quality Coach','Creator Gear/Equipment Comparison Scorecard','Print Bleed & Safe-Margin Previewer','Livestream Chat Moderation Ruleset Designer','Brand Typography Consistency Auditor','Photo/Video Shoot Call-Sheet Builder','Accessible Text Layout Stress-Test Previewer','Localization Screenshot Text-Overflow QA',
  'Offline Travel Emergency Card Generator','International Business-Day Deadline Calculator','International Plug & Voltage Compatibility Checker','Travel Budget & Group Expense Planner','Weather-Aware Itinerary Packing List','Airline Baggage Allowance Comparator','eSIM Data Plan Comparator','International Public-Holiday Date Finder','Visa & Entry-Document Checklist Planner','Travel Itinerary Transfer-Buffer Planner'
];

const browserWindow = {AHPlannerTools: [], AHPlannerHandlers: {}};
const moduleSandbox = {window: browserWindow, document: {querySelector: () => null, querySelectorAll: () => []}, console};
const ownerBySlug = new Map();
for (const group of groups) {
  const source = fs.readFileSync(path.join(root, 'site/tools/_shared', `planner-${group}.js`), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|\beval\s*\(/, `${group} module must stay browser-local and avoid code evaluation`);
  const before = browserWindow.AHPlannerTools.length;
  vm.runInNewContext(source, moduleSandbox, {filename: `planner-${group}.js`, timeout: 3000});
  const added = browserWindow.AHPlannerTools.slice(before);
  assert.equal(added.length, 10, `${group} module must register exactly ten tools`);
  for (const tool of added) ownerBySlug.set(tool.slug, group);
}
const tools = browserWindow.AHPlannerTools;
const handlers = browserWindow.AHPlannerHandlers;
const toolByTitle = new Map(tools.map(tool => [tool.title, tool]));
const toolBySlug = new Map(tools.map(tool => [tool.slug, tool]));
const fieldKey = field => field.id || field.name;
const toolFolder = slug => path.join(root, 'site/tools', slug);

function sampleValues(tool) {
  const values = {};
  for (const field of tool.fields) {
    const key = fieldKey(field);
    let value = field.default;
    if (value === undefined) {
      if (field.type === 'number') value = field.min !== undefined ? Math.max(Number(field.min), 1) : 1;
      else if (field.type === 'date') value = '2025-01-15';
      else if (field.type === 'select') value = Array.isArray(field.options) ? (typeof field.options[0] === 'object' ? field.options[0]?.value : field.options[0]) : '';
      else if (field.type === 'checkbox') value = false;
      else if (/segments/i.test(key)) value = '09:00 | 11:30 | 45 | Sample transfer';
      else value = 'Example item';
    }
    values[key] = value;
  }
  return values;
}

test('the exact 100 requested planner titles appear once and do not duplicate the 155-tool baseline', () => {
  assert.equal(tools.length, 100);
  assert.equal(new Set(tools.map(tool => tool.slug)).size, 100);
  assert.equal(new Set(tools.map(tool => tool.title)).size, 100);
  assert.deepEqual([...toolByTitle.keys()].sort(), [...expectedTitles].sort());
  assert.equal(Object.keys(handlers).length, 100);
  assert.equal(expectedTitles.length, 100);
  for (const tool of tools) {
    assert.ok(allowedCategories.has(tool.categoryId), `${tool.title} stays within existing taxonomy`);
    assert.equal(typeof handlers[tool.slug], 'function', `${tool.slug} has a local handler`);
    const baselineSandbox = {window: {AHPlannerTools: []}, document: {querySelector: () => null, querySelectorAll: () => []}, console};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'site/tools/catalog.js'), 'utf8') + '\n;globalThis.__categories=categories;', baselineSandbox);
    const baseline = baselineSandbox.__categories.flatMap(category => category.availableTools).filter(item => item.href !== '/tools/screenshot-photo-text-editor/');
    assert.ok(!baseline.some(item => item.href === `/tools/${tool.slug}/` || item.title === tool.title), `${tool.title} must not duplicate an existing or researched tool`);
  }
});

test('all 100 planners have bounded supported fields and callable plain-text local outputs', () => {
  const fieldTypes = new Set(['text', 'textarea', 'number', 'date', 'select', 'checkbox']);
  for (const tool of tools) {
    assert.ok(Array.isArray(tool.fields) && tool.fields.length > 0 && tool.fields.length <= 20, `${tool.slug} declares bounded form fields`);
    const keys = tool.fields.map(fieldKey);
    assert.ok(keys.every(key => /^[a-zA-Z][\w-]{0,40}$/.test(key)), `${tool.slug} uses safe field names`);
    assert.equal(new Set(keys).size, keys.length, `${tool.slug} field names are unique`);
    for (const field of tool.fields) assert.ok(fieldTypes.has(field.type), `${tool.slug} uses a supported field type`);
    const result = handlers[tool.slug](sampleValues(tool));
    const text = typeof result === 'string' ? result : result?.summary ?? result?.text ?? result?.output ?? result?.result;
    assert.equal(typeof text, 'string', `${tool.slug} returns plain-text summary output`);
    assert.ok(text.trim().length > 0, `${tool.slug} returns a nonempty useful diagnostic`);
    assert.ok(JSON.stringify(result).length <= 1_000_000, `${tool.slug} output stays within the display bound`);
  }
});

test('planner pages contain unique crawlable metadata and use the existing local runtime/credit pool', () => {
  const runtime = fs.readFileSync(path.join(root, 'site/tools/_shared/planner-runtime.js'), 'utf8');
  assert.match(runtime, /credits\.canRun\s*\(/);
  assert.match(runtime, /credits\.charge\s*\(/);
  assert.match(runtime, /localStorage\.setItem/);
  assert.match(runtime, /textContent\s*=\s*currentText/);
  const canonicalSet = new Set();
  for (const tool of tools) {
    const html = fs.readFileSync(path.join(toolFolder(tool.slug), 'index.html'), 'utf8');
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
    assert.ok(canonical, `${tool.slug} has a canonical URL`);
    assert.ok(!canonicalSet.has(canonical), `${tool.slug} canonical is unique`);
    canonicalSet.add(canonical);
    assert.match(html, /<meta name="description" content="[^"]+"/i);
    assert.match(html, /<meta name="robots" content="index,follow"/i);
    assert.match(html, /application\/ld\+json/);
    assert.match(html, /isAccessibleForFree/);
    assert.match(html, /\/tools\/_shared\/toolkit\.js/);
    assert.match(html, new RegExp(`/tools/_shared/planner-${ownerBySlug.get(tool.slug)}\\.js`));
    assert.match(html, /\/tools\/_shared\/planner-runtime\.js/);
    assert.match(html, /data-slug="[a-z0-9-]+"/);
    assert.match(html, /<noscript>/);
  }
  assert.equal(canonicalSet.size, 100);
});

test('hub catalog data, ItemList schema, and screenshot editor route reflect exactly 256 active tools', () => {
  const dataSource = fs.readFileSync(path.join(root, 'site/tools/_shared/planner-catalog-data.js'), 'utf8');
  const dataWindow = {};
  vm.runInNewContext(dataSource, {window: dataWindow});
  assert.equal(dataWindow.AHPlannerTools.length, 100);
  assert.equal(new Set(dataWindow.AHPlannerTools.map(tool => tool.slug)).size, 100);
  const hub = fs.readFileSync(path.join(root, 'site/tools/index.html'), 'utf8');
  assert.ok(hub.indexOf('planner-catalog-data.js') < hub.indexOf('catalog.js'), 'catalog data loads before category rendering');
  const schemaText = hub.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)?.[1];
  assert.ok(schemaText, 'hub has crawlable JSON-LD');
  const schema = JSON.parse(schemaText);
  const itemList = schema['@graph'].find(item => item['@type'] === 'ItemList');
  assert.equal(itemList.numberOfItems, 256);
  assert.equal(itemList.itemListElement.length, 256);
  assert.ok(itemList.itemListElement.some(item => item.url.endsWith('/tools/screenshot-photo-text-editor/')));
  assert.ok(!itemList.itemListElement.some(item => item.url.endsWith('/tools/text-detector/')));
  const editorPage = fs.readFileSync(path.join(toolFolder('screenshot-photo-text-editor'), 'index.html'), 'utf8');
  const editorApp = fs.readFileSync(path.join(toolFolder('screenshot-photo-text-editor'), 'app.js'), 'utf8');
  assert.match(editorPage, /Screenshot &amp; Photo Text Editor/);
  assert.match(editorPage, /cdn\.jsdelivr\.net/);
  assert.match(editorPage, /'wasm-unsafe-eval'/);
  assert.doesNotMatch(editorPage, /'unsafe-eval'/, 'OCR may compile WebAssembly but must not enable JavaScript eval');
  assert.match(editorPage, /meta name="description"/);
  assert.match(editorPage, /application\/ld\+json/);
  for (const feature of [/createWorker\(/, /recognize\(/, /bbox/, /fontSuggestions/, /estimateTextColor/, /clone sample/i, /toBlob\(/, /credits\.canRun\(/, /credits\.charge\(/]) assert.match(editorApp, feature);
  assert.match(editorApp, /10_000_000/);
  assert.match(editorApp, /12 \* 1024 \* 1024/);
  assert.match(editorApp, /worker\.terminate/);
  assert.doesNotMatch(editorApp, /fetch\s*\(|XMLHttpRequest|WebSocket|\beval\s*\(/);
  assert.match(editorApp, /manual old-text repair/i);
  assert.match(editorApp, /not automatic inpainting/i);
});
