(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_JSON_CHARS = 200000;
  const MAX_QUERY_CHARS = 256;
  const MAX_STEPS = 32;
  const MAX_VISITS = 10000;
  const MAX_MATCHES = 1000;

  const fail = message => { throw new Error(message); };

  function parseQuery(input) {
    const query = String(input ?? '').trim();
    if (!query) fail('Enter a JSONPath query.');
    if (query.length > MAX_QUERY_CHARS) fail(`The query is too long. Limit: ${MAX_QUERY_CHARS} characters.`);
    if (query[0] !== '$') fail('This tester requires a query beginning with the root symbol $.');

    const steps = [];
    let i = 1;
    const skipSpaces = () => { while (/\s/.test(query[i] || '')) i++; };
    while (i < query.length) {
      if (steps.length >= MAX_STEPS) fail(`The query has too many steps. Limit: ${MAX_STEPS}.`);
      if (query[i] === '.') {
        i++;
        if (query[i] === '.') fail('Recursive descent (..) is not supported by this limited dialect.');
        if (query[i] === '*') { steps.push({kind: 'wildcard'}); i++; continue; }
        const start = i;
        if (!/[A-Za-z_$]/.test(query[i] || '')) fail(`Expected an identifier after . at character ${i + 1}.`);
        i++;
        while (/[A-Za-z0-9_$]/.test(query[i] || '')) i++;
        steps.push({kind: 'key', key: query.slice(start, i)});
        continue;
      }
      if (query[i] === '[') {
        i++;
        skipSpaces();
        if (query[i] === '*') {
          i++; skipSpaces();
          if (query[i] !== ']') fail(`Expected ] after wildcard at character ${i + 1}.`);
          i++; steps.push({kind: 'wildcard'}); continue;
        }
        if (query[i] === '"' || query[i] === "'") {
          const quote = query[i++];
          let raw = quote;
          let escaped = false;
          while (i < query.length) {
            const ch = query[i++];
            raw += ch;
            if (!escaped && ch === quote) break;
            escaped = !escaped && ch === '\\';
            if (ch !== '\\') escaped = false;
          }
          if (raw[raw.length - 1] !== quote) fail('Unclosed quoted key in bracket notation.');
          let key;
          if (quote === '"') {
            try { key = JSON.parse(raw); } catch (_) { fail('Invalid JSON escape in quoted bracket key.'); }
          } else {
            key = raw.slice(1, -1).replace(/\\([\\'])/g, '$1');
            if (key.includes('\\')) fail('Single-quoted keys only support escaped backslash or quote.');
          }
          skipSpaces();
          if (query[i] !== ']') fail(`Expected ] after quoted key at character ${i + 1}.`);
          i++; steps.push({kind: 'key', key}); continue;
        }
        const start = i;
        while (/\d/.test(query[i] || '')) i++;
        if (start === i) fail(`Expected *, an array index, or a quoted key inside brackets at character ${start + 1}.`);
        const index = Number(query.slice(start, i));
        skipSpaces();
        if (query[i] !== ']') fail(`Expected ] after array index at character ${i + 1}.`);
        i++; steps.push({kind: 'index', index}); continue;
      }
      fail(`Unexpected character “${query[i]}” at character ${i + 1}. Use the supported JSONPath subset.`);
    }
    return steps;
  }

  function pathFor(path, key) {
    if (typeof key === 'number') return `${path}[${key}]`;
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
  }

  function evaluate(document, steps) {
    let current = [{value: document, path: '$'}];
    let visits = 0;
    for (const step of steps) {
      const next = [];
      for (const item of current) {
        visits++;
        if (visits > MAX_VISITS) fail(`Evaluation stopped at ${MAX_VISITS} visited nodes. Simplify the query or use a smaller JSON document.`);
        if (step.kind === 'key') {
          if (item.value !== null && typeof item.value === 'object' && Object.prototype.hasOwnProperty.call(item.value, step.key)) {
            next.push({value: item.value[step.key], path: pathFor(item.path, step.key)});
          }
        } else if (step.kind === 'index') {
          if (Array.isArray(item.value) && step.index < item.value.length) next.push({value: item.value[step.index], path: pathFor(item.path, step.index)});
        } else if (step.kind === 'wildcard') {
          if (Array.isArray(item.value)) {
            for (let n = 0; n < item.value.length; n++) next.push({value: item.value[n], path: pathFor(item.path, n)});
          } else if (item.value !== null && typeof item.value === 'object') {
            for (const key of Object.keys(item.value)) next.push({value: item.value[key], path: pathFor(item.path, key)});
          }
        }
        if (next.length > MAX_MATCHES) fail(`The result is too large. Limit: ${MAX_MATCHES} matches.`);
      }
      current = next;
    }
    return {matches: current, visits};
  }

  function formatValue(value) {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  }

  function run(values) {
    const jsonText = String(values && values.json || '').trim();
    const queryText = String(values && values.query || '').trim();
    if (!jsonText) return 'Input error: paste a JSON object or array to test.';
    if (jsonText.length > MAX_JSON_CHARS) return `Input error: the JSON payload is too large. Limit: ${MAX_JSON_CHARS} characters.`;
    let document;
    try { document = JSON.parse(jsonText); }
    catch (error) { return `JSON parse error: ${error && error.message ? error.message : 'invalid JSON'}`; }
    let steps;
    try { steps = parseQuery(queryText); }
    catch (error) { return `Query error: ${error.message}`; }
    try {
      const result = evaluate(document, steps);
      const dialect = 'Limited JSONPath dialect: $, .name, ["key"], [index], and wildcards .* / [*].';
      if (!result.matches.length) {
        return `${dialect}\nNo matches for ${queryText}. The query was valid, but no selected key/index exists at the requested path.`;
      }
      const lines = result.matches.map((match, index) => `${index + 1}. ${match.path} = ${formatValue(match.value)}`);
      return `${dialect}\n${result.matches.length} match${result.matches.length === 1 ? '' : 'es'} (${result.visits} node visit${result.visits === 1 ? '' : 's'}):\n${lines.join('\n')}`;
    } catch (error) {
      return `Evaluation error: ${error.message}`;
    }
  }

  window.AHDevToolEngines['jsonpath-query-tester'] = {
    title: 'JSONPath Query Tester',
    description: 'Test pasted local JSON with a clearly labelled limited JSONPath dialect and inspect every match with its path and value. This is not full RFC 9535 parity.',
    limitations: `Browser-local only; accepts JSON up to ${MAX_JSON_CHARS} characters and queries up to ${MAX_QUERY_CHARS} characters. Supports $, dot keys, quoted bracket keys, array indexes, and .* / [*] wildcards only. No filters, slices, recursive descent, unions, functions, script expressions, or full RFC 9535/legacy JSONPath compatibility claim. Evaluation is capped at ${MAX_VISITS} node visits and ${MAX_MATCHES} matches.`,
    fields: [
      {id: 'json', label: 'JSON input', type: 'textarea', placeholder: '{"users":[{"name":"Ada"}]}', help: `Paste local JSON only (maximum ${MAX_JSON_CHARS} characters).`},
      {id: 'query', label: 'JSONPath query', type: 'text', placeholder: '$.users[*].name', help: 'Supported: $, .name, ["key"], [0], .* and [*]. Filters and recursive descent are intentionally unsupported.'}
    ],
    run
  };
})();
