(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_CHARS = 500000;
  const MAX_LOGICAL_RECORDS = 10000;

  function physicalLines(source) {
    const lines = String(source).replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
    return lines.map((text, i) => ({ number: i + 1, text }));
  }

  function hasOddTrailingBackslashes(text) {
    let count = 0;
    for (let i = text.length - 1; i >= 0 && text[i] === '\\'; i--) count++;
    return count % 2 === 1;
  }

  function buildLogicalRecords(source, warnings) {
    const lines = physicalLines(source);
    const records = [];
    for (let i = 0; i < lines.length;) {
      const start = lines[i].number;
      let raw = lines[i].text;
      const physical = [start];
      while (hasOddTrailingBackslashes(raw) && i + 1 < lines.length) {
        raw = raw.slice(0, -1);
        i++;
        physical.push(lines[i].number);
        raw += lines[i].text.replace(/^\s+/, '');
      }
      if (hasOddTrailingBackslashes(raw) && i + 1 >= lines.length) {
        warnings.push(`Line ${start}: trailing continuation backslash has no following physical line.`);
      }
      records.push({ start, end: physical[physical.length - 1], physical, raw });
      i++;
    }
    return records;
  }

  function isComment(raw) {
    return /^[\t ]*[#!]/.test(raw);
  }

  function findSeparator(raw) {
    let escaped = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '=' || ch === ':' || /\s/.test(ch)) return i;
    }
    return -1;
  }

  function parseKeyValue(raw) {
    const first = findSeparator(raw);
    if (first < 0) return { key: raw, value: '' };
    let keyEnd = first;
    let valueStart = first;
    if (/\s/.test(raw[first])) {
      while (keyEnd > 0 && /\s/.test(raw[keyEnd - 1])) keyEnd--;
      while (valueStart < raw.length && /\s/.test(raw[valueStart])) valueStart++;
      if (raw[valueStart] === '=' || raw[valueStart] === ':') valueStart++;
    } else {
      valueStart++;
    }
    while (valueStart < raw.length && /\s/.test(raw[valueStart])) valueStart++;
    return { key: raw.slice(0, keyEnd), value: raw.slice(valueStart) };
  }

  function decodeEscapes(input, warnings, context) {
    let out = '';
    for (let i = 0; i < input.length; i++) {
      if (input[i] !== '\\') { out += input[i]; continue; }
      if (i + 1 >= input.length) { out += '\\'; continue; }
      const next = input[++i];
      const simple = { t: '\t', n: '\n', r: '\r', f: '\f' };
      if (simple[next] !== undefined) { out += simple[next]; continue; }
      if (next === 'u') {
        const hex = input.slice(i + 1, i + 5);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) { out += String.fromCharCode(parseInt(hex, 16)); i += 4; }
        else {
          warnings.push(`${context}: malformed Unicode escape \\u${hex}; retained literally.`);
          out += '\\u';
        }
        continue;
      }
      // java.util.Properties treats an unrecognised escaped character as that character.
      out += next;
    }
    return out;
  }

  function escapeJava(input) {
    return String(input).replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\f/g, '\\f').replace(/([:=#!])/g, '\\$1').replace(/^ /, '\\ ');
  }

  function inspect(source) {
    const warnings = [];
    const records = buildLogicalRecords(source, warnings);
    const entries = [];
    const latest = Object.create(null);
    for (const record of records) {
      if (entries.length >= MAX_LOGICAL_RECORDS) {
        warnings.push(`Stopped after ${MAX_LOGICAL_RECORDS.toLocaleString()} logical records.`);
        break;
      }
      if (/^\s*$/.test(record.raw) || isComment(record.raw)) continue;
      const parts = parseKeyValue(record.raw);
      const key = decodeEscapes(parts.key, warnings, `Lines ${record.start}-${record.end} key`);
      const value = decodeEscapes(parts.value, warnings, `Lines ${record.start}-${record.end} value`);
      const duplicate = latest[key] !== undefined;
      const entry = { key, value, start: record.start, end: record.end, physical: record.physical.join(','), duplicate };
      if (duplicate) entries[latest[key]].overwrittenBy = record.start;
      latest[key] = entries.length;
      entries.push(entry);
    }
    const lines = ['JAVA PROPERTIES INSPECTOR', `Logical records: ${entries.length}`, '', 'TRACE (later duplicate keys override earlier values):'];
    if (!entries.length) lines.push('(no property records)');
    for (const e of entries) {
      const span = e.start === e.end ? String(e.start) : `${e.start}-${e.end}`;
      const duplicate = e.duplicate ? ' DUPLICATE' : '';
      const overwritten = e.overwrittenBy ? ` (overwritten by line ${e.overwrittenBy})` : '';
      lines.push(`[${span}] ${JSON.stringify(e.key)} = ${JSON.stringify(e.value)}${duplicate}${overwritten} | physical: ${e.physical}`);
    }
    if (warnings.length) lines.push('', 'DIAGNOSTICS:', ...warnings.map(w => `- ${w}`));
    return { text: lines.join('\n'), warnings };
  }

  function run(values) {
    values = values || {};
    const mode = String(values.mode || 'inspect').trim().toLowerCase();
    const source = String(values.source || '');
    if (source.length > MAX_CHARS) return { text: `Input is too large (${source.length.toLocaleString()} characters). Limit: ${MAX_CHARS.toLocaleString()} characters.`, warnings: ['No parsing was performed.'] };
    if (mode === 'inspect') return inspect(source);
    if (mode === 'escape') return { text: escapeJava(source), filename: 'escaped.properties', mime: 'text/plain;charset=utf-8' };
    if (mode === 'unescape') {
      const warnings = [];
      const text = decodeEscapes(source, warnings, 'Input');
      return { text, filename: 'unescaped.txt', mime: 'text/plain;charset=utf-8', warnings };
    }
    return { text: 'Unknown mode. Use “inspect”, “escape”, or “unescape”.', warnings: ['No parsing was performed.'] };
  }

  window.AHDevToolEngines['java-properties-inspector'] = {
    title: 'Java .properties Escape / Unescape & Inspector',
    description: 'Inspect Java-style properties locally: continuations, separators, escapes, Unicode escapes, duplicate keys, and physical-to-logical line trace. Exact JVM parity is not claimed for obscure encodings or edge cases.',
    limitations: 'Bounded to 500,000 input characters and 10,000 logical records. This is a browser-local diagnostic approximation of java.util.Properties; encoding, malformed-input, Unicode-surrogate, and other obscure Java SE edge cases may differ from a particular JVM. No remote or server checks are performed.',
    fields: [
      { id: 'mode', label: 'Mode', type: 'text', placeholder: 'inspect', help: 'Use inspect, escape, or unescape. Inspect is the default.' },
      { id: 'source', label: 'Properties or text', type: 'textarea', placeholder: 'name = Ada\\npath: C:\\\\tmp\\\ncontinued = first\\\\\n  second', help: 'Paste bounded local text. Inspect reports logical records and source physical-line spans.' }
    ],
    run
  };
})();
