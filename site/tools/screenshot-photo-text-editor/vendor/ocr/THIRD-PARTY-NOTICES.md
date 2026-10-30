# OCR vendor notices

All runtime, core, and model binaries are copied unchanged from the versioned packages listed below. The corresponding license files and package metadata accompany them in this directory. The tool loads them only after the visitor selects **Run OCR**. The selected language model is cached by Tesseract.js in browser storage after download; this does not make the whole page reliably available offline.

## Tesseract.js browser runtime — 5.1.1

Source: [npm package metadata](https://registry.npmjs.org/tesseract.js/5.1.1) and [upstream repository](https://github.com/naptha/tesseract.js). License: Apache-2.0; the package's complete `LICENSE.md` is included as `licenses/tesseract.js-LICENSE.md`. The bundled dependency notices accompanying the browser runtime and worker are included in `licenses/tesseract.min.js.LICENSE.txt` and `licenses/worker.min.js.LICENSE.txt`.

## Tesseract.js WebAssembly core — 5.1.1

Source: [npm package metadata](https://registry.npmjs.org/tesseract.js-core/5.1.1) and [upstream repository](https://github.com/naptha/tesseract.js-core). License: Apache-2.0; the package's `LICENSE` is included as `licenses/tesseract.js-core-LICENSE`. All four core variants and their matching WASM binaries are present for SIMD/non-SIMD and LSTM/legacy selection.

## Language data — `@tesseract.js-data/{eng,ben,spa,fra,deu}` 1.0.0

The five `.traineddata.gz` files are copied byte-for-byte from each package's `4.0.0_best_int/` directory. Tesseract.js 5.1.1 uses this integerized “Tessdata Best” collection by default for LSTM-only OCR; its upstream language-data documentation says `tessdata_best` is the source. The [language-data repository](https://github.com/naptha/tessdata) describes these as integerized `tessdata_best` models. The [official `tessdata_best` repository](https://github.com/tesseract-ocr/tessdata_best) states that all model data are Apache-2.0 licensed. The repository Apache license is included as `licenses/tessdata_best-LICENSE`; the Tesseract.js language-data repository license is also retained as `licenses/naptha-tessdata-LICENSE`.

The npm registry metadata for each `@tesseract.js-data/*` package declares `MIT`; the exact per-language `package.json` metadata is preserved in `licenses/language-pack-metadata/`. The published model package tarballs do not include a standalone MIT license file. Both the package metadata and upstream Apache-2.0 model notices are recorded here rather than modifying or re-licensing the model files.

## Source package paths

- `tesseract.js@5.1.1`: `dist/tesseract.min.js`, `dist/worker.min.js`, and their `*.LICENSE.txt` files.
- `tesseract.js-core@5.1.1`: the four `tesseract-core*.wasm.js` modules and corresponding `.wasm` binaries.
- `@tesseract.js-data/{lang}@1.0.0`: `4.0.0_best_int/{lang}.traineddata.gz` for `eng`, `ben`, `spa`, `fra`, and `deu`.
