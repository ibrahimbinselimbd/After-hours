import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "passport-photo"))
from request_body import BodyTooLarge, read_limited_body


class FakeRequest:
    def __init__(self, chunks, headers=None):
        self.headers = headers or {}
        self.chunks = list(chunks)
        self.stream_called = False
        self.yielded = 0

    async def stream(self):
        self.stream_called = True
        for chunk in self.chunks:
            self.yielded += 1
            yield chunk


class PassportPhotoRequestBodyTests(unittest.TestCase):
    def test_body_within_limit_is_returned_without_modification(self):
        request = FakeRequest([b"123", b"456"], {"content-length": "6"})
        self.assertEqual(asyncio.run(read_limited_body(request, 6)), b"123456")
        self.assertEqual(request.yielded, 2)

    def test_declared_oversize_is_rejected_without_reading_the_stream(self):
        request = FakeRequest([b"ignored"], {"content-length": "11"})
        with self.assertRaises(BodyTooLarge):
            asyncio.run(read_limited_body(request, 10))
        self.assertFalse(request.stream_called)

    def test_chunked_oversize_is_rejected_at_the_first_excess_chunk(self):
        request = FakeRequest([b"1234", b"567", b"never-read"], {})
        with self.assertRaises(BodyTooLarge):
            asyncio.run(read_limited_body(request, 6))
        self.assertEqual(request.yielded, 2)


if __name__ == "__main__":
    unittest.main()
