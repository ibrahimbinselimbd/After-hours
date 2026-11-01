(() => {
  'use strict';

  window.AHPlannerTools ||= [];
  window.AHPlannerHandlers ||= {};

  const MAX = 12000;
  const text = (v, fallback = '') => String(v ?? fallback).trim().slice(0, MAX);
  const num = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const lines = v => text(v).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const result = (summary, details = [], warnings = []) => ({ summary, details, warnings });
  const list = (label, values) => `${label}:\n${values.length ? values.map(v => `- ${v}`).join('\n') : '- None supplied'}`;
  const safeSlug = s => text(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'planner-result';

  const systemFonts = {
    'humanist sans': 'Arial, Helvetica, sans-serif',
    'neutral sans': 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    'geometric sans': 'Century Gothic, Avenir Next, Avenir, sans-serif',
    'serif': 'Georgia, "Times New Roman", serif',
    'monospace': 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
  };

  const definitions = [
    {
      slug: 'font-pairing-type-scale-previewer', title: 'Font Pairing & Type-Scale Previewer', categoryId: 'image-design',
      description: 'Generate a bounded type scale, pairing rationale, and system-font fallback preview from your chosen base size and ratio.',
      limitations: 'Uses mathematical scale values and system-font recommendations only; it does not load fonts or render text metrics.',
      fields: [
        { id: 'headingFont', label: 'Heading font or style', type: 'text', placeholder: 'Geometric sans' },
        { id: 'bodyFont', label: 'Body font or style', type: 'text', placeholder: 'Serif' },
        { id: 'baseSize', label: 'Base size (px)', type: 'number', placeholder: '16' },
        { id: 'ratio', label: 'Scale ratio', type: 'number', placeholder: '1.25' }
      ]
    },
    {
      slug: 'color-vision-simulation-previewer', title: 'Color-Vision Simulation Previewer', categoryId: 'image-design',
      description: 'Calculate approximate color-vision simulation samples and contrast checks from entered hex colors.',
      limitations: 'Matrix previews are approximate sRGB calculations, not clinical or perceptual validation; contrast is a luminance estimate and does not replace user testing.',
      fields: [
        { id: 'colors', label: 'Hex colors (one per line)', type: 'textarea', placeholder: '#3366CC\n#F4B400' },
        { id: 'simulation', label: 'Simulation', type: 'select', options: ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'] },
        { id: 'background', label: 'Background hex', type: 'text', placeholder: '#FFFFFF' },
        { id: 'textColor', label: 'Text hex', type: 'text', placeholder: '#111111' }
      ]
    },
    {
      slug: 'alt-text-draft-quality-coach', title: 'Alt-Text Draft & Quality Coach', categoryId: 'image-design',
      description: 'Draft concise alt text only from the subject, action, and context you provide, then check common quality issues.',
      limitations: 'No image is inspected or understood. The draft is based solely on supplied text and must be verified against the actual image and its purpose.',
      fields: [
        { id: 'subject', label: 'Subject', type: 'text', placeholder: 'A cyclist' },
        { id: 'action', label: 'Action or state', type: 'text', placeholder: 'riding through a city street' },
        { id: 'context', label: 'Purpose or context', type: 'textarea', placeholder: 'Hero image for a story about commuting' },
        { id: 'mustInclude', label: 'Important supplied detail', type: 'text', placeholder: 'Red rain jacket' }
      ]
    },
    {
      slug: 'creator-gear-equipment-comparison-scorecard', title: 'Creator Gear/Equipment Comparison Scorecard', categoryId: 'data-spreadsheets',
      description: 'Compare up to three gear options with user-entered weighted ratings and produce a transparent scorecard.',
      limitations: 'Scores reflect only your ratings and weights; no prices, specifications, availability, or product claims are fetched.',
      fields: [
        { id: 'items', label: 'Gear names (one per line)', type: 'textarea', placeholder: 'Camera A\nCamera B\nCamera C' },
        { id: 'criteria', label: 'Criteria and weights (name=weight, one per line)', type: 'textarea', placeholder: 'Image quality=5\nWeight=3\nBattery=2' },
        { id: 'ratings', label: 'Ratings (item,criterion,1-5; one per line)', type: 'textarea', placeholder: 'Camera A,Image quality,4\nCamera A,Weight,3' },
        { id: 'notes', label: 'Decision notes', type: 'textarea', placeholder: 'Use for travel shoots...' }
      ]
    },
    {
      slug: 'print-bleed-safe-margin-previewer', title: 'Print Bleed & Safe-Margin Previewer', categoryId: 'image-design',
      description: 'Calculate document size, trim area, bleed extension, and safe content bounds in the same unit.',
      limitations: 'This is a geometric preflight aid only; printer marks, stock, color profiles, finishing, imposition, and vendor requirements are not validated.',
      fields: [
        { id: 'width', label: 'Trim width', type: 'number', placeholder: '210' },
        { id: 'height', label: 'Trim height', type: 'number', placeholder: '297' },
        { id: 'bleed', label: 'Bleed per edge', type: 'number', placeholder: '3' },
        { id: 'safeMargin', label: 'Safe margin per edge', type: 'number', placeholder: '5' }
      ]
    },
    {
      slug: 'livestream-chat-moderation-ruleset-designer', title: 'Livestream Chat Moderation Ruleset Designer', categoryId: 'video-tools',
      description: 'Turn supplied community rules and keyword lists into a readable allow/block/slow-mode moderation draft.',
      limitations: 'This produces documentation, not an active moderation bot. It cannot detect intent, context, evasion, or emergencies and needs human review.',
      fields: [
        { id: 'allowed', label: 'Allowed topics/phrases', type: 'textarea', placeholder: 'Questions, constructive critique' },
        { id: 'blocked', label: 'Block terms/patterns', type: 'textarea', placeholder: 'Slurs\nPersonal data requests' },
        { id: 'slowMode', label: 'Slow mode threshold (messages/min)', type: 'number', placeholder: '20' },
        { id: 'escalation', label: 'Escalation action', type: 'select', options: ['warn then timeout', 'timeout then human review', 'immediate human review'] }
      ]
    },
    {
      slug: 'brand-typography-consistency-auditor', title: 'Brand Typography Consistency Auditor', categoryId: 'image-design',
      description: 'Compare declared typography tokens with pasted usage lines and report undefined or inconsistent token use.',
      limitations: 'Text matching is case-insensitive and token-based; it does not inspect rendered CSS, screenshots, font files, or visual similarity.',
      fields: [
        { id: 'tokens', label: 'Declared tokens (name=value, one per line)', type: 'textarea', placeholder: 'body=16px/1.5 Inter\nh1=48px/1.1 Inter Bold' },
        { id: 'usage', label: 'Pasted usage (token:value, one per line)', type: 'textarea', placeholder: 'body:16px/1.5 Inter\nh1:48px/1.1 Inter Bold\ncaption:12px Arial' },
        { id: 'required', label: 'Required token names (one per line)', type: 'textarea', placeholder: 'body\nh1\ncaption' }
      ]
    },
    {
      slug: 'photo-video-shoot-call-sheet-builder', title: 'Photo/Video Shoot Call-Sheet Builder', categoryId: 'video-tools',
      description: 'Draft a concise call sheet from date, location, crew, schedule, contacts, and production notes.',
      limitations: 'No calendar, map, weather, permit, availability, or contact verification is performed; confirm all logistics independently.',
      fields: [
        { id: 'date', label: 'Shoot date', type: 'date' },
        { id: 'location', label: 'Location and access', type: 'textarea', placeholder: 'Studio 2; load-in via east door' },
        { id: 'crew', label: 'Crew and roles', type: 'textarea', placeholder: 'Alex — producer\nSam — camera' },
        { id: 'schedule', label: 'Schedule', type: 'textarea', placeholder: '08:00 call\n09:00 setup\n12:00 lunch\n17:00 wrap' }
      ]
    },
    {
      slug: 'accessible-text-layout-stress-test-previewer', title: 'Accessible Text Layout Stress-Test Previewer', categoryId: 'image-design',
      description: 'Check declared text layout settings against practical zoom, spacing, and reflow stress conditions.',
      limitations: 'This is a checklist and arithmetic preview, not a browser accessibility audit; it does not render, test assistive technology, or certify WCAG conformance.',
      fields: [
        { id: 'fontSize', label: 'Base font size (px)', type: 'number', placeholder: '16' },
        { id: 'lineHeight', label: 'Line height (unitless)', type: 'number', placeholder: '1.5' },
        { id: 'letterSpacing', label: 'Letter spacing (px)', type: 'number', placeholder: '0' },
        { id: 'zoom', label: 'Target zoom (%)', type: 'number', placeholder: '200' }
      ]
    },
    {
      slug: 'localization-screenshot-text-overflow-qa', title: 'Localization Screenshot Text-Overflow QA', categoryId: 'image-design',
      description: 'Approximate whether source and translated copy fit an entered width, line limit, and font size.',
      limitations: 'This does not use OCR or inspect a screenshot. It estimates character capacity using average glyph width, so verify in the actual design and target font.',
      fields: [
        { id: 'source', label: 'Source copy', type: 'textarea', placeholder: 'Start your free trial' },
        { id: 'translated', label: 'Translated copy', type: 'textarea', placeholder: 'Commencez votre essai gratuit' },
        { id: 'availableWidth', label: 'Available width (px)', type: 'number', placeholder: '240' },
        { id: 'maxLines', label: 'Maximum lines', type: 'number', placeholder: '2' }
      ]
    }
  ];

  const handlers = {
    'font-pairing-type-scale-previewer': v => {
      const base = clamp(num(v.baseSize, 16), 8, 128), ratio = clamp(num(v.ratio, 1.25), 1.01, 3);
      const heading = text(v.headingFont, 'Geometric sans'), body = text(v.bodyFont, 'Neutral sans');
      const headingFallback = systemFonts[heading.toLowerCase()] || 'system-ui, sans-serif';
      const bodyFallback = systemFonts[body.toLowerCase()] || 'system-ui, sans-serif';
      const names = ['xs', 'sm', 'body', 'lg', 'h3', 'h2', 'h1'];
      const values = names.map((name, i) => `${name}: ${(base * Math.pow(ratio, i - 2)).toFixed(2)}px`);
      return result('Type scale preview generated.', [`Heading: ${heading} → ${headingFallback}`, `Body: ${body} → ${bodyFallback}`, `Ratio: ${ratio}`, values.join('\n'), 'Pairing check: keep roles distinct in weight, size, or rhythm; confirm the actual fonts have the required glyph coverage.']);
    },

    'color-vision-simulation-previewer': v => {
      const matrices = {
        protanopia: [[0.567,0.433,0],[0.558,0.442,0],[0,0.242,0.758]], deuteranopia: [[0.625,0.375,0],[0.7,0.3,0],[0,0.3,0.7]], tritanopia: [[0.95,0.05,0],[0,0.433,0.567],[0,0.475,0.525]], achromatopsia: [[0.299,0.587,0.114],[0.299,0.587,0.114],[0.299,0.587,0.114]]
      };
      const type = matrices[text(v.simulation, 'deuteranopia')] ? text(v.simulation, 'deuteranopia') : 'deuteranopia';
      const hex = s => { const m = text(s).match(/^#?([0-9a-f]{6})$/i); return m ? [0,2,4].map(i => parseInt(m[1].slice(i,i+2),16)/255) : null; };
      const toHex = a => '#' + a.map(x => Math.round(clamp(x,0,1)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
      const rows = lines(v.colors).map(raw => { const rgb = hex(raw); if (!rgb) return `${raw} → invalid hex (skipped)`; const m = matrices[type]; return `${raw} → ${toHex([m[0][0]*rgb[0]+m[0][1]*rgb[1]+m[0][2]*rgb[2], m[1][0]*rgb[0]+m[1][1]*rgb[1]+m[1][2]*rgb[2], m[2][0]*rgb[0]+m[2][1]*rgb[1]+m[2][2]*rgb[2]])}`; });
      const luminance = s => { const a = hex(s); if (!a) return null; const c = a.map(x => x <= .03928 ? x/12.92 : Math.pow((x+.055)/1.055,2.4)); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
      const l1 = luminance(v.textColor), l2 = luminance(v.background); const contrast = l1 === null || l2 === null ? 'not calculated (enter valid hex values)' : `${((Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)).toFixed(2)}:1`;
      return result(`Approximate ${type} simulation calculated.`, [list('Converted samples', rows), `Entered text/background contrast estimate: ${contrast}`, 'Check meaning with shape, labels, patterns, and real users; do not rely on color alone.']);
    },

    'alt-text-draft-quality-coach': v => {
      const subject = text(v.subject), action = text(v.action), context = text(v.context), detail = text(v.mustInclude);
      const draft = [subject, action, detail].filter(Boolean).join(subject && action ? ' ' : '');
      const checks = []; if (!subject) checks.push('Add the main subject.'); if (!action) checks.push('Add the meaningful action or state, if relevant.'); if (!context) checks.push('Add intended context so decorative versus informative use can be decided.'); if (draft.length > 160) checks.push('Draft is over 160 characters; consider a shorter alt plus nearby long description.'); if (/image|photo|picture|graphic/i.test(draft)) checks.push('Avoid announcing “image/photo” unless that fact is important.');
      return result(`Draft alt text: ${draft || '[insufficient supplied details]'}`, [`Purpose supplied: ${context || '[none]'}`, `Quality checks: ${checks.length ? checks.join(' ') : 'No obvious checklist issues from the supplied text.'}`, 'Verify every word against the actual image; this tool did not inspect it.']);
    },

    'creator-gear-equipment-comparison-scorecard': v => {
      const items = lines(v.items).slice(0, 10), criteria = lines(v.criteria).map(x => { const [name, weight] = x.split('='); return { name: text(name), weight: clamp(num(weight,1),0,10) }; }).filter(x => x.name);
      const scores = {}; lines(v.ratings).forEach(row => { const p = row.split(',').map(x => x.trim()); if (p.length >= 3) (scores[p[0]] ||= {})[p[1]] = clamp(num(p[2]),0,5); });
      const totals = items.map(item => { const totalWeight = criteria.reduce((a,c)=>a+c.weight,0) || 1; const weighted = criteria.reduce((a,c)=>a+(scores[item]?.[c.name] ?? 0)*c.weight,0); return { item, score: weighted/totalWeight }; }).sort((a,b)=>b.score-a.score);
      return result('Weighted gear scorecard calculated from entered ratings.', [totals.length ? totals.map((r,i)=>`${i+1}. ${r.item}: ${r.score.toFixed(2)}/5`).join('\n') : 'Add gear names.', criteria.length ? list('Weights', criteria.map(c=>`${c.name} = ${c.weight}`)) : 'Add criteria and weights.', `Notes: ${text(v.notes, '[none]')}`, 'Missing ratings count as zero; review incomplete rows before making a purchase.']);
    },

    'print-bleed-safe-margin-previewer': v => { const w=clamp(num(v.width),0,100000), h=clamp(num(v.height),0,100000), b=clamp(num(v.bleed),0,1000), s=clamp(num(v.safeMargin),0,1000); return result('Print geometry calculated.', [`Trim: ${w} × ${h}`, `Document with bleed: ${w+2*b} × ${h+2*b}`, `Safe content box: ${Math.max(0,w-2*s)} × ${Math.max(0,h-2*s)}`, `Bleed extends ${b} per edge; keep critical content ${s} from trim edge.`, w <= 2*s || h <= 2*s ? 'Warning: safe margin consumes the entire trim dimension.' : 'Geometry is positive; confirm vendor specifications and units.']); },

    'livestream-chat-moderation-ruleset-designer': v => { const allowed=lines(v.allowed), blocked=lines(v.blocked), threshold=clamp(num(v.slowMode,20),1,100000), escalation=text(v.escalation,'warn then timeout'); return result('Draft livestream moderation ruleset.', ['ALLOW: '+(allowed.join('; ')||'topic-relevant discussion, accessibility requests, good-faith questions'), 'BLOCK / REMOVE: '+(blocked.join('; ')||'add prohibited terms and behavior patterns'), `SLOW MODE: enable above ${threshold} messages per minute; announce the reason and duration.`, `ESCALATION: ${escalation}. Log decisions and provide an appeal or human-review path.`, 'Never automate emergency, threats, self-harm, or nuanced harassment decisions without trained human review.']); },

    'brand-typography-consistency-auditor': v => { const declared={}; lines(v.tokens).forEach(x=>{const i=x.indexOf('='); if(i>0) declared[x.slice(0,i).trim().toLowerCase()]=x.slice(i+1).trim();}); const used=lines(v.usage).map(x=>{const i=x.indexOf(':'); return i>0?{name:x.slice(0,i).trim().toLowerCase(),value:x.slice(i+1).trim()}:null;}).filter(Boolean); const required=lines(v.required).map(x=>x.toLowerCase()); const issues=[]; used.forEach(u=>{if(!declared[u.name]) issues.push(`${u.name}: used but not declared`); else if(declared[u.name]!==u.value) issues.push(`${u.name}: declared “${declared[u.name]}” but used “${u.value}”`);}); required.forEach(k=>{if(!declared[k]) issues.push(`${k}: required but not declared`);}); return result(issues.length ? `${issues.length} typography consistency issue(s) found.` : 'No token mismatches found in the supplied lines.', [list('Declared tokens', Object.keys(declared).map(k=>`${k} = ${declared[k]}`)), list('Findings', issues), 'This compares pasted strings only; inspect computed styles and rendered samples separately.']); },

    'photo-video-shoot-call-sheet-builder': v => { const date=text(v.date,'[date not supplied]'); return result(`Call sheet draft — ${date}`, [`LOCATION / ACCESS\n${text(v.location,'[not supplied]')}`, `CREW\n${text(v.crew,'[not supplied]')}`, `SCHEDULE\n${text(v.schedule,'[not supplied]')}`, 'Confirm parking, permits, power, weather, releases, emergency contact, catering, backup plan, and equipment responsibility before distribution.']); },

    'accessible-text-layout-stress-test-previewer': v => { const fs=clamp(num(v.fontSize,16),1,200), lh=clamp(num(v.lineHeight,1.5),0.5,5), ls=num(v.letterSpacing,0), zoom=clamp(num(v.zoom,200),50,500); const checks=[]; if(lh<1.5) checks.push('Line height is below the common 1.5 body-text stress target.'); if(ls<0.12) checks.push('Letter spacing is below the common 0.12em stress target (relative check unavailable without a unit).'); if(zoom<200) checks.push('Test at 200% zoom or equivalent reflow scenario.'); if(fs<16) checks.push('Small base text may become difficult to read.'); return result('Accessible layout stress preview.', [`At ${zoom}% zoom, nominal text size is ${(fs*zoom/100).toFixed(1)}px; line box is ${(fs*lh*zoom/100).toFixed(1)}px.`, `Checks: ${checks.length ? checks.join(' ') : 'Declared settings pass these simple stress heuristics.'}`, 'Also test reflow, keyboard access, focus visibility, contrast, clipping, and actual content with assistive technology.']); },

    'localization-screenshot-text-overflow-qa': v => { const source=text(v.source), translated=text(v.translated), width=clamp(num(v.availableWidth,240),1,100000), maxLines=clamp(Math.floor(num(v.maxLines,2)),1,100); const font=num(v.fontSize,16)>0?num(v.fontSize,16):16; const capacity=Math.max(1,Math.floor(width/(font*.52))*maxLines); const estimate=s=>Math.ceil(s.length/Math.max(1,Math.floor(width/(font*.52)))); const sl=estimate(source), tl=estimate(translated); return result(tl>maxLines?'Approximate overflow risk detected.':'Approximate copy fit.', [`Source: ${source.length} characters, estimated ${sl} line(s).`, `Translated: ${translated.length} characters, estimated ${tl} line(s).`, `Approximate capacity: ${capacity} characters across ${maxLines} line(s) at ${font}px and ${width}px.`, tl>maxLines?'Shorten, widen, reduce size only if accessible, or allow wrapping.':'Still verify in the actual localized font and screenshot.', 'Approximation only: no OCR, screenshot reading, font loading, or browser rendering was performed.']); }
  };

  definitions.forEach(def => { if (!window.AHPlannerTools.some(x => x.slug === def.slug)) window.AHPlannerTools.push(def); window.AHPlannerHandlers[def.slug] = handlers[def.slug]; });
})();
