(() => {
  'use strict';
  const api = window.AHToolkit;
  const markup = `<div class="section-head"><div><div class="section-kicker">SHARED BILL MATH</div><h2>Tip and split</h2><p>Enter your own rates; the tool does not recommend tipping customs and does not provide financial advice.</p></div><span class="tool-badge">CUSTOM RATES</span></div><div class="calc-grid"><label>Bill before tax <input id="bill" type="number" min="0" step="0.01" value="100"></label><label>Tax % <input id="tax" type="number" min="0" step="0.01" value="0"></label><label>Tip % <input id="tip" type="number" min="0" step="0.01" value="18"></label><label>People <input id="people" type="number" min="1" step="1" value="2"></label></div><button class="button button-main" id="run" type="button">Split bill</button><div id="out" class="result" aria-live="polite" hidden></div><div id="status" class="status" role="status" hidden></div>`;
  const root = api.mount(markup);
  const output = root.querySelector('#out'), status = root.querySelector('#status'), runButton = root.querySelector('#run');
  const inputs = ['bill', 'tax', 'tip', 'people'].map(id => root.querySelector(`#${id}`));
  const number = id => Number(root.querySelector(`#${id}`).value);
  function clearResult() {
    const hadResult = Boolean(output.textContent.trim());
    output.textContent = '';
    output.hidden = true;
    if (hadResult) api.status(status, 'Inputs changed. Split the bill again to refresh the result.', 'warn');
  }
  for (const input of inputs) {
    input.addEventListener('input', clearResult);
    input.addEventListener('change', clearResult);
  }
  runButton.onclick = () => {
    clearResult();
    if (!api.credits.canRun(status)) return;
    const bill = number('bill'), tax = number('tax'), tip = number('tip'), people = number('people');
    if (![bill, tax, tip, people].every(Number.isFinite) || bill < 0 || tax < 0 || tip < 0 || people < 1 || !Number.isInteger(people)) {
      return api.status(status, 'Use non-negative rates and a whole number of people.', 'warn');
    }
    const taxAmount = bill * tax / 100, tipAmount = bill * tip / 100, total = bill + taxAmount + tipAmount;
    output.innerHTML = `<p>Tax: <b>${taxAmount.toFixed(2)}</b> · Tip: <b>${tipAmount.toFixed(2)}</b></p><p>Total: <b>${total.toFixed(2)}</b> · Each of ${people}: <b>${(total / people).toFixed(2)}</b></p><small>Formula: tax = bill × tax% ÷ 100; tip = bill × tip% ÷ 100; total ÷ people. Currency is not assumed.</small>`;
    output.hidden = false;
    api.credits.charge();
    api.status(status, 'Bill split calculated successfully.', 'success');
  };
})();
