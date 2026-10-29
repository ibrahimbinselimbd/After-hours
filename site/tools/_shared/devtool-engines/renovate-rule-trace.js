(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_INPUT_CHARS = 200000;
  const MAX_RULES = 100;
  const MAX_KEYS_PER_RULE = 50;

  const RULE_FIELDS = new Set([
    'description', 'enabled', 'automerge', 'automergeType', 'groupName',
    'groupSlug', 'schedule', 'rangeStrategy', 'labels', 'addLabels',
    'semanticCommitType', 'semanticCommitScope', 'prPriority', 'commitMessage',
    'matchPackageNames', 'matchPackagePrefixes', 'matchManagers',
    'matchDatasources', 'matchDepTypes', 'matchUpdateTypes'
  ]);
  const MATCH_FIELDS = new Set([
    'matchPackageNames', 'matchPackagePrefixes', 'matchManagers',
    'matchDatasources', 'matchDepTypes', 'matchUpdateTypes'
  ]);

  const asText = value => String(value == null ? '' : value);

  function parseJson(label, value) {
    const source = asText(value).replace(/^\uFEFF/, '').trim();
    if (!source) throw new Error(`${label} is required.`);
    if (source.length > MAX_INPUT_CHARS) {
      throw new Error(`${label} exceeds the ${MAX_INPUT_CHARS.toLocaleString()} character limit.`);
    }
    try {
      return JSON.parse(source);
    } catch (error) {
      const position = error && /position (\d+)/i.exec(error.message || '');
      throw new Error(`${label} is not valid JSON${position ? ` near character ${position[1]}` : ''}.`);
    }
  }

  function listValue(value, field, ruleIndex, diagnostics) {
    if (value == null) return [];
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
      diagnostics.push(`Rule ${ruleIndex}: ${field} must be a non-empty-string array.`);
      return [];
    }
    return value.map(item => item.trim());
  }

  function globMatches(pattern, value) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i').test(value);
  }

  function matchesAny(patterns, value) {
    return patterns.some(pattern => globMatches(pattern, value));
  }

  function matchesRule(rule, context, ruleIndex, diagnostics) {
    for (const field of MATCH_FIELDS) {
      if (!(field in rule)) continue;
      const values = listValue(rule[field], field, ruleIndex, diagnostics);
      if (!values.length) return false;
      let candidate = '';
      if (field === 'matchPackageNames' || field === 'matchPackagePrefixes') candidate = context.packageName;
      if (field === 'matchManagers') candidate = context.manager;
      if (field === 'matchDatasources') candidate = context.datasource;
      if (field === 'matchDepTypes') candidate = context.depType;
      if (field === 'matchUpdateTypes') candidate = context.updateType;
      if (field === 'matchPackagePrefixes') {
        if (!values.some(prefix => candidate.toLowerCase().startsWith(prefix.toLowerCase()))) return false;
      } else if (!matchesAny(values, candidate)) {
        return false;
      }
    }
    return true;
  }

  function summarizeRule(rule, index) {
    const effects = Object.keys(rule).filter(key => !MATCH_FIELDS.has(key) && key !== 'description');
    const description = typeof rule.description === 'string' && rule.description.trim()
      ? ` — ${rule.description.trim()}` : '';
    return `#${index + 1}${description}${effects.length ? `; effects: ${effects.join(', ')}` : '; no effect fields supplied'}`;
  }

  function run(values) {
    try {
      const rulesInput = parseJson('packageRules JSON', values && values.packageRules);
      const context = parseJson('dependency context JSON', values && values.context);
      let rules = rulesInput;
      if (!Array.isArray(rulesInput) && rulesInput && Array.isArray(rulesInput.packageRules)) rules = rulesInput.packageRules;
      if (!Array.isArray(rules)) throw new Error('packageRules JSON must be an array, or an object containing a packageRules array.');
      if (rules.length > MAX_RULES) throw new Error(`packageRules contains ${rules.length} rules; the limit is ${MAX_RULES}.`);
      if (!context || Array.isArray(context) || typeof context !== 'object') throw new Error('dependency context JSON must be an object.');

      const contextKeys = ['packageName', 'manager', 'datasource', 'depType', 'updateType'];
      const normalizedContext = {};
      const diagnostics = [];
      for (const key of contextKeys) normalizedContext[key] = typeof context[key] === 'string' ? context[key].trim() : '';
      for (const key of Object.keys(context)) {
        if (!contextKeys.includes(key)) diagnostics.push(`Context: unknown field “${key}”.`);
      }
      if (!normalizedContext.packageName) diagnostics.push('Context: packageName is missing or empty; package-name rules cannot match.');

      const matches = [];
      rules.forEach((rule, index) => {
        if (!rule || Array.isArray(rule) || typeof rule !== 'object') {
          diagnostics.push(`Rule ${index + 1}: expected an object.`);
          return;
        }
        const keys = Object.keys(rule);
        if (keys.length > MAX_KEYS_PER_RULE) diagnostics.push(`Rule ${index + 1}: exceeds the ${MAX_KEYS_PER_RULE}-field complexity cap.`);
        keys.forEach(key => { if (!RULE_FIELDS.has(key)) diagnostics.push(`Rule ${index + 1}: unknown field “${key}”.`); });
        if (matchesRule(rule, normalizedContext, index + 1, diagnostics)) matches.push({ rule, index });
      });

      const lines = [
        'Renovate Rule Trace (simplified local model)',
        `Context: ${normalizedContext.packageName || '(no packageName)'}${normalizedContext.manager ? ` · manager=${normalizedContext.manager}` : ''}${normalizedContext.datasource ? ` · datasource=${normalizedContext.datasource}` : ''}${normalizedContext.depType ? ` · depType=${normalizedContext.depType}` : ''}${normalizedContext.updateType ? ` · updateType=${normalizedContext.updateType}` : ''}`,
        `Rules inspected: ${rules.length}`,
        `Matching rules: ${matches.length}`,
        matches.length ? `First matching rule: ${summarizeRule(matches[0].rule, matches[0].index)}` : 'First matching rule: none',
        matches.length ? `Last matching rule: ${summarizeRule(matches[matches.length - 1].rule, matches[matches.length - 1].index)}` : 'Last matching rule: none',
        '',
        'Match order:',
        matches.length ? matches.map(item => `  ${summarizeRule(item.rule, item.index)}`).join('\n') : '  (none)',
        '',
        'Diagnostics:'
      ];
      lines.push(diagnostics.length ? diagnostics.map(item => `  - ${item}`).join('\n') : '  none');
      lines.push('', 'Model limits: ordered packageRules only; supported matching uses simple case-insensitive glob/prefix checks against the pasted context. No Renovate version resolution, merge semantics, repository metadata, package registry data, or remote validation is performed.');
      return { text: lines.join('\n'), warnings: diagnostics.length ? diagnostics : undefined };
    } catch (error) {
      return { text: `Renovate Rule Trace could not run.\nDiagnostic: ${error.message || 'Unknown input error.'}` , warnings: [error.message || 'Unknown input error.'] };
    }
  }

  window.AHDevToolEngines['renovate-rule-trace'] = {
    title: 'Renovate Config Validator & Rule Trace',
    description: 'Inspect pasted simplified Renovate packageRules JSON, trace first/last matches against a pasted dependency context, and flag unknown fields. This is a bounded browser-local approximation, not full Renovate validation.',
    limitations: 'Supports only the documented simplified rule subset and simple local matching. It does not query repositories or registries, resolve package metadata, emulate full Renovate precedence/merge behavior, validate a Renovate version, or provide server-side checks. Inputs are capped at 200,000 characters and 100 rules.',
    fields: [
      { id: 'packageRules', label: 'packageRules JSON', type: 'textarea', placeholder: '[{"matchManagers":["npm"],"groupName":"frontend"}]', help: 'Paste an array of simplified rules, or an object containing packageRules.' },
      { id: 'context', label: 'Dependency context JSON', type: 'textarea', placeholder: '{"packageName":"react","manager":"npm","datasource":"npm","depType":"dependencies","updateType":"minor"}', help: 'Paste the local package fields to test against the rules.' }
    ],
    run
  };
})();
