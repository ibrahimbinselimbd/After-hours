(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const HARD_CAP = 10000;
  const DEFAULT_CAP = 2000;
  const EXPRESSION_RE = /\$\{\{[\s\S]*?\}\}/;

  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const formatValue = value => typeof value === 'string' ? value : JSON.stringify(value);
  const isExpression = value => typeof value === 'string' && EXPRESSION_RE.test(value);

  function validateMatrix(input) {
    if (!isObject(input)) throw new Error('Matrix input must be a JSON object.');
    const matrix = isObject(input.matrix) && !Array.isArray(input.include) && !Array.isArray(input.exclude)
      ? input.matrix : input;
    const axes = {};
    for (const key of Object.keys(matrix)) {
      if (key === 'include' || key === 'exclude') continue;
      if (!Array.isArray(matrix[key])) throw new Error(`Matrix axis “${key}” must be an array.`);
      if (!matrix[key].length) throw new Error(`Matrix axis “${key}” cannot be empty.`);
      if (matrix[key].length > HARD_CAP) throw new Error(`Matrix axis “${key}” exceeds the ${HARD_CAP.toLocaleString()}-value safety cap.`);
      axes[key] = matrix[key];
    }
    for (const name of ['include', 'exclude']) {
      if (matrix[name] !== undefined && !Array.isArray(matrix[name])) {
        throw new Error(`Matrix “${name}” must be an array of objects.`);
      }
      for (const [index, item] of (matrix[name] || []).entries()) {
        if (!isObject(item)) throw new Error(`Matrix ${name}[${index}] must be an object.`);
      }
    }
    if (!Object.keys(axes).length && !(matrix.include || []).length) {
      throw new Error('Provide at least one matrix axis or include entry.');
    }
    return {axes, include: matrix.include || [], exclude: matrix.exclude || []};
  }

  function expandAxes(axes, cap) {
    let combinations = [{}];
    for (const key of Object.keys(axes)) {
      const next = [];
      for (const combination of combinations) {
        for (const value of axes[key]) {
          next.push(Object.assign({}, combination, {[key]: value}));
          if (next.length > cap) {
            throw new Error(`Cartesian product exceeds the ${cap.toLocaleString()}-combination cap. Reduce axis values or increase the cap within the allowed limit.`);
          }
        }
      }
      combinations = next;
    }
    return combinations;
  }

  function canMerge(combination, addition) {
    return Object.keys(addition).every(key => !(key in combination) || sameValue(combination[key], addition[key]));
  }

  function applyIncludes(combinations, includes, cap) {
    const result = combinations.slice();
    for (const addition of includes) {
      let merged = false;
      for (let index = 0; index < result.length; index++) {
        if (canMerge(result[index], addition)) {
          result[index] = Object.assign({}, result[index], addition);
          merged = true;
        }
      }
      if (!merged) {
        result.push(Object.assign({}, addition));
        if (result.length > cap) {
          throw new Error(`Includes produce more than the ${cap.toLocaleString()}-combination cap.`);
        }
      }
    }
    return result;
  }

  function matchesExclude(combination, exclusion) {
    return Object.keys(exclusion).every(key => key in combination && sameValue(combination[key], exclusion[key]));
  }

  function run(values) {
    try {
      const raw = String(values && values.matrix || '').trim();
      if (!raw) return 'Input error: paste a JSON matrix object with axis arrays and optional include/exclude arrays.';
      let parsed;
      try { parsed = JSON.parse(raw); }
      catch (error) { return `Input error: matrix JSON could not be parsed (${error.message}).`; }

      let cap = DEFAULT_CAP;
      const requestedCap = String(values && values.cap || '').trim();
      if (requestedCap) {
        if (!/^\d+$/.test(requestedCap)) return 'Input error: cap must be a whole number.';
        cap = Number(requestedCap);
      }
      if (cap < 1 || cap > HARD_CAP) return `Input error: cap must be between 1 and ${HARD_CAP.toLocaleString()}.`;

      const matrix = validateMatrix(parsed);
      const base = expandAxes(matrix.axes, cap);
      const afterIncludes = applyIncludes(base, matrix.include, cap);
      const excluded = afterIncludes.filter(combo => matrix.exclude.some(rule => matchesExclude(combo, rule)));
      const combinations = afterIncludes.filter(combo => !matrix.exclude.some(rule => matchesExclude(combo, rule)));
      const unknowns = [];
      const scanUnknowns = (value, path) => {
        if (isExpression(value)) unknowns.push(`${path} = ${value}`);
      };
      for (const [key, valuesForAxis] of Object.entries(matrix.axes)) valuesForAxis.forEach((value, i) => scanUnknowns(value, `axis ${key}[${i}]`));
      matrix.include.forEach((item, i) => Object.entries(item).forEach(([key, value]) => scanUnknowns(value, `include[${i}].${key}`)));
      matrix.exclude.forEach((item, i) => Object.entries(item).forEach(([key, value]) => scanUnknowns(value, `exclude[${i}].${key}`)));

      const lines = [
        `GitHub Actions matrix preview`,
        `Base Cartesian combinations: ${base.length}`,
        `After include rules: ${afterIncludes.length}`,
        `Excluded combinations: ${excluded.length}`,
        `Final job count: ${combinations.length}`,
        '',
        'Final combinations:'
      ];
      if (combinations.length) combinations.forEach((combo, index) => lines.push(`${index + 1}. ${JSON.stringify(combo)}`));
      else lines.push('(none)');
      if (unknowns.length) {
        lines.push('', `Runtime expressions kept symbolic/unknown (${unknowns.length}):`);
        unknowns.slice(0, 50).forEach(item => lines.push(`- ${item}`));
        if (unknowns.length > 50) lines.push(`- …and ${unknowns.length - 50} more`);
      }
      const warnings = [
        'This is a local static preview, not a GitHub Actions runner or server-side validation.',
        'Expression values are treated as opaque symbolic strings; runtime contexts and expression semantics are not evaluated.'
      ];
      return {text: lines.join('\n'), warnings};
    } catch (error) {
      return `Input error: ${error.message}`;
    }
  }

  window.AHDevToolEngines['github-actions-matrix-preview'] = {
    title: 'GitHub Actions Matrix Expander & Exclusion Preview',
    description: 'Expand a bounded static GitHub Actions matrix locally, explain include/exclude effects, show the final job count, and keep runtime expressions symbolic. Cartesian expansion is capped at 10,000 combinations.',
    limitations: 'Accepts a pasted JSON matrix object (axis arrays plus optional include/exclude arrays), not YAML. It models static matrix combinations only; runtime expressions remain opaque symbolic values, and it does not perform GitHub, repository, workflow, runner, fail-fast, or server-side checks.',
    fields: [
      {id: 'matrix', label: 'Matrix JSON', type: 'textarea', placeholder: '{\n  "os": ["ubuntu-latest", "windows-latest"],\n  "node": [18, 20],\n  "include": [],\n  "exclude": [{"os": "windows-latest", "node": 18}]\n}', help: 'Paste a JSON matrix object. Axis values must be arrays; include and exclude are arrays of objects.'},
      {id: 'cap', label: 'Combination cap (optional)', type: 'text', placeholder: '2000', help: 'Whole number from 1 to 10,000. The default is 2,000.'}
    ],
    run
  };
})();
