(() => {
  'use strict';
  const api = window.AHToolkit;
  const host = document.getElementById('tool-content');
  const slug = document.body.dataset.slug || '';
  const configNode = document.getElementById('new-tool-config');
  const maxFieldChars = 25000;
  const maxTotalChars = 60000;
  const maxOutputChars = 300000;
  const validTypes = new Set(['text', 'textarea', 'number', 'date', 'select', 'checkbox']);
  const esc = value => api.escape(String(value ?? ''));

  if (!api || !host || !configNode) {
    if (host) host.textContent = 'This browser-local tool could not be loaded. Return to the Tools Hub and try again.';
    return;
  }

  let config;
  try { config = JSON.parse(configNode.textContent); }
  catch (_) {
    host.textContent = 'This tool configuration is invalid. Return to the Tools Hub and try another utility.';
    return;
  }
  const handler = (window.AHNewToolHandlers || {})[slug];
  if (!config || config.slug !== slug || !Array.isArray(config.fields) || !config.fields.length || typeof handler !== 'function') {
    host.textContent = 'This browser-local tool is not configured correctly. Return to the Tools Hub and try another utility.';
    return;
  }

  const fields = config.fields.slice(0, 8);
  const controls = new Map();
  const fieldKey = field => field?.id || '';
  const clampRows = value => Math.max(3, Math.min(12, Number(value) || 5));
  const fieldMarkup = fields.map(field => {
    const key = fieldKey(field);
    if (!field || !/^[a-zA-Z][\w-]{0,40}$/.test(key) || !validTypes.has(field.type)) return '';
    const id = `new-tool-${slug}-${key}`;
    const helpId = `${id}-help`;
    const required = field.required ? ' required' : '';
    const describedBy = field.help ? ` aria-describedby="${esc(helpId)}"` : '';
    const labelText = field.label || key;
    const label = `<label class="field-label" for="${esc(id)}">${esc(labelText)}${field.required ? ' <span aria-hidden="true">*</span>' : ''}</label>`;
    let control;
    if (field.type === 'textarea') {
      control = `<textarea id="${esc(id)}" name="${esc(key)}" maxlength="${maxFieldChars}" rows="${clampRows(field.rows)}" placeholder="${esc(field.placeholder || '')}"${required}${describedBy} spellcheck="true">${esc(field.default || '')}</textarea>`;
    } else if (field.type === 'select') {
      const options = (Array.isArray(field.options) ? field.options : []).slice(0, 40).map(option => {
        const value = typeof option === 'object' ? option.value : option;
        const text = typeof option === 'object' ? option.label : option;
        const selected = String(value) === String(field.default) ? ' selected' : '';
        return `<option value="${esc(value)}"${selected}>${esc(text)}</option>`;
      }).join('');
      control = `<select id="${esc(id)}" name="${esc(key)}"${required}${describedBy}>${options}</select>`;
    } else if (field.type === 'checkbox') {
      control = `<input id="${esc(id)}" name="${esc(key)}" type="checkbox"${field.default === true ? ' checked' : ''}${describedBy}>`;
    } else {
      const type = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';
      const value = field.default !== undefined ? field.default : '';
      control = `<input id="${esc(id)}" name="${esc(key)}" type="${type}" maxlength="${maxFieldChars}" value="${esc(value)}" placeholder="${esc(field.placeholder || '')}"${field.min !== undefined ? ` min="${esc(field.min)}"` : ''}${field.max !== undefined ? ` max="${esc(field.max)}"` : ''}${field.step !== undefined ? ` step="${esc(field.step)}"` : ''}${required}${describedBy} autocomplete="off">`;
    }
    const help = field.help ? `<small class="field-help" id="${esc(helpId)}">${esc(field.help)}</small>` : '';
    const wrap = field.type === 'checkbox' ? 'planner-checkbox field' : `field${field.type === 'textarea' ? ' wide' : ''}`;
    return field.type === 'checkbox'
      ? `<label class="${wrap}" for="${esc(id)}">${control}<span><strong>${esc(labelText)}</strong>${help}</span></label>`
      : `<div class="${wrap}">${label}${control}${help}</div>`;
  }).join('');
  if (!fieldMarkup) {
    host.textContent = 'This tool has no supported input fields. Return to the Tools Hub and try another utility.';
    return;
  }

  api.mount(`<section class="planner-tool" aria-label="${esc(config.title)} workspace">
    <p class="planner-lede">${esc(config.description)}</p>
    <div class="planner-local-note"><strong>LOCAL WORKSPACE</strong><span>Inputs stay in this browser. No lookup or upload is performed. Run the tool, then review its result before relying on it.</span></div>
    <div class="field-grid planner-fields">${fieldMarkup}</div>
    <div class="actions planner-actions"><button id="new-tool-run" class="button button-main" type="button">Run locally ↗</button><button id="new-tool-copy" class="button" type="button" disabled>Copy result</button><button id="new-tool-download" class="button" type="button" disabled>Download result</button><button id="new-tool-clear" class="button" type="button">Clear saved draft</button></div>
    <div id="new-tool-status" class="status" role="status" aria-live="polite" hidden></div>
    <section id="new-tool-result" class="result planner-result" aria-labelledby="new-tool-result-title" hidden><div class="section-head"><h2 id="new-tool-result-title">LOCAL RESULT</h2><span class="tool-badge">REVIEW BEFORE USE</span></div><pre id="new-tool-output" class="output-text" tabindex="0"></pre></section>
    <p class="planner-limitations">${esc(config.limitations || 'This browser-local aid uses only information you enter. Check important details against authoritative sources.')}</p>
  </section>`);

  const status = document.getElementById('new-tool-status');
  const result = document.getElementById('new-tool-result');
  const output = document.getElementById('new-tool-output');
  const runButton = document.getElementById('new-tool-run');
  const copyButton = document.getElementById('new-tool-copy');
  const downloadButton = document.getElementById('new-tool-download');
  const clearButton = document.getElementById('new-tool-clear');
  let currentText = '';
  const storageKey = `afterhours:new-tool-draft:${slug}`;
  let filename = `${slug}-result.txt`;

  for (const field of fields) {
    const key = fieldKey(field);
    if (!/^[a-zA-Z][\w-]{0,40}$/.test(key)) continue;
    const control = document.getElementById(`new-tool-${slug}-${key}`);
    if (control) controls.set(key, control);
  }

  function readValues(validate) {
    const values = {};
    let total = 0;
    for (const [key, control] of controls) {
      const value = control.type === 'checkbox' ? control.checked : control.value;
      if (typeof value === 'string') {
        if (value.length > maxFieldChars) throw new Error(`Each text field is limited to ${maxFieldChars.toLocaleString()} characters.`);
        total += value.length;
      }
      if (validate && control.required && String(value).trim() === '') throw new Error(`Please complete “${control.labels?.[0]?.textContent?.replace('*', '').trim() || key}”.`);
      if (validate && control.type === 'number' && value !== '') {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error(`Enter a valid number for “${key}”.`);
        if (control.min !== '' && number < Number(control.min)) throw new Error(`“${key}” must be at least ${control.min}.`);
        if (control.max !== '' && number > Number(control.max)) throw new Error(`“${key}” must be no more than ${control.max}.`);
      }
      values[key] = value;
    }
    if (total > maxTotalChars) throw new Error(`Combined text input is limited to ${maxTotalChars.toLocaleString()} characters.`);
    return values;
  }

  function saveDraft() {
    try { localStorage.setItem(storageKey, JSON.stringify({version: 1, values: readValues(false)})); }
    catch (_) { /* Storage may be disabled; inputs remain usable. */ }
  }
  try {
    const draft = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (draft?.version === 1 && draft.values && typeof draft.values === 'object') {
      for (const [key, control] of controls) {
        if (!Object.prototype.hasOwnProperty.call(draft.values, key)) continue;
        if (control.type === 'checkbox') control.checked = Boolean(draft.values[key]);
        else control.value = String(draft.values[key]).slice(0, maxFieldChars);
      }
    }
  } catch (_) { api.status(status, 'Browser storage is unavailable; this draft will not be saved automatically.', 'warn'); }
  for (const control of controls.values()) {
    control.addEventListener('input', saveDraft);
    control.addEventListener('change', saveDraft);
  }

  runButton.addEventListener('click', async () => {
    if (!api.credits.canRun(status)) return;
    let values;
    try { values = readValues(true); }
    catch (error) { api.status(status, error.message, 'error'); return; }
    runButton.disabled = true;
    try {
      const raw = await handler(values);
      const normalized = typeof raw === 'string' ? {summary: raw} : raw;
      const summary = normalized?.summary ?? normalized?.text ?? normalized?.output ?? normalized?.result;
      if (typeof summary !== 'string' || !summary.trim()) throw new Error('No readable result was produced. Check the inputs and try again.');
      const parts = [summary, typeof normalized.details === 'string' ? normalized.details : ''];
      if (Array.isArray(normalized.warnings)) parts.push(...normalized.warnings.map(String));
      currentText = parts.filter(Boolean).join('\n\n');
      if (currentText.length > maxOutputChars) throw new Error(`The result exceeds the ${maxOutputChars.toLocaleString()} character display limit.`);
      filename = String(normalized.filename || `${slug}-result.txt`).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100);
      output.textContent = currentText;
      result.hidden = false;
      copyButton.disabled = false;
      downloadButton.disabled = false;
      const charged = api.credits.charge();
      api.status(status, charged ? 'Completed locally. One shared daily credit was used.' : 'Completed locally; the result could not be charged because the counter changed.', charged ? 'success' : 'warn');
    } catch (error) { api.status(status, error?.message || 'This tool could not process these inputs.', 'error'); }
    finally { runButton.disabled = false; }
  });
  copyButton.addEventListener('click', async () => { api.status(status, await api.copy(currentText) ? 'Result copied.' : 'Copy failed; select the result text manually.', 'success'); });
  downloadButton.addEventListener('click', () => api.downloadText(currentText, filename));
  clearButton.addEventListener('click', () => {
    for (const control of controls.values()) {
      if (control.type === 'checkbox') control.checked = false;
      else if (control.tagName === 'SELECT') control.selectedIndex = 0;
      else control.value = '';
    }
    try { localStorage.removeItem(storageKey); } catch (_) {}
    result.hidden = true;
    currentText = '';
    copyButton.disabled = true;
    downloadButton.disabled = true;
    api.status(status, 'Saved draft cleared from this browser.', 'success');
  });
})();
