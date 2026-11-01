(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_CHARS = 200000;
  const MAX_LINES = 10000;
  const MAX_FRAMES = 20000;
  const MAX_GROUPS = 3000;

  const clean = (value) => String(value == null ? '' : value).trim();

  function normalizePath(path) {
    return clean(path)
      .replace(/^file:\/\//i, '')
      .replace(/\\/g, '/')
      .replace(/^\.?\//, '');
  }

  function frameKey(frame) {
    return [frame.language, frame.functionName || '<anonymous>', frame.file || '<unknown>', frame.line || '?', frame.column || '?'].join('|');
  }

  function parseFrame(line) {
    const source = clean(line);
    let match;

    // V8/Node and Chromium: at fn (file.js:12:4), at file.js:12:4
    match = source.match(/^at\s+(?:(.*?)\s+\()?((?:file:\/\/)?[^\s()]+):(\d+)(?::(\d+))?\)?$/);
    if (match && !/\.java$/i.test(match[2])) {
      return { language: 'JavaScript', functionName: clean(match[1]) || '<anonymous>', file: normalizePath(match[2]), line: match[3], column: match[4] || '?' };
    }

    // Firefox: fn@file.js:12:4 or @file.js:12:4
    match = source.match(/^(.*?)@((?:file:\/\/)?[^\s()]+):(\d+)(?::(\d+))?$/);
    if (match && !/^https?:\/\//i.test(match[2])) {
      return { language: 'JavaScript', functionName: clean(match[1]) || '<anonymous>', file: normalizePath(match[2]), line: match[3], column: match[4] || '?' };
    }

    // Python: File "app.py", line 12, in handler
    match = source.match(/^File\s+["'](.+?)["'],\s*line\s+(\d+)(?:,\s*in\s+(.+))?$/i);
    if (match) {
      return { language: 'Python', functionName: clean(match[3]) || '<module>', file: normalizePath(match[1]), line: match[2], column: '?' };
    }

    // Java: at package.Type.method(File.java:123), including native/unknown frames.
    match = source.match(/^at\s+([\w$.-]+(?:\.[\w$<>-]+)*)\(([^():]+):(\d+)\)$/);
    if (match) {
      return { language: 'Java', functionName: match[1], file: normalizePath(match[2]), line: match[3], column: '?' };
    }
    match = source.match(/^at\s+([\w$.-]+(?:\.[\w$<>-]+)*)\((Native Method|Unknown Source)\)$/);
    if (match) {
      return { language: 'Java', functionName: match[1], file: match[2], line: '?', column: '?' };
    }

    return null;
  }

  function isTraceHeader(line) {
    return /^(?:Error(?:\b|:)|Traceback \(most recent call last\):|[\w.$-]*(?:Error|Exception|Throwable)(?::|$)|Caused by:|During handling of the above exception)/i.test(clean(line));
  }

  function parseInput(input) {
    const lines = input.replace(/\r\n?/g, '\n').split('\n');
    const traces = [];
    let current = { frames: [], headers: [], elided: 0 };
    let ignored = 0;
    let sawFrame = false;

    const flush = () => {
      if (current.frames.length || current.headers.length) traces.push(current);
      current = { frames: [], headers: [], elided: 0 };
      sawFrame = false;
    };

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const trimmed = clean(line);
      if (!trimmed) {
        if (current.frames.length) flush();
        continue;
      }
      const frame = parseFrame(trimmed);
      if (frame) {
        if (current.frames.length >= MAX_FRAMES) throw new Error(`Input exceeds the ${MAX_FRAMES.toLocaleString()} frame limit.`);
        current.frames.push({ ...frame, sourceLine: index + 1 });
        sawFrame = true;
        continue;
      }
      if (/^(?:\.\.\.|\.\.\.\s+\d+\s+more|\.\.\.\s+\d+\s+frames?)/i.test(trimmed)) {
        current.elided += 1;
        continue;
      }
      if (isTraceHeader(trimmed)) {
        // A new error header after frames starts another pasted trace. “Caused by” stays
        // with the current trace so chained causes can be reviewed together.
        if (sawFrame && !/^Caused by:/i.test(trimmed) && !/^During handling/i.test(trimmed)) flush();
        current.headers.push(trimmed);
      } else {
        ignored += 1;
        if (current.frames.length) current.headers.push(trimmed);
      }
    }
    flush();
    return { traces, ignored };
  }

  function run(values) {
    const raw = clean(values && (values.traces || values.input || values.stackTraces));
    if (!raw) return 'No stack trace text was provided. Paste one or more JavaScript, Python, or Java traces and try again.';
    if (raw.length > MAX_CHARS) return `Input is too large (${raw.length.toLocaleString()} characters). The browser-local limit is ${MAX_CHARS.toLocaleString()} characters.`;
    if (raw.split(/\r\n?|\n/).length > MAX_LINES) return `Input is too complex. The browser-local limit is ${MAX_LINES.toLocaleString()} lines.`;

    let parsed;
    try {
      parsed = parseInput(raw);
    } catch (error) {
      return `Could not parse the bounded input safely: ${error.message}`;
    }

    const allFrames = parsed.traces.flatMap((trace) => trace.frames);
    if (!allFrames.length) {
      return 'No recognized frames found. Supported examples include “at fn (app.js:12:4)”, Python “File "app.py", line 12, in fn”, and Java “at pkg.Type.method(Type.java:12)”. This parser does not symbolicate traces.';
    }

    const groups = new Map();
    allFrames.forEach((frame) => {
      const key = frameKey(frame);
      if (!groups.has(key)) groups.set(key, { ...frame, occurrences: 0, traceIndexes: new Set() });
      const group = groups.get(key);
      group.occurrences += 1;
      const traceIndex = parsed.traces.findIndex((trace) => trace.frames.includes(frame));
      if (traceIndex >= 0) group.traceIndexes.add(traceIndex + 1);
    });

    const sorted = Array.from(groups.values()).sort((a, b) => b.traceIndexes.size - a.traceIndexes.size || b.occurrences - a.occurrences || a.language.localeCompare(b.language));
    const warnings = [];
    if (parsed.ignored) warnings.push(`${parsed.ignored} non-frame line(s) were retained only as context or ignored.`);
    const elided = parsed.traces.reduce((sum, trace) => sum + trace.elided, 0);
    if (elided) warnings.push(`${elided} elided-frame marker(s) were detected; omitted frames cannot be grouped.`);
    if (sorted.length > MAX_GROUPS) warnings.push(`Only the first ${MAX_GROUPS.toLocaleString()} normalized groups are shown.`);

    const lines = [
      'STACK TRACE GROUPING (browser-local)',
      `Parsed ${allFrames.length} frame occurrence(s) across ${parsed.traces.length} trace block(s); ${Math.min(sorted.length, MAX_GROUPS)} normalized group(s).`,
      '',
      'RECURRING NORMALIZED FRAMES',
      ...sorted.slice(0, MAX_GROUPS).map((group, index) => `${String(index + 1).padStart(3, ' ')}. ${group.language} | ${group.functionName} | ${group.file}:${group.line}${group.column !== '?' ? `:${group.column}` : ''} — ${group.occurrences} occurrence(s), trace block(s): ${Array.from(group.traceIndexes).join(', ')}`),
      '',
      'TRACE BLOCKS',
      ...parsed.traces.map((trace, index) => `Trace ${index + 1}: ${trace.frames.length} frame(s)${trace.elided ? `, ${trace.elided} elided marker(s)` : ''}${trace.headers[0] ? ` — ${trace.headers[0]}` : ''}`),
      '',
      'Notes: Grouping uses normalized language, function, file, line, and column text. It is heuristic and does not symbolicate files or guarantee a root cause.'
    ];
    if (warnings.length) lines.push('', `Warnings: ${warnings.join(' ')}`);
    return lines.join('\n');
  }

  window.AHDevToolEngines['stack-trace-grouping'] = {
    title: 'Multi-Language Stack Trace Parser & Grouping Tool',
    description: 'Parse common JavaScript, Python, and Java frames from pasted traces, then normalize and group recurring frames locally. Heuristic only: no symbolication or guaranteed root-cause classification.',
    limitations: 'Supports common V8/Firefox JavaScript, Python traceback, and Java Throwable frame forms. Chained causes are kept as context; elided frames are reported but cannot be reconstructed. Input is capped at 200,000 characters, 10,000 lines, and 20,000 frames. No symbolication, remote checks, or guaranteed root-cause classification is performed.',
    fields: [{
      id: 'traces',
      label: 'Pasted stack traces',
      type: 'textarea',
      placeholder: 'Paste one or more traces, separated by a blank line...',
      help: 'Common JavaScript, Python, and Java frame formats are recognized. Keep secrets out of pasted logs.'
    }],
    run
  };
})();
