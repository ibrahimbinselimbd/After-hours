(() => {
  'use strict';

  const MAX_CHARS = 100000;
  const MAX_LINES = 5000;
  const VALID_INTERVALS = new Set(['daily', 'weekly', 'monthly']);

  function cleanComment(line) {
    let quote = '';
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quote) {
        if (ch === quote && line[i - 1] !== '\\') quote = '';
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '#') {
        return line.slice(0, i);
      }
    }
    return line;
  }

  function scalar(raw) {
    const value = raw.trim();
    if (!value) return null;
    if ((value[0] === '"' && value[value.length - 1] === '"') || (value[0] === "'" && value[value.length - 1] === "'")) {
      if (value[0] === '"') {
        try { return JSON.parse(value); } catch (_) { return value.slice(1, -1); }
      }
      return value.slice(1, -1).replace(/''/g, "'");
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null' || value === '~') return null;
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
    if ((value[0] === '[' && value[value.length - 1] === ']') || (value[0] === '{' && value[value.length - 1] === '}')) {
      try { return JSON.parse(value); } catch (_) { return value; }
    }
    return value;
  }

  function keyName(raw) {
    const key = raw.trim();
    return (key[0] === '"' && key[key.length - 1] === '"') || (key[0] === "'" && key[key.length - 1] === "'") ? String(scalar(key)) : key;
  }

  function splitKeyValue(text) {
    let quote = '';
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quote) {
        if (ch === quote && text[i - 1] !== '\\') quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ':') return [text.slice(0, i), text.slice(i + 1)];
    }
    return null;
  }

  function parseYaml(source) {
    const rawLines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
    if (rawLines.length > MAX_LINES) throw new Error(`Input is limited to ${MAX_LINES} lines.`);
    const lines = [];
    rawLines.forEach((raw, number) => {
      if (/\t/.test(raw)) throw new Error(`Tabs are not supported for indentation (line ${number + 1}). Use spaces.`);
      const body = cleanComment(raw).replace(/\s+$/, '');
      if (!body.trim() || body.trim() === '---' || body.trim() === '...') return;
      const indent = (body.match(/^ */) || [''])[0].length;
      lines.push({ indent, text: body.slice(indent), number: number + 1 });
    });
    if (!lines.length) throw new Error('Paste a Dependabot YAML or JSON configuration first.');

    function block(start, indent) {
      const arrayMode = lines[start] && lines[start].indent === indent && /^-\s*/.test(lines[start].text);
      const result = arrayMode ? [] : {};
      let i = start;
      while (i < lines.length && lines[i].indent === indent && (arrayMode ? /^-\s*/.test(lines[i].text) : !/^-/ .test(lines[i].text))) {
        const line = lines[i];
        if (arrayMode) {
          const rest = line.text.replace(/^-\s*/, '');
          if (!rest) {
            if (!lines[i + 1] || lines[i + 1].indent <= indent) throw new Error(`List item has no value (line ${line.number}).`);
            const child = block(i + 1, lines[i + 1].indent);
            result.push(child.value); i = child.next; continue;
          }
          const pair = splitKeyValue(rest);
          if (!pair || !pair[0].trim()) { result.push(scalar(rest)); i += 1; continue; }
          const item = {};
          const key = keyName(pair[0]);
          if (pair[1].trim()) { item[key] = scalar(pair[1]); i += 1; }
          else if (lines[i + 1] && lines[i + 1].indent > indent) {
            const child = block(i + 1, lines[i + 1].indent); item[key] = child.value; i = child.next;
          } else { item[key] = null; i += 1; }
          if (lines[i] && lines[i].indent > indent) {
            const child = block(i, lines[i].indent);
            if (!child.value || Array.isArray(child.value) || typeof child.value !== 'object') throw new Error(`Expected mapping fields after list item (line ${lines[i].number}).`);
            Object.keys(child.value).forEach(k => { item[k] = child.value[k]; });
            i = child.next;
          }
          result.push(item);
        } else {
          const pair = splitKeyValue(line.text);
          if (!pair || !pair[0].trim()) throw new Error(`Expected key: value syntax on line ${line.number}.`);
          const key = keyName(pair[0]);
          if (Object.prototype.hasOwnProperty.call(result, key)) throw new Error(`Duplicate key “${key}” on line ${line.number}.`);
          if (pair[1].trim()) { result[key] = scalar(pair[1]); i += 1; }
          else if (lines[i + 1] && lines[i + 1].indent > indent) {
            const child = block(i + 1, lines[i + 1].indent); result[key] = child.value; i = child.next;
          } else { result[key] = null; i += 1; }
        }
      }
      return { value: result, next: i };
    }

    return block(0, lines[0].indent).value;
  }

  function parseConfig(input) {
    const source = String(input == null ? '' : input).trim();
    if (!source) throw new Error('Paste a Dependabot YAML or JSON configuration first.');
    if (source.length > MAX_CHARS) throw new Error(`Input is limited to ${MAX_CHARS.toLocaleString()} characters.`);
    if (source[0] === '{' || source[0] === '[') {
      try { return JSON.parse(source); } catch (error) { throw new Error(`Invalid JSON: ${error.message}`); }
    }
    return parseYaml(source);
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function run(values) {
    const raw = values && (values.config || values.configuration || '');
    let config;
    try { config = parseConfig(raw); } catch (error) { return `Dependabot configuration preview\n\nERROR: ${error.message}\n\nNo schedule preview was produced.`; }
    const errors = [];
    const warnings = [];
    if (!config || Array.isArray(config) || typeof config !== 'object') errors.push('Root must be an object with version and updates fields.');
    const version = config && config.version;
    if (version !== 2) errors.push(`version should be 2${version == null ? '' : `; found ${String(version)}`}.`);
    const updates = config && config.updates;
    if (!Array.isArray(updates)) errors.push('updates must be a list of update definitions.');
    if (Array.isArray(updates) && updates.length === 0) errors.push('updates must contain at least one update definition.');

    const preview = [];
    list(updates).forEach((update, index) => {
      const label = `Update ${index + 1}`;
      if (!update || typeof update !== 'object' || Array.isArray(update)) { errors.push(`${label}: must be a mapping.`); return; }
      const ecosystem = update['package-ecosystem'];
      const directory = update.directory;
      const schedule = update.schedule;
      if (typeof ecosystem !== 'string' || !ecosystem.trim()) errors.push(`${label}: package-ecosystem is required.`);
      if (typeof directory !== 'string' || !directory.trim() || directory[0] !== '/') errors.push(`${label}: directory should be a non-empty path beginning with “/”.`);
      if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
        errors.push(`${label}: schedule mapping is required.`);
      } else {
        const interval = schedule.interval;
        if (!VALID_INTERVALS.has(interval)) errors.push(`${label}: schedule.interval must be daily, weekly, or monthly.`);
        const allowed = ['interval', 'day', 'time', 'timezone'];
        Object.keys(schedule).forEach(key => { if (!allowed.includes(key)) warnings.push(`${label}: schedule field “${key}” is not previewed.`); });
        if (interval === 'weekly' && schedule.day == null) warnings.push(`${label}: weekly schedule has no day; the effective weekday is not previewed.`);
        const parts = [String(interval || 'unspecified')];
        if (schedule.day != null) parts.push(`day=${String(schedule.day)}`);
        if (schedule.time != null) parts.push(`time=${String(schedule.time)}`);
        if (schedule.timezone != null) parts.push(`timezone=${String(schedule.timezone)}`);
        preview.push(`${label}: ${ecosystem || 'unknown ecosystem'} at ${directory || 'missing directory'} → ${parts.join(', ')}`);
      }
      if (update.groups != null && (typeof update.groups !== 'object' || Array.isArray(update.groups))) warnings.push(`${label}: groups is not a mapping; group details were not previewed.`);
      if (update.ignore != null && !Array.isArray(update.ignore)) warnings.push(`${label}: ignore should be a list; ignore details were not previewed.`);
    });

    const lines = ['Dependabot configuration preview', '', `Result: ${errors.length ? 'issues found' : 'basic shape looks plausible'}`, `Updates: ${Array.isArray(updates) ? updates.length : 0}`];
    if (preview.length) lines.push('', 'Known schedule fields:', ...preview);
    if (errors.length) lines.push('', 'Errors:', ...errors.map(item => `- ${item}`));
    if (warnings.length) lines.push('', 'Warnings:', ...warnings.map(item => `- ${item}`));
    lines.push('', 'Scope: local structural checks only; this does not evaluate dependency graphs, package registries, repository context, or live GitHub policy/config validation. Review Dependabot documentation before relying on the result.');
    return { text: lines.join('\n'), warnings: warnings.concat(errors) };
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['dependabot-config-preview'] = {
    title: 'Dependabot Configuration Validator & Schedule Preview',
    description: 'Paste a small Dependabot YAML or JSON-like configuration to check its basic shape and preview known schedule fields locally. No remote or GitHub policy checks are performed.',
    limitations: 'Bounded local parsing only (100,000 characters / 5,000 lines); supports common YAML mappings/lists and JSON, not full YAML. It does not resolve repositories, dependency graphs, package registries, or live GitHub validation, and groups/ignore rules are only shape-checked.',
    fields: [{
      id: 'config',
      label: 'Dependabot configuration',
      type: 'textarea',
      placeholder: 'version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: "/"\n    schedule:\n      interval: weekly\n      day: monday',
      help: 'Paste one bounded dependabot.yml configuration or an equivalent JSON object.'
    }],
    run
  };
})();
