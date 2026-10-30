import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogDataSource = fs.readFileSync(path.join(repoRoot, 'site/tools/_shared/planner-catalog-data.js'), 'utf8');
const newCatalogDataSource = fs.readFileSync(path.join(repoRoot, 'site/tools/_shared/new-tools-catalog-data.js'), 'utf8');
const catalogSource = fs.readFileSync(path.join(repoRoot, 'site/tools/catalog.js'), 'utf8');
const sandbox = { window: {}, document: { querySelector: () => null, querySelectorAll: () => [] }, console };
vm.runInNewContext(catalogDataSource, sandbox);
vm.runInNewContext(newCatalogDataSource, sandbox);
vm.runInNewContext(`${catalogSource}\n;globalThis.__toolCategories = categories;`, sandbox);
const categories = sandbox.__toolCategories;
const catalogTools = categories.flatMap(category => category.availableTools);
const preserved = [
  ['Bulk Image Background Remover', 'background-remover'],
  ['Image Size Optimizer', 'image-size-optimizer'],
  ['QR Code Generator & Print Checker', 'qr-code-generator'],
  ['HEIC → JPG Batch Converter', 'heic-to-jpg'],
  ['Global Passport & Visa Photo Studio', 'passport-photo-studio'],
  ['PDF Merger', 'pdf-merger'],
  ['PDF Page Organizer', 'pdf-page-organizer'],
  ['Color Palette Generator', 'color-palette-generator'],
  ['Color Contrast Checker', 'color-contrast-checker'],
  ['Video Frame Extractor', 'video-frame-extractor'],
  ['SRT ↔ WebVTT Subtitle Converter', 'subtitle-converter'],
  ['Audio Trimmer → WAV', 'wav-trimmer'],
  ['Silence Finder', 'silence-finder'],
  ['Meta & Open Graph Tag Builder', 'meta-tag-generator'],
  ['robots.txt Generator', 'robots-txt-generator'],
  ['JSON Formatter & Validator', 'json-formatter'],
  ['Regex Tester', 'regex-tester'],
  ['CSV Cleaner', 'csv-cleaner'],
  ['CSV ↔ JSON Converter', 'csv-to-json'],
  ['ZIP Archive Creator', 'archive-creator'],
  ['Batch File Renamer', 'batch-file-renamer'],
  ['Secure Password Generator', 'password-generator'],
  ['SHA-256 File Checksum', 'file-hash'],
  ['International Unit Converter', 'unit-converter'],
  ['Global Time Zone Converter', 'time-zone-converter'],
];
const additions = [
  ['PDF Compressor', 'pdf-compressor'],
  ['OCR / Searchable PDF', 'pdf-ocr-searchable'],
  ['PDF to JPG/PNG', 'pdf-to-images'],
  ['JPG/PNG to PDF', 'images-to-pdf'],
  ['PDF Page Numbering', 'pdf-page-numbering'],
  ['PDF Watermark', 'pdf-watermark'],
  ['Fill & Sign PDF', 'pdf-fill-sign'],
  ['Image Format Converter', 'image-format-converter'],
  ['Image Metadata / EXIF Viewer & Remover', 'image-metadata'],
  ['Favicon & App Icon Generator', 'favicon-generator'],
  ['SVG Optimizer', 'svg-optimizer'],
  ['AI Image Upscaler', 'image-upscaler'],
  ['QR Code Reader', 'qr-code-reader'],
  ['Image OCR / Image to Text', 'image-ocr'],
  ['Video to GIF', 'video-to-gif'],
  ['Animated GIF Optimizer', 'animated-gif-optimizer'],
  ['Video Compressor', 'video-compressor'],
  ['Audio Format Converter', 'audio-format-converter'],
  ['Speech-to-Text / Subtitle Generator', 'speech-to-text'],
  ['Text / Code Diff Checker', 'text-code-diff'],
  ['JSON Diff Checker', 'json-diff'],
  ['JSON ↔ YAML Converter', 'json-yaml-converter'],
  ['YAML Validator', 'yaml-validator'],
  ['XML Formatter / Validator', 'xml-formatter-validator'],
  ['SQL Formatter', 'sql-formatter'],
  ['JWT Debugger', 'jwt-debugger'],
  ['Base64 Encoder / Decoder', 'base64-encoder-decoder'],
  ['URL Encoder / Decoder & Parser', 'url-encoder-decoder-parser'],
  ['UUID Generator', 'uuid-generator'],
  ['Word / Character Counter + Case Converter', 'word-character-counter-case'],
  ['DOCX Text Extractor', 'docx-to-text'],
  ['EPUB Text Extractor', 'epub-text-extractor'],
  ['PowerPoint Text Extractor', 'pptx-text-extractor'],
  ['HTML to Markdown', 'html-to-markdown'],
  ['Markdown to HTML', 'markdown-to-html'],
  ['RTF to Plain Text', 'rtf-to-text'],
  ['Document Accessibility Checker', 'document-accessibility-checker'],
  ['PDF Metadata Inspector', 'pdf-metadata-inspector'],
  ['Text to PDF', 'text-to-pdf'],
  ['Image Cropper', 'image-cropper'],
  ['Image Rotate & Flip', 'image-rotate-flip'],
  ['Blur & Pixelate Image', 'image-blur-pixelate'],
  ['Image Color Adjuster', 'image-color-adjuster'],
  ['Image Collage Maker', 'image-collage-maker'],
  ['Image Contact Sheet', 'image-contact-sheet'],
  ['Social Image Resizer', 'image-social-resizer'],
  ['Meme Maker', 'image-meme-maker'],
  ['Pixel Drawing Board', 'image-drawing-board'],
  ['Image to ASCII Art', 'image-to-ascii-art'],
  ['Video Trimmer', 'video-trimmer'],
  ['Video Metadata Inspector', 'video-metadata-inspector'],
  ['Subtitle Merger', 'subtitle-merger'],
  ['Audio Extractor', 'audio-extractor'],
  ['Sample Rate Inspector', 'sample-rate-inspector'],
  ['Noise Meter', 'noise-meter'],
  ['Audio Joiner', 'audio-joiner'],
  ['Channel Splitter', 'channel-splitter'],
  ['Waveform Cutter', 'waveform-cutter'],
  ['Fade Generator', 'fade-generator'],
  ['Percentage Calculator', 'percentage-calculator'],
  ['Date Difference Calculator', 'date-difference-calculator'],
  ['Age Calculator', 'age-calculator'],
  ['Tip & Bill Split Calculator', 'tip-split-calculator'],
  ['Discount Calculator', 'discount-calculator'],
  ['Recipe Scaler', 'recipe-scaler'],
  ['Fraction Calculator', 'fraction-calculator'],
  ['Paint Coverage Calculator', 'paint-coverage-calculator'],
  ['Board Foot Calculator', 'board-foot-calculator'],
  ['Date Add/Subtract Planner', 'date-add-subtract-planner'],
  ['JSON Schema Validator', 'json-schema-validator'],
  ['CSV Transposer', 'csv-transposer'],
  ['JSON Flatten / Unflatten', 'json-flattener'],
  ['XML ↔ JSON Converter', 'xml-json-converter'],
  ['Markdown Table Generator', 'markdown-table-generator'],
  ['HTML Entity Encoder / Decoder', 'html-entities'],
  ['Cron Expression Builder', 'cron-expression-builder'],
  ['Unix Timestamp Converter', 'unix-timestamp-converter'],
  ['CSS Formatter / Minifier', 'css-formatter-minifier'],
  ['Semantic Version Comparator', 'semver-comparator'],
  ['XLSX Sheet Extractor', 'xlsx-to-csv'],
];

