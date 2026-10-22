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

The Tools Hub is published on the English site at `/tools/`, with ten categories and 100 planned tools. The first integrated utility is **Bulk Image Background Remover**, linked from Tools Hub → Image & Design. It processes images in the browser using a local model/runtime; remaining utilities and credit accounting are not implemented.

The established launch plan remains: **10 free credits per user per day, every tool available through free credits, and no premium-only tier or premium-only tools.** Per-tool credit costs will be defined before launch. The preview does not issue or consume credits. The remover is accessed at `/tools/background-remover/`; the first run requires an internet connection to load its version-pinned browser engine and model. Selected images are processed locally and are not uploaded to an AI inference API.

## English production deployment

The owner approved publishing this integration to **the English Worker only** (`afterhours-district`) on 22 October 2026. The live homepage is https://afterhours-district.bird-timimus.workers.dev/ and the canonical hub is https://afterhours-district.bird-timimus.workers.dev/tools/.

`wrangler.jsonc` intentionally targets only that English Worker and its existing account. It serves `site/` as static assets, with directory indexes using trailing slashes. `/tools` redirects to `/tools/`; the old `/tools.html` URL redirects there too. `/article?story=...` and `/info?page=...` retain their existing clean-URL and query-string behavior. No deployment workflow runs automatically on push.

After reviewing a change, use the authorized Cloudflare connection or `npx wrangler deploy --config wrangler.jsonc` with the correct account. Do not change the Worker name, account, or Spanish Worker. Keep the deployed `site/` assets and GitHub `main` aligned. No production credentials, temporary claim URLs, upload tokens, or verification screenshots belong in the repository.
