(() => {
  'use strict';

  const MAX_CHARS = 200 * 1024;
  const MAX_LINES = 2000;
  const MAX_DIAGNOSTICS = 80;
  const VALID_PERMISSION = new Set(['read', 'write', 'none']);
  const KNOWN_TRIGGERS = new Set([
    'push', 'pull_request', 'pull_request_target', 'issues', 'issue_comment',
    'workflow_dispatch', 'workflow_call', 'schedule', 'workflow_run', 'release',
    'deployment', 'deployment_status', 'repository_dispatch', 'check_run',
    'check_suite', 'create', 'delete', 'fork', 'gollum', 'page_build', 'public',
    'milestone', 'project', 'project_card', 'project_column', 'status', 'watch'
  ]);

  function add(list, level, line, message) {
    if (list.length < MAX_DIAGNOSTICS) list.push(`${level} ${line ? `line ${line}: ` : ''}${message}`);
  }

  function stripComment(text) {
    let quote = '';
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quote) {
        if (ch === quote && text[i - 1] !== '\\') quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '# ' || ch === '#') return text.slice(0, i).replace(/\s+$/, '');
    }
    return text;
  }

  function keyFrom(content) {
    const match = content.match(/^(?:-\s+)?([^:#][^:]*?):(?:\s|$)/);
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
  }

  function valueAfterColon(content) {
    const index = content.indexOf(':');
    return index < 0 ? '' : content.slice(index + 1).trim();
  }

  function looksEmpty(value) {
    return value === '' || value === '{}' || value === '[]' || value === 'null' || value === '~';
  }

  function validate(source) {
    const diagnostics = [];
    const text = String(source == null ? '' : source).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (!text.trim()) return 'No workflow text supplied. Paste a single GitHub Actions workflow YAML document.';
    if (text.length > MAX_CHARS) return `Input is too large (${text.length.toLocaleString()} characters). The local cap is ${MAX_CHARS.toLocaleString()} characters.`;

    const rawLines = text.split('\n');
    if (rawLines.length > MAX_LINES) return `Input has ${rawLines.length.toLocaleString()} lines. The local cap is ${MAX_LINES.toLocaleString()} lines.`;

    const lines = [];
    const seenByIndent = new Map();
    let maxIndent = 0;
    let expressionCount = 0;
    let topKeys = [];

    rawLines.forEach((raw, index) => {
      const lineNo = index + 1;
      if (/\t/.test(raw)) add(diagnostics, 'ERROR', lineNo, 'tabs are not accepted for indentation; use spaces.');
      const expanded = raw.replace(/\t/g, '  ');
      const content = stripComment(expanded).trimEnd();
      if (!content.trim() || content.trimStart().startsWith('---') || content.trimStart().startsWith('...')) return;
      const indent = expanded.length - expanded.trimStart().length;
      maxIndent = Math.max(maxIndent, indent);
      if (indent % 2 !== 0) add(diagnostics, 'WARN', lineNo, `indentation is ${indent} spaces; mixed or uneven indentation is easy to misread.`);
      if (indent > 40) add(diagnostics, 'WARN', lineNo, 'nesting is unusually deep for this lightweight checker.');
      const clean = content.trim();
      const key = keyFrom(clean);
      if (key) {
        const bucket = seenByIndent.get(indent) || new Set();
        if (bucket.has(key)) add(diagnostics, 'ERROR', lineNo, `duplicate mapping key “${key}” at the same indentation.`);
        bucket.add(key);
        seenByIndent.set(indent, bucket);
        if (indent === 0) topKeys.push(key);
      } else if (!/^[-?]/.test(clean) && !clean.includes(':')) {
        add(diagnostics, 'ERROR', lineNo, 'expected a mapping entry such as “key: value” or a list item.');
      }
      const exprOpen = (clean.match(/\$\{\{/g) || []).length;
      const exprClose = (clean.match(/\}\}/g) || []).length;
      expressionCount += exprOpen;
      if (exprOpen !== exprClose) add(diagnostics, 'ERROR', lineNo, 'expression delimiters are unbalanced; use ${{ ... }} pairs.');
      if (/\b(on|jobs|permissions|steps|runs-on|uses|run):\s*$/.test(clean) && !['on:', 'jobs:', 'permissions:', 'steps:'].some(k => clean === k)) {
        add(diagnostics, 'WARN', lineNo, 'this key has no inline value; confirm that its indented block is present.');
      }
      lines.push({ lineNo, indent, clean, key, value: valueAfterColon(clean) });
    });

    if (maxIndent > 40) add(diagnostics, 'WARN', 0, 'complexity is beyond the comfortable scope of this lightweight parser.');
    const topSet = new Set(topKeys);
    if (!topSet.has('on')) add(diagnostics, 'ERROR', 0, 'missing top-level “on” trigger declaration.');
    if (!topSet.has('jobs')) add(diagnostics, 'ERROR', 0, 'missing top-level “jobs” mapping.');
    if (topSet.has('name') && lines.find(x => x.indent === 0 && x.key === 'name' && looksEmpty(x.value))) add(diagnostics, 'WARN', 0, 'top-level “name” is empty.');

    const onLine = lines.find(x => x.indent === 0 && x.key === 'on');
    if (onLine) {
      const nextTopLevel = lines.find(x => x.lineNo > onLine.lineNo && x.indent <= onLine.indent);
      const triggerLines = lines.filter(x => x.lineNo > onLine.lineNo && (!nextTopLevel || x.lineNo < nextTopLevel.lineNo) && x.indent === onLine.indent + 2 && x.key);
      if (looksEmpty(onLine.value) && !triggerLines.length) add(diagnostics, 'ERROR', onLine.lineNo, '“on” has no trigger value or indented trigger block.');
      triggerLines.forEach(item => {
        if (!KNOWN_TRIGGERS.has(item.key) && item.key !== 'types' && item.key !== 'branches' && item.key !== 'paths' && item.key !== 'tags' && item.key !== 'ignore' && item.key !== 'branches-ignore' && item.key !== 'paths-ignore') {
          add(diagnostics, 'WARN', item.lineNo, `“${item.key}” is not a recognized common GitHub trigger in this static checklist; verify spelling.`);
        }
      });
    }

    lines.filter(x => x.indent === 0 && x.key === 'permissions').forEach(item => {
      if (item.value && item.value !== '{}' && item.value !== 'read-all' && item.value !== 'write-all' && item.value !== 'read' && item.value !== 'write' && item.value !== 'none') {
        add(diagnostics, 'WARN', item.lineNo, 'permissions value is not one of the simple read/write/none or *-all forms checked here.');
      }
      lines.filter(x => x.lineNo > item.lineNo && x.indent === item.indent + 2 && x.key).forEach(permission => {
        if (!VALID_PERMISSION.has(permission.value.replace(/["']/g, '')) && !looksEmpty(permission.value)) add(diagnostics, 'ERROR', permission.lineNo, `permission “${permission.key}” should be read, write, or none.`);
      });
    });

    const jobsLine = lines.find(x => x.indent === 0 && x.key === 'jobs');
    const jobNames = [];
    if (jobsLine) {
      lines.filter(x => x.lineNo > jobsLine.lineNo && x.indent === jobsLine.indent + 2 && x.key).forEach(job => {
        jobNames.push(job.key);
        const jobEnd = lines.find(x => x.indent === jobsLine.indent + 2 && x.lineNo > job.lineNo);
        const jobLines = lines.filter(x => x.lineNo > job.lineNo && (!jobEnd || x.lineNo < jobEnd.lineNo) && x.indent > job.indent);
        if (!jobLines.length) add(diagnostics, 'ERROR', job.lineNo, `job “${job.key}” has no indented configuration.`);
        const hasRunsOn = jobLines.some(x => x.indent === job.indent + 2 && x.key === 'runs-on');
        const hasUses = jobLines.some(x => x.indent === job.indent + 2 && x.key === 'uses');
        const hasSteps = jobLines.some(x => x.indent === job.indent + 2 && x.key === 'steps');
        if (!hasRunsOn && !hasUses) add(diagnostics, 'ERROR', job.lineNo, `job “${job.key}” needs runs-on (or a reusable-workflow uses target).`);
        if (hasRunsOn && hasUses) add(diagnostics, 'ERROR', job.lineNo, `job “${job.key}” mixes runs-on and job-level uses; choose a normal or reusable-workflow job.`);
        if (hasRunsOn && !hasSteps) add(diagnostics, 'WARN', job.lineNo, `job “${job.key}” has runs-on but no steps; confirm this is intentional.`);
        jobLines.filter(x => x.indent === job.indent + 2 && x.key === 'uses').forEach(use => {
          if (use.indent >= job.indent + 2 && !/^[^/\s]+\/[^/\s]+(?:\/[^/\s]+)?@[^\s]+$/.test(use.value.replace(/^['"]|['"]$/g, ''))) add(diagnostics, 'ERROR', use.lineNo, 'action/reusable-workflow uses value should include owner/name@ref (static shape check only).');
        });
        jobLines.filter(x => x.key === 'steps').forEach(steps => {
          const stepItems = jobLines.filter(x => x.lineNo > steps.lineNo && x.indent > steps.indent && /^-\s/.test(x.clean));
          if (!stepItems.length && looksEmpty(steps.value)) add(diagnostics, 'ERROR', steps.lineNo, 'steps is empty; add list items such as “- uses:” or “- run:”.');
          stepItems.forEach(step => {
            const end = jobLines.find(x => x.lineNo > step.lineNo && x.indent <= step.indent);
            const block = jobLines.filter(x => x.lineNo >= step.lineNo && (!end || x.lineNo < end.lineNo) && x.indent >= step.indent);
            const hasRun = block.some(x => x.key === 'run');
            const hasStepUses = block.some(x => x.key === 'uses');
            if (!hasRun && !hasStepUses) add(diagnostics, 'ERROR', step.lineNo, 'step has neither run nor uses.');
            if (hasRun && hasStepUses) add(diagnostics, 'ERROR', step.lineNo, 'step should not define both run and uses.');
            block.filter(x => x.key === 'uses').forEach(use => {
              if (!/^[^/\s]+\/[^/\s]+@[^\s]+$/.test(use.value.replace(/^['"]|['"]$/g, ''))) add(diagnostics, 'ERROR', use.lineNo, 'step uses value should look like owner/action@ref.');
            });
          });
        });
      });
    }

    const summary = [];
    summary.push('GitHub Actions workflow structural check (browser-local, lightweight)');
    summary.push(`Input: ${rawLines.length} lines, ${text.length.toLocaleString()} characters; jobs found: ${jobNames.length ? jobNames.join(', ') : 'none'}.`);
    if (expressionCount) summary.push(`Expressions observed: ${expressionCount}; only delimiter balance was checked.`);
    if (!diagnostics.length) summary.push('No issues found by this limited checklist. This is not proof that GitHub or actionlint will accept the workflow.');
    else {
      summary.push(`Diagnostics: ${diagnostics.length}${diagnostics.length >= MAX_DIAGNOSTICS ? '+' : ''}`);
      summary.push(...diagnostics);
    }
    summary.push('Scope limits: no full YAML parser, action metadata, repository/settings context, secrets, runner behavior, expression evaluation, network checks, or GitHub runtime parity. Review against GitHub documentation/actionlint before relying on it.');
    return summary.join('\n');
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['github-actions-workflow-validator'] = {
    title: 'GitHub Actions Workflow Validator',
    description: 'Paste one workflow to check basic YAML-like structure and common trigger, job, step, permission, action-reference, and expression-delimiter mistakes locally. This is not actionlint and does not claim GitHub runtime parity.',
    limitations: 'Lightweight bounded text checks only (200 KB or 2,000 lines). It does not fully parse YAML, evaluate expressions, inspect action metadata or repositories, contact GitHub, validate private workflow settings, model custom runners/secrets, or reproduce actionlint/GitHub behavior.',
    fields: [{
      id: 'workflow',
      label: 'Workflow YAML',
      type: 'textarea',
      placeholder: 'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test',
      help: 'Paste a single workflow document. Keep input at or below 200 KB and 2,000 lines.'
    }],
    run(values) {
      return validate(values && typeof values.workflow === 'string' ? values.workflow : '');
    }
  };
})();
