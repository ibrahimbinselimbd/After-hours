(() => {
  'use strict';

  const MAX_INPUT = 100 * 1024;
  const MAX_DIRECTIVES = 100;
  const MAX_TOKENS = 1000;
  const RESOURCE_TYPES = [
    ['script', 'script-src'],
    ['style', 'style-src'],
    ['img', 'img-src'],
    ['font', 'font-src'],
    ['connect', 'connect-src'],
    ['media', 'media-src'],
    ['worker', 'worker-src'],
    ['frame', 'frame-src'],
    ['object', 'object-src'],
    ['manifest', 'manifest-src'],
    ['form', 'form-action'],
    ['base', 'base-uri']
  ];
  const KNOWN = new Set([
    'default-src', 'script-src', 'style-src', 'img-src', 'font-src', 'connect-src',
    'media-src', 'worker-src', 'child-src', 'frame-src', 'object-src', 'manifest-src',
    'base-uri', 'form-action', 'frame-ancestors', 'navigate-to', 'sandbox', 'plugin-types',
    'require-sri-for', 'upgrade-insecure-requests', 'block-all-mixed-content',
    'report-uri', 'report-to', 'script-src-elem', 'script-src-attr', 'style-src-elem',
    'style-src-attr', 'trusted-types', 'require-trusted-types-for', 'default-src'
  ]);

  function clean(value) {
    return String(value == null ? '' : value).replace(/^\uFEFF/, '').trim();
  }

  function parsePolicy(raw) {
    const input = clean(raw);
    if (!input) throw new Error('Paste a CSP policy or header value first.');
    if (input.length > MAX_INPUT) throw new Error('Input is too large. Keep the pasted policy under 100 KB.');
    const directives = [];
    const byName = Object.create(null);
    let tokenCount = 0;
    for (const part of input.split(';')) {
      const text = part.trim();
      if (!text) continue;
      const pieces = text.split(/\s+/);
      const name = pieces.shift().toLowerCase();
      if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`Invalid directive name “${name}”.`);
      tokenCount += pieces.length;
      if (tokenCount > MAX_TOKENS) throw new Error('Policy is too complex. Keep it under 1,000 source tokens.');
      const item = {name, sources: pieces};
      if (byName[name]) {
        byName[name].duplicate = true;
        byName[name].sources.push(...pieces);
      } else {
        byName[name] = item;
        directives.push(item);
      }
      if (directives.length > MAX_DIRECTIVES) throw new Error('Policy is too complex. Keep it under 100 directives.');
    }
    if (!directives.length) throw new Error('No semicolon-delimited directives were found.');
    return {input, directives, byName};
  }

  function effective(policy, directive) {
    const exact = policy.byName[directive];
    if (exact) return {name: directive, sources: exact.sources, fallback: false};
    const fallback = policy.byName['default-src'];
    if (fallback && ['script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'media-src', 'worker-src', 'frame-src', 'object-src', 'manifest-src'].includes(directive)) {
      return {name: 'default-src', sources: fallback.sources, fallback: true};
    }
    return {name: directive, sources: [], fallback: false};
  }

  function riskFindings(policy) {
    const findings = [];
    const all = policy.directives;
    const has = name => Boolean(policy.byName[name]);
    for (const d of all) {
      const s = d.sources.map(x => x.toLowerCase());
      if (s.includes('*')) findings.push(`${d.name}: “*” is broad and can allow unintended origins.`);
      if (s.includes("'unsafe-inline'")) findings.push(`${d.name}: “'unsafe-inline'” weakens protection against injected inline code.`);
      if (s.includes("'unsafe-eval'")) findings.push(`${d.name}: “'unsafe-eval'” permits string-to-code evaluation.`);
      if (s.some(x => x === 'data:' || x === 'blob:')) findings.push(`${d.name}: data:/blob: sources expand the attack surface; allow only when required.`);
      if (s.includes('http:')) findings.push(`${d.name}: http: permits insecure transport and mixed-content exposure.`);
      if (d.duplicate) findings.push(`${d.name}: repeated directive merged for inspection; browser handling of duplicates can differ, so consolidate it.`);
      if (!KNOWN.has(d.name)) findings.push(`${d.name}: unknown or nonstandard directive; this tool does not validate browser support.`);
    }
    if (!has('default-src')) findings.push('No default-src: resource types without their own directive are not constrained by this model.');
    if (!has('object-src')) findings.push('No object-src: consider object-src \'none\' if plugins are not needed.');
    if (!has('base-uri')) findings.push('No base-uri: consider base-uri \'none\' or a narrow origin to reduce base-tag injection risk.');
    if (has('report-uri') || has('report-to')) findings.push('Reporting directive present: delivery and aggregation are not tested locally.');
    return findings;
  }

  function run(values) {
    const policy = parsePolicy(values && values.policy);
    const requested = clean(values && values.resources);
    let resourceNames = RESOURCE_TYPES.map(x => x[0]);
    if (requested) {
      resourceNames = requested.split(/[,\s]+/).filter(Boolean).slice(0, 30);
      if (!resourceNames.length) resourceNames = RESOURCE_TYPES.map(x => x[0]);
    }
    const lookup = Object.fromEntries(RESOURCE_TYPES.map(x => [x[0], x[1]]));
    const lines = ['CSP POLICY EVALUATION', '======================', `Parsed directives: ${policy.directives.length}`, ''];
    lines.push('NORMALIZED POLICY');
    lines.push(policy.directives.map(d => [d.name].concat(d.sources).join(' ')).join('; ') + ';');
    lines.push('', 'EFFECTIVE SOURCE MATRIX (syntax model)', 'Resource    Directive used     Sources / result');
    lines.push('--------    ---------------     ----------------');
    for (const kind of resourceNames) {
      const directive = lookup[kind] || `${kind}-src`;
      const result = effective(policy, directive);
      const display = result.sources.length ? result.sources.join(' ') : 'no source expression (blocked/unspecified in this model)';
      lines.push(`${kind.padEnd(11)}${result.name.padEnd(20)}${display}${result.fallback ? ' [default-src fallback]' : ''}`);
    }
    const findings = riskFindings(policy);
    lines.push('', 'DIAGNOSTICS AND COMMON RISKS');
    if (findings.length) findings.forEach((x, i) => lines.push(`${i + 1}. ${x}`));
    else lines.push('No common-risk pattern detected by this bounded syntax audit.');
    lines.push('', 'LIMITATIONS');
    lines.push('This is a browser-local syntax and source-expression model, not a browser/runtime check. It does not simulate browser-version differences, inline code, nonce/hash matching, response headers, report delivery, or server behavior. Review the generated policy before deployment.');
    return {text: lines.join('\n'), filename: 'csp-policy-evaluation.txt', mime: 'text/plain;charset=utf-8', warnings: findings};
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['csp-policy-evaluator'] = {
    title: 'Content Security Policy Builder & Evaluator',
    description: 'Parse a pasted CSP policy, normalize its directives, and inspect a practical effective-source matrix with common security risks. Browser-version/runtime behavior, inline code, response headers, and nonce context are not simulated.',
    limitations: 'Bounded local syntax/model only: no remote or server checks, no browser-version parity, no inline-code execution or nonce/hash matching, no response-header or report-delivery simulation. Input is capped at 100 KB, 100 directives, and 1,000 source tokens.',
    fields: [
      {id: 'policy', label: 'CSP policy or header value', type: 'textarea', placeholder: "default-src 'self'; script-src 'self' https://cdn.example; object-src 'none'", help: 'Paste only the policy value; semicolon-separated directives are supported.'},
      {id: 'resources', label: 'Resource rows to inspect (optional)', type: 'text', placeholder: 'script style img connect', help: 'Optional space- or comma-separated rows. Defaults to a practical set of common resource types.'}
    ],
    run
  };
})();
