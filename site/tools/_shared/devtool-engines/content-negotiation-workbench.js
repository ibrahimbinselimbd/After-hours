(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_TEXT = 20000;
  const MAX_REPRESENTATIONS = 200;
  const MAX_RANGES = 100;

  const trim = value => String(value == null ? '' : value).trim();
  const fail = message => { throw new Error(message); };

  function bounded(value, name) {
    const text = String(value == null ? '' : value);
    if (text.length > MAX_TEXT) fail(`${name} exceeds the ${MAX_TEXT.toLocaleString()} character limit.`);
    return text;
  }

  function splitComma(value) {
    const parts = [];
    let start = 0;
    let quote = false;
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] === '"' && value[i - 1] !== '\\') quote = !quote;
      else if (value[i] === ',' && !quote) {
        parts.push(value.slice(start, i).trim());
        start = i + 1;
      }
    }
    if (quote) fail('An input contains an unclosed quoted parameter.');
    if (value.slice(start).trim()) parts.push(value.slice(start).trim());
    return parts;
  }

  function parameterMap(parameters) {
    const result = {};
    for (const piece of parameters) {
      const index = piece.indexOf('=');
      if (index < 1) fail(`Malformed parameter “${piece}”. Use name=value.`);
      const key = piece.slice(0, index).trim().toLowerCase();
      let value = piece.slice(index + 1).trim();
      if (!key) fail('A parameter name cannot be empty.');
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      result[key] = value;
    }
    return result;
  }

  function quality(params, context) {
    if (!Object.prototype.hasOwnProperty.call(params, 'q')) return 1;
    const q = Number(params.q);
    if (!Number.isFinite(q) || q < 0 || q > 1) fail(`Invalid q-value “${params.q}” in ${context}; use a number from 0 to 1.`);
    return q;
  }

  function parseMediaHeader(value, name) {
    const text = bounded(value, name);
    if (!trim(text)) return [];
    const ranges = splitComma(text);
    if (ranges.length > MAX_RANGES) fail(`${name} has more than ${MAX_RANGES} comma-separated ranges.`);
    return ranges.map((raw, index) => {
      const pieces = raw.split(';');
      const token = trim(pieces.shift()).toLowerCase();
      const match = token.match(/^([^/\s]+)\/([^/\s]+)$/);
      if (!match || (match[1] === '*' && match[2] !== '*')) fail(`${name} item ${index + 1} has an invalid media range “${token}”.`);
      const params = parameterMap(pieces.map(trim).filter(Boolean));
      return { type: match[1], subtype: match[2], params, q: quality(params, `${name} item ${index + 1}`), order: index };
    });
  }

  function parseTokenHeader(value, name) {
    const text = bounded(value, name);
    if (!trim(text)) return [];
    const items = splitComma(text);
    if (items.length > MAX_RANGES) fail(`${name} has more than ${MAX_RANGES} comma-separated ranges.`);
    return items.map((raw, index) => {
      const pieces = raw.split(';');
      const token = trim(pieces.shift()).toLowerCase();
      if (!token || /\s/.test(token)) fail(`${name} item ${index + 1} has an invalid token “${token}”.`);
      const params = parameterMap(pieces.map(trim).filter(Boolean));
      return { token, q: quality(params, `${name} item ${index + 1}`), order: index };
    });
  }

  function parseRepresentations(value) {
    const text = bounded(value, 'Representations');
    if (!trim(text)) fail('Representations are required as a JSON array.');
    let parsed;
    try { parsed = JSON.parse(text); } catch (error) { fail(`Representations JSON is invalid: ${error.message}`); }
    if (!Array.isArray(parsed)) fail('Representations must be a JSON array.');
    if (parsed.length === 0) fail('Representations must contain at least one candidate.');
    if (parsed.length > MAX_REPRESENTATIONS) fail(`Representations are limited to ${MAX_REPRESENTATIONS} candidates.`);
    return parsed.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) fail(`Representation ${index + 1} must be an object.`);
      const mediaType = trim(item.mediaType || item.type).toLowerCase();
      const media = mediaType.match(/^([^/\s]+)\/([^/\s]+)$/);
      if (!media) fail(`Representation ${index + 1} needs a valid mediaType such as application/json.`);
      return {
        id: trim(item.id) || `representation-${index + 1}`,
        mediaType,
        type: media[1],
        subtype: media[2],
        charset: trim(item.charset).toLowerCase(),
        language: trim(item.language).toLowerCase(),
        note: trim(item.note)
      };
    });
  }

  function mediaMatch(rep, range) {
    return (range.type === '*' || range.type === rep.type) && (range.subtype === '*' || range.subtype === rep.subtype);
  }

  function mediaScore(rep, ranges) {
    const matches = ranges.filter(range => mediaMatch(rep, range));
    if (!matches.length) return { q: 0, specificity: -1, order: Infinity, source: 'no matching media range' };
    matches.sort((a, b) => ((b.type !== '*' ? 1 : 0) + (b.subtype !== '*' ? 1 : 0)) - ((a.type !== '*' ? 1 : 0) + (a.subtype !== '*' ? 1 : 0)) || a.order - b.order);
    const best = matches[0];
    return { q: best.q, specificity: (best.type !== '*' ? 1 : 0) + (best.subtype !== '*' ? 1 : 0), order: best.order, source: `${best.type}/${best.subtype};q=${best.q}` };
  }

  function tokenScore(value, ranges, label) {
    if (!ranges.length) return { q: 1, specificity: 0, source: 'not supplied' };
    if (!value) return { q: 0, specificity: 0, source: `candidate has no ${label}` };
    const matches = ranges.filter(range => range.token === '*' || range.token === value);
    if (!matches.length) return { q: 0, specificity: 0, source: `no matching ${label} range` };
    matches.sort((a, b) => (b.token === value ? 1 : 0) - (a.token === value ? 1 : 0) || a.order - b.order);
    const best = matches[0];
    return { q: best.q, specificity: best.token === value ? 1 : 0, source: `${best.token};q=${best.q}` };
  }

  function run(values) {
    try {
      values = values && typeof values === 'object' ? values : {};
      const media = parseMediaHeader(values.accept, 'Accept');
      const charsets = parseTokenHeader(values.acceptCharset, 'Accept-Charset');
      const languages = parseTokenHeader(values.acceptLanguage, 'Accept-Language');
      const representations = parseRepresentations(values.representations);
      if (!media.length) return 'Diagnostic: Accept is empty. Supply at least one media range, such as application/json or */*.';

      const ranked = representations.map((rep, index) => {
        const m = mediaScore(rep, media);
        const c = tokenScore(rep.charset, charsets, 'charset');
        const l = tokenScore(rep.language, languages, 'language');
        const score = m.q * c.q * l.q;
        return { rep, index, m, c, l, score };
      }).sort((a, b) => b.score - a.score || b.m.specificity - a.m.specificity || b.c.specificity - a.c.specificity || b.l.specificity - a.l.specificity || a.index - b.index);

      const lines = [
        'LOCAL CONTENT-NEGOTIATION MODEL',
        '=================================',
        `Candidates ranked: ${ranked.length}`,
        'Score = media q × charset q × language q; ties keep input order after specificity.',
        ''
      ];
      ranked.forEach((item, position) => {
        const { rep, m, c, l } = item;
        const status = item.score > 0 ? (position === 0 ? 'BEST MODEL MATCH' : 'acceptable model match') : 'not acceptable under supplied preferences';
        lines.push(`${position + 1}. ${rep.id} — ${status}`);
        lines.push(`   ${rep.mediaType}${rep.charset ? `; charset=${rep.charset}` : ''}${rep.language ? `; language=${rep.language}` : ''}`);
        lines.push(`   score=${item.score.toFixed(4)} | media=${m.q} (${m.source}) | charset=${c.q} (${c.source}) | language=${l.q} (${l.source})`);
        if (rep.note) lines.push(`   note: ${rep.note}`);
      });
      if (ranked[0].score === 0) lines.push('\nResult: no candidate is acceptable in this model.');
      else lines.push(`\nResult: ${ranked[0].rep.id} ranks first in this transparent local model.`);
      lines.push('\nLimitation: this is a heuristic preview from the supplied candidates and headers. Real servers, frameworks, proxies, and browser behavior may apply different rules or additional metadata; no remote check was performed.');
      return lines.join('\n');
    } catch (error) {
      return `Input diagnostic: ${error && error.message ? error.message : 'Unable to parse the supplied values.'}`;
    }
  }

  window.AHDevToolEngines['content-negotiation-workbench'] = {
    title: 'Accept / Content-Type Negotiation Workbench',
    description: 'Rank supplied representations against Accept, charset, and language preferences using a transparent browser-local model; real servers may negotiate differently.',
    limitations: 'Candidate representations and headers are parsed locally only, with a 20,000-character field cap, 200 representation cap, and 100-range cap. This does not contact or emulate any server, proxy, framework, browser policy, or full content-negotiation implementation.',
    fields: [
      { id: 'accept', label: 'Accept', type: 'text', placeholder: 'text/html;q=0.8, application/json, */*;q=0.1', help: 'Comma-separated media ranges with optional q=0..1.' },
      { id: 'acceptCharset', label: 'Accept-Charset (optional)', type: 'text', placeholder: 'utf-8, iso-8859-1;q=0.5', help: 'Optional comma-separated charset tokens and q-values.' },
      { id: 'acceptLanguage', label: 'Accept-Language (optional)', type: 'text', placeholder: 'en-US, en;q=0.8, *;q=0.1', help: 'Optional language tokens and q-values; matching is exact token or *.' },
      { id: 'representations', label: 'Candidate representations (JSON)', type: 'textarea', placeholder: '[{"id":"json","mediaType":"application/json","charset":"utf-8","language":"en"}]', help: 'JSON array; each item needs mediaType and may include id, charset, language, and note.' }
    ],
    run
  };
})();
