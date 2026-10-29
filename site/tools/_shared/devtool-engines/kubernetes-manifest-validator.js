(() => {
  'use strict';

  const MAX_INPUT = 256 * 1024;
  const MAX_DOCUMENTS = 100;
  const MAX_NESTING = 40;

  const registry = window.AHDevToolEngines = window.AHDevToolEngines || {};

  function scalar(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if ((text[0] === '"' && text[text.length - 1] === '"') || (text[0] === "'" && text[text.length - 1] === "'")) {
      if (text[0] === '"') {
        try { return JSON.parse(text); } catch (_) { return text.slice(1, -1); }
      }
      return text.slice(1, -1).replace(/''/g, "'");
    }
    if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
    if (/^(null|~)$/i.test(text)) return null;
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return Number(text);
    if ((text[0] === '[' && text[text.length - 1] === ']') || (text[0] === '{' && text[text.length - 1] === '}')) {
      try { return JSON.parse(text); } catch (_) { /* simple YAML inline values remain strings */ }
    }
    return text;
  }

  function stripComment(text) {
    let quote = '';
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      if ((c === '"' || c === "'") && (!i || text[i - 1] !== '\\')) quote = quote === c ? '' : (quote ? quote : c);
      if (c === '#' && !quote && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i).trimEnd();
    }
    return text;
  }

  // Intentionally supports the common, simple manifest subset: mappings, lists,
  // quoted/plain scalars, and JSON-style inline arrays/objects. It is not a YAML spec parser.
  function parseSimpleYaml(source) {
    const lines = String(source).replace(/\t/g, '  ').split(/\r?\n/);
    const rows = [];
    lines.forEach((raw, index) => {
      const content = stripComment(raw);
      if (!content.trim()) return;
      const indent = (content.match(/^ */) || [''])[0].length;
      if (indent > MAX_NESTING * 2) throw new Error(`YAML indentation exceeds the ${MAX_NESTING}-level limit near line ${index + 1}.`);
      rows.push({ indent, text: content.trim(), line: index + 1 });
    });
    if (!rows.length) throw new Error('The document is empty.');

    function parseBlock(position, indent) {
      if (position >= rows.length || rows[position].indent < indent) return { value: {}, next: position };
      const list = rows[position].indent === indent && rows[position].text.indexOf('- ') === 0;
      const out = list ? [] : {};
      while (position < rows.length && rows[position].indent === indent) {
        const row = rows[position];
        if (list) {
          if (row.text === '-') { out.push(null); position += 1; continue; }
          if (row.text.indexOf('- ') !== 0) throw new Error(`Mixed YAML list and mapping near line ${row.line}.`);
          const item = row.text.slice(2).trim();
          if (!item) {
            const child = parseBlock(position + 1, indent + 2);
            out.push(child.value); position = child.next; continue;
          }
          const colon = item.indexOf(':');
          if (colon > 0 && !/^['"]/.test(item)) {
            const obj = {};
            obj[item.slice(0, colon).trim()] = scalar(item.slice(colon + 1));
            position += 1;
            if (position < rows.length && rows[position].indent > indent) {
              const child = parseBlock(position, indent + 2);
              if (child.value && typeof child.value === 'object' && !Array.isArray(child.value)) Object.assign(obj, child.value);
              position = child.next;
            }
            out.push(obj);
          } else { out.push(scalar(item)); position += 1; }
        } else {
          if (row.text.indexOf('- ') === 0) throw new Error(`Unexpected YAML list near line ${row.line}.`);
          const colon = row.text.indexOf(':');
          if (colon <= 0) throw new Error(`Expected a mapping key followed by ':' near line ${row.line}.`);
          const key = row.text.slice(0, colon).trim();
          if (!key || /[\[\]{},]/.test(key)) throw new Error(`Unsupported YAML key near line ${row.line}.`);
          const rest = row.text.slice(colon + 1).trim();
          position += 1;
          if (rest) out[key] = scalar(rest);
          else if (position < rows.length && rows[position].indent > indent) {
            const child = parseBlock(position, rows[position].indent);
            out[key] = child.value; position = child.next;
          } else out[key] = {};
        }
      }
      return { value: out, next: position };
    }
    const parsed = parseBlock(0, rows[0].indent);
    if (parsed.next !== rows.length) throw new Error(`Could not parse YAML near line ${rows[parsed.next].line}.`);
    return parsed.value;
  }

  function parseDocuments(input) {
    const source = String(input || '').replace(/^\uFEFF/, '');
    if (source.length > MAX_INPUT) throw new Error(`Input is too large (${MAX_INPUT} bytes maximum).`);
    const chunks = source.split(/^\s*---\s*(?:#.*)?$/m).map(x => x.trim()).filter(Boolean);
    if (!chunks.length) throw new Error('Paste one or more JSON or simple YAML manifest documents.');
    if (chunks.length > MAX_DOCUMENTS) throw new Error(`Too many documents (${MAX_DOCUMENTS} maximum).`);
    const documents = [];
    chunks.forEach((chunk, index) => {
      try {
        if (/^[\[{]/.test(chunk)) {
          const parsed = JSON.parse(chunk);
          if (Array.isArray(parsed)) parsed.forEach(item => documents.push(item));
          else documents.push(parsed);
        } else documents.push(parseSimpleYaml(chunk));
      } catch (error) {
        throw new Error(`Document ${index + 1}: ${error.message}`);
      }
    });
    if (documents.length > MAX_DOCUMENTS) throw new Error(`Too many manifest objects (${MAX_DOCUMENTS} maximum).`);
    return documents;
  }

  function text(value) { return typeof value === 'string' ? value : ''; }
  function map(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
  function labelsOf(object) {
    const metadata = map(object && object.metadata);
    return map(metadata && metadata.labels) || {};
  }
  function namespaceOf(object) {
    const metadata = map(object && object.metadata);
    return text(metadata && metadata.namespace) || 'default';
  }
  function nameOf(object) {
    const metadata = map(object && object.metadata);
    return text(metadata && metadata.name) || '(unnamed)';
  }
  function selectorMatches(selector, labels) {
    const keys = Object.keys(selector);
    return keys.length > 0 && keys.every(key => Object.prototype.hasOwnProperty.call(labels, key) && String(labels[key]) === String(selector[key]));
  }
  function location(object, index) { return `${text(object && object.kind) || 'Document'} ${nameOf(object)} (document ${index + 1})`; }

  function validate(values) {
    let documents;
    try { documents = parseDocuments(values && values.manifests); }
    catch (error) { return `Kubernetes manifest validation could not run.\nERROR: ${error.message}`; }

    const diagnostics = [];
    const pods = [];
    const services = [];
    documents.forEach((object, index) => {
      if (!map(object)) { diagnostics.push(`ERROR: Document ${index + 1} is not an object.`); return; }
      const apiVersion = text(object.apiVersion);
      const kind = text(object.kind);
      if (!apiVersion) diagnostics.push(`ERROR: Document ${index + 1} (${nameOf(object)}) is missing apiVersion.`);
      if (!kind) diagnostics.push(`ERROR: Document ${index + 1} (${nameOf(object)}) is missing kind.`);
      if (!map(object.metadata)) diagnostics.push(`WARNING: ${location(object, index)} has no metadata object.`);
      if (kind === 'Service') services.push({ object, index });
      if (kind === 'Pod') pods.push({ object, index, source: 'Pod' });
      const templates = kind === 'Deployment' || kind === 'StatefulSet' || kind === 'DaemonSet' || kind === 'Job'
        ? [map(object.spec) && map(object.spec.template)]
        : kind === 'CronJob' ? [map(map(object.spec) && object.spec.jobTemplate) && map(map(object.spec.jobTemplate).spec) && map(map(map(object.spec.jobTemplate).spec).template)] : [];
      templates.forEach(template => {
        if (template) pods.push({ object: template, index, source: `${kind} pod template` });
        else diagnostics.push(`WARNING: ${location(object, index)} has no usable pod template for local selector checks.`);
      });
    });

    services.forEach(service => {
      const spec = map(service.object.spec);
      const selector = map(spec && spec.selector);
      if (!selector || !Object.keys(selector).length) {
        diagnostics.push(`INFO: ${location(service.object, service.index)} has no non-empty selector; it was not matched to pod labels.`);
        return;
      }
      const sameNamespace = pods.filter(pod => namespaceOf(pod.object) === namespaceOf(service.object));
      const matches = sameNamespace.filter(pod => selectorMatches(selector, labelsOf(pod.object)));
      if (matches.length) {
        diagnostics.push(`OK: ${location(service.object, service.index)} selector matches ${matches.length} pod template${matches.length === 1 ? '' : 's'} in namespace ${namespaceOf(service.object)}.`);
      } else if (!sameNamespace.length) {
        diagnostics.push(`WARNING: ${location(service.object, service.index)} selector has no supplied Pod or workload template in namespace ${namespaceOf(service.object)}; runtime endpoints are not checked.`);
      } else {
        const candidates = sameNamespace.map(pod => `${location(pod.object, pod.index)} labels={${Object.keys(labelsOf(pod.object)).map(k => `${k}=${labelsOf(pod.object)[k]}`).join(', ')}}`).join('; ');
        diagnostics.push(`ERROR: ${location(service.object, service.index)} selector does not match any supplied pod labels in namespace ${namespaceOf(service.object)}. Selector={${Object.keys(selector).map(k => `${k}=${selector[k]}`).join(', ')}}. Candidates: ${candidates}`);
      }
    });

    const errors = diagnostics.filter(line => line.indexOf('ERROR:') === 0).length;
    const warnings = diagnostics.filter(line => line.indexOf('WARNING:') === 0).length;
    const header = `Kubernetes manifest local review\nDocuments: ${documents.length}\nErrors: ${errors} | Warnings: ${warnings}\n`;
    const body = diagnostics.length ? diagnostics : ['OK: No basic apiVersion/kind or Service-to-supplied-Pod selector issues found.'];
    return `${header}\n${body.join('\n')}\n\nScope: basic fields and common Service selector versus supplied Pod/workload labels only; not exhaustive schema validation or cluster/runtime behavior.`;
  }

  registry['kubernetes-manifest-validator'] = {
    title: 'Kubernetes Manifest Schema & Cross-Resource Validator',
    description: 'Review bounded, pasted multi-document JSON or simple YAML Kubernetes manifests for basic apiVersion/kind fields and common Service selector versus Pod label mismatches. Local-only; not exhaustive schema or cluster validation.',
    limitations: 'Supports a deliberately simple YAML subset and JSON; maximum 256 KB and 100 manifest objects. Checks only basic apiVersion/kind presence plus supplied Pod/workload-template labels against Service selectors. It does not contact a cluster, perform admission/runtime checks, or claim exhaustive Kubernetes-version schema coverage.',
    fields: [{ id: 'manifests', label: 'Kubernetes manifests', type: 'textarea', placeholder: 'Paste JSON or simple YAML; separate YAML documents with ---', help: 'Bounded local input. Include Services and Pods/workload templates together for selector diagnostics.' }],
    run: validate
  };
})();
