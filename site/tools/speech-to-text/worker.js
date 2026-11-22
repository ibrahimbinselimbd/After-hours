const MODEL_HOST = 'Xenova/whisper-tiny';
const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';
const WHISPER_SAMPLE_RATE = 16000;
let pipe;

self.onmessage = async event => {
  if (event.data.type !== 'transcribe') return;
  const id = event.data.operationId;
  self.currentOperation = id;
  const alive = () => self.currentOperation === id;

  try {
    if (!alive()) throw Error('Cancelled.');
    if (!(event.data.audio instanceof Float32Array) || event.data.rate !== WHISPER_SAMPLE_RATE) {
      throw Error('Whisper audio must be prepared as 16 kHz Float32 samples.');
    }

    pipe ||= await (async () => {
      const transformers = await import(TRANSFORMERS_CDN);
      if (!alive()) throw Error('Cancelled.');
      self.postMessage({ type: 'progress', value: 5, status: 'Loading Transformers.js and Whisper weights…' });
      return transformers.pipeline('automatic-speech-recognition', MODEL_HOST, {
        progress_callback: progress => {
          if (alive()) self.postMessage({
            type: 'progress',
            value: progress.progress || 10,
            status: 'Downloading static model assets…'
          });
        }
      });
    })();
    if (!alive()) throw Error('Cancelled.');

    const options = { return_timestamps: true };
    if (event.data.language !== 'auto') options.language = event.data.language;
    const result = await pipe(event.data.audio, options);
    if (!alive()) throw Error('Cancelled.');

    const chunks = (result.chunks || []).map(chunk => ({
      start: Number(chunk.timestamp?.[0] || 0),
      end: Number(chunk.timestamp?.[1] || chunk.timestamp?.[0] || 0),
      text: String(chunk.text || '').trim()
    })).filter(chunk => chunk.text);
    if (!alive()) throw Error('Cancelled.');
    self.postMessage({ type: 'result', text: result.text || '', chunks });
  } catch (error) {
    if (alive()) self.postMessage({ type: 'error', message: error.message || 'Transcription failed' });
  }
};
