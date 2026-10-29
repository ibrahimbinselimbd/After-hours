(() => {
  'use strict';

  window.AHPlannerTools ||= [];
  window.AHPlannerHandlers ||= {};

  const CATEGORY = 'ai-everyday-utilities';
  const MAX = 50000;
  const clean = (value, max = MAX) => String(value ?? '').replace(/\u0000/g, '').slice(0, max).trim();
  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const lines = (value) => clean(value).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const dateOnly = (value) => {
    const m = /^\d{4}-\d{2}-\d{2}$/.exec(clean(value, 20));
    if (!m) return null;
    const d = new Date(`${m[0]}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const iso = (d) => d.toISOString().slice(0, 10);
  const titleCase = (s) => clean(s, 120).replace(/\s+/g, ' ').replace(/^./, c => c.toUpperCase());
  const unique = (xs) => [...new Set(xs.map(x => clean(x, 120)).filter(Boolean))];
  const words = (s) => clean(s).toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || [];
  const numbered = (items, prefix = '') => items.map((x, i) => `${prefix}${i + 1}. ${x}`).join('\n');
  const result = (summary, details, filename, warnings) => ({summary, details, filename, warnings});

  function parseSections(source) {
    const text = clean(source);
    const explicit = text.split(/\n\s*(?:---+|===+|###\s*)\s*\n/g).map(s => s.trim()).filter(Boolean);
    if (explicit.length > 1) return explicit.map((body, i) => ({title: `Section ${i + 1}`, body}));
    const found = [];
    let current = null;
    for (const line of text.split(/\r?\n/)) {
      const heading = /^(?:#{1,6}\s+|(?:[A-Z][A-Z0-9 &:/-]{2,})\s*:?)$/.test(line.trim());
      if (heading) {
        if (current) found.push(current);
        current = {title: line.replace(/^#+\s*/, '').replace(/:$/, '').trim(), body: ''};
      } else if (current) current.body += `${line}\n`;
    }
    if (current) found.push(current);
    if (found.length) return found.map(s => ({title: titleCase(s.title), body: clean(s.body)})).filter(s => s.body);
    return lines(text).map((body, i) => ({title: `Note ${i + 1}`, body}));
  }

  function parseItems(source) {
    return parseSections(source).map((s, i) => ({...s, index: i + 1})).slice(0, 200);
  }

  function flashcards(values) {
    const sections = parseItems(values.notes);
    if (!sections.length) return 'Add notes using headings or separate entries with ---.';
    const cards = sections.map((s, i) => {
      const sentence = s.body.split(/[.!?](?:\s|$)/)[0].trim();
      const answer = s.body.replace(/\s+/g, ' ').slice(0, 420);
      return `Card ${i + 1}\nFront: What is the key idea of “${s.title}”?\nBack: ${answer || sentence}`;
    });
    return result(`${cards.length} flashcards generated locally.`, cards.join('\n\n'), 'notes-flashcards.txt');
  }

  function quiz(values) {
    const sections = parseItems(values.notes);
    const count = Math.min(50, Math.max(1, Math.round(clamp(values.count, 1, 50, 10))));
    if (!sections.length) return 'Add notes using headings or separate entries with ---.';
    const qs = [];
    sections.slice(0, count).forEach((s, i) => qs.push(`Question ${i + 1}: Explain the main point of “${s.title}”.\nEvidence to use: ${s.body.slice(0, 360)}`));
    return result(`${qs.length} grounded quiz prompts generated locally.`, qs.join('\n\n'), 'notes-quiz.txt');
  }

  function repetition(values) {
    const topics = unique(lines(values.topics).flatMap(x => x.split(/[,;]+/))).slice(0, 100);
    const start = dateOnly(values.startDate) || new Date();
    const intervals = [1, 3, 7, 14, 30, 60];
    if (!topics.length) return 'List at least one topic, one per line or separated by commas.';
    const detail = topics.map((topic, i) => `${i + 1}. ${topic}\n   ${intervals.map((n, j) => `Review ${j + 1}: ${iso(new Date(start.getTime() + n * 86400000))} (+${n}d)`).join(' · ')}`).join('\n');
    return result(`${topics.length} topics scheduled with six review intervals.`, detail, 'spaced-repetition-plan.txt', ['This is a simple interval plan, not a diagnosis of retention or a guarantee of learning.']);
  }

  function allocator(values) {
    const entries = lines(values.subjects).map(line => {
      const parts = line.split('|').map(clean);
      return {name: parts[0], weight: clamp(parts[1], 1, 100, 1), due: dateOnly(parts[2])};
    }).filter(x => x.name).slice(0, 100);
    const hours = clamp(values.hours, 0.25, 1000, 10);
    if (!entries.length) return 'Enter one subject per line as Subject | weight | YYYY-MM-DD.';
    const total = entries.reduce((a, x) => a + x.weight, 0);
    const detail = entries.map(x => `${x.name}: ${(hours * x.weight / total).toFixed(2)} hours (weight ${x.weight}${x.due ? `, due ${iso(x.due)}` : ''})`).join('\n');
    return result(`${hours.toFixed(2)} total hours allocated across ${entries.length} subjects by weight.`, detail, 'syllabus-time-allocation.txt', ['Deadline dates are reported for context; allocation is weighted only.']);
  }

  function readingQueue(values) {
    const entries = lines(values.readings).map((line, i) => {
      const [title, priority, pages] = line.split('|').map(clean);
      return `${i + 1}. ${title || `Reading ${i + 1}`} — priority ${titleCase(priority || 'normal')}${pages ? ` — ${pages} pages` : ''}\n   Annotation prompt: claim, evidence, question, and connection.`;
    }).slice(0, 100);
    if (!entries.length) return 'Enter readings one per line as Title | priority | pages.';
    return result(`${entries.length} reading entries organized locally.`, entries.join('\n\n'), 'academic-reading-queue.txt');
  }

  function pronunciation(values) {
    const phrase = clean(values.phrase, 1000);
    if (!phrase) return 'Enter a phrase to practice.';
    const rating = clamp(values.rating, 1, 5, 3);
    const speak = values.speak === true || values.speak === 'true';
    const details = [`Phrase: ${phrase}`, `Self-rating: ${rating}/5`, 'Checklist:', '1. Listen to or read a reliable model pronunciation.', '2. Mark stressed syllables and difficult sounds.', '3. Say the phrase slowly, then at natural speed.', '4. Record yourself only in a tool you trust and compare manually.', '5. Note one adjustment for the next attempt.'];
    if (speak) details.push('Optional browser action: if supported, use the device’s native speech synthesis for a model voice; no audio is captured or sent.');
    details.push('This tool does not hear, capture, transmit, or automatically score pronunciation.');
    return result('Text-based pronunciation practice checklist prepared locally.', details.join('\n'), 'pronunciation-practice-checklist.txt', ['No pronunciation score is generated.']);
  }

  function comprehension(values) {
    const passage = clean(values.passage);
    const count = Math.round(clamp(values.count, 1, 20, 6));
    if (!passage) return 'Paste a passage to generate grounded questions.';
    const sentences = passage.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 100);
    const prompts = ['What is the central claim or event in the passage?', 'Which detail best supports that claim?', 'What relationship between two ideas does the passage establish?', 'What can be inferred from the supplied text, and what evidence supports it?', 'Which word or phrase should be defined from context?'];
    const out = prompts.slice(0, count).map((q, i) => `${i + 1}. ${q}\n   Text anchor: ${sentences[i % Math.max(1, sentences.length)] || passage.slice(0, 240)}`);
    return result(`${out.length} comprehension prompts grounded in the supplied passage.`, out.join('\n\n'), 'reading-comprehension-questions.txt', ['Questions use only the supplied passage; verify interpretations manually.']);
  }

  function groups(values) {
    const people = unique(lines(values.people).flatMap(x => x.split(/[,;]+/))).slice(0, 200);
    const size = Math.round(clamp(values.groupSize, 2, 20, 4));
    if (!people.length) return 'Enter participant names, one per line.';
    const seed = Math.max(0, Math.floor(clamp(values.seed, 0, 2147483647, 1)));
    const arr = people.slice(); let state = seed || 1;
    for (let i = arr.length - 1; i > 0; i--) { state = (state * 1664525 + 1013904223) >>> 0; const j = state % (i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    const count = Math.ceil(arr.length / size); const buckets = Array.from({length: count}, () => []);
    arr.forEach((name, i) => buckets[i % count].push(name));
    return result(`${people.length} participants balanced into ${count} groups (seed ${seed}).`, buckets.map((g, i) => `Group ${i + 1} (${g.length})\n${g.map((n, j) => `  ${j + 1}. ${n}`).join('\n')}`).join('\n\n'), 'classroom-groups.txt');
  }

  function debate(values) {
    const motion = clean(values.motion, 500);
    if (!motion) return 'Enter a debate motion or question.';
    const pro = lines(values.pro).slice(0, 30); const con = lines(values.con).slice(0, 30);
    const render = (label, xs) => `${label}\n${(xs.length ? xs : ['Add an argument, evidence, or example.']).map((x, i) => `${i + 1}. Claim: ${x}\n   Evidence/source: __________________\n   Warrant: Why this supports the motion\n   Rebuttal to anticipate: __________________`).join('\n')}`;
    return result(`Debate argument map structured for: ${motion}`, `MOTION: ${motion}\n\n${render('FOR', pro)}\n\n${render('AGAINST', con)}\n\nCross-examination prompts\n1. What assumption does this argument rely on?\n2. What evidence would change the conclusion?`, 'debate-argument-map.txt');
  }

  function coverage(values) {
    const topics = unique(clean(values.topics).split(/[,;\n]+/)).slice(0, 200);
    const noteText = clean(values.notes).toLowerCase();
    if (!topics.length || !noteText) return 'Provide topic keywords and lecture notes.';
    const covered = [], missing = [];
    topics.forEach(t => (words(noteText).includes(t.toLowerCase()) || noteText.includes(t.toLowerCase()) ? covered : missing).push(t));
    return result(`${covered.length}/${topics.length} topic keywords found in the notes.`, `Covered\n${covered.length ? numbered(covered) : 'None'}\n\nMissing or not matched\n${missing.length ? numbered(missing) : 'None'}\n\nMatching is case-insensitive keyword matching; synonyms and meaning are not inferred.`, 'lecture-topic-coverage.txt', ['A keyword match does not prove complete understanding or accurate notes.']);
  }

  const definitions = [
    ['notes-to-flashcards-generator', 'Notes-to-Flashcards Generator', 'Turn headed or delimiter-separated notes into grounded question/answer cards.', [{id:'notes',label:'Notes',type:'textarea',required:true,placeholder:'Use headings or separate sections with ---.'}]],
    ['notes-to-quiz-generator', 'Notes-to-Quiz Generator', 'Create locally grounded quiz prompts from supplied notes.', [{id:'notes',label:'Notes',type:'textarea',required:true},{id:'count',label:'Question count',type:'number',min:1,max:50,step:1,default:10}]],
    ['spaced-repetition-study-planner', 'Spaced Repetition Study Planner', 'Schedule bounded review dates using a transparent interval sequence.', [{id:'topics',label:'Topics',type:'textarea',required:true,placeholder:'One topic per line'},{id:'startDate',label:'Start date',type:'date'}]],
    ['syllabus-study-time-allocator', 'Syllabus-Based Study Time Allocator', 'Allocate requested study hours across subjects by explicit weights and deadlines.', [{id:'subjects',label:'Subjects',type:'textarea',required:true,placeholder:'Subject | weight | YYYY-MM-DD'},{id:'hours',label:'Total hours',type:'number',min:.25,max:1000,step:.25,default:10}]],
    ['academic-reading-queue-annotation-organizer', 'Academic Reading Queue & Annotation Organizer', 'Organize reading entries and attach a repeatable annotation scaffold.', [{id:'readings',label:'Readings',type:'textarea',required:true,placeholder:'Title | priority | pages'}]],
    ['pronunciation-practice-feedback-coach', 'Pronunciation Practice Feedback Coach', 'Provide text-based pronunciation practice steps without capturing or scoring audio.', [{id:'phrase',label:'Phrase',type:'textarea',required:true},{id:'rating',label:'Self-rating',type:'number',min:1,max:5,step:1,default:3},{id:'speak',label:'Offer native speech synthesis option',type:'checkbox',default:false}]],
    ['reading-comprehension-question-maker', 'Reading Comprehension Question Maker', 'Generate prompts anchored to a supplied passage only.', [{id:'passage',label:'Passage',type:'textarea',required:true},{id:'count',label:'Question count',type:'number',min:1,max:20,step:1,default:6}]],
    ['classroom-group-randomizer-balancer', 'Classroom Group Randomizer & Balancer', 'Deterministically shuffle participants into balanced groups using a visible seed.', [{id:'people',label:'Participants',type:'textarea',required:true},{id:'groupSize',label:'People per group',type:'number',min:2,max:20,step:1,default:4},{id:'seed',label:'Seed',type:'number',min:0,max:2147483647,step:1,default:1}]],
    ['debate-argument-map-builder', 'Debate Argument Map Builder', 'Structure supplied pro and con arguments into a transparent debate map.', [{id:'motion',label:'Motion',type:'text',required:true},{id:'pro',label:'Arguments for',type:'textarea'},{id:'con',label:'Arguments against',type:'textarea'}]],
    ['lecture-notes-topic-coverage-checker', 'Lecture Notes Topic-Coverage Checker', 'Compare topic keywords against notes with explicit matched and missing lists.', [{id:'topics',label:'Topic keywords',type:'textarea',required:true},{id:'notes',label:'Lecture notes',type:'textarea',required:true}]]
  ];
  const handlers = {
    'notes-to-flashcards-generator': flashcards, 'notes-to-quiz-generator': quiz,
    'spaced-repetition-study-planner': repetition, 'syllabus-study-time-allocator': allocator,
    'academic-reading-queue-annotation-organizer': readingQueue, 'pronunciation-practice-feedback-coach': pronunciation,
    'reading-comprehension-question-maker': comprehension, 'classroom-group-randomizer-balancer': groups,
    'debate-argument-map-builder': debate, 'lecture-notes-topic-coverage-checker': coverage
  };
  definitions.forEach(([slug, title, description, fields]) => {
    window.AHPlannerTools.push({slug, title, categoryId: CATEGORY, description, limitations: 'Browser-local only. Inputs are not uploaded; review educational outputs before relying on them.', fields});
    window.AHPlannerHandlers[slug] = handlers[slug];
  });
})();
