(() => {
  'use strict';
  AHToolkit.mount(`<div class="section-head"><div><div class="section-kicker">DATA SHAPER / 01</div><h2>Make JSON readable.</h2><p>Parsing is local. Invalid input is reported and never consumes a credit.</p></div></div><div class="field-grid"><label class="field"><span>JSON input</span><textarea id="js-input" spellcheck="false" placeholder='{"hello":"world","items":[1,2,3]}'></textarea></label><div><label class="field"><span>Indentation</span><select id="js-indent"><option value="2">2 spaces</option><option value="4">4 spaces</option><option value="tab">Tab</option></select></label><p class="hint">Choose Format for readable JSON or Minify for compact JSON.</p></div></div><div class="actions"><button class="button button-main" id="js-format" type="button">Format JSON ↗</button><button class="button" id="js-minify" type="button">Minify</button><button class="button" id="js-copy" type="button" disabled>Copy</button><button class="button" id="js-download" type="button" disabled>Download</button></div><div id="js-status" class="status" role="status" aria-live="polite" hidden></div><section class="result" id="js-result" hidden><pre id="js-output"></pre></section>`);

  const $ = id => document.getElementById(id);
  let output = '';

  function clearResult() {
    output = '';
    $('js-output').textContent = '';
    $('js-result').hidden = true;
    $('js-copy').disabled = true;
    $('js-download').disabled = true;
  }

  function locationHint(text, index) {
    const before = text.slice(0, index);
    const line = before.split(/\n/).length;
    const col = index - before.lastIndexOf('\n');
    return `Syntax error near line ${line}, column ${col}. ${text.split(/\n/)[line - 1]?.trim() || ''}`;
  }

  function run(compact) {
    const text = $('js-input').value;
    if (!text.trim()) {
      clearResult();
      return AHToolkit.status($('js-status'), 'Paste or type JSON first.', 'error');
    }

    let value;
    try {
      value = JSON.parse(text);
    } catch (error) {
      clearResult();
      const match = String(error.message).match(/position (\d+)/i);
      const message = match
        ? `${error.message} ${locationHint(text, Number(match[1]))}`
        : error.message;
      return AHToolkit.status($('js-status'), message, 'error');
    }

    if (!AHToolkit.credits.canRun($('js-status'))) return;
    output = JSON.stringify(value, null, compact ? 0 : ($('js-indent').value === 'tab' ? '\t' : Number($('js-indent').value)));
    $('js-output').textContent = output;
    $('js-result').hidden = false;
    $('js-copy').disabled = false;
    $('js-download').disabled = false;
    AHToolkit.credits.charge();
    AHToolkit.status($('js-status'), `${compact ? 'Minified' : 'Formatted'} valid JSON (${output.length.toLocaleString()} characters).`, 'success');
  }

  $('js-input').addEventListener('input', () => {
    if (!output) return;
    clearResult();
    const status = $('js-status');
    status.textContent = 'Input changed. Run again to create a current result.';
    status.className = 'status';
    status.hidden = false;
  });
  $('js-format').addEventListener('click', () => run(false));
  $('js-minify').addEventListener('click', () => run(true));
  $('js-copy').addEventListener('click', async () => AHToolkit.status($('js-status'), await AHToolkit.copy(output) ? 'Copied JSON.' : 'Copy failed.', 'success'));
  $('js-download').addEventListener('click', () => AHToolkit.downloadText(output, 'formatted.json', 'application/json;charset=utf-8'));
})();
