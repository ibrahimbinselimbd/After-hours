import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'site/tools/sample-rate-inspector/app.js'), 'utf8');

function makeWav(rate, {container = 'RIFF', oddChunkBeforeFormat = false} = {}) {
  const littleEndian = container === 'RIFF';
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(1, 2);
  fmt[littleEndian ? 'writeUInt32LE' : 'writeUInt32BE'](rate, 4);
  fmt[littleEndian ? 'writeUInt32LE' : 'writeUInt32BE'](rate * 2, 8);
  fmt.writeUInt16LE(2, 12);
  fmt.writeUInt16LE(16, 14);

  const chunks = [];
  if (oddChunkBeforeFormat) {
    const junk = Buffer.alloc(10);
    junk.write('JUNK', 0, 'ascii');
    junk.writeUInt32LE(1, 4);
    junk[8] = 0x7f;
    chunks.push(junk);
  }
  const fmtChunk = Buffer.alloc(8 + fmt.length);
  fmtChunk.write('fmt ', 0, 'ascii');
  fmtChunk[littleEndian ? 'writeUInt32LE' : 'writeUInt32BE'](fmt.length, 4);
  fmt.copy(fmtChunk, 8);
  chunks.push(fmtChunk);

  const payload = Buffer.concat(chunks);
  const wav = Buffer.alloc(12 + payload.length);
  wav.write(container, 0, 'ascii');
  wav.writeUInt32LE(4 + payload.length, 4);
  wav.write('WAVE', 8, 'ascii');
  payload.copy(wav, 12);
  return wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength);
}

async function runApp(fileBytes) {
  const elements = {
    '#f': {files: []},
    '#o': {innerHTML: ''},
    '#s': {textContent: '', hidden: true},
  };
  const rootElement = {querySelector: selector => elements[selector]};
  const toolkit = {
    mount: () => rootElement,
    credits: {canRun: () => true, charge: () => true},
    status: (element, message) => { element.textContent = message; element.hidden = false; },
  };
  class AudioContextMock {
    async decodeAudioData() {
      return {
        sampleRate: 48000,
        numberOfChannels: 1,
        length: 48000,
        duration: 1,
        getChannelData: () => Float32Array.from([0.25, -0.25]),
      };
    }
  }
  vm.runInNewContext(source, {AHToolkit: toolkit, AudioContext: AudioContextMock, ArrayBuffer, DataView}, {filename: 'sample-rate-inspector/app.js'});
  elements['#f'].files = [{size: fileBytes.byteLength, arrayBuffer: async () => fileBytes}];
  await elements['#f'].onchange();
  return {output: elements['#o'].innerHTML, status: elements['#s'].textContent};
}

test('WAV sample rate comes from its fmt header, even after an odd-sized chunk, and stays distinct from the decoded rate', async () => {
  for (const rate of [22050, 44100]) {
    const result = await runApp(makeWav(rate, {oddChunkBeforeFormat: true}));
    assert.match(result.output, new RegExp(`<dd>${rate} Hz</dd>`));
    assert.match(result.output, /<dt>Source sample rate<\/dt>/);
    assert.match(result.output, /<dt>Decoded sample rate<\/dt><dd>48000 Hz<\/dd>/);
    assert.equal(result.status, 'Audio decoded locally.');
  }
});

test('RIFX headers use big-endian chunk sizes and sample rates', async () => {
  const result = await runApp(makeWav(32000, {container: 'RIFX'}));
  assert.match(result.output, /<dt>Source sample rate<\/dt><dd>32000 Hz<\/dd>/);
  assert.match(result.output, /<dt>Decoded sample rate<\/dt><dd>48000 Hz<\/dd>/);
});

test('non-WAV input does not present the browser-decoded rate as the source rate', async () => {
  const result = await runApp(Buffer.from('not a WAV file').buffer);
  assert.match(result.output, /<dt>Source sample rate<\/dt><dd>Not available for this format<\/dd>/);
  assert.match(result.output, /<dt>Decoded sample rate<\/dt><dd>48000 Hz<\/dd>/);
  assert.equal(result.status, 'Audio decoded locally.');
});
