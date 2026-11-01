# ইংরেজি Tools Hub-এর জন্য ৩০টি Browser-first টুল

## চাহিদার প্রমাণ কী বলছে

“বিশ্বের সবচেয়ে বেশি সার্চ হওয়া ৩০টি” বলে নির্ভুল র‍্যাঙ্কিং করতে keyword-volume বা আপনার Search Console ডেটা দরকার। এই পর্যায়ে সেই ডেটা নেই, তাই নিচের তালিকাটি বাজারের প্রমাণভিত্তিক shortlist—নির্দিষ্ট মাসিক search-volume-এর দাবি নয়। Similarweb-এর সাম্প্রতিক অনুমানে iLovePDF বৈশ্বিকভাবে #127 এবং Smallpdf #916 অবস্থানে ছিল; তাদের ডেস্কটপ ভিজিটের যথাক্রমে 67.06% ও 64.38% অর্গানিক সার্চ থেকে এসেছে বলে দেখায়। এগুলো তৃতীয়-পক্ষের অনুমান, আপনার সাইটের অ্যানালিটিক্স নয়। [1] [2]

Adobe-এর Acrobat Online-এ 25+ PDF/e-sign টুল আছে; iLovePDF-ও compress, convert, rotate, watermark-সহ PDF workflows-কে মূল সুবিধা হিসেবে তুলে ধরে। Smallpdf নিজস্ব usage data-তে compression-কে সবচেয়ে ব্যবহৃত feature বলে এবং e-sign ও PDF-to-Word-ও উল্লেখ করে—এটি vendor-reported তথ্য, স্বাধীনভাবে যাচাইকৃত keyword volume নয়। এই পুনরাবৃত্তি PDF টুলে বিনিয়োগের শক্তিশালী সংকেত দেয়। [3] [4] [5]

ছবি, ভিডিও ও ডেভেলপার টুলের ক্ষেত্রে iLoveIMG, CloudConvert, Ezgif, RapidTables এবং CyberChef-এর বড় ক্যাটালগে একই ধরনের কাজে পুনরাবৃত্তি দেখা যায়। তাই এগুলোকে অনুসন্ধান-চাহিদার দিকনির্দেশক ধরা হয়েছে, নির্দিষ্ট search volume হিসেবে নয়। [6] [8] [9] [10] [11]

## ৩০টি নতুন টুল

বর্তমান ২৫টি ফিচারের সঙ্গে মিলিয়ে নিচের shortlist থেকে Background Remover, Image Size Optimizer, QR Code Generator, HEIC→JPG, PDF Merger, PDF Page Organizer, JSON Formatter, Regex Tester, CSV Cleaner ও CSV to JSON-সহ বিদ্যমান টুলগুলো বাদ রাখা হয়েছে।

### PDF ও ডকুমেন্ট

1. **PDF Compressor** — একাধিক compression preset, আগের/পরের file size এবং quality preview; ছোট আকারের লক্ষ্য দিলে সম্ভব না হলে সেটি স্পষ্ট দেখাবে। এটি high-demand অগ্রাধিকার, তবে browser-এ গুণমান ও আকারের সমঝোতা সৎভাবে দেখানো জরুরি। [3] [4]
2. **OCR / Searchable PDF** — স্ক্যান PDF-ээс selectable text ও searchable PDF তৈরি; ভাষা নির্বাচন, progress, confidence preview, page-range ও rotate/deskew controls. Tesseract.js browser OCR দেয়। [15]
3. **PDF to JPG/PNG** — page-range, DPI/scale নির্বাচন, preview এবং একাধিক পৃষ্ঠা ZIP-এ download. PDF.js ব্রাউজারে PDF parse/render করতে পারে। [12]
4. **JPG/PNG/WebP to PDF** — বহু ছবি সাজিয়ে এক PDF, page size, orientation, margin এবং fit/crop controls. pdf-lib ব্রাউজারে PDF তৈরি ও পরিবর্তন করতে পারে। [13]
5. **PDF Page Numbering** — position, style, start number, প্রথম পৃষ্ঠা বাদ দেওয়া, এবং page-range preview.
6. **PDF Watermark** — text বা image watermark, opacity, placement, size, page-range এবং tiled watermark.
7. **Fill & Sign PDF** — form field পূরণ, typed/drawn signature, initials/checkmark এবং flatten করে download. স্পষ্টভাবে জানাতে হবে: visual signature stamp certificate-backed cryptographic signature নয়। pdf-lib browser-এ form fill সমর্থন করে। [13]