const researchedIdeas = [
  ['TOML Validator & Formatter', 'toml-validator-formatter'],
  ['Java .properties Escape / Unescape & Inspector', 'java-properties-inspector'],
  ['NDJSON / JSON Lines Validator & Repair Preview', 'ndjson-validator-repair'],
  ['JSONPath Query Tester', 'jsonpath-query-tester'],
  ['JSON Pointer (RFC 6901) Tester', 'json-pointer-tester'],
  ['JSON Patch Builder & Preview', 'json-patch-preview'],
  ['JSON Schema Test-Case Generator', 'json-schema-testcase-generator'],
  ['OpenAPI Spec Compatibility & Breaking-Change Checker', 'openapi-compatibility-checker'],
  ['AsyncAPI Spec Validator & Channel Explorer', 'asyncapi-channel-explorer'],
  ['GraphQL Query / Variables Validator', 'graphql-query-validator'],
  ['Protocol Buffers Schema & Wire-Field Explorer', 'protobuf-wire-explorer'],
  ['HTTP Request / Response Header Inspector', 'http-header-inspector'],
  ['CORS Preflight Request Simulator', 'cors-preflight-simulator'],
  ['Accept / Content-Type Negotiation Workbench', 'content-negotiation-workbench'],
  ['HTTP Cache-Control Policy Builder & Evaluator', 'cache-control-evaluator'],
  ['RFC 9457 Problem Details Validator & Fixture Builder', 'problem-details-validator'],
  ['Webhook HMAC Signature Verifier', 'webhook-hmac-verifier'],
  ['Subresource Integrity Hash Generator', 'sri-hash-generator'],
  ['Content Security Policy Builder & Evaluator', 'csp-policy-evaluator'],
  ['CSP Violation Report Analyzer', 'csp-report-analyzer'],
  ['Git Ignore Pattern Tester', 'gitignore-pattern-tester'],
  ['Docker .dockerignore Matcher & Context Preview', 'dockerignore-context-preview'],
  ['EditorConfig Parser, Preview & Conflict Checker', 'editorconfig-conflict-checker'],
  ['GitHub Actions Workflow Validator', 'github-actions-workflow-validator'],
  ['GitHub Actions Matrix Expander & Exclusion Preview', 'github-actions-matrix-preview'],
  ['GitHub Actions Expression Playground', 'github-actions-expression-playground'],
  ['CODEOWNERS Coverage & Match Simulator', 'codeowners-match-simulator'],
  ['Dependabot Configuration Validator & Schedule Preview', 'dependabot-config-preview'],
  ['Renovate Config Validator & Rule Trace', 'renovate-rule-trace'],
  ['Docker Compose Service Graph & Port Conflict Checker', 'compose-service-graph'],
  ['Kubernetes Manifest Schema & Cross-Resource Validator', 'kubernetes-manifest-validator'],
  ['Kubernetes CPU / Memory Quantity Converter', 'kubernetes-quantity-converter'],
  ['Terraform Plan JSON Explorer & Change-Risk Filter', 'terraform-plan-explorer'],
  ['Terraform Dependency Lockfile Inspector', 'terraform-lockfile-inspector'],
  ['Interactive Git Rebase Todo Visualizer', 'git-rebase-todo-visualizer'],
  ['Git Range-Diff Review Explainer', 'git-range-diff-explainer'],
  ['Git Patch Apply Preflight Simulator', 'git-patch-preflight'],
  ['Conventional Commit Validator & Release-Type Preview', 'conventional-commit-preview'],
  ['Git Log to Release Notes Draft Builder', 'release-notes-draft-builder'],
  ['npm SemVer Range Satisfaction Tester', 'npm-semver-range-tester'],
  ['JavaScript Lockfile Inspector & Cross-File Consistency Checker', 'js-lockfile-consistency-checker'],
  ['TypeScript Path Alias Resolver Simulator', 'typescript-path-resolver'],
  ['TypeScript Config Inheritance & Effective Options Explorer', 'typescript-config-explorer'],
  ['Source Map Inspector & Embedded-Source Privacy Checker', 'source-map-privacy-inspector'],
  ['Multi-Language Stack Trace Parser & Grouping Tool', 'stack-trace-grouping'],
  ['HAR Waterfall & Privacy Analyzer', 'har-privacy-waterfall'],
  ['JavaScript Bundle Stats Explorer', 'js-bundle-stats-explorer'],
  ['CSS Specificity Calculator & Selector Duel', 'css-specificity-duel'],
  ['CSS Grid Template-Areas Visualizer & Validator', 'css-grid-areas-visualizer'],
  ['CSS clamp() Fluid-Scale Calculator & Preview', 'css-clamp-fluid-scale'],
];

