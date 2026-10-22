"""Backend tests; model/tokenizer objects here are explicit TEST ONLY stubs.

These tests validate request accounting and control flow, not real inference quality.
They intentionally require no torch or transformers installation.
"""
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "text-detector"))
from core import ai_label_index, ai_score, authorized, error_code, split_segments, validate_limits, word_count


class TestOnlyConfig:
    def __init__(self, labels=None, max_position_embeddings=8):
        self.id2label = labels or {0: "LABEL_0", 1: "LABEL_1"}
        self.max_position_embeddings = max_position_embeddings


class TestOnlyDetector:
    def __init__(self, labels=None, max_position_embeddings=8):
        self.config = TestOnlyConfig(labels, max_position_embeddings)
        self.calls = []

    def __call__(self, **encoded):
        self.calls.append(encoded["input_ids"])
        return types.SimpleNamespace(logits=types.SimpleNamespace())


class TestOnlyTokenizer:
    model_max_length = 8

    def __init__(self, count):
        self.count = count
        self.truncation_values = []
        self.prepared = []

    def __call__(self, text, **kwargs):
        self.truncation_values.append(kwargs.get("truncation"))
        return {"input_ids": list(range(self.count))}

    def num_special_tokens_to_add(self, pair=False):
        return 2

    def prepare_for_model(self, ids, **kwargs):
        self.prepared.append((list(ids), kwargs.get("truncation")))
        return {"input_ids": ids}


class TestOnlyProbability:
    def __init__(self, value): self.value = value
    def numel(self): return 2
    def __getitem__(self, index): return self
    def item(self): return self.value


class TestOnlyTorch:
    class _Context:
        def __enter__(self): return self
        def __exit__(self, *args): return False
    def inference_mode(self): return self._Context()
    def softmax(self, logits, dim=-1): return [TestOnlyProbability(0.8), TestOnlyProbability(0.2)]


class BackendTests(unittest.TestCase):
    def test_unicode_word_count_matches_letter_number_intent(self):
        self.assertEqual(word_count("naïve 中文 123 你好-world _ -- don't"), 5)
        self.assertEqual(word_count("!!! ___"), 0)
        self.assertEqual(word_count("a--b a__b a''b a_-b"), 8)
        self.assertEqual(word_count("a_b well-known don't"), 3)

    def test_all_8000_words_are_retained_across_segments(self):
        text = " ".join(f"word{i}" for i in range(8000))
        segments = split_segments(text, 180)
        self.assertEqual(sum(word_count(segment) for segment in segments), 8000)
        self.assertEqual(len(segments), 45)
        self.assertEqual(" ".join(segments), text)

    def test_token_windows_disable_truncation_and_cover_long_input(self):
        tokenizer = TestOnlyTokenizer(20)
        detector = TestOnlyDetector({0: "human", 1: "AI-generated"}, max_position_embeddings=8)
        score, windows = ai_score("long", tokenizer, detector, TestOnlyTorch())
        self.assertEqual(score, 80.0)
        self.assertEqual(windows, 15)  # window 6, stride 1: starts 0 through 14
        self.assertEqual(tokenizer.truncation_values, [False])
        self.assertTrue(all(truncation is False for _, truncation in tokenizer.prepared))
        self.assertEqual(len(detector.calls), windows)
        self.assertEqual({token for window in detector.calls for token in window}, set(range(20)))

    def test_unknown_or_ambiguous_model_labels_fail_closed(self):
        for labels in ({0: "LABEL_0", 1: "LABEL_1"}, {0: "AI", 1: "AI"}, {0: "human", 1: "other"}):
            with self.assertRaisesRegex(RuntimeError, "model_label_mapping_unknown"):
                ai_label_index(TestOnlyDetector(labels))
        self.assertEqual(ai_label_index(TestOnlyDetector({0: "human", 1: "fake"})), 1)

    def test_minimum_and_maximum_limits_are_structured(self):
        self.assertEqual(validate_limits(79, 100, "article", 8000, 50000)[1], "text_too_short")
        self.assertEqual(validate_limits(60, 100, "prompt", 8000, 50000)[1], None)
        self.assertEqual(validate_limits(8001, 100, "article", 8000, 50000)[1], "text_too_long")
        self.assertEqual(validate_limits(80, 50001, "article", 8000, 50000)[1], "text_too_long")

    def test_auth_and_error_mapping(self):
        self.assertTrue(authorized("secret", "secret"))
        self.assertFalse(authorized("wrong", "secret"))
        self.assertTrue(authorized("anything", None))
        self.assertEqual(error_code(RuntimeError("model_label_mapping_unknown")), "model_label_mapping_unknown")
        self.assertEqual(error_code(RuntimeError("database exploded")), "inference_unavailable")


if __name__ == "__main__":
    unittest.main()
