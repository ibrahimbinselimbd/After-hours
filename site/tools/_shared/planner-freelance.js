/* Offline freelance and small-commerce planning tools. All inputs are user-supplied. */
(function (root) {
  'use strict';

  root.AHPlannerTools ||= [];
  root.AHPlannerHandlers ||= {};

  const allowedTypes = new Set(['text', 'textarea', 'number', 'date', 'select', 'checkbox']);
  const MAX_TEXT = 6000;
  const MAX_ROWS = 200;
  const MAX_VARIANTS = 500;
  const trim = (value) => String(value ?? '').trim().slice(0, MAX_TEXT);
  const safe = (value, fallback = '') => trim(value) || fallback;
  const lines = (value, max = MAX_ROWS) => trim(value).split(/\r?\n/).map(trim).filter(Boolean).slice(0, max);
  const money = (n) => Number.isFinite(n) ? n.toFixed(2) : '0.00';
  const pct = (n) => `${(n * 100).toFixed(1)}%`;
  const num = (value, fallback = 0, min = -1e9, max = 1e9) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const positive = (value, label) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} must be greater than zero.`);
    return n;
  };
  const result = (summary, details = [], warnings = []) => ({
    summary: safe(summary),
    ...(details.length ? { details: details.map((x) => trim(x)) } : {}),
    ...(warnings.length ? { warnings: warnings.map((x) => trim(x)) } : {})
  });
  const field = (id, type, label, extra = {}) => ({ id, type, label, ...extra });
  const currency = (data) => safe(data.currency, 'USD');
  const parsePipeRows = (value, count) => lines(value).map((row) => row.split('|').map(trim).slice(0, count));
  const errorResult = (error) => result(error instanceof Error ? error.message : String(error));
  const wrap = (fn) => (data) => { try { return fn(data || {}); } catch (error) { return errorResult(error); } };

  const definitions = [
    {
      slug: 'freelance-quote-margin-planner', title: 'Freelance Quote & Margin Planner', categoryId: 'data-spreadsheets',
      description: 'Turn hours, costs, and a target margin into a transparent freelance quote.',
      limitations: 'Uses your entered currency and assumptions only. It excludes taxes, payment processing, scope changes, and guarantees of profitability.',
      fields: [field('currency', 'text', 'Currency label', { placeholder: 'USD', default: 'USD' }), field('hours', 'number', 'Estimated labor hours', { min: 0, max: 100000, step: 'any', required: true }), field('hourlyRate', 'number', 'Internal hourly rate', { min: 0, max: 1000000, step: 'any', required: true }), field('materials', 'number', 'Materials / subcontractor cost', { min: 0, max: 100000000, step: 'any' }), field('otherCosts', 'number', 'Other project costs', { min: 0, max: 100000000, step: 'any' }), field('targetMargin', 'number', 'Target margin (%)', { min: 0, max: 99.99, step: 'any', required: true })]
    },
    {
      slug: 'effective-hourly-rate-tracker', title: 'Effective Hourly Rate Tracker', categoryId: 'data-spreadsheets',
      description: 'Calculate realized pre-tax hourly rate from entered project revenue, time, and expenses.',
      limitations: 'Rows are manually entered and treated as the same currency. The result is before taxes, overhead not entered, owner benefits, and unpaid pipeline time.',
      fields: [field('currency', 'text', 'Currency label', { default: 'USD' }), field('projects', 'textarea', 'Project rows: name | revenue | total hours | project expenses', { placeholder: 'Brand refresh | 1800 | 24 | 120' })]
    },
    {
      slug: 'client-capacity-workload-planner', title: 'Client Capacity & Workload Planner', categoryId: 'data-spreadsheets',
      description: 'Compare weekly billable capacity with the hours committed to each client.',
      limitations: 'This is a weekly planning model. It does not predict interruptions, seasonality, health constraints, deadlines, or client behavior.',
      fields: [field('weeklyHours', 'number', 'Total working hours per week', { min: 0, max: 168, step: 'any', required: true }), field('nonbillablePct', 'number', 'Non-billable time (%)', { min: 0, max: 100, step: 'any' }), field('bufferPct', 'number', 'Planning buffer (%)', { min: 0, max: 100, step: 'any' }), field('clients', 'textarea', 'Client rows: client | committed hours/week', { placeholder: 'Acme | 12\nNorthstar | 8' })]
    },
    {
      slug: 'proposal-scope-assumption-draft-builder', title: 'Proposal Scope & Assumption Draft Builder', categoryId: 'data-spreadsheets',
      description: 'Draft an editable plain-text proposal scope with deliverables, exclusions, assumptions, and commercial terms.',
      limitations: 'The output is a drafting aid, not legal advice or a binding contract. Review scope, accessibility, tax, payment, and intellectual-property terms yourself.',
      fields: [field('client', 'text', 'Client / organization'), field('project', 'text', 'Project name'), field('deliverables', 'textarea', 'Deliverables (one per line)'), field('exclusions', 'textarea', 'Exclusions / out of scope (one per line)'), field('assumptions', 'textarea', 'Assumptions (one per line)'), field('timeline', 'textarea', 'Timeline and milestones'), field('paymentTerms', 'textarea', 'Price, currency, and payment terms'), field('revisionPolicy', 'textarea', 'Revision / change-request policy'), field('notes', 'textarea', 'Additional notes')]
    },
    {
      slug: 'invoice-follow-up-message-drafter', title: 'Invoice Follow-Up Message Drafter', categoryId: 'data-spreadsheets',
      description: 'Create an editable, professional invoice follow-up message from the facts you provide.',
      limitations: 'No invoice system, delivery service, payment status, or contact record is checked. Confirm dates, amounts, and local collection requirements before sending.',
      fields: [field('client', 'text', 'Client name'), field('invoiceNumber', 'text', 'Invoice number'), field('amount', 'number', 'Amount due', { min: 0, max: 100000000, step: 'any' }), field('currency', 'text', 'Currency label', { default: 'USD' }), field('dueDate', 'date', 'Due date'), field('tone', 'select', 'Tone', { options: [{ value: 'friendly', label: 'Friendly reminder' }, { value: 'firm', label: 'Firm follow-up' }, { value: 'final', label: 'Final notice draft' }], default: 'friendly' }), field('contact', 'text', 'Reply-to / payment contact'), field('customNote', 'textarea', 'Optional custom note')]
    },
    {
      slug: 'marketplace-fee-net-profit-comparator', title: 'Marketplace Fee & Net-Profit Comparator', categoryId: 'data-spreadsheets',
      description: 'Compare manually entered marketplace fee assumptions and estimate net profit per sale.',
      limitations: 'There is no live fee table. Enter the applicable percentage, fixed fee, fulfillment cost, refunds, and other costs for each channel; actual policies may differ.',
      fields: [field('currency', 'text', 'Currency label', { default: 'USD' }), field('offers', 'textarea', 'Rows: channel | sale price | unit cost | fee % | fixed fee | shipping/fulfillment | other cost', { placeholder: 'Market A | 50 | 12 | 13 | 0.30 | 6 | 1' })]
    },
    {
      slug: 'sku-variant-matrix-builder', title: 'SKU/Variant Matrix Builder', categoryId: 'data-spreadsheets',
      description: 'Build a bounded Cartesian SKU matrix from product, option, and variant lists.',
      limitations: 'Lists are entered manually and capped at 500 generated combinations. It does not assign inventory, validate marketplace rules, or create product records.',
      fields: [field('baseSku', 'text', 'Base SKU prefix', { placeholder: 'TEE' }), field('products', 'textarea', 'Products / styles (one per line)'), field('colors', 'textarea', 'Colors (one per line)'), field('sizes', 'textarea', 'Sizes (one per line)'), field('otherVariants', 'textarea', 'Other variants (one per line; optional)'), field('separator', 'text', 'SKU separator', { default: '-' })]
    },
    {
      slug: 'inventory-reorder-point-planner', title: 'Inventory Reorder-Point Planner', categoryId: 'data-spreadsheets',
      description: 'Estimate reorder point, stock position, and a suggested replenishment quantity.',
      limitations: 'Demand, lead time, and safety stock are your assumptions. No supplier, seasonality, service-level, or inventory-system data is accessed.',
      fields: [field('sku', 'text', 'SKU / item'), field('avgDailyUsage', 'number', 'Average daily usage', { min: 0, max: 100000000, step: 'any', required: true }), field('leadTimeDays', 'number', 'Lead time (days)', { min: 0, max: 10000, step: 'any', required: true }), field('safetyStock', 'number', 'Safety stock units', { min: 0, max: 100000000, step: 'any' }), field('onHand', 'number', 'On-hand units', { min: 0, max: 100000000, step: 'any' }), field('onOrder', 'number', 'On-order units', { min: 0, max: 100000000, step: 'any' }), field('backorders', 'number', 'Backordered units', { min: 0, max: 100000000, step: 'any' }), field('targetStock', 'number', 'Optional target stock after reorder', { min: 0, max: 100000000, step: 'any' })]
    },
    {
      slug: 'shipping-dimensional-weight-calculator', title: 'Shipping Dimensional-Weight Calculator', categoryId: 'data-spreadsheets',
      description: 'Compare actual and dimensional weight using a user-selected divisor and measurement system.',
      limitations: 'The carrier divisor, rounding rule, surcharge policy, and billable-weight minimum are not looked up. Enter the divisor and verify the carrier’s current terms.',
      fields: [field('length', 'number', 'Length', { min: 0, max: 100000, step: 'any', required: true }), field('width', 'number', 'Width', { min: 0, max: 100000, step: 'any', required: true }), field('height', 'number', 'Height', { min: 0, max: 100000, step: 'any', required: true }), field('dimensionUnit', 'select', 'Dimension unit', { options: [{ value: 'in', label: 'Inches' }, { value: 'cm', label: 'Centimeters' }], default: 'in' }), field('actualWeight', 'number', 'Actual weight', { min: 0, max: 100000, step: 'any', required: true }), field('weightUnit', 'select', 'Weight unit', { options: [{ value: 'lb', label: 'Pounds' }, { value: 'kg', label: 'Kilograms' }], default: 'lb' }), field('divisor', 'number', 'Dimensional divisor (matching units³ per weight unit)', { min: 0.0001, max: 100000000, step: 'any', required: true }), field('rounding', 'select', 'Round billable weight', { options: [{ value: 'none', label: 'Do not round' }, { value: 'up-whole', label: 'Round up to whole unit' }, { value: 'up-half', label: 'Round up to 0.5 unit' }], default: 'none' })]
    },
    {
      slug: 'wholesale-pricing-break-even-planner', title: 'Wholesale Pricing & Break-Even Planner', categoryId: 'data-spreadsheets',
      description: 'Estimate wholesale price, unit contribution, break-even volume, and profit at a target order quantity.',
      limitations: 'Uses entered price, discount, variable cost, and fixed cost assumptions. It excludes taxes, payment terms, returns, bad debt, freight, and guaranteed demand.',
      fields: [field('currency', 'text', 'Currency label', { default: 'USD' }), field('retailPrice', 'number', 'Reference retail price per unit', { min: 0, max: 100000000, step: 'any', required: true }), field('wholesaleDiscount', 'number', 'Wholesale discount from retail (%)', { min: 0, max: 99.99, step: 'any', required: true }), field('variableCost', 'number', 'Variable cost per unit', { min: 0, max: 100000000, step: 'any', required: true }), field('fixedCosts', 'number', 'Fixed costs for the order / period', { min: 0, max: 100000000, step: 'any' }), field('targetUnits', 'number', 'Target units', { min: 0, max: 100000000, step: 'any' })]
    }
  ];

  const handlers = {
    'freelance-quote-margin-planner': wrap((d) => {
      const h = positive(d.hours, 'Estimated labor hours'); const rate = positive(d.hourlyRate, 'Internal hourly rate'); const margin = num(d.targetMargin, 0, 0, 99.99) / 100; const costs = h * rate + num(d.materials, 0, 0, 1e9) + num(d.otherCosts, 0, 0, 1e9); const quote = costs / (1 - margin); return result(`Suggested quote: ${money(quote)} ${currency(d)} at ${pct(margin)} target margin.`, [`Cost basis: ${money(costs)} ${currency(d)} (${money(h * rate)} labor plus entered non-labor costs).`, `Target markup on cost: ${pct(quote / costs - 1)}; expected gross margin: ${pct((quote - costs) / quote)}.`, `Formula: quote = cost basis ÷ (1 − target margin).`], ['Taxes, payment fees, contingency, and scope risk are not included unless entered as costs.']);
    }),
    'effective-hourly-rate-tracker': wrap((d) => { const rows = parsePipeRows(d.projects, 4); let revenue = 0; let expenses = 0; let hours = 0; const details = []; rows.forEach((p, i) => { const r = num(p[1], NaN, 0, 1e12); const h = num(p[2], NaN, 0, 1e8); const e = num(p[3], 0, 0, 1e12); if (Number.isFinite(r) && Number.isFinite(h) && h > 0) { revenue += r; hours += h; expenses += e; details.push(`${i + 1}. ${p[0] || 'Project'}: net ${money(r - e)} ${currency(d)} / ${money(h)} h = ${money((r - e) / h)} per hour.`); } }); if (!hours) return result('Enter at least one row with positive hours and numeric revenue.'); details.unshift(`Totals: revenue ${money(revenue)}, entered expenses ${money(expenses)}, tracked hours ${money(hours)}.`); return result(`Realized pre-tax hourly rate: ${money((revenue - expenses) / hours)} ${currency(d)} per hour.`, details, ['Only rows with positive hours are included; unentered overhead and unpaid time are excluded.']); }),
    'client-capacity-workload-planner': wrap((d) => { const weekly = positive(d.weeklyHours, 'Total working hours'); const non = num(d.nonbillablePct, 0, 0, 100) / 100; const buffer = num(d.bufferPct, 0, 0, 100) / 100; const capacity = weekly * (1 - non) * (1 - buffer); const rows = parsePipeRows(d.clients, 2); let committed = 0; const details = []; rows.forEach((p, i) => { const h = num(p[1], NaN, 0, 100000); if (Number.isFinite(h)) { committed += h; details.push(`${i + 1}. ${p[0] || 'Client'}: ${money(h)} h/week.`); } }); const remaining = capacity - committed; details.unshift(`Planned billable capacity: ${money(capacity)} h/week = ${money(weekly)} × (1 − ${pct(non)}) × (1 − ${pct(buffer)}).`, `Committed client hours: ${money(committed)} h/week; remaining capacity: ${money(remaining)} h/week.`); return result(`Workload utilization: ${pct(committed / capacity)} of planned billable capacity.`, details, [remaining < 0 ? 'Committed work exceeds planned capacity.' : 'Capacity is a planning estimate; review it against actual energy and calendar constraints.']); }),
    'proposal-scope-assumption-draft-builder': wrap((d) => { const list = (v) => lines(v).map((x) => `- ${x}`).join('\n') || '- None entered'; const text = [`PROPOSAL SCOPE DRAFT`, `Client: ${safe(d.client, '[client]')}`, `Project: ${safe(d.project, '[project]')}`, '', 'DELIVERABLES', list(d.deliverables), '', 'OUT OF SCOPE', list(d.exclusions), '', 'ASSUMPTIONS', list(d.assumptions), '', `TIMELINE\n${safe(d.timeline, '[timeline]')}`, '', `COMMERCIAL TERMS\n${safe(d.paymentTerms, '[payment terms]')}`, '', `REVISION / CHANGE POLICY\n${safe(d.revisionPolicy, '[revision policy]')}`, '', `NOTES\n${safe(d.notes, 'None')}`]; return result('Editable proposal scope draft prepared.', [text.join('\n')], ['Review for legal, tax, intellectual-property, accessibility, and approval requirements before sending.']); }),
    'invoice-follow-up-message-drafter': wrap((d) => { const tone = safe(d.tone, 'friendly'); const opening = tone === 'final' ? 'This is a final follow-up regarding the outstanding invoice below.' : tone === 'firm' ? 'I am following up on the outstanding invoice below.' : 'I wanted to send a quick reminder about the invoice below.'; const due = safe(d.dueDate, '[due date]'); const body = [`Subject: ${tone === 'final' ? 'Final notice' : 'Invoice follow-up'} — ${safe(d.invoiceNumber, '[invoice number]')}`, '', `Hi ${safe(d.client, '[client name]')},`, '', opening, `Invoice: ${safe(d.invoiceNumber, '[invoice number]')}`, `Amount due: ${money(num(d.amount, 0, 0, 1e12))} ${currency(d)}`, `Due date: ${due}`, '', safe(d.customNote, 'Please let me know if payment has already been sent or if you need a copy of the invoice.'), '', `You can reply to ${safe(d.contact, '[reply-to / payment contact]')} with any questions.`, '', 'Thank you,', '[your name]']; return result('Editable invoice follow-up draft prepared.', [body.join('\n')], ['Confirm the payment status, amount, due date, recipient, and applicable collection policy before sending.']); }),
    'marketplace-fee-net-profit-comparator': wrap((d) => { const rows = parsePipeRows(d.offers, 7); if (!rows.length) return result('Enter at least one marketplace row.'); const out = []; rows.forEach((p, i) => { const price = num(p[1], NaN, 0, 1e12); const cost = num(p[2], NaN, 0, 1e12); const feePct = num(p[3], 0, 0, 100) / 100; const fixed = num(p[4], 0, 0, 1e12); const fulfil = num(p[5], 0, 0, 1e12); const other = num(p[6], 0, 0, 1e12); if (Number.isFinite(price) && Number.isFinite(cost)) { const fees = price * feePct + fixed; const net = price - cost - fees - fulfil - other; out.push(`${i + 1}. ${p[0] || 'Channel'}: net ${money(net)} ${currency(d)} (${pct(net / price)} of sale price); fees ${money(fees)}.`); } }); return result('Marketplace net-profit comparison complete.', out.length ? out : ['No valid rows found.'], ['Fee rates and costs are manually entered; no live marketplace fee table is used.']); }),
    'sku-variant-matrix-builder': wrap((d) => { const products = lines(d.products, 50), colors = lines(d.colors, 50), sizes = lines(d.sizes, 50), others = lines(d.otherVariants, 50); const axes = [products.length ? products : ['Product'], colors.length ? colors : ['Color'], sizes.length ? sizes : ['Size'], others.length ? others : ['']]; const count = axes.reduce((a, x) => a * x.length, 1); if (count > MAX_VARIANTS) return result(`Variant matrix capped: ${count.toLocaleString()} combinations exceed the ${MAX_VARIANTS} combination limit.`, [`Reduce the entered lists; current axis sizes: ${axes.map((x) => x.length).join(' × ')}.`]); const sep = safe(d.separator, '-').slice(0, 5); const rows = []; const walk = (i, parts) => { if (i === axes.length) { const useful = parts.filter(Boolean); rows.push(`${safe(d.baseSku, 'SKU')}${sep}${useful.map((x) => x.replace(/\s+/g, '-').replace(/[^\w-]/g, '')).join(sep)} | ${useful.join(' / ')}`); return; } axes[i].forEach((v) => walk(i + 1, parts.concat(v))); }; walk(0, []); return result(`${rows.length} SKU variant combination(s) generated.`, [`Format: SKU | variant labels`, rows.join('\n')], ['Generated combinations are capped at 500; review naming collisions and marketplace requirements manually.']); }),
    'inventory-reorder-point-planner': wrap((d) => { const daily = positive(d.avgDailyUsage, 'Average daily usage'); const lead = num(d.leadTimeDays, 0, 0, 1e6); const safety = num(d.safetyStock, 0, 0, 1e9); const reorder = daily * lead + safety; const onHand = num(d.onHand, 0, 0, 1e9); const onOrder = num(d.onOrder, 0, 0, 1e9); const back = num(d.backorders, 0, 0, 1e9); const position = onHand + onOrder - back; const target = num(d.targetStock, 0, 0, 1e9); const suggested = Math.max(0, target > 0 ? target - position : reorder - position); return result(`Reorder point: ${money(reorder)} units; stock position: ${money(position)} units.`, [`Formula: reorder point = average daily usage × lead-time days + safety stock = ${money(daily)} × ${money(lead)} + ${money(safety)}.`, `Suggested order quantity: ${money(suggested)} units${target > 0 ? ' to reach the entered target stock' : ' to restore the reorder point'}.`, `Stock position = on-hand + on-order − backorders = ${money(onHand)} + ${money(onOrder)} − ${money(back)}.`], ['Round to sellable purchase-pack quantities and validate supplier minimums separately.']); }),
    'shipping-dimensional-weight-calculator': wrap((d) => { const l = positive(d.length, 'Length'); const w = positive(d.width, 'Width'); const h = positive(d.height, 'Height'); const actual = positive(d.actualWeight, 'Actual weight'); const divisor = positive(d.divisor, 'Dimensional divisor'); const dim = l * w * h / divisor; let billable = Math.max(actual, dim); const rounding = safe(d.rounding, 'none'); if (rounding === 'up-whole') billable = Math.ceil(billable); if (rounding === 'up-half') billable = Math.ceil(billable * 2) / 2; return result(`Billable weight: ${money(billable)} ${safe(d.weightUnit, 'lb')} (${dim > actual ? 'dimensional' : 'actual'} weight governs).`, [`Dimensional weight = ${money(l)} × ${money(w)} × ${money(h)} ÷ ${money(divisor)} = ${money(dim)} ${safe(d.weightUnit, 'lb')}.`, `Actual weight: ${money(actual)} ${safe(d.weightUnit, 'lb')}; rounding rule: ${rounding}.`, `Dimensions were treated as ${safe(d.dimensionUnit, 'in')}; divisor must use matching cubic units per selected weight unit.`], ['Carriers may apply different divisors, rounding, oversize rules, or minimum billable weights.']); }),
    'wholesale-pricing-break-even-planner': wrap((d) => { const retail = positive(d.retailPrice, 'Reference retail price'); const discount = num(d.wholesaleDiscount, 0, 0, 99.99) / 100; const variable = num(d.variableCost, 0, 0, 1e12); const fixed = num(d.fixedCosts, 0, 0, 1e12); const wholesale = retail * (1 - discount); const contribution = wholesale - variable; if (contribution <= 0) return result('Wholesale price does not cover variable cost.', [`Wholesale price: ${money(wholesale)} ${currency(d)}; variable cost: ${money(variable)} ${currency(d)}.`, 'Break-even is undefined when unit contribution is zero or negative.']); const breakeven = fixed / contribution; const units = num(d.targetUnits, 0, 0, 1e9); const profit = units * contribution - fixed; return result(`Wholesale price: ${money(wholesale)} ${currency(d)}; break-even: ${Math.ceil(breakeven)} units.`, [`Unit contribution: ${money(contribution)} ${currency(d)} = wholesale price − variable cost.`, `At ${money(units)} target units, estimated contribution after fixed costs: ${money(profit)} ${currency(d)}.`, `Formula: break-even units = fixed costs ÷ unit contribution.`], ['This is a contribution-margin estimate, not a sales or profitability guarantee.']); })
  };

  definitions.forEach((definition) => {
    definition.fields = definition.fields.filter((f) => allowedTypes.has(f.type));
    root.AHPlannerTools.push(definition);
  });
  Object.assign(root.AHPlannerHandlers, handlers);
})(window);
