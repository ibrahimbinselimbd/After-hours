const $ = (selector) => document.querySelector(selector);
const textInput = $("#text-input");
const analyzeButton = $("#analyze-button");
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const progressPanel = $("#progress-panel");
const resultSection = $("#result-section");
const emptyReport = $("#empty-report");
const segmentsList = $("#segments-list");
const toast = $("#toast");
const limitMessage = $("#input-limit-message");
let mode = "article";
let lastReport = null;
let toastTimer = 0;

const LIMITS = { maxWords: 8000, maxChars: 50000 };
const rules = {
  article: {
    min: 80,
    note: "Article mode needs at least 80 words. This detector is optimized for English prose."
  },
  prompt: {
    min: 60,
    note: "Prompt mode needs at least 60 words. This detector is optimized for English text and is not specifically trained for prompt detection."
  }
};

const countWords = (value) => {
  const matches = String(value || "").trim().match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
};
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));

function announce(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 4200);
}

function limitError(words, chars) {
  if (chars > LIMITS.maxChars && words > LIMITS.maxWords) {
    return `Text exceeds both limits: ${LIMITS.maxChars.toLocaleString()} characters and ${LIMITS.maxWords.toLocaleString()} words.`;
  }
  if (chars > LIMITS.maxChars) return `Text exceeds the ${LIMITS.maxChars.toLocaleString()}-character limit. Nothing was removed; shorten it before analyzing.`;
  if (words > LIMITS.maxWords) return `Text exceeds the ${LIMITS.maxWords.toLocaleString()}-word limit. Nothing was removed; shorten it before analyzing.`;
  return "";
}

function updateCounts() {
  const value = textInput.value || "";
  const words = countWords(value);
  const chars = value.length;
  $("#char-count").textContent = `${chars.toLocaleString()} / ${LIMITS.maxChars.toLocaleString()} CHARACTERS`;
  $("#word-count").textContent = words.toLocaleString();
  $("#mode-note").textContent = rules[mode].note;
  const overLimit = limitError(words, chars);
  if (limitMessage) {
    limitMessage.textContent = overLimit;
    limitMessage.hidden = !overLimit;
  }
  $("#input-help").textContent = overLimit || (words < rules[mode].min
    ? `Add at least ${rules[mode].min} words for this scan. Short text cannot be attributed reliably.`
    : "Text is only sent to the analysis server after you press Analyze.");
  analyzeButton.disabled = words === 0 || Boolean(overLimit);
}

function setMode(nextMode) {
  mode = nextMode === "prompt" ? "prompt" : "article";
  modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  textInput.placeholder = mode === "article"
    ? "Paste the article or longer text you want to analyze…"
    : "Paste a longer writing, research or image-generation prompt…";
  updateCounts();
}

function busy(value) {
  progressPanel.hidden = !value;
  analyzeButton.disabled = value || countWords(textInput.value) === 0 || Boolean(limitError(countWords(textInput.value), textInput.value.length));
  analyzeButton.innerHTML = value ? "Analyzing…" : '<span class="button-spark">✳</span> Analyze text <span aria-hidden="true">↗</span>';
}

function assessment(value) {
  return ({
    likely_ai: { title: "Higher AI-like signal", icon: "↗", description: "The model found a stronger AI-like signal in this sample. This is not proof that AI wrote the text." },
    likely_human: { title: "Lower AI-like signal", icon: "↘", description: "The model found a weaker AI-like signal in this sample. That does not prove a human wrote it." },
    mixed_signals: { title: "Mixed signals", icon: "≈", description: "The model produced mixed signals. The writing may be edited, out of domain, or difficult to classify." },
    inconclusive: { title: "Inconclusive", icon: "?", description: "The model did not produce a strong enough signal for a useful directional assessment." },
    insufficient_text: { title: "Not enough text", icon: "…", description: "Add more natural-language text before running an analysis." }
  }[value] || null);
}

