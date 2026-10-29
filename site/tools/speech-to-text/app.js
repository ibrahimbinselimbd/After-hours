(() => {
  'use strict';

  const AHToolkit = window.AHToolkit;
  const A = AHToolkit;
  const $ = id => document.getElementById(id);
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const MAX_DURATION_SECONDS = 180;

  A.mount(`<div class="tool-form">
    <div class="notice"><strong>Local Whisper transcription</strong><p>Model files are loaded on first use; transcription runs only in this browser. Audio is not uploaded. Limit: 25 MB or 3 minutes.</p></div>
    <div class="field-grid">
      <label class="field"><span>Language</span><select id="st-lang"><option value="en">English</option><option value="es">Spanish</option><option value="bn">Bengali</option><option value="auto">Auto detect</option></select></label>
      <label class="drop-zone" for="st-file"><strong>Choose audio</strong><span>Maximum 25 MB or 3 minutes</span><input id="st-file" type="file" accept="audio/*,.wav,.mp3,.m4a,.webm"></label>
    </div>
    <div class="actions"><button class="button button-main" id="st-run">Transcribe locally</button><button class="button" id="st-cancel" disabled>Cancel</button><button class="button" id="st-srt" disabled>Download SRT</button><button class="button" id="st-vtt" disabled>Download VTT</button></div>
    <progress id="st-progress" class="progress" max="100" value="0"></progress><div id="st-status" class="status" role="status"></div><textarea id="st-text" rows="12" readonly></textarea>
  </div>`);

  let worker = null;
  let segments = [];
  let operation = 0;
  let activeReject = null;
  let cancelDurationRead = null;

  const alive = id => id === operation;
  const formatTime = (seconds, comma) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${comma ? ',' : '.'}${String(ms).padStart(3, '0')}`;
  };

  function reset() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    $('st-run').disabled = false;
    $('st-cancel').disabled = true;
  }

  function readLocalDuration(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      let settled = false;
      let timer;
      const cancel = () => finish(reject, new Error('Cancelled.'));
      const cleanup = () => {
        clearTimeout(timer);
        audio.onloadedmetadata = null;
        audio.onerror = null;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        URL.revokeObjectURL(url);
        if (cancelDurationRead === cancel) cancelDurationRead = null;
      };
      const finish = (handler, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        handler(value);
      };

      cancelDurationRead = cancel;
      timer = setTimeout(() => finish(reject, new Error('Could not read local audio duration. Try a browser-supported audio file.')), 15000);
      audio.onloadedmetadata = () => finish(resolve, audio.duration);
      audio.onerror = () => finish(reject, new Error('Could not read local audio metadata. Try a browser-supported audio file.'));
      audio.src = url;
      audio.load();
    });
  }

  function exportFile(type) {
    const body = segments.map((segment, index) => `${index + 1}\n${formatTime(segment.start, type === 'srt')} --> ${formatTime(segment.end, type === 'srt')}\n${segment.text}\n`).join('\n');
    A.downloadText(type === 'srt' ? body : `WEBVTT\n\n${body}`, `afterhours-speech.${type}`);
  }

  $('st-run').onclick = async () => {
    const file = $('st-file').files[0];
    if (!file) return A.status($('st-status'), 'Choose an audio file first.', 'warn');
    if (!AHToolkit.credits.canRun($('st-status'))) return;
    if (file.size > MAX_FILE_BYTES) return A.status($('st-status'), 'Audio exceeds the 25 MB limit.', 'warn');

    const id = ++operation;
    $('st-run').disabled = true;
    $('st-cancel').disabled = false;
    $('st-progress').value = 0;
    $('st-text').value = '';
    $('st-srt').disabled = $('st-vtt').disabled = true;
    segments = [];

    let audioContext = null;
    let decoded = null;
    let encoded = null;
    let workerReject = null;

    try {
      A.status($('st-status'), 'Checking local audio duration…');
      const metadataDuration = await readLocalDuration(file);
      if (!alive(id)) throw new Error('Cancelled.');
      if (!Number.isFinite(metadataDuration) || metadataDuration <= 0) throw new Error('Could not determine a valid audio duration.');
      if (metadataDuration > MAX_DURATION_SECONDS) throw new Error('Audio exceeds the 3-minute memory-safety limit. No model was loaded.');

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('This browser does not support local audio decoding.');
      encoded = await file.arrayBuffer();
      if (!alive(id)) throw new Error('Cancelled.');
      audioContext = new AudioContextClass();
      decoded = await audioContext.decodeAudioData(encoded.slice(0));
      encoded = null;
      if (audioContext.state !== 'closed') {
        await audioContext.close();
        audioContext = null;
      }
      if (!alive(id)) throw new Error('Cancelled.');
      if (!Number.isFinite(decoded.duration) || decoded.duration > MAX_DURATION_SECONDS || decoded.length > Math.ceil(decoded.sampleRate * MAX_DURATION_SECONDS)) {
        throw new Error('Decoded audio exceeds the 3-minute memory-safety limit. No model was loaded.');
      }
      const duration = decoded.duration;
      const rate = decoded.sampleRate;
      const channel = decoded.getChannelData(0).slice();
      decoded = null;
      if (!alive(id)) throw new Error('Cancelled.');

      A.status($('st-status'), 'Loading local Whisper model and transcribing…');
      worker = new Worker('/tools/speech-to-text/worker.js', { type: 'module' });
      const result = await new Promise((resolve, reject) => {
        workerReject = reject;
        activeReject = reject;
        worker.onmessage = event => {
          if (!alive(id)) return;
          const message = event.data;
          if (message.type === 'progress') {
            $('st-progress').value = Math.max(0, Math.min(100, Math.round(message.value || 0)));
            A.status($('st-status'), message.status || 'Transcribing locally…');
          } else if (message.type === 'result') {
            resolve(message);
          } else {
            reject(new Error(message.message || 'Transcription failed.'));
          }
        };
        worker.onerror = () => reject(new Error('Speech model worker failed.'));
        worker.postMessage({ type: 'transcribe', audio: channel, rate, language: $('st-lang').value, operationId: id }, [channel.buffer]);
      });
      if (activeReject === workerReject) activeReject = null;
      if (!alive(id)) throw new Error('Cancelled.');
      segments = result.chunks || [];
      if (!segments.length && result.text) segments = [{ start: 0, end: duration, text: result.text }];
      if (!segments.length) throw new Error('No speech was detected.');
      if (!alive(id) || !AHToolkit.credits.charge()) throw new Error('Cancelled or no local credit remained.');
      $('st-text').value = segments.map(segment => segment.text).join(' ');
      $('st-srt').disabled = $('st-vtt').disabled = false;
      A.status($('st-status'), 'Transcription completed locally. One credit used.', 'ok');
    } catch (error) {
      if (alive(id)) A.status($('st-status'), error.message || 'Transcription failed. No credit used.', 'warn');
    } finally {
      if (activeReject === workerReject) activeReject = null;
      if (audioContext && audioContext.state !== 'closed') await audioContext.close().catch(() => {});
      decoded = null;
      encoded = null;
      if (alive(id)) reset();
    }
  };

  $('st-cancel').onclick = () => {
    const reject = activeReject;
    activeReject = null;
    operation++;
    if (cancelDurationRead) cancelDurationRead();
    reset();
    if (reject) reject(new Error('Cancelled.'));
    A.status($('st-status'), 'Cancelled. No credit used.', 'warn');
  };
  $('st-srt').onclick = () => exportFile('srt');
  $('st-vtt').onclick = () => exportFile('vtt');
})();