### ছবি ও গ্রাফিক্স

8. **Image Format Converter** — PNG/JPG/WebP/AVIF-এ batch conversion, transparency/quality controls ও output preview; বিদ্যমান HEIC→JPG workflow পুনরাবৃত্তি না করে সেটি বাদ থাকবে। Squoosh-এর মতো browser-local workflow গোপনীয়তার সুবিধা দিতে পারে। [7]
9. **Image Metadata / EXIF Viewer & Remover** — GPS, camera, timestamp, author metadata দেখানো; নির্বাচিত বা সব metadata মুছে পরিষ্কার কপি export.
10. **Favicon & App Icon Generator** — একটি source image থেকে favicon ও app-icon size set, browser preview এবং ZIP download.
11. **SVG Optimizer** — SVG minify, whitespace/comment cleanup, output-size comparison, before/after preview; viewBox ও visual output অক্ষত আছে কি না যাচাই.
12. **AI Image Upscaler** — 2x/4x upscale, original-vs-result slider, output-size preview. iLoveIMG-এর মতো প্রতিযোগীরা AI upscaling অফার করে; Transformers.js browser-এ image-to-image মডেল চালাতে পারে। [14] [17]
13. **QR Code Reader** — uploaded image বা webcam থেকে QR scan, decoded text/URL দেখানো; user-এর ক্লিক ছাড়া link auto-open না করা। jsQR browser-side image pixels থেকে QR পড়তে পারে। [16]
14. **Image OCR / Image to Text** — photo/screenshot থেকে text extract, language choice, copy/download ও confidence indicators. PDF OCR-এর মডেল/engine পুনঃব্যবহার করা যাবে, তবে এটি আলাদা input workflow.

### ভিডিও ও অডিও

15. **Video to GIF** — source clip থেকে trim, frame-rate, width, loop এবং target-size controls. Ezgif-এর মতো টুলে এটি আলাদা, সুস্পষ্ট workflow হিসেবে রয়েছে। [8]
16. **GIF / Animated WebP Optimizer** — target file size, lossy/lossless settings, frame preview ও bulk download.
17. **Video Compressor** — resolution, bitrate ও output format control; compression-এর আগে আনুমানিক file-size/quality trade-off দেখানো.
18. **Audio Format Converter** — MP3/WAV/FLAC/M4A/OGG input-output, sample-rate/channel options, batch conversion. Broad conversion demand-এ CloudConvert 212 format/11 category এবং Ezgif-এ audio tools দেখা যায়। [8] [9]
19. **Speech-to-Text / Subtitle Generator** — browser-এ audio/video থেকে transcript, timestamps, SRT/VTT export; language select ও edit-before-download. Transformers.js automatic speech recognition সমর্থন করে। [14]

### Text ও Developer tools

20. **Text / Code Diff Checker** — 2-pane compare, line/word highlights, ignore-whitespace, unified diff ও file input. CyberChef-এ Diff আছে এবং dedicated diff services code/text use cases-ও তুলে ধরে। [11]
21. **JSON Diff Checker** — text-level diff-এর বদলে keys/values-এ added/removed/changed state, nested object expand/collapse.
22. **JSON ↔ YAML Converter** — bidirectional conversion, parse-error line/column, download/copy. Existing JSON formatter বা CSV-to-JSON-এর duplicate নয়.
23. **YAML Validator** — syntax, indentation, duplicate-key error ও line/column feedback; schema validation পরে যোগ করা যায়.
24. **XML Formatter / Validator** — beautify/minify, malformed nesting/attribute error, line-level diagnostics.
25. **SQL Formatter** — indentation, keyword casing এবং MySQL/PostgreSQL/SQLite dialect presets.
26. **JWT Debugger** — header/payload decode, expiry/claims inspection এবং local verification option; decode-কে signature verification বলা যাবে না.
27. **Base64 Encoder / Decoder** — text ও UTF-8-এর জন্য encode/decode, invalid input diagnostics এবং copy/download.
28. **URL Encoder / Decoder & Parser** — component-aware encode/decode এবং protocol/host/path/query/fragment breakdown.
29. **UUID Generator** — bulk v4 UUID generation, casing/format choices, copy/download.
30. **Word / Character Counter + Case Converter** — word/character/sentence/reading-time counts এবং uppercase/lowercase/title/sentence case. RapidTables-এর text catalog-এ word counter ও case converter রয়েছে। [10]

