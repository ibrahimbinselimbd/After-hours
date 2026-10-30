'use strict';

/* GIF encoding uses bundled gifenc 1.0.3 (MIT); see LICENSE-gifenc.md. */
(() => {
  const A = window.AHToolkit;
  const $ = (selector) => document.querySelector(selector);
  const MiB = 1024 * 1024;
  const MAX_FILE_BYTES = 50 * MiB;
  const MAX_FRAMES = 200;
  const MAX_EDGE = 1200;
  const MAX_TOTAL_PIXELS = 50_000_000;
  const MAX_OUTPUT_BYTES = 100 * MiB;
  const scriptURL = document.currentScript?.src || document.baseURI;

  A.mount(`<div class="tool-hero"><div class="eyebrow">LOCAL ANIMATION LAB / 04</div><h2>Animated GIF <span>optimizer.</span></h2><p>Decode animated GIF frames in your browser, preview the animation, then encode and verify a smaller-size candidate locally.</p></div><section class="workspace"><div class="drop"><label class="button button-main" for="file">Choose animated GIF</label><input id="file" type="file" accept="image/gif,.gif"><p class="note">Limit: 50 MB, 200 frames, 1200 px edge and 50 megapixels total. Frame timing and decoded transparency are retained; output repeats continuously. Only animated GIF input and output are supported.</p></div><div class="grid"><div class="card"><label>Output width<input id="width" type="number" min="1" max="1200" value="0"></label><label>Frame step<select id="step"><option value="1">Every frame</option><option value="2">Every 2nd frame</option><option value="3">Every 3rd frame</option></select></label></div><div class="card"><p id="support" class="note"></p><div id="preview" class="results"></div></div></div><div class="actions"><button class="button-main" id="run" disabled>Optimize locally</button><button id="cancel" disabled>Cancel</button></div><progress id="progress" class="progress" max="100" value="0"></progress><div id="status" class="status" role="status"></div><div id="result" class="results"></div></section>`);

  let file = null;
  let decoder = null;
  let info = null;
  let stopping = false;
  let loadSequence = 0;
  let encoderModulePromise = null;

  $('#support').textContent = window.ImageDecoder
    ? 'ImageDecoder is available. Frames are decoded and re-checked in this browser.'
    : 'This browser does not expose ImageDecoder. Use a current version of Chrome or Edge.';

  function closeDecoder(instance) {
    if (!instance) return;
    try { instance.close(); } catch { /* already closed */ }
  }

  function getEncoderModule() {
    if (!encoderModulePromise) {
      const url = new URL('./gifenc.js', scriptURL).href;
      encoderModulePromise = import(url).catch((error) => {
        encoderModulePromise = null;
        throw error;
      });
    }
    return encoderModulePromise;
  }

  function decodedSize(frame) {
    return {
      width: frame.displayWidth || frame.codedWidth || 0,
      height: frame.displayHeight || frame.codedHeight || 0,
    };
  }

  async function inspectFile() {
    const sequence = ++loadSequence;
    file = $('#file').files[0] || null;
    info = null;
    $('#run').disabled = true;
    $('#progress').value = 0;
    $('#preview').replaceChildren();
    $('#result').replaceChildren();
    closeDecoder(decoder);
    decoder = null;

    if (!file) {
      $('#status').textContent = '';
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      A.status('#status', 'File exceeds the 50 MB limit. No credit used.', 'warn');
      return;
    }
    if (!window.ImageDecoder) {
      A.status('#status', 'Animated decoding is unavailable in this browser. Try current Chrome or Edge. No credit used.', 'warn');
      return;
    }

    const currentDecoder = new ImageDecoder({ data: await file.arrayBuffer(), type: 'image/gif' });
    decoder = currentDecoder;
    try {
      await currentDecoder.tracks.ready;
      if (sequence !== loadSequence) {
        closeDecoder(currentDecoder);
        return;
      }
      const track = currentDecoder.tracks.selectedTrack;
      const frameCount = track?.frameCount;
      if (!Number.isInteger(frameCount) || frameCount < 2 || frameCount > MAX_FRAMES) {
        throw new Error('Choose an animated GIF with 2–200 frames.');
      }

      const first = await currentDecoder.decode({ frameIndex: 0 });
      const dimensions = decodedSize(first.image);
      first.image.close();
      if (!dimensions.width || !dimensions.height) throw new Error('Could not read GIF frame dimensions.');
      if (Math.max(dimensions.width, dimensions.height) > MAX_EDGE) {
        throw new Error('Animation exceeds the 1200 px edge limit.');
      }
      if (dimensions.width * dimensions.height * frameCount > MAX_TOTAL_PIXELS) {
        throw new Error('Animation exceeds the 50-megapixel total frame budget. Reduce its dimensions or frame count.');
      }
      info = { width: dimensions.width, height: dimensions.height, frameCount };
      $('#width').value = String(dimensions.width);
      $('#status').textContent = `image/gif · ${dimensions.width} × ${dimensions.height} · ${frameCount} frames · ${(file.size / MiB).toFixed(2)} MB`;

      const preview = $('#preview');
      for (let i = 0; i < Math.min(6, frameCount); i += 1) {
        if (sequence !== loadSequence) {
          closeDecoder(currentDecoder);
          return;
        }
        const decoded = await currentDecoder.decode({ frameIndex: i });
        const size = decodedSize(decoded.image);
        const canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        canvas.className = 'preview';
        canvas.style.width = '30%';
        canvas.style.display = 'inline-block';
        canvas.style.margin = '1%';
        canvas.getContext('2d').drawImage(decoded.image, 0, 0);
        preview.append(canvas);
        decoded.image.close();
      }
      if (sequence === loadSequence) $('#run').disabled = false;
    } catch (error) {
      if (sequence === loadSequence) {
        info = null;
        closeDecoder(currentDecoder);
        if (decoder === currentDecoder) decoder = null;
        A.status('#status', `${error.message} No credit used.`, 'warn');
      }
    }
  }

  $('#file').addEventListener('change', inspectFile);
  $('#cancel').addEventListener('click', () => {
    stopping = true;
    A.status('#status', 'Cancelling at the next frame boundary…', 'warn');
  });

  $('#run').addEventListener('click', async () => {
    if (!info || !decoder || !A.credits.canRun('#status')) return;
    const width = Number($('#width').value) || info.width;
    const step = Number($('#step').value);
    if (!Number.isInteger(width) || width < 1 || width > MAX_EDGE) {
      A.status('#status', 'Output width must be between 1 and 1200 px. No credit used.', 'warn');
      return;
    }
    const height = Math.max(1, Math.round(info.height * width / info.width));
    const frameTotal = Math.ceil(info.frameCount / step);
    if (Math.max(width, height) > MAX_EDGE || frameTotal * width * height > MAX_TOTAL_PIXELS) {
      A.status('#status', 'Requested output exceeds the 50-megapixel frame budget or 1200 px edge. No credit used.', 'warn');
      return;
    }

    stopping = false;
    $('#run').disabled = true;
    $('#cancel').disabled = false;
    $('#file').disabled = true;
    $('#progress').value = 0;
    $('#result').replaceChildren();

    try {
      A.status('#status', 'Loading the bundled GIF encoder locally…', '');
      const { GIFEncoder, quantize, applyPalette } = await getEncoderModule();
      if (stopping) throw new Error('Cancelled. No credit used.');
      const encoder = GIFEncoder();

      for (let frameIndex = 0; frameIndex < info.frameCount; frameIndex += step) {
        if (stopping) throw new Error('Cancelled. No credit used.');
        const decoded = await decoder.decode({ frameIndex });
        if (stopping) {
          decoded.image.close();
          throw new Error('Cancelled. No credit used.');
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        try {
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.drawImage(decoded.image, 0, 0, width, height);
          const pixels = context.getImageData(0, 0, width, height).data;
          const palette = quantize(pixels, 256, { format: 'rgba4444', oneBitAlpha: true });
          const indexed = applyPalette(pixels, palette, 'rgba4444');
          const transparentIndex = palette.findIndex((color) => color.length > 3 && color[3] === 0);
          const rawDuration = decoded.image.duration;
          const durationMs = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration / 1000 : 100;
          const delay = Math.max(20, Math.round(durationMs / 10) * 10);
          encoder.writeFrame(indexed, width, height, {
            palette,
            delay,
            repeat: 0,
            transparent: transparentIndex >= 0,
            transparentIndex,
          });
        } finally {
          decoded.image.close();
          canvas.width = 0;
          canvas.height = 0;
        }
        const completed = Math.min(frameTotal, Math.floor(frameIndex / step) + 1);
        $('#progress').value = Math.round(completed / frameTotal * 100);
        $('#status').textContent = `Encoding frame ${completed} of ${frameTotal} locally…`;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (stopping) throw new Error('Cancelled. No credit used.');

      encoder.finish();
      const bytes = encoder.bytes();
      if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES || bytes[0] !== 71 || bytes[1] !== 73 || bytes[2] !== 70) {
        throw new Error('Encoded output failed GIF signature or size validation.');
      }
      const verifier = new ImageDecoder({ data: bytes, type: 'image/gif' });
      try {
        await verifier.tracks.ready;
        const verifiedTrack = verifier.tracks.selectedTrack;
        if (!verifiedTrack || verifiedTrack.frameCount !== frameTotal) {
          throw new Error('Browser validation could not verify every output frame.');
        }
        const first = await verifier.decode({ frameIndex: 0 });
        const firstSize = decodedSize(first.image);
        first.image.close();
        if (firstSize.width !== width || firstSize.height !== height) {
          throw new Error('Browser validation found unexpected output dimensions.');
        }
        if (frameTotal > 1) {
          const last = await verifier.decode({ frameIndex: frameTotal - 1 });
          const lastSize = decodedSize(last.image);
          last.image.close();
          if (lastSize.width !== width || lastSize.height !== height) {
            throw new Error('Browser validation could not decode the final output frame.');
          }
        }
      } finally {
        closeDecoder(verifier);
      }
      if (stopping) throw new Error('Cancelled. No credit used.');
      if (!A.credits.charge()) throw new Error('No local credit remained.');

      const blob = new Blob([bytes], { type: 'image/gif' });
      A.download(blob, 'afterhours-optimized.gif');
      $('#result').innerHTML = `<div class="result"><span><b>Verified animated GIF ready</b><br><small>${frameTotal} frames · ${width} × ${height} px · ${(file.size / MiB).toFixed(2)} MB → ${(blob.size / MiB).toFixed(2)} MB</small></span></div>`;
      A.status('#status', 'Browser decoder verified the optimized animated GIF. One local credit used.', 'ok');
    } catch (error) {
      A.status('#status', `${error.message} No credit used.`, 'warn');
    } finally {
      $('#run').disabled = !info;
      $('#cancel').disabled = true;
      $('#file').disabled = false;
    }
  });
})();
