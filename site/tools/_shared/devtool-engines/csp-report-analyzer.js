(() => {
  'use strict';

  const MAX_INPUT_CHARS = 2 * 1024 * 1024;
  const MAX_REPORTS = 5000;
  const MAX_DIAGNOSTICS = 40;
  const DEFAULT_REDACT_FIELDS = ['user', 'email', 'authorization', 'cookie', 'token', 'password', 'secret'];
  const URI_FIELDS = new Set(['blocked-uri', 'document-uri', 'source-file', 'referrer', 'original-policy']);

  const clean = value => String(value == null ? '' : value).trim();
  const display = value => {
    if (value == null || value === '') return '(missing)';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };
  const inc = (map, key) => map.set(key, (map.get(key) || 0) + 1);
  const sortedEntries = map => Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  function parseRedactionList(value) {
    const requested = clean(value).split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
    return new Set(DEFAULT_REDACT_FIELDS.concat(requested));
  }

  function redactValue(field, value, redactFields) {
    const text = display(value);
    const normalized = String(field || '').toLowerCase();
    if (redactFields.has(normalized) || redactFields.has(normalized.replace(/_/g, '-'))) return '[REDACTED]';
    if (URI_FIELDS.has(normalized)) {
      try {
        const url = new URL(text);
        url.search = '';
        url.hash = '';
        return url.toString();
      } catch (_) {
        return text.replace(/[?#].*$/, '') || '(empty URI)';
      }
    }
    return text;
  }

  function unwrap(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    if (item['csp-report'] && typeof item['csp-report'] === 'object' && !Array.isArray(item['csp-report'])) return item['csp-report'];
    if (item.body && typeof item.body === 'object' && !Array.isArray(item.body)) return item.body;
    return item;
  }

  function parseInput(raw) {
    const source = String(raw == null ? '' : raw).replace(/^\uFEFF/, '').trim();
    if (!source) throw new Error('Paste one CSP JSON report, a JSON array, or JSON Lines.');
    if (source.length > MAX_INPUT_CHARS) throw new Error('Input exceeds the 2 MB local size cap. Split the reports into smaller batches.');

    try {
      const parsed = JSON.parse(source);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return { items, format: Array.isArray(parsed) ? 'JSON array' : 'JSON object', diagnostics: [] };
    } catch (_) {
      const items = [];
      const diagnostics = [];
      source.split(/\r?\n/).forEach((line, index) => {
        const text = line.trim();
        if (!text) return;
        try { items.push(JSON.parse(text)); }
        catch (error) {
          if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(`line ${index + 1}: invalid JSON (${error.message})`);
        }
      });
      if (!items.length) throw new Error('Could not parse the input as JSON or JSON Lines. Check quote/comma syntax and line boundaries.');
      return { items, format: 'JSON Lines', diagnostics };
    }
  }

  function analyze(values) {
    const parsed = parseInput(values && values.reports);
    const redactFields = parseRedactionList(values && values.redaction);
    const diagnostics = parsed.diagnostics.slice();
    const directiveCounts = new Map();
    const blockedCounts = new Map();
    const documentCounts = new Map();
    let accepted = 0;

    parsed.items.forEach((item, index) => {
      if (accepted >= MAX_REPORTS) return;
      const report = unwrap(item);
      if (!report) {
        if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(`record ${index + 1}: skipped because it is not a JSON object`);
        return;
      }
      const directive = redactValue('violated-directive', report['violated-directive'] || report.effectiveDirective || report['effective-directive'], redactFields);
      const blocked = redactValue('blocked-uri', report['blocked-uri'] || report.blockedURL || report.blockedURI, redactFields);
      const document = redactValue('document-uri', report['document-uri'] || report.documentURL || report.documentUri, redactFields);
      inc(directiveCounts, directive);
      inc(blockedCounts, blocked);
      inc(documentCounts, document);
      accepted++;
    });

    if (parsed.items.length > MAX_REPORTS) diagnostics.push(`Only the first ${MAX_REPORTS} reports were analyzed due to the local complexity cap.`);
    if (!accepted) throw new Error('No usable JSON object reports were found. Expected a CSP report object, csp-report envelope, or Reporting API body.');
    if (diagnostics.length > MAX_DIAGNOSTICS) diagnostics.splice(MAX_DIAGNOSTICS, diagnostics.length - MAX_DIAGNOSTICS, 'Additional diagnostics omitted.');

    const lines = [
      'CSP VIOLATION REPORT ANALYSIS',
      `Input: ${parsed.format}; analyzed ${accepted} report${accepted === 1 ? '' : 's'}`,
      'Scope: grouped fields only; this does not infer browser behavior or root cause.',
      '',
      'VIOLATED DIRECTIVE COUNTS',
      ...sortedEntries(directiveCounts).map(([key, count]) => `${count}\t${key}`),
      '',
      'BLOCKED URI COUNTS (query strings and fragments removed)',
      ...sortedEntries(blockedCounts).map(([key, count]) => `${count}\t${key}`),
      '',
      'DOCUMENT URI COUNTS (query strings and fragments removed)',
      ...sortedEntries(documentCounts).map(([key, count]) => `${count}\t${key}`)
    ];
    if (diagnostics.length) {
      lines.push('', 'DIAGNOSTICS', ...diagnostics.map(message => `- ${message}`));
    }
    lines.push('', `Redaction: default sensitive field names plus ${clean(values && values.redaction) || 'no additional field names'}.`, 'Export is plain text and contains no HTML. Review the redaction list before sharing.');
    return {
      text: lines.join('\n'),
      filename: 'csp-report-analysis.txt',
      mime: 'text/plain;charset=utf-8',
      warnings: ['Grouped report fields are descriptive, not a diagnosis. Server headers, browser version, deployment context, and application intent are not checked.']
    };
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['csp-report-analyzer'] = {
    title: 'CSP Violation Report Analyzer',
    description: 'Parse pasted CSP JSON or JSON Lines locally, group blocked URI and violated-directive counts, and export a redacted plain-text summary. It does not infer root cause or perform remote checks.',
    limitations: 'Local parsing only; supports common csp-report envelopes and Reporting API bodies. Query strings/fragments are removed from URI groups, selected sensitive field names are redacted, and input is capped at 2 MB and 5,000 reports. Results do not establish browser behavior, server configuration, or root cause.',
    fields: [
      { id: 'reports', label: 'CSP reports', type: 'textarea', placeholder: 'Paste one JSON report, a JSON array, or one JSON report per line', help: 'Accepted shapes include {"csp-report": {...}}, a Reporting API body, a JSON array, or JSON Lines.' },
      { id: 'redaction', label: 'Additional fields to redact', type: 'text', placeholder: 'tenant,account-id,custom-secret', help: 'Comma-separated field names. Common sensitive names such as token, cookie, email, password, and secret are redacted by default.' }
    ],
    run: analyze
  };
})();
