(() => {
  'use strict';

  const MAX_INPUT = 256 * 1024;
  const MAX_LINES = 2000;
  const NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
  const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
  const SENSITIVE_NAME_RE = /(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[-_]?key|token|secret|password|passwd|credential|signature|private[-_]?key|access[-_]?key)/i;

  function display(value) {
    return String(value).replace(/[\r\n\t]/g, ' ').trim();
  }

  function run(values) {
    const raw = String(values && values.rawHeaders || '');
    if (!raw.trim()) {
      return 'No header text provided. Paste one header per line in name: value form.';
    }
    if (raw.length > MAX_INPUT) {
      return `Input exceeds the ${MAX_INPUT.toLocaleString()} character limit; nothing was parsed.`;
    }

    const lines = raw.split(/\r\n|\n|\r/);
    if (lines.length > MAX_LINES) {
      return `Input contains ${lines.length.toLocaleString()} lines; the limit is ${MAX_LINES.toLocaleString()}. Nothing was parsed.`;
    }

    const entries = [];
    const invalid = [];
    const sensitive = [];
    const byName = Object.create(null);
    const casing = Object.create(null);

    lines.forEach((line, index) => {
      const lineNo = index + 1;
      if (!line.trim()) return;
      const colon = line.indexOf(':');
      if (colon < 1) {
        invalid.push(`line ${lineNo}: expected name: value`);
        return;
      }
      const name = line.slice(0, colon);
      const value = line.slice(colon + 1);
      if (name !== name.trim()) {
        invalid.push(`line ${lineNo}: whitespace is not allowed around the header name`);
        return;
      }
      if (!NAME_RE.test(name)) {
        invalid.push(`line ${lineNo}: invalid header name ${JSON.stringify(display(name))}`);
        return;
      }
      if (CONTROL_RE.test(value)) {
        invalid.push(`line ${lineNo}: control character in value`);
        return;
      }
      const key = name.toLowerCase();
      const normalizedValue = value.trim();
      const entry = { lineNo, name, value: normalizedValue, key };
      entries.push(entry);
      (byName[key] || (byName[key] = [])).push(entry);
      (casing[key] || (casing[key] = Object.create(null)))[name] = true;
      if (SENSITIVE_NAME_RE.test(name)) {
        sensitive.push(`line ${lineNo} ${name}: value withheld (heuristic sensitive-header match; length ${normalizedValue.length})`);
      }
    });

    const duplicateGroups = Object.keys(byName).filter(key => byName[key].length > 1);
    const casingVariants = Object.keys(casing).filter(key => Object.keys(casing[key]).length > 1);
    const out = [];
    out.push('HTTP Header Inspector (local text analysis)');
    out.push(`Parsed ${entries.length} header line${entries.length === 1 ? '' : 's'} from ${lines.length} input line${lines.length === 1 ? '' : 's'}.`);
    out.push('');
    out.push('Diagnostics');
    if (!invalid.length && !duplicateGroups.length && !casingVariants.length && !sensitive.length) {
      out.push('- No duplicate names, casing variants, invalid lines, or heuristic sensitive-header matches found.');
    } else {
      if (invalid.length) {
        out.push(`- Invalid lines (${invalid.length}):`);
        invalid.forEach(item => out.push(`  - ${item}`));
      }
      if (duplicateGroups.length) {
        out.push(`- Duplicate names (${duplicateGroups.length}):`);
        duplicateGroups.forEach(key => out.push(`  - ${key}: lines ${byName[key].map(item => item.lineNo).join(', ')}`));
      }
      if (casingVariants.length) {
        out.push(`- Casing variants (${casingVariants.length}):`);
        casingVariants.forEach(key => out.push(`  - ${key}: ${Object.keys(casing[key]).join(', ')}`));
      }
      if (sensitive.length) {
        out.push(`- Heuristic sensitive-value matches (${sensitive.length}); values are not displayed:`);
        sensitive.forEach(item => out.push(`  - ${item}`));
      }
    }
    out.push('');
    out.push('Parsed names');
    if (entries.length) entries.forEach(item => out.push(`- line ${item.lineNo}: ${item.name}`));
    else out.push('- None');
    out.push('');
    out.push('Limitations: This only inspects the pasted text. It does not contact a server or determine actual request/response behavior, header validity in a particular deployment, or whether a value is truly a secret. Sensitive matches are heuristics, and blank lines/start lines are ignored.');
    return out.join('\n');
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['http-header-inspector'] = {
    title: 'HTTP Request / Response Header Inspector',
    description: 'Inspect pasted HTTP header text for duplicate names, casing variants, malformed lines, and heuristic sensitive values without contacting a server.',
    limitations: 'Browser-local pasted-text analysis only; it does not test server behavior or prove that any value is a secret. Blank lines and an optional start line are ignored. Inputs are capped at 256 KiB and 2,000 lines.',
    fields: [{
      id: 'rawHeaders',
      label: 'Raw request or response headers',
      type: 'textarea',
      placeholder: 'Content-Type: application/json\nAuthorization: Bearer example\nX-Trace-Id: 123',
      help: 'Paste one header per line as name: value. An HTTP start line may be included and will be reported as non-header text.'
    }],
    run
  };
})();
