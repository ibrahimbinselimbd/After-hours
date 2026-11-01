(() => {
  const root = AHToolkit.mount(`
    <div class="section-head"><div><div class="section-kicker">DOCX TEXT EXTRACTION</div><h2>Extract text</h2><p>DOCX files up to 25 MB. Files stay on this device.</p></div><span class="tool-badge">BROWSER ONLY</span></div>
    <label class="drop-zone" for="file"><strong>Choose a file</strong><span>Nothing is uploaded or sent to a server.</span><input id="file" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></label>
    <div class="actions"><button class="button button-main" id="run" type="button">Extract text</button><button class="button" id="clear" type="button">Clear</button></div>
    <div id="status" class="status" role="status" aria-live="polite" hidden></div>
    <div id="result" class="result" hidden><pre id="output" class="output-text"></pre><div class="result-actions"><button class="button" id="download" type="button">Download result</button><button class="button" id="copy" type="button">Copy</button></div></div>
  `);
  const fileInput = root.querySelector('#file');
  const status = root.querySelector('#status');
  const result = root.querySelector('#result');
  const output = root.querySelector('#output');
  let value = '';
  let outputName = 'result.txt';

  const show = (text, name = 'result.txt') => {
    value = text;
    outputName = name;
    output.textContent = text;
    result.hidden = false;
    root.querySelector('#download').disabled = false;
  };

  root.querySelector('#clear').onclick = () => {
    fileInput.value = '';
    result.hidden = true;
    AHToolkit.status(status, '');
    value = '';
  };
  root.querySelector('#copy').onclick = async () => {
    if (await AHToolkit.copy(value)) AHToolkit.status(status, 'Copied to clipboard.', 'success');
  };
  root.querySelector('#download').onclick = () => AHToolkit.downloadText(value, outputName, 'text/plain;charset=utf-8');
  root.querySelector('#run').onclick = async () => {
    if (!fileInput.files[0]) return AHToolkit.status(status, 'Choose a file first.', 'warn');
    if (!AHToolkit.credits.canRun(status)) return;
    try {
      const file = fileInput.files[0];
      if (file.size > 25 * 1024 * 1024) throw new Error('DOCX files must be 25 MB or smaller.');
      const text = await extractText(file);
      if (!text.trim()) throw new Error('No readable text was found.');
      show(text, file.name.replace(/\.[^.]+$/, '') + '-extracted.txt');
      AHToolkit.credits.charge();
      AHToolkit.status(status, 'Text extracted successfully.', 'success');
    } catch (error) {
      AHToolkit.status(status, error?.message || 'Could not process this DOCX file.', 'error');
    }
  };

  function preflightZip(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const minimum = Math.max(0, view.byteLength - 65557);
    let endRecord = -1;
    for (let offset = view.byteLength - 22; offset >= minimum; offset--) {
      if (view.getUint32(offset, true) === 0x06054b50) { endRecord = offset; break; }
    }
    if (endRecord < 0) throw new Error('The file is not a readable DOCX ZIP archive.');
    const disk = view.getUint16(endRecord + 4, true);
    const directoryDisk = view.getUint16(endRecord + 6, true);
    const diskEntries = view.getUint16(endRecord + 8, true);
    const entryCount = view.getUint16(endRecord + 10, true);
    const directorySize = view.getUint32(endRecord + 12, true);
    const directoryOffset = view.getUint32(endRecord + 16, true);
    if (disk !== 0 || directoryDisk !== 0 || diskEntries !== entryCount) throw new Error('Multi-disk ZIP files are not supported.');
    if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) throw new Error('ZIP64 DOCX files are not supported by this tool.');
    if (entryCount > 10000 || directoryOffset + directorySize > endRecord) throw new Error('The DOCX ZIP directory is invalid or too large.');

    let offset = directoryOffset;
    let totalExpandedBytes = 0;
    for (let index = 0; index < entryCount; index++) {
      if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error('The DOCX ZIP directory is malformed.');
      const expanded = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      totalExpandedBytes += expanded;
      if (expanded === 0xffffffff || totalExpandedBytes > 50 * 1024 * 1024) throw new Error('The DOCX expands beyond the 50 MB safety limit.');
      offset += 46 + nameLength + extraLength + commentLength;
      if (offset > directoryOffset + directorySize) throw new Error('The DOCX ZIP directory is malformed.');
    }
  }

  async function extractText(file) {
    const bytes = await AHToolkit.readBytes(file, 25 * 1024 * 1024);
    const compressed = new Uint8Array(bytes);
    preflightZip(compressed);
    const entries = fflate.unzipSync(compressed);
    const xmlBytes = entries['word/document.xml'];
    if (!xmlBytes) throw new Error('This file does not contain a readable Word document.');
    if (xmlBytes.byteLength > 20 * 1024 * 1024) throw new Error('The Word document text exceeds the 20 MB safety limit.');
    const xml = new TextDecoder().decode(xmlBytes);
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    if (parsed.querySelector('parsererror')) throw new Error('The DOCX XML is malformed.');
    const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const paragraphs = [...parsed.getElementsByTagNameNS(namespace, 'p')];
    return paragraphs
      .map(paragraph => [...paragraph.getElementsByTagNameNS(namespace, 't')].map(node => node.textContent || '').join(''))
      .filter(Boolean)
      .join('\n\n');
  }
})();
