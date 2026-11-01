(() => {
  'use strict';

  const MAX_INPUT_CHARS = 120000;
  const MAX_TOTAL_CHARS = 200000;
  const MAX_KEYS = 500;
  const PATH_KEYS = new Set([
    'baseUrl', 'rootDir', 'outDir', 'declarationDir', 'mapRoot', 'sourceRoot',
    'tsBuildInfoFile', 'typeRoots', 'paths', 'files', 'include', 'exclude'
  ]);
  const ARRAY_OVERRIDE_KEYS = new Set(['files', 'include', 'exclude']);
  const SKIP_INHERIT_KEYS = new Set(['references']);

  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const isPlainObject = value => isObject(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

  function parseConfig(raw, label) {
    const text = String(raw == null ? '' : raw).replace(/^\uFEFF/, '');
    if (!text.trim()) return { value: {}, label, empty: true };
    if (text.length > MAX_INPUT_CHARS) {
      throw new Error(`${label} exceeds the ${MAX_INPUT_CHARS.toLocaleString()} character limit.`);
    }
    let value;
    try { value = JSON.parse(text); }
    catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
    if (!isPlainObject(value)) throw new Error(`${label} must be a JSON object, not an array or scalar.`);
    return { value, label, empty: false };
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (isPlainObject(value)) {
      const out = {};
      Object.keys(value).forEach(key => { out[key] = clone(value[key]); });
      return out;
    }
    return value;
  }

  function mergeConfigs(base, child, provenance, origin, prefix) {
    const result = clone(base);
    Object.keys(child).forEach(key => {
      if (SKIP_INHERIT_KEYS.has(key)) {
        if (!own(result, key)) result[key] = clone(child[key]);
        provenance[prefix ? `${prefix}.${key}` : key] = origin;
        return;
      }
      const path = prefix ? `${prefix}.${key}` : key;
      const childValue = child[key];
      if (key === 'compilerOptions' && isPlainObject(childValue)) {
        const current = isPlainObject(result.compilerOptions) ? result.compilerOptions : {};
        result.compilerOptions = clone(current);
        Object.keys(childValue).forEach(option => {
          result.compilerOptions[option] = clone(childValue[option]);
          provenance[`compilerOptions.${option}`] = origin;
        });
        provenance.compilerOptions = origin;
      } else {
        result[key] = clone(childValue);
        provenance[path] = origin;
      }
    });
    return result;
  }

  function display(value) {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  }

  function pathNotes(value, key, origin) {
    if (!PATH_KEYS.has(key)) return [];
    const values = Array.isArray(value) ? value : [value];
    const notes = [];
    values.forEach(item => {
      if (typeof item === 'string') {
        const relative = !item.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(item) && !item.startsWith('\\\\');
        notes.push(`- ${key}: ${item} — ${relative ? `relative to the ${origin} config file` : 'looks absolute; no filesystem check performed'}`);
      } else if (key === 'paths' && isPlainObject(item)) {
        notes.push(`- ${key}: path mappings are shown as supplied; each target remains relative to the config that declares baseUrl (${origin})`);
      }
    });
    return notes;
  }

  function run(values) {
    const input = values || {};
    const rootPath = String(input.rootPath || 'tsconfig.json').trim() || 'tsconfig.json';
    const referencedPath = String(input.referencedPath || 'base.tsconfig.json').trim() || 'base.tsconfig.json';
    const rootRaw = String(input.rootConfig == null ? '' : input.rootConfig);
    const referencedRaw = String(input.referencedConfig == null ? '' : input.referencedConfig);
    if (rootRaw.length + referencedRaw.length > MAX_TOTAL_CHARS) {
      return `Input is too large. Keep the combined JSON under ${MAX_TOTAL_CHARS.toLocaleString()} characters.`;
    }

    let root;
    let referenced;
    try {
      root = parseConfig(rootRaw, `Root config (${rootPath})`);
      referenced = parseConfig(referencedRaw, `Referenced config (${referencedPath})`);
    } catch (error) {
      return `Cannot compare configs.\n\nDiagnostic: ${error.message}`;
    }

    const rootKeys = Object.keys(root.value);
    const referencedKeys = Object.keys(referenced.value);
    if (rootKeys.length + referencedKeys.length > MAX_KEYS) {
      return `Input is too complex. Keep the combined top-level key count under ${MAX_KEYS}.`;
    }

    const provenance = {};
    referencedKeys.forEach(key => {
      provenance[key] = referencedPath;
      if (key === 'compilerOptions' && isPlainObject(referenced.value[key])) {
        Object.keys(referenced.value[key]).forEach(option => { provenance[`compilerOptions.${option}`] = referencedPath; });
      }
    });
    const effective = mergeConfigs(referenced.value, root.value, provenance, rootPath, '');
    const lines = [];
    lines.push('TypeScript config inheritance comparison');
    lines.push(`Root: ${rootPath}`);
    lines.push(`Referenced/base: ${referencedPath}`);
    lines.push('');
    lines.push('Effective options (root values override referenced values):');

    const effectiveOptions = isPlainObject(effective.compilerOptions) ? effective.compilerOptions : {};
    const optionNames = Object.keys(effectiveOptions).sort();
    if (!optionNames.length) lines.push('- compilerOptions: none supplied');
    optionNames.forEach(option => {
      const source = provenance[`compilerOptions.${option}`] || rootPath;
      lines.push(`- compilerOptions.${option} = ${display(effectiveOptions[option])} [from ${source}]`);
      pathNotes(effectiveOptions[option], option, source).forEach(note => lines.push(note));
    });

    const topNames = Object.keys(effective).filter(key => key !== 'compilerOptions').sort();
    if (topNames.length) {
      lines.push('');
      lines.push('Effective top-level settings:');
      topNames.forEach(key => {
        const source = provenance[key] || rootPath;
        lines.push(`- ${key} = ${display(effective[key])} [from ${source}]`);
        pathNotes(effective[key], key, source).forEach(note => lines.push(note));
      });
    }

    const rootOnly = rootKeys.filter(key => !own(referenced.value, key));
    const overridden = rootKeys.filter(key => own(referenced.value, key));
    lines.push('');
    lines.push(`Root-only keys: ${rootOnly.length ? rootOnly.join(', ') : 'none'}`);
    lines.push(`Root-overridden keys: ${overridden.length ? overridden.join(', ') : 'none'}`);
    lines.push('');
    lines.push('Scope notes:');
    lines.push('- This is a bounded JSON comparison, not full tsc --showConfig behavior.');
    lines.push('- Relative paths are annotated with their declaring config origin; no filesystem, package, extends-chain, or project-reference resolution is performed.');
    lines.push('- The supplied pair is treated as one referenced config plus one root config; package-based extends and additional chain members must be pasted separately.');
    lines.push('- Array-valued files/include/exclude are shown as root overrides when present; glob expansion and compiler-version-specific semantics are not evaluated.');
    return lines.join('\n');
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['typescript-config-explorer'] = {
    title: 'TypeScript Config Inheritance & Effective Options Explorer',
    description: 'Compare supplied root and referenced tsconfig JSON objects, with option provenance and relative-path notes. Browser-local only: no filesystem, package, or full TypeScript compiler resolution.',
    limitations: 'Accepts one pasted root config and one pasted referenced/base config. It does not resolve additional extends chains, npm packages, filesystem globs, project references, or a pinned TypeScript compiler version; its merge view is an explainable bounded comparison, not a full tsc --showConfig replacement. Each input is capped at 120,000 characters and the combined input at 200,000 characters.',
    fields: [
      { id: 'rootConfig', label: 'Root tsconfig JSON', type: 'textarea', placeholder: '{\n  "extends": "./base.tsconfig.json",\n  "compilerOptions": { "strict": true }\n}', help: 'Paste the inheriting/root JSON object.' },
      { id: 'referencedConfig', label: 'Referenced/base tsconfig JSON', type: 'textarea', placeholder: '{\n  "compilerOptions": { "target": "ES2022", "strict": false },\n  "include": ["src"]\n}', help: 'Paste the single referenced config JSON object to compare.' },
      { id: 'rootPath', label: 'Root config path (optional)', type: 'text', placeholder: 'packages/app/tsconfig.json', help: 'Used only to explain relative-path provenance; no file is opened.' },
      { id: 'referencedPath', label: 'Referenced config path (optional)', type: 'text', placeholder: 'tsconfig.base.json', help: 'Used only as a textual origin for relative-path notes.' }
    ],
    run
  };
})();