function renderSegments(segments) {
  segmentsList.replaceChildren();
  (segments || []).forEach((segment, index) => {
    const numericScore = Number(segment.ai_signal_score);
    const score = segment.ai_signal_score != null && Number.isFinite(numericScore) ? Math.max(0, Math.min(100, Math.round(numericScore))) : null;
    const card = document.createElement("article");
    card.className = "segment-card";
    const band = score === null ? "MIXED SIGNAL" : score >= 70 ? "HIGHER AI-LIKE SIGNAL" : score <= 30 ? "LOWER AI-LIKE SIGNAL" : "MIXED SIGNAL";
    const className = score >= 70 ? "high" : score <= 30 ? "low" : "";
    card.innerHTML = `<div class="segment-top"><strong>CHUNK ${String(index + 1).padStart(2, "0")} / ${Number(segment.word_count) || 0} WORDS</strong><span class="segment-tag ${className}">${band}</span></div><p>${escapeHTML(segment.excerpt || "")}</p><div class="segment-meter"><div><span style="width:${score ?? 0}%"></span></div><strong>${score === null ? "—" : `${score}/100`}</strong></div>`;
    segmentsList.append(card);
  });
  $("#segments-count").textContent = `${String((segments || []).length).padStart(2, "0")} CHUNKS`;
}

function renderReport(payload) {
  lastReport = payload;
  const result = payload.result || {};
  const summary = assessment(result.assessment) || assessment("inconclusive");
  resultSection.hidden = false;
  emptyReport.hidden = true;
  $(".assessment-card").dataset.assessment = result.assessment || "inconclusive";
  $("#assessment-title").textContent = summary.title;
  $("#assessment-icon").textContent = summary.icon;
  $("#assessment-description").textContent = result.message || summary.description;
  const numericScore = Number(result.ai_signal_score);
  const score = result.ai_signal_score != null && Number.isFinite(numericScore) ? Math.max(0, Math.min(100, Math.round(numericScore))) : null;
  $("#signal-score").textContent = score === null ? "—" : `${score}/100`;
  $("#signal-score-bar").style.width = `${score ?? 0}%`;
  $("#assessment-index").textContent = `AH / ${(result.assessment || "inconclusive").replace(/_/g, " ").toUpperCase()}`;
  $("#stat-words").textContent = Number(payload.word_count || 0).toLocaleString();
  $("#stat-segments").textContent = Number(payload.segment_count || 0).toLocaleString();
  $("#stat-reading").textContent = payload.reading_time_minutes ? `${payload.reading_time_minutes} min` : "Under 1 min";
  $("#stat-model").textContent = payload.model?.name || "RoBERTa / OpenAI detector";
  renderSegments(result.segments || []);
  $("#report-footer-note").textContent = `Mode: ${payload.mode === "prompt" ? "Prompt scan" : "Article scan"}. ${payload.model?.language_note || "Optimized for English text."}`;
  if (typeof matchMedia === "function") {
    resultSection.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
}

async function analyze() {
  const text = textInput.value.trim();
  const words = countWords(text);
  const chars = text.length;
  if (!text) return announce("Paste text first.");
  const overLimit = limitError(words, chars);
  if (overLimit) {
    updateCounts();
    announce(overLimit);
    textInput.focus();
    return;
  }
  if (words < rules[mode].min) {
    announce(`Please add at least ${rules[mode].min} words for this scan.`);
    textInput.focus();
    return;
  }
  resultSection.hidden = true;
  emptyReport.hidden = false;
  lastReport = null;
  busy(true);
  $("#progress-title").textContent = `Analyzing ${words.toLocaleString()} words on the server…`;
  try {
    const response = await fetch("/api/v1/text/analyze", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, cache: "no-store", credentials: "same-origin", body: JSON.stringify({ text, mode }) });
    let payload = {};
    try { payload = await response.json(); } catch { /* non-JSON error */ }
    if (!response.ok) {
      const messages = {
        service_not_configured: "Coming soon: the detector API is not connected yet. Analysis hosting must be configured before launch.",
        detector_not_ready: "The model is still starting. Try again in a moment.",
        detector_unreachable: "The detector service is temporarily unavailable. Please try again shortly.",
        detector_timeout: "The detector took too long to respond. Try a shorter text.",
        body_too_large: "This request is too large for the analysis service.",
        text_too_short: "This text is too short for a useful scan. Add more words and try again.",
        text_too_long: "This text exceeds the 8,000-word or 50,000-character limit. Nothing was silently removed.",
        invalid_mode: "Choose Article scan or Prompt scan and try again.",
        rate_limited: "The detector is busy. Please try again shortly."
      };
      throw Error(messages[payload.code] || payload.detail || payload.message || "The analysis service could not complete this request.");
    }
    if (!payload.ok || !payload.result) throw Error("The analysis service returned an unexpected response.");
    if (payload.coverage?.complete !== true || payload.coverage.scored_words !== words || payload.word_count !== words) {
      throw Error("The service did not confirm complete text coverage. No partial analysis will be shown.");
    }
    renderReport(payload);
    announce("Analysis complete. Treat the result as a screening signal, not proof.");
  } catch (error) {
    announce(error?.message || "Unable to reach the analysis service.");
  } finally {
    busy(false);
    updateCounts();
  }
}

