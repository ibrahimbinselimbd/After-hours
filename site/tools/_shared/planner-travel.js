/* Offline travel planning tools. All inputs are user-supplied; no network or external data is used. */
(function (root) {
  'use strict';

  root.AHPlannerTools ||= [];
  root.AHPlannerHandlers ||= {};

  const allowedTypes = new Set(['text', 'textarea', 'number', 'date', 'select', 'checkbox']);
  const trim = (value) => String(value ?? '').trim();
  const safe = (value, fallback = '') => trim(value).slice(0, 4000) || fallback;
  const number = (value, fallback = 0, min = -1e9, max = 1e9) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const lines = (value, max = 100) => safe(value).split(/\r?\n|,/).map(trim).filter(Boolean).slice(0, max);
  const result = (summary, details = [], warnings = []) => ({
    summary: safe(summary),
    ...(details.length ? { details: details.map(safe) } : {}),
    ...(warnings.length ? { warnings: warnings.map(safe) } : {})
  });
  const parseDate = (value) => {
    const text = trim(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const date = new Date(`${text}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : date;
  };
  const iso = (date) => date.toISOString().slice(0, 10);
  const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
  const field = (name, type, label, extra = {}) => ({ name, type, label, ...extra });

  const definitions = [
    {
      slug: 'offline-travel-emergency-card-generator', title: 'Offline Travel Emergency Card Generator', categoryId: 'ai-everyday-utilities',
      description: 'Create a plain-text emergency contact and medical information card for offline reference.',
      limitations: 'Uses only information entered here. Store securely and verify every contact, medication, and local emergency number yourself.',
      fields: [field('traveler', 'text', 'Traveler name'), field('contacts', 'textarea', 'Emergency contacts (one per line)'), field('medical', 'textarea', 'Medical notes, allergies, medications'), field('insurance', 'text', 'Insurance or policy reference'), field('localNumbers', 'textarea', 'Local emergency numbers and addresses'), field('notes', 'textarea', 'Other instructions')]
    },
    {
      slug: 'international-business-day-deadline-calculator', title: 'International Business-Day Deadline Calculator', categoryId: 'data-spreadsheets',
      description: 'Add business days while skipping weekends and a manually supplied holiday list.',
      limitations: 'No country calendars or time zones are queried. Results are planning estimates and do not establish a contractual deadline.',
      fields: [field('startDate', 'date', 'Start date'), field('businessDays', 'number', 'Business days to add', { min: 0, max: 10000 }), field('holidays', 'textarea', 'Holiday dates (YYYY-MM-DD, one per line)')]
    },
    {
      slug: 'international-plug-voltage-compatibility-checker', title: 'International Plug & Voltage Compatibility Checker', categoryId: 'privacy-security',
      description: 'Compare manually entered device and destination plug, voltage, and frequency specifications.',
      limitations: 'This is a manual comparison, not an electrical-safety certification. Confirm specifications with official destination and device sources before use.',
      fields: [field('destinationPlug', 'text', 'Destination socket/plug type'), field('destinationVoltage', 'text', 'Destination voltage'), field('destinationFrequency', 'text', 'Destination frequency'), field('devicePlug', 'text', 'Device plug type'), field('deviceVoltage', 'text', 'Device voltage range'), field('deviceFrequency', 'text', 'Device frequency'), field('grounding', 'text', 'Grounding or adapter notes')]
    },
    {
      slug: 'travel-budget-group-expense-planner', title: 'Travel Budget & Group Expense Planner', categoryId: 'data-spreadsheets',
      description: 'Calculate a group budget, per-person share, and balances from entered expenses and contributions.',
      limitations: 'All amounts and currency labels are user-entered. This does not fetch prices, convert currencies, or settle payments.',
      fields: [field('currency', 'text', 'Currency label', { default: 'USD' }), field('people', 'textarea', 'Group members (one per line)'), field('expenses', 'textarea', 'Expenses as description | amount | payer name (one per line)'), field('contributions', 'textarea', 'Optional contributions as member | amount (one per line)')]
    },
    {
      slug: 'weather-aware-itinerary-packing-list', title: 'Weather-Aware Itinerary Packing List', categoryId: 'ai-everyday-utilities',
      description: 'Turn a manually entered forecast and activity itinerary into a practical packing checklist.',
      limitations: 'No weather service is queried. Forecast details, activities, and personal needs must be entered and checked manually.',
      fields: [field('forecast', 'textarea', 'Manual forecast by day or location'), field('activities', 'textarea', 'Activities and dress needs (one per line)'), field('days', 'number', 'Trip days', { min: 1, max: 366 }), field('specialNeeds', 'textarea', 'Special, medical, or personal items')]
    },
    {
      slug: 'airline-baggage-allowance-comparator', title: 'Airline Baggage Allowance Comparator', categoryId: 'data-spreadsheets',
      description: 'Compare baggage offers entered from airline or booking documents.',
      limitations: 'No live airline rules, fees, or fare conditions are retrieved. Verify the selected itinerary’s current allowance with the airline.',
      fields: [field('offers', 'textarea', 'Offers as airline/flight | cabin | carry-on allowance | checked allowance | fee/notes (one per line)'), field('needs', 'textarea', 'Your baggage needs and dimensions')]
    },
    {
      slug: 'esim-data-plan-comparator', title: 'eSIM Data Plan Comparator', categoryId: 'data-spreadsheets',
      description: 'Compare manually entered eSIM plans by data, validity, price, coverage, and notes.',
      limitations: 'No live plans, prices, coverage, compatibility checks, or purchasing are provided. Confirm details with the plan seller and device maker.',
      fields: [field('plans', 'textarea', 'Plans as name | data | validity | price/currency | coverage | notes (one per line)'), field('usage', 'text', 'Expected data use and priorities')]
    },
    {
      slug: 'international-public-holiday-date-finder', title: 'International Public-Holiday Date Finder', categoryId: 'data-spreadsheets',
      description: 'Search a manually entered holiday date list for dates matching a chosen day or date range.',
      limitations: 'This does not retrieve official calendars. The entered list may be incomplete or inaccurate; confirm holidays with official sources.',
      fields: [field('holidayList', 'textarea', 'Holiday records as YYYY-MM-DD | name | location (one per line)'), field('fromDate', 'date', 'From date'), field('toDate', 'date', 'To date'), field('query', 'text', 'Optional name or location filter')]
    },
    {
      slug: 'visa-entry-document-checklist-planner', title: 'Visa & Entry-Document Checklist Planner', categoryId: 'ai-everyday-utilities',
      description: 'Build an editable, generic document checklist for a planned international trip.',
      limitations: 'This is not legal, immigration, or entry advice and does not determine eligibility. Confirm current requirements with official authorities and carriers.',
      fields: [field('destination', 'text', 'Destination'), field('travelerStatus', 'text', 'Traveler nationality/status'), field('tripPurpose', 'text', 'Trip purpose'), field('items', 'textarea', 'Documents or tasks to check (one per line)'), field('notes', 'textarea', 'Deadlines, copies, and verification notes')]
    },
    {
      slug: 'travel-itinerary-transfer-buffer-planner', title: 'Travel Itinerary Transfer-Buffer Planner', categoryId: 'data-spreadsheets',
      description: 'Compare entered segment arrival, departure, and minimum-transfer times to identify buffer gaps.',
      limitations: 'No live schedules, airport layouts, or delay data are used. Segment times and minimums must be verified with the relevant operator.',
      fields: [field('segments', 'textarea', 'Segments as arrival time | next departure time | required minimum minutes | label (one per line)'), field('defaultMinimum', 'number', 'Default minimum minutes', { min: 0, max: 10080 })]
    }
  ];

  function emergencyCard(data) {
    const name = safe(data.traveler, 'Traveler');
    const details = [`TRAVEL EMERGENCY CARD`, `Name: ${name}`, `Emergency contacts: ${safe(data.contacts, 'Not entered')}`, `Medical notes: ${safe(data.medical, 'Not entered')}`, `Insurance/policy: ${safe(data.insurance, 'Not entered')}`, `Local numbers/addresses: ${safe(data.localNumbers, 'Not entered')}`, `Notes: ${safe(data.notes, 'Not entered')}`];
    return result(`${name}: emergency card prepared`, details, ['Keep this card private and verify all information before relying on it.']);
  }
  function businessDay(data) {
    const start = parseDate(data.startDate); const count = Math.floor(number(data.businessDays, 0, 0, 10000));
    if (!start) return result('Enter a valid start date (YYYY-MM-DD).');
    const holidaySet = new Set(lines(data.holidays, 366).filter((d) => parseDate(d)).map((d) => d));
    let current = start; let added = 0;
    while (added < count) { current = addDays(current, 1); const day = current.getUTCDay(); if (day !== 0 && day !== 6 && !holidaySet.has(iso(current))) added++; }
    return result(`${count} business day(s) after ${iso(start)}: ${iso(current)}`, [`Skipped ${holidaySet.size} valid user-supplied holiday date(s).`], ['Weekends and only the entered holiday dates were skipped.']);
  }
  function plugCheck(data) {
    const dv = safe(data.deviceVoltage), tv = safe(data.destinationVoltage), df = safe(data.deviceFrequency), tf = safe(data.destinationFrequency), dp = safe(data.devicePlug), tp = safe(data.destinationPlug);
    const voltage = dv && tv ? (/universal|multi|100\s*[-–]\s*240/i.test(dv) || dv.toLowerCase() === tv.toLowerCase() ? 'Voltage appears compatible by the entered text.' : 'Voltage may not match; check the device range and destination supply.') : 'Voltage comparison incomplete.';
    const frequency = df && tf ? (df.toLowerCase() === tf.toLowerCase() ? 'Frequency text matches.' : 'Frequency differs or is formatted differently; verify compatibility.') : 'Frequency comparison incomplete.';
    const plug = dp && tp && dp.toLowerCase() === tp.toLowerCase() ? 'Plug type text matches.' : 'A plug adapter may be needed; compare the physical standards.';
    return result('Manual plug and voltage comparison complete.', [`Device plug: ${dp || 'not entered'}; destination: ${tp || 'not entered'}.`, voltage, frequency, `Grounding/adapter notes: ${safe(data.grounding, 'none entered')}`], ['Confirm with official electrical specifications; do not use this as a safety certification.']);
  }
  function budget(data) {
    const members = lines(data.people, 100); const memberSet = new Set(members.map((m) => m.toLowerCase())); let total = 0; const paid = {};
    lines(data.expenses, 200).forEach((row) => { const p = row.split('|').map(trim); const amount = number(p[1], NaN, 0, 1e9); if (Number.isFinite(amount)) { total += amount; const payer = p[2] || 'Unassigned'; paid[payer] = (paid[payer] || 0) + amount; } });
    const share = members.length ? total / members.length : 0; const details = [`Currency: ${safe(data.currency, 'unspecified')}`, `Total entered expenses: ${total.toFixed(2)}`, `Members: ${members.length}`, `Equal share per listed member: ${share.toFixed(2)}`];
    Object.keys(paid).forEach((p) => details.push(`${p} paid: ${paid[p].toFixed(2)}; net versus equal share: ${(paid[p] - share).toFixed(2)}`));
    const unknown = Object.keys(paid).filter((p) => !memberSet.has(p.toLowerCase()) && p !== 'Unassigned'); if (unknown.length) details.push(`Payers not found in member list: ${unknown.join(', ')}`);
    return result(`Group budget total: ${total.toFixed(2)} ${safe(data.currency)}`, details, ['Equal split is a simple planning calculation; it does not account for individual consumption or settle balances.']);
  }
  function packing(data) {
    const forecast = safe(data.forecast, 'No forecast entered.'); const activities = lines(data.activities, 100); const base = ['passport/ID and copies', 'wallet and payment backup', 'phone, charger, and power bank', 'medications and personal essentials', 'underwear and socks', 'sleepwear', 'basic toiletries'];
    const text = `${forecast} ${activities.join(' ')}`.toLowerCase(); if (/rain|storm|wet/.test(text)) base.push('rain jacket or compact umbrella', 'water-resistant bag cover'); if (/cold|snow|freez|winter|below/.test(text)) base.push('warm layers', 'hat/gloves', 'weatherproof footwear'); if (/hot|heat|sun|beach|trop/.test(text)) base.push('sun protection', 'breathable clothing', 'refillable water bottle'); if (/hike|trek|walk/.test(text)) base.push('comfortable walking shoes', 'small day pack'); if (/formal|business|meeting/.test(text)) base.push('formal or business outfit');
    return result(`Packing list prepared for ${Math.max(1, Math.floor(number(data.days, 1, 1, 366)))} day(s).`, [`Forecast used: ${forecast}`, `Activities used: ${activities.join('; ') || 'none entered'}`, `Checklist: ${base.concat(lines(data.specialNeeds, 50)).join('; ')}`], ['Forecast and activity cues were entered manually; check conditions again before departure.']);
  }
  function compareRows(data, label) { const rows = lines(data, 100); return rows.length ? rows.map((r, i) => `${i + 1}. ${r}`).join('\n') : `No ${label} entered.`; }
  function baggage(data) { return result('Baggage offers formatted for comparison.', [`Offers:\n${compareRows(data.offers, 'offers')}`, `Needs: ${safe(data.needs, 'not entered')}`], ['Verify dimensions, weight, fare, route, and fees with the airline.']); }
  function esim(data) { return result('eSIM plans formatted for comparison.', [`Plans:\n${compareRows(data.plans, 'plans')}`, `Usage priorities: ${safe(data.usage, 'not entered')}`], ['Confirm device unlock, eSIM support, coverage, activation rules, and current price with the seller.']); }
  function holidays(data) {
    const from = parseDate(data.fromDate), to = parseDate(data.toDate); const query = safe(data.query).toLowerCase(); const matches = lines(data.holidayList, 500).filter((row) => { const date = parseDate(row.split('|')[0]); return date && (!from || date >= from) && (!to || date <= to) && (!query || row.toLowerCase().includes(query)); });
    return result(`${matches.length} matching manually entered holiday date(s).`, matches.length ? matches : ['No matching entries found.'], ['The list is user-supplied and may not be complete or official.']);
  }
  function visa(data) { const defaults = ['Passport validity checked', 'Visa or authorization requirement checked', 'Application submitted if needed', 'Entry forms checked', 'Proof of onward/return travel checked', 'Accommodation details saved', 'Insurance and health documents checked', 'Digital and paper copies prepared']; return result(`Editable checklist for ${safe(data.destination, 'destination')}.`, [`Traveler/status: ${safe(data.travelerStatus, 'not entered')}`, `Purpose: ${safe(data.tripPurpose, 'not entered')}`, `Checklist: ${defaults.concat(lines(data.items, 100)).join('; ')}`, `Notes: ${safe(data.notes, 'none')}`], ['Generic planning prompts only—not legal, immigration, or entry advice.']); }
  function transfer(data) {
    const fallback = number(data.defaultMinimum, 0, 0, 10080); const details = []; let risks = 0;
    lines(data.segments, 100).forEach((row, i) => { const p = row.split('|').map(trim); const arrival = String(p[0] ?? ''), departure = String(p[1] ?? ''), minimum = number(p[2], fallback, 0, 10080); const a = arrival.match(/^(\d{1,2}):(\d{2})$/), d = departure.match(/^(\d{1,2}):(\d{2})$/); if (!a || !d || Number(a[1]) > 23 || Number(d[1]) > 23 || Number(a[2]) > 59 || Number(d[2]) > 59) { details.push(`${i + 1}. ${p[3] || 'Segment'}: enter arrival/departure as valid 24-hour HH:MM times.`); return; } let mins = (Number(d[1]) * 60 + Number(d[2])) - (Number(a[1]) * 60 + Number(a[2])); if (mins < 0) mins += 1440; const buffer = mins - minimum; if (buffer < 0) risks++; details.push(`${i + 1}. ${p[3] || 'Segment'}: available ${mins} min, required ${minimum} min, buffer ${buffer} min${buffer < 0 ? ' — GAP' : ''}.`); });
    return result(`${risks} transfer buffer(s) below the entered minimum.`, details.length ? details : ['No segments entered.'], ['Times and minimums are user-entered; no live schedule or delay data is used.']);
  }

  const handlers = {
    'offline-travel-emergency-card-generator': emergencyCard,
    'international-business-day-deadline-calculator': businessDay,
    'international-plug-voltage-compatibility-checker': plugCheck,
    'travel-budget-group-expense-planner': budget,
    'weather-aware-itinerary-packing-list': packing,
    'airline-baggage-allowance-comparator': baggage,
    'esim-data-plan-comparator': esim,
    'international-public-holiday-date-finder': holidays,
    'visa-entry-document-checklist-planner': visa,
    'travel-itinerary-transfer-buffer-planner': transfer
  };

  definitions.forEach((definition) => {
    definition.fields = definition.fields.filter((f) => allowedTypes.has(f.type));
    root.AHPlannerTools.push(definition);
  });
  Object.assign(root.AHPlannerHandlers, handlers);
})(window);
