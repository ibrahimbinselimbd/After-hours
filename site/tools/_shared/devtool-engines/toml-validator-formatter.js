(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_CHARS = 200000;
  const MAX_LINES = 10000;
  const MAX_DEPTH = 32;

  const result = (text, warnings) => ({
    text,
    filename: 'formatted.toml',
    mime: 'text/plain;charset=utf-8',
    ...(warnings && warnings.length ? { warnings } : {})
  });

  const diag = (line, col, message) => `line ${line}, column ${col}: ${message}`;

  function stripComment(line) {
    let quote = null;
    let escaped = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quote === '"') {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') quote = null;
      } else if (quote === "'") {
        if (ch === "'") {
          if (line[i + 1] === "'") i += 1;
          else quote = null;
        }
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '#') return line.slice(0, i);
    }
    return line;
  }

  function splitTopLevel(source, separator, line, baseCol) {
    const parts = [];
    let start = 0, depth = 0, quote = null, escaped = false;
    for (let i = 0; i < source.length; i += 1) {
      const ch = source[i];
      if (quote === '"') {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') quote = null;
      } else if (quote === "'") {
        if (ch === "'") {
          if (source[i + 1] === "'") i += 1;
          else quote = null;
        }
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '[' || ch === '{') depth += 1;
      else if (ch === ']' || ch === '}') depth -= 1;
      else if (ch === separator && depth === 0) {
        parts.push(source.slice(start, i).trim());
        start = i + 1;
      }
      if (depth < 0) throw new Error(diag(line, baseCol + i, 'unexpected closing bracket'));
    }
    if (quote) throw new Error(diag(line, baseCol + source.length, 'unterminated string'));
    if (depth !== 0) throw new Error(diag(line, baseCol + source.length, 'unbalanced brackets'));
    parts.push(source.slice(start).trim());
    return parts;
  }

  function parseBasicString(raw, line, col) {
    if (raw[0] === "'") {
      if (raw.length < 2 || raw[raw.length - 1] !== "'") throw new Error(diag(line, col, 'unterminated literal string'));
      return raw.slice(1, -1).replace(/''/g, "'");
    }
    if (raw[0] !== '"' || raw[raw.length - 1] !== '"') throw new Error(diag(line, col, 'invalid string'));
    try {
      return JSON.parse(raw);
    } catch (_) {
      throw new Error(diag(line, col, 'invalid basic string escape (supported escapes: \", \\, \\/, \\b, \\f, \\n, \\r, \\t, \\uXXXX)'));
    }
  }

  function parseValue(raw, line, col, depth) {
    if (depth > MAX_DEPTH) throw new Error(diag(line, col, 'value nesting exceeds the complexity limit'));
    const s = raw.trim();
    if (!s) throw new Error(diag(line, col, 'missing value'));
    if (s[0] === '"' || s[0] === "'") return parseBasicString(s, line, col);
    if (s[0] === '[') {
      if (s[s.length - 1] !== ']') throw new Error(diag(line, col, 'unterminated array'));
      const inside = s.slice(1, -1).trim();
      if (!inside) return [];
      const values = splitTopLevel(inside, ',', line, col + 1);
      if (values.some(v => !v)) throw new Error(diag(line, col, 'array contains an empty element'));
      return values.map(v => parseValue(v, line, col + s.indexOf(v), depth + 1));
    }
    if (s[0] === '{') {
      if (s[s.length - 1] !== '}') throw new Error(diag(line, col, 'unterminated inline table'));
      const obj = {};
      const inside = s.slice(1, -1).trim();
      if (!inside) return obj;
      for (const part of splitTopLevel(inside, ',', line, col + 1)) {
        const eq = findEquals(part);
        if (eq < 1) throw new Error(diag(line, col, 'inline-table entry must be key = value'));
        const key = parseKeyPath(part.slice(0, eq), line, col);
        if (key.length !== 1 || Object.prototype.hasOwnProperty.call(obj, key[0])) throw new Error(diag(line, col, 'duplicate or dotted inline-table key'));
        obj[key[0]] = parseValue(part.slice(eq + 1), line, col + eq + 1, depth + 1);
      }
      return obj;
    }
    if (/^(true|false)$/.test(s)) return s === 'true';
    if (/^[+-]?0x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*$/.test(s)) return parseInt(s.replace(/_/g, ''), 16);
    if (/^[+-]?0o[0-7](?:_?[0-7])*$/.test(s)) return parseInt(s.replace(/_/g, ''), 8);
    if (/^[+-]?0b[01](?:_?[01])*$/.test(s)) return parseInt(s.replace(/_/g, ''), 2);
    if (/^[+-]?(?:\d(?:_?\d)*)$/.test(s)) return Number(s.replace(/_/g, ''));
    if (/^[+-]?(?:\d(?:_?\d)*)?\.\d(?:_?\d)*(?:[eE][+-]?\d(?:_?\d)*)?$/.test(s) || /^[+-]?\d(?:_?\d)*(?:[eE][+-]?\d(?:_?\d)*)$/.test(s)) {
      const n = Number(s.replace(/_/g, ''));
      if (Number.isFinite(n)) return n;
    }
    if (/^\d{4}-\d\d-\d\d(?:[Tt ]\d\d:\d\d:\d\d(?:\.\d+)?(?:[Zz]|[+-]\d\d:\d\d)?)?$/.test(s) || /^\d\d:\d\d:\d\d(?:\.\d+)?$/.test(s)) return { __tomlDate: s };
    if (/^nan$/i.test(s) || /^[+-]?inf$/i.test(s)) return { __tomlFloat: s };
    throw new Error(diag(line, col, `unsupported or invalid value “${s.slice(0, 40)}”`));
  }

  function findEquals(s) {
    let quote = null, depth = 0, escaped = false;
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i];
      if (quote === '"') { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') quote = null; }
      else if (quote === "'") { if (ch === "'") quote = null; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '[' || ch === '{') depth += 1;
      else if (ch === ']' || ch === '}') depth -= 1;
      else if (ch === '=' && depth === 0) return i;
    }
    return -1;
  }

  function parseKeyPath(raw, line, col) {
    const parts = splitTopLevel(raw.trim(), '.', line, col).map(x => x.trim());
    if (!parts.length || parts.some(x => !x || !(/^(?:[A-Za-z0-9_-]+|"(?:[^"\\]|\\.)*"|'(?:[^']|'')*')$/.test(x)))) throw new Error(diag(line, col, 'invalid key; use bare keys, quoted keys, or dotted keys'));
    return parts.map(x => (x[0] === '"' || x[0] === "'") ? parseBasicString(x, line, col) : x);
  }

  function setPath(root, path, value, line, col, defined) {
    let node = root;
    for (let i = 0; i < path.length - 1; i += 1) {
      const key = path[i];
      if (Object.prototype.hasOwnProperty.call(node, key) && (node[key] === null || typeof node[key] !== 'object' || Array.isArray(node[key]))) throw new Error(diag(line, col, `key “${key}” is already a value, so it cannot contain children`));
      if (!node[key]) node[key] = {};
      node = node[key];
    }
    const last = path[path.length - 1];
    if (Object.prototype.hasOwnProperty.call(node, last) || defined.has(path.join('\u0000'))) throw new Error(diag(line, col, `duplicate definition of “${path.join('.')}”`));
    node[last] = value;
    defined.add(path.join('\u0000'));
  }

  function parseToml(source) {
    if (source.length > MAX_CHARS) throw new Error(`Input exceeds the ${MAX_CHARS.toLocaleString()} character limit.`);
    const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
    if (lines.length > MAX_LINES) throw new Error(`Input exceeds the ${MAX_LINES.toLocaleString()} line limit.`);
    const root = {}, defined = new Set(), order = [], warnings = [];
    let table = [];
    lines.forEach((original, index) => {
      const lineNo = index + 1;
      const clean = stripComment(original).trim();
      if (!clean) return;
      if (clean.slice(0, 2) === '[[' || clean.slice(-2) === ']]') {
        throw new Error(diag(lineNo, 1, 'array-of-tables are outside this bounded subset'));
      }
      if (clean[0] === '[') {
        if (clean[clean.length - 1] !== ']') throw new Error(diag(lineNo, original.indexOf('[') + 1, 'unterminated table header'));
        table = parseKeyPath(clean.slice(1, -1), lineNo, original.indexOf('[') + 2);
        let node = root;
        for (const key of table) {
          if (Object.prototype.hasOwnProperty.call(node, key) && (node[key] === null || typeof node[key] !== 'object' || Array.isArray(node[key]))) throw new Error(diag(lineNo, 1, `table “${table.join('.')}” conflicts with a value`));
          node[key] = node[key] || {};
          node = node[key];
        }
        const marker = `@table:${table.join('\u0000')}`;
        if (defined.has(marker)) throw new Error(diag(lineNo, 1, `duplicate table “${table.join('.')}”`));
        defined.add(marker); order.push({type: 'table', path: table.slice()});
        return;
      }
      const eq = findEquals(clean);
      if (eq < 1) throw new Error(diag(lineNo, Math.max(1, original.search(/\S/) + 1), 'expected key = value'));
      const keyRaw = clean.slice(0, eq).trim();
      const key = parseKeyPath(keyRaw, lineNo, original.indexOf(keyRaw) + 1);
      const value = parseValue(clean.slice(eq + 1), lineNo, original.indexOf('=') + 2, 0);
      const full = table.concat(key);
      setPath(root, full, value, lineNo, original.indexOf(keyRaw) + 1, defined);
      order.push({type: 'value', path: full, value});
    });
    return {root, order, warnings};
  }

  function quoteKey(key) { return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key); }
  function formatString(s) { return JSON.stringify(s); }
  function formatValue(value, indent) {
    if (value && value.__tomlDate) return value.__tomlDate;
    if (value && value.__tomlFloat) return value.__tomlFloat;
    if (typeof value === 'string') return formatString(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'nan';
    if (Array.isArray(value)) return `[${value.map(v => formatValue(v, indent + '  ')).join(', ')}]`;
    if (value && typeof value === 'object') return `{ ${Object.keys(value).map(k => `${quoteKey(k)} = ${formatValue(value[k], indent + '  ')}`).join(', ')} }`;
    return '""';
  }
  function formatToml(parsed) {
    const lines = [], emittedTables = new Set();
    let active = '';
    for (const item of parsed.order) {
      if (item.type === 'table') {
        const name = item.path.join('.');
        if (active) lines.push('');
        lines.push(`[${item.path.map(quoteKey).join('.')}]`); active = name; emittedTables.add(name); continue;
      }
      const parent = item.path.slice(0, -1);
      const parentName = parent.join('.');
      if (parentName !== active) {
        if (parent.length && !emittedTables.has(parentName)) { if (lines.length) lines.push(''); lines.push(`[${parent.map(quoteKey).join('.')}]`); emittedTables.add(parentName); active = parentName; }
      }
      lines.push(`${quoteKey(item.path[item.path.length - 1])} = ${formatValue(item.value, '')}`);
    }
    return lines.join('\n') + (lines.length ? '\n' : '');
  }

  function validateSchema(data, schema) {
    const errors = [];
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return ['Schema must be a JSON object.'];
    const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    const get = path => path.split('.').reduce((v, k) => v && typeof v === 'object' ? v[k] : undefined, data);
    for (const key of required) if (get(String(key)) === undefined) errors.push(`missing required key “${key}”`);
    for (const [path, rule] of Object.entries(properties)) {
      const value = get(path); if (value === undefined) continue;
      const type = rule && rule.type;
      const actual = Array.isArray(value) ? 'array' : (value && value.__tomlDate ? 'datetime' : typeof value);
      if (type && type !== actual && !(type === 'number' && actual === 'number')) errors.push(`“${path}” expected ${type}, got ${actual}`);
    }
    return errors;
  }

  window.AHDevToolEngines['toml-validator-formatter'] = {
    title: 'TOML Validator & Formatter',
    description: 'Validate and format a bounded, browser-local TOML 1.0 subset. Syntax diagnostics are separate from optional schema checks; input is capped at 200,000 characters.',
    limitations: 'Supports common TOML 1.0 strings, numbers, booleans, arrays, inline tables, dates, tables, comments, and dotted keys. It intentionally rejects array-of-tables and multiline strings, does not implement TOML 1.1 additions or every edge case, and does not preserve comments or original whitespace. Schema validation is only a small local JSON schema-like check using properties and required; it is not full JSON Schema or server validation.',
    fields: [
      {id: 'toml', label: 'TOML input', type: 'textarea', placeholder: '[server]\nport = 8080\nenabled = true', help: 'Paste TOML 1.0 subset text; maximum 200,000 characters.'},
      {id: 'schema', label: 'Optional schema JSON', type: 'textarea', placeholder: '{"required":["server.port"],"properties":{"server.port":{"type":"number"}}}', help: 'Optional small schema: {"required":["a.b"],"properties":{"a.b":{"type":"string"}}}.'}
    ],
    run(values) {
      const source = String(values && values.toml || '');
      if (!source.trim()) return result('No TOML input supplied. Paste a TOML 1.0 subset document to validate and format.');
      let parsed;
      try { parsed = parseToml(source); }
      catch (error) { return result(`SYNTAX INVALID\n${error.message || String(error)}\n\nNo formatting or schema validation was attempted.`); }
      const output = [`SYNTAX VALID (bounded TOML 1.0 subset)`, '', 'FORMATTED TOML', '--------------', formatToml(parsed).trimEnd()];
      const schemaText = String(values && values.schema || '').trim();
      if (schemaText) {
        let schema;
        try { schema = JSON.parse(schemaText); }
        catch (error) { output.push('', 'SCHEMA INVALID', `Schema JSON could not be parsed: ${error.message}`); return result(output.join('\n')); }
        const errors = validateSchema(parsed.root, schema);
        output.push('', errors.length ? 'SCHEMA INVALID' : 'SCHEMA VALID (limited local check)');
        if (errors.length) output.push(...errors.map(e => `- ${e}`));
      } else output.push('', 'SCHEMA NOT RUN', 'No optional schema JSON was supplied.');
      return result(output.join('\n'), parsed.warnings);
    }
  };
})();
