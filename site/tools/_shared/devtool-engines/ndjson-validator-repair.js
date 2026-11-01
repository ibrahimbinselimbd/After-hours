(() => {
  'use strict';

  const MAX_INPUT_CHARS = 1_000_000;
  const MAX_LINES = 10_000;
  const MAX_LINE_CHARS = 256_000;

  const engine = {
    title: 'NDJSON Validator & Repair Preview',
    description: 'Validate JSON Lines one record at a time, inspect line-numbered diagnostics, and preview only high-confidence trailing-comma repairs without silently changing your data. Everything runs locally in this browser.',
    limitations: 'This is a bounded browser-local check, not a full NDJSON pipeline or schema validator. It accepts one pasted text input up to 1,000,000 characters and 10,000 physical lines. Repair previews are intentionally conservative: only a trailing comma immediately before a closing object/array delimiter is proposed when the candidate parses; comments, single quotes, unquoted keys, concatenated JSON, and other ambiguous cases are quarantined rather than rewritten. JSON duplicate-key behavior follows the browser JSON parser.',
    fields: [
      {
        id: 'ndjson',
        label: 'NDJSON / JSON Lines input',
        type: 'textarea',
        placeholder: '{"event":"ok"}\n{"count":2,}\nnot json',
        help: 'Paste one JSON value per physical line. No files or network requests are used.'
      },
      {
        id: 'blankLinePolicy',
        label: 'Blank-line policy',
        type: 'text',
        placeholder: 'ignore (default), report, or invalid',
        help: 'ignore skips blank lines; report records them as notices; invalid quarantines them as invalid rows.'
      },
      {
        id: 'repairMode',
        label: 'Repair preview',
        type: 'text',
        placeholder: 'preview (default) or off',
        help: 'Preview suggests only a parse-confirmed trailing-comma repair. It never changes the supplied input.'
      }
    ],

    run(values) {
      const input = String(values && values.ndjson != null ? values.ndjson : '');
      const policy = String(values && values.blankLinePolicy != null ? values.blankLinePolicy : '').trim().toLowerCase() || 'ignore';
      const repairMode = String(values && values.repairMode != null ? values.repairMode : '').trim().toLowerCase() || 'preview';

      if (policy !== 'ignore' && policy !== 'report' && policy !== 'invalid') {
        return 'Input error: blankLinePolicy must be “ignore”, “report”, or “invalid”.';
      }
      if (repairMode !== 'preview' && repairMode !== 'off') {
        return 'Input error: repairMode must be “preview” or “off”.';
      }
      if (!input.trim()) return 'No input supplied. Paste NDJSON with one JSON value per line.';
      if (input.length > MAX_INPUT_CHARS) {
        return `Input is too large (${input.length.toLocaleString()} characters). The browser-local limit is ${MAX_INPUT_CHARS.toLocaleString()} characters.`;
      }

      const lines = input.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
      if (lines.length > MAX_LINES) {
        return `Input has ${lines.length.toLocaleString()} physical lines. The browser-local limit is ${MAX_LINES.toLocaleString()} lines.`;
      }

      let valid = 0;
      let blank = 0;
      let invalid = 0;
      const diagnostics = [];
      const repairs = [];
      const quarantine = [];

      lines.forEach((raw, index) => {
        const lineNumber = index + 1;
        if (raw.length > MAX_LINE_CHARS) {
          invalid++;
          const message = `line ${lineNumber}: exceeds the ${MAX_LINE_CHARS.toLocaleString()}-character per-line limit`;
          diagnostics.push(`- ${message}`);
          quarantine.push(`line ${lineNumber}: ${raw.slice(0, 120)}${raw.length > 120 ? '…' : ''} [too long]`);
          return;
        }

        const trimmed = raw.trim();
        if (!trimmed) {
          blank++;
          if (policy === 'ignore') diagnostics.push(`- line ${lineNumber}: blank (ignored)`);
          else if (policy === 'report') diagnostics.push(`- line ${lineNumber}: blank (reported; not a record)`);
          else {
            invalid++;
            diagnostics.push(`- line ${lineNumber}: blank (invalid under selected policy)`);
            quarantine.push(`line ${lineNumber}: [blank row]`);
          }
          return;
        }

        try {
          JSON.parse(trimmed);
          valid++;
          diagnostics.push(`- line ${lineNumber}: valid JSON value`);
          return;
        } catch (error) {
          invalid++;
          const reason = error && error.message ? error.message.replace(/\s+/g, ' ').trim() : 'JSON parse failed';
          let repaired = null;
          if (repairMode === 'preview') repaired = previewTrailingCommaRepair(trimmed);
          if (repaired) {
            repairs.push(`line ${lineNumber}: preview only\n  before: ${trimmed}\n  after:  ${repaired}`);
            diagnostics.push(`- line ${lineNumber}: invalid as supplied; high-confidence trailing-comma repair preview available`);
          } else {
            diagnostics.push(`- line ${lineNumber}: invalid JSON (${reason})`);
            quarantine.push(`line ${lineNumber}: ${trimmed.slice(0, 240)}${trimmed.length > 240 ? '…' : ''} [quarantined; no unambiguous repair]`);
          }
        }
      });

      const output = [
        'NDJSON VALIDATION REPORT',
        '=========================',
        `Records: ${lines.length} physical lines | valid: ${valid} | blank: ${blank} | invalid: ${invalid}`,
        `Blank-line policy: ${policy} | repair preview: ${repairMode}`,
        '',
        'LINE DIAGNOSTICS',
        ...diagnostics
      ];
      if (repairs.length) {
        output.push('', 'HIGH-CONFIDENCE REPAIR PREVIEWS (NOT APPLIED)', '-----------------------------------------------', ...repairs,
          'These are suggestions only. Review and apply them outside this tool if appropriate.');
      } else {
        output.push('', 'HIGH-CONFIDENCE REPAIR PREVIEWS', '--------------------------------', 'None found. No ambiguous repair was proposed.');
      }
      output.push('', 'QUARANTINE', '-----------');
      if (quarantine.length) output.push(...quarantine);
      else output.push('None.');
      output.push('', 'Privacy note: input was processed locally; no server or remote check was performed.');
      return { text: output.join('\n'), filename: 'ndjson-validation-report.txt', mime: 'text/plain;charset=utf-8', warnings: invalid ? ['Invalid or policy-rejected rows are listed in QUARANTINE or need review in the repair-preview section.'] : [] };
    }
  };

  function previewTrailingCommaRepair(text) {
    // This deliberately targets only comma + optional whitespace immediately before ] or }.
    // A candidate is accepted only if JSON.parse confirms it, avoiding guessed rewrites.
    if (!/[},]\s*$/.test(text) || !/,[\t ]*[}\]]$/.test(text)) return null;
    const candidate = text.replace(/,([\t ]*)([}\]])$/, '$1$2');
    try {
      JSON.parse(candidate);
      return candidate;
    } catch (_) {
      return null;
    }
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['ndjson-validator-repair'] = engine;
})();
