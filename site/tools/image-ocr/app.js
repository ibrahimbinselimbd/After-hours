(() => {
  'use strict';

  const AHToolkit = window.AHToolkit;
  const A = AHToolkit;
  const $ = id => document.getElementById(id);

  A.mount(`<div class="tool-form">
    <div class="notice"><strong>Local OCR</strong><p>Images remain in this browser.</p></div>
    <div class="field-grid">
      <label class="field"><span>Language</span><select id="ocr-lang"><option value="eng">English</option><option value="spa">Spanish</option><option value="ben">Bengali</option></select></label>
      <label class="drop-zone" for="ocr-file"><strong>Choose an image</strong><span>Maximum 5120 × 5120 pixels and 15 MB</span><input id="ocr-file" type="file" accept="image/*"></label>
    </div>
    <div class="actions"><button class="button button-main" id="ocr-run">Run OCR</button><button class="button" id="ocr-cancel" disabled>Cancel</button><button class="button" id="ocr-copy" disabled>Copy text</button><button class="button" id="ocr-download" disabled>Download TXT</button></div>
    <progress id="ocr-progress" class="progress" max="100" value="0"></progress>
    <div id="ocr-status" class="status" role="status"></div>
    <section id="ocr-result" class="result" hidden><p id="ocr-confidence" class="note"></p><label class="field"><span>Recognized text</span><textarea id="ocr-text" rows="12" readonly></textarea></label></section>
  </div>`);

  let worker = null;
  let text = '';
  let op = 0;
  const alive = id => id === op;

  function status(message, kind = '') {
    A.status($('ocr-status'), message, kind);
  }

  function reset() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    $('ocr-run').disabled = false;
    $('ocr-cancel').disabled = true;
  }

  $('ocr-run').onclick = async () => {
    const file = $('ocr-file').files[0];
    if (!file) return status('Choose an image first.', 'warn');
    if (!AHToolkit.credits.canRun($('ocr-status'))) return;
    if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) return status('Use an image up to 15 MB.', 'warn');

    const id = ++op;
    $('ocr-run').disabled = true;
    $('ocr-cancel').disabled = false;
    $('ocr-progress').value = 0;
    $('ocr-result').hidden = true;

    try {
      const bitmap = await createImageBitmap(file);
      if (!alive(id)) throw Error('Cancelled.');
      if (bitmap.width > 5120 || bitmap.height > 5120) throw Error('Image is too large. The limit is 5120 × 5120 pixels.');
      bitmap.close();
      const buffer = await file.arrayBuffer();
      if (!alive(id)) throw Error('Cancelled.');

      worker = new Worker('/tools/image-ocr/worker.js', {type: 'module'});
      const response = await new Promise((resolve, reject) => {
        if (!alive(id)) return reject(Error('Cancelled.'));
        worker.onmessage = event => {
          if (!alive(id)) return;
          const message = event.data;
          if (message.type === 'progress') {
            $('ocr-progress').value = Math.round(message.value * 100);
            status(message.status || 'Recognizing…');
          } else if (message.type === 'result') resolve(message);
          else reject(Error(message.message || 'OCR failed.'));
        };
        worker.onerror = () => reject(Error('OCR worker failed.'));
        worker.postMessage({type: 'recognize', buffer, language: $('ocr-lang').value, operationId: id}, [buffer]);
      });

      if (!alive(id)) throw Error('Cancelled.');
      text = response.text || '';
      if (!text.trim()) throw Error('OCR completed but found no text.');
      if (!alive(id) || !AHToolkit.credits.charge()) throw Error('Cancelled or no local credit remained.');
      if (!alive(id)) throw Error('Cancelled.');
      $('ocr-text').value = text;
      $('ocr-confidence').textContent = `Average confidence: ${Number(response.confidence || 0).toFixed(1)}%`;
      $('ocr-result').hidden = false;
      $('ocr-copy').disabled = $('ocr-download').disabled = false;
      status('OCR completed locally. One credit used.', 'ok');
    } catch (error) {
      if (alive(id)) status(error.message || 'OCR failed. No credit used.', 'warn');
    } finally {
      if (alive(id)) reset();
    }
  };

  $('ocr-cancel').onclick = () => {
    op++;
    reset();
    status('Cancelled. No credit used.', 'warn');
  };
  $('ocr-copy').onclick = async () => {
    const copied = await A.copy(text);
    status(copied ? 'Text copied.' : 'Copy was blocked.', copied ? 'ok' : 'warn');
  };
  $('ocr-download').onclick = () => text && A.downloadText(text, 'afterhours-ocr.txt');
})();
