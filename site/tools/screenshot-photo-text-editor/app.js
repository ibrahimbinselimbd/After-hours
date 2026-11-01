(() => {
  'use strict';
  const api = window.AHToolkit;
  const $ = selector => document.querySelector(selector);
  const esc = value => api.escape(String(value ?? ''));
  api.mount(`<section class="editor-workspace" aria-label="Screenshot and photo text editing workspace">
    <p class="editor-intro">Import a screenshot or photo from this device, detect text boxes, correct the wording and place replacement text on the image. Your image pixels stay in this browser.</p>
    <div class="editor-disclosure"><strong>LOCAL FILES &amp; MODEL DOWNLOADS</strong><br>Image pixels are not uploaded. OCR code and the selected language model load from this site only when you choose Run OCR; the first run may download several megabytes and requires a network connection. Processing can use substantial memory. The editor limits images to 12 MB, 10 megapixels and 4,096 px per side. Original font recovery is not guaranteed: font suggestions are approximate width matches for you to fine-tune.</div>
    <div class="editor-controls">
      <label>Image file<input id="photo-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"><span class="editor-control-help">Supported images depend on this browser. The source file is opened locally.</span></label>
      <label>OCR language<select id="ocr-language"><option value="eng">English</option><option value="ben">Bengali</option><option value="spa">Spanish</option><option value="fra">French</option><option value="deu">German</option></select><span class="editor-control-help">One language per scan. Language data is downloaded on first use.</span></label>
      <label>Clone brush size <span id="brush-size-label">24 px</span><input id="brush-size" type="range" min="6" max="100" value="24"><span class="editor-control-help">Manual repair copies nearby clean pixels into the selected rectangle.</span></label>
      <label>Download name<input id="download-name" type="text" maxlength="80" value="edited-image.png" autocomplete="off"></label>
    </div>
    <div class="editor-actions">
      <button id="scan-text" class="button button-main" type="button" disabled>Run OCR locally ↗</button>
      <button id="add-text" class="button" type="button" disabled>Add text overlay</button>
      <button id="pick-color" class="button" type="button" disabled>Sample text color</button>
      <button id="select-repair" class="button" type="button" disabled>Select repair area</button>
      <button id="choose-sample" class="button" type="button" disabled>Choose clean sample</button>
      <button id="start-repair" class="button" type="button" disabled>Paint repair</button>
      <button id="undo-repair" class="button" type="button" disabled>Undo repair stroke</button>
      <button id="reset-repair" class="button" type="button" disabled>Reset repairs</button>
      <button id="export-image" class="button" type="button" disabled>Export edited PNG</button>
    </div>
    <div id="editor-status" class="status editor-status" role="status" aria-live="polite" hidden></div>
    <div class="repair-guide"><strong>Manual old-text repair (not automatic inpainting)</strong><ol><li>Select the old-text region with <em>Select repair area</em>.</li><li>Choose a clean sample on a nearby background with <em>Choose clean sample</em>.</li><li>Use <em>Paint repair</em> inside the selected area. This clone-stamp workflow works best on flat or repeating backgrounds; complex scenes may need a dedicated editor.</li><li>Edit a detected line and place its replacement text. OCR never removes old pixels by itself.</li></ol></div>
    <div id="image-stage" class="image-stage" aria-label="Image editing canvas"><canvas id="render-canvas" aria-label="Edited image preview"></canvas><canvas id="interaction-canvas" aria-label="Interactive image selection canvas" tabindex="0"></canvas><div id="stage-placeholder" class="stage-placeholder">Choose a local screenshot or photo to begin.</div></div>
    <div class="section-head"><h2>DETECTED / REPLACEMENT TEXT</h2><span id="line-count" class="tool-badge">0 LINES</span></div>
    <div id="text-lines" class="editor-text-grid" aria-live="polite"><p class="editor-result-note">OCR text boxes and replacement controls will appear here. You can also add a manual text overlay after importing an image.</p></div>
    <p class="editor-result-note">Best-match fonts compare approximate text width from the detected box against common system fonts; they are suggestions, not exact font identification. Check spelling, alignment, edge clipping and colors before sharing the exported copy.</p>
  </section>`);

  const fileInput = $('#photo-file');
  const langInput = $('#ocr-language');
  const canvas = $('#render-canvas');
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  const overlay = $('#interaction-canvas');
  const overlayCtx = overlay.getContext('2d');
  const baseCanvas = document.createElement('canvas');
  const baseCtx = baseCanvas.getContext('2d', {willReadFrequently: true});
  const stage = $('#image-stage');
  const placeholder = $('#stage-placeholder');
  const status = $('#editor-status');
  const textLines = $('#text-lines');
  const limit = {bytes: 12 * 1024 * 1024, pixels: 10_000_000, side: 4096, lines: 100};
  const fonts = ['Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'system-ui', 'sans-serif'];
  let worker = null;
  let workerLanguage = '';
  let imageReady = false;
  let imageObjectUrl = '';
  let lines = [];
  let strokes = [];
  let repairSelection = null;
  let samplePoint = null;
  let selectedLine = 0;
  let mode = 'idle';
  let dragStart = null;
  let activeStroke = null;
  let draftSelection = null;
  let renderedWidth = 0;
  let renderedHeight = 0;

  function setStatus(message, kind = '') {
    api.status(status, message, kind);
  }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function setMode(next) {
    mode = next;
    overlay.style.pointerEvents = next === 'idle' ? 'none' : 'auto';
    overlay.style.cursor = next === 'brush' ? 'cell' : next === 'sample' || next === 'color' ? 'copy' : 'crosshair';
    drawInteraction();
  }
  function pointFromEvent(event) {
    const rect = overlay.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width * baseCanvas.width, 0, baseCanvas.width - 1),
      y: clamp((event.clientY - rect.top) / rect.height * baseCanvas.height, 0, baseCanvas.height - 1)
    };
  }
  function isInsideSelection(point) {
    return repairSelection && point.x >= repairSelection.x && point.x <= repairSelection.x + repairSelection.w && point.y >= repairSelection.y && point.y <= repairSelection.y + repairSelection.h;
  }
  function drawInteraction() {
    if (!imageReady || !renderedWidth || !renderedHeight) return;
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (overlay.width !== width || overlay.height !== height) { overlay.width = width; overlay.height = height; }
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    const sx = overlay.width / baseCanvas.width;
    const sy = overlay.height / baseCanvas.height;
    const box = draftSelection || repairSelection;
    if (box) {
      overlayCtx.save();
      overlayCtx.fillStyle = 'rgba(211,251,86,.12)';
      overlayCtx.strokeStyle = '#d3fb56';
      overlayCtx.lineWidth = 2;
      overlayCtx.setLineDash([7, 4]);
      overlayCtx.fillRect(box.x * sx, box.y * sy, box.w * sx, box.h * sy);
      overlayCtx.strokeRect(box.x * sx, box.y * sy, box.w * sx, box.h * sy);
      overlayCtx.restore();
    }
    if (samplePoint) {
      overlayCtx.save();
      overlayCtx.strokeStyle = '#ffb477';
      overlayCtx.lineWidth = 2;
      overlayCtx.beginPath();
      overlayCtx.arc(samplePoint.x * sx, samplePoint.y * sy, 7, 0, Math.PI * 2);
      overlayCtx.moveTo(samplePoint.x * sx - 12, samplePoint.y * sy);
      overlayCtx.lineTo(samplePoint.x * sx + 12, samplePoint.y * sy);
      overlayCtx.moveTo(samplePoint.x * sx, samplePoint.y * sy - 12);
      overlayCtx.lineTo(samplePoint.x * sx, samplePoint.y * sy + 12);
      overlayCtx.stroke();
      overlayCtx.restore();
    }
  }
  function applyRepairs(target) {
    for (const stroke of strokes) {
      if (!stroke.points.length) continue;
      target.save();
      target.beginPath();
      target.rect(stroke.selection.x, stroke.selection.y, stroke.selection.w, stroke.selection.h);
      target.clip();
      for (const point of stroke.points) {
        const dx = point.x - stroke.origin.x;
        const dy = point.y - stroke.origin.y;
        const half = stroke.size / 2;
        const sourceX = clamp(stroke.source.x + dx - half, 0, Math.max(0, baseCanvas.width - stroke.size));
        const sourceY = clamp(stroke.source.y + dy - half, 0, Math.max(0, baseCanvas.height - stroke.size));
        target.drawImage(baseCanvas, sourceX, sourceY, stroke.size, stroke.size, point.x - half, point.y - half, stroke.size, stroke.size);
      }
      target.restore();
    }
  }
  function applyText(target) {
    for (const line of lines) {
      const text = String(line.text || '').trim();
      if (!text) continue;
      const size = clamp(Number(line.fontSize) || 18, 6, Math.min(300, baseCanvas.height));
      target.save();
      target.font = `${size}px ${JSON.stringify(line.font || 'Arial')}, sans-serif`;
      target.textBaseline = 'alphabetic';
      target.fillStyle = /^#[0-9a-f]{6}$/i.test(line.color || '') ? line.color : '#111111';
      const x = clamp(Number(line.bbox.x0) || 0, 0, baseCanvas.width - 1);
      const y = clamp(Number(line.bbox.y1) || 0, 0, baseCanvas.height - 1) - Math.max(1, size * 0.12);
      target.fillText(text, x, y, Math.max(1, baseCanvas.width - x));
      target.restore();
    }
  }
  function render() {
    if (!imageReady) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseCanvas, 0, 0);
    applyRepairs(ctx);
    applyText(ctx);
    requestAnimationFrame(drawInteraction);
  }
  function estimateTextColor(box) {
    const x0 = clamp(Math.floor(box.x0), 0, baseCanvas.width - 1);
    const y0 = clamp(Math.floor(box.y0), 0, baseCanvas.height - 1);
    const w = clamp(Math.floor(box.x1 - box.x0), 1, baseCanvas.width - x0);
    const h = clamp(Math.floor(box.y1 - box.y0), 1, baseCanvas.height - y0);
    try {
      const data = baseCtx.getImageData(x0, y0, w, h).data;
      const samples = [];
      const step = Math.max(1, Math.floor((w * h) / 2500));
      for (let i = 0, p = 0; i < data.length; i += 4 * step, p++) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        samples.push({r, g, b, lum: 0.2126 * r + 0.7152 * g + 0.0722 * b});
      }
      if (!samples.length) return '#111111';
      const mean = samples.reduce((sum, pixel) => sum + pixel.lum, 0) / samples.length;
      samples.sort((a, b) => a.lum - b.lum);
      const count = Math.max(1, Math.ceil(samples.length * 0.15));
      const chosen = mean > 127 ? samples.slice(0, count) : samples.slice(-count);
      const avg = chosen.reduce((p, c) => ({r: p.r + c.r, g: p.g + c.g, b: p.b + c.b}), {r: 0, g: 0, b: 0});
      return '#' + [avg.r, avg.g, avg.b].map(value => Math.round(value / chosen.length).toString(16).padStart(2, '0')).join('');
    } catch (_) { return '#111111'; }
  }
  function fontSuggestions(line) {
    if (!line.text) return fonts.slice(0, 3);
    const m = document.createElement('canvas').getContext('2d');
    const target = Math.max(1, Number(line.bbox.x1) - Number(line.bbox.x0));
    return fonts.map(font => {
      m.font = `${line.fontSize}px ${JSON.stringify(font)}, sans-serif`;
      return {font, delta: Math.abs(m.measureText(line.text).width - target)};
    }).sort((a, b) => a.delta - b.delta).slice(0, 3).map(item => item.font);
  }
  function paintTextControls() {
    $('#line-count').textContent = `${lines.length} ${lines.length === 1 ? 'LINE' : 'LINES'}`;
    if (!lines.length) {
      textLines.innerHTML = '<p class="editor-result-note">No text boxes yet. Run OCR or add a manual overlay.</p>';
      return;
    }
    textLines.innerHTML = lines.map((line, index) => {
      const confidence = line.manual ? 'MANUAL' : `${Math.round(line.confidence)}% OCR`;
      const suggestion = fontSuggestions(line).join(', ');
      const fontOptions = fonts.map(font => `<option value="${esc(font)}"${font === line.font ? ' selected' : ''}>${esc(font)}</option>`).join('');
      return `<div class="ocr-row" data-row="${index}">
        <div class="ocr-source"><strong>BOX ${index + 1} · ${confidence} · EST. ${Math.round(line.fontSize)} PX</strong>${esc(line.sourceText || '(manual overlay)')}</div>
        <label>Replacement text<input type="text" maxlength="500" value="${esc(line.text)}" data-field="text" aria-label="Replacement text for box ${index + 1}"></label>
        <label>Font size<input type="number" min="6" max="300" step="1" value="${Math.round(line.fontSize)}" data-field="fontSize" aria-label="Font size for box ${index + 1}"></label>
        <label>Font match<select data-field="font" aria-label="Suggested font for box ${index + 1}">${fontOptions}</select></label>
        <label>Text color<input type="color" value="${line.color}" data-field="color" aria-label="Text color for box ${index + 1}"></label>
        <small class="font-hint">Closest width suggestions: ${esc(suggestion)}. Suggestions are approximate; adjust by eye.</small>
      </div>`;
    }).join('');
    textLines.querySelectorAll('.ocr-row').forEach(row => {
      const index = Number(row.dataset.row);
      row.addEventListener('focusin', () => { selectedLine = index; });
      row.querySelectorAll('[data-field]').forEach(control => {
        control.addEventListener('input', () => {
          const field = control.dataset.field;
          if (field === 'fontSize') lines[index][field] = clamp(Number(control.value) || 18, 6, 300);
          else lines[index][field] = control.value;
          selectedLine = index;
          render();
          if (field === 'fontSize' || field === 'text') {
            const source = row.querySelector('.font-hint');
            if (source) source.textContent = `Closest width suggestions: ${fontSuggestions(lines[index]).join(', ')}. Suggestions are approximate; adjust by eye.`;
          }
        });
      });
    });
  }
  function updateButtons() {
    const ready = imageReady;
    $('#scan-text').disabled = !ready;
    $('#add-text').disabled = !ready || lines.length >= limit.lines;
    $('#pick-color').disabled = !ready || !lines.length;
    $('#select-repair').disabled = !ready;
    $('#choose-sample').disabled = !ready || !repairSelection;
    $('#export-image').disabled = !ready;
    $('#reset-repair').disabled = !ready || (!strokes.length && !repairSelection && !samplePoint);
    $('#start-repair').disabled = !ready || !repairSelection || !samplePoint;
    $('#undo-repair').disabled = !strokes.length;
  }
  async function loadImage(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) throw new Error('Choose a supported image file.');
    if (file.size > limit.bytes) throw new Error('Image exceeds the 12 MB local file limit.');
    let bitmap;
    if ('createImageBitmap' in window) bitmap = await createImageBitmap(file);
    else {
      const url = URL.createObjectURL(file);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        bitmap = image;
      } finally { URL.revokeObjectURL(url); }
    }
    const width = bitmap.width || bitmap.naturalWidth;
    const height = bitmap.height || bitmap.naturalHeight;
    if (width > limit.side || height > limit.side || width * height > limit.pixels) {
      bitmap.close?.();
      throw new Error('Image is larger than this editor’s bounds (4,096 px per side and 10 megapixels). Resize a copy and try again.');
    }
    baseCanvas.width = canvas.width = width;
    baseCanvas.height = canvas.height = height;
    renderedWidth = width;
    renderedHeight = height;
    baseCtx.clearRect(0, 0, width, height);
    baseCtx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    imageReady = true;
    lines = [];
    strokes = [];
    repairSelection = null;
    samplePoint = null;
    selectedLine = 0;
    draftSelection = null;
    placeholder.hidden = true;
    paintTextControls();
    render();
    updateButtons();
    setStatus(`Image opened locally (${width} × ${height}). The original file is unchanged.`, 'success');
  }
  fileInput.addEventListener('change', async () => {
    try { await loadImage(fileInput.files?.[0]); }
    catch (error) { setStatus(error?.message || 'The image could not be opened.', 'error'); }
  });

  function loadTesseractScript() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('./vendor/ocr/tesseract.min.js', document.baseURI).href;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('The OCR library loaded without its browser API.'));
      script.onerror = () => reject(new Error('Could not load local OCR code. Check your connection to this site and try again.'));
      document.head.appendChild(script);
    });
  }
  async function getWorker(language) {
    if (worker && workerLanguage === language) return worker;
    if (worker) { await worker.terminate(); worker = null; workerLanguage = ''; }
    const Tesseract = await loadTesseractScript();
    const vendorRoot = new URL('./vendor/ocr/', document.baseURI);
    worker = await Tesseract.createWorker(language, 1, {
      workerPath: new URL('worker.min.js', vendorRoot).href,
      corePath: new URL('core/', vendorRoot).href.replace(/\/$/, ''),
      langPath: new URL('tessdata/', vendorRoot).href.replace(/\/$/, ''),
      gzip: true,
      logger: message => {
        if (message.status) {
          const progress = typeof message.progress === 'number' ? ` ${Math.round(message.progress * 100)}%` : '';
          setStatus(`Loading local OCR assets: ${message.status}${progress}. The selected language data load from this site.`, '');
        }
      }
    });
    workerLanguage = language;
    return worker;
  }
  $('#scan-text').addEventListener('click', async () => {
    if (!imageReady) { setStatus('Import an image first.', 'error'); return; }
    if (!api.credits.canRun(status)) return;
    const button = $('#scan-text');
    button.disabled = true;
    try {
      const activeWorker = await getWorker(langInput.value);
      setStatus('Running OCR in your browser. Image pixels are not uploaded.', '');
      const result = await activeWorker.recognize(baseCanvas);
      const detected = (result?.data?.lines || []).filter(line => String(line.text || '').trim()).slice(0, limit.lines).map(line => {
        const box = line.bbox || {x0: 0, y0: 0, x1: 0, y1: 0};
        const bbox = {
          x0: clamp(Number(box.x0) || 0, 0, baseCanvas.width - 1),
          y0: clamp(Number(box.y0) || 0, 0, baseCanvas.height - 1),
          x1: clamp(Number(box.x1) || 0, 1, baseCanvas.width),
          y1: clamp(Number(box.y1) || 0, 1, baseCanvas.height)
        };
        const boxHeight = Math.max(8, bbox.y1 - bbox.y0);
        const item = {sourceText: String(line.text).trim().slice(0, 500), text: String(line.text).trim().slice(0, 500), bbox, confidence: clamp(Number(line.confidence) || 0, 0, 100), fontSize: clamp(boxHeight * 0.82, 6, 300), font: 'Arial', color: estimateTextColor(bbox)};
        item.font = fontSuggestions(item)[0] || 'Arial';
        return item;
      });
      lines = detected;
      selectedLine = 0;
      paintTextControls();
      render();
      if (!lines.length) {
        setStatus('OCR completed but found no text boxes. No credit was used; you can still add a manual text overlay.', 'warn');
      } else {
        api.credits.charge();
        setStatus(`Detected ${lines.length} text ${lines.length === 1 ? 'box' : 'boxes'} locally. Edit a line below; use manual repair separately to cover old text.`, 'success');
      }
      updateButtons();
    } catch (error) {
      setStatus(error?.message || 'OCR did not finish. No credit was used.', 'error');
    } finally {
      button.disabled = false;
      updateButtons();
    }
  });
  $('#add-text').addEventListener('click', () => {
    if (!imageReady || lines.length >= limit.lines) return;
    const w = Math.max(40, Math.round(baseCanvas.width * 0.42));
    const h = Math.max(24, Math.round(baseCanvas.height * 0.08));
    const x0 = Math.round((baseCanvas.width - w) / 2);
    const y0 = Math.round((baseCanvas.height - h) / 2);
    const bbox = {x0, y0, x1: x0 + w, y1: y0 + h};
    lines.push({sourceText: 'Manual text overlay', text: '', bbox, confidence: 0, fontSize: clamp(h * 0.8, 6, 300), font: 'Arial', color: '#111111', manual: true});
    selectedLine = lines.length - 1;
    paintTextControls();
    updateButtons();
    textLines.lastElementChild?.scrollIntoView({block: 'nearest'});
    textLines.lastElementChild?.querySelector('[data-field="text"]')?.focus();
  });
  $('#pick-color').addEventListener('click', () => {
    if (!imageReady || !lines.length) { setStatus('Run OCR or add a text overlay before sampling a text color.', 'warn'); return; }
    selectedLine = clamp(selectedLine, 0, lines.length - 1);
    setMode('color');
    setStatus('Click a pixel in the image to use its sampled color for the selected text box.', '');
  });
  $('#select-repair').addEventListener('click', () => {
    if (!imageReady) return;
    repairSelection = null;
    samplePoint = null;
    updateButtons();
    setMode('select');
    setStatus('Drag a rectangle around the old text or damaged area. Repair strokes will stay inside this boundary.', '');
  });
  $('#choose-sample').addEventListener('click', () => {
    if (!imageReady || !repairSelection) { setStatus('Select a repair area first.', 'warn'); return; }
    setMode('sample');
    setStatus('Click a nearby clean patch with a similar background to use as the clone source.', '');
  });
  $('#start-repair').addEventListener('click', () => {
    if (!imageReady || !repairSelection || !samplePoint) { setStatus('Select a repair area and choose a clean sample first.', 'warn'); return; }
    setMode('brush');
    setStatus('Paint within the selected region. Undo removes the most recent stroke; reset clears all manual repairs.', '');
  });
  $('#undo-repair').addEventListener('click', () => {
    if (strokes.length) strokes.pop();
    render(); updateButtons();
    setStatus('Last manual repair stroke undone.', 'success');
  });
  $('#reset-repair').addEventListener('click', () => {
    strokes = []; repairSelection = null; samplePoint = null; draftSelection = null;
    setMode('idle'); render(); updateButtons();
    setStatus('Manual repairs reset. The original image and text overlays remain.', 'success');
  });
  $('#brush-size').addEventListener('input', event => { $('#brush-size-label').textContent = `${event.target.value} px`; });

  overlay.addEventListener('pointerdown', event => {
    if (!imageReady) return;
    const point = pointFromEvent(event);
    if (!point) return;
    overlay.setPointerCapture?.(event.pointerId);
    if (mode === 'select') { dragStart = point; draftSelection = {x: point.x, y: point.y, w: 0, h: 0}; drawInteraction(); }
    else if (mode === 'sample') {
      samplePoint = point; setMode('idle'); updateButtons();
      setStatus('Clone sample selected. Start painting inside the repair boundary.', 'success');
    } else if (mode === 'color') {
      const pixel = baseCtx.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data;
      if (lines[selectedLine]) {
        lines[selectedLine].color = '#' + [pixel[0], pixel[1], pixel[2]].map(value => value.toString(16).padStart(2, '0')).join('');
        paintTextControls(); render();
        setStatus(`Color ${lines[selectedLine].color} sampled from the local image for box ${selectedLine + 1}.`, 'success');
      }
      setMode('idle');
    } else if (mode === 'brush') {
      if (!repairSelection || !samplePoint || !isInsideSelection(point)) { setStatus('Keep the brush inside the selected repair region.', 'warn'); return; }
      activeStroke = {origin: point, source: samplePoint, size: Number($('#brush-size').value) || 24, selection: {...repairSelection}, points: [point]};
    }
  });
  overlay.addEventListener('pointermove', event => {
    if (!imageReady) return;
    const point = pointFromEvent(event);
    if (!point) return;
    if (mode === 'select' && dragStart) {
      draftSelection = {x: Math.min(dragStart.x, point.x), y: Math.min(dragStart.y, point.y), w: Math.abs(point.x - dragStart.x), h: Math.abs(point.y - dragStart.y)};
      drawInteraction();
    } else if (mode === 'brush' && activeStroke && isInsideSelection(point)) {
      if (activeStroke.points.length < 5000) activeStroke.points.push(point);
      render();
    }
  });
  function finishPointer() {
    if (mode === 'select' && dragStart && draftSelection) {
      const box = draftSelection;
      if (box.w >= 3 && box.h >= 3) {
        repairSelection = {x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h)};
        samplePoint = null;
        setStatus(`Repair area selected (${repairSelection.w} × ${repairSelection.h} px). Choose a clean sample next.`, 'success');
      } else setStatus('Selection was too small; drag a larger repair area.', 'warn');
      draftSelection = null; dragStart = null; setMode('idle'); updateButtons();
    }
    if (activeStroke) {
      if (activeStroke.points.length) strokes.push(activeStroke);
      activeStroke = null; render(); updateButtons();
    }
  }
  overlay.addEventListener('pointerup', finishPointer);
  overlay.addEventListener('pointercancel', finishPointer);
  $('#export-image').addEventListener('click', async () => {
    if (!imageReady) return;
    if (!api.credits.canRun(status)) return;
    const button = $('#export-image'); button.disabled = true;
    try {
      render();
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('The browser could not create a PNG from this image. No credit was used.');
      const rawName = $('#download-name').value.trim() || 'edited-image.png';
      const filename = rawName.toLowerCase().endsWith('.png') ? rawName : `${rawName}.png`;
      api.credits.charge();
      api.download(blob, filename.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 90));
      setStatus('Edited PNG exported locally. The source file was not changed.', 'success');
    } catch (error) { setStatus(error?.message || 'PNG export failed; no credit was used.', 'error'); }
    finally { button.disabled = false; updateButtons(); }
  });
  $('#download-name').addEventListener('input', event => { event.target.value = event.target.value.replace(/[\\/]/g, '-'); });
  if ('ResizeObserver' in window) new ResizeObserver(drawInteraction).observe(stage);
  else window.addEventListener('resize', drawInteraction);
  window.addEventListener('beforeunload', () => { if (worker) worker.terminate(); if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl); });
})();
