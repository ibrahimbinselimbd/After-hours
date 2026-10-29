# Verified official references for the AFTERHOURS GitHub-only release

## GitHub Pages
- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages — GitHub Pages serves static HTML, CSS and JavaScript from a repository; project sites use a repository subpath.
- https://docs.github.com/articles/creating-project-pages-manually — GitHub Free/Free-for-orgs require the repository to be public for Pages; private-repository public sites are available only if the account plan/organization allows it. Pages sites are public on the internet. Source branches or Actions workflows can publish.

## Browser-local runtimes/models
- https://github.com/naptha/tesseract.js/blob/master/docs/api.md — Tesseract.js worker setup, language-data paths, logger/progress, recognition, and terminate() lifecycle.
- https://huggingface.co/docs/transformers.js/en/index — Transformers.js runs ONNX models in browser; pipelines include image-to-image and automatic speech recognition; browser CPU/WASM is default and WebGPU is experimental.
- https://huggingface.co/docs/transformers.js/en/api/pipelines#image-to-image — official image-to-image pipeline docs include Swin2SR super-resolution usage.
- https://huggingface.co/Xenova/swin2SR-compressed-sr-x4-48 — official ONNX-compatible Swin2SR model card and Transformers.js usage example.
- https://ffmpegwasm.netlify.app/docs/getting-started/usage/ — official FFmpeg.wasm usage: local virtual filesystem, core assets, progress limits and timeout examples.

## GIF encoder runtime
- https://github.com/mattdesl/gifenc — official README/API for a pure-JavaScript browser GIF encoder, including frame timing, repeat, transparency, and output bytes.
- https://raw.githubusercontent.com/mattdesl/gifenc/main/package.json — official metadata confirms gifenc 1.0.3, ESM, MIT license.
- https://raw.githubusercontent.com/mattdesl/gifenc/main/LICENSE.md — official MIT license; preserve copyright and license in the distributed repository.
