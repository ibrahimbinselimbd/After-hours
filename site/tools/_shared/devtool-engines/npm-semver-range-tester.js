(() => {
  'use strict';

  const MAX_VERSIONS_TEXT = 20000;
  const MAX_VERSIONS = 200;
  const MAX_RANGE = 2000;

  const fail = (message) => { throw new Error(message); };

  function parseVersion(input, label) {
    const raw = String(input == null ? '' : input).trim();
    const match = raw.match(/^[v=]?([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
    if (!match) fail(`${label} “${raw}” is not a supported SemVer (use MAJOR.MINOR.PATCH, optionally -prerelease).`);
    const numbers = match.slice(1, 4).map(Number);
    if (numbers.some(n => !Number.isSafeInteger(n) || n > 1000000000)) fail(`${label} “${raw}” has an invalid or excessive numeric component.`);
    const prerelease = match[4] ? match[4].split('.') : [];
    if (prerelease.some(id => /^0[0-9]+$/.test(id))) fail(`${label} “${raw}” has a leading-zero prerelease identifier.`);
    return { major: numbers[0], minor: numbers[1], patch: numbers[2], prerelease, raw };
  }

  function compare(a, b) {
    for (const key of ['major', 'minor', 'patch']) {
      if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
    }
    if (!a.prerelease.length && !b.prerelease.length) return 0;
    if (!a.prerelease.length) return 1;
    if (!b.prerelease.length) return -1;
    for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
      if (i >= a.prerelease.length) return -1;
      if (i >= b.prerelease.length) return 1;
      const x = a.prerelease[i], y = b.prerelease[i];
      if (x === y) continue;
      const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
      if (xn && yn) return Number(x) < Number(y) ? -1 : 1;
      if (xn !== yn) return xn ? -1 : 1;
      return x < y ? -1 : 1;
    }
    return 0;
  }

  const base = (major, minor = 0, patch = 0) => ({ major, minor, patch, prerelease: [], raw: `${major}.${minor}.${patch}` });
  const sameCore = (a, b) => a.major === b.major && a.minor === b.minor && a.patch === b.patch;
  const hasPrerelease = v => v.prerelease.length > 0;
  const prereleaseCoreKey = v => `${v.major}.${v.minor}.${v.patch}`;

  function parsePartial(value, label) {
    let text = value.trim().replace(/^v/, '');
    if (text === '' || /^[xX*]$/.test(text)) return { kind: 'any' };
    if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(text)) {
      return { kind: 'exact', version: parseVersion(text, label) };
    }
    const parts = text.split('.');
    if (parts.length > 3) fail(`${label} “${value}” has too many version components.`);
    const nums = [];
    let wildcard = false;
    for (const part of parts) {
      if (/^[xX*]$/.test(part)) { wildcard = true; nums.push(null); }
      else if (/^\d+$/.test(part) && !(part.length > 1 && part[0] === '0')) nums.push(Number(part));
      else { wildcard = false; break; }
    }
    if (nums.length !== parts.length || nums.some(n => n === null && nums.indexOf(n) !== nums.length - 1)) fail(`${label} “${value}” is not a supported version, wildcard, or comparator.`);
    if (wildcard || parts.length < 3) {
      const count = nums.filter(n => n !== null).length;
      if (count === 0) return { kind: 'any' };
      const lower = base(nums[0], nums[1] == null ? 0 : nums[1], nums[2] == null ? 0 : nums[2]);
      const upper = count === 1 ? base(nums[0] + 1) : base(nums[0], nums[1] + 1);
      return { kind: 'wildcard', lower, upper, text: value };
    }
    return { kind: 'exact', version: parseVersion(`${nums[0]}.${nums[1]}.${nums[2]}`, label) };
  }

  function comparator(op, version) { return { op, version }; }
  function expandToken(token) {
    if (!token || token === '*') return [];
    const operatorMatch = token.match(/^(\^|~|>=|<=|>|<|=)?(.*)$/);
    const op = operatorMatch[1] || '';
    const value = operatorMatch[2];
    if (!value) fail(`Range token “${token}” is incomplete.`);
    if (op === '^' || op === '~') {
      const partial = parsePartial(value, 'Range');
      if (partial.kind === 'any') return [];
      const lower = partial.kind === 'exact' ? partial.version : partial.lower;
      let upper;
      if (op === '~') upper = partial.kind === 'exact' || partial.lower.minor !== 0 || /^\d+\.\d+/.test(value) ? base(lower.major, lower.minor + 1) : base(lower.major + 1);
      else if (lower.major > 0) upper = base(lower.major + 1);
      else if (lower.minor > 0) upper = base(0, lower.minor + 1);
      else upper = base(0, 0, lower.patch + 1);
      return [comparator('>=', lower), comparator('<', upper)];
    }
    const partial = parsePartial(value, 'Range');
    if (partial.kind === 'any') {
      if (op && op !== '=') fail(`Comparator “${token}” cannot use an unrestricted wildcard.`);
      return [];
    }
    if (partial.kind === 'wildcard') {
      if (op === '' || op === '=') return [comparator('>=', partial.lower), comparator('<', partial.upper)];
      if (op === '>=') return [comparator('>=', partial.lower)];
      if (op === '<') return [comparator('<', partial.lower)];
      if (op === '>') return [comparator('>=', partial.upper)];
      if (op === '<=') return [comparator('<', partial.upper)];
      fail(`Comparator “${token}” is not supported for a wildcard.`);
    }
    return [comparator(op || '=', partial.version)];
  }

  function parseRange(range) {
    const source = String(range == null ? '' : range).trim();
    if (!source) fail('Enter a range such as ^1.2.0, >=1.0.0 <2.0.0, or 1.4.x.');
    if (source.length > MAX_RANGE) fail(`Range is too long; limit is ${MAX_RANGE} characters.`);
    return source.split('||').map((alternative, index) => {
      const tokens = alternative.trim().split(/\s+/).filter(Boolean);
      if (!tokens.length) fail(`Range alternative ${index + 1} is empty.`);
      const checks = tokens.flatMap(expandToken);
      return { text: alternative.trim(), checks };
    });
  }

  function checkComparator(version, check) {
    const result = compare(version, check.version);
    return check.op === '=' ? result === 0 : check.op === '>=' ? result >= 0 : check.op === '<=' ? result <= 0 : check.op === '>' ? result > 0 : result < 0;
  }

  function satisfiesAlternative(version, alternative) {
    if (hasPrerelease(version)) {
      const mentioned = alternative.checks.some(check => hasPrerelease(check.version) && sameCore(version, check.version));
      if (!mentioned) return { ok: false, reason: 'prerelease requires a comparator mentioning the same core version' };
    }
    for (const check of alternative.checks) if (!checkComparator(version, check)) return { ok: false, reason: `${check.op}${check.version.raw}` };
    return { ok: true, reason: '' };
  }

  function run(values) {
    const input = values && typeof values === 'object' ? values : {};
    const versionsText = String(input.versions == null ? '' : input.versions).trim();
    const rangeText = String(input.range == null ? '' : input.range).trim();
    if (!versionsText) return 'Input error: paste one or more versions, one per line or separated by commas.';
    if (versionsText.length > MAX_VERSIONS_TEXT) return `Input error: versions input exceeds the ${MAX_VERSIONS_TEXT}-character limit.`;
    const pieces = versionsText.split(/[\s,]+/).filter(Boolean);
    if (pieces.length > MAX_VERSIONS) return `Input error: provide at most ${MAX_VERSIONS} versions.`;
    let alternatives;
    try { alternatives = parseRange(rangeText); } catch (error) { return `Range error: ${error.message}`; }
    const versions = [];
    for (let i = 0; i < pieces.length; i++) {
      try { versions.push(parseVersion(pieces[i], `Version ${i + 1}`)); }
      catch (error) { return `Version error: ${error.message}`; }
    }
    const lines = [`Range: ${rangeText}`, `Checked: ${versions.length} version(s)`, ''];
    let matched = 0;
    for (const version of versions) {
      const results = alternatives.map(a => satisfiesAlternative(version, a));
      const winner = results.findIndex(result => result.ok);
      if (winner >= 0) { matched++; lines.push(`✓ ${version.raw}  SATISFIES  (alternative ${winner + 1}: ${alternatives[winner].text})`); }
      else lines.push(`✗ ${version.raw}  does not satisfy  (${results.map((r, i) => `alt ${i + 1}: ${r.reason || 'failed'}`).join('; ')})`);
    }
    lines.push('', `Result: ${matched} of ${versions.length} version(s) satisfy the range.`);
    lines.push('Scope: bounded local SemVer evaluation; no npm registry, latest-version, or package metadata lookup was performed.');
    return lines.join('\n');
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['npm-semver-range-tester'] = {
    title: 'npm SemVer Range Satisfaction Tester',
    description: 'Test pasted SemVer versions against a bounded npm-style range locally, with per-version explanations. This tool never checks npm or claims a latest version.',
    limitations: 'Supports strict MAJOR.MINOR.PATCH versions, comparators, caret (^), tilde (~), wildcards (x, X, *), whitespace AND, and || alternatives plus basic npm-style prerelease gating. It does not implement every node-semver grammar feature (such as hyphen ranges, tags, aliases, npm registry metadata, or latest-version resolution). Inputs are capped at 200 versions and 20,000 version-text characters.',
    fields: [
      { id: 'versions', label: 'Versions to test', type: 'textarea', placeholder: '1.2.3\n1.5.0\n2.0.0-beta.1', help: 'Enter up to 200 local/pasted versions, one per line or separated by commas.' },
      { id: 'range', label: 'npm-style range', type: 'text', placeholder: '^1.2.0 || >=2.0.0 <3.0.0', help: 'Use comparators, ^, ~, x/* wildcards, whitespace AND, and || alternatives.' }
    ],
    run
  };
})();
