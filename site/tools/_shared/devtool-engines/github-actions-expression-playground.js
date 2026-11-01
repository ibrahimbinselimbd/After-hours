(() => {
  'use strict';

  const MAX_CONTEXT = 12000;
  const MAX_EXPRESSION = 1200;
  const MAX_TOKENS = 300;
  const UNKNOWN = { kind: 'unknown' };
  const UNSUPPORTED_CONTEXTS = new Set(['secrets', 'runner']);
  const KNOWN_CONTEXTS = new Set(['github', 'env', 'vars', 'inputs', 'job', 'steps', 'needs', 'matrix', 'strategy']);

  const isUnknown = value => value === UNKNOWN || (value && value.kind === 'unknown');
  const display = value => {
    if (isUnknown(value)) return 'unknown';
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean' || typeof value === 'number') return String(value);
    try { return JSON.stringify(value); } catch (_) { return String(value); }
  };
  const truthy = value => {
    if (isUnknown(value)) return null;
    if (value === null || value === false || value === 0 || value === '') return false;
    return true;
  };
  const comparable = value => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value === null) return 0;
    return value;
  };

  function tokenize(source) {
    const tokens = [];
    let i = 0;
    while (i < source.length) {
      if (/\s/.test(source[i])) { i++; continue; }
      const two = source.slice(i, i + 2);
      if (['&&', '||', '==', '!=', '>=', '<='].includes(two)) { tokens.push({type: two}); i += 2; continue; }
      const ch = source[i];
      if ('()[],!.<>+'.includes(ch)) { tokens.push({type: ch}); i++; continue; }
      if (ch === "'" || ch === '"') {
        const quote = ch; let value = ''; i++;
        while (i < source.length && source[i] !== quote) {
          if (source[i] === '\\' && i + 1 < source.length) { value += source[i + 1]; i += 2; }
          else { value += source[i++]; }
        }
        if (source[i] !== quote) throw new Error('Unclosed string literal.');
        i++; tokens.push({type: 'literal', value}); continue;
      }
      const number = source.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (number) { tokens.push({type: 'literal', value: Number(number[0])}); i += number[0].length; continue; }
      const name = source.slice(i).match(/^[A-Za-z_][A-Za-z0-9_-]*/);
      if (name) { tokens.push({type: 'name', value: name[0]}); i += name[0].length; continue; }
      throw new Error(`Unsupported character “${ch}” at position ${i + 1}.`);
    }
    if (tokens.length > MAX_TOKENS) throw new Error(`Expression is too complex (maximum ${MAX_TOKENS} tokens).`);
    tokens.push({type: 'eof'});
    return tokens;
  }

  function evaluate(expression, context, notes) {
    const tokens = tokenize(expression);
    let pos = 0;
    const peek = () => tokens[pos];
    const take = type => {
      if (peek().type !== type) throw new Error(`Expected “${type}”, found “${peek().value || peek().type}”.`);
      return tokens[pos++];
    };
    const lookup = (parts) => {
      const root = parts[0];
      if (UNSUPPORTED_CONTEXTS.has(root)) { notes.add(`Context “${root}” is intentionally not simulated.`); return UNKNOWN; }
      if (!KNOWN_CONTEXTS.has(root)) { notes.add(`Context “${root}” is not in the supported fixture subset.`); return UNKNOWN; }
      let value = context[root];
      for (let n = 1; n < parts.length; n++) {
        if (isUnknown(value) || value === null || value === undefined || typeof value !== 'object' || !(parts[n] in value)) return UNKNOWN;
        value = value[parts[n]];
      }
      return value === undefined ? UNKNOWN : value;
    };
    const primary = () => {
      if (peek().type === 'literal') return take('literal').value;
      if (peek().type === '(') { take('('); const value = orExpr(); take(')'); return value; }
      if (peek().type !== 'name') throw new Error(`Expected a literal, context path, or function near token ${pos + 1}.`);
      const name = take('name').value;
      if (name === 'true') return true;
      if (name === 'false') return false;
      if (name === 'null') return null;
      if (peek().type === '(') {
        take('('); const args = [];
        if (peek().type !== ')') { do { args.push(orExpr()); if (peek().type !== ',') break; take(','); } while (true); }
        take(')');
        if (name === 'contains' && args.length === 2 && !args.some(isUnknown)) {
          return Array.isArray(args[0]) ? args[0].some(x => x === args[1]) : String(args[0]).includes(String(args[1]));
        }
        if (name === 'startsWith' && args.length === 2 && !args.some(isUnknown)) return String(args[0]).startsWith(String(args[1]));
        if (name === 'endsWith' && args.length === 2 && !args.some(isUnknown)) return String(args[0]).endsWith(String(args[1]));
        if (name === 'join' && (args.length === 1 || args.length === 2) && !args.some(isUnknown) && Array.isArray(args[0])) return args[0].join(args.length === 2 ? String(args[1]) : ',');
        if (name === 'format' && args.length >= 1 && !args.some(isUnknown)) {
          return String(args[0]).replace(/\{(\d+)\}/g, (_, n) => n in args.slice(1) ? String(args[Number(n) + 1]) : `{${n}}`);
        }
        notes.add(`Function “${name}()” is unsupported or has invalid arguments; result is unknown.`); return UNKNOWN;
      }
      const parts = [name];
      while (peek().type === '.') { take('.'); parts.push(take('name').value); }
      while (peek().type === '[') {
        take('['); const key = take('literal').value; take(']'); parts.push(String(key));
      }
      return lookup(parts);
    };
    const unary = () => { if (peek().type === '!') { take('!'); const v = unary(); return isUnknown(v) ? UNKNOWN : !truthy(v); } return primary(); };
    const add = () => { let left = unary(); while (peek().type === '+') { take('+'); const right = unary(); left = isUnknown(left) || isUnknown(right) ? UNKNOWN : (typeof left === 'string' || typeof right === 'string' ? String(left) + String(right) : Number(left) + Number(right)); } return left; };
    const compare = () => {
      let left = add();
      while (['==', '!=', '>', '<', '>=', '<='].includes(peek().type)) {
        const op = take(peek().type).type; const right = add();
        if (isUnknown(left) || isUnknown(right)) left = UNKNOWN;
        else if (op === '==') left = comparable(left) === comparable(right);
        else if (op === '!=') left = comparable(left) !== comparable(right);
        else if (op === '>') left = comparable(left) > comparable(right);
        else if (op === '<') left = comparable(left) < comparable(right);
        else if (op === '>=') left = comparable(left) >= comparable(right);
        else left = comparable(left) <= comparable(right);
      }
      return left;
    };
    const andExpr = () => { let left = compare(); while (peek().type === '&&') { take('&&'); const right = compare(); const l = truthy(left); left = l === false ? left : (l === null || isUnknown(right) ? UNKNOWN : right); } return left; };
    const orExpr = () => { let left = andExpr(); while (peek().type === '||') { take('||'); const right = andExpr(); const l = truthy(left); left = l === true ? left : (l === null || isUnknown(right) ? UNKNOWN : right); } return left; };
    const result = orExpr();
    if (peek().type !== 'eof') throw new Error(`Unexpected token “${peek().value || peek().type}”.`);
    return result;
  }

  const engine = {
    title: 'GitHub Actions Expression Playground',
    description: 'Evaluate a small, safe GitHub Actions expression subset against pasted JSON context. Unsupported functions and runtime-only contexts are reported as unknown; secrets and runner APIs are never simulated.',
    limitations: 'Browser-local only. Supports literals, context paths, comparisons, boolean operators, +, and contains/startsWith/endsWith/join/format. It does not reproduce the full GitHub expression engine, implicit success(), hashFiles(), secrets, runner lifecycle, API, workspace, or server behavior. Inputs are capped at 1,200 expression characters and 12,000 context characters.',
    fields: [
      {id: 'expression', label: 'Expression', type: 'text', placeholder: "contains(github.ref, 'release') && inputs.publish == true", help: 'Use a GitHub Actions-style expression without ${{ }}.'},
      {id: 'context', label: 'JSON context fixture', type: 'textarea', placeholder: '{"github":{"ref":"refs/heads/main"},"inputs":{"publish":true}}', help: 'Paste a JSON object. Only selected static contexts are read; do not paste secrets.'}
    ],
    run(values) {
      const expression = String(values && values.expression || '').trim();
      const rawContext = String(values && values.context || '').trim();
      if (!expression) return 'Diagnostic: enter an expression to evaluate.';
      if (expression.length > MAX_EXPRESSION) return `Diagnostic: expression is too large. Limit: ${MAX_EXPRESSION} characters.`;
      if (rawContext.length > MAX_CONTEXT) return `Diagnostic: context fixture is too large. Limit: ${MAX_CONTEXT} characters.`;
      let context;
      try { context = JSON.parse(rawContext || '{}'); }
      catch (error) { return `Diagnostic: context is not valid JSON (${error.message}).`; }
      if (!context || typeof context !== 'object' || Array.isArray(context)) return 'Diagnostic: context must be a JSON object.';
      const notes = new Set();
      try {
        const result = evaluate(expression, context, notes);
        const lines = [`Expression: ${expression}`, `Result: ${display(result)}`];
        if (isUnknown(result)) lines.push('Interpretation: unknown — the expression depends on unsupported or unavailable runtime data.');
        else lines.push(`Interpretation: ${truthy(result) ? 'truthy' : 'falsy'} under this static fixture.`);
        if (notes.size) lines.push(`Notes: ${Array.from(notes).join(' ')}`);
        lines.push('No GitHub workflow, API, runner, workspace, or secret check was performed.');
        return {text: lines.join('\n'), warnings: Array.from(notes)};
      } catch (error) {
        return `Diagnostic: ${error.message} No workflow or remote check was performed.`;
      }
    }
  };

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['github-actions-expression-playground'] = engine;
})();
