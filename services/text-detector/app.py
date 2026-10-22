import hmac
import os
import threading
from contextlib import contextmanager
from typing import Literal

try:
    import torch
except ImportError:  # permits dependency-free health/error tests; inference stays unavailable
    torch = None
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
try:
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
except ImportError:  # permits dependency-free health/error tests; inference stays unavailable
    AutoModelForSequenceClassification = AutoTokenizer = None
from core import ai_label_index, ai_score, error_code, split_segments, validate_limits, word_count

MODEL_ID = os.getenv("TEXT_DETECTOR_MODEL", "openai-community/roberta-base-openai-detector")
MAX_CHARS = int(os.getenv("TEXT_DETECTOR_MAX_CHARS", "50000"))
MAX_WORDS = int(os.getenv("TEXT_DETECTOR_MAX_WORDS", "8000"))
SEGMENT_WORDS = int(os.getenv("TEXT_DETECTOR_SEGMENT_WORDS", "180"))
MAX_INFERENCE_CONCURRENCY = int(os.getenv("TEXT_DETECTOR_MAX_INFERENCE_CONCURRENCY", "1"))
INFERENCE_TIMEOUT_SECONDS = float(os.getenv("TEXT_DETECTOR_INFERENCE_TIMEOUT_SECONDS", "30"))
API_KEY = os.getenv("TEXT_DETECTOR_API_KEY")

if MAX_CHARS < 1 or MAX_WORDS < 1 or SEGMENT_WORDS < 1 or MAX_INFERENCE_CONCURRENCY < 1:
    raise ValueError("text detector limits must be positive")

app = FastAPI(title="AFTERHOURS Text Signal", version="1.1.0", docs_url=None, redoc_url=None)
tokenizer = None
model = None
_model_lock = threading.Lock()
_inference_slots = threading.BoundedSemaphore(MAX_INFERENCE_CONCURRENCY)


class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_CHARS)
    mode: Literal["article", "prompt"] = "article"


def get_model():
    global tokenizer, model
    if tokenizer is None or model is None:
        with _model_lock:
            if tokenizer is None or model is None:
                if AutoTokenizer is None or AutoModelForSequenceClassification is None or torch is None:
                    raise RuntimeError("inference_dependencies_unavailable")
                loaded_tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
                loaded_model = AutoModelForSequenceClassification.from_pretrained(MODEL_ID)
                loaded_model.eval()
                # Refuse a model with no explicit semantic mapping before serving it.
                ai_label_index(loaded_model)
                tokenizer, model = loaded_tokenizer, loaded_model
    return tokenizer, model


def build_assessment(score: float):
    if score >= 75:
        return "likely_ai", "The model found a stronger AI-like signal in this sample. This is not proof that AI wrote the text."
    if score <= 25:
        return "likely_human", "The model found a weaker AI-like signal in this sample. That does not prove a human wrote it."
    return "mixed_signals", "The model produced a middle-range signal. Treat the result as inconclusive without additional evidence."


@contextmanager
def inference_slot():
    acquired = _inference_slots.acquire(timeout=INFERENCE_TIMEOUT_SECONDS)
    if not acquired:
        raise HTTPException(status_code=503, detail={"error": "inference_busy", "retryable": True})
    try:
        yield
    finally:
        _inference_slots.release()


@app.middleware("http")
async def security_and_auth(request: Request, call_next):
    if API_KEY and request.url.path.startswith("/v1/"):
        supplied = request.headers.get("x-api-key", "")
        if not hmac.compare_digest(supplied, API_KEY):
            return JSONResponse(status_code=401, content={"ok": False, "error": "unauthorized"})
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.get("/health")
def health():
    try:
        get_model()
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "not_ready", "model": MODEL_ID, "error": "model_unavailable"})
    return {"status": "ready", "model": MODEL_ID}


@app.post("/v1/text/analyze")
def analyze(payload: AnalyzeRequest):
    words = word_count(payload.text)
    minimum = 80 if payload.mode == "article" else 60
    if words < minimum:
        raise HTTPException(status_code=422, detail={"error": "text_too_short", "minimum_words": minimum})
    if words > MAX_WORDS or len(payload.text) > MAX_CHARS:
        raise HTTPException(status_code=413, detail={"error": "text_too_long", "max_words": MAX_WORDS, "max_chars": MAX_CHARS})
    try:
        with inference_slot():
            tokenizer_instance, detector = get_model()
            segments = split_segments(payload.text, SEGMENT_WORDS)
            scored = []
            weighted_total = 0.0
            weighted_words = 0
            total_windows = 0
            for segment in segments:
                segment_words = word_count(segment)
                score, window_count = ai_score(segment, tokenizer_instance, detector, torch)
                total_windows += window_count
                scored.append({
                    "ai_signal_score": round(score, 1),
                    "word_count": segment_words,
                    "token_window_count": window_count,
                    "excerpt": segment[:520],
                    "band": "high" if score >= 75 else ("low" if score <= 25 else "mixed"),
                })
                weighted_total += score * segment_words
                weighted_words += segment_words
            overall = weighted_total / weighted_words if weighted_words else 50.0
            assessment, message = build_assessment(overall)
            return {
                "ok": True,
                "mode": payload.mode,
                "word_count": words,
                "character_count": len(payload.text),
                "coverage": {"complete": True, "scored_words": weighted_words, "scored_segments": len(scored), "token_windows": total_windows},
                "segment_count": len(scored),
                "reading_time_minutes": max(1, round(words / 220)),
                "model": {"name": "RoBERTa / OpenAI detector", "id": MODEL_ID, "language_note": "Primarily intended for English text; performance can vary substantially outside its training distribution."},
                "result": {"assessment": assessment, "message": message, "ai_signal_score": round(overall, 1), "segments": scored},
            }
    except HTTPException:
        raise
    except Exception as exc:
        code = error_code(exc)
        raise HTTPException(status_code=503, detail={"error": code, "retryable": True}) from exc


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
