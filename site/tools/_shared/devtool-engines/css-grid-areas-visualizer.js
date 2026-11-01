(() => {
  'use strict';

  const MAX_ROWS = 32;
  const MAX_COLUMNS = 64;
  const MAX_CELLS = 1024;
  const MAX_INPUT_LENGTH = 12000;

  const fail = (message) => ({text: `CSS Grid Template-Areas Visualizer\n\nInput error: ${message}`});

  function parseRows(raw) {
    const source = String(raw ?? '').replace(/^\uFEFF/, '').trim();
    if (!source) throw new Error('Paste one or more quoted grid-template-areas rows.');
    if (source.length > MAX_INPUT_LENGTH) {
      throw new Error(`Input is too large. Keep it to ${MAX_INPUT_LENGTH.toLocaleString()} characters or fewer.`);
    }

    // Accept a declaration or rule fragment, but only extract quoted row strings.
    const quoted = [];
    const quotePattern = /(["'])(.*?)\1/g;
    let match;
    while ((match = quotePattern.exec(source))) {
      if (match[2].trim()) quoted.push({text: match[2], offset: match.index});
    }
    let rowTexts = quoted.map(item => item.text);
    if (!rowTexts.length) {
      rowTexts = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
        .map(line => line.replace(/^["']|["'];?$/g, '').trim()).filter(Boolean);
    }
    if (!rowTexts.length) throw new Error('No non-empty rows were found.');
    if (rowTexts.length > MAX_ROWS) throw new Error(`Too many rows (${rowTexts.length}). The limit is ${MAX_ROWS}.`);

    const rows = rowTexts.map((row, index) => {
      const cells = row.split(/\s+/).filter(Boolean);
      if (!cells.length) throw new Error(`Row ${index + 1} is empty.`);
      if (cells.length > MAX_COLUMNS) throw new Error(`Row ${index + 1} has ${cells.length} columns; the limit is ${MAX_COLUMNS}.`);
      for (const cell of cells) {
        if (cell !== '.' && !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(cell)) {
          throw new Error(`Row ${index + 1} contains invalid area token “${cell}”. Use identifiers or “.” for an empty cell.`);
        }
      }
      return cells;
    });
    const width = rows[0].length;
    if (rows.some(row => row.length !== width)) {
      throw new Error(`Rows must have equal column counts; found ${width} in row 1 and a different width elsewhere.`);
    }
    if (width * rows.length > MAX_CELLS) {
      throw new Error(`The grid has ${width * rows.length} cells; the limit is ${MAX_CELLS}.`);
    }
    return rows;
  }

  function validate(rows) {
    const positions = new Map();
    rows.forEach((row, r) => row.forEach((name, c) => {
      if (name !== '.') {
        if (!positions.has(name)) positions.set(name, []);
        positions.get(name).push([r, c]);
      }
    }));
    const issues = [];
    for (const [name, points] of positions) {
      const rs = points.map(point => point[0]);
      const cs = points.map(point => point[1]);
      const minR = Math.min(...rs), maxR = Math.max(...rs);
      const minC = Math.min(...cs), maxC = Math.max(...cs);
      const expected = (maxR - minR + 1) * (maxC - minC + 1);
      if (expected !== points.length) {
        const occupied = new Set(points.map(point => `${point[0]}:${point[1]}`));
        const holes = [];
        for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++) {
          if (!occupied.has(`${r}:${c}`)) holes.push(`r${r + 1}c${c + 1}`);
        }
        issues.push(`${name}: non-rectangular; bounding box has ${expected} cells but the area uses ${points.length}. Missing cells: ${holes.join(', ')}.`);
      }
    }
    return {positions, issues};
  }

  function render(rows, positions, issues) {
    const width = rows[0].length;
    const labelWidth = String(rows.length).length;
    const lines = [];
    lines.push(`CSS Grid Template-Areas Visualizer`);
    lines.push(`${rows.length} row(s) × ${width} column(s) | ${positions.size} named area(s)`);
    lines.push('');
    lines.push('Visual map (row labels are 1-based):');
    lines.push(`${' '.repeat(labelWidth)}  ` + rows[0].map((_, c) => String(c + 1).padStart(2, ' ')).join(' '));
    rows.forEach((row, r) => {
      lines.push(`${String(r + 1).padStart(labelWidth, ' ')}  ` + row.map(cell => cell.padStart(2, ' ')).join(' '));
    });
    lines.push('');
    lines.push('Named areas:');
    if (!positions.size) lines.push('  (none; this grid contains only empty cells.)');
    for (const [name, points] of positions) {
      const rs = points.map(point => point[0]), cs = points.map(point => point[1]);
      lines.push(`  ${name}: ${points.length} cell(s), rows ${Math.min(...rs) + 1}–${Math.max(...rs) + 1}, columns ${Math.min(...cs) + 1}–${Math.max(...cs) + 1}`);
    }
    lines.push('');
    if (issues.length) {
      lines.push(`Validation: ${issues.length} issue(s)`);
      issues.forEach(issue => lines.push(`  - ${issue}`));
    } else {
      lines.push('Validation: PASS — every named area forms a filled rectangle.');
    }
    lines.push('');
    lines.push('Scope: validates the pasted grid-template-areas text only; it does not simulate auto-placement, DOM placement, CSS cascade, or responsive runtime behavior.');
    return lines.join('\n');
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['css-grid-areas-visualizer'] = {
    title: 'CSS Grid Template-Areas Visualizer & Validator',
    description: 'Parse pasted grid-template-areas rows, draw a bounded text map, and check that each named area is a filled rectangle.',
    limitations: 'Browser-local deterministic text analysis only. It does not simulate auto-placement, actual DOM/layout, CSS cascade, or responsive runtime behavior. Maximum 32 rows, 64 columns, 1,024 cells, and 12,000 input characters.',
    fields: [
      {
        id: 'gridTemplateAreas',
        label: 'grid-template-areas value',
        type: 'textarea',
        placeholder: '"header header"\n"main sidebar"\n"footer footer"',
        help: 'Paste quoted CSS rows, a grid-template-areas declaration, or one whitespace-separated row per line. Use . for an empty cell.'
      }
    ],
    run(values) {
      try {
        const rows = parseRows(values && values.gridTemplateAreas);
        const result = validate(rows);
        return {text: render(rows, result.positions, result.issues), mime: 'text/plain;charset=utf-8', filename: 'grid-template-areas-report.txt'};
      } catch (error) {
        return fail(error && error.message ? error.message : 'Could not parse the pasted grid-template-areas text.');
      }
    }
  };
})();
