(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_CONFIG = 200 * 1024;
  const MAX_FILES = 10000;
  const MAX_FILE_LINE = 1000;
  const MAX_REQUESTS = 500;
  const MAX_REQUEST_LINE = 1000;
  const EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.json'];

  const cleanPath = (value) => {
    let path = String(value || '').trim().replace(/\\/g, '/');
    if (!path) return '';
    if (path.startsWith('/') || /^[A-Za-z]:\//.test(path)) return null;
    const parts = [];
    for (const part of path.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (!parts.length) return null;
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    return parts.join('/');
  };

  const dirname = (file) => {
    const i = file.lastIndexOf('/');
    return i < 0 ? '' : file.slice(0, i);
  };

  const join = (a, b) => cleanPath([a, b].filter(Boolean).join('/'));
  const hasKnownExtension = (path) => EXTENSIONS.some((ext) => path.endsWith(ext));
  const unique = (items) => [...new Set(items.filter((item) => item !== null && item !== ''))];

  function parseConfig(raw) {
    const text = String(raw || '').trim();
    if (!text) throw new Error('tsconfig JSON is empty.');
    if (text.length > MAX_CONFIG) throw new Error('tsconfig exceeds the 200 KB local limit.');
    let config;
    try {
      config = JSON.parse(text);
    } catch (error) {
      throw new Error(`tsconfig is not valid JSON: ${error.message}`);
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('tsconfig must be a JSON object.');
    }
    const options = config.compilerOptions && typeof config.compilerOptions === 'object'
      ? config.compilerOptions : config;
    const baseUrl = options.baseUrl == null ? '' : String(options.baseUrl);
    const normalizedBase = cleanPath(baseUrl);
    if (normalizedBase === null) throw new Error('baseUrl must be a relative path inside the virtual tree.');
    const paths = options.paths == null ? {} : options.paths;
    if (!paths || typeof paths !== 'object' || Array.isArray(paths)) {
      throw new Error('paths must be an object mapping patterns to target arrays.');
    }
    const mappings = [];
    for (const [pattern, targets] of Object.entries(paths)) {
      if (typeof pattern !== 'string' || !pattern || (pattern.match(/\*/g) || []).length > 1) {
        throw new Error(`Unsupported paths key “${pattern}”; use at most one * wildcard.`);
      }
      if (!Array.isArray(targets) || !targets.length || targets.some((target) => typeof target !== 'string')) {
        throw new Error(`paths entry “${pattern}” must contain one or more string targets.`);
      }
      mappings.push({ pattern, targets, wildcard: pattern.indexOf('*') >= 0 });
    }
    mappings.sort((a, b) => b.pattern.replace('*', '').length - a.pattern.replace('*', '').length);
    return { baseUrl: normalizedBase || '', mappings };
  }

  function parseFiles(raw) {
    const lines = String(raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length > MAX_FILES) throw new Error(`Virtual file list exceeds ${MAX_FILES} files.`);
    const files = new Set();
    const invalid = [];
    for (const line of lines) {
      if (line.length > MAX_FILE_LINE) { invalid.push(`file name is over ${MAX_FILE_LINE} characters: ${line.slice(0, 40)}…`); continue; }
      const path = cleanPath(line);
      if (!path) invalid.push(`invalid relative file path: ${line}`);
      else files.add(path);
    }
    if (invalid.length) throw new Error(`Virtual file list error: ${invalid.slice(0, 3).join('; ')}`);
    return files;
  }

  function parseRequests(raw) {
    const lines = String(raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) throw new Error('Add at least one import request.');
    if (lines.length > MAX_REQUESTS) throw new Error(`Import requests exceed ${MAX_REQUESTS} lines.`);
    return lines.map((line, index) => {
      if (line.length > MAX_REQUEST_LINE) throw new Error(`Import request ${index + 1} exceeds ${MAX_REQUEST_LINE} characters.`);
      const separator = line.indexOf('|');
      if (separator < 0) return { from: '', specifier: line };
      const from = line.slice(0, separator).trim();
      const specifier = line.slice(separator + 1).trim();
      if (!specifier) throw new Error(`Import request ${index + 1} has no specifier after “|”.`);
      const source = from ? cleanPath(from) : '';
      if (from && !source) throw new Error(`Import request ${index + 1} has an invalid source file path.`);
      return { from: source || '', specifier };
    });
  }

  function candidatesFor(base, from, specifier, mappings) {
    const bases = [];
    const relative = specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.' || specifier === '..';
    if (relative) {
      bases.push(join(dirname(from), specifier));
    } else {
      for (const mapping of mappings) {
        let starValue = '';
        let matches = false;
        if (mapping.wildcard) {
          const [before, after] = mapping.pattern.split('*');
          matches = specifier.startsWith(before) && specifier.endsWith(after) && specifier.length >= before.length + after.length;
          if (matches) starValue = specifier.slice(before.length, specifier.length - after.length || undefined);
        } else {
          matches = specifier === mapping.pattern;
        }
        if (matches) {
          for (const target of mapping.targets) {
            const substituted = mapping.wildcard ? target.replace('*', starValue) : target;
            bases.push(join(base, substituted));
          }
          break;
        }
      }
      if (!bases.length) bases.push(join(base, specifier));
    }
    const result = [];
    for (const candidate of bases) {
      if (!candidate) continue;
      result.push(candidate);
      if (!hasKnownExtension(candidate)) {
        for (const ext of EXTENSIONS) result.push(candidate + ext);
      }
      for (const ext of EXTENSIONS) result.push(candidate + '/index' + ext);
    }
    return unique(result);
  }

  function run(values) {
    const input = values || {};
    let config;
    try { config = parseConfig(input.tsconfig); } catch (error) { return `ERROR\n${error.message}`; }
    let files;
    try { files = parseFiles(input.files); } catch (error) { return `ERROR\n${error.message}`; }
    let requests;
    try { requests = parseRequests(input.requests); } catch (error) { return `ERROR\n${error.message}`; }

    const output = [
      'TypeScript Path Alias Resolver Simulator',
      `baseUrl: ${config.baseUrl || '(virtual root)'}`,
      `paths mappings: ${config.mappings.length || '(none)'}`,
      `extension probe subset: ${EXTENSIONS.join(', ')}`,
      `virtual files: ${files.size}`,
      ''
    ];
    requests.forEach((request, index) => {
      const candidates = candidatesFor(config.baseUrl, request.from, request.specifier, config.mappings);
      const hit = candidates.find((candidate) => files.has(candidate));
      output.push(`${index + 1}. ${request.from ? request.from + ' | ' : ''}${request.specifier}`);
      if (hit) output.push(`   RESOLVED: ${hit}`);
      else output.push('   UNRESOLVED: no candidate exists in the virtual file list');
      output.push('   candidates:');
      candidates.forEach((candidate, candidateIndex) => output.push(`   ${candidateIndex + 1}. ${candidate}${candidate === hit ? '  [match]' : ''}`));
      output.push('');
    });
    output.push('Scope: compile-time-style virtual lookup only; no package exports, symlink, node runtime, filesystem, or remote checks.');
    return output.join('\n').trim();
  }

  window.AHDevToolEngines['typescript-path-resolver'] = {
    title: 'TypeScript Path Alias Resolver Simulator',
    description: 'Resolve tsconfig baseUrl/paths against a pasted virtual file list with deterministic candidate traces and a declared extension-probing subset. This simulates compile-time-style lookup only; it does not inspect packages or runtime behavior.',
    limitations: 'Local-only and bounded: strict JSON tsconfig, relative virtual paths, one optional * per paths key, and up to 10,000 files/500 requests. Probes only .ts, .tsx, .d.ts, .js, .jsx, and .json plus index forms; package exports, node_modules/package resolution, symlinks, emitted imports, and Node runtime resolution are out of scope.',
    fields: [
      { id: 'tsconfig', label: 'tsconfig JSON', type: 'textarea', placeholder: '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}', help: 'Paste strict JSON. compilerOptions.baseUrl and compilerOptions.paths are read; top-level equivalents are also accepted.' },
      { id: 'files', label: 'Virtual file list', type: 'textarea', placeholder: 'src/app.ts\nsrc/utils/index.ts\nsrc/types.d.ts', help: 'One relative POSIX-style path per line. These are the only files that can resolve.' },
      { id: 'requests', label: 'Import requests', type: 'textarea', placeholder: 'src/app.ts | @/utils\n@/types\n./utils | src/app.ts', help: 'One per line: “source-file | specifier” for relative imports, or just a bare specifier. The source file is used for ./ and ../.' }
    ],
    run
  };
})();
