(function () {
  window.AHPlannerTools ||= [];
  window.AHPlannerHandlers ||= {};

  const CATEGORY_ID = "ai-everyday-utilities";
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const num = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const text = (value) => String(value == null ? "" : value).trim();
  const lines = (value) => text(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const yesNo = (value) => value ? "Yes" : "No";
  const round = (value, digits = 1) => Number(value).toFixed(digits);
  const splitList = (value) => text(value).split(/[,;]+/).map((item) => item.trim()).filter(Boolean);
  const csv = (value) => splitList(value).join(", ") || "None listed";
  const safeCount = (value, max = 500) => clamp(Math.round(num(value, 0)), 0, max);
  const result = (summary, details, warnings) => ({ summary, details, warnings: warnings && warnings.length ? warnings : undefined });

  const definitions = [
    {
      slug: "cross-platform-game-backlog-session-tracker",
      title: "Cross-Platform Game Backlog & Session Tracker",
      categoryId: CATEGORY_ID,
      description: "Parse one game per line, calculate backlog status, and sort entries into a practical next-session list.",
      limitations: "Uses only the rows and estimates you enter; status and time totals are planning aids, not synced playtime or platform data.",
      fields: [
        { id: "games", label: "Game rows", type: "textarea", placeholder: "Game | platform | status | hours left | priority\nHades | PC | backlog | 12 | 5", help: "Use one row per game: name | platform | status (backlog/playing/done/paused) | hours left | priority (1-5).", required: true },
        { id: "weeklyHours", label: "Hours available per week", type: "number", default: 6, min: 0, max: 168, step: 0.5, help: "Used for a rough completion horizon." },
        { id: "focus", label: "Focus platform", type: "text", placeholder: "Any", help: "Optional platform filter; leave blank for all platforms." }
      ]
    },
    {
      slug: "edpi-cm-360-sensitivity-converter",
      title: "eDPI & cm/360 Sensitivity Converter",
      categoryId: CATEGORY_ID,
      description: "Convert mouse DPI and in-game sensitivity into eDPI and an estimated centimeters-per-360 value.",
      limitations: "The cm/360 estimate assumes a common 360-degree yaw convention and the entered game scale; game-specific formulas can differ.",
      fields: [
        { id: "dpi", label: "Mouse DPI", type: "number", required: true, min: 100, max: 50000, step: 1, placeholder: "800" },
        { id: "sensitivity", label: "In-game sensitivity", type: "number", required: true, min: 0.001, max: 1000, step: 0.001, placeholder: "1.0" },
        { id: "yaw", label: "Yaw scale", type: "number", default: 0.022, min: 0.0001, max: 10, step: 0.0001, help: "Game yaw value used by the approximation." },
        { id: "targetCm", label: "Optional target cm/360", type: "number", min: 1, max: 500, step: 0.1, placeholder: "35" }
      ]
    },
    {
      slug: "game-audio-mix-voice-chat-balance-planner",
      title: "Game Audio Mix & Voice-Chat Balance Planner",
      categoryId: CATEGORY_ID,
      description: "Turn a few volume priorities into a normalized starting mix and identify likely masking problems.",
      limitations: "This is a relative mix plan, not a loudness calibration; headphones, hearing, game engines, and chat clients change the result.",
      fields: [
        { id: "master", label: "Master volume (%)", type: "number", default: 80, min: 1, max: 100, step: 1 },
        { id: "game", label: "Game audio priority (1-10)", type: "number", default: 7, min: 1, max: 10, step: 1 },
        { id: "voice", label: "Voice-chat priority (1-10)", type: "number", default: 8, min: 1, max: 10, step: 1 },
        { id: "music", label: "Music priority (1-10)", type: "number", default: 2, min: 1, max: 10, step: 1 },
        { id: "alerts", label: "Need strong alerts", type: "checkbox", default: true }
      ]
    },
    {
      slug: "controller-deadzone-input-tester",
      title: "Controller Deadzone & Input Tester",
      categoryId: CATEGORY_ID,
      description: "Assess stick drift and response from manually recorded center and edge readings, then suggest a conservative deadzone.",
      limitations: "Manual readings are not a replacement for an OS-level tester; the suggested value balances drift resistance against fine control.",
      fields: [
        { id: "centerX", label: "Center X reading", type: "number", default: 0, min: -1, max: 1, step: 0.001, help: "Enter the observed resting X value, where -1 to 1 is the full range." },
        { id: "centerY", label: "Center Y reading", type: "number", default: 0, min: -1, max: 1, step: 0.001 },
        { id: "edgeX", label: "Right-edge X reading", type: "number", default: 1, min: -1, max: 1, step: 0.001 },
        { id: "edgeY", label: "Top-edge Y reading", type: "number", default: 1, min: -1, max: 1, step: 0.001 },
        { id: "currentDeadzone", label: "Current deadzone (%)", type: "number", default: 10, min: 0, max: 50, step: 0.5 }
      ]
    },
    {
      slug: "pc-game-upgrade-compatibility-planner",
      title: "PC Game Upgrade Compatibility Planner",
      categoryId: CATEGORY_ID,
      description: "Compare a game's stated requirements with entered PC parts and flag likely bottlenecks or unknowns.",
      limitations: "Requirement names are manually entered and model-to-model performance varies; this is a screening checklist, not a guaranteed FPS or compatibility result.",
      fields: [
        { id: "game", label: "Game", type: "text", required: true, placeholder: "Game title" },
        { id: "requirements", label: "Requirement notes", type: "textarea", placeholder: "Minimum: 16 GB RAM, 6 GB VRAM, 100 GB storage\nRecommended: 8-core CPU", required: true },
        { id: "cpu", label: "Current CPU", type: "text", placeholder: "CPU model" },
        { id: "gpuVram", label: "GPU VRAM (GB)", type: "number", min: 0, max: 256, step: 0.1 },
        { id: "ram", label: "System RAM (GB)", type: "number", min: 0, max: 2048, step: 1 },
        { id: "freeStorage", label: "Free storage (GB)", type: "number", min: 0, max: 100000, step: 1 }
      ]
    },
    {
      slug: "game-install-storage-planner",
      title: "Game Install & Storage Planner",
      categoryId: CATEGORY_ID,
      description: "Estimate whether a game library fits after installs, patches, reserved free space, and a safety buffer.",
      limitations: "Install and patch sizes vary by platform and update; the result is an estimate based on the sizes you provide.",
      fields: [
        { id: "capacity", label: "Drive capacity (GB)", type: "number", required: true, min: 1, max: 100000, step: 1 },
        { id: "used", label: "Currently used (GB)", type: "number", default: 0, min: 0, max: 100000, step: 1 },
        { id: "installs", label: "Planned installs", type: "textarea", placeholder: "Game A: 80 GB\nGame B: 120 GB", required: true },
        { id: "patchBuffer", label: "Patch buffer (%)", type: "number", default: 15, min: 0, max: 100, step: 1 },
        { id: "reserve", label: "Keep free reserve (GB)", type: "number", default: 20, min: 0, max: 100000, step: 1 }
      ]
    },
    {
      slug: "mod-load-order-conflict-planner",
      title: "Mod Load-Order Conflict Planner",
      categoryId: CATEGORY_ID,
      description: "Parse ordered mod rows, detect duplicate priorities and dependency issues, and produce a review checklist.",
      limitations: "Only explicit names, priorities, and dependencies are checked; file-level conflicts and game-specific rules require a real mod manager.",
      fields: [
        { id: "mods", label: "Mod rows", type: "textarea", placeholder: "Unofficial Patch | 10 |\nTexture Pack | 20 | Unofficial Patch\nLighting Overhaul | 20 |", help: "One row per mod: name | priority (lower loads first) | comma-separated dependencies.", required: true },
        { id: "lastWins", label: "Later priority wins conflicts", type: "checkbox", default: true }
      ]
    },
    {
      slug: "tabletop-rpg-encounter-difficulty-planner",
      title: "Tabletop RPG Encounter Difficulty Planner",
      categoryId: CATEGORY_ID,
      description: "Estimate an encounter budget from party level and count, compare enemy XP, and account for a simple action-economy warning.",
      limitations: "This uses a simplified 5e-style budget model, not a full rules engine; edition, monster abilities, terrain, and tactics can change difficulty substantially.",
      fields: [
        { id: "partyLevel", label: "Party level", type: "number", required: true, min: 1, max: 20, step: 1 },
        { id: "partySize", label: "Party size", type: "number", required: true, min: 1, max: 12, step: 1 },
        { id: "difficulty", label: "Target difficulty", type: "select", options: ["easy", "medium", "hard", "deadly"], default: "medium" },
        { id: "enemyXp", label: "Total enemy XP", type: "number", required: true, min: 0, max: 1000000, step: 1 },
        { id: "enemyCount", label: "Enemy count", type: "number", required: true, min: 1, max: 100, step: 1 }
      ]
    },
    {
      slug: "tabletop-initiative-condition-tracker",
      title: "Tabletop Initiative & Condition Tracker",
      categoryId: CATEGORY_ID,
      description: "Parse combatants with initiative, HP, and conditions, then sort turn order and identify expiring effects.",
      limitations: "This is a local round tracker and does not enforce a specific game's condition rules or automatically advance rounds.",
      fields: [
        { id: "round", label: "Current round", type: "number", default: 1, min: 1, max: 10000, step: 1 },
        { id: "combatants", label: "Combatant rows", type: "textarea", placeholder: "Rogue | 18 | 24/30 | poisoned:2\nGoblin | 12 | 7/7 |", help: "One row: name | initiative | current/max HP | condition:rounds,condition:rounds.", required: true },
        { id: "ascending", label: "Sort lowest initiative first", type: "checkbox", default: false }
      ]
    },
    {
      slug: "tournament-bracket-seeding-builder",
      title: "Tournament Bracket & Seeding Builder",
      categoryId: CATEGORY_ID,
      description: "Validate a participant list, assign seeded bracket positions, and show byes for a single-elimination event.",
      limitations: "Seeding is deterministic snake placement and does not account for player skill beyond the order supplied; it is not a live bracket or result tracker.",
      fields: [
        { id: "participants", label: "Seeded participants", type: "textarea", placeholder: "Alice\nBob\nCasey\nDrew", help: "One participant per line, already ordered from strongest seed to weakest.", required: true },
        { id: "bracketSize", label: "Bracket size", type: "select", options: ["auto", "4", "8", "16", "32", "64"], default: "auto" },
        { id: "thirdPlace", label: "Include third-place match", type: "checkbox", default: false }
      ]
    }
  ];

  const handlers = {
    "cross-platform-game-backlog-session-tracker": (v) => {
      const focus = text(v.focus).toLowerCase();
      const rows = lines(v.games).map((line, index) => {
        const parts = line.split("|").map((part) => part.trim());
        return { index: index + 1, name: parts[0] || `Untitled ${index + 1}`, platform: parts[1] || "Unknown", status: (parts[2] || "backlog").toLowerCase(), hours: Math.max(0, num(parts[3], 0)), priority: clamp(Math.round(num(parts[4], 3)), 1, 5) };
      }).filter((row) => !focus || row.platform.toLowerCase().includes(focus));
      const active = rows.filter((row) => row.status !== "done");
      active.sort((a, b) => b.priority - a.priority || a.hours - b.hours || a.name.localeCompare(b.name));
      const total = active.reduce((sum, row) => sum + row.hours, 0);
      const weekly = clamp(num(v.weeklyHours, 0), 0, 168);
      const horizon = weekly > 0 ? `${round(total / weekly, 1)} week(s)` : "not estimated (weekly hours is zero)";
      const detail = active.length ? active.map((row, i) => `${i + 1}. ${row.name} — ${row.platform}; ${row.status}; ${round(row.hours, 1)}h left; priority ${row.priority}/5`).join("\n") : "No unfinished matching games.";
      return result(`${rows.length} game(s) reviewed; ${active.length} unfinished; ${round(total, 1)} estimated hours; horizon: ${horizon}.`, detail, ["Hours and statuses are self-reported estimates."]);
    },
    "edpi-cm-360-sensitivity-converter": (v) => {
      const dpi = clamp(num(v.dpi), 100, 50000), sens = clamp(num(v.sensitivity), 0.001, 1000), yaw = clamp(num(v.yaw, 0.022), 0.0001, 10);
      const edpi = dpi * sens;
      const cm360 = 36000 / (dpi * sens * yaw);
      const target = num(v.targetCm, 0);
      const targetSensitivity = target > 0 ? 36000 / (dpi * yaw * target) : 0;
      return result(`eDPI: ${round(edpi, 2)}; estimated cm/360: ${round(cm360, 2)} cm.`, target > 0 ? `For approximately ${round(target, 2)} cm/360 at ${dpi} DPI, try sensitivity ${round(targetSensitivity, 4)} as a starting point.` : "No target cm/360 was supplied.", ["The cm/360 formula is an approximation and should be verified in the specific game."]);
    },
    "game-audio-mix-voice-chat-balance-planner": (v) => {
      const master = clamp(num(v.master, 80), 1, 100), game = clamp(num(v.game, 7), 1, 10), voice = clamp(num(v.voice, 8), 1, 10), music = clamp(num(v.music, 2), 1, 10);
      const total = game + voice + music + (v.alerts ? 2 : 0);
      const level = (weight) => round(master * weight / total, 1);
      const warnings = [];
      if (voice >= game + 4) warnings.push("Voice priority is much higher than game audio; check that callouts do not mask gameplay cues.");
      if (music >= game) warnings.push("Music priority may mask effects; consider ducking or lowering music during competitive play.");
      return result(`Starting relative mix at ${master}% master: game ${level(game)}%, voice ${level(voice)}%, music ${level(music)}%, alerts ${v.alerts ? level(2) : "off"}.`, "Set each channel relative to the master, then test with a familiar voice line and gameplay cue. Use the lowest comfortable master level.", warnings);
    },
    "controller-deadzone-input-tester": (v) => {
      const x = clamp(num(v.centerX), -1, 1), y = clamp(num(v.centerY), -1, 1), edgeX = clamp(num(v.edgeX, 1), -1, 1), edgeY = clamp(num(v.edgeY, 1), -1, 1);
      const drift = Math.sqrt(x * x + y * y), centerPct = drift * 100, reachX = Math.abs(edgeX - x), reachY = Math.abs(edgeY - y), reach = Math.min(reachX, reachY), current = clamp(num(v.currentDeadzone, 10), 0, 50);
      const suggested = clamp(Math.ceil(centerPct + 1), 1, 30);
      const warnings = [];
      if (centerPct > current) warnings.push(`Measured center offset (${round(centerPct, 2)}%) exceeds the current deadzone (${round(current, 1)}%).`);
      if (reach < 0.8) warnings.push("The recorded edge reading suggests reduced usable travel; inspect calibration or hardware.");
      return result(`Center offset: ${round(centerPct, 2)}%; minimum measured edge travel: ${round(reach * 100, 1)}%; suggested starting deadzone: ${suggested}%.`, `At ${suggested}%, retest slow movement and aiming. Reduce it if the stick remains stable; increase it only enough to stop visible drift.`, warnings);
    },
    "pc-game-upgrade-compatibility-planner": (v) => {
      const req = text(v.requirements), ram = num(v.ram, -1), vram = num(v.gpuVram, -1), storage = num(v.freeStorage, -1), warnings = [];
      const find = (pattern) => { const match = req.match(pattern); return match ? Number(match[1]) : null; };
      const reqRam = find(/(?:ram|memory)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*gb/i), reqVram = find(/(?:vram|video memory)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*gb/i), reqStorage = find(/(?:storage|space)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*gb/i);
      if (reqRam != null && ram >= 0 && ram < reqRam) warnings.push(`System RAM ${ram} GB is below the parsed ${reqRam} GB requirement.`);
      if (reqVram != null && vram >= 0 && vram < reqVram) warnings.push(`GPU VRAM ${vram} GB is below the parsed ${reqVram} GB requirement.`);
      if (reqStorage != null && storage >= 0 && storage < reqStorage) warnings.push(`Free storage ${storage} GB is below the parsed ${reqStorage} GB requirement.`);
      if (ram < 0 || vram < 0 || storage < 0) warnings.push("Some hardware inputs are missing, so compatibility remains indeterminate.");
      const status = warnings.length && warnings.some((w) => /below/.test(w)) ? "Potential shortfall" : "No entered shortfall detected";
      return result(`${text(v.game) || "Game"}: ${status}.`, `CPU entered: ${text(v.cpu) || "not provided"}. Parsed requirement hints — RAM: ${reqRam == null ? "not found" : `${reqRam} GB`}; VRAM: ${reqVram == null ? "not found" : `${reqVram} GB`}; storage: ${reqStorage == null ? "not found" : `${reqStorage} GB`}.`, warnings);
    },
    "game-install-storage-planner": (v) => {
      const capacity = Math.max(1, num(v.capacity, 1)), used = clamp(num(v.used, 0), 0, capacity), reserve = Math.max(0, num(v.reserve, 20)), patch = clamp(num(v.patchBuffer, 15), 0, 100);
      const items = lines(v.installs).map((line) => { const match = line.match(/^(.*?)(?:\s*[:|,-]\s*)(\d+(?:\.\d+)?)\s*gb\s*$/i); return { name: match ? match[1].trim() : line, size: match ? Number(match[2]) : 0 }; });
      const base = items.reduce((sum, item) => sum + item.size, 0), planned = base * (1 + patch / 100), available = capacity - used - reserve, remaining = available - planned;
      const detail = items.map((item) => `${item.name}: ${round(item.size, 1)} GB`).join("\n") || "No recognizable install sizes; use 'Name: 80 GB'.";
      return result(`${remaining >= 0 ? "Fits" : "Does not fit"}: ${round(planned, 1)} GB planned including ${patch}% patch buffer; ${round(Math.max(0, remaining), 1)} GB headroom after reserve.`, `${detail}\nAvailable for installs after current use and reserve: ${round(Math.max(0, available), 1)} GB.`, remaining < 0 ? ["Free space is insufficient under the entered assumptions; patch behavior may require more temporary space."] : []);
    },
    "mod-load-order-conflict-planner": (v) => {
      const rows = lines(v.mods).map((line, index) => { const p = line.split("|").map((x) => x.trim()); return { name: p[0] || `Mod ${index + 1}`, priority: num(p[1], NaN), deps: splitList(p[2]) }; });
      const names = new Set(rows.map((r) => r.name.toLowerCase())), duplicate = new Set(), seen = new Map(), warnings = [];
      rows.forEach((r) => { if (seen.has(r.priority)) duplicate.add(r.priority); seen.set(r.priority, true); r.deps.forEach((d) => { if (!names.has(d.toLowerCase())) warnings.push(`${r.name} depends on missing or differently named mod '${d}'.`); }); });
      rows.sort((a, b) => (Number.isFinite(a.priority) ? a.priority : 999999) - (Number.isFinite(b.priority) ? b.priority : 999999) || a.name.localeCompare(b.name));
      duplicate.forEach((p) => warnings.push(`Priority ${p} is shared; confirm the intended order manually.`));
      return result(`${rows.length} mod(s) ordered; ${duplicate.size} shared priority value(s); ${warnings.length} review warning(s).`, rows.map((r, i) => `${i + 1}. ${r.name} — priority ${Number.isFinite(r.priority) ? r.priority : "unset"}${r.deps.length ? `; needs ${r.deps.join(", ")}` : ""}`).join("\n"), warnings);
    },
    "tabletop-rpg-encounter-difficulty-planner": (v) => {
      const level = clamp(Math.round(num(v.partyLevel, 1)), 1, 20), size = clamp(Math.round(num(v.partySize, 1)), 1, 12), enemyXp = Math.max(0, num(v.enemyXp)), enemyCount = clamp(Math.round(num(v.enemyCount, 1)), 1, 100), difficulty = text(v.difficulty) || "medium";
      const thresholds = { easy: 25, medium: 50, hard: 75, deadly: 100 }, budget = level * size * thresholds[difficulty], adjusted = enemyCount > size ? enemyXp * 1.5 : enemyCount > 1 ? enemyXp * 1.25 : enemyXp, ratio = budget ? adjusted / budget : 0;
      const band = ratio < 0.75 ? "below target" : ratio <= 1.25 ? "near target" : ratio <= 1.75 ? "above target" : "well above target";
      const warnings = [];
      if (enemyCount > size * 2) warnings.push("Enemy count is more than twice party size; action economy may make this harder than XP suggests.");
      return result(`Simplified ${difficulty} budget: ${budget} XP; adjusted encounter XP: ${round(adjusted, 0)} (${round(ratio * 100, 0)}% of target, ${band}).`, `Party: ${size} character(s) at level ${level}; enemies: ${enemyCount}; raw XP: ${round(enemyXp, 0)}. The adjustment is a rough multi-enemy multiplier, not an official rules calculation.`, warnings);
    },
    "tabletop-initiative-condition-tracker": (v) => {
      const roundNumber = clamp(Math.round(num(v.round, 1)), 1, 10000), ascending = Boolean(v.ascending), warnings = [];
      const combatants = lines(v.combatants).map((line, index) => { const p = line.split("|").map((x) => x.trim()), hp = (p[2] || "").match(/(\d+)\s*\/\s*(\d+)/); const conditions = splitList(p[3]).map((c) => { const m = c.match(/^(.*?)(?::|\s+)(\d+)$/); return m ? `${m[1].trim()} (${Math.max(0, Number(m[2]) - roundNumber + 1)} round(s) left)` : c; }); return { name: p[0] || `Combatant ${index + 1}`, initiative: num(p[1], 0), hp: hp ? `${hp[1]}/${hp[2]}` : (p[2] || "unknown"), conditions }; });
      combatants.sort((a, b) => (ascending ? a.initiative - b.initiative : b.initiative - a.initiative) || a.name.localeCompare(b.name));
      const details = combatants.map((c, i) => `${i + 1}. ${c.name} — init ${round(c.initiative, 2)}; HP ${c.hp}; ${c.conditions.length ? c.conditions.join(", ") : "no listed conditions"}`).join("\n");
      if (!combatants.length) warnings.push("No combatant rows were recognized.");
      return result(`Round ${roundNumber}: ${combatants.length} combatant(s) sorted ${ascending ? "ascending" : "descending"} by initiative.`, details, warnings);
    },
    "tournament-bracket-seeding-builder": (v) => {
      const participants = lines(v.participants).map((name) => name.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean), unique = [...new Set(participants.map((p) => p.toLowerCase()))].length === participants.length, requested = text(v.bracketSize), size = requested === "auto" || !requested ? 2 ** Math.ceil(Math.log2(Math.max(2, participants.length))) : Number(requested), warnings = [];
      if (!unique) warnings.push("Duplicate participant names detected; remove duplicates before publishing the bracket.");
      if (participants.length > size) warnings.push(`There are ${participants.length} participants but only ${size} bracket slots; increase the bracket size.`);
      const slots = Array.from({ length: size }, (_, i) => participants[i] || "BYE");
      const matches = []; for (let i = 0; i < slots.length / 2; i += 1) matches.push(`Match ${i + 1}: Seed ${i + 1} ${slots[i]} vs Seed ${size - i} ${slots[size - 1 - i]}`);
      const byes = slots.filter((p) => p === "BYE").length;
      if (byes) warnings.push(`${byes} bye slot(s) are present; confirm whether automatic advancement is acceptable.`);
      return result(`${participants.length} participant(s), ${size}-slot single-elimination bracket, ${byes} bye(s).${v.thirdPlace ? " A third-place match is planned." : ""}`, matches.join("\n"), warnings);
    }
  };

  definitions.forEach((definition) => {
    window.AHPlannerTools.push(definition);
    window.AHPlannerHandlers[definition.slug] = handlers[definition.slug];
  });
})();
