# AFTERHOURS Browser Tools — Source Package Notes

## What is included

This branch contains the 80 newly requested browser tools (the earlier set of 30 plus 50 additional tools), while preserving the original 25 tools. The English Tools Hub therefore has 105 active routes. The AI Text Detector remains disabled/Coming Soon; it is not counted as an active tool. Spanish-site files and Journal taxonomy pages are not part of the GitHub Pages artifact.

All tool processing is designed to run in the browser, without a paid inference API or processing backend. The shared browser-local allowance remains 10 successful actions per local day; HEIC → JPG keeps its separate existing counter. Browser model tools remain browser-inference tools; when VPS hosting is ready, the planned move is limited to model files, not user-file processing.

## Demand evidence

The 30-tool shortlist and the research for 50 additional candidates are retained in [`30-tool-market-shortlist-bn.md`](30-tool-market-shortlist-bn.md) and [`50-tool-market-research-bn.md`](50-tool-market-research-bn.md). These are evidence-based market shortlists, **not a verified ranking of the 80 highest-volume global keywords**. The sources include competitor usage claims, traffic estimates, ecosystem adoption signals, standards and competitor feature/limit evidence. Those signals are not interchangeable with unique visitors or monthly keyword volume; no exact global search-volume total is claimed.

## Build and QA

Run `npm test` for the repository checks. Run `node scripts/build-github-pages.mjs` to create the English-only project-site artifact under `public/`; the builder intentionally excludes Journal pages and the Spanish site. The release was checked with the test suite, a Chromium pass over all 50 additional tool routes using the GitHub Pages project base path, and representative local DOCX, image, audio, calculator, CSV and image-batch workflows.

## Publication status and hosting limitation

The owner has approved publishing on GitHub Pages while accepting its known response-header limitation. GitHub Pages does not honor the current `site/_headers` file, so response-level security headers (including CSP and other headers) will not carry over. The builder adds a page-level CSP only for the HEIC tool; this documents the limitation but does not replace the existing full response-header policy.

This is currently a local source branch and source-only package. Nothing was pushed, GitHub Pages was not enabled, and no deployment was run. The Pages workflow is manual-dispatch only. The remaining publication blocker is repository access: Pages is not enabled and the current GitHub token lacks Pages write permission. Do not publish until updated GitHub access is available. Cloudflare was not used.
