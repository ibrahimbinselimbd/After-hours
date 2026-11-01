(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_INPUT = 2 * 1024 * 1024;
  const MAX_SOURCES = 5000;
  const MAX_EMBEDDED_BYTES = 5 * 1024 * 1024;
  const MAX_FINDINGS = 100;

  const text = (value) => typeof value === 'string' ? value : '';
  const lineOf = (source, index) => source.slice(0, index).split('\n').length;
  const byteLength = (value) => {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(value).byteLength;
    return value.length;
  };

  function addFinding(list, kind, detail, sourceIndex) {
    if (list.length >= MAX_FINDINGS) return;
    list.push(`${kind}${Number.isInteger(sourceIndex) ? ` [source ${sourceIndex + 1}]` : ''}: ${detail}`);
  }

  function pathFindings(value) {
    const findings = [];
    const source = text(value);
    if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(source)) findings.push('absolute filesystem path');
    if (/(?:^|[\\/])(?:Users|home|var|private|tmp|workspace|node_modules)(?:[\\/]|$)/i.test(source)) findings.push('machine or build-directory segment');
    if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(source)) findings.push('parent-directory traversal');
    if (/^(?:file|webpack|ng|vite|parcel|rollup):\/\//i.test(source)) findings.push('tool or local URI');
    if (/^(?:https?|ftp):\/\//i.test(source)) findings.push('external URL');
    return findings;
  }

  function scanSecrets(value) {
    const source = text(value);
    const checks = [
      [/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i, 'private-key material'],
      [/(?:AKIA|ASIA)[0-9A-Z]{16}/, 'AWS access-key-shaped value'],
      [/(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{20,}/, 'GitHub token-shaped value'],
      [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token-shaped value'],
      [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT-shaped value'],
      [/(?:api[_-]?key|secret|access[_-]?token|auth[_-]?token|password)\s*[:=]\s*["'`]([^"'`\n]{8,})["'`]/i, 'credential-like assignment']
    ];
    return checks.filter((entry) => entry[0].test(source)).map((entry) => entry[1]);
  }

  function run(values) {
    const input = values && typeof values === 'object' ? text(values.sourceMap) : '';
    if (!input.trim()) return 'No source map JSON was provided. Paste a bounded source map object to inspect it locally.';
    if (input.length > MAX_INPUT) return `Input exceeds the ${MAX_INPUT.toLocaleString()} character local limit. No parsing was attempted.`;

    let map;
    try { map = JSON.parse(input); }
    catch (error) {
      const position = Number.isInteger(error && error.position) ? ` near character ${error.position}` : '';
      return `Could not parse source map JSON${position}. ${error && error.message ? error.message : 'Check quotes, commas, and braces.'}`;
    }
    if (!map || typeof map !== 'object' || Array.isArray(map)) return 'The top-level JSON value must be a source map object, not an array or primitive.';

    const findings = [];
    const warnings = [];
    const sources = Array.isArray(map.sources) ? map.sources : [];
    const contents = Array.isArray(map.sourcesContent) ? map.sourcesContent : null;
    const embeddedBytes = contents ? contents.reduce((sum, item) => sum + (typeof item === 'string' ? byteLength(item) : 0), 0) : 0;

    if (map.version !== undefined && map.version !== 3) warnings.push(`Source-map version is ${String(map.version)}; this inspector expects version 3 conventions.`);
    if (!Array.isArray(map.sources)) warnings.push('sources is missing or is not an array; source inventory and embedded-source checks are incomplete.');
    if (sources.length > MAX_SOURCES) return `The map lists ${sources.length.toLocaleString()} sources, exceeding the ${MAX_SOURCES.toLocaleString()} source limit. No source scan was attempted.`;
    if (contents && embeddedBytes > MAX_EMBEDDED_BYTES) return `Embedded sourcesContent is ${embeddedBytes.toLocaleString()} UTF-8 bytes, exceeding the ${MAX_EMBEDDED_BYTES.toLocaleString()} byte scan limit.`;
    if (contents && contents.length !== sources.length) warnings.push(`sourcesContent has ${contents.length} entries for ${sources.length} sources; unmatched entries are reported as incomplete evidence.`);
    if (!contents) warnings.push('sourcesContent is absent; privacy checks cover source paths only, not original source text.');
    if (map.sections) warnings.push('Indexed source map detected: sections are not traversed or VLQ-decoded by this bounded inspector.');
    if (map.mappings !== undefined && typeof map.mappings !== 'string') warnings.push('mappings is not a string; mapping coverage cannot be assessed.');
    if (typeof map.sourceRoot === 'string') {
      const rootIssues = pathFindings(map.sourceRoot);
      if (rootIssues.length) addFinding(findings, 'Path exposure', `sourceRoot contains ${rootIssues.join(', ')} (“${map.sourceRoot}”)`);
    }

    let embeddedCount = 0;
    let missingCount = 0;
    let secretCount = 0;
    sources.forEach((source, index) => {
      if (typeof source !== 'string') {
        addFinding(findings, 'Malformed source entry', 'sources entry is not a string', index);
        return;
      }
      const pathIssues = pathFindings(source);
      if (pathIssues.length) addFinding(findings, 'Path exposure', `${pathIssues.join(', ')} (“${source}”)`, index);
      const content = contents ? contents[index] : undefined;
      if (typeof content === 'string') {
        embeddedCount += 1;
        const secrets = scanSecrets(content);
        secrets.forEach((kind) => addFinding(findings, 'Heuristic secret signal', `${kind} found in embedded source`, index));
        secretCount += secrets.length;
      } else if (contents) {
        missingCount += 1;
      }
    });

    if (findings.length >= MAX_FINDINGS) warnings.push(`Finding output was capped at ${MAX_FINDINGS}; additional matches may exist.`);
    const lines = [
      'Source map privacy inspection — local evidence report',
      '',
      `Version: ${map.version === undefined ? 'not declared' : String(map.version)}`,
      `Sources: ${sources.length.toLocaleString()}`,
      `Embedded sourcesContent entries: ${embeddedCount.toLocaleString()}${contents ? ` (${embeddedBytes.toLocaleString()} UTF-8 bytes)` : ''}`,
      `Heuristic secret signals: ${secretCount.toLocaleString()}`,
      `Path/privacy findings: ${findings.length.toLocaleString()}`,
      ''
    ];
    if (contents && missingCount) lines.push(`Incomplete embedding evidence: ${missingCount.toLocaleString()} source entries have no string sourcesContent value.`, '');
    lines.push(findings.length ? 'Findings:' : 'Findings: no heuristic path or secret signals matched the inspected fields.');
    findings.forEach((finding, index) => lines.push(`${index + 1}. ${finding}`));
    if (warnings.length) {
      lines.push('', 'Diagnostics and limitations:');
      warnings.forEach((warning) => lines.push(`- ${warning}`));
    }
    lines.push('', 'This is a heuristic audit of pasted JSON. A match is not proof of a secret, and no remote fetch, decryption, symbolication, or authoritative source-map validation was performed. Mapping VLQ data is reported only as present; it is not decoded.');
    return lines.join('\n');
  }

  window.AHDevToolEngines['source-map-privacy-inspector'] = {
    title: 'Source Map Inspector & Embedded-Source Privacy Checker',
    description: 'Inspect a bounded pasted source map for embedded original sources, exposed paths, and heuristic secret signals locally. Mapping data is inventoried but not VLQ-decoded.',
    limitations: 'Accepts one pasted JSON source map up to 2 MiB, 5,000 sources, and 5 MiB of embedded source text. Indexed maps, non-standard maps, large maps, mapping coverage, and secret detection are incomplete or heuristic; no remote/server checks are performed.',
    fields: [
      {
        id: 'sourceMap',
        label: 'Source map JSON',
        type: 'textarea',
        placeholder: 'Paste a .map JSON object here…',
        help: 'Paste one bounded source map. The input stays in this browser; URLs and files referenced by the map are not fetched.'
      }
    ],
    run
  };
})();
