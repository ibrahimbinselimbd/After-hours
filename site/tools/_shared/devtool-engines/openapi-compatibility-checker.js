(() => {
  'use strict';

  const MAX_INPUT_CHARS = 500000;
  const MAX_PATHS = 2000;
  const MAX_OPERATIONS = 5000;
  const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
  const root = window.AHDevToolEngines = window.AHDevToolEngines || {};

  function parseDocument(source, label) {
    const text = String(source == null ? '' : source).replace(/^\uFEFF/, '').trim();
    if (!text) throw new Error(`${label} is empty.`);
    if (text.length > MAX_INPUT_CHARS) {
      throw new Error(`${label} exceeds the 500,000-character safety limit.`);
    }
    try {
      const value = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('The document root must be an object.');
      }
      return value;
    } catch (jsonError) {
      throw new Error(`${label} is not valid JSON. Paste a parsed OpenAPI 3.x JSON document; YAML is not parsed by this local engine. (${jsonError.message})`);
    }
  }

  function validateDocument(doc, label) {
    const errors = [];
    if (!doc.openapi || typeof doc.openapi !== 'string') errors.push(`${label} is missing a string openapi version.`);
    else if (!/^3\.[0-9]+(?:\.[0-9]+)?$/.test(doc.openapi)) errors.push(`${label} declares “${doc.openapi}”; only OpenAPI 3.x is supported.`);
    if (!doc.info || typeof doc.info !== 'object') errors.push(`${label} is missing an info object.`);
    if (!doc.paths || typeof doc.paths !== 'object' || Array.isArray(doc.paths)) errors.push(`${label} is missing a paths object.`);
    return errors;
  }

  function sortedKeys(value) {
    return Object.keys(value || {}).sort((a, b) => a.localeCompare(b));
  }

  function operationMap(doc) {
    const result = Object.create(null);
    const paths = doc.paths || {};
    const pathNames = sortedKeys(paths);
    if (pathNames.length > MAX_PATHS) throw new Error(`The document has more than ${MAX_PATHS} paths.`);
    let count = 0;
    for (const path of pathNames) {
      const item = paths[path];
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      for (const method of sortedKeys(item)) {
        if (!HTTP_METHODS.has(method)) continue;
        count++;
        if (count > MAX_OPERATIONS) throw new Error(`The documents exceed the ${MAX_OPERATIONS}-operation safety limit.`);
        result[`${path} ${method.toUpperCase()}`] = { path, method, operation: item[method] && typeof item[method] === 'object' ? item[method] : {} };
      }
    }
    return result;
  }

  function names(values) {
    return values.filter(Boolean).map(String).sort((a, b) => a.localeCompare(b));
  }

  function parameterKey(parameter) {
    if (!parameter || typeof parameter !== 'object') return null;
    if (typeof parameter.$ref === 'string') return `$ref:${parameter.$ref}`;
    return `${parameter.in || '?'}:${parameter.name || '?'}`;
  }

  function parametersFor(operation, pathItem) {
    const list = [];
    for (const parameter of [].concat(pathItem && Array.isArray(pathItem.parameters) ? pathItem.parameters : [], operation && Array.isArray(operation.parameters) ? operation.parameters : [])) {
      const key = parameterKey(parameter);
      if (key) list.push({ key, parameter });
    }
    return list;
  }

  function responseKeys(operation) {
    const responses = operation && operation.responses;
    return responses && typeof responses === 'object' && !Array.isArray(responses) ? sortedKeys(responses) : [];
  }

  function compare(oldDoc, newDoc) {
    const oldOps = operationMap(oldDoc);
    const newOps = operationMap(newDoc);
    const breaking = [];
    const changes = [];
    const additions = [];

    const oldPaths = new Set(Object.values(oldOps).map(x => x.path));
    const newPaths = new Set(Object.values(newOps).map(x => x.path));
    for (const path of names([...oldPaths])) if (!newPaths.has(path)) breaking.push(`Removed path: ${path}`);
    for (const path of names([...newPaths])) if (!oldPaths.has(path)) additions.push(`Added path: ${path}`);

    for (const key of names(Object.keys(oldOps))) {
      if (!newOps[key]) { breaking.push(`Removed operation: ${key}`); continue; }
      const oldEntry = oldOps[key];
      const newEntry = newOps[key];
      const oldParams = new Map(parametersFor(oldEntry.operation, oldDoc.paths[oldEntry.path]).map(x => [x.key, x.parameter]));
      const newParams = new Map(parametersFor(newEntry.operation, newDoc.paths[newEntry.path]).map(x => [x.key, x.parameter]));
      for (const p of names([...oldParams.keys()])) if (!newParams.has(p)) breaking.push(`Removed parameter from ${key}: ${p}`);
      for (const p of names([...newParams.keys()])) if (!oldParams.has(p)) {
        const parameter = newParams.get(p);
        const required = parameter && parameter.required === true;
        (required ? breaking : changes).push(`${required ? 'Added required' : 'Added'} parameter to ${key}: ${p}`);
      }
      const oldResponses = new Set(responseKeys(oldEntry.operation));
      const newResponses = new Set(responseKeys(newEntry.operation));
      for (const status of names([...oldResponses])) if (!newResponses.has(status)) breaking.push(`Removed response from ${key}: ${status}`);
      for (const status of names([...newResponses])) if (!oldResponses.has(status)) additions.push(`Added response to ${key}: ${status}`);
      const oldTags = names(Array.isArray(oldEntry.operation.tags) ? oldEntry.operation.tags : []);
      const newTags = names(Array.isArray(newEntry.operation.tags) ? newEntry.operation.tags : []);
      if (oldTags.join('|') !== newTags.join('|')) changes.push(`Tags changed for ${key}: ${oldTags.join(', ') || '(none)'} → ${newTags.join(', ') || '(none)'}`);
    }
    for (const key of names(Object.keys(newOps))) if (!oldOps[key]) additions.push(`Added operation: ${key}`);

    const oldComponents = oldDoc.components && typeof oldDoc.components === 'object' ? oldDoc.components : {};
    const newComponents = newDoc.components && typeof newDoc.components === 'object' ? newDoc.components : {};
    for (const group of ['schemas', 'parameters', 'responses', 'requestBodies', 'headers', 'securitySchemes']) {
      const before = new Set(sortedKeys(oldComponents[group]));
      const after = new Set(sortedKeys(newComponents[group]));
      for (const item of names([...before])) if (!after.has(item)) breaking.push(`Removed component ${group}/${item}`);
      for (const item of names([...after])) if (!before.has(item)) additions.push(`Added component ${group}/${item}`);
    }
    return { breaking, changes, additions, oldOperationCount: Object.keys(oldOps).length, newOperationCount: Object.keys(newOps).length };
  }

  function run(values) {
    const input = values || {};
    let oldDoc, newDoc;
    try { oldDoc = parseDocument(input.previous, 'Previous document'); }
    catch (error) { return `Input error: ${error.message}`; }
    try { newDoc = parseDocument(input.current, 'Current document'); }
    catch (error) { return `Input error: ${error.message}`; }
    const diagnostics = validateDocument(oldDoc, 'Previous document').concat(validateDocument(newDoc, 'Current document'));
    if (diagnostics.length) return `Cannot compare these documents:\n- ${diagnostics.join('\n- ')}\n\nExpected two OpenAPI 3.x JSON documents.`;
    const result = compare(oldDoc, newDoc);
    const lines = [
      `OpenAPI compatibility summary (${oldDoc.openapi} → ${newDoc.openapi})`,
      `Operations: ${result.oldOperationCount} → ${result.newOperationCount}`,
      '',
      `Potential breaking removals (${result.breaking.length}):`,
      ...(result.breaking.length ? result.breaking.map(x => `- ${x}`) : ['- None detected in the supported structural checks.']),
      '',
      `Other structural changes (${result.changes.length}):`,
      ...(result.changes.length ? result.changes.map(x => `- ${x}`) : ['- None detected.']),
      '',
      `Additions (${result.additions.length}):`,
      ...(result.additions.length ? result.additions.map(x => `- ${x}`) : ['- None detected.']),
      '',
      'Scope: local structural comparison of paths, operations, parameters, responses, selected components, and tags. This is not a full OpenAPI validator or runtime compatibility proof; request/response schemas, security behavior, links, callbacks, vendor extensions, $ref resolution, and server behavior are not semantically evaluated.'
    ];
    return lines.join('\n');
  }

  root['openapi-compatibility-checker'] = {
    title: 'OpenAPI Spec Compatibility & Breaking-Change Checker',
    description: 'Compare two pasted OpenAPI 3.x JSON documents locally for common path, operation, parameter, response, component, and tag changes. No remote/server checks; this is a bounded structural review, not runtime semantics.',
    limitations: 'Supports OpenAPI 3.x JSON only (YAML, external $refs, schema-level compatibility, vendor extensions, security nuances, callbacks/links, and runtime/server behavior are not fully interpreted). Inputs are capped at 500,000 characters per document, 2,000 paths, and 5,000 operations.',
    fields: [
      { id: 'previous', label: 'Previous OpenAPI document (JSON)', type: 'textarea', placeholder: '{\n  "openapi": "3.0.3",\n  "info": {"title": "Example", "version": "1.0.0"},\n  "paths": {}\n}', help: 'Paste the older contract as a complete OpenAPI 3.x JSON document.' },
      { id: 'current', label: 'Current OpenAPI document (JSON)', type: 'textarea', placeholder: '{\n  "openapi": "3.0.3",\n  "info": {"title": "Example", "version": "1.1.0"},\n  "paths": {}\n}', help: 'Paste the newer contract as a complete OpenAPI 3.x JSON document.' }
    ],
    run
  };
})();
