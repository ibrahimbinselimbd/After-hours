// Presentation only. Tool logic, routes and credits are untouched; the AI detector stays disabled.
// Relative to this hub so local and /After-hours/ GitHub Pages previews both work.
const toolPreviewBase = new URL('./_shared/previews/', location.href);
const categorySearch = document.querySelector('#dialog-tool-search');
const categorySearchStatus = document.querySelector('#category-search-status');
let previewObserver;
function updateCategorySearch() {
  const query = categorySearch?.value.trim().toLowerCase() || '';
  const list = document.querySelector('#dialog-tools');
  const rows = [...list.querySelectorAll('.featured-tool, .planned-tool')];
  let matches = 0;
  let previewVisible = false;
  for (const row of rows) {
    const visible = !query || row.textContent.toLowerCase().includes(query);
    row.hidden = !visible;
    if (visible) matches += 1;
    if (row.classList.contains('disabled-tool') && visible) previewVisible = true;
  }
  const note = list.querySelector('.tool-note');
  if (note) note.hidden = !previewVisible;
  const empty = document.querySelector('#tool-search-empty');
  if (empty) empty.hidden = matches > 0;
  if (categorySearchStatus) categorySearchStatus.textContent = query ? `${matches} matching ${matches === 1 ? 'item' : 'items'}` : '';
}
categorySearch?.addEventListener('input', updateCategorySearch);
function syncPanelHeader() {
  dialog.style.setProperty('--panel-header-height', `${document.querySelector('.panel-top').offsetHeight}px`);
}
if ('ResizeObserver' in window) new ResizeObserver(syncPanelHeader).observe(document.querySelector('.panel-top'));
function openCategory(id, trigger) {
  const data = categories.find(item => item.id === id);
  if (!data) return;
  const ai = id === 'ai-everyday-utilities';
  opener = trigger || document.querySelector(`[data-category="${id}"]`);
  document.querySelector('#district-number').textContent = String(categories.indexOf(data) + 1).padStart(2, '0');
  document.querySelector('#dialog-title').textContent = data.title;
  document.querySelector('#dialog-description').textContent = data.description;
  const accent = opener ? getComputedStyle(opener).getPropertyValue('--accent').trim() : '';
  dialog.style.setProperty('--category-accent', accent || '#d3fb56');
  if (categorySearch) categorySearch.value = '';
  document.querySelector('.modal-status').textContent = ai ? `${data.availableTools.length} AVAILABLE · TEXT DETECTOR COMING SOON` : `${data.availableTools.length} AVAILABLE`;
  const tools = document.querySelector('#dialog-tools');
  previewObserver?.disconnect();
  tools.replaceChildren();
  if ('IntersectionObserver' in window) {
    // Pause preview movement outside the popup viewport, including filtered cards.
    previewObserver = new IntersectionObserver(entries => {
      for (const entry of entries) entry.target.classList.toggle('is-in-view', entry.isIntersecting);
    }, {root: dialog, threshold: .12});
  }
  for (const [index, item] of data.availableTools.entries()) {
    const link = document.createElement('a');
    link.className = 'featured-tool';
    link.href = item.href;
    link.setAttribute('aria-label', `Open ${item.title} — free`);
    const preview = document.createElement('div');
    preview.className = 'tool-preview';
    preview.setAttribute('aria-hidden', 'true');
    const image = document.createElement('img');
    const slug = item.href.split('/').filter(Boolean).pop();
    image.src = new URL(`${slug}.webp`, toolPreviewBase).href;
    image.alt = '';
    image.width = 640;
    image.height = 360;
    image.loading = index < 6 ? 'eager' : 'lazy';
    image.decoding = 'async';
    const caption = document.createElement('span');
    caption.className = 'preview-caption';
    caption.textContent = 'WORKSPACE PREVIEW';
    preview.append(image, caption);
    const line = document.createElement('div');
    line.className = 'tool-title-line';
    const meta = document.createElement('span');
    meta.className = 'tool-meta';
    const title = document.createElement('b');
    title.textContent = item.title;
    const description = document.createElement('small');
    description.textContent = item.description;
    meta.append(title, description);
    line.append(meta);
    const label = document.createElement('span');
    label.className = 'open-label';
    label.textContent = 'OPEN TOOL · FREE';
    const arrow = document.createElement('span');
    arrow.className = 'tool-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    label.append(arrow);
    link.append(preview, line, label);
    link.style.setProperty('--tool-order', String(index % 6));
    tools.append(link);
    if (previewObserver) previewObserver.observe(link);
    else link.classList.add('is-in-view');
  }
  if (data.preview) {
    const row = document.createElement('div'); row.className = 'planned-tool disabled-tool';
    const icon = document.createElement('span'); icon.className = 'planned-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = 'T';
    const label = document.createElement('b'); label.textContent = data.preview.title;
    const state = document.createElement('small'); state.textContent = 'COMING SOON · DISABLED';
    row.append(icon, label, state); tools.append(row);
    const note = document.createElement('p'); note.className = 'tool-note'; note.textContent = 'Analysis hosting is not configured. This tool does not analyze text and is not available yet.'; tools.append(note);
  }
  for (const title of data.upcomingTools.filter(title => title !== data.preview?.title)) {
    const row = document.createElement('div'); row.className = 'planned-tool';
    const icon = document.createElement('span'); icon.className = 'planned-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = '◈';
    const label = document.createElement('b'); label.textContent = title;
    const state = document.createElement('small'); state.textContent = 'PLANNED';
    row.append(icon, label, state); tools.append(row);
  }
  document.querySelector('.preview-note').open = false;
  updateCategorySearch();
  if (!dialog.open) dialog.showModal();
  syncPanelHeader();
  // Do not raise the phone keyboard over the newly opened visual grid.
  if (matchMedia('(min-width: 700px)').matches) categorySearch?.focus({preventScroll: true});
  else document.querySelector('.modal-close').focus({preventScroll: true});
  dialog.scrollTop = 0;
}
cards.forEach(card => card.addEventListener('click', () => openCategory(card.dataset.category, card)));
document.querySelector('.modal-close').addEventListener('click', () => dialog.close());
document.querySelector('#back-districts').addEventListener('click', () => {
  dialog.close();
  document.querySelector('#categories').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
});
dialog.addEventListener('click', event => {
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }
});
dialog.addEventListener('close', () => { previewObserver?.disconnect(); opener?.focus({preventScroll: true}); });
const requestedCategory = new URLSearchParams(location.search).get('category');
if (requestedCategory && categories.some(category => category.id === requestedCategory)) openCategory(requestedCategory);
