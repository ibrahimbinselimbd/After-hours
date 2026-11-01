(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_INPUT = 512 * 1024;
  const MAX_PROVIDERS = 200;
  const MAX_HASHES_PER_PROVIDER = 5000;

  const cleanLine = (value) => String(value ?? '').replace(/\r\n?/g, '\n');
  const countLines = (source, index) => source.slice(0, index).split('\n').length;
  const quoteValue = (body, key) => {
    const match = body.match(new RegExp('(?:^|\\n)\\s*' + key + '\\s*=\\s*"([^"\\n]*)"'));
    return match ? match[1] : '';
  };

  function findBlockEnd(source, openIndex) {
    let depth = 0;
    let quote = false;
    let escaped = false;
    let comment = '';
    for (let i = openIndex; i < source.length; i += 1) {
      const ch = source[i];
      const next = source[i + 1] || '';
      if (comment === 'line') {
        if (ch === '\n') comment = '';
        continue;
      }
      if (comment === 'block') {
        if (ch === '*' && next === '/') { comment = ''; i += 1; }
        continue;
      }
      if (!quote && ch === '#' ) { comment = 'line'; continue; }
      if (!quote && ch === '/' && next === '/') { comment = 'line'; i += 1; continue; }
      if (!quote && ch === '/' && next === '*') { comment = 'block'; i += 1; continue; }
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') quote = false;
        continue;
      }
      if (ch === '"') { quote = true; continue; }
      if (ch === '{') depth += 1;
      if (ch === '}' && --depth === 0) return i;
    }
    return -1;
  }

  function parseHashes(body) {
    const match = body.match(/(?:^|\n)\s*hashes\s*=\s*\[([\s\S]*?)\]/);
    if (!match) return { values: [], present: false, malformed: false };
    const values = [];
    const tokenPattern = /"([^"\n]*)"/g;
    let token;
    while ((token = tokenPattern.exec(match[1])) !== null) {
      if (values.length >= MAX_HASHES_PER_PROVIDER) break;
      values.push(token[1]);
    }
    return { values, present: true, malformed: !/\]\s*(?:\n|$)/.test(match[0]) };
  }

  function parseLockfile(input) {
    const source = cleanLine(input);
    const providers = [];
    const providerPattern = /provider\s+"([^"]+)"\s*\{/g;
    let match;
    let declarations = 0;
    while ((match = providerPattern.exec(source)) !== null) {
      declarations += 1;
      if (declarations > MAX_PROVIDERS) throw new Error(`Too many provider blocks. The limit is ${MAX_PROVIDERS}.`);
      const end = findBlockEnd(source, providerPattern.lastIndex - 1);
      if (end < 0) {
        providers.push({ name: match[1], line: countLines(source, match.index), error: 'Unclosed provider block.' });
        break;
      }
      const body = source.slice(providerPattern.lastIndex, end);
      const hashes = parseHashes(body);
      const h1 = hashes.values.filter((hash) => hash.startsWith('h1:'));
      const zh = hashes.values.filter((hash) => hash.startsWith('zh:'));
      const other = hashes.values.filter((hash) => !hash.startsWith('h1:') && !hash.startsWith('zh:'));
      providers.push({
        name: match[1],
        line: countLines(source, match.index),
        version: quoteValue(body, 'version'),
        constraints: quoteValue(body, 'constraints'),
        hashes,
        h1,
        zh,
        other,
        error: hashes.malformed ? 'The hashes list appears to be unterminated.' : ''
      });
      providerPattern.lastIndex = end + 1;
    }
    return { source, providers, declarations };
  }

  function run(values) {
    const input = values && typeof values === 'object' ? String(values.lockfile || '') : '';
    const requestedPlatforms = values && typeof values === 'object'
      ? String(values.platforms || '').split(/[\s,]+/).map((item) => item.trim()).filter(Boolean).slice(0, 30)
      : [];
    if (!input.trim()) return 'No lockfile text was provided. Paste a Terraform .terraform.lock.hcl file to inspect it.';
    if (input.length > MAX_INPUT) return `Input exceeds the ${MAX_INPUT.toLocaleString()} character local limit. No parsing was attempted.`;

    let parsed;
    try { parsed = parseLockfile(input); }
    catch (error) { return `Could not inspect the lockfile safely: ${error.message}`; }
    if (!parsed.providers.length) {
      return 'No provider blocks were found. Expected blocks such as provider "registry.terraform.io/hashicorp/aws" { ... }. This tool does not validate arbitrary HCL.';
    }

    const lines = ['Terraform dependency lockfile — local evidence report', ''];
    lines.push(`Provider blocks found: ${parsed.providers.length}${parsed.declarations > parsed.providers.length ? ` (stopped after ${parsed.providers.length} parsed block${parsed.providers.length === 1 ? '' : 's'})` : ''}`);
    if (requestedPlatforms.length) lines.push(`Requested platform labels: ${requestedPlatforms.join(', ')}`);
    lines.push('');

    parsed.providers.forEach((provider, index) => {
      lines.push(`${index + 1}. ${provider.name} (line ${provider.line})`);
      if (provider.error) lines.push(`   Diagnostic: ${provider.error}`);
      lines.push(`   Version: ${provider.version || 'not found'}`);
      lines.push(`   Constraints: ${provider.constraints || 'not found'}`);
      if (!provider.hashes.present) {
        lines.push('   Hash evidence: hashes attribute not found; package integrity evidence is incomplete.');
      } else {
        lines.push(`   Hash evidence: ${provider.hashes.values.length} entr${provider.hashes.values.length === 1 ? 'y' : 'ies'} (${provider.h1.length} h1, ${provider.zh.length} zh${provider.other.length ? `, ${provider.other.length} unrecognised prefix` : ''}).`);
        if (!provider.h1.length) lines.push('   Caution: no h1 checksum was found in this block.');
        if (!provider.zh.length) lines.push('   Caution: no zh checksum was found in this block.');
        if (provider.other.length) lines.push(`   Caution: ignored ${provider.other.length} hash value(s) with an unrecognised prefix.`);
      }
      if (requestedPlatforms.length) {
        lines.push(`   Platform evidence: cannot map ${requestedPlatforms.join(', ')} to individual zh hashes from pasted text alone; registry/mirror metadata is required.`);
      } else {
        lines.push('   Platform evidence: no target platforms supplied; zh hashes are counted but not mapped to platforms.');
      }
      lines.push('');
    });

    const incomplete = parsed.providers.filter((provider) => !provider.version || !provider.hashes.present || provider.error);
    lines.push('Interpretation and limits:');
    lines.push('- This is a syntax-shaped, read-only inventory of pasted lockfile evidence; it does not verify hashes, versions, constraints, providers, or registry availability.');
    lines.push('- A zh count is not proof that every requested OS/architecture is covered, and a missing zh count is not proof of a specific missing platform.');
    lines.push(`- ${incomplete.length ? `${incomplete.length} provider block(s) have incomplete evidence or diagnostics.` : 'All parsed blocks contain a version and hashes attribute.'}`);
    return lines.join('\n').trim();
  }

  window.AHDevToolEngines['terraform-lockfile-inspector'] = {
    title: 'Terraform Dependency Lockfile Inspector',
    description: 'Inspect pasted Terraform provider versions, constraints, h1/zh hashes, and cautious platform-evidence gaps locally; no registry or network verification is performed.',
    limitations: 'Bounded pasted .terraform.lock.hcl text only (512,000 characters and 200 provider blocks). This reports textual evidence and cannot authoritatively map hashes to platforms or verify registry, mirror, provider, version, or constraint data.',
    fields: [
      { id: 'lockfile', label: 'Terraform lockfile', type: 'textarea', placeholder: 'Paste .terraform.lock.hcl contents', help: 'Paste one lockfile as plain text. No file upload or network lookup is used.' },
      { id: 'platforms', label: 'CI target platforms (optional)', type: 'text', placeholder: 'linux_amd64, darwin_arm64', help: 'Optional labels are used only to explain that pasted hashes cannot be mapped authoritatively to platforms.' }
    ],
    run
  };
})();
