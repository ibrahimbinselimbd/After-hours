(() => {
  'use strict';
  const api = window.AHToolkit;
  const markup = `<div class="section-head"><div><div class="section-kicker">EXACT ARITHMETIC</div><h2>Fraction operations</h2><p>Use proper/improper fractions such as 3/4. Results are reduced automatically.</p></div><span class="tool-badge">REDUCED OUTPUT</span></div><div class="calc-grid"><label>First fraction <input id="a" value="1/2" inputmode="text"></label><label>Operation <select id="op"><option>+</option><option>−</option><option>×</option><option>÷</option></select></label><label>Second fraction <input id="b" value="1/3" inputmode="text"></label></div><button class="button button-main" id="run" type="button">Calculate fraction</button><div id="out" class="result" aria-live="polite" hidden></div><div id="status" class="status" role="status" hidden></div>`;
  const root = api.mount(markup);
  const first = root.querySelector('#a'), second = root.querySelector('#b'), operation = root.querySelector('#op');
  const output = root.querySelector('#out'), status = root.querySelector('#status'), runButton = root.querySelector('#run');
  const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; };
  const parse = value => {
    const parts = value.trim().split('/');
    if (parts.length !== 2 || !/^[+-]?\d+$/.test(parts[0].trim()) || !/^[+-]?\d+$/.test(parts[1].trim())) return null;
    const numerator = BigInt(parts[0]), denominator = BigInt(parts[1]);
    return denominator !== 0n ? [numerator, denominator] : null;
  };
  function clearResult() {
    const hadResult = Boolean(output.textContent.trim());
    output.textContent = '';
    output.hidden = true;
    if (hadResult) api.status(status, 'Inputs changed. Calculate again to refresh the result.', 'warn');
  }
  for (const control of [first, second, operation]) {
    control.addEventListener('input', clearResult);
    control.addEventListener('change', clearResult);
  }
  runButton.onclick = () => {
    clearResult();
    if (!api.credits.canRun(status)) return;
    const a = parse(first.value), b = parse(second.value), op = operation.value;
    if (!a || !b) return api.status(status, 'Enter fractions such as 3/4.', 'warn');
    let numerator, denominator;
    if (op === '+') { numerator = a[0] * b[1] + b[0] * a[1]; denominator = a[1] * b[1]; }
    if (op === '−') { numerator = a[0] * b[1] - b[0] * a[1]; denominator = a[1] * b[1]; }
    if (op === '×') { numerator = a[0] * b[0]; denominator = a[1] * b[1]; }
    if (op === '÷') {
      if (b[0] === 0n) return api.status(status, 'Cannot divide by zero.', 'warn');
      numerator = a[0] * b[1]; denominator = a[1] * b[0];
    }
    if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
    const divisor = gcd(numerator, denominator);
    numerator /= divisor;
    denominator /= divisor;
    output.innerHTML = `<p><b>${numerator}/${denominator}</b>${denominator === 1n ? ` = ${numerator}` : ''}</p><small>Formula: cross-multiply for the selected operation, then divide by the greatest common divisor (${divisor}).</small>`;
    output.hidden = false;
    api.credits.charge();
    api.status(status, 'Fraction calculated successfully.', 'success');
  };
})();
