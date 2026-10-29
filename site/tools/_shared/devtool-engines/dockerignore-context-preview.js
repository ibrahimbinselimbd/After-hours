(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_INPUT_CHARS = 2 * 1024 * 1024;
  const MAX_ENTRIES = 10000;
  const MAX_PATH_CHARS = 512;

  const normalizePath = (value) => String(value == null ? '' : value)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');

  const isSafeRelativePath = (path) => {
    if (!path || path.startsWith('/') || /^[A-Za-z]:\//.test(path)) return false;
    return !path.split('/').some((part) => part === '..' || part === '');
  };

  const escapeRegex = (value) => value.replace(/[.+^${}()|\\]/g, '\\$&');

  // Deliberate subset: *, ?, **, slash anchoring, trailing-slash directory intent,
  // comments, and ordered ! negation. Character classes are supported conservatively.
  const globRegex = (glob) => {
    let source = '';
    for (let i = 0; i < glob.length; i += 1) {
      const ch = glob[i];
      if (ch === '*') {
        if (glob[i + 1] === '*') {
          i += 1;
          if (glob[i + 1] === '/') {
            i += 1;
            source += '(?:[^/]+/)*';
          } else {
            source += '.*';
          }
        } else {
          source += '[^/]*';
        }
      } else if (ch === '?') {
        source += '[^/]';
      } else if (ch === '[') {
        const end = glob.indexOf(']', i + 1);
        if (end < 0) throw new Error('unclosed character class');
        const body = glob.slice(i + 1, end);
        if (!body || body.includes('/')) throw new Error('empty or slash-containing character class');
        source += '[' + (body[0] === '!' ? '^' + body.slice(1) : body) + ']';
        i = end;
      } else {
        source += escapeRegex(ch);
      }
    }
    return source;
  };

  const compilePattern = (raw, lineNumber) => {
    let pattern = String(raw).replace(/\r$/, '');
    if (!pattern.trim() || pattern.trim().startsWith('#')) return null;
    pattern = pattern.trim();
    let negated = false;
    if (pattern.startsWith('!')) {
      negated = true;
      pattern = pattern.slice(1);
    }
    if (!pattern || pattern === '.') return { ignored: false, lineNumber, invalid: 'empty pattern' };
    const directoryOnly = pattern.endsWith('/');
    pattern = pattern.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!pattern) return { ignored: false, lineNumber, invalid: 'empty pattern' };
    const rooted = pattern.includes('/');
    let source = globRegex(pattern);
    if (rooted) {
      source = '^' + source + (directoryOnly ? '(?:/.*)?' : '') + '$';
    } else {
      // Docker-style unqualified patterns can match a basename at any depth;
      // when that basename names a directory, its descendants are included too.
      source = '(^|.*/)' + source + '(?:/.*)?$';
    }
    return { regex: new RegExp(source), negated, lineNumber, text: raw, directoryOnly };
  };

  const parseManifest = (raw, warnings) => {
    const source = String(raw == null ? '' : raw);
    if (source.length > MAX_INPUT_CHARS) throw new Error('Manifest is too large. Keep each pasted input at or below 2 MiB.');
    const trimmed = source.trim();
    if (!trimmed) throw new Error('Manifest is empty. Provide a JSON array or one path per line.');
    let values;
    if (trimmed.startsWith('[')) {
      try { values = JSON.parse(trimmed); } catch (error) { throw new Error('Manifest JSON is invalid: ' + error.message); }
      if (!Array.isArray(values)) throw new Error('Manifest JSON must be an array.');
    } else {
      values = source.split(/\r?\n/).filter((line) => line.trim() !== '').map((line, index) => {
        const tab = line.indexOf('\t');
        if (tab < 0) return line.trim();
        const path = line.slice(0, tab).trim();
        const bytesText = line.slice(tab + 1).trim();
        const bytes = Number(bytesText);
        if (!Number.isFinite(bytes) || bytes < 0) warnings.push('Manifest line ' + (index + 1) + ' has an invalid byte count; using 0.');
        return { path, bytes: Number.isFinite(bytes) && bytes >= 0 ? Math.floor(bytes) : 0 };
      });
    }
    if (values.length > MAX_ENTRIES) throw new Error('Manifest exceeds the 10,000-entry limit.');
    return values.map((entry, index) => {
      const item = typeof entry === 'string' ? { path: entry, bytes: 0 } : entry;
      if (!item || typeof item.path !== 'string') {
        warnings.push('Manifest entry ' + (index + 1) + ' is missing a string path; skipped.');
        return null;
      }
      const path = normalizePath(item.path);
      if (path.length > MAX_PATH_CHARS || !isSafeRelativePath(path)) {
        warnings.push('Manifest entry ' + (index + 1) + ' has an unsafe or oversized relative path; skipped.');
        return null;
      }
      const bytes = Number(item.bytes);
      return { path, bytes: Number.isFinite(bytes) && bytes >= 0 ? Math.floor(bytes) : 0 };
    }).filter(Boolean);
  };

  const run = (values) => {
    const input = values || {};
    const warnings = [];
    const patternsText = String(input.patterns == null ? '' : input.patterns);
    if (patternsText.length > MAX_INPUT_CHARS) return 'Patterns are too large. Keep each pasted input at or below 2 MiB.';
    const manifest = parseManifest(input.manifest, warnings);
    const patterns = [];
    patternsText.split(/\r?\n/).forEach((line, index) => {
      try {
        const compiled = compilePattern(line, index + 1);
        if (compiled && compiled.invalid) warnings.push('Pattern line ' + compiled.lineNumber + ' ignored: ' + compiled.invalid + '.');
        else if (compiled) patterns.push(compiled);
      } catch (error) {
        warnings.push('Pattern line ' + (index + 1) + ' ignored: ' + error.message + '.');
      }
    });

    let includedCount = 0;
    let includedBytes = 0;
    const included = [];
    const ignored = [];
    for (const file of manifest) {
      let isIgnored = false;
      let matchedBy = '';
      for (const pattern of patterns) {
        if (pattern.regex.test(file.path)) {
          isIgnored = !pattern.negated;
          matchedBy = pattern.text.trim();
        }
      }
      if (isIgnored) ignored.push(file.path);
      else { included.push(file.path); includedCount += 1; includedBytes += file.bytes; }
      if (matchedBy) void matchedBy;
    }

    const lines = [
      'Docker .dockerignore context preview (documented subset)',
      '',
      'Included files: ' + includedCount + ' of ' + manifest.length,
      'Estimated included bytes: ' + includedBytes.toLocaleString('en-US'),
      '',
      included.length ? 'Included paths:\n' + included.join('\n') : 'Included paths: (none)'
    ];
    if (ignored.length) lines.push('', 'Ignored paths:\n' + ignored.join('\n'));
    if (warnings.length) lines.push('', 'Warnings:\n- ' + warnings.join('\n- '));
    lines.push('', 'Scope: local manifest estimate only; this is not Docker daemon or version-parity validation.');
    return { text: lines.join('\n'), filename: 'dockerignore-context-preview.txt', mime: 'text/plain', warnings };
  };

  window.AHDevToolEngines['dockerignore-context-preview'] = {
    title: 'Docker .dockerignore Matcher & Context Preview',
    description: 'Match a pasted file manifest against a documented .dockerignore subset and estimate the included file count and bytes. This is a local manifest estimate, not Docker daemon or version-parity validation.',
    limitations: 'Supports comments, blank lines, ordered ! negation, *, ?, **, slash anchoring, and trailing-slash directory intent. It does not inspect a filesystem, resolve Docker build context rules, or claim parity with any Docker version; paths are treated as files and omitted byte values count as 0. Inputs are capped at 2 MiB each and 10,000 manifest entries.',
    fields: [
      { id: 'patterns', label: '.dockerignore patterns', type: 'textarea', placeholder: '# dependencies\nnode_modules\n!node_modules/keep.txt\n*.log', help: 'One pattern per line. This engine applies the documented subset in order; later patterns win.' },
      { id: 'manifest', label: 'File manifest', type: 'textarea', placeholder: '[{"path":"app.js","bytes":1200},{"path":"debug.log","bytes":80}]', help: 'Paste a JSON array of strings or {"path","bytes"} objects, or one path per line. Tab-separated path and byte count is also accepted.' }
    ],
    run
  };
})();