async function health() {
  const setStatus = (status) => {
    $("#engine-status").textContent = status;
    $("#hero-engine-label").textContent = status;
    const notice = $("#service-notice");
    if (notice) {
      notice.textContent = status === "SERVICE ONLINE"
        ? "The configured analysis service reports ready. Results remain probabilistic signals, not proof of authorship."
        : "COMING SOON — NOT LIVE. Real analysis requires a configured, tested inference host. No simulated results are provided.";
    }
  };
  try {
    const response = await fetch("/api/v1/text/health", { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json();
    setStatus(response.ok && payload.status === "ready" ? "SERVICE ONLINE" : "COMING SOON / API OFFLINE");
  } catch { setStatus("COMING SOON / API OFFLINE"); }
}

modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
textInput.addEventListener("input", updateCounts);
analyzeButton.addEventListener("click", analyze);
$("#clear-button").addEventListener("click", () => { textInput.value = ""; resultSection.hidden = true; emptyReport.hidden = false; lastReport = null; updateCounts(); textInput.focus(); });
$("#sample-button").addEventListener("click", () => {
  textInput.value = mode === "article"
    ? "A useful article begins with a clear question and develops its answer through evidence, examples and context. Strong writing benefits from a specific audience, a deliberate structure and details that can be checked. These qualities do not reveal who wrote a passage on their own, but they help readers judge whether its claims are clear and well supported. When reviewing an article, look beyond smooth wording. Check where facts came from, whether dates and numbers are accurate, and whether the text acknowledges meaningful uncertainty. A detector can provide one signal about patterns in language, but it cannot establish a writer's identity, prove that a passage was generated by AI, or replace careful editorial judgment. Responsible review combines this signal with provenance, revision history, subject expertise and direct discussion with the author."
    : "Write a detailed, natural-language prompt for an editorial article about a new technology product. Explain the intended audience, the central question, the tone, the evidence to include, and the structure of the final piece. Ask for clear language, concrete examples, accurate claims and a brief section that explains important limitations. Request several possible headlines, a balanced comparison with alternatives, and a final checklist that an editor can use to verify sources before publication.";
  updateCounts();
  textInput.focus();
});
$("#paste-button").addEventListener("click", async () => {
  try {
    const value = await navigator.clipboard.readText();
    if (!value) return announce("Your clipboard is empty.");
    textInput.value = value;
    updateCounts();
    announce(limitError(countWords(value), value.length) || "Text pasted from clipboard. Nothing was truncated.");
  } catch { announce("Clipboard access was blocked. Long-press the text area and choose Paste."); }
  textInput.focus();
});
$("#text-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 1048576) { announce("Text files must be 1 MB or smaller."); event.target.value = ""; return; }
  try {
    const value = await file.text();
    textInput.value = value;
    updateCounts();
    announce(limitError(countWords(value), value.length) || "Text file loaded. Nothing was truncated; it has not been sent until you analyze it.");
  } catch { announce("Could not read this file."); }
  event.target.value = "";
});
$("#copy-report-button").addEventListener("click", async () => {
  if (!lastReport) return;
  const result = lastReport.result || {};
  const report = ["AFTERHOURS TEXT SIGNAL — SCREENING REPORT", `Assessment: ${(result.assessment || "inconclusive").replace(/_/g, " ")}`, `AI-like model signal: ${result.ai_signal_score == null ? "Unavailable" : `${Math.round(result.ai_signal_score)}/100`}`, `Words: ${lastReport.word_count || 0}`, `Model: ${lastReport.model?.name || "RoBERTa / OpenAI detector"}`, "Notice: This model score is not a probability or proof of authorship and may be wrong."].join("\n");
  try { await navigator.clipboard.writeText(report); announce("Report summary copied."); } catch { announce("Copy was blocked by the browser."); }
});

updateCounts();
health();
