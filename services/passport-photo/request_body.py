class BodyTooLarge(Exception):
    """Raised when a streamed request exceeds its configured byte limit."""


async def read_limited_body(request, max_bytes: int) -> bytes:
    """Read request chunks only up to max_bytes, rejecting oversized bodies early."""
    content_length = request.headers.get("content-length", "")
    if content_length.isdigit() and int(content_length) > max_bytes:
        raise BodyTooLarge

    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > max_bytes:
            raise BodyTooLarge
        body.extend(chunk)
    return bytes(body)
