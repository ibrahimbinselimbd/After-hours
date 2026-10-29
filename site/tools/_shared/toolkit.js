(() => {
  'use strict';
  const DAILY_LIMIT = 10;
  const CREDIT_KEY = 'afterhours:daily-credits';
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const attrs = document.body.dataset;
  const category = attrs.category || 'Everyday Utilities';
  const toolTitle = attrs.title || 'Browser Tool';
  const toolIndex = attrs.index || '001';
  const toolDescription = attrs.description || 'A free browser-local utility.';
  const route = location.pathname.replace(/\/$/, '') || '/tools/';
  const root = document.getElementById('tool-shell');
  if (root) {
    root.innerHTML = `<header class="tool-header"><a class="brand" href="/" aria-label="AFTERHOURS home">AFTER<span>HOURS</span><sup>®</sup></a><nav aria-label="Breadcrumb"><a href="/">Discover</a><span>/</span><a href="/tools/">Tools Hub</a><span>/</span><b>${esc(toolTitle.toUpperCase())}</b></nav><a class="back-link" href="/tools/">← All tools</a></header><main class="tool-main"><div class="breadcrumb"><a href="/tools/">THE UTILITY DISTRICT</a><span>/</span><b>${esc(category.toUpperCase())}</b><span>/</span><b>AH UTILITY — ${esc(toolIndex)}</b></div><section class="tool-hero"><div class="eyebrow"><i></i> ${esc(toolTitle.toUpperCase())} <span>/ ${esc(toolIndex)}</span></div><h1>${esc(toolTitle)}</h1><p>${esc(toolDescription)}</p><div class="hero-tags"><span>BROWSER-LOCAL</span><span>NO FILE UPLOADS</span><span>FREE TO USE</span></div><span class="credit-pill" id="credit-pill" aria-live="polite">10 LOCAL CREDITS LEFT</span></section><section class="workspace"><div id="tool-content"></div><p class="privacy-note"><strong>PRIVATE BY DESIGN</strong> — Your inputs and files are processed in this browser and are not uploaded for processing.</p><p class="credit-note">These tools use the existing 10 daily browser-local credits shared with Image Size Optimizer, QR Code Generator and Passport & Visa Photo Studio; each successful action uses one credit. The counter resets at local midnight on this browser and is not account-wide or server-enforced. HEIC keeps its existing separate counter. All tools are free.</p></section><section class="how"><div class="section-kicker">BUILT FOR THE WORKFLOW</div><h2>Less friction. <span>More possibility.</span></h2><p>Use the tools hub to find more browser-local utilities. Always review results before relying on them for legal, security, accessibility, or production work.</p></section></main><footer class="tool-footer"><a href="/tools/">← Back to the Utility District</a><span>AFTERHOURS / DESIGNED FOR THE CURIOUS.</span><span>LOCAL WORKSPACE · FREE</span></footer>`;
  }
  let memoryCredits = {day: today(), remaining: DAILY_LIMIT};
  let storageAvailable = true;
  function readState() {
    let data = memoryCredits;
    if (storageAvailable) {
      try { data = JSON.parse(localStorage.getItem(CREDIT_KEY) || 'null'); }
      catch (_) { storageAvailable = false; }
    }
    if (data && data.day === today() && Number.isInteger(data.remaining)) {
      return {day: today(), remaining: Math.max(0, Math.min(DAILY_LIMIT, data.remaining))};
    }
    return {day: today(), remaining: DAILY_LIMIT};
  }
  function persist(state) {
    memoryCredits = state;
    try { localStorage.setItem(CREDIT_KEY, JSON.stringify(state)); }
    catch (_) { storageAvailable = false; }
  }
  const creditLabel = document.getElementById('credit-pill');
  function drawCredits() {
    const state = readState();
    memoryCredits = state;
    if (creditLabel) {
      creditLabel.textContent = `${state.remaining} / ${DAILY_LIMIT} DAILY LOCAL CREDITS LEFT`;
      creditLabel.classList.toggle('is-low', state.remaining <= 2);
      creditLabel.title = 'Shared with Image Size Optimizer, QR Code Generator and Passport & Visa Photo Studio in this browser; resets at local midnight. Not account-wide.';
    }
    return state;
  }
  drawCredits();
  window.addEventListener('storage', e => { if (e.key === CREDIT_KEY || e.key === null) drawCredits(); });
  const api = {
    title: toolTitle,
    category,
    route,
    escape: esc,
    mount(markup) { const target = document.getElementById('tool-content'); if (target) target.innerHTML = markup; return target; },
    credits: {
      remaining() { return drawCredits().remaining; },
      canRun(statusTarget) {
        const ok = drawCredits().remaining > 0;
        if (!ok && statusTarget) api.status(statusTarget, 'The existing 10 local daily credits shared with Image Size Optimizer, QR Code Generator, Passport & Visa Photo Studio and the new browser-local tools are used. They reset at local midnight on this browser.', 'warn');
        return ok;
      },
      charge() {
        const latest = readState();
        if (latest.remaining <= 0) { drawCredits(); return false; }
        persist({day: today(), remaining: latest.remaining - 1});
        drawCredits();
        return true;
      }
    },
    status(target, message, kind='') {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return;
      el.textContent = message;
      el.className = `status${kind ? ` ${kind}` : ''}`;
      el.hidden = !message;
    },
    download(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    },
    downloadText(text, name, type='text/plain;charset=utf-8') { api.download(new Blob([text], {type}), name); },
    async copy(text) {
      try { await navigator.clipboard.writeText(String(text)); return true; }
      catch (_) {
        const box = document.createElement('textarea'); box.value = String(text); box.style.position='fixed'; box.style.opacity='0'; document.body.appendChild(box); box.select();
        let ok=false; try { ok=document.execCommand('copy'); } catch (_) {} box.remove(); return ok;
      }
    },
    async readText(file, maxBytes=20*1024*1024) {
      if (!file) throw new Error('Choose a file first.');
      if (file.size > maxBytes) throw new Error(`File is too large. The limit is ${Math.round(maxBytes/1024/1024)} MB.`);
      return file.text();
    },
    async readBytes(file, maxBytes=100*1024*1024) {
      if (!file) throw new Error('Choose a file first.');
      if (file.size > maxBytes) throw new Error(`File is too large. The limit is ${Math.round(maxBytes/1024/1024)} MB.`);
      return file.arrayBuffer();
    },
    parseCSV(text, delimiter='auto') {
      const source = String(text).replace(/^\uFEFF/, '');
      if (delimiter === 'auto') {
        const first = source.split(/\r?\n/, 1)[0] || '';
        const candidates = [',',';','\t','|'];
        delimiter = candidates.map(d => [d, (first.match(new RegExp(d === '\t' ? '\\t' : `\\${d}`, 'g')) || []).length])
          .sort((a,b) => b[1]-a[1])[0][1] ? candidates.map(d => [d, (first.split(d).length-1)]).sort((a,b)=>b[1]-a[1])[0][0] : ',';
      }
      const rows=[]; let row=[], field='', quoted=false;
      for (let i=0;i<source.length;i++) {
        const ch=source[i];
        if (quoted) {
          if (ch==='"' && source[i+1]==='"') { field+='"'; i++; }
          else if (ch==='"') quoted=false;
          else field+=ch;
        } else if (ch==='"' && field==='') quoted=true;
        else if (ch===delimiter) { row.push(field); field=''; }
        else if (ch==='\n' || ch==='\r') {
          if (ch==='\r' && source[i+1]==='\n') i++;
          row.push(field); field='';
          if (row.some(cell => cell !== '') || rows.length) rows.push(row);
          row=[];
        } else field+=ch;
      }
      if (quoted) throw new Error('The CSV has an unclosed quoted field. Check the input around the final row.');
      if (field!=='' || row.length) { row.push(field); rows.push(row); }
      return {rows, delimiter};
    },
    serializeCSV(rows, delimiter=',') {
      return rows.map(row => row.map(value => {
        const s=String(value ?? ''); return /["\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g,'""')}"` : s;
      }).join(delimiter)).join('\r\n');
    },
    parsePageList(text, max) {
      const selected=[];
      for (const part of String(text).split(',').map(x=>x.trim()).filter(Boolean)) {
        const m=part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
        if (!m) throw new Error(`Invalid page selection: “${part}”. Use a list such as 1,3-5.`);
        const a=Number(m[1]), b=Number(m[2] || m[1]);
        if (a<1 || b<a || b>max) throw new Error(`Page range ${part} is outside this PDF (1–${max}).`);
        for (let n=a;n<=b;n++) selected.push(n-1);
      }
      if (!selected.length) throw new Error('Choose at least one page.');
      return selected;
    }
  };
  window.AHToolkit = api;
})();
