(() => {
  'use strict';

  const api = window.AHToolkit;
  const markup = `<div class="section-head"><div><div class="section-kicker">DATE PLANNING</div><h2>Move a date</h2><p>Plan a target date using calendar arithmetic. Month-end dates clamp to the last valid day.</p></div><span class="tool-badge">NO HOLIDAY LOGIC</span></div><div class="calc-grid"><label>Starting date <input id="date" type="date"></label><label>Amount <input id="amount" type="number" step="1" value="30"></label><label>Unit <select id="unit"><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option><option value="years">Years</option></select></label></div><button class="button button-main" id="run" type="button">Calculate target date</button><div id="out" class="result" aria-live="polite" hidden></div><div id="status" class="status" role="status" hidden></div>`;
  const root = api.mount(markup);
  const dateInput = root.querySelector('#date');
  const amountInput = root.querySelector('#amount');
  const unitInput = root.querySelector('#unit');
  const runButton = root.querySelector('#run');
  const output = root.querySelector('#out');
  const status = root.querySelector('#status');

  const utcDate = (year, monthIndex, day) => {
    const value = new Date(0);
    value.setUTCHours(0, 0, 0, 0);
    value.setUTCFullYear(year, monthIndex, day);
    return value;
  };
  const daysInMonth = (year, monthIndex) => utcDate(year, monthIndex + 1, 0).getUTCDate();
  const localToday = () => {
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  };
  const parseDate = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month - 1)) return null;
    return utcDate(year, month - 1, day);
  };
  const pad = value => String(value).padStart(2, '0');
  const toISO = date => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const formatDate = date => new Intl.DateTimeFormat(undefined, {year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'}).format(date);
  const addMonths = (date, amount) => {
    const monthNumber = date.getUTCFullYear() * 12 + date.getUTCMonth() + amount;
    const year = Math.floor(monthNumber / 12);
    const monthIndex = monthNumber - year * 12;
    const day = Math.min(date.getUTCDate(), daysInMonth(year, monthIndex));
    return utcDate(year, monthIndex, day);
  };

  dateInput.value = localToday();
  function clearResult() {
    const hadResult = Boolean(output.textContent.trim());
    output.textContent = '';
    output.hidden = true;
    if (hadResult) api.status(status, 'Inputs changed. Calculate again to refresh the result.', 'warn');
  }
  for (const input of [dateInput, amountInput, unitInput]) {
    input.addEventListener('input', clearResult);
    input.addEventListener('change', clearResult);
  }

  runButton.onclick = () => {
    clearResult();
    if (!api.credits.canRun(status)) return;
    const amount = Number(amountInput.value);
    const unit = unitInput.value;
    const start = parseDate(dateInput.value);
    if (!start || !Number.isInteger(amount)) return api.status(status, 'Choose a valid date and a whole-number amount.', 'warn');

    let target;
    if (unit === 'days' || unit === 'weeks') {
      target = new Date(start);
      target.setUTCDate(target.getUTCDate() + amount * (unit === 'weeks' ? 7 : 1));
    } else if (unit === 'months') {
      target = addMonths(start, amount);
    } else if (unit === 'years') {
      target = addMonths(start, amount * 12);
    } else {
      return api.status(status, 'Choose a supported date unit.', 'warn');
    }

    output.innerHTML = `<p><b>${formatDate(target)}</b> <span class="mono">(${toISO(target)})</span></p><small>Formula: add ${amount} ${unit} in the Gregorian calendar using the browser’s local-date input. Month-end dates clamp to the last valid day. No weekends, holidays, or business-day rules are applied.</small>`;
    output.hidden = false;
    api.credits.charge();
    api.status(status, 'Target date calculated successfully.', 'success');
  };
})();
