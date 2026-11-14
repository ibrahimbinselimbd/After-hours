#!/usr/bin/env node
'use strict';

/* Contrast, keyboard, responsive, and disabled-state regression for built Pages.
 * Run after `node scripts/build-github-pages.mjs`:
 *   SCREENSHOTS=1 node tests/day-contrast-regression.cjs
 * Text over composited imagery/gradients is reported indeterminate, not guessed.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')); }
catch { ({ chromium } = require('/workspace/afterhours-home-qa/node_modules/playwright')); }

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const BASE_PATH = (process.env.PAGES_BASE_PATH || '/After-hours').replace(/\/$/, '');
const BASE_URL = (process.env.BASE_URL || `http://${HOST}:${PORT}${BASE_PATH}`).replace(/\/$/, '');
const PAGES_ROOT = path.join(ROOT, 'public');
const SCREENSHOT_ROOT = process.env.SCREENSHOT_DIR || '/workspace/afterhours-day-contrast-final-evidence-20261115';
const REPORT = process.env.CONTRAST_REPORT || path.join(ROOT, 'tests', 'day-contrast-regression-report.json');
const ROUTES = [
  { name: 'homepage', path: '/' },
  { name: 'article', path: '/article.html?story=power-to-the-players-act-ownership-offline-mode' },
  { name: 'districts', path: '/districts/', state: 'no-results' },
  { name: 'info', path: '/info.html?page=about' },
  { name: 'tools-hub', path: '/tools/' },
  { name: 'tool-detail', path: '/tools/passport-photo-studio/' },
  { name: 'sports', path: '/sports-scores/' },
  { name: 'background-remover', path: '/tools/background-remover/' },
  { name: 'qr-generator', path: '/tools/qr-code-generator/' },
  { name: 'text-detector', path: '/tools/text-detector/' }
];
const VIEWPORTS = [
  { name: '320', width: 320, height: 800 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 }
];
const KEYBOARD_VIEWPORTS = new Set(['320', '1440']);

function startBuiltSiteServer() {
  if (!fs.existsSync(path.join(PAGES_ROOT, 'index.html'))) throw new Error(`Missing ${PAGES_ROOT}/index.html. Build first.`);
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
  return http.createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!(pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`))) { res.writeHead(404); return res.end('Not found'); }
    const relative = pathname.slice(BASE_PATH.length).replace(/^\/+/, '');
    let file = path.resolve(PAGES_ROOT, relative || 'index.html');
    if (pathname.endsWith('/') && relative) file = path.join(file, 'index.html');
    if (!file.startsWith(`${PAGES_ROOT}${path.sep}`)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  }).listen(PORT, HOST);
}

function waitForServer(url, timeout = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const retry = () => Date.now() - start > timeout ? reject(new Error(`Server not ready: ${url}`)) : setTimeout(probe, 100);
    const probe = () => {
      const req = http.get(url, res => { res.resume(); if (res.statusCode < 500) resolve(); else retry(); });
      req.on('error', retry);
      req.setTimeout(900, () => { req.destroy(); retry(); });
    };
    probe();
  });
}

async function inspectPage(page, theme) {
  return page.evaluate(({ theme }) => {
    const parseColor = value => {
      const m = String(value).match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
      if (!m) return null;
      const alpha = m[4] == null ? 1 : Number(m[4].replace('%', '')) / (m[4].includes('%') ? 100 : 1);
      return Number.isFinite(alpha) && alpha >= .999 ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    };
    const luminance = value => {
      const rgb = Array.isArray(value) ? value : parseColor(value);
      if (!rgb) return null;
      const c = rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
    };
    const ratio = (fg, bg) => {
      const a = luminance(fg), b = luminance(bg);
      return a == null || b == null ? null : (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    };
    const selectorFor = el => el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}`;
    const rendered = el => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && el.getClientRects().length > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.visibility !== 'collapse' && Number(s.opacity) > 0 && !el.closest('[hidden],[aria-hidden="true"],script,style,noscript,template,svg,.sr-only,.visually-hidden');
    };
    const background = el => {
      const chain = [];
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const s = getComputedStyle(n);
        chain.push({ selector: selectorFor(n), color: s.backgroundColor, image: s.backgroundImage, opacity: s.opacity });
        if (Number(s.opacity) < .999) return { color: s.backgroundColor, chain: chain.slice(0, 5), reliable: false, reason: 'opacity-compositing' };
        if (s.backgroundImage && s.backgroundImage !== 'none') return { color: s.backgroundColor, chain: chain.slice(0, 5), reliable: false, reason: 'image-or-gradient' };
        if (parseColor(s.backgroundColor)) return { color: s.backgroundColor, chain: chain.slice(0, 5), reliable: true, reason: null };
      }
      return { color: 'rgba(0,0,0,0)', chain: chain.slice(0, 5), reliable: false, reason: 'transparent-background' };
    };
    const textEntries = [];
    const failures = [];
    const indeterminate = [];
    const recordText = (el, value, kind = 'text', styleOverride = null) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      if (!text || !rendered(el)) return;
      const s = styleOverride || getComputedStyle(el);
      const bg = background(el), disabledEl = el.closest(':disabled,[aria-disabled="true"]');
      const size = parseFloat(s.fontSize) || 0, weight = parseInt(s.fontWeight, 10) || 400;
      const isLarge = size >= 24 || (size >= 18.6667 && weight >= 700);
      const threshold = disabledEl ? null : (isLarge ? 3 : 4.5);
      const fg = parseColor(s.color), back = bg.reliable ? parseColor(bg.color) : null;
      const item = { kind, element: selectorFor(el), text: text.slice(0, 96), fg: s.color, bg: bg.color, bgReliable: bg.reliable, bgReason: bg.reason, bgChain: bg.chain, fontSize: s.fontSize, fontWeight: s.fontWeight, disabled: !!disabledEl, wcagThreshold: threshold, ratio: fg && back ? ratio(fg, back) : null };
      textEntries.push(item);
      if (!bg.reliable || !fg || !back) { if (indeterminate.length < 16) indeterminate.push(item); return; }
      if (theme === 'day' && !disabledEl && item.ratio != null && item.ratio + .005 < threshold) failures.push({ issue: kind === 'placeholder' ? 'placeholder-contrast' : 'text-contrast', ...item });
    };

    // Include the full rendered document, not just elements intersecting the initial viewport.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) recordText(n.parentElement, n.nodeValue);
    for (const el of document.querySelectorAll('input[placeholder],textarea[placeholder]')) {
      if (rendered(el)) recordText(el, el.getAttribute('placeholder'), 'placeholder', getComputedStyle(el, '::placeholder'));
    }

    const disabledSelector = 'button:disabled,input:disabled,select:disabled,textarea:disabled,[aria-disabled="true"]';
    const disabledStates = [...document.querySelectorAll(disabledSelector)].filter(rendered).map(el => {
      const s = getComputedStyle(el), bg = background(el), r = bg.reliable ? ratio(s.color, bg.color) : null;
      let effectiveOpacity = 1, ancestorFilters = [];
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const a = getComputedStyle(n); effectiveOpacity *= Number(a.opacity || 1);
        if (a.filter !== 'none') ancestorFilters.push({ selector: selectorFor(n), filter: a.filter });
      }
      const item = { element: selectorFor(el), text: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80), color: s.color, background: bg.color, backgroundReliable: bg.reliable, opacity: s.opacity, effectiveOpacity, filter: s.filter, ancestorFilters, borderColor: s.borderColor, cursor: s.cursor, usabilityRatio: r };
      if (theme === 'day' && effectiveOpacity < .9) failures.push({ issue: 'disabled-opacity-usability', ...item, minimum: .9 });
      if (theme === 'day' && ancestorFilters.length) failures.push({ issue: 'disabled-filter-usability', ...item });
      return item;
    });

    const processButton = document.querySelector('#process-button');
    let disabledPrimaryButton = null;
    if (processButton && rendered(processButton)) {
      const s = getComputedStyle(processButton), bg = background(processButton);
      const bgRgb = bg.reliable ? parseColor(bg.color) : null;
      const textWalker = document.createTreeWalker(processButton, NodeFilter.SHOW_TEXT);
      const textRuns = [];
      for (let n = textWalker.nextNode(); n; n = textWalker.nextNode()) {
        const text = String(n.nodeValue || '').replace(/\s+/g, ' ').trim();
        if (!text || !rendered(n.parentElement)) continue;
        const ts = getComputedStyle(n.parentElement), fg = parseColor(ts.color);
        textRuns.push({ text, color: ts.color, ratio: fg && bgRgb ? ratio(fg, bgRgb) : null });
      }
      const ratios = textRuns.map(run => run.ratio);
      const minimumTextContrast = ratios.length && ratios.every(value => value != null) ? Math.min(...ratios) : null;
      disabledPrimaryButton = { nativeDisabled: processButton.matches(':disabled'), disabledAttribute: processButton.hasAttribute('disabled'), color: s.color, background: bg.color, backgroundReliable: bg.reliable, borderColor: s.borderColor, opacity: s.opacity, cursor: s.cursor, minimumTextContrast, contrastThreshold: 4.5, textRuns };
      if (theme === 'day' && (!disabledPrimaryButton.nativeDisabled || !disabledPrimaryButton.disabledAttribute)) failures.push({ issue: 'background-remover-primary-button-not-disabled', element: '#process-button', ...disabledPrimaryButton });
      if (theme === 'day' && (!bg.reliable || minimumTextContrast == null || minimumTextContrast + .005 < 4.5)) failures.push({ issue: 'background-remover-disabled-primary-button-contrast', element: '#process-button', ...disabledPrimaryButton });
    } else if (document.body.classList.contains('cut-page')) {
      failures.push({ issue: 'background-remover-primary-button-missing-or-hidden', element: '#process-button', theme });
    }

    const focusSelector = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"]):not(:disabled),[contenteditable="true"]';
    const focusables = [...document.querySelectorAll(focusSelector)].filter(rendered);
    const html = document.documentElement;
    return {
      theme, themeAttr: html.dataset.theme || null, toggle: !!document.querySelector('#theme-toggle'), title: document.title,
      viewport: { width: innerWidth, height: innerHeight }, scrollWidth: html.scrollWidth, bodyScrollWidth: document.body.scrollWidth,
      textCount: textEntries.length, reliableTextCount: textEntries.filter(item => item.ratio != null && !item.disabled).length,
      indeterminateCount: textEntries.filter(item => item.ratio == null || item.bgReliable === false).length,
      indeterminateSamples: indeterminate, worstText: textEntries.filter(item => item.ratio != null && !item.disabled).sort((a, b) => a.ratio - b.ratio)[0] || null,
      disabledCount: disabledStates.length, disabledStates: disabledStates.slice(0, 40), disabledPrimaryButton, focusableCount: focusables.length, failures
    };
  }, { theme });
}

async function keyboardTabAudit(page, theme) {
  const viewport = page.viewportSize();
  if (viewport) await page.mouse.move(Math.max(1, viewport.width - 2), Math.max(1, viewport.height - 2));
  const expectedCount = await page.evaluate(() => {
    const selector = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"]):not(:disabled),[contenteditable="true"]';
    const rendered = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return el.tabIndex >= 0 && r.width > 0 && r.height > 0 && el.getClientRects().length > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.visibility !== 'collapse' && !el.closest('[hidden],[inert]'); };
    const pool = [...document.querySelectorAll(selector)].filter(rendered);
    const baseline = new WeakMap();
    for (const el of pool) for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (!baseline.has(n)) {
        const s = getComputedStyle(n);
        baseline.set(n, { outlineColor: s.outlineColor, outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow, borderColor: s.borderColor, borderTopWidth: s.borderTopWidth, backgroundColor: s.backgroundColor });
      }
    }
    window.__qaFocusBaseline = baseline;
    return pool.length;
  });
  const maxSteps = Math.min(Math.max(expectedCount + 3, 10), 3000);
  const seen = new Map(), failures = [];
  let firstOrder = null, wrapped = false, stoppedAt = null;
  for (let step = 0; step < maxSteps; step++) {
    await page.keyboard.press('Tab');
    const state = await page.evaluate(() => {
      const selector = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"]):not(:disabled),[contenteditable="true"]';
      const rendered = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return el.tabIndex >= 0 && r.width > 0 && r.height > 0 && el.getClientRects().length > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.visibility !== 'collapse' && !el.closest('[hidden],[inert]'); };
      const pool = [...document.querySelectorAll(selector)].filter(rendered);
      const el = document.activeElement;
      const order = pool.indexOf(el);
      if (order < 0) return null;
      const sel = n => n.id ? `#${n.id}` : `${n.tagName.toLowerCase()}${typeof n.className === 'string' && n.className.trim() ? `.${n.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}`;
      let owner = null, ring = null;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (!(n.matches(':focus-visible') || n.matches(':focus-within'))) continue;
        const before = window.__qaFocusBaseline?.get(n);
        const width = parseFloat(s.outlineWidth) || 0;
        const outline = s.outlineStyle !== 'none' && width >= 2 && !/rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(s.outlineColor);
        const shadow = !!before && s.boxShadow !== 'none' && s.boxShadow !== before.boxShadow;
        const border = !!before && s.borderColor !== before.borderColor && (parseFloat(s.borderTopWidth) || 0) >= 2;
        const fill = !!before && s.backgroundColor !== before.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)';
        if (outline || shadow || border || fill) {
          owner = n;
          ring = { kind: outline ? 'outline' : shadow ? 'box-shadow' : border ? 'border' : 'background-change', color: s.outlineColor, style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, boxShadow: s.boxShadow, borderColor: s.borderColor, backgroundColor: s.backgroundColor };
          break;
        }
      }
      const bgEl = owner?.parentElement || el.parentElement;
      let bg = null;
      for (let n = bgEl; n && n.nodeType === 1; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (Number(s.opacity) < .999 || (s.backgroundImage && s.backgroundImage !== 'none')) break;
        if (s.backgroundColor !== 'rgba(0, 0, 0, 0)') { bg = s.backgroundColor; break; }
      }
      const parse = x => { const m = String(x).match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i); return m ? [+m[1],+m[2],+m[3]] : null; };
      const lum = rgb => { if (!rgb) return null; const c=rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
      const a=ring?.kind === 'outline' ? lum(parse(ring.color)) : null,b=lum(parse(bg));
      const focusContrast=a==null||b==null?null:(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      return { order, selector: sel(el), text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g,' ').slice(0,64), focusVisible: el.matches(':focus-visible'), indicatorVisible: !!ring, ringOwner: owner ? sel(owner) : null, ring, focusContrast };
    });
    if (!state) { stoppedAt = 'focus-left-page-or-non-tabstop'; break; }
    if (firstOrder == null) firstOrder = state.order;
    else if (state.order === firstOrder) { wrapped = true; break; }
    if (seen.has(state.order)) { stoppedAt = 'tab-order-repeated-before-wrap'; break; }
    seen.set(state.order, state);
    if (theme === 'day' && !state.focusVisible) failures.push({ issue: 'tab-focus-not-focus-visible', ...state, theme });
    if (theme === 'day' && !state.indicatorVisible) failures.push({ issue: 'missing-keyboard-focus-indicator', ...state, theme });
    if (theme === 'day' && state.focusContrast != null && state.focusContrast < 3) failures.push({ issue: 'focus-indicator-contrast', ...state, threshold: 3, theme });
  }
  if (seen.size < expectedCount) failures.push({ issue: 'keyboard-tab-stops-missed', theme, expectedCount, visitedCount: seen.size, stoppedAt, wrapped });
  return { theme, expectedCount, visitedCount: seen.size, wrapped, stoppedAt, failures, samples: [...seen.values()].slice(0, 10) };
}

async function screenshot(page, route, viewport, theme) {
  if (process.env.SCREENSHOTS !== '1' || !(theme === 'day' || viewport.name === '1440')) return null;
  fs.mkdirSync(SCREENSHOT_ROOT, { recursive: true });
  const output = path.join(SCREENSHOT_ROOT, `${route.name}-${viewport.name}-${theme}.png`);
  await page.screenshot({ path: output, fullPage: false, animations: 'disabled', timeout: 15000 });
  return output;
}

async function specialScreenshot(page, name) {
  if (process.env.SCREENSHOTS !== '1') return null;
  fs.mkdirSync(SCREENSHOT_ROOT, { recursive: true });
  const output = path.join(SCREENSHOT_ROOT, `${name}.png`);
  await page.screenshot({ path: output, fullPage: false, animations: 'disabled', timeout: 15000 });
  return output;
}

async function checkOverflow(data, failures, route, viewport, theme, state = 'default') {
  if (data.scrollWidth > viewport.width + 1 || data.bodyScrollWidth > viewport.width + 1) failures.push({ issue: 'horizontal-overflow', route: route.name, path: route.path, viewport: viewport.name, theme, state, scrollWidth: data.scrollWidth, bodyScrollWidth: data.bodyScrollWidth });
}

async function settleThemeStyles(page) {
  await page.waitForFunction(() => ['theme-toggle.css', 'pages-theme.css'].every(name => {
    const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(el => el.href.includes(name));
    if (!link || !link.sheet) return false;
    try { return link.sheet.cssRules.length > 0; } catch { return false; }
  }), null, { timeout: 10000 });
  await page.evaluate(() => document.fonts?.ready || Promise.resolve());
  await page.waitForFunction(() => !document.getAnimations().some(a => a.constructor?.name === 'CSSTransition' && a.playState === 'running'), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(60);
}

async function freshDayKeyboardAudit(context, route) {
  const focusPage = await context.newPage();
  focusPage.setDefaultNavigationTimeout(20000);
  try {
    const separator = route.path.includes('?') ? '&' : '?';
    const url = `${BASE_URL}${route.path}${separator}__qa_theme=day`;
    const response = await focusPage.goto(url, { waitUntil: 'load', timeout: 20000 });
    if (!response || response.status() >= 400) throw new Error(`Day keyboard page returned ${response?.status() || 0}`);
    await focusPage.waitForFunction(() => document.documentElement.dataset.theme === 'day', null, { timeout: 5000 });
    await settleThemeStyles(focusPage);
    return await keyboardTabAudit(focusPage, 'day');
  } finally { await focusPage.close().catch(() => {}); }
}

async function main() {
  let server, browser;
  const failures = [], results = [];
  try {
    if (!process.env.BASE_URL) server = startBuiltSiteServer();
    await waitForServer(`${BASE_URL}/`);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true });
    for (const viewport of VIEWPORTS) for (const route of ROUTES) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: 'dark' });
      await context.addInitScript(() => {
        if (new URL(location.href).searchParams.get('__qa_theme') === 'day') localStorage.setItem('byteafter-theme', 'day');
        else localStorage.removeItem('byteafter-theme');
      });
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(20000);
      try {
        const response = await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        if (!response || response.status() >= 400) {
          failures.push({ issue: 'http-error', route: route.name, path: route.path, viewport: viewport.name, status: response?.status() || 0 });
          continue;
        }
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'night', null, { timeout: 5000 });
        await settleThemeStyles(page);
        if (!(await page.title()).trim()) failures.push({ issue: 'missing-title', route: route.name, path: route.path, viewport: viewport.name });
        const nightAttr = await page.evaluate(() => document.documentElement.dataset.theme || null);
        if (nightAttr !== 'night') failures.push({ issue: 'night-theme-not-default', route: route.name, path: route.path, viewport: viewport.name, themeAttr: nightAttr });
        const nightShot = await screenshot(page, route, viewport, 'night');
        const night = await inspectPage(page, 'night');
        await checkOverflow(night, failures, route, viewport, 'night');
        const nightTab = KEYBOARD_VIEWPORTS.has(viewport.name) ? await keyboardTabAudit(page, 'night') : null;
        if (nightTab) failures.push(...nightTab.failures.map(f => ({ route: route.name, path: route.path, viewport: viewport.name, ...f })));

        const toggle = page.locator('#theme-toggle');
        if (!(await toggle.count())) {
          failures.push({ issue: 'missing-theme-toggle', route: route.name, path: route.path, viewport: viewport.name });
          results.push({ route: route.name, path: route.path, viewport, night, day: null, keyboardTab: { night: nightTab, day: null }, states: [], screenshots: { night: nightShot } });
          continue;
        }
        await toggle.click({ timeout: 5000 });
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'day', null, { timeout: 5000 });
        await settleThemeStyles(page);
        const dayShot = await screenshot(page, route, viewport, 'day');
        const day = await inspectPage(page, 'day');
        if (day.themeAttr !== 'day') failures.push({ issue: 'day-theme-not-applied', route: route.name, path: route.path, viewport: viewport.name, themeAttr: day.themeAttr });
        await checkOverflow(day, failures, route, viewport, 'day');
        for (const f of day.failures) failures.push({ route: route.name, path: route.path, viewport: viewport.name, theme: 'day', ...f });
        const dayTab = KEYBOARD_VIEWPORTS.has(viewport.name) ? await freshDayKeyboardAudit(context, route) : null;
        if (dayTab) failures.push(...dayTab.failures.map(f => ({ route: route.name, path: route.path, viewport: viewport.name, ...f })));

        let disabledPrimaryScreenshot = null;
        if (route.name === 'background-remover' && process.env.SCREENSHOTS === '1') {
          await page.locator('#process-button').scrollIntoViewIfNeeded();
          disabledPrimaryScreenshot = await specialScreenshot(page, `background-remover-process-disabled-${viewport.name}-day`);
        }

        const states = [];
        if (route.state === 'no-results') {
          await page.locator('#topic-search').fill('__qa_no_matching_district_7f3__');
          await page.waitForFunction(() => [...document.querySelectorAll('.no-results')].some(el => getComputedStyle(el).display !== 'none' && el.getClientRects().length), null, { timeout: 5000 });
          await settleThemeStyles(page);
          const noResults = await inspectPage(page, 'day');
          await checkOverflow(noResults, failures, route, viewport, 'day', 'no-results');
          for (const f of noResults.failures) failures.push({ route: route.name, path: route.path, viewport: viewport.name, theme: 'day', state: 'no-results', ...f });
          const stateRecord = { name: 'no-results', textCount: noResults.textCount, reliableTextCount: noResults.reliableTextCount, failures: noResults.failures, screenshot: null };
          if (process.env.SCREENSHOTS === '1' && ['390', '1440'].includes(viewport.name)) {
            await page.locator('.no-results').first().scrollIntoViewIfNeeded();
            stateRecord.screenshot = await specialScreenshot(page, `districts-no-results-${viewport.name}-day`);
          }
          states.push(stateRecord);
        }
        await toggle.click({ timeout: 5000 });
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'night', null, { timeout: 5000 });
        await settleThemeStyles(page);
        const finalNight = await page.evaluate(() => document.documentElement.dataset.theme || null);
        if (finalNight !== 'night') failures.push({ issue: 'night-theme-restore-failed', route: route.name, path: route.path, viewport: viewport.name });
        results.push({ route: route.name, path: route.path, viewport, night, day, keyboardTab: { night: nightTab, day: dayTab }, states, screenshots: { night: nightShot, day: dayShot, disabledPrimaryButton: disabledPrimaryScreenshot } });
      } catch (error) {
        failures.push({ issue: 'browser-error', route: route.name, path: route.path, viewport: viewport.name, message: String(error.message || error).slice(0, 300) });
      } finally { await context.close().catch(() => {}); }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); });
  }
  const report = {
    generatedAt: new Date().toISOString(), baseUrl: BASE_URL, routeSource: 'Expanded to the 10-route matrix: the seven existing pages plus Background Remover, QR Generator, and Text Detector flagged by independent QA.',
    routes: ROUTES, viewports: VIEWPORTS,
    thresholds: { wcagNormalText: 4.5, wcagLargeOrBoldText: 3, focusIndicator: 3, disabledUsabilityOpacityMinimum: .9, disabledUsabilityFilter: 'none', disabledUsabilityIsNotAWcagContrastClaim: true },
    keyboardEvidence: 'Actual sequential page.keyboard.press("Tab") traversal in Night and Day at 320px and 1440px for each route; no programmatic element.focus() calls are used.',
    snapshots: results.length, failures, results
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
  const day = results.map(r => r.day).filter(Boolean), stateChecks = results.flatMap(r => r.states || []);
  const text = day.reduce((n, r) => n + r.textCount, 0) + stateChecks.reduce((n, r) => n + r.textCount, 0);
  const reliable = day.reduce((n, r) => n + r.reliableTextCount, 0) + stateChecks.reduce((n, r) => n + r.reliableTextCount, 0);
  const uncertain = day.reduce((n, r) => n + r.indeterminateCount, 0);
  const tabAudits = results.flatMap(r => [r.keyboardTab?.night, r.keyboardTab?.day].filter(Boolean));
  const tabStops = tabAudits.reduce((n, a) => n + a.visitedCount, 0);
  const disabledStates = day.reduce((n, r) => n + r.disabledCount, 0);
  console.log(`\nExpanded Day contrast regression: ${failures.length ? 'FAIL' : 'PASS'}`);
  console.log(`  snapshots: ${results.length}/${ROUTES.length * VIEWPORTS.length} route-width pairs; routes=${ROUTES.length}; widths=${VIEWPORTS.map(v => v.width).join(',')}`);
  console.log(`  Day text/placeholder checks: ${text} total; ${reliable} determinate; ${uncertain} indeterminate composites`);
  console.log(`  actual keyboard Tab audits: ${tabAudits.length}; stops visited: ${tabStops}; Day visible disabled controls: ${disabledStates}`);
  console.log(`  report: ${REPORT}`);
  if (process.env.SCREENSHOTS === '1') console.log(`  screenshots: ${SCREENSHOT_ROOT}`);
  for (const f of failures.slice(0, 80)) console.log(`  FAIL ${f.issue} ${f.route || ''} @ ${f.viewport || ''} ${f.element || ''} ${f.ratio != null ? `ratio=${f.ratio.toFixed(2)}` : ''} ${f.text || f.message || ''}`);
  if (failures.length) process.exitCode = 1;
}

if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { ROUTES, VIEWPORTS };
