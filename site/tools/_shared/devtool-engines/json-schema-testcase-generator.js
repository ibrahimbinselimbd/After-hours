(() => {
  'use strict';

  const MAX_INPUT = 120 * 1024;
  const MAX_NODES = 1800;
  const MAX_DEPTH = 18;
  const SUPPORTED_DRAFTS = ['draft-04', 'draft-06', 'draft-07', '2019-09', '2020-12'];

  const typeName = value => Array.isArray(value) ? value.join(' | ') : String(value || 'any');
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const quote = value => JSON.stringify(value);
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  function analyzeSize(value) {
    let nodes = 0;
    let maxDepth = 0;
    function visit(node, depth) {
      nodes++;
      maxDepth = Math.max(maxDepth, depth);
      if (Array.isArray(node)) node.forEach(item => visit(item, depth + 1));
      else if (isObject(node)) Object.keys(node).forEach(key => visit(node[key], depth + 1));
    }
    visit(value, 0);
    return {nodes, maxDepth};
  }

  function unsupportedKeywords(schema, path, warnings) {
    if (!isObject(schema)) return;
    ['$ref', '$dynamicRef', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'dependentSchemas', 'unevaluatedProperties', 'contains', 'prefixItems', 'propertyNames', 'contentSchema', 'patternProperties'].forEach(key => {
      if (Object.prototype.hasOwnProperty.call(schema, key)) {
        warnings.push(`${path}: ${key} is not evaluated; exhaustive combinator/reference coverage is not claimed.`);
      }
    });
    if (isObject(schema.properties)) Object.keys(schema.properties).forEach(k => unsupportedKeywords(schema.properties[k], `${path}.properties.${k}`, warnings));
    if (isObject(schema.items)) unsupportedKeywords(schema.items, `${path}.items`, warnings);
    if (isObject(schema.additionalProperties)) unsupportedKeywords(schema.additionalProperties, `${path}.additionalProperties`, warnings);
  }

  function makeGenerator(schema, warnings) {
    let generated = 0;
    const bump = path => {
      generated++;
      if (generated > MAX_NODES) throw new Error(`Generation exceeded the ${MAX_NODES}-node complexity cap near ${path}.`);
    };
    const chooseType = schema => {
      if (Array.isArray(schema.type)) return schema.type.find(t => t !== 'null') || schema.type[0];
      if (schema.type) return schema.type;
      if (schema.enum && schema.enum.length) return schema.enum[0] === null ? 'null' : Array.isArray(schema.enum[0]) ? 'array' : typeof schema.enum[0];
      if (schema.const !== undefined) return schema.const === null ? 'null' : Array.isArray(schema.const) ? 'array' : typeof schema.const;
      if (schema.properties || schema.required || schema.additionalProperties !== undefined) return 'object';
      if (schema.items) return 'array';
      return 'string';
    };
    const sample = (schema, path, depth) => {
      bump(path);
      if (!isObject(schema)) return null;
      if (depth > MAX_DEPTH) throw new Error(`Schema nesting exceeds the ${MAX_DEPTH}-level depth cap at ${path}.`);
      if (schema.const !== undefined) return clone(schema.const);
      if (Array.isArray(schema.enum) && schema.enum.length) return clone(schema.enum[0]);
      const type = chooseType(schema);
      switch (type) {
        case 'null': return null;
        case 'boolean': return schema.default !== undefined ? Boolean(schema.default) : false;
        case 'integer': return Number.isInteger(schema.default) ? schema.default : (Number.isInteger(schema.minimum) ? schema.minimum : 0);
        case 'number': return typeof schema.default === 'number' && Number.isFinite(schema.default) ? schema.default : (typeof schema.minimum === 'number' ? schema.minimum : 0);
        case 'array': {
          const result = [];
          const min = Number.isInteger(schema.minItems) ? Math.min(schema.minItems, 20) : 0;
          for (let i = 0; i < min; i++) result.push(schema.items ? sample(schema.items, `${path}[${i}]`, depth + 1) : null);
          return result;
        }
        case 'object': {
          const result = {};
          const props = isObject(schema.properties) ? schema.properties : {};
          Object.keys(props).forEach(key => {
            if (Array.isArray(schema.required) && schema.required.includes(key)) result[key] = sample(props[key], `${path}.${key}`, depth + 1);
          });
          return result;
        }
        case 'string':
        default:
          if (schema.default !== undefined) return String(schema.default);
          if (schema.format === 'email') return 'user@example.test';
          if (schema.format === 'uri' || schema.format === 'uri-reference') return 'https://example.test/value';
          if (Number.isInteger(schema.minLength) && schema.minLength > 0) return 'a'.repeat(Math.min(schema.minLength, 80));
          return 'example';
      }
    };
    return {sample};
  }

  function addCase(cases, kind, label, value, path, detail) {
    cases.push({kind, label, path, detail, fixture: value});
  }

  function generateBoundaryCases(schema, valid, cases, warnings) {
    const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
    if (type === 'string') {
      if (Number.isInteger(schema.minLength)) addCase(cases, 'boundary', 'minimum string length', 'a'.repeat(Math.min(schema.minLength, 80)), '$', `minLength=${schema.minLength}`);
      if (Number.isInteger(schema.maxLength)) addCase(cases, 'boundary', 'maximum string length', 'a'.repeat(Math.min(schema.maxLength, 80)), '$', `maxLength=${schema.maxLength}`);
      if (schema.pattern) {
        try { new RegExp(schema.pattern); addCase(cases, 'boundary', 'pattern candidate', String(valid).slice(0, 80), '$', `pattern=${quote(schema.pattern)}; not a proof of full regex satisfaction`); }
        catch (_) { warnings.push('$: invalid pattern was not executed.'); }
      }
    } else if (type === 'integer' || type === 'number') {
      if (typeof schema.minimum === 'number') addCase(cases, 'boundary', 'minimum numeric value', schema.minimum, '$', `minimum=${schema.minimum}`);
      if (typeof schema.maximum === 'number') addCase(cases, 'boundary', 'maximum numeric value', schema.maximum, '$', `maximum=${schema.maximum}`);
    } else if (type === 'array') {
      if (Number.isInteger(schema.minItems)) addCase(cases, 'boundary', 'minimum item count', Array.from({length: Math.min(schema.minItems, 20)}, (_, i) => schema.items ? makeGenerator(schema.items, warnings).sample(schema.items, `$[${i}]`, 1) : null), '$', `minItems=${schema.minItems}`);
      if (Number.isInteger(schema.maxItems) && schema.maxItems <= 20) addCase(cases, 'boundary', 'maximum item count', Array.from({length: schema.maxItems}, (_, i) => schema.items ? makeGenerator(schema.items, warnings).sample(schema.items, `$[${i}]`, 1) : null), '$', `maxItems=${schema.maxItems}`);
    } else if (type === 'object' && isObject(schema.properties)) {
      const keys = Object.keys(schema.properties);
      const withOptionals = clone(valid) || {};
      keys.forEach(key => { if (!(Array.isArray(schema.required) && schema.required.includes(key))) withOptionals[key] = makeGenerator(schema.properties[key], warnings).sample(schema.properties[key], `$.${key}`, 1); });
      addCase(cases, 'boundary', 'optional properties present', withOptionals, '$', 'Adds non-required declared properties where possible.');
    }
  }

  function generateInvalidCases(schema, valid, cases, warnings, path) {
    if (!isObject(schema)) return;
    const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
    if (type) {
      const wrong = {string: 7, integer: 'not-an-integer', number: 'not-a-number', boolean: 'true', object: [], array: {}, null: 'not-null'}[type];
      if (wrong !== undefined) addCase(cases, 'invalid', `wrong type (${typeName(type)})`, wrong, path, `Expected ${typeName(type)}.`);
    }
    if (Array.isArray(schema.required) && isObject(valid)) {
      const key = schema.required.find(k => Object.prototype.hasOwnProperty.call(valid, k));
      if (key) { const missing = clone(valid); delete missing[key]; addCase(cases, 'invalid', `missing required property ${quote(key)}`, missing, path, `Required includes ${quote(key)}.`); }
    }
    if (type === 'string' && Number.isInteger(schema.minLength) && schema.minLength > 0) addCase(cases, 'invalid', 'below minLength', 'a'.repeat(Math.max(0, Math.min(schema.minLength - 1, 79))), path, `minLength=${schema.minLength}`);
    if (type === 'string' && Number.isInteger(schema.maxLength)) addCase(cases, 'invalid', 'above maxLength', 'a'.repeat(Math.min(schema.maxLength + 1, 80)), path, `maxLength=${schema.maxLength}`);
    if ((type === 'integer' || type === 'number') && typeof schema.minimum === 'number') addCase(cases, 'invalid', 'below minimum', schema.minimum - (type === 'integer' ? 1 : 0.5), path, `minimum=${schema.minimum}`);
    if ((type === 'integer' || type === 'number') && typeof schema.maximum === 'number') addCase(cases, 'invalid', 'above maximum', schema.maximum + (type === 'integer' ? 1 : 0.5), path, `maximum=${schema.maximum}`);
    if (Array.isArray(schema.enum) && schema.enum.length) addCase(cases, 'invalid', 'value outside enum', '__not_in_enum__', path, 'Not one of the declared enum values.');
    if (schema.const !== undefined) addCase(cases, 'invalid', 'value differs from const', null, path, 'Does not equal const.');
    if (type === 'object' && schema.additionalProperties === false) {
      const extra = clone(valid) || {};
      extra.__unexpected = true;
      addCase(cases, 'invalid', 'unexpected property', extra, path, 'additionalProperties=false.');
    }
  }

  function run(values) {
    const raw = String(values && values.schema || '').trim();
    const requestedDraft = String(values && values.draft || '2020-12').trim() || '2020-12';
    if (!raw) return 'Input error: paste a JSON Schema document in the Schema field.';
    if (raw.length > MAX_INPUT) return `Input error: schema is ${raw.length} characters; the local cap is ${MAX_INPUT} characters.`;
    let schema;
    try { schema = JSON.parse(raw); } catch (error) { return `Input error: schema is not valid JSON (${error.message}).`; }
    if (!isObject(schema)) return 'Input error: the root schema must be a JSON object.';
    const size = analyzeSize(schema);
    if (size.nodes > MAX_NODES || size.maxDepth > MAX_DEPTH) return `Input error: schema exceeds the local complexity cap (${MAX_NODES} nodes and ${MAX_DEPTH} nesting levels).`;
    const warnings = [];
    if (!SUPPORTED_DRAFTS.includes(requestedDraft)) warnings.push(`Draft “${requestedDraft}” is not one of the labeled drafts ${SUPPORTED_DRAFTS.join(', ')}; generation uses the declared practical subset only.`);
    unsupportedKeywords(schema, '$', warnings);
    const generator = makeGenerator(schema, warnings);
    let valid;
    try { valid = generator.sample(schema, '$', 0); } catch (error) { return `Generation error: ${error.message}`; }
    const cases = [];
    addCase(cases, 'valid', 'representative valid fixture', valid, '$', 'Constructed from enum/const/defaults, required properties, and lower-bound collection sizes where supported.');
    generateBoundaryCases(schema, valid, cases, warnings);
    generateInvalidCases(schema, valid, cases, warnings, '$');
    const output = {
      tool: 'JSON Schema Test-Case Generator',
      draft: requestedDraft,
      scope: 'Bounded local generator; cases are explainable candidates, not a full validator or exhaustive coverage report.',
      supportedKeywords: ['type', 'enum', 'const', 'default', 'properties', 'required', 'additionalProperties=false', 'items', 'minLength', 'maxLength', 'pattern (diagnostic only)', 'minimum', 'maximum', 'minItems', 'maxItems', 'format=email|uri (sample hint only)'],
      limits: {maxInputCharacters: MAX_INPUT, maxSchemaNodes: MAX_NODES, maxDepth: MAX_DEPTH},
      cases: cases.map((item, index) => ({id: `${item.kind}-${index + 1}`, kind: item.kind, label: item.label, path: item.path, explanation: item.detail, fixture: item.fixture})),
      warnings: warnings.length ? warnings : ['No unsupported refs/combinators were found, but generated fixtures still should be reviewed against a complete draft validator.']
    };
    return {text: JSON.stringify(output, null, 2), filename: 'json-schema-test-cases.json', mime: 'application/json', warnings};
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['json-schema-testcase-generator'] = {
    title: 'JSON Schema Test-Case Generator',
    description: 'Generate explainable valid, boundary, and intentionally invalid JSON fixtures locally from a bounded practical JSON Schema subset. Draft labels are explicit; $ref, combinators, and exhaustive coverage are not claimed.',
    limitations: 'Browser-local only: no remote or server checks. Supports common type/constraint/property/array keywords and draft labels draft-04, draft-06, draft-07, 2019-09, and 2020-12. $ref, dynamic references, combinators, conditional/dependent keywords, regex satisfaction, formats, and exhaustive coverage are unsupported or advisory. Input is capped at 120 KiB, 1,800 schema nodes, and 18 nesting levels.',
    fields: [
      {id: 'schema', label: 'JSON Schema', type: 'textarea', placeholder: '{"type":"object","properties":{"id":{"type":"integer","minimum":1}},"required":["id"]}', help: 'Paste one JSON Schema object. Do not paste a schema bundle or external references.'},
      {id: 'draft', label: 'Declared draft', type: 'text', placeholder: '2020-12', help: 'Label only: draft-04, draft-06, draft-07, 2019-09, or 2020-12.'}
    ],
    run
  };
})();
