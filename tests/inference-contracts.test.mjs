import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pdfHtml = fs.readFileSync(path.join(root, 'site/tools/pdf-ocr-searchable/index.html'), 'utf8');
const speechApp = fs.readFileSync(path.join(root, 'site/tools/speech-to-text/app.js'), 'utf8');
const speechWorker = fs.readFileSync(path.join(root, 'site/tools/speech-to-text/worker.js'), 'utf8');

function makeWorker({onPipeline = async () => ({text: 'This is local audio.', chunks: [{timestamp: [0, 2], text: 'This is local audio.'}]})} = {}) {
  const messages = [];
  let imports = 0;
  let pipelineOptions;
  let receivedAudio;
  let receivedOptions;
  const self = {postMessage: message => messages.push(message)};
  const fakeImport = async url => {
    imports++;
    assert.equal(url, 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2');
    return {
      pipeline: async (...args) => {
        pipelineOptions = args;
        return async (audio, options) => {
          receivedAudio = audio;
          receivedOptions = options;
          return onPipeline(audio, options);
        };
      }
    };
  };
  const executable = speechWorker.replace('await import(TRANSFORMERS_CDN)', 'await fakeImport(TRANSFORMERS_CDN)');
  assert.notEqual(executable, speechWorker, 'test harness replaces only the worker module import');
  vm.runInNewContext(executable, {self, Float32Array, fakeImport, console});
  return {self, messages, get imports() { return imports; }, get pipelineOptions() { return pipelineOptions; }, get receivedAudio() { return receivedAudio; }, get receivedOptions() { return receivedOptions; }};
}

test('searchable PDF CSP narrowly enables WebAssembly and Tesseract language-data downloads', () => {
  const match = pdfHtml.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/i);
  assert.ok(match, 'route has a CSP meta policy');
  const csp = match[1];
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval' https:\/\/cdn\.jsdelivr\.net/);
  assert.match(csp, /connect-src https:\/\/cdn\.jsdelivr\.net https:\/\/tessdata\.projectnaptha\.com/);
  assert.doesNotMatch(csp, /(?:^|\s)'unsafe-eval'(?:\s|;)/, 'do not enable broad unsafe-eval');
  assert.match(csp, /default-src 'none'/);
});

test('speech app resamples non-16 kHz audio and transfers a Float32Array at Whisper rate', () => {
  assert.match(speechApp, /const WHISPER_SAMPLE_RATE = 16000/);
  assert.match(speechApp, /window\.OfflineAudioContext \|\| window\.webkitOfflineAudioContext/);
  assert.match(speechApp, /new OfflineAudioContextClass\(1, frameCount, WHISPER_SAMPLE_RATE\)/);
  assert.match(speechApp, /const channel = modelBuffer\.getChannelData\(0\)\.slice\(\)/);
  assert.match(speechApp, /worker\.postMessage\(\{ type: 'transcribe', audio: channel, rate, language:/);
});

test('Whisper worker passes raw Float32Array samples directly to the pipeline', async () => {
  const worker = makeWorker();
  const audio = new Float32Array(32000);
  await worker.self.onmessage({data: {type: 'transcribe', operationId: 7, audio, rate: 16000, language: 'en'}});
  assert.equal(worker.imports, 1);
  assert.deepEqual(worker.pipelineOptions.slice(0, 2), ['automatic-speech-recognition', 'Xenova/whisper-tiny']);
  assert.equal(worker.receivedAudio, audio, 'no wrapper object or sample copy is passed to Transformers.js');
  assert.deepEqual(JSON.parse(JSON.stringify(worker.receivedOptions)), {return_timestamps: true, language: 'en'});
  assert.equal(worker.messages.at(-1).type, 'result');
  assert.equal(worker.messages.at(-1).text, 'This is local audio.');
  assert.deepEqual(JSON.parse(JSON.stringify(worker.messages.at(-1).chunks)), [{start: 0, end: 2, text: 'This is local audio.'}]);
});

test('Whisper worker rejects malformed or non-16 kHz audio before loading the model', async () => {
  for (const payload of [
    {audio: {audio: new Float32Array(10)}, rate: 44100},
    {audio: new Float32Array(10), rate: 44100}
  ]) {
    const worker = makeWorker();
    await worker.self.onmessage({data: {type: 'transcribe', operationId: 8, language: 'auto', ...payload}});
    assert.equal(worker.imports, 0, 'invalid input should not download or initialize Whisper');
    assert.equal(worker.messages.at(-1).type, 'error');
    assert.match(worker.messages.at(-1).message, /16 kHz Float32/);
  }
});
