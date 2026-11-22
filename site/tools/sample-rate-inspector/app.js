(() => {
  const root = AHToolkit.mount(`
    <h2>Inspect audio</h2>
    <p>WAV source rates are read from the file header. Other formats may be resampled by your browser, so their decoded rate is shown separately.</p>
    <label class="drop-zone">Choose audio<input id="f" type="file" accept="audio/*"></label>
    <dl id="o" class="results"></dl>
    <div id="s" class="status" role="status" hidden></div>
  `);
  const fileInput = root.querySelector('#f');
  const output = root.querySelector('#o');
  const status = root.querySelector('#s');

  function sourceWavSampleRate(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 12) return null;
    const view = new DataView(buffer);
    const text = (offset, length) => {
      let value = '';
      for (let i = 0; i < length; i++) value += String.fromCharCode(view.getUint8(offset + i));
      return value;
    };
    const container = text(0, 4);
    if ((container !== 'RIFF' && container !== 'RIFX') || text(8, 4) !== 'WAVE') return null;
    const littleEndian = container === 'RIFF';

    for (let offset = 12; offset + 8 <= view.byteLength;) {
      const chunkId = text(offset, 4);
      const chunkSize = view.getUint32(offset + 4, littleEndian);
      const dataStart = offset + 8;
      const dataEnd = dataStart + chunkSize;
      if (dataEnd > view.byteLength) return null;
      if (chunkId === 'fmt ' && chunkSize >= 16) {
        const rate = view.getUint32(dataStart + 4, littleEndian);
        return rate > 0 ? rate : null;
      }
      offset = dataEnd + (chunkSize & 1);
    }
    return null;
  }

  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!AHToolkit.credits.canRun(status)) return;
    if (!file || file.size > 100e6) return AHToolkit.status(status, 'Choose audio under 100 MB.', 'error');

    try {
      const bytes = await file.arrayBuffer();
      const sourceRate = sourceWavSampleRate(bytes);
      const audio = await new AudioContext().decodeAudioData(bytes.slice(0));
      let peak = 0;
      let sumSquares = 0;
      const sampleCount = audio.length * audio.numberOfChannels;
      for (let channel = 0; channel < audio.numberOfChannels; channel++) {
        for (const sample of audio.getChannelData(channel)) {
          peak = Math.max(peak, Math.abs(sample));
          sumSquares += sample * sample;
        }
      }
      const db = value => (20 * Math.log10(Math.max(value, 1e-9))).toFixed(2);
      const rows = [
        ['Source sample rate', sourceRate ? `${sourceRate} Hz` : 'Not available for this format'],
        ['Decoded sample rate', `${audio.sampleRate} Hz`],
        ['Channels', audio.numberOfChannels],
        ['Frames', audio.length.toLocaleString()],
        ['Duration', `${audio.duration.toFixed(3)} seconds`],
        ['Peak', `${db(peak)} dBFS`],
        ['RMS', `${db(Math.sqrt(sumSquares / sampleCount))} dBFS`],
      ];
      output.innerHTML = rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
      AHToolkit.credits.charge();
      AHToolkit.status(status, 'Audio decoded locally.', 'success');
    } catch (error) {
      AHToolkit.status(status, 'Could not decode this audio.', 'error');
    }
  };
})();
