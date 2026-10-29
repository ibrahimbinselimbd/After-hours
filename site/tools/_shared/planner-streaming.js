/* Afterhours streaming and creator planners: local, deterministic, manual-data tools. */
(function () {
  "use strict";

  window.AHPlannerTools ||= [];
  window.AHPlannerHandlers ||= {};

  const MAX_TEXT = 50000;
  const clampText = (value, max = MAX_TEXT) => String(value == null ? "" : value).trim().slice(0, max);
  const number = (value, fallback = 0, min = 0, max = 1000000000) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };
  const round = (value, places = 2) => Number(value.toFixed(places));
  const pad = (value) => String(value).padStart(2, "0");
  const parseTime = (value) => {
    const raw = clampText(value, 20);
    const parts = raw.split(":").map(Number);
    if (parts.length === 2 && parts.every(Number.isFinite) && parts[0] >= 0 && parts[0] < 60 && parts[1] >= 0 && parts[1] < 60) return parts[0] * 60 + parts[1];
    if (parts.length === 3 && parts.every(Number.isFinite) && parts[0] >= 0 && parts[1] < 60 && parts[2] < 60 && parts[1] >= 0 && parts[2] >= 0) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  };
  const formatTime = (seconds) => {
    const total = Math.max(0, Math.round(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };
  const lines = (value) => clampText(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const slugify = (value) => clampText(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
  const result = (summary, details, warnings) => ({ summary, details, warnings: warnings && warnings.length ? warnings : undefined });

  const definitions = [
    { slug: "stream-bitrate-recording-storage-planner", title: "Stream Bitrate & Recording Storage Planner", categoryId: "video-tools", description: "Estimate upload bandwidth and local recording storage from stream settings.", limitations: "Uses your supplied bitrate, duration, and codec assumptions; it does not measure network headroom or actual file overhead.", fields: [
      { id: "videoBitrate", label: "Video bitrate (Mbps)", type: "number", required: true, min: 0.1, max: 1000, step: 0.1, default: 6 }, { id: "audioBitrate", label: "Audio bitrate (kbps)", type: "number", min: 8, max: 1000, step: 1, default: 160 }, { id: "duration", label: "Stream duration (minutes)", type: "number", required: true, min: 1, max: 10080, step: 1, default: 120 }, { id: "streams", label: "Number of streams", type: "number", min: 1, max: 100, default: 1 }, { id: "overhead", label: "Estimated overhead (%)", type: "number", min: 0, max: 50, step: 1, default: 8 }, { id: "recording", label: "Include local recording estimate", type: "checkbox", default: true }
    ] },
    { slug: "livestream-run-of-show-cue-sheet-builder", title: "Livestream Run-of-Show Cue Sheet Builder", categoryId: "video-tools", description: "Turn timed segments into a practical livestream cue sheet.", limitations: "Timing is based on your planned durations and cannot account for live delays, ad breaks, or production readiness.", fields: [
      { id: "showTitle", label: "Show title", type: "text", required: true, placeholder: "Friday live" }, { id: "segments", label: "Segments (one per line: duration | cue | owner)", type: "textarea", required: true, placeholder: "05:00 | Cold open | Host\n20:00 | Interview | Producer" }, { id: "startTime", label: "Start time", type: "text", placeholder: "19:00" }, { id: "notes", label: "Global notes", type: "textarea" }
    ] },
    { slug: "youtube-chapter-timestamp-builder", title: "YouTube Chapter Timestamp Builder", categoryId: "video-tools", description: "Validate and format YouTube chapter timestamps from a simple list.", limitations: "YouTube rules and chapter eligibility can change; this checks common formatting and ordering only.", fields: [
      { id: "chapters", label: "Chapters (timestamp | title)", type: "textarea", required: true, placeholder: "00:00 | Intro\n02:15 | Main topic" }, { id: "minimum", label: "Require first chapter at 00:00", type: "checkbox", default: true }
    ] },
    { slug: "podcast-transcript-show-notes-drafter", title: "Podcast Transcript-to-Show-Notes Drafter", categoryId: "audio-tools", description: "Draft show notes from a transcript using local extractive heuristics.", limitations: "This is an editable draft, not a factual or editorial review; names, claims, links, and quotes require manual verification.", fields: [
      { id: "title", label: "Episode title", type: "text", required: true }, { id: "transcript", label: "Transcript", type: "textarea", required: true, placeholder: "Paste the transcript here" }, { id: "links", label: "Links and resources", type: "textarea", placeholder: "One link or resource per line" }, { id: "tone", label: "Notes tone", type: "select", options: ["Conversational", "Editorial", "Minimal"], default: "Conversational" }
    ] },
    { slug: "creator-content-repurposing-draft-assistant", title: "Creator Content Repurposing Draft Assistant", categoryId: "video-tools", description: "Create editable platform drafts from one source idea or transcript.", limitations: "Drafts are templates and heuristic rewrites; review platform limits, accuracy, rights, and brand fit before publishing.", fields: [
      { id: "source", label: "Source content or key points", type: "textarea", required: true }, { id: "audience", label: "Audience", type: "text", placeholder: "Independent creators" }, { id: "platforms", label: "Platforms", type: "text", default: "Short video, newsletter, social post" }, { id: "callToAction", label: "Call to action", type: "text", default: "Learn more" }
    ] },
    { slug: "sponsorship-deliverables-deal-planner", title: "Sponsorship Deliverables & Deal Planner", categoryId: "data-spreadsheets", description: "Calculate sponsorship package value, deliverable totals, and fulfillment gaps.", limitations: "Values are planning estimates and do not replace a contract, tax advice, or platform reporting.", fields: [
      { id: "rate", label: "Base rate per deliverable", type: "number", required: true, min: 0, max: 100000000, step: 0.01 }, { id: "deliverables", label: "Deliverables (name | quantity | unit value multiplier)", type: "textarea", required: true, placeholder: "Mid-roll | 2 | 1\nSocial post | 3 | 0.5" }, { id: "fee", label: "Flat fees / expenses", type: "number", min: 0, max: 100000000, step: 0.01 }, { id: "completed", label: "Completed quantity", type: "number", min: 0, max: 1000000, step: 1 }
    ] },
    { slug: "brand-voice-consistency-checker", title: "Brand Voice Consistency Checker", categoryId: "ai-everyday-utilities", description: "Flag simple style mismatches against a manually supplied brand voice brief.", limitations: "Rule-based signals are not a subjective brand judgment; review context, accessibility, audience, and meaning manually.", fields: [
      { id: "copy", label: "Copy to check", type: "textarea", required: true }, { id: "voice", label: "Voice description", type: "textarea", placeholder: "Warm, concise, confident; avoid jargon" }, { id: "banned", label: "Words or phrases to avoid", type: "text", placeholder: "synergy, obviously" }, { id: "maxSentence", label: "Preferred max sentence words", type: "number", min: 5, max: 100, default: 28 }
    ] },
    { slug: "podcast-guest-brief-generator", title: "Podcast Guest Brief Generator", categoryId: "audio-tools", description: "Build an editable guest prep brief from supplied facts and themes.", limitations: "Does not research or verify a guest; confirm biography, pronunciation, permissions, and sensitive topics yourself.", fields: [
      { id: "guest", label: "Guest name", type: "text", required: true }, { id: "bio", label: "Verified bio / background", type: "textarea", required: true }, { id: "topics", label: "Topics and questions", type: "textarea", required: true }, { id: "logistics", label: "Logistics and boundaries", type: "textarea", placeholder: "Recording time, links, off-limits topics" }
    ] },
    { slug: "creative-asset-license-attribution-ledger", title: "Creative Asset License & Attribution Ledger", categoryId: "data-spreadsheets", description: "Check an asset ledger for license, attribution, and expiry gaps.", limitations: "Completeness checks cannot determine whether a license is authentic, transferable, or sufficient for your use.", fields: [
      { id: "assets", label: "Assets (name | source | license | attribution | expiry)", type: "textarea", required: true, placeholder: "Hero photo | Unsplash URL | Unsplash | Photographer name | none" }, { id: "today", label: "Review date", type: "date" }, { id: "requireAttribution", label: "Require attribution field", type: "checkbox", default: true }
    ] },
    { slug: "creator-upload-readiness-checklist", title: "Creator Upload Readiness Checklist", categoryId: "video-tools", description: "Identify missing metadata and release checks before a creator upload.", limitations: "A completed checklist is not legal, accessibility, platform-policy, or rights clearance advice.", fields: [
      { id: "title", label: "Upload title", type: "text", required: true }, { id: "description", label: "Description", type: "textarea", required: true }, { id: "thumbnail", label: "Thumbnail / cover ready", type: "checkbox" }, { id: "captions", label: "Captions reviewed", type: "checkbox" }, { id: "rights", label: "Rights and releases checked", type: "checkbox" }, { id: "links", label: "Links / disclosure checked", type: "checkbox" }, { id: "visibility", label: "Visibility", type: "select", options: ["Private", "Unlisted", "Public"], default: "Private" }
    ] }
  ];

  const handlers = {};
  handlers["stream-bitrate-recording-storage-planner"] = (v) => {
    const video = number(v.videoBitrate, 6, 0.1, 1000), audio = number(v.audioBitrate, 160, 8, 1000) / 1000;
    const minutes = number(v.duration, 120, 1, 10080), streams = number(v.streams, 1, 1, 100), overhead = number(v.overhead, 8, 0, 50) / 100;
    const mbps = (video + audio) * (1 + overhead), upload = round(mbps * 1.2), gigabytes = round(mbps * 60 * minutes / 8 / 1000 * streams);
    const details = `Combined estimated bitrate: ${round(video + audio, 3)} Mbps\nRecommended upload headroom (20%): ${upload} Mbps\nData transfer for ${streams} stream${streams === 1 ? "" : "s"}: ${gigabytes} GB\n${v.recording === false || v.recording === "false" ? "Local recording estimate: not requested." : `Local recording storage estimate: ${gigabytes} GB before filesystem/container overhead.`}`;
    return result(`${gigabytes} GB estimated transfer/storage; plan for at least ${upload} Mbps upload headroom.`, details, ["Actual encoded size varies by codec, VBR behavior, container, and scene complexity."]);
  };
  handlers["livestream-run-of-show-cue-sheet-builder"] = (v) => {
    const warnings = [], rows = [], start = parseTime(v.startTime || "00:00") ?? 0; let cursor = start;
    lines(v.segments).forEach((line, i) => { const bits = line.split("|").map((x) => x.trim()); const duration = parseTime(bits[0]); if (duration == null) { warnings.push(`Line ${i + 1}: invalid duration; skipped.`); return; } const cue = bits[1] || `Segment ${i + 1}`, owner = bits[2] || "Unassigned"; rows.push(`${formatTime(cursor)} — ${formatTime(cursor + duration)} | ${cue} | ${owner}`); cursor += duration; });
    return result(`${rows.length} cue${rows.length === 1 ? "" : "s"} scheduled for ${formatTime(cursor - start)}.`, [`${clampText(v.showTitle, 120) || "Untitled show"}`, "", ...rows, v.notes ? `\nNotes: ${clampText(v.notes)}` : ""].filter(Boolean).join("\n"), warnings);
  };
  handlers["youtube-chapter-timestamp-builder"] = (v) => {
    const warnings = [], out = [], seen = new Set(); let previous = -1;
    lines(v.chapters).forEach((line, i) => { const bits = line.split("|"); const stamp = (bits.shift() || "").trim(), title = bits.join("|").trim(); const seconds = parseTime(stamp); if (seconds == null || !title) { warnings.push(`Line ${i + 1}: use timestamp | title.`); return; } if (seconds <= previous) warnings.push(`Line ${i + 1}: timestamp is not later than the previous chapter.`); if (seen.has(seconds)) warnings.push(`Line ${i + 1}: duplicate timestamp.`); seen.add(seconds); previous = seconds; out.push(`${formatTime(seconds)} ${title}`); });
    if (v.minimum !== false && v.minimum !== "false" && (!out.length || !out[0].startsWith("00:00"))) warnings.push("Add a first chapter at 00:00.");
    return result(`${out.length} chapter${out.length === 1 ? "" : "s"} formatted.`, out.join("\n"), warnings);
  };
  handlers["podcast-transcript-show-notes-drafter"] = (v) => {
    const transcript = clampText(v.transcript), sentences = transcript.split(/(?<=[.!?])\s+/).filter((s) => s.length > 35).slice(0, 5), title = clampText(v.title, 160) || "Untitled episode", resources = lines(v.links);
    const detail = [`${title}`, "", "Summary", sentences.slice(0, 3).join(" ") || "[Add a concise episode summary.]", "", "Key takeaways", ...(sentences.slice(3, 6).map((s) => `- ${s}`)), sentences.length < 4 ? "- [Add or verify key takeaway]" : "", "", "Timestamps", "[Add timestamps after listening back]", resources.length ? "\nResources\n" + resources.map((x) => `- ${x}`).join("\n") : ""].filter(Boolean).join("\n");
    return result(`Drafted show notes from ${transcript.split(/\s+/).filter(Boolean).length} transcript words.`, detail, ["Verify every summary, name, quote, claim, and resource against the recording."]);
  };
  handlers["creator-content-repurposing-draft-assistant"] = (v) => { const source = clampText(v.source), first = source.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 2).join(" ") || source.slice(0, 280), audience = clampText(v.audience, 100) || "your audience", cta = clampText(v.callToAction, 120) || "Learn more"; const platforms = lines(String(v.platforms || "Short video, newsletter, social post").replace(/,/g, "\n")); const blocks = platforms.map((p) => `${p}\nHook: ${first.slice(0, 120)}\nDraft: ${first}\nCTA: ${cta}`).join("\n\n"); return result(`Created ${platforms.length || 1} editable repurposing draft${platforms.length === 1 ? "" : "s"} for ${audience}.`, blocks || `Source angle: ${first}\nCTA: ${cta}`, ["Review platform length, claims, accessibility, rights, and brand voice before publishing."]); };
  handlers["sponsorship-deliverables-deal-planner"] = (v) => { const rate = number(v.rate, 0, 0, 100000000), fee = number(v.fee, 0, 0, 100000000), completed = number(v.completed, 0, 0, 1000000); let total = 0, planned = 0, rows = []; lines(v.deliverables).forEach((line, i) => { const [name, qtyRaw, multRaw] = line.split("|").map((x) => x.trim()), qty = number(qtyRaw, 0, 0, 1000000), mult = number(multRaw, 1, 0, 1000); if (!name || !qty) return; const value = rate * qty * mult; planned += qty; total += value; rows.push(`${name}: ${qty} × ${mult} × ${rate.toFixed(2)} = ${value.toFixed(2)}`); }); const gap = Math.max(0, planned - completed); return result(`Planned value: ${round(total + fee, 2)}; ${gap} deliverable unit${gap === 1 ? "" : "s"} remain if completion is accurate.`, `${rows.join("\n")}\nFlat fees/expenses: ${fee.toFixed(2)}\nTotal planned value: ${(total + fee).toFixed(2)}\nPlanned units: ${planned}\nCompleted units entered: ${completed}\nRemaining units: ${gap}`, ["Confirm quantities, rates, usage rights, make-goods, payment terms, and taxes in the signed agreement."]); };
  handlers["brand-voice-consistency-checker"] = (v) => { const copy = clampText(v.copy), banned = lines(String(v.banned || "").replace(/,/g, "\n")).map((x) => x.toLowerCase()), max = number(v.maxSentence, 28, 5, 100), warnings = []; banned.forEach((word) => { if (copy.toLowerCase().includes(word)) warnings.push(`Avoided term found: “${word}”.`); }); copy.split(/(?<=[.!?])\s+/).filter(Boolean).forEach((sentence, i) => { if (sentence.split(/\s+/).length > max) warnings.push(`Sentence ${i + 1} is longer than ${max} words.`); }); if (/[!]{2,}|[?]{2,}/.test(copy)) warnings.push("Repeated punctuation may conflict with a restrained voice."); if (/\b(very|really|obviously|literally)\b/i.test(copy)) warnings.push("Consider checking intensifiers for precision."); return result(warnings.length ? `${warnings.length} voice signal${warnings.length === 1 ? "" : "s"} to review.` : "No rule-based voice signals found.", `Voice brief supplied: ${clampText(v.voice, 500) || "None"}\nCharacters checked: ${copy.length}\nSentences checked: ${copy.split(/(?<=[.!?])\s+/).filter(Boolean).length}`, warnings); };
  handlers["podcast-guest-brief-generator"] = (v) => { const guest = clampText(v.guest, 160) || "Guest", topics = lines(v.topics), detail = [`Guest brief: ${guest}`, "", "Verified background", clampText(v.bio) || "[Add verified bio]", "", "Topics and questions", ...(topics.map((x, i) => `${i + 1}. ${x}`)), "", "Logistics and boundaries", clampText(v.logistics) || "[Confirm recording time, pronunciation, links, and off-limits topics]", "", "Host reminder: verify facts, consent, names, and sensitive-topic boundaries before recording."].join("\n"); return result(`Prepared a guest brief with ${topics.length} topic${topics.length === 1 ? "" : "s"}.`, detail, ["This brief only uses supplied information; verify the guest’s biography and permissions."]); };
  handlers["creative-asset-license-attribution-ledger"] = (v) => { const today = v.today ? new Date(`${v.today}T00:00:00`) : new Date(); const warnings = [], out = []; lines(v.assets).forEach((line, i) => { const [name, source, license, attribution, expiry] = line.split("|").map((x) => x.trim()); if (!name) { warnings.push(`Line ${i + 1}: missing asset name.`); return; } const missing = []; if (!source) missing.push("source"); if (!license) missing.push("license"); if ((v.requireAttribution !== false && v.requireAttribution !== "false") && !attribution) missing.push("attribution"); if (expiry && expiry.toLowerCase() !== "none") { const date = new Date(`${expiry}T00:00:00`); if (Number.isNaN(date.getTime())) missing.push("valid expiry"); else if (date < today) warnings.push(`${name}: expiry is past the review date.`); } if (missing.length) warnings.push(`${name}: missing ${missing.join(", ")}.`); out.push(`${name} | ${license || "[license missing]"} | ${attribution || "[attribution missing]"} | ${expiry || "none"}`); }); return result(`${out.length} asset${out.length === 1 ? "" : "s"} checked; ${warnings.length} ledger gap${warnings.length === 1 ? "" : "s"} found.`, out.join("\n"), warnings); };
  handlers["creator-upload-readiness-checklist"] = (v) => { const checks = [["Title", !!clampText(v.title)], ["Description", !!clampText(v.description)], ["Thumbnail / cover", v.thumbnail === true || v.thumbnail === "true"], ["Captions", v.captions === true || v.captions === "true"], ["Rights and releases", v.rights === true || v.rights === "true"], ["Links / disclosure", v.links === true || v.links === "true"]], gaps = checks.filter((x) => !x[1]).map((x) => x[0]); return result(gaps.length ? `${gaps.length} upload readiness gap${gaps.length === 1 ? "" : "s"} found.` : `Upload checklist complete for ${clampText(v.title, 120)}.`, checks.map((x) => `${x[1] ? "[x]" : "[ ]"} ${x[0]}`).join("\n") + `\nVisibility: ${v.visibility || "Private"}`, gaps.length ? ["Complete or intentionally waive each gap; also verify platform-specific policy and accessibility requirements."] : ["Still perform a final playback, metadata, rights, and disclosure review before publishing."]); };

  definitions.forEach((definition) => { window.AHPlannerTools.push(definition); window.AHPlannerHandlers[definition.slug] = handlers[definition.slug]; });
})();
