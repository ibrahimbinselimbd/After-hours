(() => {
  const MAX_FILES = 10;
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const MAX_TOTAL_FILE_BYTES = 50 * 1024 * 1024;
  const MAX_DURATION_SECONDS = 300;
  const MAX_PCM_BYTES = 128 * 1024 * 1024;

  const root = AHToolkit.mount(`
    <h2>Join audio</h2>
    <p>Files are decoded and joined locally in selection order. Limit: 10 files, 25 MB each, 50 MB total and 5 minutes combined.</p>
    <label class="drop-zone">Choose audio files<input id="f" type="file" accept="audio/*" multiple></label>
    <ol id="l" class="file-list"></ol>
    <div class="actions"><button class="button button-main" id="g" type="button">Join and download WAV</button><button class="button" id="cancel" type="button" hidden>Cancel</button></div>
    <div id="s" class="status" role="status" aria-live="polite" hidden></div>
  `);
  const fileInput = root.querySelector('#f');
  const list = root.querySelector('#l');
  const status = root.querySelector('#s');
  const runButton = root.querySelector('#g');
  const cancelButton = root.querySelector('#cancel');
  let cancelRequested = false;

  fileInput.onchange = () => {
    const files = [...fileInput.files];
    list.innerHTML = files.map(file => `<li>${AHToolkit.escape(file.name)}</li>`).join('');
    if (files.length > MAX_FILES) return AHToolkit.status(status, `Choose no more than ${MAX_FILES} files.`, 'warn');
    const bytes = files.reduce((sum, file) => sum + file.size, 0);
    if (files.some(file => file.size > MAX_FILE_BYTES) || bytes > MAX_TOTAL_FILE_BYTES) {
      return AHToolkit.status(status, 'Each file must be 25 MB or smaller and the combined selection must be 50 MB or smaller.', 'warn');
    }
    AHToolkit.status(status, files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected.` : '');
  };

  function readDuration(file) {
    return new Promise((resolve, reject) => {
      const audio = document.createElement('audio');
      const url = URL.createObjectURL(file);
      const timeout = setTimeout(() => finish(new Error('Could not read audio duration.')), 8000);
      function finish(error, duration) {
        clearTimeout(timeout);
        audio.onloadedmetadata = null;
        audio.onerror = null;
        URL.revokeObjectURL(url);
        error ? reject(error) : resolve(duration);
      }
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => Number.isFinite(audio.duration) ? finish(null, audio.duration) : finish(new Error('Audio duration is unavailable.'));
      audio.onerror = () => finish(new Error('This browser cannot read one of the selected audio files.'));
      audio.src = url;
    });
  }

  function encodeWav(buffer) {
    const channels = buffer.numberOfChannels;
    const dataBytes = buffer.length * channels * 2;
    if (dataBytes > 0xffffffff - 36) throw new Error('The WAV output would exceed the format size limit.');
    const bytes = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(bytes);
    const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    text(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); text(8, 'WAVE');
    text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, dataBytes, true);
    let offset = 44;
    for (let frame = 0; frame < buffer.length; frame++) {
      for (let channel = 0; channel < channels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame]));
        view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
        offset += 2;
      }
    }
    return new Blob([bytes], { type: 'audio/wav' });
  }

  runButton.onclick = async () => {
    const files = [...fileInput.files];
    if (files.length < 2) return AHToolkit.status(status, 'Choose at least two audio files.', 'warn');
    if (files.length > MAX_FILES) return AHToolkit.status(status, `Choose no more than ${MAX_FILES} files.`, 'warn');
    if (files.some(file => file.size > MAX_FILE_BYTES) || files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_FILE_BYTES) {
      return AHToolkit.status(status, 'Each file must be 25 MB or smaller and the combined selection must be 50 MB or smaller.', 'warn');
    }
    if (!AHToolkit.credits.canRun(status)) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return AHToolkit.status(status, 'This browser does not support local audio decoding.', 'error');
    cancelRequested = false;
    runButton.disabled = true;
    cancelButton.hidden = false;
    let context;
    try {
      const durations = [];
      for (let index = 0; index < files.length; index++) {
        if (cancelRequested) throw new Error('Processing cancelled.');
        AHToolkit.status(status, `Checking duration ${index + 1}/${files.length}…`);
        durations.push(await readDuration(files[index]));
        if (durations.reduce((sum, value) => sum + value, 0) > MAX_DURATION_SECONDS) {
          throw new Error('Combined audio must be 5 minutes or shorter.');
        }
      }

      context = new AudioContextClass();
      const buffers = [];
      for (let index = 0; index < files.length; index++) {
        if (cancelRequested) throw new Error('Processing cancelled.');
        AHToolkit.status(status, `Decoding file ${index + 1}/${files.length}…`);
        buffers.push(await context.decodeAudioData(await files[index].arrayBuffer()));
        const floatBytes = buffers.reduce((sum, buffer) => sum + buffer.length * buffer.numberOfChannels * 4, 0);
        if (floatBytes > MAX_PCM_BYTES) throw new Error('Decoded audio exceeds the 128 MiB working-memory limit.');
      }
      if (cancelRequested) throw new Error('Processing cancelled.');

      const sampleRate = buffers[0].sampleRate;
      const channels = Math.max(...buffers.map(buffer => buffer.numberOfChannels));
      const length = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
      if (length / sampleRate > MAX_DURATION_SECONDS) throw new Error('Combined audio must be 5 minutes or shorter.');
      if (length * channels * 4 > MAX_PCM_BYTES) throw new Error('Joined audio exceeds the 128 MiB working-memory limit.');

      const output = new AudioBuffer({ length, numberOfChannels: channels, sampleRate });
      let cursor = 0;
      for (const buffer of buffers) {
        for (let channel = 0; channel < channels; channel++) {
          output.getChannelData(channel).set(buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1)), cursor);
        }
        cursor += buffer.length;
      }
      const blob = encodeWav(output);
      if (cancelRequested) throw new Error('Processing cancelled.');
      AHToolkit.download(blob, 'joined-audio.wav');
      AHToolkit.credits.charge();
      AHToolkit.status(status, 'Joined audio downloaded as PCM WAV.', 'success');
    } catch (error) {
      AHToolkit.status(status, error?.message || 'Could not join these audio files.', 'error');
    } finally {
      if (context && context.state !== 'closed') await context.close().catch(() => {});
      runButton.disabled = false;
      cancelButton.hidden = true;
    }
  };

  cancelButton.onclick = () => {
    cancelRequested = true;
    AHToolkit.status(status, 'Cancellation requested; the current browser decode will finish first.', 'warn');
  };
})();
