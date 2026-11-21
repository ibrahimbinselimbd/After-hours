import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "text-detector"))
from core import authorized


class TextDetectorAuthTests(unittest.TestCase):
    def test_missing_or_empty_server_key_never_authorizes(self):
        self.assertFalse(authorized("anything", None))
        self.assertFalse(authorized("anything", ""))
        self.assertFalse(authorized("", None))

    def test_supplied_key_must_match_the_configured_secret(self):
        self.assertTrue(authorized("test-only-secret", "test-only-secret"))
        self.assertFalse(authorized("wrong", "test-only-secret"))
        self.assertFalse(authorized("", "test-only-secret"))


if __name__ == "__main__":
    unittest.main()
