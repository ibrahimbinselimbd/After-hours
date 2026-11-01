(() => {
  'use strict';

  window.AHPlannerTools ||= [];
  window.AHPlannerHandlers ||= {};

  const CATEGORY = 'privacy-security';
  const MAX = 120000;
  const MAX_LINES = 4000;

  const asText = (value) => String(value == null ? '' : value).trim();
  const bounded = (value, label = 'Input') => {
    const text = asText(value);
    if (text.length > MAX) throw new Error(`${label} is limited to ${MAX.toLocaleString()} characters.`);
    return text;
  };
  const lines = (value) => bounded(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, MAX_LINES);
  const clean = (value, fallback = '[not provided]') => asText(value).replace(/[\r\n]+/g, ' ').slice(0, 500) || fallback;
  const unique = (items) => [...new Set(items.filter(Boolean))];
  const quote = (value) => `“${clean(value)}”`;
  const date = (value) => {
    const match = asText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const iso = (value) => value.toISOString().slice(0, 10);
  const daysBetween = (from, to) => Math.floor((Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) - Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())) / 86400000);
  const money = (value) => {
    const parsed = Number(String(value).replace(/[^0-9.+-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const fmtMoney = (value, currency = '') => `${currency ? `${currency} ` : ''}${Number(value || 0).toFixed(2)}`;
  const result = (summary, detailLines = [], warnings = [], filename) => ({
    summary,
    details: detailLines.join('\n'),
    ...(filename ? { filename } : {}),
    ...(warnings.length ? { warnings: unique(warnings) } : {})
  });
  const required = (value, label) => {
    const text = asText(value);
    if (!text) throw new Error(`Provide ${label}.`);
    return text;
  };

  function explainPhishing(input) {
    const message = bounded(input.message, 'Message');
    if (!message) throw new Error('Paste the suspicious message or a redacted excerpt.');
    const lower = message.toLowerCase();
    const signals = [];
    const checks = [
      [/\b(urgent|immediately|act now|final notice|within \d+ hours?)\b/i, 'Urgency or pressure to act quickly'],
      [/\b(password|passcode|one[- ]time|verification code|security code|social security|bank|card number)\b/i, 'Request or mention of credentials, codes, or financial information'],
      [/\b(click|tap|open|sign in|log in|verify|confirm)\b/i, 'Call to click a link or verify an account'],
      [/(https?:\/\/|www\.|bit\.ly|tinyurl|t\.co\b)/i, 'A URL or shortened link appears'],
      [/\b(gift card|crypto|bitcoin|wire transfer|payment)\b/i, 'Unusual payment or transfer language'],
      [/\b(dear customer|valued user|account holder)\b/i, 'Generic greeting rather than an identified recipient'],
      [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, 'An email address appears and should be checked independently'],
      [/[!]{2,}|\bcongratulations\b|\byou(?:'|’)ve won\b/i, 'Unexpected reward or emotional bait']
    ];
    checks.forEach(([pattern, label]) => { if (pattern.test(message)) signals.push(label); });
    const steps = [
      'Do not click links, open attachments, reply, or share codes/passwords.',
      'Verify through a known-good app, bookmark, phone number, or printed statement—not through the message.',
      'If an account or payment may be affected, contact the provider using its official channel and change credentials from a trusted device.',
      'Report or delete the message according to the service’s built-in controls; preserve evidence only if needed for reporting.'
    ];
    const detail = [`Signals found (${signals.length}):`, ...(signals.length ? signals.map((s) => `- ${s}`) : ['- No common text signal matched; absence of a match does not make a message safe.']), '', 'Safer next steps:', ...steps, '', `Observed excerpt length: ${message.length} characters.`];
    return result(signals.length ? 'This message contains common phishing signals; treat it as untrusted.' : 'No common phishing signal was detected by these simple text checks.', detail, ['Heuristic text analysis only; it cannot verify sender identity, links, attachments, spoofing, or safety. Never treat this result as a safety certification.'], 'phishing-message-review.txt');
  }

  function portability(input) {
    const organization = required(input.organization, 'the organization name');
    const requester = required(input.requester, 'your name or identifier');
    const scope = clean(input.scope, 'all personal data associated with my account');
    const format = clean(input.format, 'a commonly used, machine-readable format');
    const contact = clean(input.contact, '[your contact details]');
    const detail = [
      `Subject: Personal data portability request — ${organization}`,
      '', `To ${organization},`, '',
      `I am requesting a copy of the personal data you hold about me in relation to: ${scope}.`,
      `Please provide the data in ${format}, together with any information needed to understand the structure and use the data. If you need to verify my identity, please tell me what is required and how it will be handled securely.`,
      '', `Requester: ${requester}`, `Contact: ${contact}`, '',
      'Please confirm receipt and explain any applicable process, scope limits, or expected response timeline. This request is for my review and delivery through an appropriate secure channel.', '',
      'Sincerely,', requester,
      '', 'Review before sending: remove unnecessary identifiers, check the organization’s official contact channel, and keep a copy of the request and any response.'
    ];
    return result('Draft portability request prepared for your review.', detail, ['This is a plain-language template, not legal advice. Rights, identity checks, deadlines, and eligible data vary by jurisdiction and organization. It does not send anything.'], 'personal-data-portability-request.txt');
  }

  function deletion(input) {
    const organization = required(input.organization, 'the organization name');
    const requester = required(input.requester, 'your name or identifier');
    const scope = clean(input.scope, 'my account and personal data associated with it');
    const contact = clean(input.contact, '[your contact details]');
    const detail = [
      `Subject: Request to delete personal data — ${organization}`,
      '', `To ${organization},`, '',
      `Please delete ${scope}. Please also stop using this data for optional communications or profiling where applicable, and tell me which information must be retained and why.`,
      'Please confirm receipt, explain any identity verification required, and provide written confirmation of the action taken or the reason any request cannot be completed.',
      '', `Requester: ${requester}`, `Contact: ${contact}`, '',
      'This draft is for review. I will use your official privacy or support channel and will not include more information than is necessary to identify the relevant account.', '',
      'Sincerely,', requester,
      '', 'Review before sending: check retention, backups, fraud-prevention, tax, or legal-record exceptions described by the organization and applicable law.'
    ];
    return result('Draft deletion request prepared for your review.', detail, ['This is not legal advice and does not claim a guaranteed deletion right or outcome. It does not send a request or contact the organization.'], 'data-deletion-request-draft.txt');
  }

  function wifi(input) {
    const router = clean(input.router, '[router/network details not provided]');
    const inventory = lines(input.devices || '').slice(0, 200);
    const guests = input.guestAccess === true || /^(yes|true|1|on)$/i.test(asText(input.guestAccess));
    const detail = [`Router/network notes: ${router}`, '', `Device entries recorded: ${inventory.length}`, ...(inventory.length ? inventory.map((item, index) => `${index + 1}. ${item}`) : ['1. [add device name, owner, type, and last-seen note]']), '', 'Guest-access checklist:', `- Guest network enabled: ${guests ? 'yes (as entered)' : 'not marked enabled'}`, '- Use a separate guest SSID/password where supported.', '- Confirm guests cannot reach local admin panels, shared storage, printers, cameras, or other trusted devices unless intentionally allowed.', '- Change guest credentials when access should end; avoid sharing the primary Wi-Fi password.', '- Review router admin users, firmware/update status, encryption mode, and remote administration settings.', '- Remove unknown or retired devices and rotate Wi-Fi credentials after a suspected disclosure.', '', 'Suggested inventory columns: device/name | person or purpose | connection type | last checked | keep/remove decision.'];
    return result(`Inventory checklist prepared with ${inventory.length} device entr${inventory.length === 1 ? 'y' : 'ies'}.`, detail, ['Manual inventory only; it does not scan the router, identify devices, test isolation, or guarantee network security.'], 'home-wifi-device-guest-access-inventory.txt');
  }

  function policy(input) {
    const source = bounded(input.policy, 'Policy text');
    if (!source) throw new Error('Paste a privacy policy or a redacted excerpt.');
    const sourceLines = source.split(/\r?\n/).slice(0, MAX_LINES);
    const headings = sourceLines.filter((line) => /^\s*(#{1,6}\s+|\d+(?:\.\d+)*[.)]?\s+|[A-Z][A-Z0-9 &/,-]{5,})/.test(line)).map((line) => line.trim()).slice(0, 80);
    const terms = ['collect', 'use', 'share', 'sell', 'retain', 'delete', 'access', 'correct', 'security', 'cookies', 'advertising', 'children', 'international', 'third parties'];
    const lower = source.toLowerCase();
    const present = terms.filter((term) => lower.includes(term));
    const detail = ['Headings or heading-like lines:', ...(headings.length ? headings.map((h) => `- ${h.slice(0, 240)}`) : ['- None recognized; formatting may be unstructured.']), '', `Key terms found: ${present.length ? present.join(', ') : 'none of the simple tracked terms'}`, '', 'Questions to review in the original policy:', '- What data is collected, from which sources, and whether providing it is optional?', '- Why is it used, who receives it, and whether sharing or sale is described?', '- How long is it retained, and how can access, correction, deletion, or objection be requested?', '- What cookies, analytics, advertising, international transfers, children’s provisions, and security language apply?', '', `Analyzed ${source.length} characters locally.`];
    return result('Plain-English review map prepared from the pasted policy.', detail, ['This extracts headings and keyword signals; it is not a complete interpretation, translation, legal review, or statement of what the organization actually does. Do not paste secrets or unnecessary personal data.'], 'privacy-policy-review-map.txt');
  }

  function terms(input) {
    const oldText = bounded(input.oldTerms, 'Previous terms');
    const newText = bounded(input.newTerms, 'New terms');
    if (!oldText || !newText) throw new Error('Paste both the previous and new terms.');
    const oldLines = oldText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const newLines = newText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);
    const added = newLines.filter((line) => !oldSet.has(line)).slice(0, 120);
    const removed = oldLines.filter((line) => !newSet.has(line)).slice(0, 120);
    const oldPhrases = new Set((oldText.toLowerCase().match(/\b[a-z][a-z-]{3,}\b/g) || []));
    const newPhrases = new Set((newText.toLowerCase().match(/\b[a-z][a-z-]{3,}\b/g) || []));
    const newTerms = ['sell', 'share', 'arbitration', 'renew', 'terminate', 'license', 'location', 'biometric', 'retention', 'third-party', 'third party', 'ai'];
    const phraseSignals = newTerms.filter((term) => !oldText.toLowerCase().includes(term) && newText.toLowerCase().includes(term));
    const detail = [`Exact nonblank lines added or changed (${added.length} shown):`, ...(added.length ? added.map((line) => `+ ${line.slice(0, 400)}`) : ['+ None']), '', `Exact nonblank lines removed or changed (${removed.length} shown):`, ...(removed.length ? removed.map((line) => `- ${line.slice(0, 400)}`) : ['- None']), '', `Newly appearing review terms: ${phraseSignals.length ? phraseSignals.join(', ') : 'none in the small tracked list'}`, '', 'Review the surrounding sections and effective date manually; line-based changes can miss reordered or paraphrased language.'];
    return result(`Compared ${oldLines.length} previous lines with ${newLines.length} new lines; ${added.length} additions and ${removed.length} removals found.`, detail, ['Local line/phrase comparison only; it is not a legal interpretation, semantic diff, or complete change detector.'], 'terms-of-service-change-review.txt');
  }

  function broker(input) {
    const broker = clean(input.broker, '[broker name]');
    const entries = lines(input.entries || '').slice(0, 200);
    const statuses = entries.map((entry) => {
      const match = entry.match(/^([^|]+)\|\s*(.+)$/);
      return match ? { name: match[1].trim(), status: match[2].trim() } : { name: entry, status: 'not recorded' };
    });
    const counts = statuses.reduce((acc, item) => { const key = item.status.toLowerCase(); acc[key] = (acc[key] || 0) + 1; return acc; }, {});
    const detail = [`Broker: ${broker}`, '', 'Requests/statuses:', ...(statuses.length ? statuses.map((item, index) => `${index + 1}. ${item.name} — ${item.status}`) : ['1. [request or listing] | requested / waiting / verified / denied / follow-up']), '', `Status summary: ${Object.keys(counts).length ? Object.entries(counts).map(([key, value]) => `${key}: ${value}`).join('; ') : 'no entries yet'}`, '', 'Follow-up checklist:', '- Record request date, official channel, reference number, response date, and next follow-up date.', '- Keep only the minimum evidence needed; redact account numbers and identity documents in notes.', '- Recheck whether the listing returns after a reasonable interval and record the source/date.', '- Confirm whether removal affects only one listing, a household, or an identity-matched profile.'];
    return result(`Removal tracker prepared for ${broker}.`, detail, ['Status is user-entered and not independently verified. Removal policies, identity checks, reappearance, and legal rights vary; this tool does not contact brokers.'], 'data-broker-removal-request-tracker.txt');
  }

  function backup(input) {
    const last = date(input.lastBackup);
    const today = date(input.asOfDate);
    const interval = Math.max(1, Math.min(3650, Number(input.intervalDays) || 30));
    if (!last || !today) throw new Error('Enter valid last-backup and as-of dates in YYYY-MM-DD format.');
    const age = daysBetween(last, today);
    const due = age >= interval;
    const detail = [`Last backup: ${iso(last)}`, `As-of date: ${iso(today)}`, `Backup age: ${age} day${age === 1 ? '' : 's'}`, `Target interval: every ${interval} day${interval === 1 ? '' : 's'}`, `Freshness: ${due ? 'due or overdue' : 'within target interval'}`, '', 'Restore drill checklist:', '- Choose a representative file or system snapshot and note its expected result.', '- Confirm the backup location, version/date, encryption/access path, and available recovery credentials without pasting secrets here.', '- Restore to a separate test location or otherwise avoid overwriting the live copy.', '- Open the restored item, compare key files/settings, and record what was missing or changed.', '- Record drill date, result, issues, and the next corrective action.', '- Schedule the next backup and restore drill according to your risk and retention needs.'];
    return result(due ? 'Backup freshness is due for review and a restore drill is recommended.' : 'Backup freshness is within the entered target interval; a restore drill is still recommended.', detail, ['Date arithmetic and checklist only; this does not inspect backups, prove recoverability, or guarantee data integrity.'], 'personal-backup-restore-drill-plan.txt');
  }

  function returns(input) {
    const purchased = date(input.purchaseDate);
    const today = date(input.asOfDate);
    const windowDays = Math.max(0, Math.min(3650, Number(input.windowDays)));
    if (!purchased || !today || !Number.isFinite(windowDays)) throw new Error('Enter valid purchase/as-of dates and a numeric return window.');
    const deadline = new Date(purchased.getTime()); deadline.setUTCDate(deadline.getUTCDate() + windowDays);
    const remaining = daysBetween(today, deadline);
    const state = remaining < 0 ? `closed ${Math.abs(remaining)} day${Math.abs(remaining) === 1 ? '' : 's'} ago` : remaining === 0 ? 'closes today' : `${remaining} day${remaining === 1 ? '' : 's'} remaining`;
    const detail = [`Purchase date: ${iso(purchased)}`, `Return window: ${windowDays} day${windowDays === 1 ? '' : 's'}`, `Calculated deadline: ${iso(deadline)}`, `As-of date: ${iso(today)}`, `Status: ${state}`, '', 'Before returning:', '- Check the seller’s official policy, exclusions, condition requirements, shipping method, fees, and refund timing.', '- Save the receipt/order reference and photographs or other condition evidence where appropriate.', '- Record tracking or handoff confirmation; do not include full payment credentials in this note.'];
    return result(`Return window ${state}.`, detail, ['This is a date estimate based only on the entered dates and window; seller policy, time zones, holidays, receipt rules, and extensions may change the actual outcome.'], 'purchase-return-window-tracker.txt');
  }

  function renewals(input) {
    const currency = clean(input.currency, '');
    const entries = lines(input.entries || '').slice(0, 200).map((entry) => {
      const parts = entry.split('|').map((part) => part.trim());
      const amount = money(parts[1] || parts[0]);
      const cadence = (parts[2] || 'monthly').toLowerCase();
      const monthly = /annual|year|yearly|12\s*month/.test(cadence) ? amount / 12 : /quarter|3\s*month/.test(cadence) ? amount / 3 : /week/.test(cadence) ? amount * 52 / 12 : amount;
      return { name: parts[0] || '[subscription]', amount, cadence, monthly };
    });
    const monthly = entries.reduce((sum, item) => sum + item.monthly, 0);
    const annual = monthly * 12;
    const detail = [`Subscriptions recorded: ${entries.length}`, ...(entries.length ? entries.map((item, index) => `${index + 1}. ${item.name} — ${fmtMoney(item.amount, currency)} (${item.cadence}); estimated monthly ${fmtMoney(item.monthly, currency)}`) : ['1. Service | amount | monthly or annual']), '', `Estimated monthly total: ${fmtMoney(monthly, currency)}`, `Estimated annual total: ${fmtMoney(annual, currency)}`, '', 'Review checklist:', '- Confirm renewal date, taxes/fees, introductory pricing expiry, cancellation terms, and the payment method in the official account.', '- Mark subscriptions to cancel, downgrade, or keep before their next renewal.', '- Totals are estimates: enter comparable amounts and note whether tax/fees are included.'];
    return result(`Estimated subscription cost: ${fmtMoney(monthly, currency)} per month or ${fmtMoney(annual, currency)} per year.`, detail, ['Totals are local arithmetic from user-entered values; they do not check live pricing, taxes, discounts, renewal dates, or cancellation status.'], 'subscription-renewal-cost-tracker.txt');
  }

  const definitions = [
    { slug: 'phishing-message-explainer', title: 'Phishing Message Explainer', description: 'Review a pasted message for common phishing signals and safer next steps.', fields: [{ id: 'message', label: 'Message or redacted excerpt', type: 'textarea', placeholder: 'Paste text only; redact secrets.' }], limitations: 'Local heuristic review only; never certifies safety and does not inspect links, attachments, sender infrastructure, or live accounts.' },
    { slug: 'personal-data-portability-request-organizer', title: 'Personal Data Portability Request Organizer', description: 'Prepare a reviewable personal data portability request letter.', fields: [{ id: 'organization', label: 'Organization', type: 'text' }, { id: 'requester', label: 'Your name or identifier', type: 'text' }, { id: 'scope', label: 'Data scope', type: 'textarea' }, { id: 'format', label: 'Preferred format', type: 'text' }, { id: 'contact', label: 'Contact details', type: 'text' }], limitations: 'Draft only; no auto-send, legal advice, identity verification, or guaranteed right, deadline, or response.' },
    { slug: 'data-deletion-request-draft-generator', title: 'Data Deletion Request Draft Generator', description: 'Prepare a reviewable personal data deletion request letter.', fields: [{ id: 'organization', label: 'Organization', type: 'text' }, { id: 'requester', label: 'Your name or identifier', type: 'text' }, { id: 'scope', label: 'Deletion scope', type: 'textarea' }, { id: 'contact', label: 'Contact details', type: 'text' }], limitations: 'Draft only; no auto-send, legal advice, or guarantee that data will be deleted.' },
    { slug: 'home-wifi-device-guest-access-inventory', title: 'Home Wi-Fi Device & Guest Access Inventory', description: 'Record a manual home network inventory and guest-access review checklist.', fields: [{ id: 'router', label: 'Router/network notes', type: 'textarea' }, { id: 'devices', label: 'Devices (one per line)', type: 'textarea' }, { id: 'guestAccess', label: 'Guest network enabled', type: 'checkbox' }], limitations: 'Manual checklist only; it does not scan, identify, test, or secure a router or device.' },
    { slug: 'privacy-policy-plain-english-explainer', title: 'Privacy Policy Plain-English Explainer', description: 'Extract heading-like sections and common privacy terms from pasted policy text.', fields: [{ id: 'policy', label: 'Privacy policy text', type: 'textarea', placeholder: 'Paste a policy or redacted excerpt.' }], limitations: 'Local heading and keyword extraction only; not legal advice, translation, complete interpretation, or a factual audit.' },
    { slug: 'terms-of-service-change-explainer', title: 'Terms-of-Service Change Explainer', description: 'Compare pasted previous and new terms using local line and phrase deltas.', fields: [{ id: 'oldTerms', label: 'Previous terms', type: 'textarea' }, { id: 'newTerms', label: 'New terms', type: 'textarea' }], limitations: 'Local line/phrase comparison only; not a semantic diff, legal interpretation, or complete change detector.' },
    { slug: 'data-broker-removal-request-tracker', title: 'Data-Broker Removal Request Tracker', description: 'Organize user-entered data-broker removal requests and follow-up statuses.', fields: [{ id: 'broker', label: 'Broker or tracker name', type: 'text' }, { id: 'entries', label: 'Requests (name | status)', type: 'textarea', placeholder: 'Broker/listing | requested' }], limitations: 'Status summaries use only manual entries; no broker contact, verification, monitoring, or removal guarantee.' },
    { slug: 'personal-backup-restore-drill-planner', title: 'Personal Backup & Restore Drill Planner', description: 'Check backup freshness and produce a practical restore-drill checklist.', fields: [{ id: 'lastBackup', label: 'Last backup date', type: 'date' }, { id: 'asOfDate', label: 'As-of date', type: 'date' }, { id: 'intervalDays', label: 'Target interval (days)', type: 'number' }], limitations: 'Local date arithmetic and checklist only; it does not inspect backups, prove recoverability, or guarantee integrity.' },
    { slug: 'purchase-return-window-tracker', title: 'Purchase Return-Window Tracker', description: 'Calculate an estimated return deadline and remaining days from entered dates.', fields: [{ id: 'purchaseDate', label: 'Purchase date', type: 'date' }, { id: 'asOfDate', label: 'As-of date', type: 'date' }, { id: 'windowDays', label: 'Return window (days)', type: 'number' }], limitations: 'Date estimate only; seller policy, time zones, holidays, fees, and extensions are not checked.' },
    { slug: 'subscription-renewal-cost-tracker', title: 'Subscription Renewal Cost Tracker', description: 'Estimate monthly and annual subscription costs from manually entered amounts and cadences.', fields: [{ id: 'currency', label: 'Currency symbol/code', type: 'text' }, { id: 'entries', label: 'Subscriptions (name | amount | cadence)', type: 'textarea', placeholder: 'Music | 9.99 | monthly' }], limitations: 'Local arithmetic only; it does not check live pricing, taxes, discounts, renewal dates, or cancellation status.' }
  ];

  const handlers = {
    'phishing-message-explainer': explainPhishing,
    'personal-data-portability-request-organizer': portability,
    'data-deletion-request-draft-generator': deletion,
    'home-wifi-device-guest-access-inventory': wifi,
    'privacy-policy-plain-english-explainer': policy,
    'terms-of-service-change-explainer': terms,
    'data-broker-removal-request-tracker': broker,
    'personal-backup-restore-drill-planner': backup,
    'purchase-return-window-tracker': returns,
    'subscription-renewal-cost-tracker': renewals
  };

  definitions.forEach((definition) => {
    const existing = window.AHPlannerTools.find((item) => item && item.slug === definition.slug);
    if (!existing) window.AHPlannerTools.push({ ...definition, categoryId: CATEGORY });
    window.AHPlannerHandlers[definition.slug] = handlers[definition.slug];
  });
})();
