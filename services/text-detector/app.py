import os
import re
from typing import Literal

import torch
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from transformers import AutoModelForSequenceClassification, AutoTokenizer

MODEL_ID = os.getenv("TEXT_DETECTOR_MODEL", "openai-community/roberta-base-openai-detector")
MAX_CHARS = int(os.getenv("TEXT_DETECTOR_MAX_CHARS", "50000"))
MAX_WORDS = int(os.getenv("TEXT_DETECTOR_MAX_WORDS", "8000"))
SEGMENT_WORDS = int(os.getenv("TEXT_DETECTOR_SEGMENT_WORDS", "180"))
MAX_SEGMENTS = int(os.getenv("TEXT_DETECTOR_MAX_SEGMENTS", "24"))

app = FastAPI(title="AFTERHOURS Text Signal", version="1.0.0", docs_url=None, redoc_url=None)
tokenizer = None
model = None

class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_CHARS)
    mode: Literal["article", "prompt"] = "article"

def word_count(text: str) -> int:
    return len(re.findall(r"[\w\u0080-\uffff]+(?:['’_-][\w\u0080-\uffff]+)*", text, flags=re.UNICODE))

def get_model():
    global tokenizer, model
    if tokenizer is None or model is None:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
        model = AutoModelForSequenceClassification.from_pretrained(MODEL_ID)
        model.eval()
    return tokenizer, model

def split_segments(text: str):
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n+", text) if p.strip()]
    segments = []
    for paragraph in paragraphs:
        words = paragraph.split()
        if not words:
            continue
        for start in range(0, len(words), SEGMENT_WORDS):
            chunk = words[start:start + SEGMENT_WORDS]
            if chunk:
                segments.append(" ".join(chunk))
            if len(segments) >= MAX_SEGMENTS:
                return segments
    return segments

def ai_score(text: str, tokenizer, model) -> float:
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    with torch.inference_mode():
        logits = model(**inputs).logits
        probabilities = torch.softmax(logits, dim=-1)[0]
    # The OpenAI detector uses LABEL_0 / LABEL_1 rather than a guaranteed semantic name.
    # Inspect the configured id2label mapping and treat the AI-labelled class as positive.
    labels = {int(k): str(v).lower() for k, v in model.config.id2label.items()}
    ai_index = next((idx for idx, label in labels.items() if "fake" in label or "ai" in label or "generated" in label), None)
    if ai_index is None:
        ai_index = int(torch.argmax(probabilities).item()) if probabilities.numel() == 2 else 1
    if probabilities.numel() != 2:
        raise RuntimeError("Detector model must expose exactly two classes")
    return float(probabilities[ai_index].item() * 100.0)

def build_assessment(score: float):
    if score >= 75:
        return "likely_ai", "The model found a stronger AI-like signal in this sample. This is not proof that AI wrote the text."
    if score <= 25:
        return "likely_human", "The model found a weaker AI-like signal in this sample. That does not prove a human wrote it."
    return "mixed_signals", "The model produced a middle-range signal. Treat the result as inconclusive without additional evidence."

@app.middleware("http")
async def no_content_logging(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response

@app.get("/health")
def health():
    return {"status": "ready", "model": MODEL_ID}

@app.post("/v1/text/analyze")
def analyze(payload: AnalyzeRequest):
    words = word_count(payload.text)
    minimum = 80 if payload.mode == "article" else 60
    if words < minimum:
        raise HTTPException(status_code=422, detail="text_too_short")
    if words > MAX_WORDS:
        raise HTTPException(status_code=413, detail="text_too_long")
    try:
        tokenizer, detector = get_model()
        segments = split_segments(payload.text)
        scored = []
        weighted_total = 0.0
        weighted_words = 0
        for segment in segments:
            segment_words = word_count(segment)
            score = ai_score(segment, tokenizer, detector)
            scored.append({
                "ai_signal_score": round(score, 1),
                "word_count": segment_words,
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
            "segment_count": len(scored),
            "reading_time_minutes": max(1, round(words / 220)),
            "model": {
                "name": "RoBERTa / OpenAI detector",
                "id": MODEL_ID,
                "language_note": "Primarily intended for English text; performance can vary substantially outside its training distribution.",
            },
            "result": {
                "assessment": assessment,
                "message": message,
                "ai_signal_score": round(overall, 1),
                "segments": scored,
            },
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
