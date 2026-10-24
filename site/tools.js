// English Tools Hub catalog and search. All live utilities are free; the 20 new
// browser-local tools share a daily, device-local credit counter.
const categories = [
  {id:'pdf-documents',title:'PDF & Documents',description:'Merge PDFs or rearrange, rotate, extract and remove pages without uploading a document.',accent_color:'#b5a0ff',availableTools:[
    {title:'PDF Merger',href:'/tools/pdf-merger/',description:'Combine local PDF files in the order you choose.',icon:'⊕'},
    {title:'PDF Page Organizer',href:'/tools/pdf-page-organizer/',description:'Reorder, rotate, extract or remove pages locally.',icon:'▤'}
  ],upcomingTools:['Document Formatter','Text Extractor','PDF Page Numberer','PDF Watermark Maker','PDF to Images','PDF Metadata Viewer','Document Scanner','Page Size Converter']},
  {id:'image-design',title:'Image & Design',description:'Optimize images, remove backgrounds, create verified QR codes, prepare document photos, or build accessible color palettes.',accent_color:'#f6a6d0',availableTools:[
    {title:'Bulk Image Background Remover',href:'/tools/background-remover/',description:'Isolate subjects in a browser-local batch workflow.',icon:'✂'},
    {title:'Image Size Optimizer',href:'/tools/image-size-optimizer/',description:'Resize, compress and convert images on this device.',icon:'⌗'},
    {title:'QR Code Generator & Print Checker',href:'/tools/qr-code-generator/',description:'Create and verify QR codes for URL, Wi-Fi or text.',icon:'▦'},
    {title:'HEIC → JPG Batch Converter',href:'/tools/heic-to-jpg/',description:'Convert HEIC photos to JPG locally, with ZIP export.',icon:'▧'},
    {title:'Global Passport & Visa Photo Studio',href:'/tools/passport-photo-studio/',description:'Crop to reference dimensions and prepare print sheets.',icon:'▣'},
    {title:'Color Palette Generator',href:'/tools/color-palette-generator/',description:'Generate harmonious palettes and copy CSS variables or JSON.',icon:'◉'},
    {title:'Color Contrast Checker',href:'/tools/color-contrast-checker/',description:'Check WCAG contrast ratios for text and interface colors.',icon:'◐'}
  ],upcomingTools:['SVG Optimizer','Favicon Generator','Image Cropper']},
  {id:'video-tools',title:'Video Tools',description:'Extract still frames from local videos or convert subtitle files between SRT and WebVTT.',accent_color:'#ffae89',availableTools:[
    {title:'Video Frame Extractor',href:'/tools/video-frame-extractor/',description:'Capture selected timestamps and save a PNG contact sheet.',icon:'▣'},
    {title:'SRT ↔ WebVTT Subtitle Converter',href:'/tools/subtitle-converter/',description:'Convert, offset and validate subtitle cues in your browser.',icon:'≋'}
  ],upcomingTools:['Video Trimmer','Caption Styler','GIF Maker','Video Compressor','Clip Splitter','Aspect Ratio Preview','Audio Extractor','Subtitle Merger']},
  {id:'audio-tools',title:'Audio Tools',description:'Trim audio to PCM WAV or identify quiet spans with adjustable local analysis.',accent_color:'#ffd379',availableTools:[
    {title:'Audio Trimmer → WAV',href:'/tools/wav-trimmer/',description:'Trim a local audio selection and export PCM WAV.',icon:'⌁'},
    {title:'Silence Finder',href:'/tools/silence-finder/',description:'Find quiet spans with an adjustable RMS threshold.',icon:'∿'}
  ],upcomingTools:['Audio Converter','Waveform Cutter','Noise Meter','Sample Rate Inspector','Channel Splitter','Audio Joiner','Loudness Checker','Fade Generator']},
  {id:'web-seo',title:'Web & SEO',description:'Build readable search/social metadata or a careful robots.txt file with clear crawl-control guidance.',accent_color:'#8ed9fb',availableTools:[
    {title:'Meta & Open Graph Tag Builder',href:'/tools/meta-tag-generator/',description:'Create escaped HTML, Open Graph and Twitter card tags with a preview.',icon:'</>'},
    {title:'robots.txt Generator',href:'/tools/robots-txt-generator/',description:'Draft crawler rules, test a path and learn what robots.txt cannot do.',icon:'⌘'}
  ],upcomingTools:['Sitemap Planner','Link Checker','Canonical Checker','Structured Data Preview','Redirect Map Builder','URL Inspector','Heading Outline','Open Graph Image Checker']},
  {id:'developer-utilities',title:'Developer Utilities',description:'Format JSON and test JavaScript regular expressions with local-only inputs.',accent_color:'#b4befd',availableTools:[
    {title:'JSON Formatter & Validator',href:'/tools/json-formatter/',description:'Validate, format or minify JSON without sending a payload.',icon:'{}'},
    {title:'Regex Tester',href:'/tools/regex-tester/',description:'Test JavaScript regular expressions with matches and replacement preview.',icon:'.*'}
  ],upcomingTools:['API Request Builder','URL Parser','Base64 Encoder','Diff Viewer','UUID Generator','Timestamp Converter','SQL Formatter','Color Code Converter']},
  {id:'data-spreadsheets',title:'Data & Spreadsheets',description:'Clean CSV rows or convert a header-based CSV into JSON in this browser.',accent_color:'#9cdfb6',availableTools:[
    {title:'CSV Cleaner',href:'/tools/csv-cleaner/',description:'Trim cells, remove blank rows and deduplicate CSV safely.',icon:'▦'},
    {title:'CSV ↔ JSON Converter',href:'/tools/csv-to-json/',description:'Convert tables in either direction with quoted-field support.',icon:'⇄'}
  ],upcomingTools:['Formula Helper','Table Summarizer','TSV Converter','Column Profiler','Date Normalizer','Number Formatter','Pivot Preview','Spreadsheet Diff']},
  {id:'files-archives',title:'Files & Archives',description:'Package files into a local ZIP or preview and export a safely renamed batch.',accent_color:'#e3c59a',availableTools:[
    {title:'ZIP Archive Creator',href:'/tools/archive-creator/',description:'Create a ZIP from selected files without uploading them.',icon:'▣'},
    {title:'Batch File Renamer',href:'/tools/batch-file-renamer/',description:'Preview rename rules, then download the renamed files in a ZIP.',icon:'↗'}
  ],upcomingTools:['Duplicate Finder','Folder Inventory','File List Exporter','Archive Inspector','Filename Normalizer','Checksum Manifest','Folder Comparator','Extension Sorter']},
  {id:'privacy-security',title:'Privacy & Security',description:'Generate strong passwords or verify a file with a local SHA-256 checksum.',accent_color:'#a4e8df',availableTools:[
    {title:'Secure Password Generator',href:'/tools/password-generator/',description:'Create random passwords or passphrases with browser cryptography.',icon:'⛨'},
    {title:'SHA-256 File Checksum',href:'/tools/file-hash/',description:'Hash a local file and compare or copy the digest.',icon:'#'}
  ],upcomingTools:['Metadata Cleaner','Privacy Checklist','Passphrase Audit','Secure Note Pad','Certificate Inspector','Local Redactor','Permission Guide','Data Retention Planner']},
  {id:'ai-everyday-utilities',title:'AI & Everyday Utilities',description:'Convert international measurements and coordinate times across global time zones. AI Text Detector analysis remains coming soon.',accent_color:'#d3fb56',availableTools:[
    {title:'International Unit Converter',href:'/tools/unit-converter/',description:'Convert common length, mass, temperature, volume, speed, area and data units.',icon:'⇄'},
    {title:'Global Time Zone Converter',href:'/tools/time-zone-converter/',description:'Compare a UTC meeting time across major cities and IANA zones.',icon:'◷'}
  ],upcomingTools:['Prompt Organizer','Decision Helper','AI Article & Text Detector','Date Difference Calculator','Percentage Calculator','Time Duration Calculator','Text Counter','Number Base Converter'],preview:{title:'AI Article & Text Detector',href:'/tools/text-detector/',description:'Coming soon. Analysis hosting is not configured; this preview is disabled.'}}
];
const search=document.querySelector('#category-search');
const cards=[...document.querySelectorAll('.category')];
const dialog=document.querySelector('#category-dialog');
let opener;
for (const card of cards) {
  const data=categories.find(item=>item.id===card.dataset.category);
  if (!data) continue;
  const count=data.availableTools.length;
  const badge=card.querySelector('.planned');
  const bottom=card.querySelector('.card-bottom span');
  const paragraph=card.querySelector('p');
  if (badge) badge.textContent=count?`${count} TOOLS AVAILABLE`:'COMING SOON';
  if (bottom) bottom.textContent=count?`${count} AVAILABLE · ${Math.max(0,10-count)} PLANNED`:'10 TOOLS PLANNED';
  if (paragraph) paragraph.textContent=data.description;
  card.setAttribute('aria-label',`${data.title} — ${count} available${data.preview?' and AI Text Detector coming soon':''}`);
}
const availableCount=categories.reduce((sum,item)=>sum+item.availableTools.length,0);
const policy=document.querySelectorAll('.policy-item small');
if(policy[0]) policy[0].textContent='The 20 new tools reuse the existing 10 local credits shared with Image Size Optimizer, QR Code Generator and Passport Photo Studio.';
if(policy[1]) policy[1].textContent='All tools are free. No premium-only tiers or paid APIs.';
const policyLabel=document.querySelector('.policy-label');
if(policyLabel) policyLabel.textContent=`${availableCount} TOOLS AVAILABLE · 20 NEW TOOLS`;
const buildNote=document.querySelector('.build-note span:first-child');
if(buildNote) buildNote.innerHTML=`<i></i>${availableCount} FREE TOOLS AVAILABLE. MORE WILL ARRIVE GRADUALLY.`;
if(search) search.addEventListener('input',()=>{
  const q=search.value.trim().toLowerCase(); let visible=0;
  cards.forEach(card=>{
    const data=categories.find(item=>item.id===card.dataset.category);
    const searchable=[data.title,data.description,...data.availableTools.map(tool=>tool.title),...data.upcomingTools].join(' ').toLowerCase();
    card.hidden=!searchable.includes(q); if(!card.hidden) visible++;
  });
  document.querySelector('#empty-state').hidden=visible>0;
});
