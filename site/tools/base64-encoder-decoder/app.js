(() => {
  'use strict';
  const api = window.AHToolkit;
  const $ = selector => document.querySelector(selector);
  api.mount(`<div class="field"><label for="input">Text or Base64</label><textarea id="input" spellcheck="false">Afterhours — private by design</textarea></div><div class="actions"><select id="mode" aria-label="Base64 operation"><option value="enc">Encode UTF-8 → Base64</option><option value="dec">Decode Base64 → UTF-8</option></select><button id="go" class="button button-main" type="button">Run</button><button id="copy" class="button" type="button" disabled>Copy output</button></div><div id="status" class="status" role="status" hidden></div><div id="out" class="result" hidden><pre id="result" class="output-text"></pre></div>`);
  const input = $('#input');
  const mode = $('#mode');
  const runButton = $('#go');
  const copyButton = $('#copy');
  const outputBox = $('#out');
  const output = $('#result');
  const status = $('#status');
  let currentText = '';

  function invalidateResult() {
    const hadResult = Boolean(currentText);
    currentText = '';
    output.textContent = '';
    outputBox.hidden = true;
    copyButton.disabled = true;
    if (hadResult) api.status(status, 'Inputs changed. Run again to refresh the result.', 'warn');
  }
  for (const control of [input, mode]) {
    control.addEventListener('input', invalidateResult);
    control.addEventListener('change', invalidateResult);
  }
  runButton.onclick = () => {
    invalidateResult();
    if (!api.credits.canRun(status)) return;
    try {
      let result;
      if (mode.value === 'enc') {
        const bytes = new TextEncoder().encode(input.value);
        result = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
      } else {
        const binary = atob(input.value.trim());
        result = new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
      }
      currentText = result;
      output.textContent = currentText;
      outputBox.hidden = false;
      copyButton.disabled = false;
      api.credits.charge();
      api.status(status, 'Completed UTF-8 Base64 conversion locally.', 'success');
    } catch (error) {
      api.status(status, `Invalid input: ${error.message}`, 'error');
    }
  };
  copyButton.onclick = async () => {
    if (!currentText || copyButton.disabled) return;
    if (await api.copy(currentText)) api.status(status, 'Copied output.', 'success');
  };
})();
