# AFTERHOURS Text Signal — inference service

This service powers `/tools/text-detector/` with server-side inference so the browser does not download a large model.

## Privacy defaults

- Submitted text is processed in memory and is not written to application storage.
- The FastAPI middleware returns `Cache-Control: no-store`.
- The app does not print request bodies or model inputs.
- Configure the reverse proxy/platform logs to avoid request-body logging as well.
- This service is intentionally stateless between requests.

## Model

Default model: `openai-community/roberta-base-openai-detector`. Override with `TEXT_DETECTOR_MODEL` when deploying a compatible binary text-classification model. Verify the exact model-weight license and permitted use for your deployment before launch.

The detector is English-oriented. It provides a model signal, not proof of authorship. Do not use its score as the sole basis for academic, employment, moderation or disciplinary decisions.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

The API listens on `http://127.0.0.1:8080` by default. The first inference downloads the model from the configured model registry unless the model has already been cached on the server.

## Connect the AFTERHOURS site

Run the site server with:

```bash
TEXT_DETECTOR_API_ORIGIN=http://127.0.0.1:8080 npm start
```

The browser only talks to the same-origin `/api/v1/text/*` endpoints. `server.mjs` proxies those requests to the private inference service, which keeps the model endpoint out of the public UI.

For production, put the inference service behind a private network or authenticated service-to-service boundary and keep request-body logging disabled. Add rate limiting at the edge before public launch.
