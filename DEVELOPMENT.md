# AFTERHOURS development and testing

## Open the project in GitHub Codespaces

1. Open [AFTERHOURS in Codespaces](https://codespaces.new/ibrahimbinselimbd/After-hours).
2. Select the `feature/github-dev-testing` branch while the setup pull request is under review, or use `main` after it is merged.
3. Wait for the dev container to build. It includes Node.js 22 and Python 3.12 and runs `npm test` once after creation.
4. In the terminal, run `npm start`. Port 4173 is forwarded automatically; open the forwarded port to preview the site.

The container binds the local preview to the container interface so Codespaces port forwarding works. Forwarded ports should remain private unless you deliberately change their visibility in Codespaces.

## Local development

Requirements: Node.js 18 or newer and Python 3.12 (for the Python unit tests).

```sh
npm test
npm start
```

The local preview is available at http://127.0.0.1:4173.

## Automated checks

GitHub Actions runs `npm test` on pushes and pull requests, using Node.js 22 and 24 plus Python 3.12. The workflow uses read-only repository permissions and does not deploy the production site.

The existing test command covers JavaScript syntax checks, Node.js unit tests, and Python unit tests. Run it before requesting review.

## Browser checks and real-model checks are separate

Optional browser scripts in `tests/` may require Playwright, Chromium, Pillow, or CairoSVG. Follow the individual script instructions and keep generated screenshots/reports out of Git.

Unit tests that use explicit stubs or mock responses do **not** prove the quality or speed of a real AI model. The Passport & Visa Photo Studio background-removal model must be installed and tested on the approved self-hosted server separately. Test upload limits, concurrency, temporary-file cleanup, privacy headers/logging, and error handling before enabling it for public users.

## Manual production deployment to Cloudflare

Production deployment is deliberately manual. Before deploying, add these repository Actions secrets in Settings → Secrets and variables → Actions:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with permission to deploy Workers and manage the required Worker assets for this account.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID that owns the `afterhours-district` Worker.

Never paste either value into chat or commit it to the repository. After adding the secrets, open Actions → Deploy AFTERHOURS to Cloudflare Workers → Run workflow on `main`. Verify the workflow succeeds, then check the live Worker URL and test `/tools/` and `/tools/passport-photo-studio/`.

The Passport & Visa Photo Studio's browser-local crop, resize, JPEG export and print-sheet functions do not require the AI service. AI background removal remains unavailable until the self-hosted model service is deployed and `PASSPORT_PHOTO_SERVICE_ORIGIN` plus `PASSPORT_PHOTO_SERVICE_TOKEN` are configured as Worker secrets/variables.

## Secrets and user data

- Never commit API keys, SSH private keys, VPS credentials, real user photos, test uploads, or `.env` files.
- Use GitHub Actions secrets only when a workflow genuinely needs them; the current test workflow needs no secrets.
- Do not configure an automatic production deployment from ordinary pushes. Review and explicitly authorize production releases.
