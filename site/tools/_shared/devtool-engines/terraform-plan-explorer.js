(() => {
  'use strict';

  const MAX_INPUT_CHARS = 2_000_000;
  const MAX_RESOURCE_CHANGES = 10_000;
  const MAX_PATHS_PER_RESOURCE = 250;
  const MAX_DEPTH = 40;

  const registry = window.AHDevToolEngines = window.AHDevToolEngines || {};

  const isObject = value => value !== null && typeof value === 'object';
  const isPlainObject = value => isObject(value) && !Array.isArray(value);
  const pathString = parts => parts.length ? parts.join('.') : '(root)';

  function parsePatterns(raw) {
    return String(raw || '')
      .split(/[\n,]+/)
      .map(value => value.trim().replace(/^\$\.?/, '').replace(/^\./, ''))
      .filter(Boolean)
      .slice(0, 100);
  }

  function patternMatches(path, patterns) {
    if (!patterns.length) return false;
    return patterns.some(pattern => {
      const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      try { return new RegExp(`(?:^|\\.)${escaped}$`, 'i').test(path); }
      catch (_) { return path.toLowerCase() === pattern.toLowerCase(); }
    });
  }

  function isMarkedSensitive(path, parts, sensitiveTree, patterns) {
    if (patternMatches(path, patterns)) return true;
    let node = sensitiveTree;
    for (const part of parts) {
      if (node === true) return true;
      if (!isObject(node)) return false;
      if (Object.prototype.hasOwnProperty.call(node, part)) node = node[part];
      else if (Object.prototype.hasOwnProperty.call(node, '*')) node = node['*'];
      else return false;
    }
    return node === true || isObject(node);
  }

  function hasUnknown(value) {
    if (value === true) return true;
    if (Array.isArray(value)) return value.some(hasUnknown);
    if (isPlainObject(value)) return Object.values(value).some(hasUnknown);
    return false;
  }

  function collectPaths(before, after, beforeSensitive, afterSensitive, afterUnknown, patterns) {
    const results = [];
    const seen = new Set();
    function visit(left, right, leftSensitive, rightSensitive, unknown, parts, depth) {
      if (results.length >= MAX_PATHS_PER_RESOURCE || depth > MAX_DEPTH) return;
      const path = pathString(parts);
      const sensitive = isMarkedSensitive(path, parts, leftSensitive, patterns) || isMarkedSensitive(path, parts, rightSensitive, patterns);
      const unknownHere = unknown === true || hasUnknown(unknown);
      const leftKeys = isPlainObject(left) ? Object.keys(left) : [];
      const rightKeys = isPlainObject(right) ? Object.keys(right) : [];
      const keys = Array.from(new Set(leftKeys.concat(rightKeys)));
      if (isPlainObject(left) || isPlainObject(right) || isPlainObject(unknown)) {
        if (!keys.length && (sensitive || unknownHere)) {
          if (!seen.has(path)) { seen.add(path); results.push({path, sensitive, unknown: unknownHere}); }
          return;
        }
        for (const key of keys) {
          const childParts = parts.concat(key);
          const childPath = pathString(childParts);
          const childUnknown = isObject(unknown) ? unknown[key] : false;
          const childLeftSensitive = isObject(leftSensitive) ? leftSensitive[key] : false;
          const childRightSensitive = isObject(rightSensitive) ? rightSensitive[key] : false;
          visit(isObject(left) ? left[key] : undefined, isObject(right) ? right[key] : undefined, childLeftSensitive, childRightSensitive, childUnknown, childParts, depth + 1);
        }
        return;
      }
      let changed = false;
      try { changed = JSON.stringify(left) !== JSON.stringify(right); } catch (_) { changed = true; }
      if (changed || sensitive || unknownHere) {
        if (!seen.has(path)) { seen.add(path); results.push({path, sensitive, unknown: unknownHere}); }
      }
    }
    visit(before, after, beforeSensitive, afterSensitive, afterUnknown, [], 0);
    if (hasUnknown(afterUnknown) && !results.some(item => item.unknown)) results.push({path: '(unknown values)', sensitive: false, unknown: true});
    return results;
  }

  function actionLabel(actions) {
    const list = Array.isArray(actions) ? actions.map(String) : [];
    if (list.includes('delete') && list.includes('create')) return 'replace';
    if (list.includes('create')) return 'create';
    if (list.includes('update')) return 'update';
    if (list.includes('delete')) return 'delete';
    return list.length ? list.join('/') : 'unknown action';
  }

  function safeValue(value, sensitive, unknown) {
    if (sensitive) return '[REDACTED: sensitive]';
    if (unknown) return '[UNKNOWN: value not known in plan]';
    if (value === undefined) return '[absent]';
    if (typeof value === 'string') return JSON.stringify(value.length > 180 ? `${value.slice(0, 177)}...` : value);
    try {
      const encoded = JSON.stringify(value);
      return encoded.length > 220 ? `${encoded.slice(0, 217)}...` : encoded;
    } catch (_) { return '[unprintable]'; }
  }

  function run(values) {
    const raw = String(values && values.planJson || '').replace(/^\uFEFF/, '');
    if (!raw.trim()) return 'Input required: paste Terraform plan JSON from `terraform show -json`. No plan was generated or checked remotely.';
    if (raw.length > MAX_INPUT_CHARS) return `Input is too large (${raw.length.toLocaleString()} characters). The browser-local cap is ${MAX_INPUT_CHARS.toLocaleString()} characters.`;
    let plan;
    try { plan = JSON.parse(raw); }
    catch (error) { return `Could not parse JSON: ${error.message}. Paste the machine-readable output of terraform show -json, not human-readable plan text.`; }
    if (!isPlainObject(plan)) return 'Expected a top-level JSON object containing resource_changes.';
    if (!Array.isArray(plan.resource_changes)) return 'Expected resource_changes to be an array. This explorer does not generate plans or infer changes from configuration.';
    if (plan.resource_changes.length > MAX_RESOURCE_CHANGES) return `Too many resource_changes (${plan.resource_changes.length.toLocaleString()}); the browser-local cap is ${MAX_RESOURCE_CHANGES.toLocaleString()}.`;

    const patterns = parsePatterns(values && values.sensitivePaths);
    const groups = {create: [], update: [], delete: [], replace: [], 'unknown action': []};
    let unknownCount = 0;
    let sensitiveCount = 0;
    const warnings = [];

    plan.resource_changes.forEach((entry, index) => {
      if (!isPlainObject(entry)) { warnings.push(`resource_changes[${index}] is not an object and was skipped.`); return; }
      const change = isPlainObject(entry.change) ? entry.change : {};
      const action = actionLabel(change.actions);
      const address = String(entry.address || entry.name || `resource_changes[${index}]`);
      const paths = collectPaths(change.before, change.after, change.before_sensitive, change.after_sensitive, change.after_unknown, patterns);
      const unknown = paths.filter(item => item.unknown);
      const sensitive = paths.filter(item => item.sensitive);
      unknownCount += unknown.length;
      sensitiveCount += sensitive.length;
      const item = {address, paths, before: change.before, after: change.after};
      (groups[action] || groups['unknown action']).push(item);
    });

    const total = Object.values(groups).reduce((sum, group) => sum + group.length, 0);
    const lines = [
      'Terraform Plan JSON Explorer — local structural summary',
      `Parsed ${total} resource change${total === 1 ? '' : 's'}; this is an inspection report, not a safety or policy verdict.`,
      '',
      'Change groups:'
    ];
    ['create', 'update', 'delete', 'replace', 'unknown action'].forEach(groupName => lines.push(`- ${groupName}: ${groups[groupName].length}`));
    lines.push(`- flagged sensitive paths: ${sensitiveCount}`, `- flagged unknown paths: ${unknownCount}`);
    if (patterns.length) lines.push(`- additional sensitive path patterns: ${patterns.length}`);
    lines.push('', 'Resource details:');

    if (!total) lines.push('- No resource changes were supplied.');
    for (const groupName of ['replace', 'delete', 'update', 'create', 'unknown action']) {
      for (const item of groups[groupName]) {
        lines.push(`\n[${groupName.toUpperCase()}] ${item.address}`);
        if (!item.paths.length) { lines.push('  - No before/after leaf difference was available; review action metadata.'); continue; }
        for (const itemPath of item.paths) {
          const parts = itemPath.path === '(root)' ? [] : itemPath.path.split('.');
          let before = item.before;
          let after = item.after;
          for (const part of parts) { before = isObject(before) ? before[part] : undefined; after = isObject(after) ? after[part] : undefined; }
          lines.push(`  - ${itemPath.path}: ${safeValue(before, itemPath.sensitive, false)} -> ${safeValue(after, itemPath.sensitive, itemPath.unknown)}${itemPath.sensitive ? ' [SENSITIVE FLAG]' : ''}${itemPath.unknown ? ' [UNKNOWN FLAG]' : ''}`);
        }
        if (item.paths.length >= MAX_PATHS_PER_RESOURCE) lines.push(`  - Path detail capped at ${MAX_PATHS_PER_RESOURCE} entries for this resource.`);
      }
    }
    if (warnings.length) lines.push('', 'Diagnostics:', ...warnings.map(warning => `- ${warning}`));
    lines.push('', 'Limitations:', '- Uses only the supplied plan JSON and optional local path patterns; it does not contact Terraform, providers, registries, or policy services.', '- Sensitive detection follows Terraform sensitive metadata plus user-supplied dotted path/glob patterns; it is not a secret scanner.', '- Unknown values are reported from after_unknown metadata and are not resolved or treated as safe/unsafe.', '- Provider semantics, runtime behavior, dependency ordering, and policy compliance are outside this report.');
    return {text: lines.join('\n'), filename: 'terraform-plan-explorer.txt', mime: 'text/plain;charset=utf-8', warnings};
  }

  registry['terraform-plan-explorer'] = {
    title: 'Terraform Plan JSON Explorer & Change-Risk Filter',
    description: 'Inspect supplied Terraform plan JSON locally, group create/update/delete/replace actions, and flag sensitive or unknown paths. It never generates plans or asserts policy safety.',
    limitations: 'Browser-local inspection only; bounded to 2,000,000 input characters, 10,000 resource_changes, and 250 paths per resource. Sensitive detection is metadata- and pattern-based, unknown values are not resolved, and provider/runtime/policy semantics are not evaluated. No remote or server checks.',
    fields: [
      {id: 'planJson', label: 'Terraform plan JSON', type: 'textarea', placeholder: 'Paste terraform show -json output here', help: 'Supply a JSON object with resource_changes. Human-readable plan text is not accepted.'},
      {id: 'sensitivePaths', label: 'Additional sensitive paths (optional)', type: 'text', placeholder: 'credentials.password, *.token', help: 'Comma- or newline-separated dotted paths/globs to flag in addition to Terraform sensitive metadata.'}
    ],
    run
  };
})();
