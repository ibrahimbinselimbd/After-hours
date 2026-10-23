# AFTERHOURS Passport Photo Model
Self-hosted, optional background isolation service. Crop, size and print run in the browser.

- The user explicitly opts into sending the image to this service.
- Images and outputs are processed in memory only; no image file/database/object storage is written.
- Uvicorn access logs are disabled in the Docker command. Do not enable body logging in a reverse proxy.
- Model weights must be staged locally at /models/birefnet-portrait.onnx. The service refuses runtime model downloads. The default is BiRefNet Portrait for human-subject segmentation; benchmark it on your server hardware and verify its model licence/provenance before launch.
- Review model provenance/licence before deployment. Do not commit model weights or customer photos.
- Set PASSPORT_PHOTO_SERVICE_TOKEN to a random secret of at least 32 characters.
- Keep the service on private compute behind HTTPS and a firewall; do not expose it publicly without rate limiting and authentication.
- Set PASSPORT_PHOTO_SERVICE_ORIGIN to your server's HTTPS origin and the same token as a Worker secret. The Worker must forward /api/v1/passport-photo/background-remove to /v1/background-remove.
- This is not an official government service. Strict photo profiles disable background editing. Never use background replacement if your issuing authority prohibits it.
