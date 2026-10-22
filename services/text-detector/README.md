# AFTERHOURS Text Signal — future inference service

This directory contains a **source-only, not deployed** FastAPI inference service for the `/tools/text-detector/` UI. The approved work in this repository is preparation for a future host; it does not provision infrastructure, purchase a model/API plan, or deploy anything.

## Current status and safety boundary

- The current Cloudflare site is static. It does **not** run `server.mjs`, Python, FastAPI, or model inference.
- The English static frontend preview is published at `/tools/text-detector/`. Its `data-analysis-enabled="false"` release gate disables Analyze and all API requests. Preview/editor interaction is not inference. Keep Coming soon / Not live visible until the real launch checks below pass.
- A future integration still needs an actual Worker/reverse proxy implementation for the `/api` routes (including upstream auth/timeouts); the static asset configuration alone is not a complete integration.
- Do not point the public UI at this service until a host, private service boundary, authentication, rate limits, privacy policy, and a real smoke test are approved.
- The tests in `tests/test_text_detector_backend.py` use explicit **TEST ONLY** tokenizer/model/torch stubs. They validate accounting and control flow, not the quality or validity of downloaded weights.
- The detector is an English-oriented probabilistic signal, not proof of authorship. Never use it as the sole basis for academic, employment, moderation, or disciplinary action.

## Model, labels, and licensing

The default model is `openai-community/roberta-base-openai-detector`. Before any host is launched, review and record the exact model-weight license, tokenizer/license terms, acceptable-use terms, and any registry terms for the selected revision. The app fails closed unless a binary classifier explicitly maps exactly one class to an AI/fake/generated-like label and exactly one to a human/real/original-like label; it never guesses from `LABEL_0`/`LABEL_1` or arbitrary argmax order.

## API behavior and limits

- `GET /health` loads and validates the model; `200` means ready, while model/dependency/download/label failures return `503 not_ready`.
- `POST /v1/text/analyze` accepts `{ "text": "...", "mode": "article" | "prompt" }`.
- Minimums are 80 words for `article` and 60 for `prompt`; maximums are 8,000 words and 50,000 characters.
- Unicode letters and numbers are counted consistently with the browser. A single internal apostrophe, underscore or hyphen joins word runs; repeated separators and punctuation alone do not count as words.
- All accepted words are retained in `coverage.scored_words`. There is no segment-count cutoff. Segment boundaries preserve every non-whitespace input unit.
- Tokenization uses `truncation=False` and overlapping full windows. `coverage.token_windows` reports the work performed; long inputs are not silently reduced to one model window.
- Structured errors include `text_too_short`, `text_too_long`, `unauthorized`, `inference_busy`, `model_label_mapping_unknown`, and `inference_unavailable` as applicable.

For a real deployment, set `TEXT_DETECTOR_API_KEY`; requests to `/v1/` must send the same secret in `X-API-Key`. Keep the service private and add edge/service-to-service rate limiting before exposing it through a proxy. Suggested starting controls are one concurrent inference, a short request timeout, bounded upstream timeout, and per-user/IP quotas appropriate to the host; tune them only after measuring CPU/RAM. Do not log request bodies or model inputs.

## Future host setup

Requirements: Python 3.11+, outbound registry access on first model load (or a pre-populated cache), enough RAM/CPU for PyTorch and the model, persistent disk for the cache, and a long-lived process manager. An accelerator is optional and must be evaluated separately. Model download and inference can be slow and memory-intensive; do not run this on a static asset host.

```bash
cd services/text-detector
python3.11 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env                 # edit; do not commit the real file
set -a; . ./.env; set +a
python app.py
```

For Docker, build from this directory and mount `/data/huggingface` (or the path selected by `HF_HOME`) as a persistent volume. Without a persistent cache, restarts may redownload large weights. Keep the API behind TLS/private networking and a process supervisor; do not treat the example Dockerfile as a complete production hardening profile.

