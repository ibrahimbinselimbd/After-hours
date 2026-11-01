(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_CHARS = 250000;
  const MAX_LINES = 3000;
  const MAX_COMMITS = 2000;

  const categories = [
    ['Features', 'feature'],
    ['Bug Fixes', 'fix'],
    ['Performance', 'perf'],
    ['Documentation', 'docs'],
    ['Refactoring', 'refactor'],
    ['Tests', 'test'],
    ['Build / Chores', 'chore'],
    ['Other Changes', 'other']
  ];

  const clean = (value) => String(value == null ? '' : value).replace(/[\t ]+/g, ' ').trim();

  function normalizeInput(value) {
    return String(value == null ? '' : value).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  }

  function extractRefs(text) {
    const refs = [];
    const seen = Object.create(null);
    const add = (value) => {
      const item = clean(value);
      if (item && !seen[item]) { seen[item] = true; refs.push(item); }
    };
    let match;
    const shaPattern = /\b[0-9a-f]{7,40}\b/gi;
    while ((match = shaPattern.exec(text))) add(`\`${match[0]}\``);
    const prPattern = /(?:#|PR\s*#?)(\d+)\b/gi;
    while ((match = prPattern.exec(text))) add(`#${match[1]}`);
    const issuePattern = /\b(?:GH-|issue\s*#?)(\d+)\b/gi;
    while ((match = issuePattern.exec(text))) add(`${match[0].replace(/\s+/g, ' ')}`);
    return refs;
  }

  function parseSubject(raw) {
    let subject = clean(raw).replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '');
    subject = subject.replace(/^\[[^\]]+\]\s*/, '');
    const conventional = subject.match(/^(feat|fix|perf|docs|refactor|test|tests|build|ci|chore|revert)(?:\(([^)]+)\))?(!)?\s*:\s*(.+)$/i);
    if (conventional) {
      const type = conventional[1].toLowerCase();
      return {
        type: type === 'tests' ? 'test' : (type === 'ci' ? 'chore' : type),
        scope: conventional[2] || '',
        breaking: Boolean(conventional[3]) || /\bBREAKING CHANGE\b/i.test(subject),
        subject: clean(conventional[4]),
        raw: subject
      };
    }
    const breaking = /\bBREAKING CHANGE(?:S)?\b|!:/i.test(subject);
    return { type: 'other', scope: '', breaking, subject, raw: subject };
  }

  function parseLog(source) {
    const lines = source.split('\n');
    const commits = [];
    const diagnostics = [];
    let current = null;
    let sawCommitHeader = false;

    const finish = () => {
      if (!current) return;
      const message = clean(current.messageLines.join(' '));
      if (message) {
        const parsed = parseSubject(message);
        current.subject = parsed.subject;
        current.type = parsed.type;
        current.scope = parsed.scope;
        current.breaking = parsed.breaking || current.bodyLines.some(line => /BREAKING CHANGE/i.test(line));
        current.refs = extractRefs(`${current.sha || ''} ${message}`);
        commits.push(current);
      } else if (current.sha) {
        diagnostics.push(`Skipped ${current.sha}: no commit subject found.`);
      }
      current = null;
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) {
        if (current && current.messageLines.length) current.bodyLines.push('');
        continue;
      }

      const fullHeader = trimmed.match(/^commit\s+([0-9a-f]{7,40})(?:\s.*)?$/i);
      const shortHeader = trimmed.match(/^(?:[-*+]\s*)?([0-9a-f]{7,40})\s+(.+)$/i);
      const pipeLine = trimmed.match(/^([0-9a-f]{7,40})\s*[|\t]\s*(.+)$/i);
      if (fullHeader) {
        finish();
        sawCommitHeader = true;
        current = { sha: fullHeader[1], messageLines: [], bodyLines: [] };
        continue;
      }
      if (pipeLine) {
        finish();
        current = { sha: pipeLine[1], messageLines: [pipeLine[2]], bodyLines: [] };
        continue;
      }
      if (shortHeader) {
        finish();
        current = { sha: shortHeader[1], messageLines: [shortHeader[2]], bodyLines: [] };
        continue;
      }
      if (current) {
        if (/^(author|committer|date):/i.test(trimmed)) continue;
        if (/^Merge\s+/i.test(trimmed) && !current.messageLines.length) {
          current.messageLines.push(trimmed);
        } else if (current.messageLines.length) {
          current.bodyLines.push(trimmed);
          if (/^BREAKING CHANGE(?:S)?\s*:/i.test(trimmed)) current.messageLines.push(trimmed);
        } else {
          current.messageLines.push(trimmed);
        }
      } else if (/^(?:feat|fix|perf|docs|refactor|test|build|ci|chore)(?:\([^)]*\))?!?:/i.test(trimmed)) {
        current = { sha: '', messageLines: [trimmed], bodyLines: [] };
      } else {
        diagnostics.push(`Ignored line ${i + 1}: could not identify a commit or subject.`);
      }
    }
    finish();
    if (!commits.length) diagnostics.push(sawCommitHeader ? 'No non-empty commit subjects were found.' : 'No recognizable git log entries were found.');
    return { commits, diagnostics };
  }

  function classify(commit) {
    if (commit.type === 'feat') return 'Features';
    if (commit.type === 'fix') return 'Bug Fixes';
    if (commit.type === 'perf') return 'Performance';
    if (commit.type === 'docs') return 'Documentation';
    if (commit.type === 'refactor') return 'Refactoring';
    if (commit.type === 'test') return 'Tests';
    if (commit.type === 'chore') return 'Build / Chores';
    return 'Other Changes';
  }

  function run(values) {
    const input = normalizeInput(values && values.gitLog);
    const context = clean(values && values.context);
    if (!input) return 'No git log was supplied. Paste a bounded log or conventional commit list and run again.';
    if (input.length > MAX_CHARS) return `Input is too large (${input.length.toLocaleString()} characters). The local limit is ${MAX_CHARS.toLocaleString()} characters.`;
    const lineCount = input ? input.split('\n').length : 0;
    if (lineCount > MAX_LINES) return `Input is too complex (${lineCount.toLocaleString()} lines). The local limit is ${MAX_LINES.toLocaleString()} lines.`;

    const parsed = parseLog(input);
    if (parsed.commits.length > MAX_COMMITS) return `Input contains more than ${MAX_COMMITS.toLocaleString()} commits. Narrow the pasted range before drafting.`;
    const groups = Object.create(null);
    categories.forEach(item => { groups[item[0]] = []; });
    let mergeCount = 0;
    parsed.commits.forEach(commit => {
      if (/^merge\b/i.test(commit.subject) || /^Merge\s+/i.test(commit.raw)) { mergeCount += 1; return; }
      groups[classify(commit)].push(commit);
    });

    const lines = ['# Release Notes Draft', ''];
    lines.push(context ? `> Context: ${context}` : '> Context: _Add version, date, repository, and audience before publishing._');
    lines.push('', '_Draft generated from pasted commit text. Review, edit, and verify against the repository before release._', '');
    let total = 0;
    categories.forEach(item => {
      const name = item[0];
      const entries = groups[name];
      if (!entries.length) return;
      lines.push(`## ${name}`, '');
      entries.forEach(commit => {
        const scope = commit.scope ? `**${commit.scope}:** ` : '';
        const breaking = commit.breaking ? ' **[BREAKING]**' : '';
        const refs = commit.refs.length ? ` (${commit.refs.join(', ')})` : '';
        lines.push(`- ${scope}${commit.subject}${breaking}${refs}`);
        total += 1;
      });
      lines.push('');
    });
    if (!total) lines.push('_No publishable entries remained after parsing and merge filtering._', '');

    const notes = [];
    if (mergeCount) notes.push(`Filtered ${mergeCount} merge commit${mergeCount === 1 ? '' : 's'} as noise; restore manually if relevant.`);
    if (parsed.diagnostics.length) notes.push(...parsed.diagnostics.slice(0, 8));
    if (parsed.diagnostics.length > 8) notes.push(`…and ${parsed.diagnostics.length - 8} more parser diagnostic${parsed.diagnostics.length - 8 === 1 ? '' : 's'}.`);
    lines.push('## Review checklist', '', '- Confirm version, date, repository context, and intended audience.', '- Check wording, duplicate changes, breaking-change impact, and omitted/noisy commits.', '- Verify SHA, PR, and issue references in the repository; this draft does not create links.', '');
    if (notes.length) lines.push('### Parser notes', '', ...notes.map(note => `- ${note}`), '');
    return { text: lines.join('\n').trim() + '\n', filename: 'release-notes-draft.md', mime: 'text/markdown', warnings: ['Repository history, links, labels, and release policy were not checked. Human review is required.'] };
  }

  window.AHDevToolEngines['release-notes-draft-builder'] = {
    title: 'Git Log to Release Notes Draft Builder',
    description: 'Turn a bounded pasted git log or conventional commit list into an editable grouped Markdown release-notes draft while retaining visible SHAs and PR/issue references. Repository context and human editing are required.',
    limitations: 'Browser-local parsing only: it does not inspect a repository, resolve links, infer complete release policy, validate merge history, or guarantee accurate categorization. Merge commits are filtered as likely noise, and conventional-commit/raw-log formats outside the supported patterns may be reported or grouped as Other Changes. Inputs are capped at 250,000 characters, 3,000 lines, and 2,000 commits.',
    fields: [
      { id: 'gitLog', label: 'Pasted git log or commit messages', type: 'textarea', placeholder: 'abc1234 feat(ui): add compact release view (#42)\n9f8e7d6 fix: handle empty changelog', help: 'Accepts common --oneline output, commit-header logs, pipe/tab-separated SHA plus subject, and conventional commit lines.' },
      { id: 'context', label: 'Release/repository context (optional)', type: 'text', placeholder: 'v2.4.0 · web app · customer-facing', help: 'Adds a context line for later human editing; it is not verified.' }
    ],
    run
  };
})();
