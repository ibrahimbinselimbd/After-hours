(() => {
  'use strict';

  const MAX_INPUT_CHARS = 2 * 1024 * 1024;
  const MAX_ENTRIES = 1000;
  const MAX_FINDINGS_PER_ENTRY = 40;
  const SECRET_KEY = /(?:authorization|proxy-authorization|cookie|set-cookie|token|secret|password|passwd|api[-_]?key|access[-_]?key|client[-_]?secret|signature|sig|jwt|session|private[-_]?key|credential)/i;
  const SENSITIVE_VALUE = /^(?:bearer\s+)?[A-Za-z0-9_\-.~+/=]{12,}$/i;
  const TIMING_KEYS = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'];

  const asText = value => String(value == null ? '' : value);
  const clampNumber = value => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  const redact = value => {
    const text = asText(value);
    if (!text) return '(empty)';
    if (text.length <= 8) return '[REDACTED]';
    return `${text.slice(0, 3)}…[REDACTED]…${text.slice(-2)}`;
  };
  const headerPairs = headers => Array.isArray(headers) ? headers.map(item => ({
    name: asText(item && item.name),
    value: asText(item && item.value)
  })).filter(item => item.name) : [];
  const classify = (name, value) => SECRET_KEY.test(name) || SENSITIVE_VALUE.test(value.trim());

  function parseInput(raw) {
    const source = asText(raw).replace(/^\uFEFF/, '').trim();
    if (!source) throw new Error('Paste a HAR 1.2 JSON object first.');
    if (source.length > MAX_INPUT_CHARS) throw new Error('Input exceeds the 2 MB local safety limit.');
    let document;
    try { document = JSON.parse(source); }
    catch (error) { throw new Error(`Invalid JSON: ${error.message}`); }
    if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('HAR root must be a JSON object.');
    if (!document.log || typeof document.log !== 'object' || Array.isArray(document.log)) throw new Error('Expected a HAR object with a log member.');
    if (document.log.version && asText(document.log.version) !== '1.2') throw new Error(`Unsupported HAR version “${asText(document.log.version)}”; this tool accepts HAR 1.2.`);
    if (!Array.isArray(document.log.entries)) throw new Error('HAR log.entries must be an array.');
    if (document.log.entries.length > MAX_ENTRIES) throw new Error(`This tool accepts at most ${MAX_ENTRIES.toLocaleString()} entries.`);
    return document;
  }

  function timingFor(entry) {
    const timings = entry && entry.timings && typeof entry.timings === 'object' ? entry.timings : {};
    const phases = {};
    let knownTotal = 0;
    let omitted = 0;
    TIMING_KEYS.forEach(key => {
      const value = clampNumber(timings[key]);
      if (value == null) { if (timings[key] !== -1) omitted += 1; return; }
      phases[key] = value;
      knownTotal += value;
    });
    const reported = clampNumber(entry && entry.time);
    const total = reported != null ? reported : (Object.keys(phases).length ? knownTotal : null);
    const unexplained = reported != null && knownTotal <= reported ? reported - knownTotal : null;
    return { phases, total, knownTotal, unexplained, omitted };
  }

  function privacyFor(entry) {
    const findings = [];
    const request = entry && entry.request && typeof entry.request === 'object' ? entry.request : {};
    const response = entry && entry.response && typeof entry.response === 'object' ? entry.response : {};
    const url = asText(request.url || entry.url);
    try {
      const parsed = new URL(url);
      parsed.searchParams.forEach((value, key) => {
        if (SECRET_KEY.test(key) || SENSITIVE_VALUE.test(value)) findings.push(`query ${key}=${redact(value)}`);
      });
    } catch (_) {
      if (url.includes('?')) findings.push('URL could not be parsed; query-secret scan was skipped');
    }
    [
      ['request header', headerPairs(request.headers)],
      ['response header', headerPairs(response.headers)]
    ].forEach(([kind, pairs]) => pairs.forEach(pair => {
      if (classify(pair.name, pair.value)) findings.push(`${kind} ${pair.name}: ${redact(pair.value)}`);
    }));
    const cookies = Array.isArray(request.cookies) ? request.cookies : [];
    cookies.forEach(cookie => {
      const name = asText(cookie && cookie.name);
      if (name) findings.push(`request cookie ${name}: ${redact(cookie && cookie.value)}`);
    });
    const postData = request.postData && typeof request.postData === 'object' ? request.postData : null;
    if (postData) {
      (Array.isArray(postData.params) ? postData.params : []).forEach(param => {
        const name = asText(param && param.name);
        const value = asText(param && param.value);
        if (name && (SECRET_KEY.test(name) || SENSITIVE_VALUE.test(value))) findings.push(`body field ${name}=${redact(value)}`);
      });
      if (postData.text && (SECRET_KEY.test(asText(postData.mimeType)) || SECRET_KEY.test(postData.text))) {
        findings.push(`body text (${asText(postData.mimeType || 'unknown type')}): possible secret content ${redact(postData.text)}`);
      }
    }
    return findings.slice(0, MAX_FINDINGS_PER_ENTRY);
  }

  function run(values) {
    const document = parseInput(values && values.har);
    const entries = document.log.entries;
    const rows = [];
    const totals = { reported: 0, known: 0, missing: 0, findings: 0 };
    let earliest = null;
    entries.forEach((entry, index) => {
      const timing = timingFor(entry || {});
      const findings = privacyFor(entry || {});
      const started = Date.parse(asText(entry && entry.startedDateTime));
      if (Number.isFinite(started)) earliest = earliest == null ? started : Math.min(earliest, started);
      if (timing.total != null) totals.reported += timing.total;
      totals.known += timing.knownTotal;
      totals.missing += timing.omitted;
      totals.findings += findings.length;
      rows.push({ index: index + 1, entry, timing, findings, started });
    });

    const lines = [
      'HAR 1.2 — local waterfall & privacy analyzer',
      `Entries: ${entries.length} | total reported time: ${totals.reported.toFixed(2)} ms | known phase time: ${totals.known.toFixed(2)} ms`,
      `Privacy findings: ${totals.findings} (heuristic; values are redacted)`,
      ''
    ];
    rows.forEach(row => {
      const request = row.entry && row.entry.request && typeof row.entry.request === 'object' ? row.entry.request : {};
      const method = asText(request.method || 'GET').toUpperCase();
      const url = asText(request.url || row.entry && row.entry.url || '(no URL)');
      const relative = earliest != null && Number.isFinite(row.started) ? `, start +${Math.max(0, row.started - earliest)} ms` : '';
      const phaseText = Object.keys(row.timing.phases).map(key => `${key} ${row.timing.phases[key]} ms`).join(', ') || 'no phase timings';
      lines.push(`#${row.index} ${method} ${url}`);
      lines.push(`  duration: ${row.timing.total == null ? 'not reported' : `${row.timing.total} ms`}${relative}; ${phaseText}`);
      if (row.timing.unexplained != null && row.timing.unexplained > 0.01) lines.push(`  timing note: ${row.timing.unexplained.toFixed(2)} ms is outside listed phases (queueing/overhead or vendor behavior).`);
      if (row.timing.omitted) lines.push(`  timing note: ${row.timing.omitted} phase value(s) omitted or unavailable; -1 is treated as unavailable.`);
      if (row.findings.length) {
        lines.push(`  privacy flags: ${row.findings.join('; ')}`);
      } else {
        lines.push('  privacy flags: none detected by the local heuristics');
      }
      lines.push('');
    });
    lines.push('Limitations: timing fields can be omitted, -1, browser-specific, or vendor extensions; this is not a pixel-accurate waterfall or network diagnosis. Secret detection is heuristic and may miss encoded, split, encrypted, or unusually named secrets and may flag harmless high-entropy values. Only standard HAR request/response fields are inspected; no server, DNS, certificate, or remote verification is performed. Review the original capture before sharing it.');
    return { text: lines.join('\n'), filename: 'har-privacy-waterfall-report.txt', mime: 'text/plain;charset=utf-8', warnings: ['Privacy flags are heuristic; redaction is for the report only and does not alter the pasted HAR.'] };
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['har-privacy-waterfall'] = {
    title: 'HAR Waterfall & Privacy Analyzer',
    description: 'Inspect a bounded HAR 1.2 capture locally for available request timings and likely cookie, auth, query, or body secrets; no remote checks are performed.',
    limitations: 'Conditional HAR 1.2 support only: omitted/-1 timings, browser/vendor fields, malformed captures, and nonstandard timing semantics are reported but not reconstructed. Secret flags and redacted previews are conservative heuristics, not proof of exposure or absence; no server, DNS, certificate, or remote verification occurs. Inputs are capped at 2 MB and 1,000 entries.',
    fields: [{ id: 'har', label: 'HAR 1.2 JSON', type: 'textarea', placeholder: '{"log":{"version":"1.2","entries":[]}}', help: 'Paste a HAR 1.2 JSON export. Processing stays in this browser; captures are capped at 2 MB and 1,000 entries.' }],
    run
  };
})();
