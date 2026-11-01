(() => {
  'use strict';

  const MAX_BYTES = 200 * 1024;
  const MAX_LINES = 2000;
  const commands = new Set(['pick', 'p', 'reword', 'r', 'edit', 'e', 'squash', 's', 'fixup', 'f', 'drop', 'd', 'exec', 'x', 'break', 'b', 'label', 'reset', 'merge']);
  const aliases = {p: 'pick', r: 'reword', e: 'edit', s: 'squash', f: 'fixup', d: 'drop', x: 'exec', b: 'break'};
  const textOf = value => String(value == null ? '' : value);
  const byteLength = value => {
    try { return new TextEncoder().encode(value).length; }
    catch (_) { return value.length; }
  };
  const clean = value => textOf(value).replace(/^\uFEFF/, '');
  const short = value => value.length > 48 ? `${value.slice(0, 45)}...` : value;

  function parseTodo(input) {
    const source = clean(input);
    if (!source.trim()) throw new Error('Paste a non-empty interactive rebase todo file.');
    if (byteLength(source) > MAX_BYTES) throw new Error('Input is too large. Limit it to 200 KB.');
    const rawLines = source.split(/\r\n?|\n/);
    if (rawLines.length > MAX_LINES) throw new Error('Input is too complex. Limit it to 2,000 lines.');
    const entries = [];
    const diagnostics = [];
    rawLines.forEach((raw, index) => {
      const line = raw.trim();
      const lineNo = index + 1;
      if (!line || line.startsWith('#')) return;
      const match = line.match(/^(\S+)(?:\s+(.*))?$/);
      if (!match) {
        diagnostics.push(`Line ${lineNo}: cannot parse “${short(line)}”.`);
        return;
      }
      const token = match[1].toLowerCase();
      const rest = match[2] || '';
      if (!commands.has(token)) {
        diagnostics.push(`Line ${lineNo}: unknown command “${token}”; ignored.`);
        return;
      }
      const command = aliases[token] || token;
      const arg = rest.trim();
      if (['pick', 'reword', 'edit', 'squash', 'fixup', 'drop'].includes(command) && !arg) {
        diagnostics.push(`Line ${lineNo}: ${command} needs a commit id; ignored.`);
        return;
      }
      entries.push({lineNo, command, arg, raw: line});
    });
    return {entries, diagnostics};
  }

  function visualize(input) {
    let parsed;
    try { parsed = parseTodo(input); }
    catch (error) { return {text: `Git rebase todo visualizer\n\nError: ${error.message}`, warnings: [error.message]}; }

    const warnings = parsed.diagnostics.slice();
    const result = [];
    let current = null;
    let order = 0;
    const describe = item => `${item.command} ${item.arg || ''}`.trim();

    parsed.entries.forEach(entry => {
      const cmd = entry.command;
      if (cmd === 'exec') {
        warnings.push(`Line ${entry.lineNo}: exec is shown as a step but its shell command/result is not simulated.`);
        result.push({kind: 'exec', lineNo: entry.lineNo, text: entry.arg || '(empty command)'});
        return;
      }
      if (cmd === 'break') {
        warnings.push(`Line ${entry.lineNo}: break is a pause marker; continuation behavior is not simulated.`);
        result.push({kind: 'break', lineNo: entry.lineNo});
        return;
      }
      if (cmd === 'label' || cmd === 'reset' || cmd === 'merge') {
        warnings.push(`Line ${entry.lineNo}: ${cmd} is preserved as a structural marker; repository topology is not simulated.`);
        result.push({kind: cmd, lineNo: entry.lineNo, text: entry.arg || '(no argument)'});
        return;
      }
      if (cmd === 'drop') {
        result.push({kind: 'drop', lineNo: entry.lineNo, text: entry.arg});
        if (current && current.commit === entry.arg) current = null;
        return;
      }
      if (cmd === 'squash' || cmd === 'fixup') {
        if (!current) {
          warnings.push(`Line ${entry.lineNo}: ${cmd} ${entry.arg} has no preceding surviving commit; it cannot attach here.`);
          result.push({kind: 'orphan', lineNo: entry.lineNo, text: describe(entry)});
          return;
        }
        current.children.push({command: cmd, commit: entry.arg, lineNo: entry.lineNo});
        return;
      }
      const item = {kind: 'commit', command: cmd, commit: entry.arg, lineNo: entry.lineNo, children: [], order: ++order};
      result.push(item);
      current = item;
    });

    const lines = ['Git rebase todo visualizer', '', 'Resulting sequence (after drop; squash/fixup folded into the preceding commit):'];
    let visible = 0;
    result.forEach(item => {
      if (item.kind === 'commit') {
        visible += 1;
        const folded = item.children.map(child => `${child.command} ${child.commit}`).join('; ');
        lines.push(`${visible}. ${item.commit} — ${item.command}${folded ? `; ${folded}` : ''}`);
      } else if (item.kind === 'drop') {
        lines.push(`- dropped: ${item.text}`);
      } else if (item.kind === 'exec') {
        lines.push(`! exec: ${item.text}`);
      } else if (item.kind === 'break') {
        lines.push('! break: pause marker');
      } else if (item.kind === 'orphan') {
        lines.push(`! unattached: ${item.text}`);
      } else {
        lines.push(`~ ${item.kind}: ${item.text}`);
      }
    });
    if (!visible) lines.push('(no surviving commits)');
    lines.push('', `Summary: ${visible} surviving commit${visible === 1 ? '' : 's'}; ${result.filter(x => x.kind === 'drop').length} drop marker${result.filter(x => x.kind === 'drop').length === 1 ? '' : 's'}; ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`);
    if (warnings.length) {
      lines.push('', 'Warnings:');
      warnings.forEach(warning => lines.push(`- ${warning}`));
    }
    lines.push('', 'Scope: structural preview only. This does not simulate conflicts, the resulting tree, authors, repository state, or command effects.');
    return {text: lines.join('\n'), warnings};
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['git-rebase-todo-visualizer'] = {
    title: 'Interactive Git Rebase Todo Visualizer',
    description: 'Paste a bounded interactive rebase todo to preview resulting order, squash/fixup folding, drops, and structural hazards; conflicts, tree state, and command effects are not simulated.',
    limitations: 'Browser-local structural analysis only. It does not access a repository or simulate conflicts, the resulting tree, authors, command effects, or exec results. Supports common todo commands and caps input at 200 KB and 2,000 lines.',
    fields: [{
      id: 'todo',
      label: 'Interactive rebase todo',
      type: 'textarea',
      placeholder: 'pick a1b2c3 First commit\nsquash d4e5f6 Combine changes\nexec npm test\ndrop 789abc Unwanted commit',
      help: 'Paste the text from an interactive rebase todo file. Comment and blank lines are ignored.'
    }],
    run(values) {
      return visualize(values && values.todo);
    }
  };
})();
