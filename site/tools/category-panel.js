// Category details and same-site tool navigation. Text detector is not launched.
function openCategory(id, trigger) {
  const d = categories.find(c => c.id === id);
  if (!d) return;
  const image = id === 'image-design';
  const ai = id === 'ai-everyday-utilities';
  opener = trigger || document.querySelector('[data-category="' + id + '"]');
  document.querySelector('#district-number').textContent = String(categories.indexOf(d) + 1).padStart(2, '0');
  const heading = document.querySelector('#dialog-title');
  heading.replaceChildren();
  if (image || ai) {
    heading.append(image ? 'Image ' : 'AI & ');
    if (image) { const amp = document.createElement('span'); amp.textContent = '&'; heading.append(amp); }
    heading.append(document.createElement('br'), image ? 'Design' : 'Everyday Utilities');
    const dot = document.createElement('span'); dot.className = 'title-dot'; dot.textContent = '.'; heading.append(dot);
  } else heading.textContent = d.title;
  document.querySelector('#dialog-description').textContent = d.description;
  document.querySelector('.modal-status').textContent = image ? '01 AVAILABLE' : ai ? 'COMING SOON' : 'PLANNED';
  const tools = document.querySelector('#dialog-tools');
  tools.replaceChildren();
  if (image) {
    const link = document.createElement('a');
    link.className = 'featured-tool'; link.href = '/tools/background-remover/';
    link.setAttribute('aria-label', 'Open Bulk Image Background Remover');
    link.innerHTML = '<div class="tool-title-line"><span class="tool-icon" aria-hidden="true">✂</span><span class="tool-meta"><b>Bulk Image Background Remover</b><small>Isolate the subject. Keep the possibilities.</small></span><span class="tool-arrow" aria-hidden="true">↗</span></div><span class="open-label">OPEN TOOL</span>';
    tools.append(link);
  }
  if (ai) {
    const preview = document.createElement('a');
    preview.className = 'featured-tool'; preview.href = '/tools/text-detector/';
    preview.setAttribute('aria-label', 'Preview AI Article and Text Detector — coming soon');
    preview.innerHTML = '<div class="tool-title-line"><span class="tool-icon" aria-hidden="true">T</span><span class="tool-meta"><b>AI Article &amp; Text Detector</b><small>Coming soon. Analysis hosting is not configured.</small></span><span class="tool-arrow" aria-hidden="true">↗</span></div><span class="open-label">PREVIEW ONLY · NOT LIVE</span>';
    tools.append(preview);
  }
  const planned = image ? ['Image Resizer', 'Palette Generator'] : ai ? ['Prompt Organizer', 'Decision Helper'] : d.example_planned_tools;
  planned.forEach((title, index) => {
    const row = document.createElement('div'); row.className = 'planned-tool';
    const icon = document.createElement('span'); icon.className = 'planned-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = index === 0 ? '⌗' : '◈';
    const label = document.createElement('b'); label.textContent = title;
    const status = document.createElement('small'); status.textContent = 'PLANNED';
    row.append(icon, label, status); tools.append(row);
  });
  document.querySelector('.preview-note').open = false;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
cards.forEach(c => c.addEventListener('click', () => openCategory(c.dataset.category, c)));
document.querySelector('.modal-close').addEventListener('click', () => dialog.close());
document.querySelector('#back-districts').addEventListener('click', () => { dialog.close(); document.querySelector('#categories').scrollIntoView({ behavior: 'smooth' }); });
dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
dialog.addEventListener('close', () => opener?.focus({ preventScroll: true }));
