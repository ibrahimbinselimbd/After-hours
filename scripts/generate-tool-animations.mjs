import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'site/tools/_shared/tool-art');

function loadCategories() {
  const sandbox = { window: {}, document: { querySelector: () => null, querySelectorAll: () => [] }, console };
  vm.createContext(sandbox);
  for (const file of ['site/tools/_shared/planner-catalog-data.js', 'site/tools/_shared/new-tools-catalog-data.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  vm.runInContext(`${fs.readFileSync(path.join(root, 'site/tools/catalog.js'), 'utf8')}\n;globalThis.__categories = categories;`, sandbox, { filename: 'site/tools/catalog.js' });
  return sandbox.__categories;
}

const familyByCategory = {
  'pdf-documents': 'document', 'image-design': 'image', 'video-tools': 'video', 'audio-tools': 'audio',
  'web-seo': 'browser', 'developer-utilities': 'code', 'data-spreadsheets': 'grid', 'files-archives': 'files',
  'privacy-security': 'security', 'ai-everyday-utilities': 'assistant', 'money-shopping': 'finance',
  'wellbeing-fitness': 'wellness', 'travel-relocation': 'travel', 'home-household': 'home',
  'writing-language': 'writing', 'learning-study': 'learning', 'work-delivery': 'work',
  'food-kitchen': 'food', 'sustainable-living': 'sustainable', 'events-community': 'events'
};

const actionRules = [
  { key: 'merge', label: 'JOIN THE INPUTS', pattern: /\b(merge|join|combine|collage|assemble|consolidate|stitch|bundle|stack)\b/i },
  { key: 'split', label: 'SEPARATE THE PARTS', pattern: /\b(split|separate|divide|transpose|flatten|unflatten|channel splitter)\b/i },
  { key: 'convert', label: 'TRANSFORM THE FORMAT', pattern: /\b(convert|converter|encode|decoder|decoder|translate|formatter|formatting|serialize|deserialize|to\s+(?:json|yaml|html|markdown|pdf|jpg|png|csv|webp|wav|gif))\b/i },
  { key: 'optimize', label: 'TUNE THE OUTPUT', pattern: /\b(optim|compress|resize|upscal|reduce|shrink|coverage|clearance|break-even|efficiency|ratio)\w*\b/i },
  { key: 'calculate', label: 'COMPUTE A RESULT', pattern: /\b(calculat|calculator|estimate|compute|percentage|percent|ratio|quantity|volume|capacity|cost|budget|grade|age|duration|difference|coverage|hydration|salinity)\w*\b/i },
  { key: 'compare', label: 'COMPARE THE OPTIONS', pattern: /\b(compare|comparator|comparison|versus|vs\b|diff checker|difference|duel|breakdown|scorecard)\w*\b/i },
  { key: 'inspect', label: 'CHECK EACH DETAIL', pattern: /\b(check|checker|validate|validator|inspect|inspector|audit|auditor|verify|verifier|test|tester|review|analyz|analyzer|evaluate|evaluator|accessibility)\w*\b/i },
  { key: 'extract', label: 'READ THE SOURCE', pattern: /\b(extract|reader|read|ocr|recogniz|parse|parser|decode|detect|detector|lookup|inspect)\w*\b/i },
  { key: 'organize', label: 'ARRANGE THE ITEMS', pattern: /\b(organize|organizer|organiser|sort|sorter|arrange|reorder|renam|queue|sequence|matrix|index|outline)\w*\b/i },
  { key: 'remove', label: 'CLEAN THE SOURCE', pattern: /\b(remove|remover|clean|cleaner|strip|sanitize|redact|erase|deduplicat|repair|mask|blur|pixelate)\w*\b/i },
  { key: 'edit', label: 'ADJUST THE DETAILS', pattern: /\b(edit|editor|adjust|crop|rotate|flip|tune|style|refine|enhance|upscale|rewrite|replace)\w*\b/i },
  { key: 'plan', label: 'PLAN THE NEXT STEP', pattern: /\b(plan|planner|schedule|calendar|routine|itinerary|checklist|roadmap|workflow|agenda|session|portion|meal|trip)\w*\b/i },
  { key: 'track', label: 'FOLLOW THE PROGRESS', pattern: /\b(track|tracker|monitor|meter|timer|counter|queue|log|ledger|progress|readiness|capacity|buffer)\w*\b/i },
  { key: 'search', label: 'FIND THE MATCH', pattern: /\b(find|finder|search|matcher|match|locate|lookup|query|path tester|resolver)\w*\b/i },
  { key: 'create', label: 'BUILD A NEW RESULT', pattern: /\b(generate|generator|create|builder|build|maker|make|draft|writer|compose|design|randomiz|produce|prepare|render)\w*\b/i }
];

const actionOverrides = {
  'pdf-merger': 'merge', 'pdf-page-organizer': 'organize', 'pdf-compressor': 'optimize', 'pdf-ocr-searchable': 'extract',
  'pdf-to-images': 'convert', 'images-to-pdf': 'convert', 'pdf-page-numbering': 'edit', 'pdf-watermark': 'edit', 'pdf-fill-sign': 'edit',
  'qr-code-generator': 'create', 'qr-code-reader': 'extract', 'passport-photo-studio': 'edit',
  'image-size-optimizer': 'optimize', 'image-cropper': 'edit', 'image-rotate-flip': 'edit', 'image-upscaler': 'optimize',
  'video-to-gif': 'convert', 'animated-gif-optimizer': 'optimize', 'video-trimmer': 'edit', 'subtitle-merger': 'merge',
  'audio-joiner': 'merge', 'wav-trimmer': 'edit', 'silence-finder': 'search', 'waveform-cutter': 'edit',
  'color-palette-generator': 'create', 'color-contrast-checker': 'compare', 'meta-tag-generator': 'create',
  'robots-txt-generator': 'create', 'json-formatter': 'convert', 'text-code-diff': 'compare', 'json-diff': 'compare',
  'unit-converter': 'convert', 'time-zone-converter': 'convert', 'recipe-scaler': 'calculate',
  'date-add-subtract-planner': 'plan', 'date-difference-calculator': 'calculate', 'percentage-calculator': 'calculate',
  'tip-split-calculator': 'calculate', 'password-generator': 'create', 'file-hash': 'calculate',
  'qr-code-generator-and-print-checker': 'create', 'xlsx-sheet-extractor': 'extract'
};

const descriptionLeads = [
  [/^(merge|join|combine|assemble|stitch|bundle)\b/i, 'merge'],
  [/^(split|separate|divide|unbundle)\b/i, 'split'],
  [/^(convert|transform|encode|decode|translate|format|serialize|deserialize)\b/i, 'convert'],
  [/^(optimize|compress|resize|upscale|shrink|reduce)\b/i, 'optimize'],
  [/^(calculate|compute|estimate|count|total|sum)\b/i, 'calculate'],
  [/^(compare|contrast|diff|match)\b/i, 'compare'],
  [/^(check|validate|inspect|review|audit|verify|analyze|analyse|test|evaluate|detect)\b/i, 'inspect'],
  [/^(extract|read|recognize|recognise|parse|scan|ocr)\b/i, 'extract'],
  [/^(organize|organise|arrange|sort|reorder|flip|transpose|rename)\b/i, 'organize'],
  [/^(remove|trim|clean|strip|sanitize|redact|erase|deduplicate|repair|mask|blur|pixelate)\b/i, 'remove'],
  [/^(edit|adjust|crop|rotate|tune|refine|enhance|rewrite|replace)\b/i, 'edit'],
  [/^(plan|schedule|prepare|map)\b/i, 'plan'],
  [/^(track|monitor|measure|time|log)\b/i, 'track'],
  [/^(find|search|locate|look\s+up)\b/i, 'search'],
  [/^(create|generate|build|make|draft|write|compose|design|produce|render|randomize|randomise)\b/i, 'create']
];

function actionFor(slug, item) {
  const override = actionOverrides[slug];
  if (override) return override;
  const description = item.description.trim();
  const lead = descriptionLeads.find(([pattern]) => pattern.test(description));
  if (lead) return lead[1];
  const text = `${item.title} ${item.description}`;
  return actionRules.find(rule => rule.pattern.test(text))?.key || 'visualize';
}

function domainFor(slug, categoryId, item) {
  const text = `${slug} ${item.title} ${item.description}`.toLowerCase();
  if (/\b(qr|barcode)\b/.test(text)) return 'qr';
  if (/passport|visa photo|headshot|portrait/.test(text)) return 'portrait';
  if (/palette|contrast|color|colour|rgb|hex code/.test(text)) return 'color';
  if (/audio|waveform|sound|speech|subtitle|sample rate|noise meter|wav\b/.test(text)) return 'audio';
  if (/video|animated gif|\bgif\b|frame extractor|clip|film|webvtt|\bsrt\b/.test(text)) return 'video';
  if (/map|route|flight|airline|baggage|travel|relocation|time zone|timezone|packing/.test(text)) return 'travel';
  if (/json|yaml|xml|sql|regex|code|javascript|typescript|\bcss\b|\bhtml\b|graphql|api\b|git\b|docker|terraform|kubernetes|protobuf|openapi|asyncapi|cron|url |url\b|http header|schema|toml|ndjson|base64|jwt/.test(text)) return 'code';
  if (/budget|money|finance|price|cost|discount|coupon|cash|card fee|bill split|shopping|purchase|tax|currency|break-even|savings|receipt/.test(text)) return 'finance';
  if (/recipe|baking|cooking|ingredient|coffee|meal|portion|hydration|pan converter|brine|salinity|food|kitchen/.test(text)) return 'food';
  if (/fitness|wellbeing|workout|exercise|breathing|sleep|habit|health|bodyweight|water intake|mood|recovery/.test(text)) return 'wellness';
  if (/home|house|appliance|closet|bedding|room|acoustic panel|paint coverage|board foot|cleaning|household/.test(text)) return 'home';
  if (/community|event|attendance|announcement|book club|cleanup zone|survey|directory|conduct|meeting|capacity buffer/.test(text)) return 'events';
  if (/privacy|password|security|checksum|hash|redact|data broker|deletion request|secret|permission|access control/.test(text)) return 'security';
  if (/document|\bpdf\b|docx|epub|powerpoint|spreadsheet|invoice|contract|form|signature|page numbering/.test(text)) return 'document';
  if (/image|photo|picture|pixel|canvas|meme|favicon|svg\b/.test(text)) return 'image';
  return familyByCategory[categoryId] || 'work';
}

function hashOf(value) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
  return hash >>> 0;
}

function xml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function focusOf(item) {
  const skip = new Set(['a','an','and','the','to','for','with','from','into','local','online','tool','tools','free','browser','your','this','that','using','based','generator','builder','maker','checker','validator','inspector','calculator','planner','organizer','organiser','editor','converter','viewer','tester','analyzer','analyser','assistant','studio','system','utility','utilities','create','build','make','check','convert','compare','manage','track','generate','inspect','calculate','plan','tool']);
  const words = item.title.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter(word => word && !skip.has(word.toLowerCase()));
  const selected = words.slice(0, 3);
  return (selected.length ? selected : item.title.split(/\s+/).slice(0, 3)).join(' · ').toUpperCase();
}

function artifact(kind, x, y, scale, accent, seed, variant = 'source') {
  const t = `translate(${x} ${y}) scale(${scale})`;
  const wash = variant === 'output' ? '#152638' : '#101a26';
  const stroke = '#90a9bc';
  const dim = '#65798b';
  const bars = Array.from({ length: 9 }, (_, i) => 9 + ((seed >> (i % 16)) & 15) + ((i * 7 + seed) % 17));
  let body = '';
  switch (kind) {
    case 'document':
    case 'writing':
      body = `<path d="M28 14h62l22 22v86H28z" fill="${wash}" stroke="${stroke}" stroke-width="2"/><path d="M90 14v23h22" fill="none" stroke="${accent}" stroke-width="2"/><path d="M43 52h52M43 65h58M43 78h46M43 91h54M43 104h32" stroke="${dim}" stroke-width="4" stroke-linecap="round"/><path d="M43 37h30" stroke="${accent}" stroke-width="5" stroke-linecap="round"/><rect x="78" y="101" width="33" height="20" rx="6" fill="${accent}" opacity=".9"/><text x="94" y="115" text-anchor="middle" font-size="9" fill="#101820" font-family="monospace">${variant === 'output' ? 'DONE' : 'EDIT'}</text>`;
      break;
    case 'image':
    case 'portrait':
      body = `<rect x="17" y="20" width="104" height="84" rx="12" fill="${wash}" stroke="${stroke}" stroke-width="2"/><circle cx="91" cy="42" r="11" fill="${accent}" opacity=".9"/><path d="M23 94l28-30 17 17 17-23 31 36" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 14h20M11 14v20M127 14h-20M127 14v20M11 110h20M11 110V90M127 110h-20M127 110V90" stroke="${accent}" stroke-width="2" opacity=".9"/>${kind === 'portrait' ? `<circle cx="69" cy="51" r="15" fill="#e8c6a7"/><path d="M43 91c2-18 11-26 26-26s24 8 26 26" fill="#866fb4"/>` : ''}`;
      break;
    case 'video':
      body = `<rect x="13" y="22" width="112" height="74" rx="10" fill="${wash}" stroke="${stroke}" stroke-width="2"/>${[0,1,2].map(i=>`<rect x="${22+i*33}" y="31" width="26" height="54" rx="4" fill="#1d2b39" stroke="${dim}"/><path d="M${26+i*33} 76l9-14 8 9 5-8v18H26z" fill="${accent}" opacity=".72"/>`).join('')}<path d="M18 110h102" stroke="${dim}" stroke-width="4" stroke-linecap="round"/><path d="M${28+(seed%60)} 104v13" stroke="${accent}" stroke-width="3" stroke-linecap="round"/><circle cx="${28+(seed%60)}" cy="110" r="5" fill="${accent}"/>`;
      break;
    case 'audio':
      body = `<rect x="12" y="24" width="116" height="76" rx="12" fill="${wash}" stroke="${stroke}" stroke-width="2"/><path d="M20 63h15l7-15 8 34 9-49 9 58 9-44 8 25 8-16 7 8h20" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 112h100" stroke="${dim}" stroke-width="4" stroke-linecap="round"/><circle cx="${35+(seed%55)}" cy="112" r="6" fill="${accent}"/>`;
      break;
    case 'code':
    case 'browser':
      body = `<rect x="12" y="20" width="116" height="92" rx="10" fill="${wash}" stroke="${stroke}" stroke-width="2"/><path d="M13 39h114" stroke="${dim}"/><circle cx="24" cy="30" r="3" fill="#f08e8e"/><circle cx="35" cy="30" r="3" fill="#e5c374"/><circle cx="46" cy="30" r="3" fill="${accent}"/>${[0,1,2,3].map(i=>`<rect x="${24+(i%2)*15}" y="${51+i*13}" width="${36+(seed+i*13)%45}" height="4" rx="2" fill="${i===1?accent:dim}" opacity="${i===1?'.9':'.72'}"/>`).join('')}<path d="M95 59l9 8-9 8" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
      break;
    case 'grid':
      body = `<rect x="13" y="20" width="114" height="92" rx="10" fill="${wash}" stroke="${stroke}" stroke-width="2"/><path d="M13 41h114M13 61h114M13 81h114M13 101h114M42 41v70M72 41v70M99 41v70" stroke="${dim}" stroke-width="1.5"/><rect x="43" y="62" width="28" height="18" fill="${accent}" opacity=".65"/><path d="M82 96v-8h7v8m4 0V75h7v21m4 0V65h7v31" fill="${accent}" stroke="${accent}" stroke-width="2"/>`;
      break;
    case 'files':
      body = `<path d="M13 42h44l11 12h57v53H13z" fill="${wash}" stroke="${stroke}" stroke-width="2"/><path d="M13 56h112" stroke="${dim}" stroke-width="2"/><rect x="30" y="27" width="53" height="67" rx="7" fill="#182431" stroke="${accent}" stroke-width="2"/><path d="M42 46h29M42 57h25M42 68h30" stroke="${dim}" stroke-width="3" stroke-linecap="round"/><rect x="87" y="69" width="26" height="30" rx="5" fill="${accent}" opacity=".8"/>`;
      break;
    case 'security':
      body = `<path d="M70 15l44 16v34c0 29-18 47-44 57C44 112 26 94 26 65V31z" fill="${wash}" stroke="${accent}" stroke-width="3"/><rect x="51" y="59" width="38" height="29" rx="7" fill="#1d2c3a" stroke="${stroke}" stroke-width="2"/><path d="M59 59v-9a11 11 0 0122 0v9" fill="none" stroke="${stroke}" stroke-width="4"/><circle cx="70" cy="72" r="4" fill="${accent}"/><path d="M70 76v6" stroke="${accent}" stroke-width="3"/>`;
      break;
    case 'assistant':
      body = `<rect x="18" y="24" width="105" height="75" rx="14" fill="${wash}" stroke="${stroke}" stroke-width="2"/><path d="M44 99l-9 15 30-15" fill="${wash}" stroke="${stroke}" stroke-width="2"/><path d="M36 47h67M36 61h50M36 75h59" stroke="${dim}" stroke-width="4" stroke-linecap="round"/><path d="M104 18l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="${accent}"/>`;
      break;
    case 'finance':
      body = `<rect x="22" y="14" width="78" height="109" rx="9" fill="${wash}" stroke="${stroke}" stroke-width="2"/><path d="M37 38h48M37 52h37M37 69h48M37 84h33" stroke="${dim}" stroke-width="4" stroke-linecap="round"/><path d="M36 100h49" stroke="${accent}" stroke-width="4" stroke-dasharray="5 4"/><circle cx="105" cy="86" r="20" fill="#1d2b39" stroke="${accent}" stroke-width="3"/><text x="105" y="92" text-anchor="middle" font-size="19" fill="${accent}" font-family="sans-serif">$</text>`;
      break;
    case 'wellness':
      body = `<circle cx="70" cy="68" r="47" fill="${wash}" stroke="${stroke}" stroke-width="2"/><path d="M21 69h19l8-16 12 34 11-48 12 54 9-26 8 11h21" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M70 40c-15-18-39 3 0 30 39-27 15-48 0-30z" fill="none" stroke="${accent}" stroke-width="2" opacity=".6"/>`;
      break;
    case 'travel':
      body = `<path d="M17 37l30-14 32 12 32-14v72l-32 15-32-13-30 13z" fill="${wash}" stroke="${stroke}" stroke-width="2"/><path d="M47 23v72M79 35v73" stroke="${dim}" stroke-width="2"/><path d="M29 78c14-25 28 8 42-17s20 18 31-6" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-dasharray="5 4"/><path d="M101 47c0-13 20-13 20 0 0 9-10 19-10 19s-10-10-10-19z" fill="${accent}"/><circle cx="111" cy="47" r="3" fill="#101820"/>`;
      break;
    case 'home':
      body = `<path d="M17 62L70 18l53 44" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M29 57v54h82V57" fill="${wash}" stroke="${stroke}" stroke-width="2"/><rect x="61" y="77" width="20" height="34" rx="3" fill="#1d2b39" stroke="${dim}"/><rect x="40" y="72" width="13" height="14" rx="2" fill="${accent}" opacity=".72"/><rect x="91" y="72" width="13" height="14" rx="2" fill="${accent}" opacity=".72"/>`;
      break;
    case 'learning':
      body = `<path d="M14 36c22-8 39-3 56 9 17-12 34-17 56-9v67c-22-8-39-3-56 9-17-12-34-17-56-9z" fill="${wash}" stroke="${stroke}" stroke-width="2"/><path d="M70 45v67M27 53h28M27 66h28M84 53h28M84 66h28M27 79h24M84 79h24" stroke="${dim}" stroke-width="3" stroke-linecap="round"/><path d="M88 93h20" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>`;
      break;
    case 'work':
      body = `<rect x="14" y="23" width="112" height="89" rx="10" fill="${wash}" stroke="${stroke}" stroke-width="2"/>${[0,1,2].map(i=>`<rect x="${23+i*34}" y="37" width="27" height="9" rx="4" fill="${accent}" opacity="${i===1?'.9':'.48'}"/><rect x="${23+i*34}" y="53" width="27" height="20" rx="4" fill="#1b2936" stroke="${dim}"/><rect x="${23+i*34}" y="78" width="27" height="20" rx="4" fill="#1b2936" stroke="${dim}"/>`).join('')}`;
      break;
    case 'food':
      body = `<path d="M24 63h92c-4 31-23 48-46 48S28 94 24 63z" fill="${wash}" stroke="${stroke}" stroke-width="2"/><path d="M16 60h108" stroke="${accent}" stroke-width="4" stroke-linecap="round"/><circle cx="55" cy="51" r="9" fill="#ec9f84"/><circle cx="80" cy="45" r="8" fill="${accent}"/><circle cx="98" cy="54" r="7" fill="#8cc9a5"/><path d="M70 22v15M62 29h16" stroke="${dim}" stroke-width="3" stroke-linecap="round"/>`;
      break;
    case 'sustainable':
      body = `<path d="M39 94c-1-44 26-70 74-70 0 43-24 71-74 70z" fill="${wash}" stroke="${accent}" stroke-width="3"/><path d="M31 108c22-31 40-43 69-64" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/><path d="M55 82l-1-23M72 69l18 1" stroke="${dim}" stroke-width="3" stroke-linecap="round"/><circle cx="31" cy="99" r="9" fill="${accent}" opacity=".75"/>`;
      break;
    case 'events':
      body = `<rect x="19" y="25" width="102" height="93" rx="10" fill="${wash}" stroke="${stroke}" stroke-width="2"/><path d="M19 49h102" stroke="${accent}" stroke-width="4"/><path d="M40 16v19M100 16v19" stroke="${stroke}" stroke-width="5" stroke-linecap="round"/>${[0,1,2,3,4,5].map(i=>`<rect x="${34+(i%3)*25}" y="${60+Math.floor(i/3)*23}" width="11" height="11" rx="3" fill="${i===(seed%6)?accent:dim}" opacity=".85"/>`).join('')}`;
      break;
    case 'color':
      body = `<rect x="16" y="24" width="108" height="85" rx="13" fill="${wash}" stroke="${stroke}" stroke-width="2"/><path d="M35 24v85M54 24v85M73 24v85M92 24v85" stroke="#0b1119" stroke-width="2"/><path d="M16 52h108M16 80h108" stroke="#0b1119" stroke-width="2"/><rect x="75" y="53" width="17" height="26" rx="3" fill="${accent}"/><text x="70" y="128" text-anchor="middle" font-size="9" fill="${dim}" font-family="monospace">#${(seed.toString(16)+'abcdef').slice(0,6).toUpperCase()}</text>`;
      break;
    case 'qr': {
      const cells = [];
      for (let row = 0; row < 15; row++) for (let col = 0; col < 15; col++) {
        const finder = (row < 5 && col < 5) || (row < 5 && col > 9) || (row > 9 && col < 5);
        const on = finder ? row === 0 || row === 4 || col === 0 || col === 4 || (row >= 2 && row <= 2 && col >= 2 && col <= 2) : ((hashOf(`${seed}-${row}-${col}`) % 3) !== 0);
        if (on) cells.push(`<rect x="${27+col*6}" y="${18+row*6}" width="4.5" height="4.5" rx=".7" fill="${variant === 'output' ? accent : '#dce8ef'}"/>`);
      }
      body = `<rect x="15" y="12" width="112" height="112" rx="10" fill="${wash}" stroke="${stroke}" stroke-width="2"/>${cells.join('')}`;
      break;
    }
    default:
      body = `<rect x="16" y="22" width="108" height="88" rx="12" fill="${wash}" stroke="${stroke}" stroke-width="2"/><path d="M31 46h78M31 62h${48+(seed%28)}M31 78h${36+(seed%37)}M31 94h${44+(seed%30)}" stroke="${accent}" stroke-width="4" stroke-linecap="round" opacity=".8"/>`;
  }
  return `<g transform="${t}">${body}</g>`;
}

function centerAction(action, accent, seed, focus) {
  const x = 254, y = 132;
  const box = `<rect x="${x}" y="${y}" width="132" height="133" rx="17" fill="#0d141e" stroke="#607488" stroke-opacity=".55"/>`;
  const label = `<text x="320" y="158" text-anchor="middle" fill="#91a3b5" font-size="9" font-family="monospace" letter-spacing="1.1">${xml(action.toUpperCase())}</text>`;
  const short = xml(focus.split(' · ').slice(0, 2).join(' / '));
  const focusLabel = `<text x="320" y="251" text-anchor="middle" fill="${accent}" font-size="8" font-family="monospace" letter-spacing=".4">${short.slice(0, 25)}</text>`;
  let detail = '';
  let moving = '';
  switch (action) {
    case 'merge':
      detail = `<rect x="277" y="176" width="31" height="39" rx="5" fill="#1c2b38" stroke="${accent}"/><rect x="287" y="168" width="31" height="39" rx="5" fill="#1c2b38" stroke="#8ba0b2"/><path d="M300 225h40m-9-8 9 8-9 8" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="343" y="178" width="25" height="42" rx="5" fill="${accent}" opacity=".8"/>`;
      moving = `<g class="motion" transform-box="fill-box" transform-origin="center"><path d="M293 229h30m-8-7 8 7-8 7" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
      break;
    case 'split':
      detail = `<rect x="277" y="175" width="46" height="51" rx="7" fill="#1a2835" stroke="${accent}"/><path d="M286 187h26M286 198h26M286 209h18" stroke="#91a3b5" stroke-width="3" stroke-linecap="round"/><path d="M325 201h15m-6-7 7 7-7 7" fill="none" stroke="${accent}" stroke-width="3"/><rect x="345" y="175" width="24" height="23" rx="5" fill="#1a2835" stroke="#7c91a4"/><rect x="345" y="204" width="24" height="23" rx="5" fill="#1a2835" stroke="#7c91a4"/>`;
      moving = `<g class="motion"><circle cx="336" cy="201" r="5" fill="${accent}"/></g>`;
      break;
    case 'convert':
      detail = `<rect x="274" y="180" width="42" height="42" rx="10" fill="#1a2835" stroke="${accent}"/><text x="295" y="207" text-anchor="middle" font-size="11" fill="#d9e5ec" font-family="monospace">IN</text><path d="M318 201h23m-8-8 8 8-8 8" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="345" y="180" width="25" height="42" rx="7" fill="${accent}" opacity=".85"/><text x="357" y="207" text-anchor="middle" font-size="8" fill="#101820" font-family="monospace">OUT</text>`;
      moving = `<g class="motion"><path d="M319 201h16" stroke="#e7f1f7" stroke-width="2" stroke-linecap="round"/></g>`;
      break;
    case 'calculate':
      detail = `<rect x="274" y="174" width="92" height="56" rx="10" fill="#172532" stroke="#607488"/><text x="287" y="193" fill="#a6b8c6" font-size="10" font-family="monospace">${3+(seed%9)} × ${2+(seed%7)}</text><text x="287" y="215" fill="${accent}" font-size="16" font-family="monospace">= ${10+(seed%78)}</text>`;
      moving = `<g class="motion"><rect x="350" y="184" width="7" height="7" rx="2" fill="${accent}" opacity=".8"/></g>`;
      break;
    case 'compare':
      detail = `<rect x="274" y="178" width="39" height="48" rx="7" fill="#172532" stroke="#607488"/><rect x="327" y="178" width="39" height="48" rx="7" fill="#172532" stroke="${accent}"/><path d="M283 191h20M283 201h15M336 191h20M336 201h11" stroke="#91a3b5" stroke-width="3" stroke-linecap="round"/><path d="M286 215h11M337 215h19" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>`;
      moving = `<g class="motion"><circle cx="347" cy="214" r="7" fill="${accent}" opacity=".22"/></g>`;
      break;
    case 'inspect':
      detail = `<rect x="277" y="174" width="86" height="54" rx="8" fill="#172532" stroke="#607488"/><path d="M288 188h35M288 200h42M288 212h28" stroke="#73899b" stroke-width="3" stroke-linecap="round"/><circle cx="349" cy="188" r="5" fill="${accent}"/><path d="M345 188l3 3 6-7" fill="none" stroke="#0b1119" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      moving = `<g class="motion"><path d="M278 185h83" stroke="${accent}" stroke-width="2" opacity=".55"/></g>`;
      break;
    case 'extract':
      detail = `<rect x="276" y="174" width="38" height="55" rx="7" fill="#172532" stroke="#607488"/><path d="M284 187h20M284 197h18M284 207h21M284 217h14" stroke="#91a3b5" stroke-width="3" stroke-linecap="round"/><path d="M316 201h18m-7-7 7 7-7 7" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="339" y="178" width="29" height="11" rx="4" fill="${accent}" opacity=".9"/><rect x="339" y="196" width="24" height="8" rx="4" fill="#607488"/><rect x="339" y="211" width="31" height="8" rx="4" fill="#607488"/>`;
      moving = `<g class="motion"><rect x="338" y="193" width="32" height="3" rx="1.5" fill="${accent}"/></g>`;
      break;
    case 'optimize':
      detail = `<text x="281" y="183" fill="#91a3b5" font-size="8" font-family="monospace">BEFORE</text><rect x="281" y="190" width="75" height="10" rx="5" fill="#253443"/><text x="281" y="215" fill="${accent}" font-size="8" font-family="monospace">AFTER</text><rect x="281" y="221" width="${42+(seed%28)}" height="7" rx="4" fill="${accent}"/>`;
      moving = `<g class="motion" transform-box="fill-box" transform-origin="left"><rect x="281" y="190" width="75" height="10" rx="5" fill="${accent}" opacity=".28"/></g>`;
      break;
    case 'organize':
      detail = [0,1,2].map(i=>`<rect x="${276+(i*27)}" y="${187+((i+1)%3)*9}" width="23" height="32" rx="6" fill="#172532" stroke="${i===seed%3?accent:'#607488'}"/><text x="${287+(i*27)}" y="${207+((i+1)%3)*9}" text-anchor="middle" fill="#dce7ed" font-size="9" font-family="monospace">${((i+seed)%3)+1}</text>`).join('');
      moving = `<g class="motion"><path d="M278 225h72m-8-6 8 6-8 6" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
      break;
    case 'remove':
      detail = `<rect x="276" y="179" width="88" height="44" rx="8" fill="#172532" stroke="#607488"/><path d="M287 193h63M287 204h48" stroke="#91a3b5" stroke-width="3" stroke-linecap="round"/><path d="M295 181v40" stroke="${accent}" stroke-width="6" opacity=".78"/>`;
      moving = `<g class="motion"><path d="M295 180v40" stroke="#e6f1f5" stroke-width="2" opacity=".75"/></g>`;
      break;
    case 'edit':
      detail = `<rect x="276" y="175" width="88" height="54" rx="8" fill="#172532" stroke="#607488"/>${[0,1,2].map(i=>`<path d="M286 ${190+i*13}h64" stroke="#52687a" stroke-width="3" stroke-linecap="round"/><circle cx="${302+((seed+i*17)%45)}" cy="${190+i*13}" r="5" fill="${i===1?accent:'#b2c3cf'}"/>`).join('')}`;
      moving = `<g class="motion"><circle cx="${302+((seed+17)%45)}" cy="203" r="8" fill="${accent}" opacity=".24"/></g>`;
      break;
    case 'plan':
      detail = `<rect x="278" y="174" width="84" height="56" rx="8" fill="#172532" stroke="#607488"/><path d="M278 188h84M296 174v14M344 174v14" stroke="#8297a8" stroke-width="2"/>${[0,1,2,3,4,5].map(i=>`<rect x="${287+(i%3)*22}" y="${195+Math.floor(i/3)*17}" width="12" height="10" rx="3" fill="${i===seed%6?accent:'#304253'}"/>`).join('')}`;
      moving = `<g class="motion"><rect x="${287+(seed%3)*22}" y="${195+Math.floor(seed%6/3)*17}" width="12" height="10" rx="3" fill="#e7f1f5" opacity=".4"/></g>`;
      break;
    case 'track':
      detail = `<path d="M280 214h79" stroke="#384b5c" stroke-width="5" stroke-linecap="round"/><path d="M280 214h${30+(seed%42)}" stroke="${accent}" stroke-width="5" stroke-linecap="round"/>${[0,1,2,3].map(i=>`<circle cx="${281+i*25}" cy="214" r="${i===seed%4?7:4}" fill="${i<=seed%4?accent:'#526779'}"/>`).join('')}<text x="320" y="189" text-anchor="middle" fill="#dce7ed" font-size="12" font-family="monospace">${24+(seed%74)}%</text>`;
      moving = `<g class="motion"><circle cx="${281+(seed%4)*25}" cy="214" r="9" fill="${accent}" opacity=".2"/></g>`;
      break;
    case 'search':
      detail = `<rect x="274" y="178" width="92" height="20" rx="10" fill="#172532" stroke="#607488"/><circle cx="288" cy="188" r="5" fill="none" stroke="${accent}" stroke-width="2"/><path d="M292 192l5 5" stroke="${accent}" stroke-width="2"/><rect x="280" y="207" width="66" height="7" rx="3" fill="#5a6f80"/><rect x="280" y="219" width="48" height="6" rx="3" fill="#354a5b"/>`;
      moving = `<g class="motion"><circle cx="344" cy="211" r="13" fill="none" stroke="${accent}" stroke-width="2.5"/><path d="M353 220l8 8" stroke="${accent}" stroke-width="3" stroke-linecap="round"/></g>`;
      break;
    case 'create':
      detail = `<rect x="282" y="185" width="75" height="40" rx="9" fill="#172532" stroke="${accent}"/><path d="M298 205h42M319 194v22" stroke="${accent}" stroke-width="3" stroke-linecap="round"/><circle cx="287" cy="177" r="4" fill="#8ca4b7"/><circle cx="353" cy="174" r="4" fill="${accent}"/><circle cx="363" cy="214" r="3" fill="#8ca4b7"/><path d="M287 177l17 14M353 174l-15 16M363 214l-12-5" stroke="#6b8193" stroke-width="1.5" stroke-dasharray="3 4"/>`;
      moving = `<g class="motion"><circle cx="319" cy="205" r="18" fill="${accent}" opacity=".16"/></g>`;
      break;
    default:
      detail = `<circle cx="320" cy="202" r="30" fill="#172532" stroke="${accent}" stroke-width="2"/><path d="M302 202h36m-10-10 10 10-10 10" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="320" y="241" text-anchor="middle" fill="#8ca0b2" font-size="8" font-family="monospace">LIVE RESULT</text>`;
      moving = `<g class="motion"><circle cx="320" cy="202" r="23" fill="none" stroke="${accent}" stroke-width="2" opacity=".55"/></g>`;
  }
  return `${box}${label}${detail}${moving}${focusLabel}`;
}

function animationFor(action, slug, seed) {
  const name = `motion-${seed.toString(36)}`;
  const frames = {
    merge: '0%,100%{transform:translateX(-3px)}50%{transform:translateX(5px)}',
    split: '0%,100%{transform:translateX(0)}50%{transform:translateX(5px)}',
    convert: '0%,100%{transform:translateX(-2px)}50%{transform:translateX(3px)}',
    calculate: '0%,100%{transform:scale(1)}50%{transform:scale(1.07)}',
    compare: '0%,100%{opacity:.3}50%{opacity:.85}',
    inspect: '0%,100%{transform:translateY(-8px);opacity:.25}50%{transform:translateY(20px);opacity:.8}',
    extract: '0%,100%{transform:translateY(1px)}50%{transform:translateY(-5px)}',
    optimize: '0%,100%{transform:scaleX(1)}50%{transform:scaleX(.82)}',
    organize: '0%,100%{transform:translateX(-3px)}50%{transform:translateX(4px)}',
    remove: '0%,100%{transform:translateX(-15px);opacity:.35}50%{transform:translateX(18px);opacity:.8}',
    edit: '0%,100%{transform:translateX(-4px)}50%{transform:translateX(4px)}',
    plan: '0%,100%{opacity:.35}50%{opacity:.95}',
    track: '0%,100%{transform:scale(1)}50%{transform:scale(1.18)}',
    search: '0%,100%{transform:translate(3px,2px)}50%{transform:translate(-4px,-3px)}',
    create: '0%,100%{transform:translateY(4px);opacity:.35}50%{transform:translateY(-4px);opacity:.9}',
    visualize: '0%,100%{transform:translateY(2px)}50%{transform:translateY(-3px)}'
  }[action] || '0%,100%{transform:translateY(2px)}50%{transform:translateY(-3px)}';
  const duration = (3.6 + (seed % 17) / 10).toFixed(1);
  return `<style>@keyframes ${name}{${frames}}.motion{animation:${name} ${duration}s ease-in-out infinite;transform-box:fill-box;transform-origin:center;will-change:transform,opacity}@media(prefers-reduced-motion:reduce){.motion{animation:none!important;will-change:auto}}</style>`;
}

function buildSvg(category, item) {
  const slug = item.href.split('/').filter(Boolean).pop();
  const seed = hashOf(slug);
  const family = domainFor(slug, category.id, item);
  const action = actionFor(slug, item);
  const accent = /^#[\da-f]{6}$/i.test(category.accent_color || '') ? category.accent_color : '#d3fb56';
  const focus = focusOf(item);
  const titleLine = Array.from(item.title).length > 48 ? `${Array.from(item.title).slice(0, 45).join('')}…` : item.title;
  const animName = `motion-${seed.toString(36)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-labelledby="title desc" data-tool="${xml(slug)}" data-scene="${xml(family)}-${xml(action)}">
<title id="title">${xml(item.title)} — animated tool preview</title><desc id="desc">A function-specific ${xml(family)} scene for ${xml(item.title)}. ${xml(item.description)}</desc>
<defs><linearGradient id="bg-${animName}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#101a26"/><stop offset="1" stop-color="#080d14"/></linearGradient><radialGradient id="glow-${animName}" cx="82%" cy="14%" r="78%"><stop stop-color="${accent}" stop-opacity=".18"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>
${animationFor(action, slug, seed)}
<rect width="640" height="360" rx="24" fill="url(#bg-${animName})"/><rect width="640" height="360" rx="24" fill="url(#glow-${animName})"/>
<path d="M0 54h640" stroke="#e1edf3" stroke-opacity=".1"/><circle cx="25" cy="27" r="4" fill="#e8858a"/><circle cx="40" cy="27" r="4" fill="#e4c16c"/><circle cx="55" cy="27" r="4" fill="${accent}"/>
<text x="76" y="31" fill="#8298aa" font-size="10" font-family="monospace" letter-spacing="1.4">${xml(category.title.toUpperCase())} / TOOL PREVIEW</text>
<text x="27" y="84" fill="#f0f4f8" font-size="${Array.from(titleLine).length > 35 ? 16 : 19}" font-family="Arial,sans-serif" font-weight="700">${xml(titleLine)}</text>
<text x="29" y="103" fill="${accent}" font-size="9" font-family="monospace" letter-spacing="1.1">${xml(action.toUpperCase())} · ${xml(focus.slice(0, 28))}</text>
<rect x="20" y="119" width="184" height="153" rx="16" fill="#0d151f" stroke="#718597" stroke-opacity=".38"/><text x="34" y="141" fill="#91a5b6" font-size="9" font-family="monospace" letter-spacing="1.1">${xml(focus.split(' · ').slice(0,2).join(' / ').slice(0,21))}</text>
${artifact(family, 39, 148, .98, accent, seed, 'source')}
${centerAction(action, accent, seed, focus)}
<rect x="436" y="119" width="184" height="153" rx="16" fill="#0d151f" stroke="${accent}" stroke-opacity=".46"/><text x="450" y="141" fill="${accent}" font-size="9" font-family="monospace" letter-spacing="1.1">${action === 'compare' ? 'DIFFERENCE' : action === 'inspect' ? 'CHECK RESULT' : 'OUTPUT / RESULT'}</text>
${artifact(family, 455, 148, .98, accent, seed ^ 0x9e3779b9, 'output')}
<path d="M28 293h584" stroke="#dce7ed" stroke-opacity=".12"/><text x="29" y="318" fill="#a9bac8" font-size="10" font-family="monospace" letter-spacing="1.2">TOOL FUNCTION FLOW</text>
<rect x="475" y="298" width="135" height="28" rx="14" fill="#172431" stroke="${accent}" stroke-opacity=".55"/><circle cx="491" cy="312" r="4" fill="${accent}"/><text x="503" y="316" fill="#d7e3eb" font-size="9" font-family="monospace" letter-spacing=".7">${xml(action.toUpperCase())}</text>
</svg>`;
}

const categories = loadCategories();
const tools = categories.flatMap(category => category.availableTools.map(item => ({ category, item })));
if (categories.length !== 20 || tools.length !== 500) throw new Error(`Expected 20 categories / 500 tools, found ${categories.length} / ${tools.length}`);
fs.mkdirSync(output, { recursive: true });
const expected = new Set();
for (const { category, item } of tools) {
  const slug = item.href.split('/').filter(Boolean).pop();
  const file = `${slug}.svg`;
  expected.add(file);
  fs.writeFileSync(path.join(output, file), buildSvg(category, item), 'utf8');
}
for (const file of fs.readdirSync(output)) {
  if (file.endsWith('.svg') && !expected.has(file)) fs.unlinkSync(path.join(output, file));
}
console.log(`Generated ${expected.size} unique function-specific animated SVG previews in ${path.relative(root, output)}.`);