## ব্রাউজারে চালানোর বাস্তবতা

PDF.js PDF render/parse এবং pdf-lib PDF creation, page changes ও form fill-এ browser foundation দেয়। Tesseract.js browser OCR করে; Transformers.js browser-এ ONNX model চালায়, CPU/WASM এবং কিছু ক্ষেত্রে WebGPU ব্যবহার করে, এবং image/audio tasks সমর্থন করে। QR reader-ও সম্পূর্ণ client-side করা যায়। ফলে এই shortlist-এ কোনো tool-কে শুধু বড় model-এর কারণে বাদ দেওয়া বা VPS না আসা পর্যন্ত বন্ধ রাখার প্রয়োজন নেই। [12] [13] [14] [15] [16]

একবারের UX শর্ত: OCR, image upscaling, speech recognition এবং WASM-ভিত্তিক video/audio tools-এর model/runtime download ও processing সময় কম ক্ষমতার ফোনে লক্ষণীয় হতে পারে। তাই tool খোলার পরেই asset lazy-load, progress/cancel, size ও memory guard, এবং model cache দিন; VPS প্রস্তুত হলে প্রয়োজনমতো শুধু model weights/ফাইল সার্ভারে সরান। স্থানীয় file-processing-কে cloud upload বলে উপস্থাপন করবেন না।

## Release-এ আগে দেওয়ার ১০টি

**PDF Compressor, PDF to JPG/PNG, JPG/PNG to PDF, Fill & Sign PDF, OCR/Searchable PDF, Image Format Converter, QR Code Reader, Video to GIF, Text/Code Diff Checker, Word/Character Counter.** এগুলোতে competitor overlap ও ব্যবহারকারীর স্পষ্ট task intent—দুটোরই প্রমাণ তুলনামূলক শক্তিশালী। “সবার চেয়ে উন্নত” নিশ্চিত করা যায় না, তবে preview, batch controls, progress, clear privacy messaging ও mobile-friendly download flow-কে প্রতিটি basic competitor tool-এর চেয়ে ভালো করার নির্দিষ্ট সুযোগ ধরা যায়।

এটি গবেষণা ও shortlist; এই ধাপে কোনো code change বা deployment করা হয়নি। আলাদা চারটি English release সম্পন্ন না হওয়া পর্যন্ত implementation স্থগিত থাকবে, তাই নতুন live link এখনও নেই।

## References

[1]: https://www.similarweb.com/website/ilovepdf.com/ "Similarweb: iLovePDF Traffic & Engagement"
[2]: https://www.similarweb.com/website/smallpdf.com/ "Similarweb: Smallpdf Traffic & Engagement"
[3]: https://smallpdf.com/pdf-statistics "Smallpdf PDF statistics and usage trends"
[4]: https://www.adobe.com/acrobat/online.html "Adobe Acrobat online PDF and e-signing tools"
[5]: https://www.ilovepdf.com/ "iLovePDF online PDF tools"
[6]: https://www.iloveimg.com/ "iLoveIMG image editing catalog"
[7]: https://squoosh.app/ "Squoosh browser image optimizer"
[8]: https://ezgif.com/ "Ezgif online GIF maker and image editor"
[9]: https://cloudconvert.com/ "CloudConvert file converter and format catalog"
[10]: https://www.rapidtables.com/text/ "RapidTables text tools"
[11]: https://gchq.github.io/CyberChef/ "GCHQ CyberChef"
[12]: https://mozilla.github.io/pdf.js/ "Mozilla PDF.js"
[13]: https://pdf-lib.js.org/ "pdf-lib official documentation"
[14]: https://huggingface.co/docs/transformers.js/en/index "Hugging Face Transformers.js documentation"
[15]: https://tesseract.projectnaptha.com/ "Tesseract.js multilingual OCR"
[16]: https://github.com/cozmo/jsQR "jsQR browser QR-reading library"
[17]: https://www.iloveimg.com/upscale-image "iLoveIMG AI image upscaler"
