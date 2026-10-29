(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_INPUT_BYTES = 3 * 1024 * 1024;
  const MAX_PATHS = 10000;
  const MAX_PATTERN_LENGTH = 1024;

  const byteLength = (value) => {
    try { return new TextEncoder().encode(value).length; }
    catch (_) { return value.length; }
  };

  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Deliberately bounded CODEOWNERS glob subset: *, **, ?, and [] character classes.
  const globToRegex = (source) => {
    let out = '^';
    for (let i = 0; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '*') {
        if (source[i + 1] === '*') {
          i += 1;
          if (source[i + 1] === '/') { i += 1; out += '(?:.*\\/)?'; }
          else out += '.*';
        } else {
          out += '[^/]*';
        }
      } else if (ch === '?') {
        out += '[^/]';
      } else if (ch === '[') {
        const end = source.indexOf(']', i + 1);
        if (end === -1) throw new Error('unclosed character class');
        let cls = source.slice(i + 1, end);
        if (cls[0] === '!') cls = '^' + cls.slice(1);
        out += '[' + cls.replace(/\\/g, '\\\\') + ']';
        i = end;
      } else {
        out += escapeRegex(ch);
      }
    }
    return new RegExp(out + '$');
  };

  const normalizePath = (raw) => {
    let path = String(raw || '').trim().replace(/\\/g, '/');
    while (path.startsWith('./')) path = path.slice(2);
    path = path.replace(/^\/+/, '');
    return path;
  };

  const compilePattern = (rawPattern) => {
    let pattern = rawPattern.trim();
    if (pattern.startsWith('/')) pattern = pattern.slice(1);
    const directory = pattern.endsWith('/');
    if (directory) pattern += '**';
    if (!pattern) throw new Error('empty pattern');
    if (pattern.length > MAX_PATTERN_LENGTH) throw new Error(`pattern exceeds ${MAX_PATTERN_LENGTH} characters`);
    return { source: rawPattern, regex: globToRegex(pattern), directory };
  };

  const parseCodeowners = (input) => {
    const lines = String(input || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    const rules = [];
    const diagnostics = [];
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const tokens = trimmed.split(/\s+/);
      if (tokens.length < 2) {
        diagnostics.push(`line ${lineNumber}: ignored; expected a pattern followed by at least one owner`);
        return;
      }
      const pattern = tokens.shift();
      if (pattern.startsWith('!')) {
        diagnostics.push(`line ${lineNumber}: ignored; negation patterns are not supported by CODEOWNERS`);
        return;
      }
      if (pattern.includes('\\')) {
        diagnostics.push(`line ${lineNumber}: ignored; backslash escaping is outside this simulator's supported subset`);
        return;
      }
      try {
        rules.push({ lineNumber, pattern: compilePattern(pattern), owners: tokens });
      } catch (error) {
        diagnostics.push(`line ${lineNumber}: ignored; invalid pattern (${error.message})`);
      }
    });
    return { rules, diagnostics };
  };

  const run = (values) => {
    const codeowners = String(values && values.codeowners || '');
    const pathsInput = String(values && values.paths || '');
    if (!codeowners.trim()) return 'Input error: paste at least one CODEOWNERS rule.';
    if (!pathsInput.trim()) return 'Input error: paste at least one repository-relative path.';
    const totalBytes = byteLength(codeowners) + byteLength(pathsInput);
    if (totalBytes > MAX_INPUT_BYTES) {
      return `Input error: combined input exceeds the 3 MB browser-local limit (${totalBytes} bytes).`;
    }

    const paths = pathsInput.split(/\r?\n/).map(normalizePath).filter(Boolean);
    if (paths.length > MAX_PATHS) return `Input error: supply at most ${MAX_PATHS.toLocaleString()} paths.`;
    const parsed = parseCodeowners(codeowners);
    const results = paths.map((path) => {
      let winner = null;
      parsed.rules.forEach((rule) => {
        if (rule.pattern.regex.test(path)) winner = rule;
      });
      return { path, winner };
    });
    const owned = results.filter((item) => item.winner);
    const unowned = results.filter((item) => !item.winner);
    const lines = [
      'CODEOWNERS coverage & match simulation',
      `Rules used: ${parsed.rules.length}; paths checked: ${results.length}`,
      `Owned: ${owned.length}; unowned: ${unowned.length}`,
      '',
      'Matches (last matching rule wins):',
      ...(results.length ? results.map((item) => item.winner
        ? `- ${item.path} -> ${item.winner.owners.join(' ')} [line ${item.winner.lineNumber}: ${item.winner.pattern.source}]`
        : `- ${item.path} -> UNOWNED`) : ['- none']),
      '',
      'Unowned paths:',
      ...(unowned.length ? unowned.map((item) => `- ${item.path}`) : ['- none']),
      '',
      'Diagnostics:',
      ...(parsed.diagnostics.length ? parsed.diagnostics.map((item) => `- ${item}`) : ['- none'])
    ];
    return {
      text: lines.join('\n'),
      filename: 'codeowners-match-report.txt',
      mime: 'text/plain;charset=utf-8',
      warnings: [
        'This is a browser-local approximation, not a GitHub branch-protection or repository check.',
        'Matching is case-sensitive and uses repository-relative slash paths; GitHub behavior can vary by platform and repository context.',
        'Unsupported or intentionally omitted GitHub features include team/user validation, repository discovery, branch protection, generated CODEOWNERS locations, full gitignore-style edge cases, and escaped-space patterns.',
        ...(parsed.diagnostics.length ? ['Some CODEOWNERS lines were ignored; review Diagnostics.'] : [])
      ]
    };
  };

  window.AHDevToolEngines['codeowners-match-simulator'] = {
    title: 'CODEOWNERS Coverage & Match Simulator',
    description: 'Match repository-relative paths against a bounded CODEOWNERS glob subset using case-sensitive last-match-wins logic and report unowned paths. Browser-local only; this does not perform GitHub or branch-protection checks.',
    limitations: 'Supports comments, owners, *, **, ?, [] classes, leading /, and trailing / directory patterns. It is case-sensitive, accepts up to 3 MB combined input and 10,000 paths, and intentionally omits GitHub repository context, team/user validation, branch protection, generated-file discovery, and full escaping/ignore-pattern parity.',
    fields: [
      { id: 'codeowners', label: 'CODEOWNERS rules', type: 'textarea', placeholder: '# Owners\n*.js @frontend\nsrc/ @platform', help: 'Paste CODEOWNERS text. Rules are evaluated in order; the last matching rule wins.' },
      { id: 'paths', label: 'Repository-relative paths', type: 'textarea', placeholder: 'src/app.js\nREADME.md\ninfra/main.tf', help: 'Enter one path per line. Paths are normalized to slash-separated, repository-relative form and matched case-sensitively.' }
    ],
    run
  };
})();
