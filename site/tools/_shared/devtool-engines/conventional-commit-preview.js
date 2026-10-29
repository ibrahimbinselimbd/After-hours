(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_CHARS = 20000;
  const MAX_LINES = 500;
  const TYPE_RE = /^[a-z][a-z0-9-]*$/;
  const RELEASE_TYPES = {
    feat: 'minor',
    fix: 'patch',
    perf: 'patch',
    refactor: 'patch',
    docs: 'patch',
    style: 'patch',
    test: 'patch',
    build: 'patch',
    ci: 'patch',
    chore: 'patch',
    revert: 'patch'
  };

  function clean(value) {
    return String(value == null ? '' : value).replace(/\r\n?/g, '\n');
  }

  function hasBreakingFooter(lines) {
    for (let i = 1; i < lines.length; i += 1) {
      if (/^BREAKING[ -]CHANGE\s*:/i.test(lines[i])) return true;
    }
    return false;
  }

  function breakingFooterHasValue(lines) {
    for (let i = 1; i < lines.length; i += 1) {
      const match = lines[i].match(/^BREAKING[ -]CHANGE\s*:\s*(.*)$/i);
      if (match) {
        if (match[1].trim()) return true;
        for (let j = i + 1; j < lines.length; j += 1) {
          if (lines[j].trim()) return true;
        }
        return false;
      }
    }
    return true;
  }

  function run(values) {
    const source = clean(values && values.message);
    const errors = [];
    const warnings = [];

    if (!source.trim()) {
      return 'Conventional Commit preview\n\nNo commit message supplied. Paste one message to validate its header, body, and footers.';
    }
    if (source.length > MAX_CHARS) {
      return `Input is too large to analyze safely (${source.length} characters; limit ${MAX_CHARS}).`;
    }

    const lines = source.split('\n');
    if (lines.length > MAX_LINES) {
      return `Input is too complex to analyze safely (${lines.length} lines; limit ${MAX_LINES}).`;
    }

    const header = lines[0];
    const match = header.match(/^([^\s():!]+)(?:\(([^()\r\n]+)\))?(!)?:\s*(.*)$/);
    let type = '';
    let scope = '';
    let bang = false;
    let description = '';

    if (!match) {
      errors.push('Header must follow “type(scope)!: description”; type, colon, and a non-empty description are required.');
    } else {
      type = match[1];
      scope = match[2] || '';
      bang = Boolean(match[3]);
      description = match[4].trim();
      if (!TYPE_RE.test(type)) {
        errors.push(`Type “${type}” must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.`);
      }
      if (!description) errors.push('Header description is empty.');
      if (/\s$/.test(header)) warnings.push('Header has trailing whitespace.');
    }

    const footerPresent = hasBreakingFooter(lines);
    if (footerPresent && !breakingFooterHasValue(lines)) {
      errors.push('BREAKING CHANGE footer has no explanatory value.');
    }
    if (/^BREAKING[ -]CHANGE\s*:/i.test(header)) {
      warnings.push('BREAKING CHANGE belongs in a footer or use ! before the colon in the header.');
    }
    if (lines.some(line => /^BREAKING-CHANGE\s*:/i.test(line))) {
      warnings.push('BREAKING-CHANGE is accepted as the common footer alias; BREAKING CHANGE: is the canonical spelling.');
    }

    let release = 'none';
    let releaseReason = 'The message is not a recognized release-bearing type.';
    if (bang || footerPresent) {
      release = 'major';
      releaseReason = bang ? 'The header contains ! (breaking change).' : 'A BREAKING CHANGE footer is present.';
    } else if (RELEASE_TYPES[type]) {
      release = RELEASE_TYPES[type];
      releaseReason = `Type “${type}” maps to a ${release} preview.`;
    } else if (type) {
      warnings.push(`Type “${type}” is structurally valid but has no built-in release mapping.`);
    }

    const result = [
      'Conventional Commit preview',
      '',
      errors.length ? 'Status: INVALID' : 'Status: VALID STRUCTURE',
      `Type: ${type || '(not parsed)'}`,
      `Scope: ${scope || '(none)'}`,
      `Breaking marker: ${bang ? 'yes (!)' : 'no'}`,
      `BREAKING CHANGE footer: ${footerPresent ? 'yes' : 'no'}`,
      `Release-type preview: ${release}`,
      `Reason: ${releaseReason}`
    ];
    if (errors.length) {
      result.push('', 'Diagnostics:', ...errors.map(item => `- ${item}`));
    }
    if (warnings.length) {
      result.push('', 'Notes:', ...warnings.map(item => `- ${item}`));
    }
    result.push('', 'This is a local preview only; repository release configuration, commit history, plugins, and CI policy are not checked.');
    return result.join('\n');
  }

  window.AHDevToolEngines['conventional-commit-preview'] = {
    title: 'Conventional Commit Validator & Release-Type Preview',
    description: 'Validate one pasted Conventional Commit message locally and preview its patch, minor, major, or no-release impact; repository release configuration is not checked.',
    limitations: 'Covers common Conventional Commits 1.0.0 header and BREAKING CHANGE footer forms for one bounded pasted message. It does not inspect repository history, commitlint configuration, changelog tooling, plugins, or guarantee an actual release version.',
    fields: [
      {
        id: 'message',
        label: 'Commit message',
        type: 'textarea',
        placeholder: 'feat(parser)!: support quoted values\n\nBREAKING CHANGE: quoted values now preserve escapes.',
        help: `Paste one commit message (up to ${MAX_CHARS} characters and ${MAX_LINES} lines).`
      }
    ],
    run
  };
})();
