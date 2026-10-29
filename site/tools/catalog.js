// English Tools Hub catalog and search. All live utilities are free; the 130 new
// browser-local tools share one daily, device-local credit counter.
const categories = [
  {id:'pdf-documents',title:'PDF & Documents',description:'Create, inspect, convert, OCR, number, watermark, fill and sign documents locally.',accent_color:'#b5a0ff',availableTools:[
    {title:'PDF Merger',href:'/tools/pdf-merger/',description:'Combine local PDF files in the order you choose.',icon:'⊕'},
    {title:'PDF Page Organizer',href:'/tools/pdf-page-organizer/',description:'Reorder, rotate, extract or remove pages locally.',icon:'▤'},
    {title:'PDF Compressor',href:'/tools/pdf-compressor/',description:'Rebuild pages at a chosen image quality and compare actual file sizes; searchable text is not retained.',icon:'⇣'},
    {title:'OCR / Searchable PDF',href:'/tools/pdf-ocr-searchable/',description:'Recognize text in scanned PDF pages locally and create a searchable copy.',icon:'⌕'},
    {title:'PDF to JPG/PNG',href:'/tools/pdf-to-images/',description:'Render selected pages as images and bundle multiple pages in a ZIP.',icon:'▧'},
    {title:'JPG/PNG to PDF',href:'/tools/images-to-pdf/',description:'Arrange images into a PDF with page-size, orientation and margin controls.',icon:'▤'},
    {title:'PDF Page Numbering',href:'/tools/pdf-page-numbering/',description:'Add page numbers at your chosen position and starting value.',icon:'№'},
    {title:'PDF Watermark',href:'/tools/pdf-watermark/',description:'Apply a text or image watermark to selected pages.',icon:'◈'},
    {title:'Fill & Sign PDF',href:'/tools/pdf-fill-sign/',description:'Fill fields and add a visual typed or drawn signature; not a certificate-backed signature.',icon:'✎'}
  ,
    {title:'DOCX Text Extractor',href:'/tools/docx-to-text/',description:'Extract paragraphs from local DOCX files in this browser with copy and download.',icon:'¶'},
    {title:'EPUB Text Extractor',href:'/tools/epub-text-extractor/',description:'Extract ordered text from a local EPUB publication without uploading it.',icon:'▤'},
    {title:'PowerPoint Text Extractor',href:'/tools/pptx-text-extractor/',description:'Collect slide text from a local PowerPoint file in this browser.',icon:'▣'},
    {title:'HTML to Markdown',href:'/tools/html-to-markdown/',description:'Turn local HTML into readable Markdown; scripts and navigation are stripped.',icon:'↧'},
    {title:'Markdown to HTML',href:'/tools/markdown-to-html/',description:'Render a practical Markdown subset into a standalone HTML file.',icon:'</>'},
    {title:'RTF to Plain Text',href:'/tools/rtf-to-text/',description:'Strip common RTF formatting codes and export readable text locally.',icon:'T'},
    {title:'Document Accessibility Checker',href:'/tools/document-accessibility-checker/',description:'Run local heuristic checks on HTML and Markdown; this is not certification.',icon:'✓'},
    {title:'PDF Metadata Inspector',href:'/tools/pdf-metadata-inspector/',description:'Inspect PDF metadata, page count and page dimensions locally.',icon:'ⓘ'},
    {title:'Text to PDF',href:'/tools/text-to-pdf/',description:'Create a selectable-text PDF from local text with automatic page breaks.',icon:'▤'}],upcomingTools:['Document Formatter','Document Scanner','Page Size Converter']},
  {id:'image-design',title:'Image & Design',description:'Crop, edit, convert, inspect and create image assets locally.',accent_color:'#f6a6d0',availableTools:[
    {title:'Bulk Image Background Remover',href:'/tools/background-remover/',description:'Isolate subjects in a browser-local batch workflow.',icon:'✂'},
    {title:'Image Size Optimizer',href:'/tools/image-size-optimizer/',description:'Resize, compress and convert images on this device.',icon:'⌗'},
    {title:'QR Code Generator & Print Checker',href:'/tools/qr-code-generator/',description:'Create and verify QR codes for URL, Wi-Fi or text.',icon:'▦'},
    {title:'HEIC → JPG Batch Converter',href:'/tools/heic-to-jpg/',description:'Convert HEIC photos to JPG locally, with ZIP export.',icon:'▧'},
    {title:'Global Passport & Visa Photo Studio',href:'/tools/passport-photo-studio/',description:'Crop to reference dimensions and prepare print sheets.',icon:'▣'},
    {title:'Color Palette Generator',href:'/tools/color-palette-generator/',description:'Generate harmonious palettes and copy CSS variables or JSON.',icon:'◉'},
    {title:'Color Contrast Checker',href:'/tools/color-contrast-checker/',description:'Check WCAG contrast ratios for text and interface colors.',icon:'◐'},
    {title:'Image Format Converter',href:'/tools/image-format-converter/',description:'Batch-convert PNG, JPG, WebP and supported AVIF images locally.',icon:'⇄'},
    {title:'Image Metadata / EXIF Viewer & Remover',href:'/tools/image-metadata/',description:'Inspect supported image metadata and export a re-encoded copy without it.',icon:'ⓘ'},
    {title:'AI Image Upscaler',href:'/tools/image-upscaler/',description:'Run a real super-resolution model in this browser after its first-use download.',icon:'↗'},
    {title:'QR Code Reader',href:'/tools/qr-code-reader/',description:'Read QR codes from an image or optional camera preview without opening decoded links.',icon:'▦'}
  ,
    {title:'Image Cropper',href:'/tools/image-cropper/',description:'Crop a local image to common aspect ratios and export a PNG.',icon:'◫'},
    {title:'Image Rotate & Flip',href:'/tools/image-rotate-flip/',description:'Rotate and mirror local images with a live preview.',icon:'⟳'},
    {title:'Blur & Pixelate Image',href:'/tools/image-blur-pixelate/',description:'Blur or pixelate selected image areas locally.',icon:'▧'},
    {title:'Image Color Adjuster',href:'/tools/image-color-adjuster/',description:'Adjust image brightness, contrast, saturation and grayscale in this browser.',icon:'◑'},
    {title:'Image Collage Maker',href:'/tools/image-collage-maker/',description:'Arrange local photos into a grid collage with spacing and background controls.',icon:'▦'},
    {title:'Image Contact Sheet',href:'/tools/image-contact-sheet/',description:'Build a labeled thumbnail sheet from a batch of local images.',icon:'▤'},
    {title:'Social Image Resizer',href:'/tools/image-social-resizer/',description:'Fit an image to common square, link-preview and story dimensions.',icon:'↔'},
    {title:'Meme Maker',href:'/tools/image-meme-maker/',description:'Add top and bottom captions to a local image and export a PNG.',icon:'Aa'},
    {title:'Pixel Drawing Board',href:'/tools/image-drawing-board/',description:'Draw, erase and undo on a transparent canvas, then save a PNG.',icon:'✎'},
    {title:'Image to ASCII Art',href:'/tools/image-to-ascii-art/',description:'Convert image brightness into copyable and downloadable ASCII art.',icon:'≋'}],upcomingTools:[]},
  {id:'video-tools',title:'Video Tools',description:'Trim and inspect local clips, extract frames, make GIFs and optimize supported video.',accent_color:'#ffae89',availableTools:[
    {title:'Video Frame Extractor',href:'/tools/video-frame-extractor/',description:'Capture selected timestamps and save a PNG contact sheet.',icon:'▣'},
    {title:'SRT ↔ WebVTT Subtitle Converter',href:'/tools/subtitle-converter/',description:'Convert, offset and validate subtitle cues in your browser.',icon:'≋'},
    {title:'Video to GIF',href:'/tools/video-to-gif/',description:'Trim a local clip, set frame rate, width and loop behavior, then export an actual GIF.',icon:'▣'},
    {title:'Animated GIF Optimizer',href:'/tools/animated-gif-optimizer/',description:'Optimize supported animated GIFs locally and compare actual file size. Animated WebP is not supported in this release.',icon:'⇣'},
    {title:'Video Compressor',href:'/tools/video-compressor/',description:'Re-encode supported clips in the browser and compare actual output size and quality settings.',icon:'⇩'}
  ,
    {title:'Video Trimmer',href:'/tools/video-trimmer/',description:'Select a clip range and export a browser-recorded WebM where supported.',icon:'✂'},
    {title:'Video Metadata Inspector',href:'/tools/video-metadata-inspector/',description:'Inspect local video dimensions, duration, aspect ratio and file size.',icon:'ⓘ'},
    {title:'Subtitle Merger',href:'/tools/subtitle-merger/',description:'Merge local SRT or WebVTT cue files and apply optional time offsets.',icon:'≋'}],upcomingTools:['Caption Styler','Clip Splitter','Aspect Ratio Preview']},
  {id:'audio-tools',title:'Audio Tools',description:'Inspect, join, cut and shape supported local audio without uploading recordings.',accent_color:'#ffd379',availableTools:[
    {title:'Audio Trimmer → WAV',href:'/tools/wav-trimmer/',description:'Trim a local audio selection and export PCM WAV.',icon:'⌁'},
    {title:'Silence Finder',href:'/tools/silence-finder/',description:'Find quiet spans with an adjustable RMS threshold.',icon:'∿'},
    {title:'Audio Format Converter',href:'/tools/audio-format-converter/',description:'Convert browser-decodable audio to WAV and choose sample rate and channels.',icon:'⇄'}
  ,
    {title:'Audio Extractor',href:'/tools/audio-extractor/',description:'Extract supported local video audio and export PCM WAV.',icon:'♫'},
    {title:'Sample Rate Inspector',href:'/tools/sample-rate-inspector/',description:'Inspect sample rate, channels, duration and signal levels in local audio.',icon:'∿'},
    {title:'Noise Meter',href:'/tools/noise-meter/',description:'Estimate RMS and peak level from a local audio recording; not a calibrated sound meter.',icon:'◖'},
    {title:'Audio Joiner',href:'/tools/audio-joiner/',description:'Join supported local audio files in order and export PCM WAV.',icon:'⊕'},
    {title:'Channel Splitter',href:'/tools/channel-splitter/',description:'Split a multi-channel recording into separate mono WAV files.',icon:'⇥'},
    {title:'Waveform Cutter',href:'/tools/waveform-cutter/',description:'Cut a time range from supported local audio and save PCM WAV.',icon:'⌁'},
    {title:'Fade Generator',href:'/tools/fade-generator/',description:'Apply linear fade-in and fade-out envelopes to local audio.',icon:'∿'}],upcomingTools:['Loudness Checker']},
  {id:'web-seo',title:'Web & SEO',description:'Create site icons and optimized SVGs, parse URLs, or build readable search/social metadata and crawler rules.',accent_color:'#8ed9fb',availableTools:[
    {title:'Meta & Open Graph Tag Builder',href:'/tools/meta-tag-generator/',description:'Create escaped HTML, Open Graph and Twitter card tags with a preview.',icon:'</>'},
    {title:'robots.txt Generator',href:'/tools/robots-txt-generator/',description:'Draft crawler rules, test a path and learn what robots.txt cannot do.',icon:'⌘'},
    {title:'Favicon & App Icon Generator',href:'/tools/favicon-generator/',description:'Create common icon sizes from one image and download a ZIP locally.',icon:'◉'},
    {title:'SVG Optimizer',href:'/tools/svg-optimizer/',description:'Sanitize and minify SVG markup, compare bytes and preview the result.',icon:'◇'},
    {title:'URL Encoder / Decoder & Parser',href:'/tools/url-encoder-decoder-parser/',description:'Encode or decode URL components and inspect URL parts without fetching the address.',icon:'↗'}
  ],upcomingTools:['Sitemap Planner','Link Checker','Canonical Checker','Structured Data Preview','Redirect Map Builder','Heading Outline','Open Graph Image Checker']},
  {id:'developer-utilities',title:'Developer Utilities',description:'Validate, compare, convert and format code and structured data locally.',accent_color:'#b4befd',availableTools:[
    {title:'JSON Formatter & Validator',href:'/tools/json-formatter/',description:'Validate, format or minify JSON without sending a payload.',icon:'{}'},
    {title:'Regex Tester',href:'/tools/regex-tester/',description:'Test JavaScript regular expressions with matches and replacement preview.',icon:'.*'},
    {title:'Text / Code Diff Checker',href:'/tools/text-code-diff/',description:'Compare two text or code inputs with line highlights and a unified diff.',icon:'±'},
    {title:'JSON Diff Checker',href:'/tools/json-diff/',description:'Compare nested JSON values and show added, removed and changed keys.',icon:'{}'},
    {title:'JSON ↔ YAML Converter',href:'/tools/json-yaml-converter/',description:'Convert valid JSON and supported YAML in either direction with parse errors.',icon:'⇄'},
    {title:'YAML Validator',href:'/tools/yaml-validator/',description:'Check YAML syntax, indentation and duplicate keys with stated parser limits.',icon:'✓'},
    {title:'XML Formatter / Validator',href:'/tools/xml-formatter-validator/',description:'Validate XML structure, then format or minify it locally.',icon:'</>'},
    {title:'SQL Formatter',href:'/tools/sql-formatter/',description:'Format SQL with dialect and keyword-case options; formatting does not validate or execute it.',icon:'⌘'},
    {title:'UUID Generator',href:'/tools/uuid-generator/',description:'Generate batches of random version-4 UUIDs with the browser cryptographic API.',icon:'⧉'}
  ,
    {title:'JSON Schema Validator',href:'/tools/json-schema-validator/',description:'Validate JSON data against a clearly documented practical JSON Schema subset.',icon:'{}'},
    {title:'JSON Flatten / Unflatten',href:'/tools/json-flattener/',description:'Flatten nested JSON into paths or rebuild supported paths into nested objects.',icon:'⇅'},
    {title:'XML ↔ JSON Converter',href:'/tools/xml-json-converter/',description:'Convert a documented subset of XML and JSON locally.',icon:'⇄'},
    {title:'Markdown Table Generator',href:'/tools/markdown-table-generator/',description:'Convert pasted CSV or tabular data into a GitHub-style Markdown table.',icon:'▦'},
    {title:'HTML Entity Encoder / Decoder',href:'/tools/html-entities/',description:'Encode reserved HTML characters or decode browser-supported entities locally.',icon:'&'},
    {title:'Cron Expression Builder',href:'/tools/cron-expression-builder/',description:'Build and validate standard five-field Unix cron expressions; it does not schedule jobs.',icon:'⌘'},
    {title:'Unix Timestamp Converter',href:'/tools/unix-timestamp-converter/',description:'Convert Unix seconds or milliseconds to UTC dates and back.',icon:'◷'},
    {title:'CSS Formatter / Minifier',href:'/tools/css-formatter-minifier/',description:'Beautify or compact CSS locally; formatting is not syntax validation.',icon:'{}'},
    {title:'Semantic Version Comparator',href:'/tools/semver-comparator/',description:'Compare two versions using SemVer 2.0.0 precedence rules.',icon:'≶'},
    {title:'TOML Validator & Formatter',href:'/tools/toml-validator-formatter/',description:'Validate and format a documented TOML 1.0 subset in this browser.',icon:'{}'},
    {title:'Java .properties Escape / Unescape & Inspector',href:'/tools/java-properties-inspector/',description:'Inspect Java properties escapes, continuations and duplicate-key precedence locally.',icon:'≋'},
    {title:'NDJSON / JSON Lines Validator & Repair Preview',href:'/tools/ndjson-validator-repair/',description:'Validate records by line and preview only high-confidence local repairs.',icon:'≋'},
    {title:'JSONPath Query Tester',href:'/tools/jsonpath-query-tester/',description:'Test a bounded JSONPath query subset against pasted JSON with match paths.',icon:'{}'},
    {title:'JSON Pointer (RFC 6901) Tester',href:'/tools/json-pointer-tester/',description:'Trace each RFC 6901 pointer segment and show the first local lookup failure.',icon:'↘'},
    {title:'JSON Patch Builder & Preview',href:'/tools/json-patch-preview/',description:'Apply bounded RFC 6902 operations to local JSON with step-by-step preview.',icon:'{}'},
    {title:'JSON Schema Test-Case Generator',href:'/tools/json-schema-testcase-generator/',description:'Generate explainable fixtures for a practical JSON Schema keyword subset.',icon:'{}'},
    {title:'OpenAPI Spec Compatibility & Breaking-Change Checker',href:'/tools/openapi-compatibility-checker/',description:'Compare pasted OpenAPI specs locally for common structural and breaking changes.',icon:'⇄'},
    {title:'AsyncAPI Spec Validator & Channel Explorer',href:'/tools/asyncapi-channel-explorer/',description:'Check a single AsyncAPI document shape and explore supplied channels locally.',icon:'≋'},
    {title:'GraphQL Query / Variables Validator',href:'/tools/graphql-query-validator/',description:'Inspect GraphQL query structure and JSON variables against supplied local context.',icon:'{}'},
    {title:'Protocol Buffers Schema & Wire-Field Explorer',href:'/tools/protobuf-wire-explorer/',description:'Explore a bounded proto3 field subset and supplied wire-format bytes locally.',icon:'▤'},
    {title:'HTTP Request / Response Header Inspector',href:'/tools/http-header-inspector/',description:'Inspect pasted HTTP headers for syntax, duplicates and heuristic sensitive values.',icon:'↔'},
    {title:'CORS Preflight Request Simulator',href:'/tools/cors-preflight-simulator/',description:'Model common CORS preflight checks from supplied request and response values.',icon:'↔'},
    {title:'Accept / Content-Type Negotiation Workbench',href:'/tools/content-negotiation-workbench/',description:'Rank supplied representations against Accept values using a transparent local model.',icon:'↔'},
    {title:'HTTP Cache-Control Policy Builder & Evaluator',href:'/tools/cache-control-evaluator/',description:'Build and explain common Cache-Control directives for browser and shared caches.',icon:'↔'},
    {title:'RFC 9457 Problem Details Validator & Fixture Builder',href:'/tools/problem-details-validator/',description:'Check a Problem Details body, status and media type, then prepare a fixture.',icon:'{}'},
    {title:'Webhook HMAC Signature Verifier',href:'/tools/webhook-hmac-verifier/',description:'Verify a supported HMAC-SHA-256 signature locally with the Web Crypto API.',icon:'⛨'},
    {title:'Subresource Integrity Hash Generator',href:'/tools/sri-hash-generator/',description:'Generate a SHA-256, SHA-384 or SHA-512 SRI token from pasted exact content.',icon:'#'},
    {title:'Content Security Policy Builder & Evaluator',href:'/tools/csp-policy-evaluator/',description:'Inspect and draft a practical CSP subset with a local directive explanation.',icon:'⛨'},
    {title:'CSP Violation Report Analyzer',href:'/tools/csp-report-analyzer/',description:'Group pasted CSP reports locally and preview configurable privacy redaction.',icon:'▤'},
    {title:'Git Ignore Pattern Tester',href:'/tools/gitignore-pattern-tester/',description:'Trace supplied paths against a documented gitignore pattern subset.',icon:'⌘'},
    {title:'Docker .dockerignore Matcher & Context Preview',href:'/tools/dockerignore-context-preview/',description:'Preview included files and estimated bytes for a supplied Docker context manifest.',icon:'▣'},
    {title:'EditorConfig Parser, Preview & Conflict Checker',href:'/tools/editorconfig-conflict-checker/',description:'Trace EditorConfig sections and effective settings for supplied paths.',icon:'⌘'},
    {title:'GitHub Actions Workflow Validator',href:'/tools/github-actions-workflow-validator/',description:'Check common workflow structure and configuration issues in pasted text.',icon:'⌘'},
    {title:'GitHub Actions Matrix Expander & Exclusion Preview',href:'/tools/github-actions-matrix-preview/',description:'Expand bounded static matrix combinations and preview include/exclude effects.',icon:'▦'},
    {title:'GitHub Actions Expression Playground',href:'/tools/github-actions-expression-playground/',description:'Evaluate a safe expression subset against user-supplied JSON context.',icon:'⌘'},
    {title:'CODEOWNERS Coverage & Match Simulator',href:'/tools/codeowners-match-simulator/',description:'Trace supplied paths through CODEOWNERS rules and show winning owner patterns.',icon:'⌘'},
    {title:'Dependabot Configuration Validator & Schedule Preview',href:'/tools/dependabot-config-preview/',description:'Inspect common Dependabot configuration fields and preview simple schedules.',icon:'⌘'},
    {title:'Renovate Config Validator & Rule Trace',href:'/tools/renovate-rule-trace/',description:'Trace a simplified Renovate packageRules JSON configuration locally.',icon:'⌘'},
    {title:'Docker Compose Service Graph & Port Conflict Checker',href:'/tools/compose-service-graph/',description:'Inspect a bounded Compose document for service dependencies and port conflicts.',icon:'▣'},
    {title:'Kubernetes Manifest Schema & Cross-Resource Validator',href:'/tools/kubernetes-manifest-validator/',description:'Check basic Kubernetes manifest structure and common cross-resource selectors.',icon:'▤'},
    {title:'Kubernetes CPU / Memory Quantity Converter',href:'/tools/kubernetes-quantity-converter/',description:'Convert common Kubernetes CPU and memory quantities with exact values.',icon:'⇄'},
    {title:'Terraform Plan JSON Explorer & Change-Risk Filter',href:'/tools/terraform-plan-explorer/',description:'Group resource changes in supplied Terraform plan JSON and flag sensitive values.',icon:'▤'},
    {title:'Terraform Dependency Lockfile Inspector',href:'/tools/terraform-lockfile-inspector/',description:'Inspect provider versions and checksums in a pasted Terraform lockfile.',icon:'▤'},
    {title:'Interactive Git Rebase Todo Visualizer',href:'/tools/git-rebase-todo-visualizer/',description:'Preview rebase todo order and explain squash, fixup, drop and exec commands.',icon:'⌘'},
    {title:'Git Range-Diff Review Explainer',href:'/tools/git-range-diff-explainer/',description:'Explain common pasted git range-diff correspondence and change markers.',icon:'±'},
    {title:'Git Patch Apply Preflight Simulator',href:'/tools/git-patch-preflight/',description:'Preview bounded unified-diff hunks against supplied text without applying files.',icon:'±'},
    {title:'Conventional Commit Validator & Release-Type Preview',href:'/tools/conventional-commit-preview/',description:'Validate a Conventional Commit message and preview its likely release type.',icon:'⌘'},
    {title:'Git Log to Release Notes Draft Builder',href:'/tools/release-notes-draft-builder/',description:'Draft grouped Markdown release notes from pasted git log or commit messages.',icon:'¶'},
    {title:'npm SemVer Range Satisfaction Tester',href:'/tools/npm-semver-range-tester/',description:'Test versions against a documented npm-style SemVer range subset.',icon:'≶'},
    {title:'JavaScript Lockfile Inspector & Cross-File Consistency Checker',href:'/tools/js-lockfile-consistency-checker/',description:'Compare package manifests with supported JavaScript lockfile structures locally.',icon:'▤'},
    {title:'TypeScript Path Alias Resolver Simulator',href:'/tools/typescript-path-resolver/',description:'Trace TypeScript paths and baseUrl against a supplied virtual file list.',icon:'</>'},
    {title:'TypeScript Config Inheritance & Effective Options Explorer',href:'/tools/typescript-config-explorer/',description:'Compare supplied tsconfig JSON and show effective option provenance.',icon:'</>'},
    {title:'Source Map Inspector & Embedded-Source Privacy Checker',href:'/tools/source-map-privacy-inspector/',description:'Inspect a source map locally for embedded source and heuristic privacy risks.',icon:'▤'},
    {title:'Multi-Language Stack Trace Parser & Grouping Tool',href:'/tools/stack-trace-grouping/',description:'Parse and group common JavaScript, Python and Java stack frames locally.',icon:'⌕'},
    {title:'HAR Waterfall & Privacy Analyzer',href:'/tools/har-privacy-waterfall/',description:'Summarize HAR timings and flag likely sensitive data in the pasted JSON.',icon:'▤'},
    {title:'JavaScript Bundle Stats Explorer',href:'/tools/js-bundle-stats-explorer/',description:'Summarize supported webpack, Rollup or Vite bundle-stat JSON locally.',icon:'▤'},
    {title:'CSS Specificity Calculator & Selector Duel',href:'/tools/css-specificity-duel/',description:'Compare selector specificity tuples for a documented CSS selector subset.',icon:'{}'},
    {title:'CSS Grid Template-Areas Visualizer & Validator',href:'/tools/css-grid-areas-visualizer/',description:'Validate named grid-area rectangles and render a compact text grid locally.',icon:'▦'},
    {title:'CSS clamp() Fluid-Scale Calculator & Preview',href:'/tools/css-clamp-fluid-scale/',description:'Calculate CSS clamp interpolation and show a viewport sample table.',icon:'↔'}] ,upcomingTools:['API Request Builder','Color Code Converter']},
  {id:'data-spreadsheets',title:'Data & Spreadsheets',description:'Clean, transpose and extract local spreadsheet data in this browser.',accent_color:'#9cdfb6',availableTools:[
    {title:'CSV Cleaner',href:'/tools/csv-cleaner/',description:'Trim cells, remove blank rows and deduplicate CSV safely.',icon:'▦'},
    {title:'CSV ↔ JSON Converter',href:'/tools/csv-to-json/',description:'Convert tables in either direction with quoted-field support.',icon:'⇄'}
  ,
    {title:'XLSX Sheet Extractor',href:'/tools/xlsx-to-csv/',description:'Extract the first worksheet from a local XLSX workbook to CSV.',icon:'▦'},
    {title:'CSV Transposer',href:'/tools/csv-transposer/',description:'Flip rows and columns in quoted CSV while preserving cell values.',icon:'⇄'}],upcomingTools:['Formula Helper','Table Summarizer','TSV Converter','Column Profiler','Date Normalizer','Number Formatter','Pivot Preview','Spreadsheet Diff']},
  {id:'files-archives',title:'Files & Archives',description:'Package files into a local ZIP or preview and export a safely renamed batch.',accent_color:'#e3c59a',availableTools:[
    {title:'ZIP Archive Creator',href:'/tools/archive-creator/',description:'Create a ZIP from selected files without uploading them.',icon:'▣'},
    {title:'Batch File Renamer',href:'/tools/batch-file-renamer/',description:'Preview rename rules, then download the renamed files in a ZIP.',icon:'↗'}
  ],upcomingTools:['Duplicate Finder','Folder Inventory','File List Exporter','Archive Inspector','Filename Normalizer','Checksum Manifest','Folder Comparator','Extension Sorter']},
  {id:'privacy-security',title:'Privacy & Security',description:'Generate credentials, inspect tokens without verifying signatures, encode data locally and verify file checksums.',accent_color:'#a4e8df',availableTools:[
    {title:'Secure Password Generator',href:'/tools/password-generator/',description:'Create random passwords or passphrases with browser cryptography.',icon:'⛨'},
    {title:'SHA-256 File Checksum',href:'/tools/file-hash/',description:'Hash a local file and compare or copy the digest.',icon:'#'},
    {title:'JWT Debugger',href:'/tools/jwt-debugger/',description:'Decode JWT header and claims locally; decoding does not verify the signature.',icon:'◈'},
    {title:'Base64 Encoder / Decoder',href:'/tools/base64-encoder-decoder/',description:'Encode or decode UTF-8 text locally with invalid-input diagnostics.',icon:'64'}
  ],upcomingTools:['Metadata Cleaner','Privacy Checklist','Passphrase Audit','Secure Note Pad','Certificate Inspector','Local Redactor','Permission Guide','Data Retention Planner']},
  {id:'ai-everyday-utilities',title:'AI & Everyday Utilities',description:'Calculate common everyday values, plan dates, convert units and run local OCR or speech recognition.',accent_color:'#d3fb56',availableTools:[
    {title:'International Unit Converter',href:'/tools/unit-converter/',description:'Convert common length, mass, temperature, volume, speed, area and data units.',icon:'⇄'},
    {title:'Global Time Zone Converter',href:'/tools/time-zone-converter/',description:'Compare a UTC meeting time across major cities and IANA zones.',icon:'◷'},
    {title:'Image OCR / Image to Text',href:'/tools/image-ocr/',description:'Recognize text from images locally with a selectable language and confidence results.',icon:'⌕'},
    {title:'Speech-to-Text / Subtitle Generator',href:'/tools/speech-to-text/',description:'Transcribe supported audio locally with a browser model and export SRT or WebVTT.',icon:'≋'},
    {title:'Word / Character Counter + Case Converter',href:'/tools/word-character-counter-case/',description:'Count words and characters, estimate reading time and convert text case locally.',icon:'Aa'}
  ,
    {title:'Percentage Calculator',href:'/tools/percentage-calculator/',description:'Calculate common percentage, change and difference formulas with steps.',icon:'%'},
    {title:'Date Difference Calculator',href:'/tools/date-difference-calculator/',description:'Count calendar days between dates with an optional inclusive endpoint.',icon:'◷'},
    {title:'Age Calculator',href:'/tools/age-calculator/',description:'Calculate completed calendar years, months and days between two dates.',icon:'◷'},
    {title:'Tip & Bill Split Calculator',href:'/tools/tip-split-calculator/',description:'Calculate a bill total and split it across a chosen number of people.',icon:'÷'},
    {title:'Discount Calculator',href:'/tools/discount-calculator/',description:'Calculate sequential discounts and optional tax with a price breakdown.',icon:'%'},
    {title:'Recipe Scaler',href:'/tools/recipe-scaler/',description:'Scale ingredient quantities between serving sizes using transparent ratios.',icon:'½'},
    {title:'Fraction Calculator',href:'/tools/fraction-calculator/',description:'Add, subtract, multiply or divide fractions and reduce the result.',icon:'½'},
    {title:'Paint Coverage Calculator',href:'/tools/paint-coverage-calculator/',description:'Estimate paint quantity from wall area, openings, coats and coverage rate.',icon:'▰'},
    {title:'Board Foot Calculator',href:'/tools/board-foot-calculator/',description:'Calculate lumber volume from inch dimensions and quantity.',icon:'▤'},
    {title:'Date Add/Subtract Planner',href:'/tools/date-add-subtract-planner/',description:'Add or subtract calendar days, weeks, months or years from a date.',icon:'◷'}],upcomingTools:['Prompt Organizer','Decision Helper','Time Duration Calculator','Number Base Converter'],preview:{title:'AI Article & Text Detector',href:'/tools/text-detector/',description:'Coming soon. Analysis hosting is not configured; this preview is disabled.'}}
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
  if (bottom) bottom.textContent=count?`${count} TOOLS READY`:'NO TOOLS AVAILABLE';
  if (paragraph) paragraph.textContent=data.description;
  card.setAttribute('aria-label',`${data.title} — ${count} available${data.preview?' and AI Text Detector coming soon':''}`);
}
const availableCount=categories.reduce((sum,item)=>sum+item.availableTools.length,0);
const policy=document.querySelectorAll('.policy-item small');
if(policy[0]) policy[0].textContent='Image Size Optimizer, QR Code Generator, Passport & Visa Photo Studio and the 130 new tools share one existing 10-credit daily browser-local counter. HEIC retains its separate existing 10-credit counter. Successful actions only; failed actions cost no credits. Credits reset at local midnight and are not account-wide or server-enforced.';
if(policy[1]) policy[1].textContent='All tools are free. No premium-only tiers or paid APIs.';
const policyLabel=document.querySelector('.policy-label');
if(policyLabel) policyLabel.textContent=`${availableCount} TOOLS AVAILABLE · 130 NEW TOOLS`;
const buildNote=document.querySelector('.build-note span:first-child');
if(buildNote) buildNote.innerHTML=`<i></i>${availableCount} FREE TOOLS AVAILABLE. MORE WILL ARRIVE GRADUALLY.`;
const districtNote=document.querySelector('.build-note span:last-child');
if(districtNote) districtNote.textContent=`${categories.length} DISTRICTS · ${availableCount} TOOLS AVAILABLE · MORE TO COME`;
if(search) search.addEventListener('input',()=>{
  const q=search.value.trim().toLowerCase(); let visible=0;
  cards.forEach(card=>{
    const data=categories.find(item=>item.id===card.dataset.category);
    const searchable=[data.title,data.description,...data.availableTools.map(tool=>tool.title),...data.upcomingTools].join(' ').toLowerCase();
    card.hidden=!searchable.includes(q); if(!card.hidden) visible++;
  });
  document.querySelector('#empty-state').hidden=visible>0;
});
