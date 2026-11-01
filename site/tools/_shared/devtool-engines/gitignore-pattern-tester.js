(() => {
  'use strict';

  const MAX_RULE_CHARS = 50000;
  const MAX_PATH_CHARS = 50000;
  const MAX_RULES = 300;
  const MAX_PATHS = 1000;
  const MAX_PATH_LENGTH = 1000;

  const fail = (message) => ({text: `Input error: ${message}`, warnings: []});

  function parseRules(source) {
    if (source.length > MAX_RULE_CHARS) throw new Error(`rules input is limited to ${MAX_RULE_CHARS.toLocaleString()} characters`);
    const rules = [];
    const diagnostics = [];
    source.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, index) => {
      let line = raw;
      if (!line.trim()) return;
      if (/^\s*#/.test(line) && !/^\s*\\#/.test(line)) return;
      line = line.replace(/[ \t]+$/, (tail) => {
        const preceding = line.slice(0, line.length - tail.length);
        return preceding.endsWith('\\') ? tail : '';
      });
      if (!line) return;
      let negated = false;
      if (line[0] === '!' && line[1] !== '!') {
        negated = true;
        line = line.slice(1);
      }
      if (line[0] === '\\' && (line[1] === '#' || line[1] === '!')) line = line.slice(1);
      if (!line) {
        diagnostics.push(`line ${index + 1}: an empty pattern is ignored`);
        return;
      }
      const directoryOnly = line.endsWith('/') && !line.endsWith('\\/');
      if (directoryOnly) line = line.slice(0, -1);
      const anchored = line.startsWith('/');
      if (anchored) line = line.slice(1);
      if (!line) {
        diagnostics.push(`line ${index + 1}: “/” is not a useful pattern`);
        return;
      }
      rules.push({line: index + 1, source: raw, pattern: line, negated, directoryOnly, anchored});
    });
    if (rules.length > MAX_RULES) throw new Error(`at most ${MAX_RULES} non-comment rules are supported`);
    return {rules, diagnostics};
  }

  function globRegex(pattern, slashAware) {
    let out = '^';
    for (let i = 0; i < pattern.length; i += 1) {
      const ch = pattern[i];
      if (ch === '\\' && i + 1 < pattern.length) {
        out += escapeRegex(pattern[++i]);
      } else if (ch === '*') {
        if (slashAware && pattern[i + 1] === '*') {
          i += 1;
          if (pattern[i + 1] === '/') {
            i += 1;
            out += '(?:.*/)?';
          } else {
            out += '.*';
          }
        } else {
          out += slashAware ? '[^/]*' : '.*';
        }
      } else if (ch === '?') {
        out += slashAware ? '[^/]' : '.';
      } else if (ch === '[') {
        const end = pattern.indexOf(']', i + 1);
        if (end > i + 1) {
          let klass = pattern.slice(i + 1, end);
          if (klass[0] === '!') klass = '^' + klass.slice(1);
          klass = klass.replace(/\\/g, '\\\\');
          out += slashAware ? `[${klass}]` : `[${klass}]`;
          i = end;
        } else {
          out += '\\[';
        }
      } else {
        out += escapeRegex(ch);
      }
    }
    return new RegExp(`${out}$`);
  }

  function escapeRegex(value) { return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'); }

  function normalizePath(raw) {
    let path = String(raw).trim().replace(/\\/g, '/');
    path = path.replace(/^\.\//, '').replace(/\/+/g, '/');
    if (!path || path === '.') return {error: 'empty path'};
    if (path.startsWith('/') || /^[A-Za-z]:\//.test(path)) return {error: 'absolute paths are not supported; use a repository-relative path'};
    const pieces = path.split('/');
    if (pieces.some((piece) => piece === '..' || piece === '')) return {error: 'use a clean repository-relative path without “..” or empty segments'};
    return {path: pieces.join('/')};
  }

  function matchesRule(path, rule) {
    const slashAware = rule.pattern.includes('/');
    const regex = globRegex(rule.pattern, slashAware);
    const parts = path.split('/');
    const candidates = [];
    for (let i = 1; i <= parts.length; i += 1) candidates.push(parts.slice(0, i).join('/'));
    if (rule.directoryOnly) return candidates.slice(0, -1).some((candidate) => regex.test(candidate)) || regex.test(path);
    if (!slashAware) return parts.some((part) => globRegex(rule.pattern, false).test(part));
    if (rule.anchored) return regex.test(path) || candidates.slice(0, -1).some((candidate) => regex.test(candidate));
    return regex.test(path) || candidates.slice(0, -1).some((candidate) => regex.test(candidate));
  }

  function run(values) {
    try {
      const ruleText = String(values && values.rules != null ? values.rules : '');
      const pathText = String(values && values.paths != null ? values.paths : '');
      if (!ruleText.trim()) return fail('provide at least one ignore rule.');
      if (!pathText.trim()) return fail('provide at least one repository-relative path.');
      if (pathText.length > MAX_PATH_CHARS) throw new Error(`paths input is limited to ${MAX_PATH_CHARS.toLocaleString()} characters`);
      const parsed = parseRules(ruleText);
      const rawPaths = pathText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      if (rawPaths.length > MAX_PATHS) throw new Error(`at most ${MAX_PATHS} paths are supported`);
      const lines = ['Gitignore pattern test (documented subset)', ''];
      let invalid = 0;
      rawPaths.forEach((raw, pathIndex) => {
        if (raw.length > MAX_PATH_LENGTH) {
          lines.push(`${pathIndex + 1}. ${raw.slice(0, 80)}… — ERROR: path exceeds ${MAX_PATH_LENGTH} characters`);
          invalid += 1;
          return;
        }
        const normalized = normalizePath(raw);
        if (normalized.error) {
          lines.push(`${pathIndex + 1}. ${raw} — ERROR: ${normalized.error}`);
          invalid += 1;
          return;
        }
        let ignored = false;
        const matches = [];
        parsed.rules.forEach((rule) => {
          if (matchesRule(normalized.path, rule)) {
            ignored = !rule.negated;
            matches.push(`${rule.negated ? '!' : '+'} line ${rule.line}: ${rule.source}`);
          }
        });
        const winner = matches.length ? matches[matches.length - 1] : 'none';
        lines.push(`${pathIndex + 1}. ${normalized.path} — ${ignored ? 'IGNORED' : 'NOT IGNORED'}; winning rule: ${winner}`);
        if (matches.length > 1) lines.push(`   matched in order: ${matches.join(' | ')}`);
      });
      if (parsed.diagnostics.length) lines.push('', 'Rule diagnostics:', ...parsed.diagnostics.map((item) => `- ${item}`));
      if (invalid) lines.push('', `${invalid} path(s) could not be evaluated.`);
      lines.push('', 'Scope: last matching supplied rule wins. This is a synthetic browser-local check; tracked files, parent-directory traversal, .git/info/exclude, core.excludesFile, and repository-specific precedence are unknown.');
      return {text: lines.join('\n'), warnings: ['Not equivalent to git check-ignore: no repository or tracked-state context was supplied.']};
    } catch (error) {
      return fail(error && error.message ? error.message : 'unable to parse the supplied input');
    }
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['gitignore-pattern-tester'] = {
    title: 'Git Ignore Pattern Tester',
    description: 'Test repository-relative paths against a documented gitignore glob subset and see the winning rule or negation. This browser-local engine uses only the rules and paths you paste; it does not inspect a repository or server.',
    limitations: 'Synthetic matching only: tracked state, parent-directory traversal effects, .git/info/exclude, core.excludesFile, and full Git precedence are unknown. Supports comments, negation, anchored/unanchored patterns, slash-aware patterns, *, ?, **, basic bracket classes, and directory-only trailing /. Inputs are capped at 300 rules, 1,000 paths, and 50,000 characters per text area.',
    fields: [
      {id: 'rules', label: 'Ignore rules', type: 'textarea', placeholder: '# build artifacts\nbuild/\n!important.txt', help: 'One .gitignore-style rule per line. Later matching rules win.'},
      {id: 'paths', label: 'Paths to test', type: 'textarea', placeholder: 'build/app.js\nimportant.txt\nsrc/index.js', help: 'One clean repository-relative path per line; absolute paths and .. are rejected.'}
    ],
    run
  };
})();
