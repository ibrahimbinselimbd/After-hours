(() => {
  'use strict';
  const api = window.AHToolkit;
  const host = document.getElementById('tool-content');
  const slug = document.body.dataset.slug || '';
  const tools = window.AHPlannerTools || [];
  const tool = tools.find(item => item.slug === slug);
  const handler = (window.AHPlannerHandlers || {})[slug];
  if (!api || !host || !tool || typeof handler !== 'function') {
    if (host) host.textContent = 'This browser-local planner could not be loaded. Return to the Tools Hub and try again.';
    return;
  }
  const esc = value => api.escape(String(value ?? ''));
  const fieldKey = field => field?.id || field?.name || '';
  const maxFieldChars = 50_000;
  const maxTotalChars = 200_000;
  const maxOutputChars = 1_000_000;
  const storageKey = `afterhours:planner-draft:${slug}`;
  const controls = new Map();
  const fields = Array.isArray(tool.fields) ? tool.fields.slice(0, 20) : [];
  const validTypes = new Set(['text', 'textarea', 'number', 'date', 'select', 'checkbox']);
  if (!fields.length) {
    host.textContent = 'This planner has no input fields configured.';
    return;
  }
  const helpText = value => esc(value).replace(/\n/g, '<br>');
  const fieldMarkup = fields.map(field => {
    const key = fieldKey(field);
    if (!field || !/^[a-zA-Z][\w-]{0,40}$/.test(key) || !validTypes.has(field.type)) return '';
    const id = `planner-${slug}-${key}`;
    const helpId = `${id}-help`;
    const required = field.required ? ' required' : '';
    const description = field.help ? ` aria-describedby="${helpId}"` : '';
    const labelText = field.label || key;
    const label = `<label class="field-label" for="${esc(id)}">${esc(labelText)}${field.required ? ' <span aria-hidden="true">*</span>' : ''}</label>`;
    let control;
    if (field.type === 'textarea') {
      control = `<textarea id="${esc(id)}" name="${esc(key)}" maxlength="${maxFieldChars}" rows="${field.rows || 5}" placeholder="${esc(field.placeholder || '')}"${required}${description} spellcheck="true">${esc(field.default || '')}</textarea>`;
    } else if (field.type === 'select') {
      const options = (Array.isArray(field.options) ? field.options : []).slice(0, 60).map(option => {
        const value = typeof option === 'object' ? option.value : option;
        const text = typeof option === 'object' ? option.label : option;
        const selected = String(value) === String(field.default) ? ' selected' : '';
        return `<option value="${esc(value)}"${selected}>${esc(text)}</option>`;
      }).join('');
      control = `<select id="${esc(id)}" name="${esc(key)}"${required}${description}>${options}</select>`;
    } else if (field.type === 'checkbox') {
      control = `<input id="${esc(id)}" name="${esc(key)}" type="checkbox"${field.default === true ? ' checked' : ''}${description}>`;
    } else {
      const type = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';
      const defaultValue = field.default !== undefined ? field.default : '';
      control = `<input id="${esc(id)}" name="${esc(key)}" type="${type}" maxlength="${maxFieldChars}" value="${esc(defaultValue)}" placeholder="${esc(field.placeholder || '')}"${field.min !== undefined ? ` min="${esc(field.min)}"` : ''}${field.max !== undefined ? ` max="${esc(field.max)}"` : ''}${field.step !== undefined ? ` step="${esc(field.step)}"` : ''}${required}${description} autocomplete="off">`;
    }
    const help = field.help ? `<small class="field-help" id="${esc(helpId)}">${helpText(field.help)}</small>` : '';
    const wrapClass = field.type === 'checkbox' ? 'planner-checkbox field' : `field${field.type === 'textarea' ? ' wide' : ''}`;
    return field.type === 'checkbox'
      ? `<label class="${wrapClass}" for="${esc(id)}">${control}<span><strong>${esc(labelText)}</strong>${help}</span></label>`
      : `<div class="${wrapClass}">${label}${control}${help}</div>`;
  }).join('');
  api.mount(`<section class="planner-tool" aria-label="${esc(tool.title)} workspace">
    <p class="planner-lede">${esc(tool.description || '')}</p>
    <div class="planner-local-note"><strong>LOCAL WORKSPACE</strong><span>Your entries are saved only in this browser. Nothing is sent to a server. Use the buttons below to run, copy or download your result.</span></div>
    <div class="field-grid planner-fields">${fieldMarkup}</div>
    <div class="actions planner-actions"><button id="planner-run" class="button button-main" type="button">Run locally ↗</button><button id="planner-copy" class="button" type="button" disabled>Copy result</button><button id="planner-download" class="button" type="button" disabled>Download result</button><button id="planner-clear" class="button" type="button">Clear saved draft</button></div>
    <div id="planner-status" class="status" role="status" aria-live="polite" hidden></div>
    <section id="planner-result" class="result planner-result" aria-labelledby="planner-result-title" hidden><div class="section-head"><h2 id="planner-result-title">LOCAL RESULT</h2><span class="tool-badge">REVIEW BEFORE USE</span></div><pre id="planner-output" class="output-text" tabindex="0"></pre></section>
    <p class="planner-limitations">${esc(tool.limitations || 'This is a local planning aid. Check important details against your own records and authoritative sources.')}</p>
  </section>`);
  const status = document.getElementById('planner-status');
  const result = document.getElementById('planner-result');
  const output = document.getElementById('planner-output');
  const runButton = document.getElementById('planner-run');
  const copyButton = document.getElementById('planner-copy');
  const downloadButton = document.getElementById('planner-download');
  const clearButton = document.getElementById('planner-clear');
  let currentText = '';
  let currentFilename = `${slug}-result.txt`;
  for (const field of fields) {
    const key = fieldKey(field);
    if (!/^[a-zA-Z][\w-]{0,40}$/.test(key)) continue;
    const control = document.getElementById(`planner-${slug}-${key}`);
    if (control) controls.set(key, control);
  }
  function readValues(validate) {
    const values = {};
    let total = 0;
    for (const [key, control] of controls) {
      const value = control.type === 'checkbox' ? control.checked : control.value;
      if (typeof value === 'string') {
        if (value.length > maxFieldChars) throw new Error(`Each input is limited to ${maxFieldChars.toLocaleString()} characters.`);
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
    catch (_) { /* Browser storage can be disabled; typing still works. */ }
  }
  try {
    const draft = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (draft?.version === 1 && draft.values && typeof draft.values === 'object') {
      for (const [key, control] of controls) {
        if (!Object.prototype.hasOwnProperty.call(draft.values, key)) continue;
        if (control.type === 'checkbox') control.checked = Boolean(draft.values[key]);
        else control.value = String(draft.values[key]).slice(0, maxFieldChars);
      }
      api.status(status, 'Restored this tool’s saved draft from this browser.', '');
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
      if (typeof summary !== 'string') throw new Error('This planner did not return readable plain text.');
      const parts = [summary, typeof normalized.details === 'string' ? normalized.details : ''];
      if (Array.isArray(normalized.warnings)) parts.push(...normalized.warnings.map(String));
      currentText = parts.filter(Boolean).join('\n\n');
      if (!currentText.trim()) throw new Error('No result was produced. Add more information and try again.');
      if (currentText.length > maxOutputChars) throw new Error(`Result is larger than the ${maxOutputChars.toLocaleString()} character display limit.`);
      currentFilename = String(normalized.filename || `${slug}-result.txt`).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100);
      output.textContent = currentText;
      result.hidden = false;
      copyButton.disabled = false;
      downloadButton.disabled = false;
      const charged = api.credits.charge();
      api.status(status, charged ? 'Completed locally. One shared daily credit was used.' : 'Completed locally; the shared credit counter changed before the result could be charged.', charged ? 'success' : 'warn');
    } catch (error) { api.status(status, error?.message || 'The local planner could not process these inputs.', 'error'); }
    finally { runButton.disabled = false; }
  });
  copyButton.addEventListener('click', async () => { api.status(status, await api.copy(currentText) ? 'Result copied.' : 'Copy failed; select the result text manually.', 'success'); });
  downloadButton.addEventListener('click', () => api.downloadText(currentText, currentFilename));
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
