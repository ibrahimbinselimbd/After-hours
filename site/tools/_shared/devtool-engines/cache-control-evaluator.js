(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_INPUT = 32 * 1024;
  const MAX_DIRECTIVES = 100;
  const KNOWN = new Set([
    'max-age', 's-maxage', 'no-cache', 'no-store', 'no-transform', 'only-if-cached',
    'must-revalidate', 'proxy-revalidate', 'must-understand', 'private', 'public',
    'immutable', 'stale-while-revalidate', 'stale-if-error'
  ]);

  function text(value) {
    return String(value == null ? '' : value);
  }

  function fail(message) {
    return { text: `Input error: ${message}\n\nNo policy was evaluated.`, warnings: [message] };
  }

  function parseCacheControl(raw) {
    const source = text(raw).trim();
    if (!source) throw new Error('Provide a Cache-Control value, for example: public, max-age=300.');
    if (source.length > MAX_INPUT) throw new Error(`Cache-Control input exceeds the ${MAX_INPUT} character limit.`);

    const parts = [];
    let current = '';
    let quote = false;
    for (let i = 0; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '"' && source[i - 1] !== '\\') quote = !quote;
      if (ch === ',' && !quote) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (quote) throw new Error('Unclosed quoted value in Cache-Control.');
    if (current.trim()) parts.push(current.trim());
    if (parts.length > MAX_DIRECTIVES) throw new Error(`Policy has more than ${MAX_DIRECTIVES} directives.`);

    const directives = [];
    const byName = Object.create(null);
    parts.forEach((part, index) => {
      if (!part) throw new Error(`Empty directive near comma ${index + 1}.`);
      const match = part.match(/^([!#$%&'*+.^_`|~0-9A-Za-z-]+)(?:\s*=\s*(.*))?$/);
      if (!match) throw new Error(`Malformed directive: “${part}”.`);
      const name = match[1].toLowerCase();
      const value = match[2] == null ? null : match[2].trim();
      if (value === '' || (value && /^".*"$/.test(value) === false && /[\s,]/.test(value))) {
        throw new Error(`Invalid value for ${name}: “${value || '(empty)'}”.`);
      }
      const item = { name, value };
      directives.push(item);
      (byName[name] || (byName[name] = [])).push(item);
    });
    return { source, directives, byName };
  }

  function parseHeaders(raw) {
    const lines = text(raw).trim().split(/\r?\n/).filter(Boolean);
    if (text(raw).length > MAX_INPUT) throw new Error(`Related headers exceed the ${MAX_INPUT} character limit.`);
    const headers = Object.create(null);
    lines.forEach((line, index) => {
      const colon = line.indexOf(':');
      if (colon < 1) throw new Error(`Malformed related header on line ${index + 1}; use Name: value.`);
      const name = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) throw new Error(`Invalid header name on line ${index + 1}.`);
      (headers[name] || (headers[name] = [])).push(value);
    });
    return headers;
  }

  function quotedOr(value) {
    if (value == null) return null;
    const v = value.replace(/^"|"$/g, '');
    return /^\d+$/.test(v) ? Number(v) : v;
  }

  function run(values) {
    const input = values || {};
    let policy;
    let headers;
    try {
      policy = parseCacheControl(input.cacheControl);
      headers = parseHeaders(input.relatedHeaders || '');
    } catch (error) {
      return fail(error.message);
    }

    const d = policy.byName;
    const warnings = [];
    const notes = [];
    const lines = [];
    const canonical = policy.directives.map(item => item.name + (item.value == null ? '' : `=${item.value}`)).join(', ');
    const unknown = policy.directives.filter(item => !KNOWN.has(item.name)).map(item => item.name);

    lines.push('HTTP Cache-Control policy evaluation (local rules)');
    lines.push(`Canonical form: ${canonical}`);
    lines.push(`Directives parsed: ${policy.directives.length}`);

    if (unknown.length) warnings.push(`Unrecognized directive(s): ${unknown.join(', ')}. They are preserved but not semantically evaluated.`);
    for (const name of Object.keys(d)) {
      if (d[name].length > 1) warnings.push(`${name} appears more than once; this evaluator reports the values but does not choose a server-specific precedence rule.`);
    }
    ['max-age', 's-maxage', 'stale-while-revalidate', 'stale-if-error'].forEach(name => {
      (d[name] || []).forEach(item => {
        const value = quotedOr(item.value);
        if (!Number.isInteger(value) || value < 0) warnings.push(`${name} should be a non-negative integer delta-seconds; received “${item.value}”.`);
      });
    });

    const has = name => Boolean(d[name]);
    if (has('no-store')) {
      lines.push('Browser cache: should not store this response.');
      lines.push('Shared caches: should not store this response.');
      notes.push('no-store is the strongest storage restriction in this simple model.');
    } else {
      lines.push(`Browser cache: ${has('private') ? 'a private browser cache may store it' : 'may store it if freshness and method/status rules also permit'}.`);
      if (has('private')) lines.push('Shared caches: private response; shared caches should not use it.');
      else if (has('s-maxage')) lines.push('Shared caches: s-maxage supplies a shared-cache freshness lifetime, overriding max-age for that audience.');
      else if (has('public')) lines.push('Shared caches: explicitly permitted to store it, subject to other HTTP cache rules.');
      else lines.push('Shared caches: no explicit public/private choice; cacheability still depends on status, authorization, method, and cache implementation rules.');
    }

    if (has('no-cache')) notes.push('no-cache does not mean “do not store”; it generally requires validation before reuse.');
    if (has('max-age')) notes.push(`Browser freshness hint: max-age=${d['max-age'][0].value}.`);
    if (has('s-maxage')) notes.push(`Shared-cache freshness hint: s-maxage=${d['s-maxage'][0].value}.`);
    if (has('must-revalidate') || has('proxy-revalidate')) notes.push('Revalidation is required when stale under the applicable directive; this does not provide a network or origin check here.');
    if (has('immutable')) notes.push('immutable is a client hint to avoid revalidation while fresh; support and behavior can vary.');
    if (has('stale-while-revalidate') || has('stale-if-error')) notes.push('Stale-use windows are hints with implementation-dependent behavior; this tool does not calculate an age timeline.');
    if (has('only-if-cached')) notes.push('only-if-cached describes a request-side constraint, not a response policy; evaluate it with the request context.');

    const ageValues = headers.age || [];
    if (ageValues.length) {
      lines.push(`Age header observed: ${ageValues.join(' | ')} (informational only; freshness is not computed).`);
      warnings.push('Age is supplied by the cache chain and cannot be validated or simulated from pasted headers alone.');
    }
    if (headers.vary) {
      lines.push(`Vary header observed: ${headers.vary.join(' | ')}.`);
      warnings.push('Vary changes cache-key selection; this tool does not know request headers or calculate variant hits.');
    }
    const cdnSignals = ['x-cache', 'x-cache-status', 'cf-cache-status', 'cdn-cache-control', 'surrogate-control'].filter(name => headers[name]);
    if (cdnSignals.length) {
      lines.push(`CDN-related headers observed: ${cdnSignals.join(', ')}.`);
      warnings.push('CDN headers and surrogate policies are provider-specific; no live CDN or origin check is performed.');
    }

    warnings.push('This is a local rule-based explanation, not a browser, shared-cache, CDN, or server simulation.');
    warnings.push('bfcache eligibility is not determined by Cache-Control alone and is not evaluated.');
    lines.push('');
    lines.push('Notes:');
    (notes.length ? notes : ['No additional directive-specific notes.']).forEach(note => lines.push(`- ${note}`));
    lines.push('');
    lines.push('Warnings / limits:');
    [...new Set(warnings)].forEach(warning => lines.push(`- ${warning}`));
    return { text: lines.join('\n'), warnings: [...new Set(warnings)] };
  }

  window.AHDevToolEngines['cache-control-evaluator'] = {
    title: 'HTTP Cache-Control Policy Builder & Evaluator',
    description: 'Parse or compose a Cache-Control policy and explain likely browser versus shared-cache implications with bounded local rules; does not simulate Age, Vary, CDN behavior, or bfcache.',
    limitations: 'Browser-local only: parses at most 32 KB and 100 directives. It provides RFC 9111-inspired guidance, not a live browser/shared-cache/CDN test, origin check, freshness timeline, or bfcache eligibility decision.',
    fields: [
      { id: 'cacheControl', label: 'Cache-Control policy', type: 'textarea', placeholder: 'public, max-age=300, s-maxage=60', help: 'Paste a Cache-Control value. Comma-separated directives are parsed and normalized.' },
      { id: 'relatedHeaders', label: 'Optional related response headers', type: 'textarea', placeholder: 'Age: 42\nVary: Accept-Encoding\nCF-Cache-Status: HIT', help: 'Optional one-header-per-line context. Age, Vary, and CDN signals are reported but not simulated.' }
    ],
    run
  };
})();
