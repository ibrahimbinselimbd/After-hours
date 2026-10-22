const $ = selector => document.querySelector(selector);
const fileInput = $('#file-input');
const dropZone = $('#drop-zone');
const queueGrid = $('#queue-grid');
const processButton = $('#process-button');
const clearButton = $('#clear-button');
const stopButton = $('#stop-button');
const zipButton = $('#zip-button');
const qualitySelect = $('#quality-mode');
const MAX_FILES = 100;
const MAX_BYTES = 60 * 1024 * 1024;
const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp']);
const EXTENSION_OK = /\.(png|jpe?g|webp)$/i;
let queue = [];
let nextId = 1;
let enginePromise = null;
let isProcessing = false;
let isZipping = false;
let activeController = null;
let activeBatch = null;
let toastTimer = null;
const canMakeZip = () => queue.some(item => item.status === 'done' && item.resultBlob);

function announce(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1) + ' MB';
}
function fileBaseName(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'image';
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function countLabel(count) { return String(count).padStart(2, '0'); }
function revokeItem(item) {
  if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
  if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
}
function acceptedFile(file) {
  return ACCEPTED.has(file.type) || EXTENSION_OK.test(file.name);
}

function addFiles(fileList) {
  if (isZipping) { announce('ZIP export is in progress. Wait before adding more images.'); return; }
  const incoming = Array.from(fileList || []);
  if (!incoming.length) return;
  let added = 0, rejected = 0, tooLarge = 0, tooMany = 0;
  for (const file of incoming) {
    if (!acceptedFile(file)) { rejected++; continue; }
    if (file.size > MAX_BYTES) { tooLarge++; continue; }
    if (queue.length >= MAX_FILES) { tooMany++; continue; }
    const originalUrl = URL.createObjectURL(file);
    queue.push({
      id: nextId++, file, originalUrl, resultUrl: null, resultBlob: null,
      status: 'queued', progress: 0, showResult: true, error: '', provider: '',
      model: '', durationMs: 0
    });
    added++;
  }
  renderQueue();
  if (added) announce(added + (added === 1 ? ' image added to the queue.' : ' images added to the queue.'));
  const notes = [];
  if (rejected) notes.push(rejected + ' unsupported file(s) skipped');
  if (tooLarge) notes.push(tooLarge + ' file(s) over 60 MB skipped');
  if (tooMany) notes.push('Queue limit is 100 images');
  if (notes.length) announce(notes.join(' · '));
}

function renderQueue() {
  $('#queue-count').textContent = countLabel(queue.length);
  $('#result-count').textContent = countLabel(queue.filter(x => x.status === 'done').length) + ' READY';
  $('#queue-subtitle').textContent = queue.length
    ? queue.filter(x => x.status === 'done').length + ' finished · ' + queue.filter(x => x.status === 'queued' || x.status === 'error').length + ' waiting'
    : 'Waiting for your first image';
  $('#empty-state').hidden = queue.length > 0;
  clearButton.disabled = !queue.length || isProcessing || isZipping;
  fileInput.disabled = isZipping;
  processButton.disabled = isProcessing || isZipping || !queue.some(x => x.status === 'queued' || x.status === 'error');
  processButton.innerHTML = isProcessing ? '<span class="button-spark">✳</span> Processing batch…' : '<span class="button-spark">✳</span> ' + (queue.some(x => x.status === 'queued' || x.status === 'error') ? 'Remove backgrounds' : 'All images processed') + ' <span aria-hidden="true">↗</span>';
  stopButton.hidden = !isProcessing;
  zipButton.disabled = !canMakeZip() || isProcessing || isZipping;
  $('#zip-count').textContent = countLabel(queue.filter(x => x.status === 'done' && x.resultBlob).length);
  $('#export-title').textContent = canMakeZip() ? 'Your cutouts are ready.' : 'Ready when you are.';
  $('#export-subtitle').textContent = canMakeZip()
    ? 'Transparent PNGs are ready to save individually or as one ZIP.'
    : 'Finished cutouts can be downloaded individually or packed together.';
  queueGrid.innerHTML = queue.map(item => {
    const previewUrl = item.showResult && item.resultUrl ? item.resultUrl : item.originalUrl;
    const badge = item.status === 'done' ? '<span class="tile-badge done">CUT COMPLETE</span>'
      : item.status === 'error' ? '<span class="tile-badge error">NEEDS RETRY</span>'
      : item.status === 'processing' ? '<span class="tile-badge">PROCESSING</span>'
      : '<span class="tile-badge">QUEUED</span>';
    const statusText = item.status === 'done' ? (item.provider || 'LOCAL') + ' · ' + (item.durationMs ? (item.durationMs / 1000).toFixed(1) + 's' : 'READY')
      : item.status === 'error' ? 'Failed · retry available'
      : item.status === 'processing' ? 'Preparing… ' + Math.round(item.progress) + '%'
      : 'Waiting in queue';
    const meta = item.status === 'done' ? (item.model || 'AI CUTOUT').toUpperCase()
      : item.status === 'error' ? item.error
      : formatBytes(item.file.size) + ' · ' + (item.file.type ? item.file.type.replace('image/', '').toUpperCase() : 'IMAGE');
    return '<article class="image-tile" data-id="' + item.id + '">' +
      '<div class="preview-stage"><img class="preview-image" src="' + previewUrl + '" alt="' + escapeHTML(item.file.name) + (item.status === 'done' && item.showResult ? ' — background removed' : ' — original') + '" loading="lazy" decoding="async">' + badge +
      '<div class="tile-loading" ' + (item.status === 'processing' ? '' : 'hidden') + '>CUTTING…</div></div>' +
      '<div class="tile-body"><div class="tile-name" title="' + escapeHTML(item.file.name) + '">' + escapeHTML(item.file.name) + '</div>' +
      '<div class="tile-meta"><span class="tile-status" data-status="' + item.status + '">' + escapeHTML(statusText) + '</span></div>' +
      '<div class="tile-progress"><span style="width:' + (item.status === 'done' ? 100 : item.progress) + '%"></span></div>' +
      '<div class="tile-buttons">' +
      '<button type="button" data-action="toggle" ' + (!item.resultUrl ? 'disabled' : '') + '>' + (item.showResult ? 'View original' : 'View cutout') + '</button>' +
      '<button type="button" class="tile-download" data-action="download" ' + (!item.resultBlob ? 'disabled' : '') + '>PNG ↓</button>' +
      '<button type="button" data-action="retry" ' + (item.status !== 'error' || isProcessing ? 'hidden' : '') + '>Retry</button>' +
      '<button type="button" data-action="remove" aria-label="Remove ' + escapeHTML(item.file.name) + '" ' + (isProcessing || isZipping ? 'disabled' : '') + '>×</button>' +
      '</div><div class="tile-hint">' + escapeHTML(item.status === 'error' ? item.error : item.status === 'done' ? 'Original dimensions preserved where supported.' : item.status === 'processing' ? 'Running locally on this device.' : 'Ready for the cut engine.') + '</div></div></article>';
  }).join('');
}

function updateItemProgress(item) {
  const tile = queueGrid.querySelector('[data-id="' + item.id + '"]');
  if (!tile) return;
  const status = tile.querySelector('.tile-status');
  const bar = tile.querySelector('.tile-progress span');
  const loading = tile.querySelector('.tile-loading');
  const percent = Math.max(0, Math.min(100, item.progress || 0));
  if (status) {
    status.textContent = item.status === 'processing' ? (item.stage || 'Processing') + ' · ' + Math.round(percent) + '%' : item.status;
    status.dataset.status = item.status;
  }
  if (bar) bar.style.width = percent + '%';
  if (loading) loading.hidden = item.status !== 'processing';
}
function setProgress(percent, title, detail) {
  const panel = $('#progress-panel');
  panel.hidden = false;
  const value = Math.max(0, Math.min(100, Math.round(percent || 0)));
  $('#progress-title').textContent = title || 'Working…';
  $('#progress-percent').textContent = value + '%';
  $('#overall-progress-bar').style.width = value + '%';
  $('#overall-progress').setAttribute('aria-valuenow', String(value));
  $('#progress-detail').textContent = detail || 'Processing is happening locally in this browser.';
}
function hideProgress() { $('#progress-panel').hidden = true; }
function updateBatchProgress(completed, currentPercent, total) {
  const totalSafe = Math.max(total || 1, 1);
  const overall = ((completed + (currentPercent || 0) / 100) / totalSafe) * 100;
  setProgress(overall, 'Processing image ' + Math.min(completed + 1, totalSafe) + ' of ' + totalSafe, 'The active image is being segmented locally. Other files wait in the queue.');
}

async function getEngine() {
  if (!enginePromise) {
    $('#engine-status').textContent = 'LOADING LOCAL ENGINE';
    setProgress(0, 'Loading the cut engine…', 'First use downloads the model/runtime. Image pixels are not uploaded.');
    enginePromise = import('https://esm.sh/@bg0/browser@0.1.1');
    enginePromise = enginePromise.catch(error => {
      enginePromise = null;
      throw new Error('Could not load the local AI engine. Check your connection, then retry. ' + (error && error.message ? error.message : ''));
    });
  }
  const mod = await enginePromise;
  if (typeof mod.removeBackground !== 'function') throw new Error('The local cut engine did not load correctly. Reload the page and retry.');
  return mod;
}

async function processQueue() {
  if (isProcessing || isZipping) return;
  const candidates = queue.filter(item => item.status === 'queued' || item.status === 'error');
  if (!candidates.length) return;
  isProcessing = true;
  activeBatch = { total: candidates.length, completed: 0 };
  activeController = new AbortController();
  renderQueue();
  $('#engine-status').textContent = 'ENGINE ACTIVE';
  try {
    const engine = await getEngine();
    for (const item of candidates) {
      if (activeController.signal.aborted) break;
      item.status = 'processing';
      item.progress = 0;
      item.error = '';
      item.stage = 'Preparing';
      renderQueue();
      try {
        const result = await engine.removeBackground(item.file, {
          quality: qualitySelect.value === 'fast' ? 'fast' : 'quality',
          signal: activeController.signal,
          onProgress: event => {
            const raw = typeof event?.progress === 'number' ? event.progress : 0;
            item.progress = Math.max(0, Math.min(100, raw <= 1 ? raw * 100 : raw));
            item.stage = event?.message || event?.stage || 'Processing';
            if (activeBatch) updateBatchProgress(activeBatch.completed, item.progress, activeBatch.total);
            updateItemProgress(item);
          }
        });
        if (activeController.signal.aborted) {
          item.status = 'queued';
          item.progress = 0;
          break;
        }
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
        item.resultBlob = result.blob;
        item.resultUrl = URL.createObjectURL(result.blob);
        item.status = 'done';
        item.progress = 100;
        item.showResult = true;
        item.provider = result.provider === 'webgpu' ? 'WebGPU' : result.provider === 'wasm' ? 'WASM' : 'LOCAL';
        item.model = result.model || 'BiRefNet';
        item.durationMs = result.durationMs || 0;
      } catch (error) {
        if (activeController.signal.aborted || error?.name === 'AbortError') {
          item.status = 'queued';
          item.progress = 0;
          break;
        }
        item.status = 'error';
        item.error = String(error?.message || 'Processing failed').slice(0, 160);
      }
      activeBatch.completed++;
      updateBatchProgress(activeBatch.completed, 0, activeBatch.total);
      renderQueue();
    }
    const done = candidates.filter(item => item.status === 'done').length;
    const failed = candidates.filter(item => item.status === 'error').length;
    if (activeController.signal.aborted) {
      setProgress(0, 'Queue stopped', 'Completed results are preserved. You can resume the remaining images.');
      announce('Queue stopped. Finished results have been kept.');
    } else {
      setProgress(100, 'Batch complete', done + ' completed · ' + failed + ' failed. Review results before exporting.');
      announce(done + ' image(s) processed' + (failed ? ' · ' + failed + ' need a retry.' : '.'));
    }
  } catch (error) {
    setProgress(0, 'The local engine could not start', String(error?.message || error));
    announce(String(error?.message || 'Could not load the local engine.'));
  } finally {
    isProcessing = false;
    activeController = null;
    activeBatch = null;
    $('#engine-status').textContent = queue.some(x => x.status === 'done') ? 'CUTS COMPLETE' : 'ENGINE STANDBY';
    renderQueue();
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function downloadItem(item) {
  if (!item.resultBlob) return;
  downloadBlob(item.resultBlob, fileBaseName(item.file.name) + '-no-bg.png');
}
async function downloadZip() {
  const items = queue.filter(item => item.status === 'done' && item.resultBlob);
  if (!items.length || isZipping) return;
  isZipping = true;
  renderQueue();
  zipButton.setAttribute('aria-busy', 'true');
  const zipIcon = zipButton.querySelector('span');
  if (zipIcon) zipIcon.textContent = '…';
  setProgress(0, 'Packing transparent PNGs…', 'The ZIP is assembled in this browser; no files are uploaded.');
  try {
    const { Zip, ZipDeflate } = await import('https://esm.sh/fflate@0.8.2');
    const chunks = [];
    const zipBlobPromise = new Promise((resolve, reject) => {
      const zip = new Zip((error, chunk, final) => {
        if (error) { reject(error); return; }
        if (chunk?.length) chunks.push(chunk);
        if (final) resolve(new Blob(chunks, { type: 'application/zip' }));
      });
      (async () => {
        const usedNames = new Set();
        for (let index = 0; index < items.length; index++) {
          const item = items[index];
          let name = fileBaseName(item.file.name) + '-no-bg.png';
          const base = name.replace(/\.png$/i, '');
          let suffix = 2;
          while (usedNames.has(name.toLowerCase())) name = base + '-' + suffix++ + '.png';
          usedNames.add(name.toLowerCase());
          const entry = new ZipDeflate(name, { level: 1 });
          zip.add(entry);
          const reader = item.resultBlob.stream().getReader();
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              entry.push(value, false);
            }
            entry.push(new Uint8Array(0), true);
          } finally {
            reader.releaseLock();
          }
          setProgress(((index + 1) / items.length) * 100, 'Packing image ' + (index + 1) + ' of ' + items.length, 'ZIP preparation is running locally on your device.');
        }
        zip.end();
      })().catch(reject);
    });
    const blob = await zipBlobPromise;
    downloadBlob(blob, 'afterhours-background-remover.zip');
    announce('ZIP ready · ' + items.length + ' transparent PNGs.');
    setProgress(100, 'ZIP exported', items.length + ' transparent PNGs packed successfully.');
  } catch (error) {
    setProgress(0, 'ZIP export failed', String(error?.message || error) + ' You can still download each PNG individually.');
    announce('Could not create the ZIP. Individual PNG downloads are still available.');
  } finally {
    isZipping = false;
    zipButton.removeAttribute('aria-busy');
    zipButton.innerHTML = '<span>▧</span> Download all as ZIP <b id="zip-count">' + countLabel(queue.filter(x => x.status === 'done' && x.resultBlob).length) + '</b>';
    renderQueue();
  }
}

fileInput.addEventListener('change', event => {
  addFiles(event.target.files);
  fileInput.value = '';
});
for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, event => { event.preventDefault(); dropZone.classList.add('drag-active'); });
}
for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, event => { event.preventDefault(); dropZone.classList.remove('drag-active'); });
}
dropZone.addEventListener('drop', event => addFiles(event.dataTransfer?.files));
dropZone.addEventListener('keydown', event => {
  if (event.target !== dropZone) return;
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
});
processButton.addEventListener('click', processQueue);
stopButton.addEventListener('click', () => { if (activeController) activeController.abort(); });
clearButton.addEventListener('click', () => {
  if (isProcessing || isZipping) return;
  queue.forEach(revokeItem);
  queue = [];
  renderQueue();
  hideProgress();
  $('#engine-status').textContent = 'ENGINE STANDBY';
  announce('Queue cleared.');
});
zipButton.addEventListener('click', downloadZip);
queueGrid.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const tile = button.closest('[data-id]');
  const item = queue.find(entry => entry.id === Number(tile?.dataset.id));
  if (!item) return;
  const action = button.dataset.action;
  if (action === 'download') downloadItem(item);
  if (action === 'toggle' && item.resultUrl) {
    item.showResult = !item.showResult;
    renderQueue();
  }
  if (action === 'remove' && !isProcessing && !isZipping) {
    revokeItem(item);
    queue = queue.filter(entry => entry.id !== item.id);
    renderQueue();
  }
  if (action === 'retry' && item.status === 'error' && !isProcessing) {
    item.status = 'queued';
    item.progress = 0;
    item.error = '';
    renderQueue();
    processQueue();
  }
});
document.querySelectorAll('[data-background]').forEach(button => {
  button.addEventListener('click', () => {
    const background = button.dataset.background;
    queueGrid.dataset.previewBg = background;
    document.querySelectorAll('[data-background]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  });
});
$('#custom-background').addEventListener('input', event => {
  queueGrid.dataset.previewBg = 'custom';
  queueGrid.style.setProperty('--custom-preview', event.target.value);
  document.querySelectorAll('[data-background]').forEach(option => option.setAttribute('aria-pressed', 'false'));
});
window.addEventListener('beforeunload', () => queue.forEach(revokeItem));
renderQueue();