## Connect the same-origin site proxy later

The repository root `server.mjs` serves the English site and proxies only `GET /api/v1/text/health` and `POST /api/v1/text/analyze` to the Python service. It forwards the server-only `TEXT_DETECTOR_API_KEY`, validates input before forwarding, enforces a 320 KiB body limit, times out upstream requests after 120 seconds, refuses redirects, and rejects success responses that do not confirm complete text coverage. An unset origin returns `503 service_not_configured`; no production mocks or heuristic fallback exist.

For local development, start Python on loopback port 8080, then in a second terminal at the repository root:

```bash
# Export the SAME secret set on Python, using your host's secret manager in production.
# Leave the origin blank until a real service exists. This loopback value is local only.
export TEXT_DETECTOR_API_ORIGIN=http://127.0.0.1:8080
export HOST=127.0.0.1 PORT=4173
npm start
```

Open `http://127.0.0.1:4173/tools/text-detector/`. For a separate remote Python host, set its actual **HTTPS origin only**, without credentials, paths, query strings or fragments. Set the same API secret on both processes; never expose it through browser code. Configure environment variables through the host: Node does not automatically read `.env`. A Node host may need `HOST=0.0.0.0` behind its TLS reverse proxy. Keep Python private and do not expose its port directly to the Internet.

For the existing Cloudflare static site, `wrangler.jsonc` remains unchanged. It will **not** execute this Node proxy or Python service. After hosting is obtained, separately implement and test an authenticated Cloudflare Worker/reverse-proxy route for `/api/v1/text/*`, or serve the whole English site through this Node server on a compatible host. That production routing and deployment remain future work requiring approval. Do not simply publish static assets and describe the detector as functional.

## Safe source tests (no model download or hosting needed)

At the repository root, run `npm test` with Node.js 18+ and Python 3.11+. It runs client VM tests, local HTTP proxy tests and dependency-free Python logic tests. All mock responses/stubs are explicitly TEST ONLY; production modules never import them. These tests do not execute FastAPI end-to-end or real downloaded-model inference. The current source has not passed a real-model production smoke test.

## Real smoke test (future host only)

After the image/model license and host are approved, first run `curl http://127.0.0.1:8080/health` and require `status=ready`. Then use a local-only sample of at least 80 words (never paste private user content into a smoke test):

```bash
python - <<'PY' > /tmp/detector-payload.json
import json
text = " ".join(["This is a local smoke-test sentence for the detector."] * 16)
print(json.dumps({"mode": "article", "text": text}))
PY
curl -sS -H "Content-Type: application/json" -H "X-API-Key: ${TEXT_DETECTOR_API_KEY}" \
  --data-binary @/tmp/detector-payload.json http://127.0.0.1:8080/v1/text/analyze
```

Verify `ok: true`, `coverage.complete: true`, `coverage.scored_words == word_count`, nonzero `token_windows`, and a plausible segment list. This proves host/model wiring only; it does not validate detector accuracy. Remove the sample and any logs containing it after testing.

Before enabling browser analysis, obtain the owner's launch approval, validate real same-origin API success/failure, authentication and abuse controls, test 60/80-word minimums and the complete 8,000-word/50,000-character boundary with real model inference, and review desktop/mobile result rendering. Only then change the page's `data-analysis-enabled` flag to `true` and replace the static Coming soon notices/button copy with accurate live-service wording. Preserve the prominent English-oriented, probabilistic-signals-not-proof disclaimer. Re-run all tests and deploy the matching source; do not merely flip the flag on a static-only host.

## Privacy and operations checklist

Keep submitted text in memory only, disable request-body/application debug logs, return `Cache-Control: no-store`, restrict outbound/inbound network access, rotate the API key, monitor latency/503s/RAM/disk, and set explicit reverse-proxy body and timeout limits. Establish retention, deletion, incident-response, and user-notice policy before launch. No paid service, production credential, or deployment action is included in this source-only change.
