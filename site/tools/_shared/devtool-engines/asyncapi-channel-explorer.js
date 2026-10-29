(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_INPUT = 200000;
  const MAX_NODES = 12000;
  const MAX_DEPTH = 80;

  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const indent = (level, text) => `${'  '.repeat(level)}${text}`;

  function scalar(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    if (text === '{}' || text === '[]') return text === '{}' ? {} : [];
    if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
    if (/^(null|~)$/i.test(text)) return null;
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text)) return Number(text);
    if ((text[0] === '"' && text[text.length - 1] === '"') || (text[0] === "'" && text[text.length - 1] === "'")) {
      if (text[0] === '"') {
        try { return JSON.parse(text); } catch (_) { return text.slice(1, -1); }
      }
      return text.slice(1, -1).replace(/''/g, "'");
    }
    if ((text[0] === '[' && text[text.length - 1] === ']') || (text[0] === '{' && text[text.length - 1] === '}')) {
      try { return JSON.parse(text); } catch (_) { return text; }
    }
    return text;
  }

  // A small, intentionally conservative YAML reader: mappings, sequences, quoted/plain scalars,
  // and JSON-style inline values. It is not intended to be a complete YAML implementation.
  function parseYaml(source) {
    const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
    const useful = [];
    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i].replace(/\t/g, '  ');
      const trimmed = raw.trim();
      if (!trimmed || trimmed[0] === '#') continue;
      const withoutComment = raw.replace(/\s+#.*$/, '');
      useful.push({ number: i + 1, indent: withoutComment.search(/\S|$/), text: withoutComment.trim() });
    }
    if (!useful.length) throw new Error('The document is empty.');
    let nodes = 0;
    const parseBlock = (at, level) => {
      if (level > MAX_DEPTH) throw new Error(`YAML nesting exceeds the ${MAX_DEPTH}-level limit.`);
      const sequence = useful[at] && useful[at].indent === level && useful[at].text.startsWith('-');
      const result = sequence ? [] : {};
      while (at < useful.length && useful[at].indent === level) {
        if (++nodes > MAX_NODES) throw new Error(`The YAML exceeds the ${MAX_NODES}-node limit.`);
        const line = useful[at];
        if (sequence) {
          if (!line.text.startsWith('-')) break;
          const rest = line.text.slice(1).trim();
          if (!rest) {
            if (!useful[at + 1] || useful[at + 1].indent <= level) throw new Error(`Empty list item at line ${line.number}.`);
            const child = parseBlock(at + 1, useful[at + 1].indent);
            result.push(child.value); at = child.next; continue;
          }
          const colon = rest.indexOf(':');
          if (colon > 0 && !/^['"[{]/.test(rest)) {
            const item = {};
            item[rest.slice(0, colon).trim()] = scalar(rest.slice(colon + 1));
            at += 1;
            if (useful[at] && useful[at].indent > level) {
              const child = parseBlock(at, useful[at].indent);
              if (!isObject(child.value)) throw new Error(`List mapping at line ${line.number} has an invalid continuation.`);
              Object.keys(child.value).forEach(key => { item[key] = child.value[key]; });
              at = child.next;
            }
            result.push(item); continue;
          }
          result.push(scalar(rest)); at += 1; continue;
        }
        const colon = line.text.indexOf(':');
        if (colon <= 0) throw new Error(`Expected a mapping key at line ${line.number}.`);
        const key = line.text.slice(0, colon).trim().replace(/^['"]|['"]$/g, '');
        const rest = line.text.slice(colon + 1).trim();
        if (!key) throw new Error(`Empty mapping key at line ${line.number}.`);
        at += 1;
        if (rest) result[key] = scalar(rest);
        else if (useful[at] && useful[at].indent > level) {
          const child = parseBlock(at, useful[at].indent); result[key] = child.value; at = child.next;
        } else result[key] = null;
      }
      return { value: result, next: at };
    };
    return parseBlock(0, useful[0].indent).value;
  }

  function parseDocument(input) {
    const source = String(input ?? '').replace(/^\uFEFF/, '');
    if (!source.trim()) throw new Error('Paste an AsyncAPI JSON or YAML document first.');
    if (source.length > MAX_INPUT) throw new Error(`Input is ${source.length.toLocaleString()} characters; the limit is ${MAX_INPUT.toLocaleString()}.`);
    try { return { document: JSON.parse(source), format: 'JSON' }; }
    catch (jsonError) {
      try { return { document: parseYaml(source), format: 'conservative YAML' }; }
      catch (yamlError) {
        throw new Error(`Could not parse JSON or conservative YAML. JSON: ${jsonError.message} YAML: ${yamlError.message}`);
      }
    }
  }

  function listKeys(value) {
    return isObject(value) ? Object.keys(value) : [];
  }

  function messageNames(messageValue) {
    if (!messageValue) return [];
    if (Array.isArray(messageValue)) return messageValue.map((item, index) => isObject(item) && typeof item.name === 'string' ? item.name : `message[${index + 1}]`);
    if (isObject(messageValue)) {
      if (typeof messageValue.name === 'string') return [messageValue.name];
      return Object.keys(messageValue);
    }
    return [];
  }

  function run(values) {
    const parsed = parseDocument(values && values.document);
    const doc = parsed.document;
    const diagnostics = [];
    const warnings = [];
    if (!isObject(doc)) {
      return { text: `ERROR\nThe parsed ${parsed.format} root must be an object, not ${Array.isArray(doc) ? 'an array' : typeof doc}.` };
    }
    if (typeof doc.asyncapi !== 'string') diagnostics.push('Missing required top-level “asyncapi” version string.');
    else if (!/^\d+\.\d+(?:\.\d+)?$/.test(doc.asyncapi)) diagnostics.push(`AsyncAPI version “${doc.asyncapi}” is not a recognizable numeric version.`);
    else if (!/^2\.|^3\./.test(doc.asyncapi)) warnings.push(`Version ${doc.asyncapi} is outside the commonly inspected 2.x/3.x range.`);
    if (typeof doc.info !== 'object' || doc.info === null || Array.isArray(doc.info)) diagnostics.push('Missing or invalid top-level “info” object.');
    else {
      if (typeof doc.info.title !== 'string' || !doc.info.title.trim()) diagnostics.push('The “info.title” field is missing or empty.');
      if (typeof doc.info.version !== 'string' || !doc.info.version.trim()) diagnostics.push('The “info.version” field is missing or empty.');
    }
    if (!isObject(doc.channels)) diagnostics.push('Missing or invalid top-level “channels” object.');
    const channels = isObject(doc.channels) ? doc.channels : {};
    const channelNames = Object.keys(channels);
    if (!channelNames.length && isObject(doc.channels)) warnings.push('The document declares no channels.');
    let publishCount = 0; let subscribeCount = 0; let messageCount = 0;
    const inventory = [];
    channelNames.forEach(channelName => {
      const channel = channels[channelName];
      if (!isObject(channel)) {
        diagnostics.push(`Channel “${channelName}” must be an object.`);
        return;
      }
      const operations = [];
      ['publish', 'subscribe'].forEach(direction => {
        if (own(channel, direction)) {
          if (!isObject(channel[direction])) diagnostics.push(`Channel “${channelName}” has a non-object ${direction} operation.`);
          else {
            operations.push(direction);
            if (direction === 'publish') publishCount += 1; else subscribeCount += 1;
          }
        }
      });
      // AsyncAPI 3 uses top-level operations with action/channel references; this engine only inventories channel-local operations.
      const names = messageNames(channel.messages);
      if (own(channel, 'messages') && !Array.isArray(channel.messages) && !isObject(channel.messages)) diagnostics.push(`Channel “${channelName}” has invalid “messages”; expected an object or array.`);
      messageCount += names.length;
      inventory.push({ name: channelName, operations, messages: names });
    });
    if (isObject(doc.components) && own(doc.components, 'messages') && !isObject(doc.components.messages)) diagnostics.push('“components.messages” should be an object when present.');
    if (isObject(doc.components) && own(doc.components, 'schemas')) warnings.push('Schemas are reported only as present; payload/schema correctness is not validated.');
    if (channelNames.some(name => name.includes('$ref')) || JSON.stringify(doc).includes('"$ref"')) warnings.push('References are listed only as literal data; remote or multi-file $ref resolution is not performed.');
    const lines = [`ASYNCAPI CHANNEL EXPLORER`, `Parsed as: ${parsed.format}`, `Version: ${typeof doc.asyncapi === 'string' ? doc.asyncapi : 'missing'}`, `Channels: ${channelNames.length} | publish: ${publishCount} | subscribe: ${subscribeCount} | messages: ${messageCount}`, ''];
    lines.push('CHANNEL INVENTORY');
    if (!inventory.length) lines.push('  (none)');
    inventory.forEach(item => {
      lines.push(indent(1, item.name));
      lines.push(indent(2, `operations: ${item.operations.length ? item.operations.join(', ') : 'none detected'}`));
      lines.push(indent(2, `messages: ${item.messages.length ? item.messages.join(', ') : 'none listed'}`));
    });
    lines.push('', 'DIAGNOSTICS');
    if (!diagnostics.length) lines.push('  No basic shape/version/channel errors detected.');
    diagnostics.forEach(item => lines.push(indent(1, `ERROR: ${item}`)));
    warnings.forEach(item => lines.push(indent(1, `NOTE: ${item}`)));
    lines.push('', 'Scope: local structural inspection only; payload schemas, protocol bindings, broker behavior, and remote references are not resolved or modeled.');
    return { text: lines.join('\n'), warnings };
  }

  window.AHDevToolEngines['asyncapi-channel-explorer'] = {
    title: 'AsyncAPI Spec Validator & Channel Explorer',
    description: 'Paste one AsyncAPI JSON or YAML document to inspect its basic shape and browse publish/subscribe channels locally; no remote or server checks are performed.',
    limitations: 'Bounded to one pasted document of 200,000 characters. This is not a full AsyncAPI validator: it does not resolve remote or multi-file $ref values, validate custom schemas or protocol bindings, model brokers/runtime behavior, or fully interpret AsyncAPI 3 top-level operations.',
    fields: [{
      id: 'document',
      label: 'AsyncAPI document',
      type: 'textarea',
      placeholder: 'Paste one AsyncAPI JSON or YAML document…',
      help: 'Local only; JSON is parsed fully and common indentation-based YAML is supported conservatively. Maximum 200,000 characters.'
    }],
    run
  };
})();
