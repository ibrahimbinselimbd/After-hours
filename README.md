# AFTERHOURS — English site and Tools Hub

The English editorial site and Tools Hub live together in `site/` as one website. This source snapshot includes the latest reading layout, footer, article images, homepage article-link fix, and the refreshed 3D Tools header icon.

## Run locally

Requires Node.js 18 or newer. No dependencies or credentials are needed.

```sh
npm start
```

Open http://127.0.0.1:4173. Set `PORT` to use another local port.

Routes: `/` (home), `/article?story=...` (article), `/info?page=...` (information), and `/tools/` (Tools Hub). The original `.html` URLs also work. A future hosting setup must preserve these route mappings and query strings.

## Tools Hub status and access plan

The Tools Hub is published on the English site at `/tools/`, with ten categories and 100 planned tools. **Bulk Image Background Remover**, **Image Size Optimizer**, and **QR Code Generator & Print Checker** are linked from Tools Hub → Image & Design. Remaining categories are planned, except for the explicitly gated Text Signal preview below.

**Text Signal frontend preview is published; real analysis is Coming soon / Not live.** Open https://afterhours-district.bird-timimus.workers.dev/tools/text-detector/ or Tools Hub → AI & Everyday Utilities → Preview tool. The responsive editor, samples, word limits, and home/back/category navigation work. Analyze is disabled through an explicit `data-analysis-enabled="false"` release gate; this preview sends neither health nor analysis API requests and shows no simulated results. The current Cloudflare static site does not run `server.mjs`, Python, FastAPI, or model inference. Its backend remains source-only for a future approved host. See [`services/text-detector/README.md`](services/text-detector/README.md) for host, cache, privacy, licensing, and real-smoke-test requirements.

Run `npm test` for safe client/proxy/backend logic tests without downloading a model. For optional browser smoke tests, install Python Playwright and Chromium, then run `python3 tests/browser-text-detector.py https://afterhours-district.bird-timimus.workers.dev`. The browser check covers 320/390/768/1280px layouts, assets, navigation, samples, maximum input warnings and the disabled analysis gate. Its temporary screenshots/reports do not belong in Git.

The established launch plan remains: **10 free credits per user per day, every tool available through free credits, and no premium-only tier or premium-only tools.** Per-tool credit costs will be defined before launch. The preview does not issue or consume credits. The remover is accessed at `/tools/background-remover/`; the first run requires an internet connection to load its version-pinned browser engine and model. Selected images are processed locally and are not uploaded to an AI inference API.

### QR Code Generator & Print Checker

Open `/tools/qr-code-generator/` or Tools Hub → Image & Design. This static, entirely client-side tool supports HTTP(S) URLs, escaped Wi-Fi payloads (WPA/WPA2, WEP, open and hidden networks), and Unicode text. Locally vendored qrcode-generator 1.4.4 (MIT) and jsQR 1.4.0 (Apache-2.0) generate the code and independently decode the actual rendered canvas. Both decoded text and UTF-8 bytes must match before PNG/SVG downloads unlock. Exports have an enforced four-module quiet zone and matching colors. SVG uses the selected full print width in millimetres; PNG has integer-pixel modules. The Print action uses the selected full width, subject to the browser/printer settings.

All features are free. One successful generate-and-verify operation consumes one of **10 daily browser-local credits**, shared with Image Size Optimizer through `afterhours:daily-credits`. Failed operations and repeat downloads consume none. Credits reset at local midnight, are not account-wide or server-enforced, and can be reset by clearing local storage. When storage is unavailable, a visible notice explains that counting lasts only for the open page. Web Locks serialize credit use across supported tabs. No payload, image, Wi-Fi credential, or destination URL is sent to a server by this tool; its page CSP explicitly disallows network connections. Static page/library/font loading still requires a normal initial page request. There are no dynamic redirects, tracking, analytics or paid backend services.

Print advice checks the fixed quiet zone, a practical dark-on-light contrast heuristic of at least 4.5:1, and a practical minimum module size of 0.4 mm. These are advisory, not QR certification or an all-device scan guarantee. Test a physical print with the intended printers, paper, sizes and scanning devices.

Optional real-browser QA: install Python Playwright, Pillow, CairoSVG and Chromium, then run `python3 tests/qr-browser.py http://127.0.0.1:4173 /tmp/afterhours-qr-qa` (or use the production origin). This checks payload round trips, downloads, quiet zone, credit behaviour, mobile/desktop layout, navigation and absence of payload network traffic. Test artifacts and credentials do not belong in Git.

## English production deployment

The owner approved publishing this integration to **the English Worker only** (`afterhours-district`) on 22 October 2026. The live homepage is https://afterhours-district.bird-timimus.workers.dev/ and the canonical hub is https://afterhours-district.bird-timimus.workers.dev/tools/.

`wrangler.jsonc` intentionally targets only that English Worker and its existing account. It serves `site/` as static assets, with directory indexes using trailing slashes. `/tools` redirects to `/tools/`; the old `/tools.html` URL redirects there too. `/article?story=...` and `/info?page=...` retain their existing clean-URL and query-string behavior. No deployment workflow runs automatically on push.

After reviewing a change, use the authorized Cloudflare connection or `npx wrangler deploy --config wrangler.jsonc` with the correct account. Do not change the Worker name, account, or Spanish Worker. Keep deployed `site/` assets and GitHub `main` aligned for approved production changes. No production credentials, temporary claim URLs, upload tokens, or verification screenshots belong in the repository. The owner approved **English static detector frontend preview only**; backend hosting, API routing, enabling analysis and any paid services require separate approval. Static frontend deployment `e041d68ce0d84a8eb441d19e725cdf81` was verified without altering the Spanish Worker.

## English link-audit fixes

The homepage, Tools Hub and information desk use `/#feed` for the journal. Background Remover's Image & Design breadcrumb opens `/tools/?category=image-design#categories`, including the actual category panel.

Corrections & feedback is intentionally a non-interactive **Feedback contact coming soon** status, not a dead link, personal email, GitHub Issues link or form. `/info?page=contact#corrections` remains a valid explanatory section for old bookmarks; it collects and submits nothing. A monitored, dedicated public site email is still required before enabling feedback. Information/legal pages remain visibly **Draft**, pending verified publisher/business/contact details, actual practices and any applicable jurisdiction-specific review. No jurisdiction is assumed.

With the optional Python Playwright/Chromium setup above, run `python3 tests/browser-link-audit.py http://127.0.0.1:4173` (or the English production origin). It checks 320/390/768/1280px layouts, journal destinations, category navigation, all eight Draft pages, no feedback forms/submissions, article navigation, and image queue add/clear behavior without downloading the cutout model. Existing article content, illustration assets, reading styles, tool logic and category definitions are unchanged by this release. Spanish is a separate Worker and is not a deployment target.
