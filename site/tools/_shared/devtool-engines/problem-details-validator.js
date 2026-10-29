(() => {
  'use strict';

  const MAX_INPUT_CHARS = 256 * 1024;
  const MAX_DEPTH = 32;
  const MAX_KEYS = 1000;
  const CORE_MEMBERS = new Set(['type', 'title', 'status', 'detail', 'instance']);

  function text(value) {
    return String(value == null ? '' : value);
  }

  function contentTypeIsProblemJson(value) {
    return /^application\/problem\+json(?:\s*;|\s*$)/i.test(text(value).trim());
  }

  function inspectShape(value, path, state, errors) {
    if (state.depth > MAX_DEPTH) {
      errors.push(`JSON nesting exceeds the ${MAX_DEPTH}-level safety limit at ${path}.`);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        state.depth++;
        inspectShape(item, `${path}[${index}]`, state, errors);
        state.depth--;
      });
      return;
    }
    const keys = Object.keys(value);
    state.keys += keys.length;
    if (state.keys > MAX_KEYS) {
      errors.push(`JSON contains more than the ${MAX_KEYS}-key safety limit.`);
      return;
    }
    keys.forEach(key => {
      state.depth++;
      inspectShape(value[key], `${path}.${key}`, state, errors);
      state.depth--;
    });
  }

  function validateMember(body, name, expectedType, errors) {
    if (!Object.prototype.hasOwnProperty.call(body, name)) return;
    const value = body[name];
    if (typeof value !== expectedType) {
      errors.push(`The “${name}” member must be a ${expectedType}.`);
    } else if ((name === 'type' || name === 'instance') && value.length === 0) {
      errors.push(`The “${name}” member must not be empty when supplied.`);
    }
  }

  function run(values) {
    const bodySource = text(values && values.body);
    const suppliedStatus = text(values && values.status).trim();
    const suppliedContentType = text(values && values.contentType).trim();
    const errors = [];
    const warnings = [];

    if (!bodySource.trim()) {
      errors.push('Paste a JSON Problem Details body.');
    } else if (bodySource.length > MAX_INPUT_CHARS) {
      errors.push(`The JSON body exceeds the ${MAX_INPUT_CHARS}-character safety limit.`);
    }

    let body;
    if (!errors.length) {
      try {
        body = JSON.parse(bodySource);
      } catch (error) {
        errors.push(`Invalid JSON: ${error && error.message ? error.message : 'could not parse the body'}.`);
      }
    }

    if (!suppliedStatus) {
      errors.push('Provide the HTTP status as an integer from 100 through 599.');
    } else if (!/^\d+$/.test(suppliedStatus) || Number(suppliedStatus) < 100 || Number(suppliedStatus) > 599) {
      errors.push('HTTP status must be an integer from 100 through 599.');
    }

    if (!contentTypeIsProblemJson(suppliedContentType)) {
      errors.push('Content-Type must be application/problem+json, optionally followed by parameters.');
    }

    if (body !== undefined) {
      if (body === null || Array.isArray(body) || typeof body !== 'object') {
        errors.push('The Problem Details document must be a JSON object, not an array, null, or scalar.');
      } else {
        inspectShape(body, '$', {depth: 0, keys: 0}, errors);
        validateMember(body, 'type', 'string', errors);
        validateMember(body, 'title', 'string', errors);
        validateMember(body, 'detail', 'string', errors);
        validateMember(body, 'instance', 'string', errors);
        if (Object.prototype.hasOwnProperty.call(body, 'status')) {
          if (!Number.isInteger(body.status) || body.status < 100 || body.status > 599) {
            errors.push('The body “status” member must be an integer from 100 through 599 when supplied.');
          } else if (suppliedStatus && Number(suppliedStatus) !== body.status) {
            errors.push(`HTTP status ${suppliedStatus} does not match the body “status” member ${body.status}.`);
          }
        }
        const extensions = Object.keys(body).filter(key => !CORE_MEMBERS.has(key));
        if (extensions.length) {
          warnings.push(`User-defined extension member(s) detected: ${extensions.join(', ')}. Their schema and semantics were not validated.`);
        }
        if (!Object.prototype.hasOwnProperty.call(body, 'type')) {
          warnings.push('No “type” member supplied; RFC 9457 permits the default type URI about:blank.');
        }
        if (!Object.prototype.hasOwnProperty.call(body, 'title')) {
          warnings.push('No “title” member supplied; it is optional in the core shape.');
        }
      }
    }

    const statusLabel = suppliedStatus || '(missing)';
    const contentLabel = suppliedContentType || '(missing)';
    const lines = [
      'RFC 9457 Problem Details validation',
      `HTTP status: ${statusLabel}`,
      `Content-Type: ${contentLabel}`,
      `Body size: ${bodySource.length} characters`,
      ''
    ];

    if (errors.length) {
      lines.push(`NOT READY — ${errors.length} issue${errors.length === 1 ? '' : 's'} found:`);
      errors.forEach((error, index) => lines.push(`${index + 1}. ${error}`));
      if (warnings.length) {
        lines.push('', 'Notes:');
        warnings.forEach(warning => lines.push(`- ${warning}`));
      }
      return {text: lines.join('\n'), warnings};
    }

    lines.push('VALID CORE SHAPE — the pasted object, status, and media type pass this local RFC 9457 check.');
    if (warnings.length) {
      lines.push('', 'Notes:');
      warnings.forEach(warning => lines.push(`- ${warning}`));
    }
    lines.push('', 'Fixture preview:', JSON.stringify({
      status: Number(suppliedStatus),
      contentType: suppliedContentType,
      body
    }, null, 2));
    return {
      text: lines.join('\n'),
      filename: 'problem-details-fixture.json',
      mime: 'application/json;charset=utf-8',
      warnings
    };
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['problem-details-validator'] = {
    title: 'RFC 9457 Problem Details Validator & Fixture Builder',
    description: 'Validate a pasted JSON Problem Details body against the RFC 9457 core shape together with an HTTP status and application/problem+json Content-Type, then build a local fixture. Extension members are user-defined and are not schema-validated.',
    limitations: 'Browser-local only: checks JSON shape, supplied status, media type, and body-status consistency. It does not contact an API, verify URI resolution, validate extension contracts, or assert universal API compliance. Inputs are capped at 256 KB, 32 nesting levels, and 1,000 object keys.',
    fields: [
      {id: 'body', label: 'Problem Details JSON body', type: 'textarea', placeholder: '{\n  "type": "https://example.com/problems/out-of-credit",\n  "title": "You do not have enough credit.",\n  "status": 403,\n  "detail": "Your balance is 0.",\n  "instance": "/account/12345/msgs/abc"\n}', help: 'Paste one JSON object. Core members are checked; extension members are reported but not interpreted.'},
      {id: 'status', label: 'HTTP status', type: 'text', placeholder: '403', help: 'Enter the response status as an integer from 100 through 599.'},
      {id: 'contentType', label: 'Content-Type', type: 'text', placeholder: 'application/problem+json; charset=utf-8', help: 'The media type must be application/problem+json, with optional parameters.'}
    ],
    run
  };
})();
