(() => {
  'use strict';

  const api = window.AHToolkit;
  const markup = `<div class="section-head"><div><div class="section-kicker">PERSONAL DATE MATH</div><h2>Age in calendar units</h2><p>Shows completed calendar years plus the remaining months and days. It is an arithmetic result, not medical or legal advice.</p></div><span class="tool-badge">LOCAL DATES</span></div><div class="calc-grid"><label>Birth date <input id="birth" type="date"></label><label>As of <input id="asof" type="date"></label></div><button class="button button-main" id="run" type="button">Calculate age</button><div id="out" class="result" aria-live="polite" hidden></div><div id="status" class="status" role="status" hidden></div>`;
  const root = api.mount(markup);
  const birthInput = root.querySelector('#birth');
  const asOfInput = root.querySelector('#asof');
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
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month - 1)) return null;
    return {year, month, day, time: utcDate(year, month - 1, day).getTime()};
  };
  const compareDate = (a, b) => a.time - b.time;
  const addMonthsFromBirth = (birth, offset) => {
    const monthNumber = birth.year * 12 + (birth.month - 1) + offset;
    const year = Math.floor(monthNumber / 12);
    const monthIndex = monthNumber - year * 12;
    return {year, month: monthIndex + 1, day: Math.min(birth.day, daysInMonth(year, monthIndex)), time: utcDate(year, monthIndex, Math.min(birth.day, daysInMonth(year, monthIndex))).getTime()};
  };
  const formatDate = value => new Intl.DateTimeFormat(undefined, {year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'}).format(new Date(value.time));

  asOfInput.value = localToday();
  function clearResult() {
    const hadResult = Boolean(output.textContent.trim());
    output.textContent = '';
    output.hidden = true;
    if (hadResult) api.status(status, 'Inputs changed. Calculate again to refresh the result.', 'warn');
  }
  for (const input of [birthInput, asOfInput]) {
    input.addEventListener('input', clearResult);
    input.addEventListener('change', clearResult);
  }

  runButton.onclick = () => {
    clearResult();
    if (!api.credits.canRun(status)) return;
    const birth = parseDate(birthInput.value);
    const asOf = parseDate(asOfInput.value);
    if (!birth || !asOf) return api.status(status, 'Choose two valid calendar dates.', 'warn');
    if (compareDate(asOf, birth) < 0) return api.status(status, 'As-of date must not precede birth date.', 'warn');

    let totalMonths = (asOf.year - birth.year) * 12 + asOf.month - birth.month;
    let anchor = addMonthsFromBirth(birth, totalMonths);
    if (compareDate(anchor, asOf) > 0) {
      totalMonths -= 1;
      anchor = addMonthsFromBirth(birth, totalMonths);
    }
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    const days = Math.round((asOf.time - anchor.time) / 86400000);
    output.innerHTML = `<p><b>${years} year${years === 1 ? '' : 's'}, ${months} month${months === 1 ? '' : 's'}, ${days} day${days === 1 ? '' : 's'}</b></p><small>Formula: completed calendar months from the birth date, clamped to each target month’s last day, then remaining days. Leap years follow the Gregorian calendar.</small>`;
    output.hidden = false;
    api.credits.charge();
    api.status(status, `Age calculated successfully as of ${formatDate(asOf)}.`, 'success');
  };
})();