test('catalog preserves the existing 256 tools and adds 244 distinct routes across twenty categories', () => {
  assert.equal(categories.length, 20, 'the expanded hub must have exactly twenty categories');
  assert.equal(catalogTools.length, 500, 'expected 256 existing routes plus 244 new tools');
  assert.equal(new Set(catalogTools.map(tool => tool.href)).size, 500, 'tool routes must be unique');
  assert.equal(new Set(catalogTools.map(tool => tool.title)).size, 500, 'tool titles must be unique');
  assert.equal(preserved.length, 25, 'the existing tool inventory must remain complete');
  assert.equal(additions.length, 80, 'the release must add exactly 80 tools');
  for (const [title, slug] of preserved) {
    const href = `/tools/${slug}/`;
    const matching = catalogTools.filter(tool => tool.href === href && tool.title === title);
    assert.equal(matching.length, 1, `${title} must be preserved once at ${href}`);
  }
  for (const [title, slug] of additions) {
    const href = `/tools/${slug}/`;
    const matching = catalogTools.filter(tool => tool.href === href && tool.title === title);
    assert.equal(matching.length, 1, `${title} must be listed once at ${href}`);
    const folder = path.join(repoRoot, 'site/tools', slug);
    const htmlPath = path.join(folder, 'index.html');
    const appPath = path.join(folder, 'app.js');
    assert.ok(fs.existsSync(htmlPath), `${slug} needs a real index.html`);
    assert.ok(fs.existsSync(appPath), `${slug} needs a real app.js`);
    const html = fs.readFileSync(htmlPath, 'utf8');
    const app = fs.readFileSync(appPath, 'utf8');
    assert.match(html, /\/tools\/_shared\/toolkit\.js/, `${slug} must use the existing local shared toolkit`);
    assert.match(html, /<script\b[^>]*\bsrc=["'][^"']*app\.js(?:[?#][^"']*)?["']/i, `${slug} page must load its own implementation`);
    const apiName = app.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*window\.AHToolkit\b/)?.[1] || 'AHToolkit';
    const api = apiName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(app, new RegExp(`\\b${api}\\.credits\\.canRun\\s*\\(`), `${slug} must honor the existing daily credit pool`);
    assert.match(app, new RegExp(`\\b${api}\\.credits\\.charge\\s*\\(`), `${slug} must charge only the shared credit pool after success`);
  }
});

