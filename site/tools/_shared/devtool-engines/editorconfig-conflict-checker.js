(() => {
  'use strict';

  const MAX_CONFIG_CHARS = 64 * 1024;
  const MAX_PATHS = 100;
  const MAX_PATH_CHARS = 500;
  const MAX_SECTIONS = 200;
  const MAX_PROPERTIES = 1000;

  const api = window.AHDevToolEngines = window.AHDevToolEngines || {};

  function diagnostic(line, message) {
    return `line ${line}: ${message}`;
  }

  function normalizePath(value) {
    let path = String(value || '').trim().replace(/\\/g, '/');
    path = path.replace(/^\.\//, '').replace(/^\/+/, '');
    const parts = [];
    for (const part of path.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') { if (parts.length) parts.pop(); }
      else parts.push(part);
    }
    return parts.join('/');
  }

  function globToRegExp(pattern) {
    let source = '';
    for (let i = 0; i < pattern.length; i += 1) {
      const c = pattern[i];
      if (c === '*') {
        if (pattern[i + 1] === '*') {
          i += 1;
          if (pattern[i + 1] === '/') { i += 1; source += '(?:[^/]+/)*'; }
          else source += '.*';
        } else source += '[^/]*';
      } else if (c === '?') source += '[^/]';
      else if (c === '[') {
        const end = pattern.indexOf(']', i + 1);
        if (end > i + 1) {
          let cls = pattern.slice(i + 1, end);
          if (cls[0] === '!') cls = '^' + cls.slice(1);
          source += '[' + cls.replace(/\\/g, '\\\\') + ']';
          i = end;
        } else source += '\\\[';
      } else if (c === '{') {
        const end = pattern.indexOf('}', i + 1);
        if (end > i + 1) {
          const alternatives = pattern.slice(i + 1, end).split(',').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          source += '(?:' + alternatives.join('|') + ')';
          i = end;
        } else source += '\\{';
      } else source += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    try { return new RegExp('^' + source + '$'); }
    catch (_) { return null; }
  }

  function parseConfig(raw) {
    const text = String(raw == null ? '' : raw);
    const errors = [];
    const sections = [];
    let current = { pattern: '', line: 1, properties: [] };
    sections.push(current);
    let propertyCount = 0;
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

    lines.forEach((original, index) => {
      const lineNo = index + 1;
      const line = original.trim();
      if (!line || line[0] === '#' || line[0] === ';') return;
      if (line[0] === '[') {
        if (line[line.length - 1] !== ']') { errors.push(diagnostic(lineNo, 'section header is missing a closing ]')); return; }
        const pattern = line.slice(1, -1).trim();
        if (!pattern) { errors.push(diagnostic(lineNo, 'section pattern is empty')); return; }
        if (sections.length >= MAX_SECTIONS) { errors.push(`section limit exceeded (${MAX_SECTIONS})`); return; }
        current = { pattern, line: lineNo, properties: [] };
        current.regex = globToRegExp(pattern);
        if (!current.regex) errors.push(diagnostic(lineNo, `invalid glob pattern “${pattern}”`));
        sections.push(current);
        return;
      }
      const match = line.match(/^([^=:#\s]+)\s*(?:=|:)(.*)$/);
      if (!match) { errors.push(diagnostic(lineNo, 'expected key=value or key:value')); return; }
      propertyCount += 1;
      if (propertyCount > MAX_PROPERTIES) { errors.push(`property limit exceeded (${MAX_PROPERTIES})`); return; }
      const key = match[1].trim().toLowerCase();
      const value = match[2].trim();
      current.properties.push({ key, value, line: lineNo });
    });
    return { sections, errors };
  }

  function isGlobal(section) { return section.pattern === ''; }

  function renderPath(path, parsed) {
    const matched = [];
    const settings = new Map();
    const overrides = [];
    for (const section of parsed.sections) {
      const matches = isGlobal(section) || (section.regex && section.regex.test(path));
      if (!matches) continue;
      matched.push(section);
      for (const prop of section.properties) {
        const prior = settings.get(prop.key);
        if (prior) overrides.push({ key: prop.key, from: prior, to: { section, prop } });
        if (prop.value.toLowerCase() === 'unset') settings.delete(prop.key);
        else settings.set(prop.key, { value: prop.value, section, prop });
      }
    }
    const lines = [];
    lines.push(`PATH: ${path || '(empty)'}`);
    if (!matched.length) lines.push('Matched sections: none (no effective settings supplied).');
    else {
      lines.push('Matched sections: ' + matched.map(s => isGlobal(s) ? '[global]' : `[${s.pattern}]`).join(' → '));
      if (!settings.size) lines.push('Effective settings: none (all matching keys were unset).');
      else {
        lines.push('Effective settings:');
        for (const [key, item] of settings) {
          const source = isGlobal(item.section) ? `global line ${item.prop.line}` : `[${item.section.pattern}] line ${item.prop.line}`;
          lines.push(`  ${key} = ${item.value}  (from ${source})`);
        }
      }
    }
    if (overrides.length) {
      lines.push('Overrides / conflicts:');
      for (const item of overrides) {
        const from = isGlobal(item.from.section) ? '[global]' : `[${item.from.section.pattern}]`;
        const to = isGlobal(item.to.section) ? '[global]' : `[${item.to.section.pattern}]`;
        lines.push(`  ${item.key}: ${from} line ${item.from.prop.line} (“${item.from.value}”) → ${to} line ${item.to.prop.line} (“${item.to.prop.value}”)`);
      }
    } else lines.push('Overrides / conflicts: none among matched sections.');
    return { text: lines.join('\n'), matched, overrides };
  }

  function run(values) {
    const input = values || {};
    const config = String(input.config || '');
    const pathText = String(input.paths || '');
    if (config.length > MAX_CONFIG_CHARS) return `Input is too large. EditorConfig text is limited to ${MAX_CONFIG_CHARS.toLocaleString()} characters.`;
    const pathLines = pathText.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (!config.trim()) return 'No EditorConfig text supplied. Add a global section and/or sections such as [*.js].';
    if (!pathLines.length) return 'No paths supplied. Add one relative path per line, for example: src/app.js';
    if (pathLines.length > MAX_PATHS) return `Too many paths. The local preview is limited to ${MAX_PATHS} paths.`;
    const longPath = pathLines.find(path => path.length > MAX_PATH_CHARS);
    if (longPath) return `A supplied path is too long. Each path is limited to ${MAX_PATH_CHARS} characters.`;

    const parsed = parseConfig(config);
    const paths = pathLines.map(normalizePath);
    const outputs = paths.map(path => renderPath(path, parsed));
    const report = [
      'EDITORCONFIG PARSER, PREVIEW & CONFLICT CHECKER',
      'Scope: supplied sections and paths only; parent files and editor plugins are not inferred.',
      '',
      `Parsed sections: ${Math.max(0, parsed.sections.length - 1)} plus global settings; paths checked: ${paths.length}.`,
      ...outputs.map(result => result.text)
    ];
    if (parsed.errors.length) {
      report.push('', 'DIAGNOSTICS:');
      parsed.errors.forEach(error => report.push(`  - ${error}`));
    } else report.push('', 'DIAGNOSTICS: none.');
    report.push('', 'Note: repeated keys are shown as overrides in section order. “unset” removes a previously effective key; unknown/plugin keys are displayed without validation.');
    return { text: report.join('\n'), filename: 'editorconfig-preview.txt', mime: 'text/plain' };
  }

  api['editorconfig-conflict-checker'] = {
    title: 'EditorConfig Parser, Preview & Conflict Checker',
    description: 'Parse supplied EditorConfig sections and relative paths locally, then preview matched sections, effective settings, and overrides. Parent files are not read or inferred.',
    limitations: 'Only the pasted EditorConfig text and paths are considered; parent-directory discovery, editor plugins, and runtime/editor behavior are outside scope. Glob matching is a bounded local approximation of common EditorConfig patterns. Inputs are capped at 64,000 config characters, 200 sections, 1,000 properties, and 100 paths.',
    fields: [
      { id: 'config', label: 'EditorConfig sections', type: 'textarea', placeholder: 'root = true\n\n[*.js]\nindent_style = space\nindent_size = 2\n\n[src/**.js]\nindent_size = 4', help: 'Paste the supplied sections only. A global section may contain root=true; no parent files are searched.' },
      { id: 'paths', label: 'Paths to preview', type: 'textarea', placeholder: 'src/app.js\ntest/app.test.js', help: 'Enter one relative path per line. Paths are normalized to slash-separated relative paths.' }
    ],
    run
  };
})();
