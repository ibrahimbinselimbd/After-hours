(() => {
  'use strict';

  const MAX_CHARS = 200000;
  const MAX_LINES = 5000;
  const registry = window.AHDevToolEngines = window.AHDevToolEngines || {};

  function clean(value) {
    return String(value == null ? '' : value).replace(/\r\n?/g, '\n');
  }

  function sideToken(value) {
    const token = value.trim();
    if (token === '-') return { kind: 'missing', value: null };
    if (/^\d+$/.test(token)) return { kind: 'number', value: Number(token) };
    if (/^[0-9a-f]{4,64}$/i.test(token) || /^\.{3}$/.test(token)) {
      return { kind: 'hash', value: token };
    }
    if (/^[-=]+$/.test(token)) return { kind: 'separator', value: token };
    return null;
  }

  function parseLine(raw, lineNumber) {
    const line = raw.trim();
    if (!line || /^[-=]{3,}\s*$/.test(line) || /^@@/.test(line)) {
      return { type: 'context' };
    }

    // A range-diff summary line has: old-range: old-commit marker new-range: new-commit subject.
    const match = line.match(/^(\S+)\s*:\s*(\S+)\s+([=!<>])\s+(\S+)\s*:\s*(\S+)(?:\s+(.*))?$/);
    if (!match) {
      // Also recognize the one-sided form emitted for an added or removed commit.
      const oneSided = line.match(/^(\S+)\s*:\s*(\S+)\s+([<>])\s+(\S+)\s*:\s*(\S+)(?:\s+(.*))?$/);
      if (!oneSided) return { type: 'diagnostic', line: lineNumber, message: 'Unrecognized range-diff line.' };
      const left = sideToken(oneSided[1]);
      const right = sideToken(oneSided[4]);
      if (!left || !right) return { type: 'diagnostic', line: lineNumber, message: 'Invalid range/commit token.' };
      return { type: 'entry', left, leftCommit: oneSided[2], marker: oneSided[3], right, rightCommit: oneSided[5], subject: oneSided[6] || '(no subject)' };
    }
    const left = sideToken(match[1]);
    const right = sideToken(match[4]);
    if (!left || !right) return { type: 'diagnostic', line: lineNumber, message: 'Invalid range/commit token.' };
    return { type: 'entry', left, leftCommit: match[2], marker: match[3], right, rightCommit: match[5], subject: match[6] || '(no subject)' };
  }

  function rangeLabel(side) {
    if (side.kind === 'missing') return 'none';
    if (side.kind === 'number') return String(side.value);
    return side.value;
  }

  function explain(values) {
    const source = clean(values && (values.rangeDiff || values.input || values.text));
    if (!source.trim()) return 'Paste git range-diff output to explain commit correspondence.';
    if (source.length > MAX_CHARS) return `Input is too large (${source.length.toLocaleString()} characters). The limit is ${MAX_CHARS.toLocaleString()} characters.`;
    const lines = source.split('\n');
    if (lines.length > MAX_LINES) return `Input is too complex (${lines.length.toLocaleString()} lines). The limit is ${MAX_LINES.toLocaleString()} lines.`;

    const entries = [];
    const diagnostics = [];
    let contextLines = 0;
    lines.forEach((raw, index) => {
      const parsed = parseLine(raw, index + 1);
      if (parsed.type === 'entry') entries.push(parsed);
      else if (parsed.type === 'diagnostic') diagnostics.push(`line ${parsed.line}: ${parsed.message} “${raw.trim().slice(0, 120)}”`);
      else if (parsed.type === 'context' && raw.trim()) contextLines++;
    });

    if (!entries.length) {
      return 'No recognizable commit correspondence lines found. Expected lines like “1: abc1234 = 1: def5678 Subject” or “-: ------- > 3: ghi9012 New commit”.' +
        (diagnostics.length ? `\nDiagnostics:\n- ${diagnostics.slice(0, 8).join('\n- ')}` : '');
    }

    const counts = { '=': 0, '!': 0, '>': 0, '<': 0 };
    const reordered = [];
    const added = [];
    const removed = [];
    const changed = [];
    const unchanged = [];

    entries.forEach((entry, index) => {
      counts[entry.marker] = (counts[entry.marker] || 0) + 1;
      const left = rangeLabel(entry.left);
      const right = rangeLabel(entry.right);
      const pair = `${left} → ${right}`;
      const detail = `${pair} (${entry.leftCommit} ${entry.marker} ${entry.rightCommit}) — ${entry.subject}`;
      if (entry.marker === '> ' || entry.marker === '>') added.push(detail);
      else if (entry.marker === '<') removed.push(detail);
      else if (entry.marker === '!') changed.push(detail);
      else unchanged.push(detail);
      if (entry.left.kind === 'number' && entry.right.kind === 'number' && entry.left.value !== entry.right.value) reordered.push(`${pair} — ${entry.subject}`);
    });

    const out = [
      'Git range-diff explanation',
      `Recognized ${entries.length} commit correspondence line${entries.length === 1 ? '' : 's'}.`,
      '',
      'Summary',
      `- Unchanged patch correspondence (=): ${counts['='] || 0}`,
      `- Modified patch correspondence (!): ${counts['!'] || 0}`,
      `- Added on the new side (>): ${counts['>'] || 0}`,
      `- Removed from the new side (<): ${counts['<'] || 0}`,
      `- Reordered numeric positions detected: ${reordered.length}`,
      '',
      'Line-by-line interpretation'
    ];
    entries.forEach((entry, index) => {
      const markerMeaning = entry.marker === '=' ? 'same patch/commit correspondence' : entry.marker === '!' ? 'corresponding patch changed' : entry.marker === '>' ? 'new-only commit' : 'old-only commit';
      out.push(`${index + 1}. ${rangeLabel(entry.left)} → ${rangeLabel(entry.right)} — ${markerMeaning}; ${entry.leftCommit} ${entry.marker} ${entry.rightCommit}; ${entry.subject}`);
    });
    out.push('', 'Marker guide', '- “=” indicates matching patch identity; “!” indicates the matched patch changed; “>” is new-side-only; “<” is old-side-only.', '- “-:”/“-------” and “...” are metadata placeholders for a missing side or abbreviated commit identity, not verification results.', '- Position changes are inferred only from numeric range positions; commit IDs, ancestry, and patch similarity were not fetched or validated.');
    if (contextLines) out.push(`- Ignored ${contextLines} non-summary context/hunk separator line${contextLines === 1 ? '' : 's'}.`);
    if (diagnostics.length) out.push('', 'Diagnostics (some lines were not parsed)', ...diagnostics.slice(0, 8).map(item => `- ${item}`), diagnostics.length > 8 ? `- ${diagnostics.length - 8} additional diagnostic(s) omitted.` : '');
    out.push('', 'Scope: This is a bounded explanation of pasted, common git range-diff summary lines. It does not access repositories or private refs and is not a full git parser.');
    return out.join('\n');
  }

  registry['git-range-diff-explainer'] = {
    title: 'Git Range-Diff Review Explainer',
    description: 'Explain commit correspondence, reorderings, additions/removals, and range-diff metadata from pasted git range-diff output. Browser-local only; private refs and full parser parity are not supported.',
    limitations: 'Parses common summary lines only, with a 200,000-character and 5,000-line cap. It does not access repositories, resolve private refs, compute patch similarity, or reproduce every git version/output format; malformed or complex lines are reported.',
    fields: [{
      id: 'rangeDiff',
      label: 'Pasted git range-diff output',
      type: 'textarea',
      placeholder: '1: abc1234 = 1: def5678 Keep the release fix\n2: 111aaaa ! 2: 222bbbb Adjust validation\n-: ------- > 3: 333cccc Add regression test',
      help: 'Paste the summary output from git range-diff. Hunk/context lines may be included and will be ignored where recognizable.'
    }],
    run: explain
  };
})();
