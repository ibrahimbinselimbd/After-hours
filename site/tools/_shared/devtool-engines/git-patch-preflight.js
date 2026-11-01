(() => {
  'use strict';

  const MAX_INPUT = 200000;
  const MAX_LINES = 12000;
  const MAX_HUNKS = 200;

  const fields = [
    {
      id: 'patch',
      label: 'Unified diff / patch',
      type: 'textarea',
      placeholder: '--- a/example.txt\n+++ b/example.txt\n@@ -1,2 +1,2 @@\n old\n-new\n+new',
      help: 'Paste one bounded unified diff. Git metadata is allowed, but this simulator applies one file only.'
    },
    {
      id: 'target',
      label: 'Target text before applying',
      type: 'textarea',
      placeholder: 'old\nsecond line',
      help: 'Paste the exact current contents of the target file, including line breaks where relevant.'
    }
  ];

  function splitLines(value) {
    const text = String(value == null ? '' : value).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    return { text, lines: text === '' ? [] : text.split('\n') };
  }

  function parseRange(value, label, lineNumber) {
    const match = value.match(/^(\d+)(?:,(\d+))?$/);
    if (!match) throw new Error(`Invalid ${label} range at patch line ${lineNumber}: ${value}`);
    return { start: Number(match[1]), count: match[2] == null ? 1 : Number(match[2]) };
  }

  function parsePatch(source) {
    const normalized = splitLines(source);
    if (normalized.text.length > MAX_INPUT) throw new Error(`Patch is too large; limit is ${MAX_INPUT.toLocaleString()} characters.`);
    if (normalized.lines.length > MAX_LINES) throw new Error(`Patch has too many lines; limit is ${MAX_LINES.toLocaleString()}.`);

    const lines = normalized.lines;
    const hunks = [];
    let oldFile = null;
    let newFile = null;
    let seenFile = false;
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith('--- ')) {
        if (seenFile && hunks.length) throw new Error('Multiple file patches are not supported; paste one file diff at a time.');
        seenFile = true;
        oldFile = line.slice(4).split('\t')[0];
        if (i + 1 >= lines.length || !lines[i + 1].startsWith('+++ ')) {
          throw new Error(`Missing +++ file header after patch line ${i + 1}.`);
        }
        newFile = lines[i + 1].slice(4).split('\t')[0];
        i += 2;
        continue;
      }
      const header = line.match(/^@@ -([^ ]+) \+([^ ]+) @@(?: (.*))?$/);
      if (!header) { i++; continue; }
      if (hunks.length >= MAX_HUNKS) throw new Error(`Too many hunks; limit is ${MAX_HUNKS}.`);
      const oldRange = parseRange(header[1], 'old hunk', i + 1);
      const newRange = parseRange(header[2], 'new hunk', i + 1);
      const body = [];
      let j = i + 1;
      while (j < lines.length && !/^@@ -[^ ]+ \+[^ ]+ @@/.test(lines[j]) && !lines[j].startsWith('--- ')) {
        const hunkLine = lines[j];
        if (hunkLine === '\\ No newline at end of file') { j++; continue; }
        if (!/^[ +\-]/.test(hunkLine)) {
          throw new Error(`Unexpected hunk content at patch line ${j + 1}; expected space, +, or -.`);
        }
        body.push({ kind: hunkLine[0], text: hunkLine.slice(1), line: j + 1 });
        j++;
      }
      const oldCount = body.filter(item => item.kind !== '+').length;
      const newCount = body.filter(item => item.kind !== '-').length;
      if (oldCount !== oldRange.count || newCount !== newRange.count) {
        throw new Error(`Hunk at patch line ${i + 1} declares -${oldRange.start},${oldRange.count} +${newRange.start},${newRange.count} but contains ${oldCount} old and ${newCount} new lines.`);
      }
      hunks.push({ oldRange, newRange, body, headerLine: i + 1, section: header[3] || '' });
      i = j;
    }
    if (!hunks.length) throw new Error('No unified-diff hunk found. Include an @@ -old,+new @@ header.');
    if (seenFile && oldFile && newFile && oldFile === '/dev/null' && newFile === '/dev/null') throw new Error('Both patch file sides are /dev/null.');
    return { hunks, oldFile, newFile };
  }

  function sameLines(actual, expected, start) {
    if (start < 0 || start + expected.length > actual.length) return false;
    for (let i = 0; i < expected.length; i++) if (actual[start + i] !== expected[i]) return false;
    return true;
  }

  function findExactPositions(actual, expected) {
    const positions = [];
    if (!expected.length) return positions;
    for (let i = 0; i <= actual.length - expected.length; i++) if (sameLines(actual, expected, i)) positions.push(i);
    return positions;
  }

  function run(values) {
    const patch = String(values && values.patch != null ? values.patch : '');
    const target = String(values && values.target != null ? values.target : '');
    if (!patch.trim()) return 'Input error: paste a unified diff in “Unified diff / patch”.';
    if (target.length > MAX_INPUT) return `Input error: target text is too large; limit is ${MAX_INPUT.toLocaleString()} characters.`;
    const targetData = splitLines(target);
    if (targetData.lines.length > MAX_LINES) return `Input error: target has too many lines; limit is ${MAX_LINES.toLocaleString()}.`;

    let parsed;
    try { parsed = parsePatch(patch); }
    catch (error) { return `Patch rejected: ${error.message}`; }

    const report = [];
    report.push('Git Patch Apply Preflight Simulator');
    report.push(`Scope: ${parsed.hunks.length} hunk${parsed.hunks.length === 1 ? '' : 's'}; exact lines with bounded offset search; no fuzzy or 3-way matching.`);
    if (parsed.oldFile || parsed.newFile) report.push(`File: ${(parsed.oldFile || '?')} -> ${(parsed.newFile || '?')}`);

    let working = targetData.lines.slice();
    let delta = 0;
    let rejected = false;
    parsed.hunks.forEach((hunk, index) => {
      const oldLines = hunk.body.filter(item => item.kind !== '+').map(item => item.text);
      const newLines = hunk.body.filter(item => item.kind !== '-').map(item => item.text);
      const declared = hunk.oldRange.start - 1 + delta;
      let position = -1;
      let offset = 0;
      if (oldLines.length) {
        const matches = findExactPositions(working, oldLines);
        if (matches.length === 1) {
          position = matches[0];
          offset = position - declared;
        } else if (matches.length > 1) {
          report.push(`Hunk ${index + 1}: REJECTED — exact old/context lines occur ${matches.length} times; offset is ambiguous.`);
          rejected = true;
          return;
        }
      } else {
        position = declared;
        offset = 0;
        if (position < 0 || position > working.length) position = -1;
      }
      if (position < 0) {
        report.push(`Hunk ${index + 1}: REJECTED — exact old/context lines do not match the target (expected near line ${hunk.oldRange.start}).`);
        rejected = true;
        return;
      }
      working.splice(position, oldLines.length, ...newLines);
      delta += newLines.length - oldLines.length;
      report.push(`Hunk ${index + 1}: proposed at target line ${position + 1}, offset ${offset >= 0 ? '+' : ''}${offset}; ${oldLines.length} old line${oldLines.length === 1 ? '' : 's'} -> ${newLines.length} new line${newLines.length === 1 ? '' : 's'}.`);
    });

    if (rejected) {
      report.push('Result: REJECTED. No complete patch application is proposed because at least one hunk conflicts or is ambiguous.');
      return report.join('\n');
    }
    report.push(`Result: PRECHECK PASSED. All ${parsed.hunks.length} hunk${parsed.hunks.length === 1 ? '' : 's'} matched exact lines; proposed output has ${working.length} line${working.length === 1 ? '' : 's'}.`);
    report.push('This is a local preflight proposal, not a claim of git-apply/GNU patch compatibility.');
    return report.join('\n');
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['git-patch-preflight'] = {
    title: 'Git Patch Apply Preflight Simulator',
    description: 'Compare a bounded unified diff with pasted target text, preview exact hunk placement and offsets, and reject conflicts locally. This intentionally does not implement fuzzy matching, three-way merging, or full git-apply compatibility.',
    limitations: 'One file and bounded pasted text only (200,000 characters, 12,000 lines, 200 hunks). Matching is exact; unique whole-line offset placement is allowed, while ambiguous or missing matches are rejected. No repository, filesystem, remote, fuzzy, three-way, or Git-compatible checks are performed.',
    fields,
    run
  };
})();
