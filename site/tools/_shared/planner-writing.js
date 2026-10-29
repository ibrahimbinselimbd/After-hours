(() => {
  'use strict';

  window.AHPlannerTools ||= [];
  window.AHPlannerHandlers ||= {};

  const CATEGORY = 'ai-everyday-utilities';
  const LIMITS = 'Local heuristic aid only: results can miss context, formatting, language nuance, or intentional style choices. Review the source yourself; this is not legal, compliance, accessibility, translation, or editorial certification.';
  const text = (value) => String(value ?? '');
  const words = (value) => text(value).match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ0-9]+)*/g) || [];
  const lines = (value) => text(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const number = (value, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : fallback));
  const escRegExp = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const countMatches = (source, pattern, flags = 'giu') => (text(source).match(new RegExp(pattern, flags)) || []).length;
  const sentences = (value) => text(value).replace(/\s+/g, ' ').split(/[.!?]+(?=\s|$)/).map((s) => s.trim()).filter(Boolean);
  const formatList = (items) => items.length ? items.map((item) => `- ${item}`).join('\n') : '- None detected.';
  const result = (summary, details, filename, warnings = []) => ({summary, details, filename, warnings});

  function parseAliases(value) {
    const groups = [];
    for (const line of lines(value)) {
      const separator = line.includes('=') ? '=' : ':';
      const parts = line.split(separator).map((part) => part.trim()).filter(Boolean);
      if (!parts.length) continue;
      const canonical = parts.shift();
      const aliases = parts.flatMap((part) => part.split(',').map((alias) => alias.trim()).filter(Boolean));
      groups.push({canonical, aliases: [...new Set([canonical, ...aliases])]});
    }
    return groups;
  }

  function characterConsistency(values) {
    const source = text(values.text);
    const groups = parseAliases(values.aliases);
    if (!source.trim()) return 'Add manuscript text to inspect character/name occurrences.';
    if (!groups.length) return 'Add one character per line in the form Canonical Name = alias, nickname.';
    const report = groups.map(({canonical, aliases}) => {
      const counts = aliases.map((alias) => `${alias}: ${countMatches(source, `\\b${escRegExp(alias)}\\b`)}`).join('; ');
      const variants = aliases.filter((alias) => alias !== canonical && countMatches(source, `\\b${escRegExp(alias)}\\b`) > 0);
      return `${canonical}\n  ${counts}${variants.length ? `\n  Review variants: ${variants.join(', ')}` : ''}`;
    });
    return `MANUSCRIPT CHARACTER / NAME CONSISTENCY\n\n${report.join('\n\n')}\n\nMethod: case-insensitive whole-word counts for the supplied names and aliases. Names with punctuation, spelling changes, or inflection may be missed.`;
  }

  function outlineCoverage(values) {
    const source = text(values.outline);
    const topics = lines(values.keywords).flatMap((line) => line.split(',').map((item) => item.trim()).filter(Boolean));
    const minimum = Math.round(number(values.minimumOccurrences, 1, 1, 100));
    if (!source.trim() || !topics.length) return 'Add an outline and one topic or keyword per line (commas are also accepted).';
    const rows = topics.map((topic) => {
      const count = countMatches(source, escRegExp(topic));
      return {topic, count, covered: count >= minimum};
    });
    const covered = rows.filter((row) => row.covered).length;
    return `LONG-FORM OUTLINE COVERAGE\n\nCoverage: ${covered}/${rows.length} topics meet the minimum of ${minimum} occurrence(s).\n\n${formatList(rows.map((row) => `${row.covered ? 'COVERED' : 'MISSING'} — ${row.topic}: ${row.count}`))}\n\nMethod: case-insensitive literal phrase matching in the supplied outline. Synonyms and implied coverage are not inferred.`;
  }

  function repetitionFinder(values) {
    const source = text(values.text);
    const size = Math.round(number(values.phraseLength, 3, 2, 8));
    const minimum = Math.round(number(values.minimumOccurrences, 3, 2, 50));
    const tokens = words(source).map((word) => word.toLowerCase());
    const counts = new Map();
    for (let i = 0; i <= tokens.length - size; i += 1) {
      const phrase = tokens.slice(i, i + size).join(' ');
      if (!/\b(?:the|and|of|to|in|a|is|it|for|on|with)\b/.test(phrase) || size > 2) counts.set(phrase, (counts.get(phrase) || 0) + 1);
    }
    const repeated = [...counts.entries()].filter(([, count]) => count >= minimum).sort((a, b) => b[1] - a[1]).slice(0, 40);
    return `REPETITION / OVERUSED PHRASES\n\n${repeated.length ? formatList(repeated.map(([phrase, count]) => `“${phrase}” — ${count} occurrences`)) : '- No repeated phrases met the threshold.'}\n\nSettings: ${size}-word phrases; minimum ${minimum} occurrences. Common short function-word phrases are suppressed, and punctuation/case are normalized.`;
  }

  function dialogueInspector(values) {
    const source = text(values.text);
    const quoted = source.match(/[““"]([^””"]{2,})[””"]/g) || [];
    const tags = [...source.matchAll(/\b(said|asked|replied|answered|shouted|whispered|yelled|exclaimed|muttered|added|continued|cried|called|wondered)\b/giu)].map((match) => match[1].toLowerCase());
    const counts = [...new Set(tags)].map((tag) => [tag, tags.filter((item) => item === tag).length]).sort((a, b) => b[1] - a[1]);
    const voices = quoted.map((quote) => quote.replace(/^[““"]|[””"]$/g, '').trim()).filter(Boolean).slice(0, 20);
    const avg = voices.length ? Math.round(voices.reduce((sum, line) => sum + words(line).length, 0) / voices.length) : 0;
    return `DIALOGUE TAG / CHARACTER VOICE INSPECTOR\n\nQuoted dialogue segments: ${quoted.length}\nAverage quoted segment length: ${avg || 'not available'} words\nDialogue tag counts:\n${formatList(counts.map(([tag, count]) => `${tag}: ${count}`))}\n\nVoice samples (first ${voices.length}):\n${formatList(voices.map((line) => `“${line}”`))}\n\nMethod: counts common English attribution verbs and straight/curly quoted segments. It does not determine whether a tag is stylistically appropriate or identify speakers reliably.`;
  }

  function newsletterSubjectPreview(values) {
    const subject = text(values.subject).trim();
    const preheader = text(values.preheader).trim();
    const subjectLength = [...subject].length;
    const preheaderLength = [...preheader].length;
    const status = (length, soft, hard) => length === 0 ? 'EMPTY' : length <= soft ? 'COMPACT' : length <= hard ? 'LONGER' : 'LIKELY TRUNCATED';
    return `NEWSLETTER SUBJECT / PREHEADER PREVIEW\n\nSubject (${subjectLength} characters; ${status(subjectLength, 45, 70)}):\n${subject || '(empty)'}\n\nPreheader (${preheaderLength} characters; ${status(preheaderLength, 90, 140)}):\n${preheader || '(empty)'}\n\nText preview:\n[Subject] ${subject || '(empty)'}\n[Preheader] ${preheader || '(empty)'}\n\nGuidance: displayed length varies by client, device, font, language, and inbox UI. These are rough review bands, not delivery guarantees.`;
  }

  function responsiveEmailPreview(values) {
    const source = text(values.email);
    const viewport = values.viewport || 'mobile';
    const width = viewport === 'desktop' ? 600 : viewport === 'tablet' ? 480 : 320;
    const warnings = [];
    if (!source.trim()) return 'Add email source text for a non-rendering responsive diagnostic.';
    if (/<table\b/iu.test(source) && !/<meta[^>]+viewport/iu.test(source)) warnings.push('Table-based layout detected without a visible viewport declaration.');
    if (/<img\b/iu.test(source) && !/(?:width\s*=|style\s*=\s*["'][^"']*max-width)/iu.test(source)) warnings.push('Image tags found without an obvious width or max-width hint.');
    if (/width\s*=\s*["'](?:[5-9]\d\d|[1-9]\d{3,})/iu.test(source)) warnings.push('A fixed width over 500px may overflow a narrow viewport.');
    if (/position\s*:\s*(?:fixed|absolute)|display\s*:\s*grid|display\s*:\s*flex/iu.test(source)) warnings.push('Modern or positioned layout CSS may have uneven email-client support.');
    if (!/(?:alt\s*=|role\s*=\s*["']presentation)/iu.test(source) && /<img\b/iu.test(source)) warnings.push('Images do not show an obvious alt or presentation attribute.');
    const textLength = words(source.replace(/<[^>]*>/g, ' ')).length;
    return `NEWSLETTER RESPONSIVE EMAIL PREVIEW DIAGNOSTICS\n\nReview viewport: ${viewport} (approx. ${width}px wide)\nApproximate readable words: ${textLength}\nDetected risks:\n${formatList(warnings)}\n\nNo markup was executed or rendered. This is a text-only static scan for common width, image, viewport, and layout clues; test in target email clients before sending.`;
  }

  const glossarySuggestions = [
    ['utilize', 'use'], ['commence', 'start'], ['terminate', 'end'], ['approximately', 'about'], ['in order to', 'to'], ['due to the fact that', 'because'], ['at this point in time', 'now'], ['prior to', 'before'], ['subsequent to', 'after'], ['facilitate', 'help']
  ];
  function readability(values) {
    const source = text(values.text).trim();
    const tokenCount = words(source).length;
    const sentenceCount = Math.max(1, sentences(source).length);
    const syllables = words(source).reduce((sum, word) => {
      const normalized = word.toLowerCase().replace(/[^a-z]/g, '');
      const estimate = Math.max(1, (normalized.match(/[aeiouy]+/g) || []).length - (/(?:e|es|ed)$/.test(normalized) && !/(?:le|ee|ye)$/.test(normalized) ? 1 : 0));
      return sum + estimate;
    }, 0);
    const score = tokenCount ? 206.835 - 1.015 * (tokenCount / sentenceCount) - 84.6 * (syllables / tokenCount) : 0;
    const level = score >= 90 ? 'very easy' : score >= 80 ? 'easy' : score >= 70 ? 'fairly easy' : score >= 60 ? 'plain English' : score >= 50 ? 'fairly difficult' : score >= 30 ? 'difficult' : 'very difficult';
    const suggestions = glossarySuggestions.filter(([from]) => new RegExp(`\\b${escRegExp(from)}\\b`, 'iu').test(source)).map(([from, to]) => `Consider “${to}” instead of “${from}”`);
    return `READING LEVEL / JARGON SIMPLIFIER\n\nWords: ${tokenCount}\nSentences: ${source ? sentenceCount : 0}\nEstimated syllables: ${syllables}\nFlesch-style reading ease: ${source ? score.toFixed(1) : 'not available'} (${level})\n\nConservative local suggestions:\n${formatList(suggestions)}\n\nMethod: an approximate English Flesch-style formula plus a small transparent word list. Syllable counts are estimates; the score is not a grade placement or a guarantee of clarity.`;
  }

  function inclusiveReview(values) {
    const source = text(values.text);
    const patterns = [
      ['guys', 'everyone / team / folks'], ['manpower', 'staffing / workforce'], ['chairman', 'chair / chairperson'], ['crazy', 'specific description, if relevant'], ['sanity check', 'quick check / confidence check'], ['dummy', 'placeholder / sample'], ['master/slave', 'primary/replica or leader/follower'], ['blacklist', 'blocklist / denylist'], ['whitelist', 'allowlist'], ['cripple', 'hinder / disable']
    ];
    const findings = patterns.flatMap(([term, suggestion]) => {
      const count = countMatches(source, escRegExp(term));
      return count ? [`${term}: ${count} occurrence(s); consider ${suggestion}`] : [];
    });
    return `INCLUSIVE LANGUAGE REVIEW\n\nPotential review points:\n${formatList(findings)}\n\nMethod: transparent case-insensitive phrase heuristics for a small set of context-dependent terms. A match is not proof of harm or error, and absence of a match does not establish inclusivity. Consider audience, quoted material, reclaimed language, and the writer’s intended meaning.`;
  }

  function parseGlossary(value) {
    return lines(value).flatMap((line) => {
      const parts = line.split(/\s*(?:=>|->|=|:)\s*/);
      if (parts.length < 2 || !parts[0].trim() || !parts[1].trim()) return [];
      return [{term: parts[0].trim(), preferred: parts.slice(1).join(' ').trim()}];
    });
  }
  function glossaryConsistency(values) {
    const source = text(values.text);
    const glossary = parseGlossary(values.glossary);
    if (!glossary.length) return 'Add glossary entries as source term = preferred translation, one per line.';
    const findings = glossary.map(({term, preferred}) => {
      const termCount = countMatches(source, `\\b${escRegExp(term)}\\b`);
      const preferredCount = countMatches(source, `\\b${escRegExp(preferred)}\\b`);
      return `${term} → ${preferred}: source-term matches ${termCount}; preferred-term matches ${preferredCount}${termCount && preferredCount ? ' (mixed usage to review)' : ''}`;
    });
    return `TRANSLATION GLOSSARY CONSISTENCY\n\n${formatList(findings)}\n\nMethod: case-insensitive whole-word matching against the supplied text and glossary. Inflections, morphology, context, and translations in other scripts may not match; this does not judge translation quality.`;
  }

  function citationCompleteness(values) {
    const citations = text(values.citations);
    const bibliography = text(values.bibliography);
    const style = values.style || 'generic';
    const markers = [...citations.matchAll(/(?:\(([A-Z][A-Za-z'’-]+(?:\s+et al\.)?(?:,?\s+\d{4})?)\)|\[(\d{1,3})\]|\b(?:[A-Z][A-Za-z'’-]+,?\s+\d{4})\b)/g)].map((match) => match[1] || match[2] || match[0]);
    const entries = lines(bibliography);
    const incomplete = entries.map((entry, index) => {
      const checks = {author: /[A-Z][A-Za-z'’-]+/.test(entry), year: /\b(?:18|19|20|21)\d{2}\b/.test(entry), locator: /(?:https?:\/\/|doi\s*:\s*|\bISBN\b|\bvol\.?\b|\bpp?\.?\b)/iu.test(entry)};
      const missing = Object.entries(checks).filter(([, present]) => !present).map(([key]) => key);
      return missing.length ? `Entry ${index + 1}: missing likely ${missing.join(', ')}` : `Entry ${index + 1}: basic fields present`;
    });
    return `CITATION / BIBLIOGRAPHY COMPLETENESS\n\nStyle selected: ${style}\nCitation markers detected: ${markers.length}\nBibliography entries detected: ${entries.length}\n\nEntry checks:\n${formatList(incomplete)}\n\nCross-reference note: marker-to-entry matching is only attempted for obvious numeric markers or author-year text and is not a full parser. This checks field presence, not source accuracy, plagiarism, legal sufficiency, or style-guide compliance.`;
  }

  const definitions = [
    {slug: 'manuscript-character-name-consistency-finder', title: 'Manuscript Character/Name Consistency Finder', categoryId: CATEGORY, description: 'Count supplied character names and aliases in manuscript text and surface variant usage for review.', limitations: LIMITS, fields: [{id: 'text', label: 'Manuscript text', type: 'textarea', placeholder: 'Paste manuscript text…', required: true}, {id: 'aliases', label: 'Names and aliases', type: 'textarea', placeholder: 'Maya Chen = Maya, Chen\nJon Bell = Jonathan', help: 'One character per line; use = or : between the canonical name and aliases.', required: true}]},
    {slug: 'long-form-outline-coverage-checker', title: 'Long-Form Outline Coverage Checker', categoryId: CATEGORY, description: 'Check whether an outline mentions each required topic or keyword often enough.', limitations: LIMITS, fields: [{id: 'outline', label: 'Outline text', type: 'textarea', required: true}, {id: 'keywords', label: 'Required topics or keywords', type: 'textarea', placeholder: 'Audience\nBudget\nLaunch plan', required: true}, {id: 'minimumOccurrences', label: 'Minimum occurrences', type: 'number', min: 1, max: 100, step: 1, default: 1}]},
    {slug: 'repetition-overused-phrase-finder', title: 'Repetition & Overused Phrase Finder', categoryId: CATEGORY, description: 'Find repeated word phrases above a chosen threshold after normalizing case and punctuation.', limitations: LIMITS, fields: [{id: 'text', label: 'Text', type: 'textarea', required: true}, {id: 'phraseLength', label: 'Phrase length in words', type: 'number', min: 2, max: 8, step: 1, default: 3}, {id: 'minimumOccurrences', label: 'Minimum occurrences', type: 'number', min: 2, max: 50, step: 1, default: 3}]},
    {slug: 'dialogue-tag-character-voice-pattern-inspector', title: 'Dialogue Tag & Character Voice Pattern Inspector', categoryId: CATEGORY, description: 'Count common dialogue tags and summarize quoted dialogue lengths and samples.', limitations: LIMITS, fields: [{id: 'text', label: 'Manuscript or dialogue text', type: 'textarea', required: true}]},
    {slug: 'newsletter-subject-preheader-previewer', title: 'Newsletter Subject/Preheader Previewer', categoryId: CATEGORY, description: 'Preview subject and preheader text with rough character-length bands for inbox review.', limitations: LIMITS, fields: [{id: 'subject', label: 'Subject line', type: 'text', required: true}, {id: 'preheader', label: 'Preheader text', type: 'text'}]},
    {slug: 'newsletter-responsive-email-previewer', title: 'Newsletter Responsive Email Previewer', categoryId: CATEGORY, description: 'Run a text-only diagnostic for common responsive email width, image, viewport, and CSS clues.', limitations: LIMITS, fields: [{id: 'email', label: 'Email source text', type: 'textarea', placeholder: 'Paste source for static diagnostics; markup is not executed.', required: true}, {id: 'viewport', label: 'Review viewport', type: 'select', options: [{label: 'Mobile', value: 'mobile'}, {label: 'Tablet', value: 'tablet'}, {label: 'Desktop', value: 'desktop'}], default: 'mobile'}]},
    {slug: 'reading-level-jargon-simplifier', title: 'Reading-Level & Jargon Simplifier', categoryId: CATEGORY, description: 'Estimate English reading ease and suggest a small set of conservative plain-language alternatives.', limitations: LIMITS, fields: [{id: 'text', label: 'Text', type: 'textarea', required: true}]},
    {slug: 'inclusive-language-review-assistant', title: 'Inclusive Language Review Assistant', categoryId: CATEGORY, description: 'Flag a small transparent set of context-dependent terms for human review.', limitations: LIMITS, fields: [{id: 'text', label: 'Text', type: 'textarea', required: true}]},
    {slug: 'translation-glossary-consistency-checker', title: 'Translation Glossary Consistency Checker', categoryId: CATEGORY, description: 'Compare glossary source and preferred terms in text to find mixed usage.', limitations: LIMITS, fields: [{id: 'text', label: 'Translation or localized text', type: 'textarea', required: true}, {id: 'glossary', label: 'Glossary', type: 'textarea', placeholder: 'source term = preferred translation', required: true}]},
    {slug: 'citation-bibliography-completeness-checker', title: 'Citation/Bibliography Completeness Checker', categoryId: CATEGORY, description: 'Check basic field presence in bibliography entries and report obvious citation markers.', limitations: LIMITS, fields: [{id: 'citations', label: 'Text with citations', type: 'textarea'}, {id: 'bibliography', label: 'Bibliography entries', type: 'textarea', required: true}, {id: 'style', label: 'Reference style', type: 'select', options: [{label: 'Generic', value: 'generic'}, {label: 'APA-like', value: 'apa'}, {label: 'MLA-like', value: 'mla'}, {label: 'Chicago-like', value: 'chicago'}, {label: 'Numeric', value: 'numeric'}], default: 'generic'}]}
  ];

  const handlers = {
    'manuscript-character-name-consistency-finder': characterConsistency,
    'long-form-outline-coverage-checker': outlineCoverage,
    'repetition-overused-phrase-finder': repetitionFinder,
    'dialogue-tag-character-voice-pattern-inspector': dialogueInspector,
    'newsletter-subject-preheader-previewer': newsletterSubjectPreview,
    'newsletter-responsive-email-previewer': responsiveEmailPreview,
    'reading-level-jargon-simplifier': readability,
    'inclusive-language-review-assistant': inclusiveReview,
    'translation-glossary-consistency-checker': glossaryConsistency,
    'citation-bibliography-completeness-checker': citationCompleteness
  };

  for (const definition of definitions) {
    if (!window.AHPlannerTools.some((tool) => tool.slug === definition.slug)) window.AHPlannerTools.push(definition);
  }
  Object.assign(window.AHPlannerHandlers, handlers);
})();
