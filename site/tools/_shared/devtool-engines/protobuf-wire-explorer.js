(() => {
  'use strict';

  const MAX_SCHEMA = 64 * 1024;
  const MAX_HEX = 128 * 1024;
  const MAX_BYTES = 64 * 1024;
  const MAX_FIELDS = 1024;
  const MAX_OCCURRENCES = 4096;

  const scalar = {
    double: { wire: 1, size: 8 }, float: { wire: 5, size: 4 },
    int64: { wire: 0 }, uint64: { wire: 0 }, sint64: { wire: 0 },
    int32: { wire: 0 }, uint32: { wire: 0 }, sint32: { wire: 0 },
    fixed64: { wire: 1, size: 8 }, sfixed64: { wire: 1, size: 8 },
    fixed32: { wire: 5, size: 4 }, sfixed32: { wire: 5, size: 4 },
    bool: { wire: 0 }, enum: { wire: 0 }, string: { wire: 2 },
    bytes: { wire: 2 }
  };

  const fields = [
    { id: 'schema', label: 'Proto3 field declarations', type: 'textarea', placeholder: 'message User {\n  int32 id = 1;\n  string name = 2;\n  repeated uint32 scores = 3;\n}', help: 'Paste a bounded subset of proto3 declarations. Fields may be scalar, repeated, or optional; imports, nested messages, maps, oneof, and custom options are not supported.' },
    { id: 'wire', label: 'Wire bytes (hex)', type: 'textarea', placeholder: '08 2a 12 05 41 6c 69 63 65', help: 'Hex bytes, with spaces, commas, colons, or newlines. Maximum 64 KiB after decoding.' }
  ];

  function fail(message) { throw new Error(message); }
  function cleanType(type) { return type.replace(/^\.*/, ''); }
  function parseSchema(source) {
    const text = String(source || '');
    if (!text.trim()) fail('Provide at least one proto3 field declaration.');
    if (text.length > MAX_SCHEMA) fail('Schema is too large. The local limit is 64 KiB.');
    if (/\b(import|option|extend|oneof|map|service|rpc)\b/.test(text)) fail('This explorer accepts only simple proto3 fields; imports, options, oneof, maps, services, and RPC declarations are omitted.');
    const stripped = text.replace(/\/\/[^\r\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const messageNames = [...stripped.matchAll(/\bmessage\s+([A-Za-z_][\w]*)\s*\{/g)].map(m => m[1]);
    if (messageNames.length > 1) fail('Use one message block at a time; multiple message declarations are outside this bounded explorer.');
    const body = messageNames.length ? stripped.slice(stripped.indexOf('{') + 1, stripped.lastIndexOf('}')) : stripped;
    if (messageNames.length && !body) fail('The message block has no fields.');
    if (/[{}]/.test(body)) fail('Nested messages and extra braces are outside the supported subset.');
    const result = [];
    const statements = body.split(';').map(part => part.trim()).filter(Boolean);
    for (const statement of statements) {
      const match = statement.match(/^(?:(optional|repeated)\s+)?([A-Za-z_][\w.]*)\s+([A-Za-z_][\w]*)\s*=\s*(\d+)\s*(?:\[[^\]]*\])?$/);
      if (!match) fail(`Could not parse schema near “${statement.slice(0, 48)}”.`);
      const label = match[1] || '';
      const type = cleanType(match[2]);
      const name = match[3];
      const number = Number(match[4]);
      if (!scalar[type]) fail(`Unsupported type “${type}” for ${name}; use a supported scalar proto3 type.`);
      if (!Number.isInteger(number) || number < 1 || number > 536870911 || (number >= 19000 && number <= 19999)) fail(`Invalid or reserved field number for ${name}: ${number}.`);
      if (result.some(f => f.number === number)) fail(`Duplicate field number ${number}.`);
      if (result.some(f => f.name === name)) fail(`Duplicate field name “${name}”.`);
      result.push({ name, number, type, repeated: label === 'repeated', packed: label === 'repeated' && scalar[type].wire === 0 });
    }
    if (!result.length) fail('No supported fields found. Use declarations such as “string name = 1;”.');
    if (result.length > MAX_FIELDS) fail(`Too many fields; the limit is ${MAX_FIELDS}.`);
    return result;
  }

  function parseHex(input) {
    let text = String(input || '').trim();
    if (!text) fail('Provide wire bytes as hexadecimal.');
    if (text.length > MAX_HEX) fail('Wire input is too large. The local text limit is 128 KiB.');
    text = text.replace(/0x/gi, '').replace(/[\s,;:_-]/g, '');
    if (!/^[0-9a-f]*$/i.test(text)) fail('Wire bytes must contain only hexadecimal characters and separators.');
    if (text.length % 2) fail('Hex input must contain complete byte pairs.');
    if (text.length / 2 > MAX_BYTES) fail('Decoded wire bytes exceed the 64 KiB local limit.');
    const out = new Uint8Array(text.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  function readVarint(bytes, state) {
    let value = 0n;
    for (let shift = 0n; shift < 70n; shift += 7n) {
      if (state.pos >= bytes.length) fail(`Truncated varint at byte ${state.pos}.`);
      const b = bytes[state.pos++];
      value |= BigInt(b & 127) << shift;
      if (!(b & 128)) return value;
    }
    fail(`Varint at byte ${state.pos} is longer than ten bytes.`);
  }
  function u64(value) { return value.toString(); }
  function signed(value, bits) {
    const limit = 1n << BigInt(bits - 1);
    const full = 1n << BigInt(bits);
    return (value >= limit ? value - full : value).toString();
  }
  function utf8(bytes) {
    try { return JSON.stringify(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (_) { return '<invalid UTF-8: ' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(' ') + '>'; }
  }
  function hex(bytes) { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(' '); }
  function numberValue(bytes, start, size, float) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + start, size);
    return float ? view.getFloat32(0, true) : view.getFloat64(0, true);
  }

  function decode(schema, bytes) {
    const byNumber = new Map(schema.map(f => [f.number, f]));
    const state = { pos: 0 }, rows = [], warnings = [];
    while (state.pos < bytes.length) {
      if (rows.length >= MAX_OCCURRENCES) fail(`Message has more than ${MAX_OCCURRENCES} fields; decoding stopped.`);
      const offset = state.pos;
      const key = readVarint(bytes, state);
      const fieldNumber = Number(key >> 3n), wireType = Number(key & 7n);
      if (!fieldNumber || wireType === 4 || wireType > 5) fail(`Invalid field key at byte ${offset}: field ${fieldNumber}, wire type ${wireType}.`);
      const declared = byNumber.get(fieldNumber);
      let value, raw;
      if (wireType === 0) {
        const v = readVarint(bytes, state); raw = bytes.slice(offset, state.pos);
        if (declared && declared.type === 'bool') value = v === 0n ? 'false' : v === 1n ? 'true' : `non-canonical(${u64(v)})`;
        else if (declared && declared.type === 'sint32') value = signed((v >> 1n) ^ -(v & 1n), 32);
        else if (declared && declared.type === 'sint64') value = signed((v >> 1n) ^ -(v & 1n), 64);
        else if (declared && declared.type === 'int32') value = signed(v & 0xffffffffn, 32);
        else value = u64(v);
      } else if (wireType === 1 || wireType === 5) {
        const size = wireType === 1 ? 8 : 4;
        if (state.pos + size > bytes.length) fail(`Truncated fixed${size * 8} value for field ${fieldNumber}.`);
        raw = bytes.slice(offset, state.pos + size); const at = state.pos; state.pos += size;
        if (declared && (declared.type === 'double' || declared.type === 'float')) value = String(numberValue(bytes, at, size, size === 4));
        else value = '0x' + hex(bytes.slice(at, state.pos));
      } else if (wireType === 2) {
        const length = Number(readVarint(bytes, state));
        if (!Number.isSafeInteger(length) || length > MAX_BYTES || state.pos + length > bytes.length) fail(`Length-delimited field ${fieldNumber} exceeds the remaining bytes or local bound.`);
        const content = bytes.slice(state.pos, state.pos + length); state.pos += length; raw = bytes.slice(offset, state.pos);
        if (declared && declared.type === 'string') value = utf8(content);
        else if (declared && declared.type !== 'bytes' && declared.repeated && scalar[declared.type].wire === 0) {
          const packedState = { pos: 0 }, values = [];
          while (packedState.pos < content.length) values.push(u64(readVarint(content, packedState)));
          value = `[packed ${values.join(', ')}]`;
        } else value = '0x' + hex(content);
      }
      if (!declared) warnings.push(`Field ${fieldNumber} is not declared in the supplied schema; decoded by wire type only.`);
      else if (declared.type !== 'bytes' && declared.type !== 'string' && scalar[declared.type].wire !== wireType && !(wireType === 2 && declared.repeated && declared.packed)) warnings.push(`Field ${fieldNumber} (${declared.name}) declares ${declared.type} but carries wire type ${wireType}; inspect the mismatch.`);
      rows.push(`- byte ${offset}: field ${fieldNumber}${declared ? ` (${declared.name}: ${declared.type}${declared.repeated ? ', repeated' : ''})` : ' (unknown)'} | wire ${wireType} | value ${value} | raw ${hex(raw)}`);
    }
    return { rows, warnings };
  }

  function run(values) {
    try {
      const schema = parseSchema(values && values.schema);
      const bytes = parseHex(values && values.wire);
      const decoded = decode(schema, bytes);
      const lines = [`Proto3 wire-field inspection`, `Schema fields: ${schema.length} | Bytes: ${bytes.length}`, '', ...decoded.rows];
      if (!decoded.rows.length) lines.push('(No fields; the wire message is empty.)');
      if (decoded.warnings.length) lines.push('', 'Warnings:', ...decoded.warnings.map(w => `- ${w}`));
      lines.push('', 'Scope: bounded local proto3 scalar declarations and wire decoding only; this is not a full compiler or compatibility checker.');
      return { text: lines.join('\n'), warnings: decoded.warnings };
    } catch (error) {
      return `Unable to inspect protobuf wire data: ${error && error.message ? error.message : String(error)}`;
    }
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['protobuf-wire-explorer'] = {
    title: 'Protocol Buffers Schema & Wire-Field Explorer',
    description: 'Inspect a documented proto3 scalar-field subset and decode bounded pasted wire bytes locally; imports, custom options, and full compiler parity are intentionally omitted.',
    limitations: 'Supports one message or field-list input with scalar proto3 types, optional/repeated labels, and hex wire bytes up to 64 KiB. It does not resolve imports or nested message types, interpret maps/oneof/custom options, validate a full .proto grammar, or perform server checks or full schema-compatibility analysis.',
    fields,
    run
  };
})();
