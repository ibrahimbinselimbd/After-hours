(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_DOCUMENT_CHARS = 200000;
  const MAX_PATCH_CHARS = 200000;
  const MAX_OPERATIONS = 100;
  const MAX_DEPTH = 40;

  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const display = value => value === undefined ? '(no JSON document value)' : JSON.stringify(value, null, 2);

  function depthOf(value, depth = 0) {
    if (depth > MAX_DEPTH) return depth;
    if (value && typeof value === 'object') {
      const values = Array.isArray(value) ? value : Object.keys(value).map(key => value[key]);
      for (const child of values) {
        const childDepth = depthOf(child, depth + 1);
        if (childDepth > depth) depth = childDepth;
      }
    }
    return depth;
  }

  function parseJson(text, label, limit) {
    const source = String(text == null ? '' : text).trim();
    if (!source) throw new Error(`${label} is empty.`);
    if (source.length > limit) throw new Error(`${label} exceeds the ${limit.toLocaleString()} character limit.`);
    let value;
    try { value = JSON.parse(source); }
    catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
    if (depthOf(value) > MAX_DEPTH) throw new Error(`${label} exceeds the maximum nesting depth of ${MAX_DEPTH}.`);
    return value;
  }

  function pointerTokens(pointer) {
    if (pointer === '') return [];
    if (typeof pointer !== 'string' || pointer[0] !== '/') throw new Error('JSON Pointer must be empty or start with /.');
    return pointer.slice(1).split('/').map((token, index) => {
      if (/~(?![01])/.test(token)) throw new Error(`Invalid JSON Pointer escape in segment ${index + 1}.`);
      return token.replace(/~1/g, '/').replace(/~0/g, '~');
    });
  }

  function arrayIndex(token, length, allowEnd) {
    if (token === '' || !/^0$|^[1-9]\d*$/.test(token)) throw new Error(`Invalid array index “${token}”.`);
    const index = Number(token);
    if (!Number.isSafeInteger(index) || index > length || (!allowEnd && index === length)) throw new Error(`Array index “${token}” is out of range.`);
    return index;
  }

  function parentAndKey(root, pointer, allowEnd) {
    const tokens = pointerTokens(pointer);
    if (!tokens.length) return { parent: null, key: null, tokens };
    let parent = root;
    for (let i = 0; i < tokens.length - 1; i++) {
      const token = tokens[i];
      if (parent === null || typeof parent !== 'object') throw new Error(`Cannot traverse through ${JSON.stringify(token)}; its parent is not an object or array.`);
      if (Array.isArray(parent)) {
        const index = arrayIndex(token, parent.length, false);
        parent = parent[index];
      } else if (Object.prototype.hasOwnProperty.call(parent, token)) parent = parent[token];
      else throw new Error(`Path segment “${token}” does not exist.`);
    }
    return { parent, key: tokens[tokens.length - 1], tokens, allowEnd };
  }

  function getValue(root, pointer) {
    const tokens = pointerTokens(pointer);
    let value = root;
    for (const token of tokens) {
      if (value === null || typeof value !== 'object') throw new Error(`Cannot traverse through “${token}”; its parent is not an object or array.`);
      if (Array.isArray(value)) value = value[arrayIndex(token, value.length, false)];
      else if (Object.prototype.hasOwnProperty.call(value, token)) value = value[token];
      else throw new Error(`Path does not exist at segment “${token}”.`);
    }
    return value;
  }

  function exists(root, pointer) {
    try { getValue(root, pointer); return true; } catch (_) { return false; }
  }

  function setValue(root, pointer, value, replacing) {
    const location = parentAndKey(root, pointer, !replacing);
    if (location.parent === null) return clone(value);
    if (location.parent === null || typeof location.parent !== 'object') throw new Error('The operation path parent is not an object or array.');
    if (Array.isArray(location.parent)) {
      if (location.key === '-') {
        if (replacing) throw new Error('The “-” array position is valid only for add.');
        location.parent.push(clone(value));
      } else {
        const index = arrayIndex(location.key, location.parent.length, !replacing);
        if (replacing) {
          if (index >= location.parent.length) throw new Error(`Array index “${location.key}” does not exist.`);
          location.parent[index] = clone(value);
        } else location.parent.splice(index, 0, clone(value));
      }
    } else {
      if (replacing && !Object.prototype.hasOwnProperty.call(location.parent, location.key)) throw new Error(`Path “${location.key}” does not exist for replace.`);
      location.parent[location.key] = clone(value);
    }
    return root;
  }

  function removeValue(root, pointer) {
    const location = parentAndKey(root, pointer, false);
    if (location.parent === null) return undefined;
    if (location.parent === null || typeof location.parent !== 'object') throw new Error('The remove path parent is not an object or array.');
    if (Array.isArray(location.parent)) {
      const index = arrayIndex(location.key, location.parent.length, false);
      location.parent.splice(index, 1);
    } else if (Object.prototype.hasOwnProperty.call(location.parent, location.key)) delete location.parent[location.key];
    else throw new Error(`Path “${location.key}” does not exist for remove.`);
    return root;
  }

  function deepEqual(a, b) {
    if (Object.is(a, b)) return true;
    if (typeof a !== typeof b || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
    if (typeof a === 'object') {
      const ak = Object.keys(a), bk = Object.keys(b);
      return ak.length === bk.length && ak.every(key => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
    }
    return false;
  }

  function applyOperation(document, operation) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error('Operation must be a JSON object.');
    const op = operation.op;
    if (!['add', 'remove', 'replace', 'move', 'copy', 'test'].includes(op)) throw new Error(`Unsupported operation “${op}”.`);
    if (typeof operation.path !== 'string') throw new Error('Operation path must be a string.');
    if ((op === 'move' || op === 'copy') && typeof operation.from !== 'string') throw new Error(`${op} requires a string from pointer.`);
    let next = clone(document);
    if (op === 'add') next = setValue(next, operation.path, operation.value, false);
    else if (op === 'remove') next = removeValue(next, operation.path);
    else if (op === 'replace') next = setValue(next, operation.path, operation.value, true);
    else if (op === 'test') {
      const actual = getValue(next, operation.path);
      if (!deepEqual(actual, operation.value)) throw new Error(`test failed: expected ${JSON.stringify(operation.value)}, found ${JSON.stringify(actual)}.`);
    } else {
      const moved = getValue(next, operation.from);
      if (op === 'move') {
        if (operation.path === operation.from || operation.path.startsWith(`${operation.from}/`)) throw new Error('move cannot target its source or a descendant of its source.');
        next = removeValue(next, operation.from);
      }
      next = setValue(next, operation.path, moved, false);
    }
    return next;
  }

  const engine = {
    title: 'JSON Patch Builder & Preview',
    description: 'Apply a bounded RFC 6902 operation list to a pasted JSON document and inspect each local result before sending anything elsewhere.',
    limitations: 'Browser-local only: no server-side validation or atomicity is claimed. Supports RFC 6902 add, remove, replace, move, copy, and test with RFC 6901 pointers. Inputs are capped at 200,000 characters, 100 operations, and nesting depth 40; duplicate JSON object keys follow the browser parser’s last-value behavior.',
    fields: [
      { id: 'document', label: 'JSON document', type: 'textarea', placeholder: '{"user":{"name":"Ada"},"tags":[]}', help: 'Paste one JSON value. Maximum 200,000 characters and nesting depth 40.' },
      { id: 'operations', label: 'RFC 6902 operations', type: 'textarea', placeholder: '[{"op":"replace","path":"/user/name","value":"Grace"}]', help: 'Paste a JSON array of up to 100 operations. Paths use JSON Pointer escaping.' }
    ],
    run(values) {
      try {
        const document = parseJson(values && values.document, 'JSON document', MAX_DOCUMENT_CHARS);
        const operations = parseJson(values && values.operations, 'Operations', MAX_PATCH_CHARS);
        if (!Array.isArray(operations)) throw new Error('Operations must be a JSON array.');
        if (operations.length > MAX_OPERATIONS) throw new Error(`Operations exceed the limit of ${MAX_OPERATIONS}.`);
        let current = document;
        const lines = [`Initial document:\n${display(current)}`, '', `Applying ${operations.length} operation${operations.length === 1 ? '' : 's'} locally:`];
        for (let i = 0; i < operations.length; i++) {
          try {
            current = applyOperation(current, operations[i]);
            lines.push(`\n${i + 1}. ${operations[i].op} ${operations[i].path || ''} — succeeded\n${display(current)}`);
          } catch (error) {
            lines.push(`\n${i + 1}. ${operations[i] && operations[i].op ? operations[i].op : 'unknown'} — FAILED: ${error.message}`);
            lines.push('Stopped here. Earlier local changes remain shown; this preview does not claim server-side atomicity.');
            return { text: lines.join('\n'), warnings: ['Preview stopped at the first failed operation; review the partial local result before using the patch.'] };
          }
        }
        lines.push('\nCompleted locally. This is a preview only; no server-side checks or atomicity are provided.');
        return { text: lines.join('\n'), warnings: ['Review the resulting document and operation semantics before sending the patch.'] };
      } catch (error) {
        return { text: `Could not run JSON Patch preview: ${error.message}`, warnings: ['No remote or server-side validation was performed.'] };
      }
    }
  };

  window.AHDevToolEngines['json-patch-preview'] = engine;
})();
