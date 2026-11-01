(() => {
  'use strict';
  const MAX_INPUT_CHARS = 5_242_880;
  const MAX_OUTPUT_CHARS = 1_000_000;
  const allowedFieldTypes = new Set(['text', 'textarea']);

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function mount(engine, api, credits) {
    const host = document.getElementById('tool-content');
    if (!host || !engine || !Array.isArray(engine.fields) || !engine.run) {
      throw new Error('This tool is not available right now.');
    }
    host.replaceChildren();
    const heading = node('h2', '', 'WORKSPACE');
    const intro = node('p', 'hint', engine.description || 'Paste local input for browser-only processing.');
    const form = node('div', 'field-grid');
    const controls = new Map();

    for (const field of engine.fields.slice(0, 4)) {
      if (!field || !/^[a-zA-Z][\w-]{0,40}$/.test(field.id || '') || !allowedFieldTypes.has(field.type)) continue;
      const wrapper = node('label', 'field');
      wrapper.append(node('span', '', field.label || field.id));
      const control = field.type === 'textarea' ? node('textarea') : node('input');
      if (field.type === 'text') control.type = field.sensitive ? 'password' : 'text';
      control.id = `devtool-${field.id}`;
      control.name = field.id;
      control.maxLength = MAX_INPUT_CHARS;
      control.autocomplete = field.sensitive ? 'new-password' : 'off';
      control.spellcheck = false;
      if (field.placeholder) control.placeholder = field.placeholder;
      wrapper.append(control);
      if (field.help) wrapper.append(node('small', 'hint', field.help));
      form.append(wrapper);
      controls.set(field.id, control);
    }

    const actions = node('div', 'actions');
    const run = node('button', 'button button-main', 'Run locally ↗');
    run.type = 'button';
    const copy = node('button', 'button', 'Copy result');
    copy.type = 'button'; copy.disabled = true;
    const download = node('button', 'button', 'Download result');
    download.type = 'button'; download.disabled = true;
    actions.append(run, copy, download);

    const status = node('div', 'status');
    status.id = 'devtool-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.hidden = true;
    const result = node('section', 'result'); result.hidden = true;
    const output = node('pre', 'output-text'); output.setAttribute('aria-label', 'Tool result');
    result.append(output);
    const limits = node('p', 'hint', engine.limitations || 'Results are a local aid; review them against your source of truth.');
    host.append(heading, intro, form, actions, status, result, limits);

    let currentText = '';
    let currentFilename = 'developer-tool-result.txt';
    let currentMime = 'text/plain;charset=utf-8';
    const setStatus = (message, kind) => api.status(status, message, kind);

    run.addEventListener('click', async () => {
      if (!credits.canRun(status)) return;
      const values = {};
      for (const [id, control] of controls) {
        const value = control.value;
        if (value.length > MAX_INPUT_CHARS) {
          setStatus(`Input is too large. The browser-local limit is ${MAX_INPUT_CHARS.toLocaleString()} characters per field.`, 'error');
          return;
        }
        values[id] = value;
      }
      run.disabled = true;
      try {
        const raw = await engine.run(values);
        const normalized = typeof raw === 'string' ? {text: raw} : raw;
        if (!normalized || typeof normalized.text !== 'string') throw new Error('The local tool did not return a text result.');
        if (normalized.text.length > MAX_OUTPUT_CHARS) throw new Error(`Output is too large to display safely (limit ${MAX_OUTPUT_CHARS.toLocaleString()} characters).`);
        currentText = normalized.text;
        currentFilename = String(normalized.filename || `${engine.slug || 'developer-tool'}-result.txt`).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100);
        currentMime = String(normalized.mime || 'text/plain;charset=utf-8');
        output.textContent = currentText;
        result.hidden = false;
        copy.disabled = false;
        download.disabled = false;
        const charged = credits.charge();
        const warningText = Array.isArray(normalized.warnings) && normalized.warnings.length ? ` ${normalized.warnings.join(' ')}` : '';
        setStatus((charged ? 'Completed locally. One shared daily credit was used.' : 'Completed locally, but no credit was deducted because the shared counter changed.') + warningText, charged ? (warningText ? 'warn' : 'success') : 'warn');
      } catch (error) {
        setStatus(error?.message || 'The input could not be processed.', 'error');
      } finally {
        run.disabled = false;
      }
    });
    copy.addEventListener('click', async () => setStatus(await api.copy(currentText) ? 'Result copied.' : 'Copy failed; select the result text manually.', 'success'));
    download.addEventListener('click', () => api.download(new Blob([currentText], {type: currentMime}), currentFilename));
  }

  window.AHDeveloperRuntime = {mount};
})();
