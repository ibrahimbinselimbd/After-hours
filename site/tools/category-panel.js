// Category details and same-site tool navigation. AI Text Detector stays disabled.
function openCategory(id, trigger) {
  const data = categories.find(item => item.id === id);
  if (!data) return;
  const image = id === 'image-design';
  const ai = id === 'ai-everyday-utilities';
  opener = trigger || document.querySelector(`[data-category="${id}"]`);
  document.querySelector('#district-number').textContent = String(categories.indexOf(data) + 1).padStart(2, '0');
  const heading = document.querySelector('#dialog-title');
  heading.replaceChildren();
  if (image || ai) {
    heading.append(image ? 'Image ' : 'AI & ');
    if (image) { const amp = document.createElement('span'); amp.textContent = '&'; heading.append(amp); }
    heading.append(document.createElement('br'), image ? 'Design' : 'Everyday Utilities');
    const dot = document.createElement('span'); dot.className = 'title-dot'; dot.textContent = '.'; heading.append(dot);
  } else heading.textContent = data.title;
  document.querySelector('#dialog-description').textContent = data.description;
  const status = document.querySelector('.modal-status');
  status.textContent = ai ? `${data.availableTools.length} AVAILABLE · TEXT DETECTOR COMING SOON` : `${data.availableTools.length} AVAILABLE`;
  const tools = document.querySelector('#dialog-tools');
  tools.replaceChildren();
  for (const item of data.availableTools) {
    const link = document.createElement('a');
    link.className = 'featured-tool'; link.href = item.href;
    link.setAttribute('aria-label', `Open ${item.title} — free`);
    const line = document.createElement('div'); line.className = 'tool-title-line';
    const icon = document.createElement('span'); icon.className = 'tool-icon'; icon.setAttribute('aria-hidden','true'); icon.textContent = item.icon || '↗';
    const meta = document.createElement('span'); meta.className = 'tool-meta';
    const title = document.createElement('b'); title.textContent = item.title;
    const description = document.createElement('small'); description.textContent = item.description;
    meta.append(title, description);
    const arrow = document.createElement('span'); arrow.className='tool-arrow'; arrow.setAttribute('aria-hidden','true'); arrow.textContent='↗';
    line.append(icon, meta, arrow); link.append(line);
    const label=document.createElement('span');label.className='open-label';label.textContent='OPEN TOOL · FREE';link.append(label);
    tools.append(link);
  }
  if (data.preview) {
    const row=document.createElement('div');row.className='planned-tool disabled-tool';
    const icon=document.createElement('span');icon.className='planned-icon';icon.setAttribute('aria-hidden','true');icon.textContent='T';
    const label=document.createElement('b');label.textContent=data.preview.title;
    const state=document.createElement('small');state.textContent='COMING SOON · DISABLED';
    row.append(icon,label,state);tools.append(row);
    const note=document.createElement('p');note.className='tool-note';note.textContent='Analysis hosting is not configured. This tool does not analyze text and is not available yet.';tools.append(note);
  }
  for (const title of data.upcomingTools.filter(title => title !== data.preview?.title)) {
    const row=document.createElement('div');row.className='planned-tool';
    const icon=document.createElement('span');icon.className='planned-icon';icon.setAttribute('aria-hidden','true');icon.textContent='◈';
    const label=document.createElement('b');label.textContent=title;
    const state=document.createElement('small');state.textContent='PLANNED';
    row.append(icon,label,state);tools.append(row);
  }
  document.querySelector('.preview-note').open = false;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
cards.forEach(card => card.addEventListener('click', () => openCategory(card.dataset.category, card)));
document.querySelector('.modal-close').addEventListener('click', () => dialog.close());
document.querySelector('#back-districts').addEventListener('click', () => { dialog.close(); document.querySelector('#categories').scrollIntoView({ behavior: 'smooth' }); });
dialog.addEventListener('click', event => {
  if (event.target === dialog) { const rect=dialog.getBoundingClientRect(); if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom) dialog.close(); }
});
dialog.addEventListener('close', () => opener?.focus({preventScroll:true}));
const requestedCategory = new URLSearchParams(location.search).get('category');
if (requestedCategory && categories.some(category => category.id === requestedCategory)) openCategory(requestedCategory);
