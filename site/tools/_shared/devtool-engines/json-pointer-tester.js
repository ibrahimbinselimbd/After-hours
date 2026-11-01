(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_JSON_CHARS = 1024 * 1024;
  const MAX_POINTER_CHARS = 4096;
  const MAX_TOKENS = 512;

  function display(value) {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (_) { return String(value); }
  }

  function decodeToken(raw, index) {
    let decoded = '';
    for (let i = 0; i < raw.length; i += 1) {
      if (raw[i] !== '~') {
        decoded += raw[i];
      } else if (i + 1 >= raw.length) {
        throw new Error(`Token ${index + 1} contains a trailing "~" escape.`);
      } else {
        const escape = raw[i + 1];
        if (escape !== '0' && escape !== '1') {
          throw new Error(`Token ${index + 1} contains invalid escape "~${escape}"; only ~0 and ~1 are valid.`);
        }
        decoded += escape === '0' ? '~' : '/';
        i += 1;
      }
    }
    return decoded;
  }

  function formatPath(tokens) {
    return tokens.length ? `/${tokens.map(token => token.raw).join('/')}` : '(document root)';
  }

  function run(values) {
    const source = String(values && values.document_json != null ? values.document_json : '');
    const pointer = String(values && values.pointer != null ? values.pointer : '');

    if (!source.trim()) return 'Input error: paste a JSON document.';
    if (source.length > MAX_JSON_CHARS) {
      return `Input error: JSON document exceeds the ${MAX_JSON_CHARS.toLocaleString()} character limit.`;
    }
    if (pointer.length > MAX_POINTER_CHARS) {
      return `Input error: JSON Pointer exceeds the ${MAX_POINTER_CHARS.toLocaleString()} character limit.`;
    }

    let document;
    try {
      document = JSON.parse(source);
    } catch (error) {
      return `JSON parse error: ${error && error.message ? error.message : 'invalid JSON'}`;
    }

    if (pointer !== '' && pointer[0] !== '/') {
      return 'Pointer error: an RFC 6901 pointer is empty for the root, otherwise it must begin with /. No segment was resolved.';
    }

    const rawTokens = pointer === '' ? [] : pointer.slice(1).split('/');
    if (rawTokens.length > MAX_TOKENS) {
      return `Pointer error: ${rawTokens.length} segments exceed the ${MAX_TOKENS}-segment limit.`;
    }

    const tokens = [];
    try {
      rawTokens.forEach((raw, index) => tokens.push({ raw, value: decodeToken(raw, index) }));
    } catch (error) {
      return `Pointer error at ${formatPath(tokens)}: ${error.message}`;
    }

    let current = document;
    const resolved = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      const step = `segment ${i + 1} (${JSON.stringify(token.value)})`;

      if (Array.isArray(current)) {
        if (token.value === '-') {
          return `First failing ${step}: "-" is the append token used by JSON Patch, not a readable JSON Pointer array index. It cannot resolve an existing value.`;
        }
        if (!/^(0|[1-9][0-9]*)$/.test(token.value)) {
          return `First failing ${step}: array indices must be 0 or a non-zero decimal integer; ${JSON.stringify(token.value)} is invalid.`;
        }
        const index = Number(token.value);
        if (!Number.isSafeInteger(index) || index >= current.length) {
          return `First failing ${step}: array index ${JSON.stringify(token.value)} is outside the array (length ${current.length}).`;
        }
        current = current[index];
      } else if (current !== null && typeof current === 'object') {
        if (!Object.prototype.hasOwnProperty.call(current, token.value)) {
          return `First failing ${step}: object member ${JSON.stringify(token.value)} does not exist at ${formatPath(resolved)}.`;
        }
        current = current[token.value];
      } else {
        return `First failing ${step}: cannot traverse ${typeof current} at ${formatPath(resolved)}; an object or array was required.`;
      }
      resolved.push(token);
    }

    const trace = tokens.length
      ? tokens.map((token, index) => `${index + 1}. raw ${JSON.stringify(token.raw)} -> decoded ${JSON.stringify(token.value)}`).join('\n')
      : 'Root pointer: no segments; the whole JSON document is selected.';
    const result = display(current);
    return [
      'Resolved successfully.',
      `Pointer: ${pointer === '' ? '(empty root pointer)' : pointer}`,
      `Segments resolved: ${tokens.length}`,
      '',
      'Token trace:',
      trace,
      '',
      `Selected value: ${result}`,
      '',
      'Caveats: JSON.parse keeps the last occurrence when an object contains duplicate member names, so this tool cannot identify or preserve duplicate-key occurrences. The "-" append token is not a readable location and is reported as a failure rather than appending.'
    ].join('\n');
  }

  window.AHDevToolEngines['json-pointer-tester'] = {
    title: 'JSON Pointer (RFC 6901) Tester',
    description: 'Resolve a JSON Pointer locally, token by token, with RFC 6901 escape decoding, strict array-index checks, and the first failing segment explained. Inputs stay in this browser; duplicate JSON object keys are subject to JSON.parse last-key-wins behavior, and the JSON Patch append token (-) is not readable.',
    limitations: 'Local JSON only, capped at 1 MiB and 512 pointer segments (pointer text capped at 4,096 characters). It does not inspect duplicate-key occurrences because standard JSON.parse collapses them, and it does not treat the JSON Patch append token (-) as a valid readable pointer location. No remote or server checks are performed.',
    fields: [
      { id: 'document_json', label: 'JSON document', type: 'textarea', placeholder: '{"user":{"name":"Ada"},"items":["one","two"]}', help: 'Paste one JSON value. Maximum 1 MiB.' },
      { id: 'pointer', label: 'JSON Pointer', type: 'text', placeholder: '/user/name', help: 'Use an empty value for the document root; otherwise begin with /. Escapes are ~1 for / and ~0 for ~.' }
    ],
    run
  };
})();
