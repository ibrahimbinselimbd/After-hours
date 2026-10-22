# AFTERHOURS — English site and Tools Hub

The English editorial site and Tools Hub live together in `site/` as one website. This source snapshot includes the latest reading layout, footer, article images, homepage article-link fix, and the refreshed 3D Tools header icon.

## Run locally

Requires Node.js 18 or newer. No dependencies or credentials are needed.

```sh
npm start
```

Open http://127.0.0.1:4173. Set `PORT` to use another local port.

Routes: `/` (home), `/article?story=...` (article), `/info?page=...` (information), and `/tools` (Tools Hub). The original `.html` URLs also work. A future hosting setup must preserve these route mappings and query strings.

## Tools Hub status and access plan

The Tools Hub remains a staged preview with ten categories and 100 planned tools. The first integrated utility is **Bulk Image Background Remover**, linked from Tools Hub → Image & Design. It processes images in the browser using a local model/runtime; remaining utilities and credit accounting are not implemented.

The established launch plan remains: **10 free credits per user per day, every tool available through free credits, and no premium-only tier or premium-only tools.** Per-tool credit costs will be defined before launch. The preview does not issue or consume credits. The remover is accessed at `/tools/background-remover/`; the first run requires an internet connection to load its version-pinned browser engine and model. Selected images are processed locally and are not uploaded to an AI inference API.

## Production safety

This repository snapshot does not deploy or modify either live English or Spanish site. It contains no production deployment workflow, Cloudflare account bindings, API credentials, claim URLs, temporary deployment files, or verification screenshots. Before connecting hosting or merging into a deployment branch, explicitly review and approve the production deployment settings.
