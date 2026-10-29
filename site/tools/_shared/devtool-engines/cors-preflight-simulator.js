(() => {
  'use strict';

  const MAX_INPUT = 20000;
  const MAX_HEADERS = 80;
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'POST']);
  const SAFE_HEADERS = new Set(['accept', 'accept-language', 'content-language', 'content-type']);
  const SAFE_CONTENT_TYPES = new Set([
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain'
  ]);

  const trim = value => String(value == null ? '' : value).trim();
  const cap = (value, label) => {
    const text = String(value == null ? '' : value);
    if (text.length > MAX_INPUT) throw new Error(`${label} exceeds the ${MAX_INPUT.toLocaleString()} character limit.`);
    return text;
  };
  const unique = values => Array.from(new Set(values));
  const quote = value => `“${String(value)}”`;

  function parseHeaderLines(source, label) {
    const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
    const headers = [];
    const diagnostics = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      const colon = line.indexOf(':');
      if (colon < 1) {
        diagnostics.push(`${label} line ${i + 1}: ignored because it has no “name: value” separator.`);
        continue;
      }
      const name = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
        diagnostics.push(`${label} line ${i + 1}: ignored invalid header name ${quote(name)}.`);
        continue;
      }
      headers.push({ name, lower: name.toLowerCase(), value, line: i + 1 });
    }
    if (headers.length > MAX_HEADERS) throw new Error(`${label} exceeds the ${MAX_HEADERS} header limit.`);
    return { headers, diagnostics };
  }

  function parseHeaderInput(raw) {
    const source = cap(raw, 'Header input');
    if (!source.trim()) return { request: [], response: [], diagnostics: ['No request or response headers were supplied.'] };
    try {
      const parsed = JSON.parse(source);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const normalize = (value, label) => {
          if (Array.isArray(value)) return parseHeaderLines(value.map(item => String(item)).join('\n'), label);
          if (value && typeof value === 'object') {
            return parseHeaderLines(Object.keys(value).map(key => `${key}: ${value[key]}`).join('\n'), label);
          }
          return parseHeaderLines(String(value || ''), label);
        };
        const request = normalize(parsed.requestHeaders, 'Request');
        const response = normalize(parsed.responseHeaders, 'Response');
        return { request: request.headers, response: response.headers, diagnostics: request.diagnostics.concat(response.diagnostics) };
      }
    } catch (_) {
      // Plain pasted header sections are also supported.
    }
    const requestMatch = source.match(/(?:^|\n)\s*(?:request headers?|access-control-request-headers)\s*:\s*\n?/i);
    const responseMatch = source.match(/(?:^|\n)\s*(?:response headers?)\s*:\s*\n?/i);
    if (requestMatch && responseMatch && responseMatch.index > requestMatch.index) {
      const requestStart = requestMatch.index + requestMatch[0].length;
      const responseStart = responseMatch.index + responseMatch[0].length;
      const request = parseHeaderLines(source.slice(requestStart, responseMatch.index), 'Request');
      const response = parseHeaderLines(source.slice(responseStart), 'Response');
      return { request: request.headers, response: response.headers, diagnostics: request.diagnostics.concat(response.diagnostics) };
    }
    const all = parseHeaderLines(source, 'Header');
    return { request: all.headers, response: [], diagnostics: all.diagnostics.concat(['No “Response headers:” section found; response checks are therefore unresolved.']) };
  }

  function values(headers, name) {
    return headers.filter(header => header.lower === name).map(header => header.value);
  }
  function csvValues(headers, name) {
    return unique(values(headers, name).join(',').split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
  }
  function isSimpleHeader(header) {
    if (!SAFE_HEADERS.has(header.lower)) return false;
    if (header.lower === 'content-type') {
      const mediaType = header.value.split(';', 1)[0].trim().toLowerCase();
      return SAFE_CONTENT_TYPES.has(mediaType);
    }
    return !/[\u0000-\u0008\u000A-\u001F\u007F]/.test(header.value);
  }

  function run(valuesInput) {
    const valuesObject = valuesInput && typeof valuesInput === 'object' ? valuesInput : {};
    const origin = trim(valuesObject.origin);
    const method = trim(valuesObject.method).toUpperCase();
    const credentials = trim(valuesObject.credentials || 'omit').toLowerCase();
    if (!origin) return 'Input error: supply an Origin value (for example, https://app.example).';
    if (/[\s\u0000-\u001F\u007F]/.test(origin)) return 'Input error: Origin contains whitespace or control characters.';
    if (!method || !/^[A-Z][A-Z0-9$!*+.^_-]{0,19}$/.test(method)) return 'Input error: supply an HTTP method such as PUT or POST.';
    if (!['omit', 'same-origin', 'include'].includes(credentials)) return 'Input error: credentials must be omit, same-origin, or include.';

    let parsed;
    try { parsed = parseHeaderInput(valuesObject.headers); }
    catch (error) { return `Input error: ${error.message}`; }

    const request = parsed.request;
    const response = parsed.response;
    const requestedHeaderNames = unique(request.filter(header => !isSimpleHeader(header)).map(header => header.lower));
    const preflightNeeded = !SAFE_METHODS.has(method) || requestedHeaderNames.length > 0;
    const responseOrigin = values(response, 'access-control-allow-origin')[0];
    const allowMethods = csvValues(response, 'access-control-allow-methods');
    const allowHeaders = csvValues(response, 'access-control-allow-headers');
    const allowCredentials = values(response, 'access-control-allow-credentials').some(value => value.trim().toLowerCase() === 'true');
    const results = [];
    const warnings = [
      'Model only: this is a local explanation of common CORS preflight rules, not an actual browser, server, or proxy check.',
      'Actual request mode, response status, redirects, browser version, private-network rules, and server/proxy behavior are not observed.'
    ];
    if (parsed.diagnostics.length) warnings.push(...parsed.diagnostics);

    results.push(`Origin: ${origin}`);
    results.push(`Requested method: ${method}`);
    results.push(`Credentials mode: ${credentials}`);
    results.push(`Non-safelisted request headers: ${requestedHeaderNames.length ? requestedHeaderNames.join(', ') : 'none'}`);
    results.push('');
    results.push('1. Preflight trigger');
    if (!preflightNeeded) results.push(`PASS (model): ${method} with the supplied headers fits the common CORS-safelisted method/header subset, so a preflight would commonly not be needed.`);
    else results.push(`CHECK (model): a preflight would commonly be needed because ${!SAFE_METHODS.has(method) ? `method ${method} is not GET, HEAD, or POST` : `header(s) ${requestedHeaderNames.join(', ')} are not safelisted`}.`);

    results.push('');
    results.push('2. Access-Control-Allow-Origin');
    if (!responseOrigin) results.push('UNRESOLVED: response is missing Access-Control-Allow-Origin; a real browser would reject a cross-origin response without a matching permission.');
    else if (responseOrigin === '*' && credentials === 'include') results.push('FAIL (common rule): “*” cannot authorize a credentialed CORS request; an explicit origin is needed.');
    else if (responseOrigin === '*' || responseOrigin === origin) results.push(`PASS (model): response allows ${quote(responseOrigin)} for this origin.`);
    else results.push(`FAIL (model): response allows ${quote(responseOrigin)}, not ${quote(origin)}.`);

    results.push('');
    results.push('3. Access-Control-Allow-Methods');
    if (!preflightNeeded) results.push('NOT APPLICABLE: no preflight trigger was found, so method allow-list checking is not required in this model.');
    else if (!allowMethods.length) results.push(`UNRESOLVED: response is missing Access-Control-Allow-Methods for requested method ${method}.`);
    else if (allowMethods.includes(method.toLowerCase()) || allowMethods.includes('*')) results.push(`PASS (model): ${method} appears in the response method allow-list.`);
    else results.push(`FAIL (model): ${method} is absent from the response method allow-list (${allowMethods.join(', ')}).`);

    results.push('');
    results.push('4. Access-Control-Allow-Headers');
    if (!requestedHeaderNames.length) results.push('NOT APPLICABLE: no non-safelisted request headers require an allow-list entry.');
    else if (!allowHeaders.length) results.push(`UNRESOLVED: response is missing Access-Control-Allow-Headers for ${requestedHeaderNames.join(', ')}.`);
    else {
      const missing = requestedHeaderNames.filter(name => !allowHeaders.includes(name) && !allowHeaders.includes('*'));
      results.push(missing.length ? `FAIL (model): missing ${missing.join(', ')} from the response header allow-list.` : 'PASS (model): all non-safelisted request headers appear allowed.');
    }

    results.push('');
    results.push('5. Credentials');
    if (credentials === 'include') results.push(allowCredentials ? 'PASS (model): Access-Control-Allow-Credentials is true.' : 'FAIL/UNRESOLVED (model): credentialed mode requires Access-Control-Allow-Credentials: true.');
    else results.push('NOT REQUIRED: credentials mode is not include; this model does not require Access-Control-Allow-Credentials: true.');

    results.push('');
    results.push('Overall model');
    const hasFail = results.some(line => line.startsWith('FAIL'));
    const hasUnresolved = results.some(line => line.startsWith('UNRESOLVED') || line.startsWith('FAIL/UNRESOLVED'));
    results.push(hasFail ? 'Likely blocked under these common checks.' : hasUnresolved ? 'Inconclusive: one or more required response facts were not supplied.' : 'No common-rule conflict found in the supplied values; this is not proof that a real request will succeed.');
    results.push('');
    results.push('Limitations: ' + warnings.join(' '));
    return results.join('\n');
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['cors-preflight-simulator'] = {
    title: 'CORS Preflight Request Simulator',
    description: 'Model common CORS preflight checks from pasted request and response headers. This cannot simulate the actual browser, server, or proxy.',
    limitations: 'Local, rule-based explanation only; it does not send requests or observe browser, server, proxy, redirect, status, browser-version, private-network, or full Fetch-policy behavior. Inputs are capped at 20,000 characters and 80 parsed headers.',
    fields: [
      { id: 'origin', label: 'Origin', type: 'text', placeholder: 'https://app.example', help: 'The requesting page origin, such as https://app.example. Use null only when intentionally modeling an opaque origin.' },
      { id: 'method', label: 'Requested method', type: 'text', placeholder: 'PUT', help: 'The method the cross-origin request wants to use, for example PUT, PATCH, POST, or DELETE.' },
      { id: 'credentials', label: 'Credentials mode', type: 'text', placeholder: 'include', help: 'Use omit, same-origin, or include. This models the Fetch credentials mode; it does not inspect cookies or authorization.' },
      { id: 'headers', label: 'Request and response headers', type: 'textarea', placeholder: 'Request headers:\nContent-Type: application/json\nX-Trace: demo\n\nResponse headers:\nAccess-Control-Allow-Origin: https://app.example\nAccess-Control-Allow-Methods: PUT\nAccess-Control-Allow-Headers: content-type, x-trace\nAccess-Control-Allow-Credentials: true', help: 'Paste “Request headers:” then “Response headers:” sections as name: value lines. JSON {"requestHeaders":{},"responseHeaders":{}} is also accepted.' }
    ],
    run
  };
})();
