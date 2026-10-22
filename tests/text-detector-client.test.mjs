import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../site/tools/text-detector/app.js", import.meta.url), "utf8");
assert.doesNotThrow(() => new vm.Script(source), "client script must parse");

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  toggle(value, enabled) { if (enabled) this.add(value); else this.remove(value); }
}
class FakeElement {
  constructor(id = "") { this.id = id; this.value = ""; this.textContent = ""; this.innerHTML = ""; this.hidden = false; this.disabled = false; this.dataset = {}; this.style = {}; this.listeners = {}; this.classList = new FakeClassList(); this.children = []; this.files = []; }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  dispatch(type, event = {}) { return Promise.all((this.listeners[type] || []).map((callback) => callback({ target: this, ...event })));
  }
  setAttribute(name, value) { this[name] = value; }
  replaceChildren(...children) { this.children = children; }
  append(child) { this.children.push(child); }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolled = true; }
}

const ids = ["text-input", "analyze-button", "progress-panel", "result-section", "empty-report", "segments-list", "toast", "input-limit-message", "char-count", "word-count", "mode-note", "input-help", "progress-title", "clear-button", "sample-button", "paste-button", "text-file", "copy-report-button", "engine-status", "hero-engine-label", "assessment-title", "assessment-icon", "assessment-description", "signal-score", "signal-score-bar", "assessment-index", "stat-words", "stat-segments", "stat-reading", "stat-model", "segments-count", "report-footer-note"];
const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
const assessmentCard = new FakeElement("assessment-card");
const modeButtons = [new FakeElement("article-mode"), new FakeElement("prompt-mode")];
modeButtons[0].dataset.mode = "article";
modeButtons[1].dataset.mode = "prompt";
const document = {
  body: { dataset: { analysisEnabled: "true" } }, // TEST ONLY: exercise future hosted mode.
  querySelector(selector) {
    if (selector === ".assessment-card") return assessmentCard;
    if (selector.startsWith("#")) return elements[selector.slice(1)];
    return null;
  },
  querySelectorAll(selector) { return selector === "[data-mode]" ? modeButtons : []; },
  createElement() { return new FakeElement(); }
};
let fetchCalls = [];
const fetchMock = async (url, options = {}) => {
  fetchCalls.push({ url, options });
  if (url.endsWith("/health")) return { ok: false, json: async () => ({ status: "not_configured" }) };
  return { ok: true, json: async () => ({ ok: true, mode: "article", word_count: 80, coverage: { complete: true, scored_words: 80 }, segment_count: 1, model: { name: "TEST ONLY mock detector" }, result: { assessment: "likely_ai", ai_signal_score: 73, segments: [{ word_count: 80, ai_signal_score: 73, excerpt: "TEST ONLY excerpt" }] } }) };
};
const fakeNavigator = { clipboard: { readText: async () => "", writeText: async () => {} } };
const context = vm.createContext({
  document, fetch: fetchMock, navigator: fakeNavigator,
  setTimeout, clearTimeout, console, matchMedia: () => ({ matches: false }),
});
await vm.runInContext(source, context);
const input = elements["text-input"];
const analyze = elements["analyze-button"];
const sample = elements["sample-button"];
const paste = elements["paste-button"];
const file = elements["text-file"];

await sample.dispatch("click");
assert.ok(input.value.split(/\s+/).length >= 80, "article sample meets the 80-word minimum");
await modeButtons[1].dispatch("click");
await sample.dispatch("click");
assert.ok(input.value.split(/\s+/).length >= 60, "prompt sample meets the 60-word minimum");
await modeButtons[0].dispatch("click");

const eightyWords = Array.from({ length: 80 }, (_, index) => `word${index}`).join(" ");
input.value = eightyWords;
await input.dispatch("input");
assert.equal(analyze.disabled, false, "minimum article boundary is accepted");
input.value = Array.from({ length: 8000 }, () => "word").join(" ");
await input.dispatch("input");
assert.equal(analyze.disabled, false, "8000-word maximum boundary is accepted");
input.value = `${input.value} extra`;
await input.dispatch("input");
assert.equal(analyze.disabled, true, "over-8000-word input is rejected without truncation");
assert.match(elements["input-limit-message"].textContent, /8,000-word/);

