(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines["js-bundle-stats-explorer"] = {
    title: 'JavaScript Bundle Stats Explorer',
    description: 'Inspect common webpack, Rollup, and Vite JSON stats locally, then get bounded sorted module and chunk size summaries. Results are best-effort for documented shapes and do not calculate exact final gzip sizes.',
    limitations: 'Accepts one pasted JSON document up to 2 MB and reports at most 100 rows per category. This is not an arbitrary-format parser, build-integrated analyzer, treemap renderer, or exact compressed-size calculator; gzip/brotli values are only reported when the input already supplies them.',
    fields: [
      {
        id: 'stats',
        label: 'Stats JSON',
        type: 'textarea',
        placeholder: '{"modules":[{"name":"src/app.js","size":4200}],"chunks":[{"id":0,"names":["main"],"size":4200}]}',
        help: 'Paste a webpack stats export, a Rollup-style JSON report, or a Vite manifest/assets JSON object. Do not paste secrets.'
      },
      {
        id: 'limit',
        label: 'Rows per summary',
        type: 'text',
        placeholder: '20',
        help: 'Optional integer from 1 to 100; defaults to 20.'
      }
    ],

    run(values) {
      const source = String(values && values.stats || '').trim();
      if (!source) return 'Input error: paste a JSON stats document first.';
      if (source.length > 2 * 1024 * 1024) {
        return 'Input error: the JSON exceeds the 2 MB local safety limit. Export a smaller stats subset.';
      }

      let data;
      try {
        data = JSON.parse(source.replace(/^\uFEFF/, ''));
      } catch (error) {
        return 'Input error: invalid JSON. Check the export near the reported syntax position and paste JSON rather than JavaScript.';
      }
      if (!data || typeof data !== 'object') return 'Input error: the top-level JSON value must be an object or array.';

      let limit = Number.parseInt(String(values && values.limit || '20').trim(), 10);
      if (!Number.isFinite(limit)) limit = 20;
      limit = Math.max(1, Math.min(100, limit));

      const modules = [];
      const chunks = [];
      const entries = [];
      const seenModule = new Set();
      const seenChunk = new Set();
      const warnings = [];
      let visited = 0;
      let stopped = false;

      const numericSize = (object) => {
        const fields = ['size', 'parsedSize', 'statSize', 'bytes', 'byteSize'];
        for (const field of fields) {
          const value = object[field];
          if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
            return {value, field};
          }
        }
        return null;
      };
      const labelOf = (object, fallback) => {
        const candidates = [object.name, object.identifier, object.resource, object.path, object.file, object.filename, object.id];
        for (const value of candidates) {
          if (typeof value === 'string' && value.trim()) return value.trim();
          if (typeof value === 'number') return String(value);
        }
        if (Array.isArray(object.names) && object.names.length) return object.names.join(', ');
        return fallback;
      };
      const isChunkObject = (object, hint) => {
        const key = String(hint || '').toLowerCase();
        return key === 'chunks' || key === 'chunk' || (object && (object.modules || object.files) && (object.names || object.id !== undefined) && !object.identifier && !object.resource);
      };
      const isModuleObject = (object, hint) => {
        const size = numericSize(object);
        if (!size || isChunkObject(object, hint)) return false;
        const hasLabel = ['name', 'identifier', 'resource', 'path', 'file', 'filename', 'id'].some(key => object[key] !== undefined);
        return hasLabel || String(hint || '').toLowerCase() === 'modules';
      };
      const addUnique = (list, seen, item) => {
        const key = item.label + '|' + item.value + '|' + item.field;
        if (!seen.has(key)) { seen.add(key); list.push(item); }
      };
      const walk = (value, hint, depth) => {
        if (stopped || depth > 30) return;
        if (++visited > 50000) { stopped = true; return; }
        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) walk(value[i], hint, depth + 1);
          return;
        }
        if (!value || typeof value !== 'object') return;

        const size = numericSize(value);
        if (size && isChunkObject(value, hint)) {
          addUnique(chunks, seenChunk, {label: labelOf(value, 'unnamed chunk'), value: size.value, field: size.field});
        } else if (size && isModuleObject(value, hint)) {
          addUnique(modules, seenModule, {label: labelOf(value, 'unnamed module'), value: size.value, field: size.field});
        }

        for (const key of Object.keys(value)) {
          const child = value[key];
          if (isLikelyManifestEntry(child, key)) entries.push({label: key, file: child.file || child.src || key});
          walk(child, key, depth + 1);
        }
      };
      const isLikelyManifestEntry = (value, key) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        if (key === 'modules' || key === 'chunks' || key === 'assets') return false;
        return typeof value.file === 'string' || typeof value.src === 'string';
      };

      walk(data, '', 0);
      if (stopped) warnings.push('Traversal stopped at 50,000 JSON nodes; results are partial.');

      const formatHints = [];
      if (data.modules || data.chunks || data.assets || data.children) formatHints.push('webpack-like');
      if (data.outputs || data.generated || data.bundle || data.treemap) formatHints.push('Rollup-like');
      if (entries.length || (data && !data.modules && !data.chunks && typeof data === 'object')) formatHints.push('Vite-manifest-compatible');
      const format = formatHints.length ? Array.from(new Set(formatHints)).join(' / ') : 'unrecognized/common-shape heuristic';
      const bytes = (n) => {
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
        return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
      };
      const sorted = (items) => items.slice().sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
      const lines = [`JavaScript Bundle Stats Explorer`, `Shape hint: ${format}`, `Rows shown: up to ${limit} per category`];

      const addTable = (title, items) => {
        lines.push('', `${title} (${items.length} found)`);
        if (!items.length) { lines.push('  No numeric size records matched this category.'); return; }
        sorted(items).slice(0, limit).forEach((item, index) => lines.push(`  ${String(index + 1).padStart(3, ' ')}  ${bytes(item.value).padStart(10, ' ')}  ${item.label}`));
        if (items.length > limit) lines.push(`  … ${items.length - limit} more omitted by the row limit.`);
      };
      addTable('Largest modules', modules);
      addTable('Largest chunks', chunks);
      if (entries.length) {
        const uniqueEntries = Array.from(new Map(entries.map(entry => [entry.label + '|' + entry.file, entry])).values());
        lines.push('', `Manifest entries (${uniqueEntries.length} found)`);
        uniqueEntries.slice(0, limit).forEach((entry, index) => lines.push(`  ${String(index + 1).padStart(3, ' ')}  ${entry.label} → ${entry.file}`));
        if (uniqueEntries.length > limit) lines.push(`  … ${uniqueEntries.length - limit} more omitted by the row limit.`);
      }
      if (!modules.length && !chunks.length && !entries.length) warnings.push('No recognized module/chunk sizes or manifest file entries were found; this may be an unsupported export shape.');
      if (modules.some(item => item.field !== 'size') || chunks.some(item => item.field !== 'size')) warnings.push('Some rows use an alternate supplied field such as parsedSize, statSize, or bytes; the tool does not derive those values.');
      warnings.push('Sizes are reported from the pasted metadata only; this is not a rebuild and does not claim exact final gzip or brotli output.');
      if (warnings.length) { lines.push('', 'Notes'); warnings.forEach(note => lines.push(`  - ${note}`)); }
      return {text: lines.join('\n'), warnings};
    }
  };
})();
