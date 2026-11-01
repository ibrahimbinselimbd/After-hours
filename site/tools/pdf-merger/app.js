(() => {
  const markup = `
    <div class="section-head"><div><div class="section-kicker">ORDERED DOCUMENT ASSEMBLY</div><h2>Merge PDFs</h2><p>Select several PDFs, arrange their order, then export one combined file.</p></div><span class="tool-badge">MAX 100 MB TOTAL</span></div>
    <label class="drop-zone" for="pdf-merger-files"><strong>Choose PDF files</strong><span>They stay in this browser. Add files in any order.</span><input id="pdf-merger-files" type="file" accept="application/pdf,.pdf" multiple></label>
    <ol id="pdf-merger-list" class="file-list" aria-live="polite"></ol>
    <div class="actions"><button class="button button-main" id="pdf-merger-run" type="button">Merge and download</button><button class="button" id="pdf-merger-clear" type="button">Clear</button></div>
    <div id="pdf-merger-status" class="status" role="status" aria-live="polite" hidden></div>
  `;
  const root = AHToolkit.mount(markup), input = root.querySelector('#pdf-merger-files'), list = root.querySelector('#pdf-merger-list'), status = root.querySelector('#pdf-merger-status');
  let files = [];
  const render = () => { list.innerHTML = files.map((f, i) => `<li><span class="mono">${AHToolkit.escape(f.name)}</span> <span class="hint">(${(f.size / 1048576).toFixed(2)} MB)</span> <button class="button" data-up="${i}" type="button" aria-label="Move ${AHToolkit.escape(f.name)} up">↑</button> <button class="button" data-down="${i}" type="button" aria-label="Move ${AHToolkit.escape(f.name)} down">↓</button></li>`).join(''); };
  input.addEventListener('change', () => { files = [...input.files]; render(); AHToolkit.status(status, files.length ? `${files.length} file${files.length === 1 ? '' : 's'} ready.` : ''); });
  list.addEventListener('click', e => { const up = e.target.dataset.up, down = e.target.dataset.down; if (up !== undefined && +up > 0) [files[+up - 1], files[+up]] = [files[+up], files[+up - 1]]; if (down !== undefined && +down < files.length - 1) [files[+down], files[+down + 1]] = [files[+down + 1], files[+down]]; render(); });
  root.querySelector('#pdf-merger-clear').addEventListener('click', () => { files = []; input.value = ''; render(); AHToolkit.status(status, ''); });
  root.querySelector('#pdf-merger-run').addEventListener('click', async () => {
    if (!files.length) return AHToolkit.status(status, 'Choose at least two PDF files.', 'warn');
    if (files.length < 2) return AHToolkit.status(status, 'Choose at least two PDF files to merge.', 'warn');
    if (!files.every(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))) return AHToolkit.status(status, 'All selected files must be PDFs.', 'error');
    if (files.reduce((sum, f) => sum + f.size, 0) > 100 * 1024 * 1024) return AHToolkit.status(status, 'The combined file size must be 100 MB or less.', 'error');
    if (!AHToolkit.credits.canRun(status)) return;
    try {
      const merged = await PDFLib.PDFDocument.create();
      for (const file of files) { const source = await PDFLib.PDFDocument.load(await AHToolkit.readBytes(file, 100 * 1024 * 1024)); const pages = await merged.copyPages(source, source.getPageIndices()); pages.forEach(p => merged.addPage(p)); }
      const bytes = await merged.save();
      AHToolkit.download(new Blob([bytes], {type: 'application/pdf'}), 'merged-document.pdf');
      AHToolkit.credits.charge();
      AHToolkit.status(status, `Merged ${files.length} PDFs successfully.`, 'success');
    } catch (err) { AHToolkit.status(status, `Could not merge these PDFs: ${err.message || 'the file may be malformed.'}`, 'error'); }
  });
})();
