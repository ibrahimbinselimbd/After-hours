(() => {
  'use strict';

  const MAX_SELECTOR_LENGTH = 6000;
  const MAX_TOTAL_LENGTH = 12000;
  const MAX_NESTING = 24;

  const tupleText = (tuple) => `(${tuple.join(', ')})`;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const maxTuple = (tuples) => tuples.reduce((best, current) => {
    if (!best) return current;
    for (let i = 0; i < 3; i++) {
      if (current[i] !== best[i]) return current[i] > best[i] ? current : best;
    }
    return best;
  }, null) || [0, 0, 0];
  const compareTuple = (a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    }
    return 0;
  };
  const isNameStart = (ch) => !!ch && /[A-Za-z_*|_-]/.test(ch);
  const isNameChar = (ch) => !!ch && /[A-Za-z0-9_|-]/.test(ch);

  function splitTopLevel(source, delimiter) {
    const parts = [];
    let start = 0;
    let parens = 0;
    let brackets = 0;
    let quote = '';
    let escaped = false;
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (quote) { if (ch === quote) quote = ''; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '(') parens++;
      else if (ch === ')') parens--;
      else if (ch === '[') brackets++;
      else if (ch === ']') brackets--;
      else if (ch === delimiter && parens === 0 && brackets === 0) {
        parts.push(source.slice(start, i).trim());
        start = i + 1;
      }
    }
    parts.push(source.slice(start).trim());
    return parts;
  }

  function readBalanced(source, openIndex, open, close) {
    let depth = 0;
    let quote = '';
    let escaped = false;
    for (let i = openIndex; i < source.length; i++) {
      const ch = source[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (quote) { if (ch === quote) quote = ''; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return {content: source.slice(openIndex + 1, i), end: i};
      }
    }
    throw new Error(`Unclosed ${open}${close} group.`);
  }

  function identifierAt(source, start) {
    let i = start;
    if (source[i] === '-' && source[i + 1] === '-') i += 2;
    else if (source[i] === '-' || source[i] === '_' || /[A-Za-z]/.test(source[i] || '')) i++;
    else return {value: '', end: start};
    while (i < source.length && isNameChar(source[i])) i++;
    return {value: source.slice(start, i), end: i};
  }

  function calculateSelector(selector, depth) {
    if (depth > MAX_NESTING) throw new Error('Selector nesting is too deep; simplify nested functional arguments.');
    const warnings = [];
    let tuple = [0, 0, 0];
    let i = 0;
    while (i < selector.length) {
      const ch = selector[i];
      if (/\s/.test(ch) || ch === '>' || ch === '+' || ch === '~' || ch === ',' || ch === '&') { i++; continue; }
      if (ch === '/' && selector[i + 1] === '*') {
        const endComment = selector.indexOf('*/', i + 2);
        if (endComment < 0) throw new Error('Unclosed CSS comment.');
        i = endComment + 2;
        continue;
      }
      if (ch === '#') {
        const id = identifierAt(selector, i + 1);
        if (!id.value) warnings.push('Ignored an empty ID token (#).');
        else tuple[0]++;
        i = id.end || i + 1;
        continue;
      }
      if (ch === '.') {
        const cls = identifierAt(selector, i + 1);
        if (!cls.value) warnings.push('Ignored an empty class token (.).');
        else tuple[1]++;
        i = cls.end || i + 1;
        continue;
      }
      if (ch === '[') {
        const group = readBalanced(selector, i, '[', ']');
        tuple[1]++;
        i = group.end + 1;
        continue;
      }
      if (ch === ':') {
        const pseudoElement = selector[i + 1] === ':';
        const nameStart = i + (pseudoElement ? 2 : 1);
        const name = identifierAt(selector, nameStart);
        if (!name.value) throw new Error(`Invalid pseudo-selector near position ${i + 1}.`);
        i = name.end;
        if (selector[i] === '(') {
          const group = readBalanced(selector, i, '(', ')');
          const lower = name.value.toLowerCase();
          if (pseudoElement) tuple[2]++;
          else if (lower === 'where') {
            // :where() contributes zero, including its arguments.
          } else if (lower === 'is' || lower === 'not' || lower === 'has') {
            const args = splitTopLevel(group.content, ',').filter(Boolean);
            if (!args.length) throw new Error(`:${lower}() needs at least one selector argument.`);
            const argumentTuples = args.map(arg => calculateSelector(arg, depth + 1).tuple);
            tuple = add(tuple, maxTuple(argumentTuples));
          } else if (lower === 'nth-child' || lower === 'nth-last-child') {
            tuple[1]++;
            const ofMatch = group.content.match(/\bof\b([\s\S]*)/i);
            if (ofMatch && ofMatch[1].trim()) {
              const args = splitTopLevel(ofMatch[1].trim(), ',').filter(Boolean);
              tuple = add(tuple, maxTuple(args.map(arg => calculateSelector(arg, depth + 1).tuple)));
            }
          } else {
            tuple[1]++;
            warnings.push(`Counted :${name.value}() as one pseudo-class; its argument semantics are outside this subset.`);
          }
          i = group.end + 1;
        } else if (pseudoElement) tuple[2]++;
        else tuple[1]++;
        continue;
      }
      if (ch === '*') { i++; continue; }
      if (ch === '\\') {
        const escaped = selector.slice(i, i + 2);
        if (escaped.length < 2) warnings.push('Trailing escape was ignored.');
        else { tuple[2]++; i += 2; }
        continue;
      }
      if (isNameStart(ch)) {
        const type = identifierAt(selector, i);
        if (type.value && type.value !== '|') tuple[2]++;
        i = type.end || i + 1;
        continue;
      }
      warnings.push(`Ignored unsupported character “${ch}” at position ${i + 1}.`);
      i++;
    }
    return {tuple, warnings};
  }

  function calculate(selector) {
    const trimmed = selector.trim();
    if (!trimmed) throw new Error('Selector is empty.');
    const alternatives = splitTopLevel(trimmed, ',').filter(Boolean);
    if (!alternatives.length) throw new Error('Selector is empty.');
    const results = alternatives.map(item => calculateSelector(item, 0));
    return {
      tuple: maxTuple(results.map(result => result.tuple)),
      alternatives: results.map((result, index) => ({selector: alternatives[index], tuple: result.tuple})),
      warnings: results.flatMap(result => result.warnings)
    };
  }

  function run(values) {
    const input = values || {};
    const left = String(input.selectorA || '').trim();
    const right = String(input.selectorB || '').trim();
    const sourceOrder = String(input.sourceOrder || '').trim();
    if (!left || !right) return 'Diagnostic: enter both Selector A and Selector B.';
    if (left.length > MAX_SELECTOR_LENGTH || right.length > MAX_SELECTOR_LENGTH || left.length + right.length > MAX_TOTAL_LENGTH) {
      return `Diagnostic: selectors are too large. Keep each under ${MAX_SELECTOR_LENGTH} characters and the pair under ${MAX_TOTAL_LENGTH} characters.`;
    }
    let a;
    let b;
    try { a = calculate(left); } catch (error) { return `Diagnostic: Selector A — ${error.message}`; }
    try { b = calculate(right); } catch (error) { return `Diagnostic: Selector B — ${error.message}`; }

    const orderNumber = sourceOrder === '' ? null : Number(sourceOrder);
    if (sourceOrder !== '' && (!Number.isInteger(orderNumber) || orderNumber < 0)) {
      return 'Diagnostic: source order must be a non-negative integer (larger means later in the stylesheet).';
    }
    const tupleComparison = compareTuple(a.tuple, b.tuple);
    let verdict;
    if (tupleComparison > 0) verdict = 'Selector A wins the specificity comparison.';
    else if (tupleComparison < 0) verdict = 'Selector B wins the specificity comparison.';
    else if (orderNumber === null) verdict = 'Specificity ties. Provide source order to resolve this limited tie-break comparison.';
    else if (orderNumber === 0) verdict = 'Specificity ties; source order is equal, so this tool reports no winner.';
    else verdict = `Specificity ties; the later source-order rule (Selector B, order ${orderNumber}) wins this limited comparison.`;

    const lines = [
      'CSS Specificity Duel',
      '',
      `Selector A: ${left}`,
      `  specificity ${tupleText(a.tuple)}${a.alternatives.length > 1 ? ` (maximum of ${a.alternatives.length} comma-separated selectors)` : ''}`,
      `Selector B: ${right}`,
      `  specificity ${tupleText(b.tuple)}${b.alternatives.length > 1 ? ` (maximum of ${b.alternatives.length} comma-separated selectors)` : ''}`,
      '',
      verdict,
      'Tuple order is (IDs, classes/attributes/pseudo-classes, type/pseudo-elements).'
    ];
    if (sourceOrder !== '') lines.push(`Source-order input: Selector A is earlier; Selector B is later at order ${orderNumber}.`);
    const warnings = [...a.warnings, ...b.warnings];
    if (warnings.length) lines.push('', `Notes: ${warnings.join(' ')}`);
    lines.push('', 'Scope: selector specificity only; this does not determine a full cascade winner, layers, inheritance, or whether either selector matches a DOM.');
    return lines.join('\n');
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['css-specificity-duel'] = {
    title: 'CSS Specificity Calculator & Selector Duel',
    description: 'Compare common CSS selector specificity tuples and use optional source order for a narrow tie-break. This is not a full cascade or DOM winner check.',
    limitations: 'Browser-local bounded subset: handles IDs, classes, attributes, types, pseudo-elements, and :is/:not/:has/:where argument specificity, plus nth-child “of” lists. It does not model cascade layers, !important, inheritance, scoping, nesting, DOM matching, or full CSS grammar; unknown functional pseudo-classes are counted as one pseudo-class with a warning.',
    fields: [
      {id: 'selectorA', label: 'Selector A', type: 'textarea', placeholder: '#app .card:is(:hover, .active)', help: 'Paste one selector or a comma-separated selector list.'},
      {id: 'selectorB', label: 'Selector B', type: 'textarea', placeholder: '.panel > article.card:hover', help: 'Paste one selector or a comma-separated selector list.'},
      {id: 'sourceOrder', label: 'Later rule source order (optional)', type: 'text', placeholder: '1', help: 'Use a non-negative integer when specificity ties; larger means later than Selector A.'}
    ],
    run
  };
})();