test('all 50 researched tools have unique local pages, browser engines, and shared-credit wrappers', () => {
  assert.equal(researchedIdeas.length, 50);
  for (const [title, slug] of researchedIdeas) {
    const href = `/tools/${slug}/`;
    const matches = catalogTools.filter(tool => tool.href === href && tool.title === title);
    assert.equal(matches.length, 1, `${title} must be listed once at ${href}`);
    const folder = path.join(repoRoot, 'site/tools', slug);
    const htmlPath = path.join(folder, 'index.html');
    const appPath = path.join(folder, 'app.js');
    const enginePath = path.join(repoRoot, 'site/tools/_shared/devtool-engines', `${slug}.js`);
    assert.ok(fs.existsSync(htmlPath), `${slug} needs an English route page`);
    assert.ok(fs.existsSync(appPath), `${slug} needs its own route wrapper`);
    assert.ok(fs.existsSync(enginePath), `${slug} needs a distinct browser-local engine`);
    const html = fs.readFileSync(htmlPath, 'utf8');
    const app = fs.readFileSync(appPath, 'utf8');
    const engine = fs.readFileSync(enginePath, 'utf8');
    assert.match(html, /lang="en"/, `${slug} must remain on the English site`);
    assert.match(html, /\/tools\/_shared\/devtool-runtime\.js/, `${slug} must use the shared runtime`);
    assert.match(html, new RegExp(`/tools/_shared/devtool-engines/${slug}\\.js`), `${slug} must load only its own engine`);
    assert.match(app, /api\.credits\.canRun\s*\(/, `${slug} must check the existing daily credit pool`);
    assert.match(app, /api\.credits\.charge\s*\(/, `${slug} must use the existing daily credit pool`);
    assert.ok(engine.includes(slug), `${slug} engine must register its unique key`);
    assert.doesNotMatch(engine, /fetch\s*\(|XMLHttpRequest|WebSocket|\beval\s*\(/, `${slug} must not make network calls or evaluate code`);
  }
});
