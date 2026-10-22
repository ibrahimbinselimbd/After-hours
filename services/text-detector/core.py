"""Dependency-free text-detector logic shared by the API and TEST ONLY tests."""
from __future__ import annotations

import re
import unicodedata

_WS_UNITS = re.compile(r"\S+")


def _is_word_char(char: str) -> bool:
    return unicodedata.category(char).startswith(("L", "N"))


def word_count(text: str) -> int:
    """Count Unicode letter/number words, matching the browser's property intent.

    A single internal apostrophe, underscore or hyphen joins adjacent word runs.
    Repeated separators and punctuation alone do not count as word characters.
    """
    count = 0
    in_word = False
    for index, char in enumerate(text):
        if _is_word_char(char):
            if not in_word:
                count += 1
            in_word = True
        elif char in "'’_-" and in_word and index + 1 < len(text) and _is_word_char(text[index + 1]):
            pass
        else:
            in_word = False
    return count


def split_segments(text: str, segment_words: int) -> list[str]:
    """Split on whitespace without dropping units or splitting a lexical word."""
    if segment_words < 1:
        raise ValueError("segment_words must be positive")
    segments: list[str] = []
    current: list[str] = []
    current_words = 0
    for unit in _WS_UNITS.findall(text):
        unit_words = word_count(unit)
        if current and current_words + unit_words > segment_words:
            segments.append(" ".join(current))
            current, current_words = [], 0
        current.append(unit)
        current_words += unit_words
    if current:
        segments.append(" ".join(current))
    return segments


def ai_label_index(detector) -> int:
    """Return the sole explicitly AI-like label; fail closed for ambiguity."""
    labels = getattr(getattr(detector, "config", None), "id2label", {}) or {}
    try:
        normalized = {int(index): str(label).strip().lower() for index, label in labels.items()}
    except (TypeError, ValueError):
        raise RuntimeError("model_label_mapping_unknown")
    if len(normalized) != 2 or set(normalized) != {0, 1}:
        raise RuntimeError("model_label_mapping_unknown")
    ai = {i for i, label in normalized.items() if any(x in label for x in ("fake", "ai", "generated", "machine", "synthetic"))}
    human = {i for i, label in normalized.items() if any(x in label for x in ("real", "human", "original", "organic"))}
    if len(ai) != 1 or len(human) != 1 or ai == human:
        raise RuntimeError("model_label_mapping_unknown")
    return next(iter(ai))


def model_window_size(detector, tokenizer) -> int:
    configured = int(getattr(detector.config, "max_position_embeddings", 512))
    tokenizer_limit = int(getattr(tokenizer, "model_max_length", configured))
    if tokenizer_limit > 100000:
        tokenizer_limit = configured
    special_tokens = tokenizer.num_special_tokens_to_add(pair=False)
    return max(1, min(configured, tokenizer_limit) - special_tokens)


def ai_score(text: str, tokenizer, detector, torch_module) -> tuple[float, int]:
    """Score every token exactly once or in overlapping full windows, never truncating."""
    ai_index = ai_label_index(detector)
    tokenized = tokenizer(text, add_special_tokens=False, truncation=False, return_attention_mask=False)
    input_ids = tokenized["input_ids"]
    window_size = model_window_size(detector, tokenizer)
    stride = max(1, window_size - 64)
    scores: list[float] = []
    for start in range(0, len(input_ids), stride):
        ids = input_ids[start : start + window_size]
        if not ids:
            break
        encoded = tokenizer.prepare_for_model(ids, return_tensors="pt", truncation=False)
        with torch_module.inference_mode():
            logits = detector(**encoded).logits
            probabilities = torch_module.softmax(logits, dim=-1)[0]
        if probabilities.numel() != 2:
            raise RuntimeError("model_label_mapping_unknown")
        scores.append(float(probabilities[ai_index].item() * 100.0))
        if start + window_size >= len(input_ids):
            break
    if not scores:
        raise RuntimeError("empty_tokenization")
    return sum(scores) / len(scores), len(scores)


def error_code(exc: Exception) -> str:
    return str(exc) if str(exc) in {"model_label_mapping_unknown", "empty_tokenization"} else "inference_unavailable"


def authorized(supplied: str, expected: str | None) -> bool:
    import hmac
    return expected is None or hmac.compare_digest(supplied or "", expected)


def validate_limits(words: int, chars: int, mode: str, max_words: int, max_chars: int) -> tuple[int, str | None]:
    minimum = 80 if mode == "article" else 60
    if words < minimum:
        return minimum, "text_too_short"
    if words > max_words or chars > max_chars:
        return max_words, "text_too_long"
    return minimum, None