const exactly50000 = `${eightyWords} ${"x".repeat(50000 - eightyWords.length - 1)}`;
assert.equal(exactly50000.length, 50000);
input.value = exactly50000;
await input.dispatch("input");
assert.equal(analyze.disabled, false, "50,000-character maximum boundary is accepted");
input.value += "x";
await input.dispatch("input");
assert.equal(analyze.disabled, true, "over-50,000-character input is rejected without truncation");
assert.equal(input.value.length, 50001, "textarea keeps the complete over-limit value");

const clipboardText = "clipboard text ".repeat(5000);
fakeNavigator.clipboard.readText = async () => clipboardText;
await paste.dispatch("click");
assert.equal(input.value, clipboardText, "paste keeps complete input and does not silently truncate");

const fileText = "file text ".repeat(5000);
file.files = [{ size: fileText.length, text: async () => fileText }];
await file.dispatch("change");
assert.equal(input.value, fileText, "file loading keeps complete input and does not silently truncate");

input.value = eightyWords;
await input.dispatch("input");
await analyze.dispatch("click");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(fetchCalls.some(({ url }) => url.endsWith("/analyze")), true, "analysis request is sent at the minimum boundary");
assert.equal(elements["result-section"].hidden, false, "successful result is rendered");
assert.equal(elements["signal-score"].textContent, "73/100");
assert.match(elements["report-footer-note"].textContent, /English/);

const errorFetch = context.fetch;
context.fetch = async (url) => url.endsWith("/health") ? { ok: false, json: async () => ({}) } : { ok: false, json: async () => ({ code: "service_not_configured" }) };
input.value = eightyWords;
await analyze.dispatch("click");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.match(elements.toast.textContent, /not connected yet|still being investigated/);
context.fetch = errorFetch;

// Near-minimum checks must not send a request below the selected minimum.
for (const [button, count] of [[modeButtons[0], 79], [modeButtons[1], 59]]) {
  await button.dispatch("click");
  input.value = Array(count).fill("word").join(" ");
  const before = fetchCalls.length;
  await analyze.dispatch("click");
  assert.equal(fetchCalls.length, before);
  assert.match(elements.toast.textContent, /at least/);
}
await modeButtons[0].dispatch("click");
context.fetch = async (url, options) => {
  if (url.endsWith("/health")) return { ok: false, json: async () => ({}) };
  const submitted = JSON.parse(options.body).text;
  assert.equal(submitted, input.value, "the complete maximum input must be submitted");
  return { ok: true, json: async () => ({ ok: true, word_count: 8000, coverage: { complete: true, scored_words: 8000 }, result: { ai_signal_score: null, segments: [] } }) };
};
input.value = Array(8000).fill("word").join(" ");
await input.dispatch("input");
await analyze.dispatch("click");
assert.equal(elements["stat-words"].textContent, "8,000");
assert.equal(elements["signal-score"].textContent, "—", "null is not a zero score");
context.fetch = async () => ({ ok: true, json: async () => ({ ok: true, word_count: 8000, coverage: { complete: false, scored_words: 80 }, result: {} }) });
await analyze.dispatch("click");
assert.equal(elements["result-section"].hidden, true, "partial analysis must not be shown as complete");
assert.match(elements.toast.textContent, /complete text coverage/);
context.fetch = errorFetch;

// Production static preview is fail-closed even if analyze() is called directly.
document.body.dataset.analysisEnabled = "false";
let previewRequests = 0;
const previewContext = vm.createContext({ document, fetch: async () => { previewRequests++; throw Error("must not send"); }, navigator: fakeNavigator, setTimeout, clearTimeout, console });
vm.runInContext(source, previewContext);
await vm.runInContext("analyze()", previewContext);
assert.equal(previewRequests, 0, "static preview sends neither health nor analysis requests");
assert.equal(analyze.disabled, true, "analysis remains disabled even with valid text");
assert.match(elements.toast.textContent, /coming soon/);

console.log("text-detector-client.test.mjs: all focused client tests passed (response payloads are TEST ONLY mocks)");
