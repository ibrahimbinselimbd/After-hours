(() => {
  'use strict';

  const MAX_BYTES = 200 * 1024;
  const MAX_LINES = 2000;
  const MAX_SERVICES = 100;
  const MAX_PORTS = 500;

  const engine = {
    title: 'Docker Compose Service Graph & Port Conflict Checker',
    description: 'Inspect a bounded pasted Docker Compose YAML subset or JSON representation for service dependencies and duplicate host ports. This is a static, browser-local check; interpolation, secrets, images, and runtime behavior remain unknown.',
    limitations: 'Supports one Compose document with a services map, common depends_on forms, and short/long port mappings. It does not resolve interpolation or environment files, inspect secrets/images, load multiple files, or emulate Docker networking/runtime behavior. Maximum input is 200 KB, 2,000 lines, 100 services, and 500 port entries.',
    fields: [{
      id: 'compose',
      label: 'Compose YAML or JSON',
      type: 'textarea',
      placeholder: 'services:\n  web:\n    depends_on: [db]\n    ports:\n      - "8080:80"\n  db:\n    image: postgres:16',
      help: 'Paste one bounded Compose document. JSON is fully supported for the represented subset; YAML parsing is intentionally limited to common mappings, lists, and scalar values.'
    }],
    run(values) {
      const source = values && typeof values.compose === 'string' ? values.compose : '';
      if (!source.trim()) return 'Input error: paste one Compose YAML document or JSON representation.';
      if (source.length > MAX_BYTES) return `Input error: document is ${source.length} bytes; the limit is ${MAX_BYTES} bytes.`;
      const lines = source.split(/\r?\n/);
      if (lines.length > MAX_LINES) return `Input error: document has ${lines.length} lines; the limit is ${MAX_LINES}.`;

      let document;
      const diagnostics = [];
      try {
        document = looksLikeJson(source) ? JSON.parse(source) : parseYamlSubset(source, diagnostics);
      } catch (error) {
        return `Parse error: ${error.message}` + (diagnostics.length ? `\nDiagnostics:\n- ${diagnostics.join('\n- ')}` : '');
      }
      if (!document || typeof document !== 'object' || Array.isArray(document)) {
        return 'Input error: the root must be an object containing a services map.';
      }
      const services = document.services;
      if (!services || typeof services !== 'object' || Array.isArray(services)) {
        return 'Input error: expected a top-level services mapping (for example, services: { web: ... }).';
      }
      const names = Object.keys(services);
      if (!names.length) return 'Input error: the services map is empty.';
      if (names.length > MAX_SERVICES) return `Input error: found ${names.length} services; the limit is ${MAX_SERVICES}.`;

      const known = new Set(names);
      const dependencies = [];
      const warnings = diagnostics.slice();
      const bindings = [];
      let portCount = 0;

      names.forEach(name => {
        const service = services[name];
        if (!service || typeof service !== 'object' || Array.isArray(service)) {
          warnings.push(`Service "${name}" is not a mapping; only its name is included.`);
          return;
        }
        const depends = service.depends_on;
        const depNames = dependencyNames(depends);
        if (depNames.length) {
          dependencies.push(`${name} -> ${depNames.join(', ')}`);
          depNames.forEach(dep => {
            if (!known.has(dep)) warnings.push(`Service "${name}" depends on missing service "${dep}".`);
          });
        } else if (depends !== undefined && depends !== null) {
          warnings.push(`Service "${name}" has an unsupported depends_on shape; dependency names could not be read.`);
        }

        const ports = Array.isArray(service.ports) ? service.ports : (service.ports === undefined ? [] : [service.ports]);
        ports.forEach((port, index) => {
          portCount += 1;
          if (portCount > MAX_PORTS) return;
          const parsed = parsePort(port);
          if (parsed && parsed.hostPort !== null) {
            bindings.push({ service: name, index: index + 1, ...parsed });
          } else if (port !== undefined && port !== null) {
            warnings.push(`Service "${name}" port ${index + 1} could not be interpreted as a host-published port; runtime allocation is unknown.`);
          }
        });
      });
      if (portCount > MAX_PORTS) warnings.push(`Only the first ${MAX_PORTS} port entries were inspected.`);

      const groups = new Map();
      bindings.forEach(binding => {
        const key = `${binding.hostPort}/${binding.protocol}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(binding);
      });
      const conflicts = [];
      groups.forEach((items, key) => {
        if (items.length > 1) conflicts.push(`${key}: ${items.map(item => `${item.service} (${item.display})`).join(', ')}`);
      });

      const out = [];
      out.push('Compose static inspection');
      out.push('========================');
      out.push(`Services (${names.length}): ${names.join(', ')}`);
      out.push('');
      out.push('Dependencies:');
      out.push(dependencies.length ? dependencies.map(line => `- ${line}`).join('\n') : '- None declared.');
      out.push('');
      out.push('Duplicate host ports:');
      out.push(conflicts.length ? conflicts.map(line => `- ${line}`).join('\n') : '- None found in the inspected published ports.');
      if (!bindings.length) {
        out.push('');
        out.push('Published ports: none recognized; container-only/external runtime port behavior is not checked.');
      }
      if (warnings.length) {
        out.push('');
        out.push('Diagnostics and limitations:');
        warnings.forEach(warning => out.push(`- ${warning}`));
      }
      out.push('');
      out.push('Static-only note: interpolation, secrets, images, networks/volumes semantics, and runtime availability are not resolved.');
      return { text: out.join('\n'), warnings: warnings.length ? warnings : undefined };
    }
  };

  function looksLikeJson(text) {
    const first = text.replace(/^\uFEFF/, '').trim()[0];
    return first === '{' || first === '[';
  }

  function parseYamlSubset(text, diagnostics) {
    const raw = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    const tokens = [];
    raw.forEach((line, number) => {
      if (!line.trim() || /^\s*#/.test(line)) return;
      const withoutComment = stripYamlComment(line);
      if (!withoutComment.trim()) return;
      const match = withoutComment.match(/^(\s*)(.*)$/);
      const indent = match[1].replace(/\t/g, '  ').length;
      if (/\t/.test(match[1])) diagnostics.push(`Line ${number + 1}: tabs were treated as two spaces.`);
      tokens.push({ indent, text: match[2].trim(), line: number + 1 });
    });
    if (!tokens.length) throw new Error('document is empty.');
    const parsed = parseYamlBlock(tokens, 0, tokens[0].indent);
    if (parsed.next < tokens.length) diagnostics.push(`Line ${tokens[parsed.next].line}: trailing YAML content was ignored by the bounded parser.`);
    return parsed.value;
  }

  function parseYamlBlock(tokens, start, indent) {
    const isList = tokens[start] && tokens[start].indent === indent && tokens[start].text.indexOf('- ') === 0;
    const value = isList ? [] : {};
    let i = start;
    while (i < tokens.length && tokens[i].indent === indent) {
      const token = tokens[i];
      if (isList) {
        if (token.text === '-') { value.push(null); i += 1; continue; }
        if (token.text.indexOf('- ') !== 0) break;
        const itemText = token.text.slice(2).trim();
        if (!itemText) {
          if (tokens[i + 1] && tokens[i + 1].indent > indent) {
            const child = parseYamlBlock(tokens, i + 1, tokens[i + 1].indent); value.push(child.value); i = child.next;
          } else { value.push(null); i += 1; }
        } else if (findColon(itemText) > 0) {
          const obj = {}; const colon = findColon(itemText); obj[itemText.slice(0, colon).trim()] = scalar(itemText.slice(colon + 1).trim()); i += 1;
          if (tokens[i] && tokens[i].indent > indent) {
            const child = parseYamlBlock(tokens, i, tokens[i].indent);
            if (child.value && typeof child.value === 'object' && !Array.isArray(child.value)) Object.assign(obj, child.value);
            i = child.next;
          }
          value.push(obj);
        } else { value.push(scalar(itemText)); i += 1; }
      } else {
        if (token.text.indexOf('- ') === 0) break;
        const colon = findColon(token.text);
        if (colon < 1) throw new Error(`line ${token.line}: expected a YAML key followed by a colon.`);
        const key = token.text.slice(0, colon).trim();
        const rest = token.text.slice(colon + 1).trim();
        i += 1;
        if (rest) value[key] = scalar(rest);
        else if (tokens[i] && tokens[i].indent > indent) { const child = parseYamlBlock(tokens, i, tokens[i].indent); value[key] = child.value; i = child.next; }
        else value[key] = {};
      }
    }
    return { value, next: i };
  }

  function findColon(text) {
    let quote = ''; for (let i = 0; i < text.length; i += 1) { const c = text[i]; if ((c === '"' || c === "'") && (!i || text[i - 1] !== '\\')) quote = quote === c ? '' : (quote || c); if (c === ':' && !quote && (!text[i + 1] || /\s/.test(text[i + 1]))) return i; } return -1;
  }
  function stripYamlComment(line) { let quote = ''; for (let i = 0; i < line.length; i += 1) { const c = line[i]; if ((c === '"' || c === "'") && (!i || line[i - 1] !== '\\')) quote = quote === c ? '' : (quote || c); if (c === '#' && !quote && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i); } return line; }
  function scalar(text) {
    if (!text) return '';
    if ((text[0] === '"' && text[text.length - 1] === '"') || (text[0] === "'" && text[text.length - 1] === "'")) return text.slice(1, -1).replace(/''/g, "'");
    if (text[0] === '[' && text[text.length - 1] === ']') {
      try { return JSON.parse(text.replace(/'/g, '"')); } catch (_) {
        return text.slice(1, -1).split(',').map(item => item.trim()).filter(Boolean).map(item => scalar(item));
      }
    }
    if (text[0] === '{' && text[text.length - 1] === '}') { try { return JSON.parse(text.replace(/'/g, '"')); } catch (_) {} }
    if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
    if (/^(null|~)$/i.test(text)) return null;
    return text;
  }
  function dependencyNames(value) { if (Array.isArray(value)) return value.filter(v => typeof v === 'string').map(String); if (value && typeof value === 'object') return Object.keys(value); return []; }
  function parsePort(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) { const host = value.published; if (host === undefined) return null; return portParts(host, value.protocol || 'tcp', `${host}:${value.target || '?'}`); }
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const text = String(value).trim(); const pieces = text.split(':');
    if (pieces.length === 1) return null;
    const hostPart = pieces[pieces.length - 2].replace(/^\[|\]$/g, ''); const protocol = (pieces[pieces.length - 1].includes('/') ? pieces[pieces.length - 1].split('/')[1] : (text.includes('/') ? text.split('/').pop() : 'tcp')).toLowerCase();
    const host = hostPart.split('-')[0];
    if (!/^\d+$/.test(host)) return null;
    return portParts(host, protocol, text);
  }
  function portParts(host, protocol, display) { const hostPort = Number(host); return hostPort > 0 && hostPort <= 65535 ? { hostPort, protocol: protocol || 'tcp', display } : null; }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['compose-service-graph'] = engine;
})();
