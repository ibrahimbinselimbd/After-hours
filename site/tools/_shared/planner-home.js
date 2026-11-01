(() => {
  'use strict';
  window.AHPlannerTools ||= [];
  window.AHPlannerHandlers ||= {};

  const LIMIT = 200;
  const clean = (value, fallback = '') => String(value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300);
  const cleanOutput = (value) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  const lines = (value) => String(value || '').split(/\r?\n/).map(value => clean(value)).filter(Boolean).slice(0, LIMIT);
  const parts = (line) => line.split(/[|,;\t]/).map(value => clean(value));
  const civilDate = (year, month, day) => { const d = new Date(0); d.setUTCHours(0, 0, 0, 0); d.setUTCFullYear(year, month - 1, day); return d; };
  const date = (value) => { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim()); if (!match) return null; const [year, month, day] = match.slice(1).map(Number); const d = civilDate(year, month, day); return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d : null; };
  const iso = (d) => d ? d.toISOString().slice(0, 10) : '';
  const today = () => { const d = new Date(); return civilDate(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  const days = (a, b) => Math.round((a - b) / 86400000);
  const num = (value) => Number(String(value).replace(/[^\d.-]/g, ''));
  const money = (value) => Number.isFinite(value) ? value.toFixed(2) : '—';
  const result = (summary, detail, warnings = []) => ({ summary: clean(summary), details: cleanOutput(detail), warnings: warnings.map(warning => cleanOutput(warning)).filter(Boolean).slice(0, LIMIT) });
  const field = (id, label, type, extra = {}) => ({ id, label, type, ...extra });

  const defs = [
    { slug: 'home-inventory-warranty-tracker', title: 'Home Inventory & Warranty Tracker', categoryId: 'ai-everyday-utilities', description: 'Turn item rows into a searchable home inventory with warranty dates and follow-up reminders.', limitations: 'Uses only the rows and dates you enter; not proof of ownership, coverage, value, or claim eligibility.', fields: [field('items', 'Items (name | room | serial/value | purchase date | warranty end)', 'textarea', { placeholder: 'Washer | Laundry | SN123 / 700 | 2025-02-01 | 2027-02-01' })] },
    { slug: 'moving-box-inventory-label-planner', title: 'Moving Box Inventory & Label Planner', categoryId: 'ai-everyday-utilities', description: 'Create compact box labels and a room-by-room moving inventory.', limitations: 'Labels are planning aids; verify contents and fragile or hazardous handling separately.', fields: [field('boxes', 'Boxes (box | room | contents | priority)', 'textarea', { placeholder: 'B01 | Kitchen | plates, mugs | open first' })] },
    { slug: 'pantry-expiry-use-first-planner', title: 'Pantry Expiry & Use-First Planner', categoryId: 'ai-everyday-utilities', description: 'Sort pantry items by entered expiry dates and highlight what to use first.', limitations: 'Dates and food safety decisions are user-supplied; inspect packaging and follow local food-safety guidance.', fields: [field('items', 'Pantry rows (item | quantity | expiry date)', 'textarea', { placeholder: 'Canned beans | 3 | 2026-11-15' })] },
    { slug: 'weekly-meal-plan-consolidated-grocery-list', title: 'Weekly Meal Plan & Consolidated Grocery List', categoryId: 'ai-everyday-utilities', description: 'Combine meal ingredients into a deduplicated grocery list with quantities.', limitations: 'Does not check dietary suitability, stock, prices, substitutions, or availability.', fields: [field('meals', 'Meals (day | meal | ingredients separated by +)', 'textarea', { placeholder: 'Mon | Dinner | rice + beans + onion' })] },
    { slug: 'household-chore-rotation-planner', title: 'Household Chore Rotation Planner', categoryId: 'ai-everyday-utilities', description: 'Rotate chores fairly across household members for a simple planning period.', limitations: 'Rotation is a suggested schedule; adjust for accessibility, preferences, absences, and actual workload.', fields: [field('people', 'People (comma-separated)', 'text', { placeholder: 'Alex, Sam, Jordan' }), field('chores', 'Chores (one per line)', 'textarea', { placeholder: 'Vacuum\nKitchen\nBins' }), field('startDate', 'Start date', 'date'), field('weeks', 'Weeks', 'number', { min: 1, max: 12, step: 1, placeholder: '4' })] },
    { slug: 'home-maintenance-schedule-planner', title: 'Home Maintenance Schedule Planner', categoryId: 'ai-everyday-utilities', description: 'Calculate recurring maintenance due dates from the last completed date and an interval.', limitations: 'Intervals are reminders only; follow equipment manuals and qualified professional advice where appropriate.', fields: [field('tasks', 'Tasks (task | last done YYYY-MM-DD | interval days)', 'textarea', { placeholder: 'HVAC filter | 2026-09-01 | 90' })] },
    { slug: 'emergency-supplies-rotation-tracker', title: 'Emergency Supplies Rotation Tracker', categoryId: 'ai-everyday-utilities', description: 'Track emergency supplies by quantity, use-by date, and rotation action.', limitations: 'Does not assess emergency readiness, medical suitability, storage conditions, or local emergency guidance.', fields: [field('supplies', 'Supplies (item | quantity | use-by date | action)', 'textarea', { placeholder: 'Bottled water | 12 | 2027-01-01 | rotate' })] },
    { slug: 'capsule-wardrobe-outfit-planner', title: 'Capsule Wardrobe Outfit Planner', categoryId: 'ai-everyday-utilities', description: 'Generate bounded outfit combinations from the wardrobe entries you provide.', limitations: 'Outfits are combinations only; no weather, dress-code, laundry, fit, or availability data is used.', fields: [field('wardrobe', 'Wardrobe (item | category | color/style)', 'textarea', { placeholder: 'Navy shirt | top | navy\nBlack jeans | bottom | black\nWhite sneakers | shoes | white' }), field('outfits', 'Maximum outfits', 'number', { min: 1, max: 30, step: 1, placeholder: '10' })] },
    { slug: 'plant-care-vacation-watering-planner', title: 'Plant Care & Vacation Watering Planner', categoryId: 'ai-everyday-utilities', description: 'Make a date-based watering and care checklist for plants during a selected period.', limitations: 'Uses your stated intervals only; no weather, species, soil, light, or live plant-health data is considered.', fields: [field('plants', 'Plants (name | interval days | last watered YYYY-MM-DD | helper/note)', 'textarea', { placeholder: 'Fern | 4 | 2026-10-28 | indirect light' }), field('startDate', 'Planning start', 'date'), field('endDate', 'Planning end', 'date')] },
    { slug: 'utility-bill-usage-cost-trend-analyzer', title: 'Utility Bill Usage/Cost Trend Analyzer', categoryId: 'ai-everyday-utilities', description: 'Compare entered utility bills for usage, cost, deltas, and cost per unit.', limitations: 'Calculations are based solely on entered bills; they are not forecasts, rate explanations, or billing corrections.', fields: [field('bills', 'Bills (period/date | usage | cost)', 'textarea', { placeholder: '2026-08 | 420 | 98.40\n2026-09 | 390 | 93.10' })] }
  ];

  const handlers = {
    'home-inventory-warranty-tracker': v => {
      const now = today(); const rows = lines(v.items).map(parts).map(x => ({ name: x[0], room: x[1] || 'Unassigned', info: x[2] || '', bought: x[3] || '', warranty: date(x[4]) })).filter(x => x.name);
      rows.sort((a, b) => (a.warranty || new Date(8640000000000000)) - (b.warranty || new Date(8640000000000000)));
      const due = rows.filter(x => x.warranty && days(x.warranty, now) <= 60);
      return result(`${rows.length} inventory item(s); ${due.length} warranty date(s) within 60 days.`, rows.map(x => `- ${x.name} — ${x.room}${x.info ? ` — ${x.info}` : ''}${x.warranty ? ` — warranty ${iso(x.warranty)} (${days(x.warranty, now) < 0 ? 'expired' : `${days(x.warranty, now)} days left`})` : ''}`).join('\n'), rows.length ? [] : ['Enter one item per line using | separators.']);
    },
    'moving-box-inventory-label-planner': v => {
      const rows = lines(v.boxes).map(parts).map(x => ({ box: x[0], room: x[1] || 'Unassigned', contents: x[2] || 'Contents not listed', priority: x[3] || 'standard' })).filter(x => x.box);
      return result(`${rows.length} box label(s) prepared.`, rows.map(x => `${x.box} | ${x.room} | ${x.priority.toUpperCase()} | ${x.contents}`).join('\n'), rows.length ? [] : ['Enter one box per line using | separators.']);
    },
    'pantry-expiry-use-first-planner': v => {
      const now = today(); const rows = lines(v.items).map(parts).map(x => ({ item: x[0], qty: x[1] || '?', expiry: date(x[2]) })).filter(x => x.item).sort((a, b) => (a.expiry || new Date(8640000000000000)) - (b.expiry || new Date(8640000000000000)));
      const urgent = rows.filter(x => x.expiry && days(x.expiry, now) <= 14);
      return result(`${rows.length} pantry item(s); ${urgent.length} due or approaching within 14 days.`, rows.map(x => `- ${x.item} (${x.qty}) — ${x.expiry ? `${iso(x.expiry)}${days(x.expiry, now) < 0 ? ' — past date' : ` — ${days(x.expiry, now)} days`}` : 'no expiry entered'}`).join('\n'), rows.length ? [] : ['Enter one pantry item per line using | separators.']);
    },
    'weekly-meal-plan-consolidated-grocery-list': v => {
      const meals = lines(v.meals).map(parts).filter(x => x[0] && x[2]); const merged = new Map();
      meals.forEach(x => x[2].split('+').map(value => clean(value)).filter(Boolean).forEach(i => { const key = i.toLowerCase(); merged.set(key, (merged.get(key) || 0) + 1); }));
      return result(`${meals.length} meal(s) planned; ${merged.size} consolidated grocery item(s).`, `MEALS\n${meals.map(x => `- ${x[0]}: ${x[1] || 'Meal'} — ${x[2]}`).join('\n')}\n\nGROCERY LIST\n${[...merged].sort().map(([name, count]) => `- ${name}${count > 1 ? ` (mentioned ${count}×)` : ''}`).join('\n')}`, meals.length ? [] : ['Enter one meal per line using | separators and + between ingredients.']);
    },
    'household-chore-rotation-planner': v => {
      const people = String(v.people || '').split(',').map(value => clean(value)).filter(Boolean).slice(0, 30); const chores = lines(v.chores); const weeks = Math.max(1, Math.min(12, Math.floor(num(v.weeks) || 4))); const start = date(v.startDate) || today();
      if (!people.length || !chores.length) return result('No rotation created.', '', ['Enter at least one person and one chore.']);
      const out = []; for (let w = 0; w < weeks; w++) { const d = new Date(start); d.setUTCDate(d.getUTCDate() + w * 7); out.push(`WEEK ${w + 1} (${iso(d)})`); chores.forEach((c, i) => out.push(`- ${c}: ${people[(i + w) % people.length]}`)); }
      return result(`${weeks}-week rotation for ${people.length} person(s) and ${chores.length} chore(s).`, out.join('\n'));
    },
    'home-maintenance-schedule-planner': v => {
      const now = today(); const warnings = []; const rows = [];
      lines(v.tasks).forEach((line, index) => {
        const [task = '', lastText = '', intervalText = ''] = parts(line);
        if (!task) { warnings.push(`Row ${index + 1}: task name is required.`); return; }
        const last = lastText ? date(lastText) : null; const interval = Number(intervalText); let valid = true;
        if (!lastText) { warnings.push(`Row ${index + 1}: last completed date is required in YYYY-MM-DD format.`); valid = false; }
        else if (!last) { warnings.push(`Row ${index + 1}: last completed date must be a valid YYYY-MM-DD date.`); valid = false; }
        if (!intervalText) { warnings.push(`Row ${index + 1}: interval days are required.`); valid = false; }
        else if (!Number.isFinite(interval) || interval <= 0 || !Number.isInteger(interval)) { warnings.push(`Row ${index + 1}: interval days must be a positive whole number.`); valid = false; }
        if (valid) rows.push({task, due: new Date(last.getTime() + interval * 86400000)});
      });
      rows.sort((a, b) => a.due - b.due);
      return result(`${rows.length} maintenance task(s) scheduled.`, rows.map(x => `- ${x.task}: ${iso(x.due)}${days(x.due, now) < 0 ? ' — due' : ` — in ${days(x.due, now)} days`}`).join('\n'), warnings.length ? warnings : rows.length ? [] : ['Enter task, last-completed date, and interval days.']);
    },
    'emergency-supplies-rotation-tracker': v => {
      const now = today(); const rows = lines(v.supplies).map(parts).map(x => ({ item: x[0], qty: x[1] || '?', useBy: date(x[2]), action: x[3] || 'review' })).filter(x => x.item).sort((a, b) => (a.useBy || new Date(8640000000000000)) - (b.useBy || new Date(8640000000000000)));
      return result(`${rows.length} supply item(s) tracked.`, rows.map(x => `- ${x.item} (${x.qty}) — ${x.useBy ? `${iso(x.useBy)}${days(x.useBy, now) < 0 ? ' — replace/review' : ''}` : 'no use-by date'} — ${x.action}`).join('\n'), rows.length ? [] : ['Enter one supply per line using | separators.']);
    },
    'capsule-wardrobe-outfit-planner': v => {
      const rows = lines(v.wardrobe).map(parts).map(x => ({ item: x[0], category: (x[1] || '').toLowerCase(), style: x[2] || '' })).filter(x => x.item); const tops = rows.filter(x => /top|shirt|blouse|sweater/.test(x.category)); const bottoms = rows.filter(x => /bottom|pant|skirt|short/.test(x.category)); const shoes = rows.filter(x => /shoe|footwear|boot/.test(x.category)); const max = Math.max(1, Math.min(30, Math.floor(num(v.outfits) || 10))); const out = [];
      for (let i = 0; i < max && tops.length && bottoms.length; i++) out.push(`${i + 1}. ${tops[i % tops.length].item} + ${bottoms[(i * 2) % bottoms.length].item}${shoes.length ? ` + ${shoes[i % shoes.length].item}` : ''}`);
      return result(`${out.length} outfit combination(s) generated from ${rows.length} item(s).`, out.join('\n'), out.length ? [] : ['Use category values such as top, bottom, and shoes.']);
    },
    'plant-care-vacation-watering-planner': v => {
      const warnings = []; const startText = String(v.startDate || '').trim(); const endText = String(v.endDate || '').trim();
      const parsedStart = startText ? date(startText) : null; const parsedEnd = endText ? date(endText) : null; const start = parsedStart || today(); const end = parsedEnd || parsedStart || start; let validRange = true;
      if (startText && !parsedStart) { warnings.push('Planning start must be a valid YYYY-MM-DD date.'); validRange = false; }
      if (endText && !parsedEnd) { warnings.push('Planning end must be a valid YYYY-MM-DD date.'); validRange = false; }
      if (parsedEnd && parsedEnd < start) { warnings.push('Planning end must be on or after the planning start.'); validRange = false; }
      const rows = [];
      lines(v.plants).forEach((line, index) => {
        const [name = '', intervalText = '', lastText = '', note = ''] = parts(line);
        if (!name) { warnings.push(`Row ${index + 1}: plant name is required.`); return; }
        const interval = Number(intervalText); const last = lastText ? date(lastText) : null; let valid = true;
        if (!intervalText) { warnings.push(`Row ${index + 1}: interval days are required.`); valid = false; }
        else if (!Number.isFinite(interval) || interval <= 0 || !Number.isInteger(interval)) { warnings.push(`Row ${index + 1}: interval days must be a positive whole number.`); valid = false; }
        if (lastText && !last) { warnings.push(`Row ${index + 1}: last watered date must be a valid YYYY-MM-DD date.`); valid = false; }
        if (valid) rows.push({name, interval, last, note});
      });
      const out = [];
      if (validRange) rows.forEach(plant => { let next = plant.last ? new Date(plant.last) : new Date(start); if (plant.last) next.setUTCDate(next.getUTCDate() + plant.interval); let count = 0; while (next <= end && count < 50) { if (next >= start) out.push(`- ${iso(next)} — ${plant.name}${plant.note ? ` (${plant.note})` : ''}`); next.setUTCDate(next.getUTCDate() + plant.interval); count++; } });
      return result(`${rows.length} plant(s); ${out.length} watering/checklist date(s) in range.`, out.join('\n'), warnings.length ? warnings : rows.length ? [] : ['Enter plant, interval days, and last-watered date.']);
    },
    'utility-bill-usage-cost-trend-analyzer': v => {
      const rows = lines(v.bills).map(parts).map(x => ({ period: x[0], usage: num(x[1]), cost: num(x[2]) })).filter(x => x.period && Number.isFinite(x.usage) && Number.isFinite(x.cost)); const out = rows.map((x, i) => { const prev = rows[i - 1]; const du = prev ? x.usage - prev.usage : null; const dc = prev ? x.cost - prev.cost : null; return `- ${x.period}: usage ${x.usage}, cost $${money(x.cost)}, cost/unit $${money(x.cost / x.usage)}${prev ? `; change ${du >= 0 ? '+' : ''}${du} usage, ${dc >= 0 ? '+' : ''}$${money(dc)}` : ''}`; });
      return result(`${rows.length} bill(s) analyzed.`, out.join('\n'), rows.length ? [] : ['Enter one bill per line as period/date | usage | cost.']);
    }
  };

  defs.forEach(definition => { if (!window.AHPlannerTools.some(x => x.slug === definition.slug)) window.AHPlannerTools.push(definition); });
  Object.assign(window.AHPlannerHandlers, handlers);
})();
