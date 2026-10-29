/* JavaScript Lockfile Inspector & Cross-File Consistency Checker
 * Browser-local, paste-only structural inspection. No registry or runtime checks.
 */
(function () {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['js-lockfile-consistency-checker'] = {
    title: 'JavaScript Lockfile Inspector & Cross-File Consistency Checker',
    description: 'Compare package.json direct dependency declarations with a pasted npm, pnpm, or Yarn lockfile and flag structural drift or stale entries locally.',
    limitations: 'Supports npm package-lock JSON v1–v3, common pnpm-lock.yaml importer sections, and Yarn Classic lock text. This is not a package-manager implementation: it does not resolve semver, aliases, workspace graphs, peer/optional/platform rules, registry metadata, integrity hashes, or install/runtime behavior. Manager parity and unsupported syntax are reported as limitations; no remote/server checks are performed.',
    fields: [
      { id: 'packageJson', label: 'package.json', type: 'textarea', placeholder: '{\n  "dependencies": { "react": "^18.0.0" }\n}', help: 'Paste the package.json object. Direct dependencies are read from dependencies, devDependencies, optionalDependencies, and peerDependencies.' },
      { id: 'lockfile', label: 'Lockfile text', type: 'textarea', placeholder: 'Paste package-lock.json, pnpm-lock.yaml, or yarn.lock', help: 'Paste one lockfile only. Keep the original text; do not combine formats.' },
      { id: 'lockfileKind', label: 'Lockfile kind', type: 'text', placeholder: 'npm, pnpm, or yarn', help: 'Choose the parser explicitly. Accepted values: npm, pnpm, yarn (package-lock is also accepted for npm).' }
    ],
    run: function (values) {
      var input = values || {};
      var packageText = String(input.packageJson || '');
      var lockText = String(input.lockfile || '');
      var kind = String(input.lockfileKind || '').trim().toLowerCase();
      var MAX_PACKAGE = 512 * 1024;
      var MAX_LOCK = 2 * 1024 * 1024;
      var MAX_LINES = 100000;
      var out = [];
      var warnings = [];

      if (packageText.length > MAX_PACKAGE) return 'Input rejected: package.json exceeds the 512 KiB local limit.';
      if (lockText.length > MAX_LOCK) return 'Input rejected: lockfile exceeds the 2 MiB local limit.';
      if (packageText.length === 0) return 'Diagnostic: paste a package.json object.';
      if (lockText.length === 0) return 'Diagnostic: paste one supported lockfile.';
      if (packageText.split(/\r?\n/).length + lockText.split(/\r?\n/).length > MAX_LINES) return 'Input rejected: combined input exceeds the 100,000-line complexity limit.';
      if (kind === 'package-lock' || kind === 'package-lock.json') kind = 'npm';
      if (['npm', 'pnpm', 'yarn'].indexOf(kind) === -1) return 'Diagnostic: lockfile kind must be npm, pnpm, or yarn.';

      var pkg;
      try { pkg = JSON.parse(packageText.replace(/^\uFEFF/, '')); }
      catch (e) { return 'Diagnostic: package.json is not valid JSON: ' + e.message; }
      if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return 'Diagnostic: package.json must be a JSON object.';

      var groups = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
      var expected = Object.create(null);
      var groupOf = Object.create(null);
      groups.forEach(function (group) {
        var section = pkg[group];
        if (!section) return;
        if (typeof section !== 'object' || Array.isArray(section)) {
          warnings.push('package.json ' + group + ' is not an object and was ignored.');
          return;
        }
        Object.keys(section).forEach(function (name) {
          if (!expected[name]) expected[name] = String(section[name]);
          groupOf[name] = groupOf[name] ? groupOf[name] + ', ' + group : group;
        });
      });
      var names = Object.keys(expected).sort();
      if (!names.length) warnings.push('No direct dependencies were found in the four inspected package.json sections.');

      var found = Object.create(null);
      var parserNotes = [];
      if (kind === 'npm') parseNpm(lockText, found, parserNotes, warnings);
      else if (kind === 'pnpm') parsePnpm(lockText, found, parserNotes, warnings);
      else parseYarn(lockText, found, parserNotes, warnings);

      var missing = names.filter(function (name) { return !found[name]; });
      var present = names.filter(function (name) { return !!found[name]; });
      var lines = [];
      lines.push('JavaScript lockfile consistency report');
      lines.push('Parser: ' + kind + ' | Direct declarations: ' + names.length + ' | Matched structurally: ' + present.length + ' | Missing from lockfile: ' + missing.length);
      lines.push('');
      if (!names.length) lines.push('Result: no direct dependency declarations to compare.');
      else if (!missing.length) lines.push('Result: every inspected direct dependency has a corresponding structural lockfile entry.');
      else {
        lines.push('Potentially stale or incomplete lockfile entries:');
        missing.forEach(function (name) { lines.push('- ' + name + ' (' + groupOf[name] + ', declared ' + expected[name] + ')'); });
      }
      if (present.length) {
        lines.push('');
        lines.push('Matched direct dependencies:');
        present.forEach(function (name) { lines.push('- ' + name + (found[name] ? ' [' + found[name] + ']' : '')); });
      }
      if (parserNotes.length) { lines.push(''); lines.push('Parser notes:'); parserNotes.forEach(function (n) { lines.push('- ' + n); }); }
      if (warnings.length) { lines.push(''); lines.push('Warnings and limitations:'); warnings.forEach(function (w) { lines.push('- ' + w); }); }
      lines.push('');
      lines.push('This local report checks names and visible structure only; it does not prove installability, version satisfaction, peer compatibility, platform coverage, or manager parity with CI.');
      return { text: lines.join('\n'), filename: 'lockfile-consistency-report.txt', mime: 'text/plain;charset=utf-8', warnings: warnings };

      function mark(map, name, detail) {
        if (!name || typeof name !== 'string') return;
        map[name] = detail || 'entry';
      }
      function parseNpm(text, map, notes, warns) {
        var data;
        try { data = JSON.parse(text.replace(/^\uFEFF/, '')); }
        catch (e) { warns.push('npm lockfile is not valid JSON: ' + e.message); return; }
        if (!data || typeof data !== 'object' || Array.isArray(data)) { warns.push('npm lockfile must be a JSON object.'); return; }
        if (data.lockfileVersion !== undefined) notes.push('npm lockfileVersion ' + data.lockfileVersion + ' detected; only structural name presence is compared.');
        if (data.packages && typeof data.packages === 'object') {
          Object.keys(data.packages).forEach(function (path) {
            var m = path.match(/^node_modules\/(.+)$/);
            if (m && m[1].indexOf('node_modules/') === -1) mark(map, m[1], path);
          });
          notes.push('Read npm v2/v3 packages map. Nested and workspace paths are not resolved as direct dependency evidence.');
        } else if (data.dependencies && typeof data.dependencies === 'object') {
          Object.keys(data.dependencies).forEach(function (name) { mark(map, name, 'dependencies.' + name); });
          notes.push('Read npm v1 dependencies map; nested dependency semantics are not resolved.');
        } else warns.push('No recognized npm packages or dependencies map was found.');
      }
      function parsePnpm(text, map, notes, warns) {
        var lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
        var importer = false, section = '', sectionIndent = -1, count = 0, recognized = false;
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (!line.trim() || /^\s*#/.test(line)) continue;
          var indent = (line.match(/^\s*/) || [''])[0].length;
          var trimmed = line.trim();
          if (/^importers:\s*$/.test(trimmed)) { importer = true; continue; }
          if (importer && indent === 2 && /^[^\s][^:]*:\s*$/.test(trimmed)) { importer = /^\.\s*:\s*$/.test(trimmed); section = ''; sectionIndent = -1; continue; }
          if (!importer) continue;
          if (!/^\s{4,}/.test(line)) { importer = false; continue; }
          var sm = trimmed.match(/^(dependencies|devDependencies|optionalDependencies|peerDependencies):\s*$/);
          if (sm && indent >= 4) { section = sm[1]; sectionIndent = indent; recognized = true; continue; }
          if (section && indent === sectionIndent + 2) {
            var dm = trimmed.match(/^(['"]?)([^:'\"\s][^:]*)\1\s*:/);
            if (dm) { mark(map, dm[2].trim(), 'importer . ' + section); count++; }
          }
          if (section && indent <= sectionIndent && !sm) section = '';
        }
        if (!recognized) warns.push('No importer "." dependency sections were recognized in pnpm-lock.yaml.');
        else notes.push('Read the root pnpm importer (.) only; workspace importers and resolved package snapshots are not compared.');
        if (count === 0 && recognized) warns.push('The root pnpm importer had no readable dependency keys.');
      }
      function parseYarn(text, map, notes, warns) {
        var lines = text.replace(/^\uFEFF/, '').split(/\r?\n/), blocks = 0;
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (!line || /^\s/.test(line) || /^\s*#/.test(line)) continue;
          var m = line.match(/^\s*(.+):\s*$/);
          if (!m) continue;
          var selectorText = m[1].trim().replace(/^['"]|['"]$/g, '');
          if (selectorText === '__metadata') continue;
          selectorText.split(/\s*,\s*/).forEach(function (selector) {
            selector = selector.replace(/^['"]|['"]$/g, '').trim();
            var at = selector.charAt(0) === '@' ? selector.indexOf('@', 1) : selector.indexOf('@');
            if (at > 0) mark(map, selector.slice(0, at), 'Yarn selector');
          });
          blocks++;
        }
        if (!blocks) warns.push('No Yarn Classic selector blocks were recognized. Yarn Berry/modern descriptors may not parse with this limited reader.');
        else notes.push('Read top-level Yarn selector blocks; aliases, protocols, workspaces, and peer suffixes are not semantically resolved.');
      }
    }
  };
})();
