(() => {
'use strict';
const categories = [
  {id:'ai-software',name:'AI & Software',short:'AI / SOFTWARE',purpose:'AI, software, releases and analysis',tone:'#a78bfa',allocation:20,subcategories:['AI News & Releases','AI Tools & Applications','AI Models & Benchmarks','AI Research & Safety','Software Updates','Tutorials & Troubleshooting','AI Productivity & Workflows']},
  {id:'gaming',name:'Gaming',short:'PLAY / VIRTUAL WORLDS',purpose:'Gaming news, guides and updates',tone:'#53f5ff',allocation:15,subcategories:['Game News & Updates','Walkthroughs & Guides','Tips, Secrets & Collectibles','Gaming Hardware','Game Reviews & Comparisons','Gaming Industry & Policy']},
  {id:'gadgets-gear',name:'Gadgets & Gear',short:'BUILD / UPGRADE',purpose:'Devices, reviews and comparisons',tone:'#ffb576',allocation:10,subcategories:['Smartphones & Computers','Gaming PCs & Handhelds','Audio & Wearables','Product Reviews','Buying Guides','Device Comparisons','Smart Home & Robotics']},
  {id:'digital-culture',name:'Digital Culture',short:'CONNECT / DISCOVER',purpose:'Internet culture and digital life',tone:'#8af4c2',allocation:8,subcategories:['Social Media & Platforms','Creator Economy','Internet Trends','Digital Work & Society','Online Identity','Digital Ownership']},
  {id:'crypto-finance',name:'Crypto & Digital Finance',short:'DECODE / VERIFY',purpose:'Blockchain, payments and policy',tone:'#ff82d8',allocation:5,subcategories:['Blockchain Technology','Stablecoins & Payments','Regulation & Policy','Tokenization','Crypto Security','Industry Analysis'],note:{label:'EDITORIAL GUARDRAIL',text:'Prioritize evidence-led explainers and verified reporting over advice that could steer financial decisions. No financial decision advice.'}},
  {id:'web-seo-creator',name:'Web, SEO & Creator Tools',short:'MAKE / OPTIMIZE',purpose:'SEO, websites, free tools and tutorials',tone:'#d7ff54',allocation:22,subcategories:['Google Search & SEO','Technical SEO','Website Performance','Website Accessibility','Image & Design Tutorials','PDF & Document Guides','Video & Audio Tools','Developer Utilities','Creator Productivity'],note:{label:'TOOLS HUB CONNECTION',text:'Planned to connect directly with AFTERHOURS’ 100 free tools.'}},
  {id:'privacy-security',name:'Privacy & Cybersecurity',short:'PROTECT / UNDERSTAND',purpose:'Online security and privacy',tone:'#7bd7ff',allocation:12,subcategories:['Account Security','Online Scams & Deepfakes','Privacy Settings','Browser & App Security','Metadata & Digital Footprints','Data Protection','Security Explainers']},
  {id:'tech-careers',name:'Tech Careers & Jobs',short:'FIND / GROW',purpose:'Jobs, career paths and skills',tone:'#ff9ac2',allocation:8,subcategories:['Verified Remote Jobs','AI & Software Jobs','Internships & Entry-Level Jobs','Career Paths & Salary Guides','Resume & Portfolio Guides','Interview Preparation','Work Visas & Sponsorship'],note:{label:'VERIFICATION STANDARD',text:'Job posts should include the original employer source, location, application deadline and verification date. Do not call an unverified listing “Verified”. Verified Remote Jobs is a planned topic name, not verification of any listing. Check all four fields before using “Verified”.'}}
];
const topicStoryIds = {"AI News & Releases":["disney-character-ai-staffing-offer","anthropic-public-benefit-share-pledge","tv-detox-ai-android-tv","replit-openai-default-model-provider","meta-commercial-terms-scraping-language"],"AI Tools & Applications":["tv-detox-ai-android-tv","replit-openai-default-model-provider"],"Software Updates":["replit-openai-default-model-provider"],"Tutorials & Troubleshooting":["tv-detox-ai-android-tv"],"AI Productivity & Workflows":["tv-detox-ai-android-tv"],"Game News & Updates":["pikmin-4-switch2-edition-report"],"Gaming Hardware":["lenovo-legion-go-s-steamos-reported-bestbuy-deal"],"Gaming Industry & Policy":["power-to-the-players-act-ownership-offline-mode"],"Gaming PCs & Handhelds":["lenovo-legion-go-s-steamos-reported-bestbuy-deal"],"Audio & Wearables":["bose-wired-anc-earbuds-usbc-report"],"Product Reviews":["ember-mug-3-temperature-presets-review-report","bose-wired-anc-earbuds-usbc-report"],"Social Media & Platforms":["instagram-ai-fakes-creators","meta-commercial-terms-scraping-language"],"Creator Economy":["instagram-ai-fakes-creators"],"Internet Trends":["instagram-ai-fakes-creators"],"Digital Work & Society":["anthropic-workforce-less-junior"],"Online Identity":["world-id-banking-zoom-launch"],"Digital Ownership":["power-to-the-players-act-ownership-offline-mode"],"Blockchain Technology":["okx-ice-tokenized-stocks-issuer-pushback"],"Stablecoins & Payments":["stablecoin-payments-growth-allium-2026"],"Regulation & Policy":["okx-ice-tokenized-stocks-issuer-pushback","latvia-crypto-tax-payments-2027-proposal"],"Tokenization":["okx-ice-tokenized-stocks-issuer-pushback"],"Industry Analysis":["stablecoin-payments-growth-allium-2026"],"Online Scams & Deepfakes":["world-id-banking-zoom-launch","instagram-ai-fakes-creators"],"Metadata & Digital Footprints":["photo-ai-inference-privacy"],"Data Protection":["photo-ai-inference-privacy","meta-commercial-terms-scraping-language"],"Security Explainers":["photo-ai-inference-privacy","world-id-banking-zoom-launch"],"AI & Software Jobs":["disney-character-ai-staffing-offer"]};
const crossCategoryStoryIds = {"privacy-security":["world-id-banking-zoom-launch","instagram-ai-fakes-creators","photo-ai-inference-privacy","meta-commercial-terms-scraping-language"],"tech-careers":["disney-character-ai-staffing-offer"]};
const primaryStoryCategories = {"ai-software":"ai","gaming":"gaming","gadgets-gear":"gear","digital-culture":"culture","crypto-finance":"crypto"};
const storyIndexAvailable = Array.isArray(window.STORIES);
const currentStories = storyIndexAvailable ? window.STORIES.filter(s => s && typeof s.id === "string" && typeof s.title === "string") : [];
const $ = (selector, root = document) => root.querySelector(selector);
const list = $('#category-list');
const detail = $('#category-detail');
const directory = $('#directory');
const directoryGrid = $('#directory-grid');
const search = $('#topic-search');
const clearSearch = $('#clear-search');
const searchStatus = $('#search-status');
let activeId = categories[0].id;
const safe = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const code = c => String(categories.indexOf(c) + 1).padStart(2, '0');
const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
const matches = (c, q) => !q || [c.name, c.purpose, ...c.subcategories, c.note?.text || ''].join(' ').toLowerCase().includes(q);

function existingFor(category, selectedTopics = null) {
  const ids = new Set();
  if (selectedTopics) {
    selectedTopics.forEach(topic => (topicStoryIds[topic] || []).forEach(id => ids.add(id)));
  } else {
    const primary = primaryStoryCategories[category.id];
    currentStories.forEach(story => { if (story.category === primary) ids.add(story.id); });
    category.subcategories.forEach(topic => (topicStoryIds[topic] || []).forEach(id => ids.add(id)));
    (crossCategoryStoryIds[category.id] || []).forEach(id => ids.add(id));
  }
  return currentStories.filter(story => ids.has(story.id)).sort((a,b) => String(b.publishedAt || b.date || '').localeCompare(String(a.publishedAt || a.date || '')));
}

function renderStoryFeed(category, topic, related) {
  const grid = $('#existing-story-grid');
  $('#district-stories-title').textContent = category ? `Read ${category.name}` : 'Existing Journal stories';
  $('#existing-story-count').textContent = storyIndexAvailable ? `${related.length} EXISTING ${related.length === 1 ? 'STORY' : 'STORIES'}` : 'STORY INDEX UNAVAILABLE';
  let note = !category ? 'Clear the taxonomy search to browse existing reporting.' : `${topic ? `Selected coverage: ${topic}. ` : ''}${related.length} existing Journal ${related.length === 1 ? 'story is' : 'stories are'} linked ${topic ? 'to this topic' : 'to this district'}. This is separate from the ${category.allocation} planned posts for this district.`;
  if (category?.id === 'tech-careers') note += ' These are news reports, not verified vacancies or job listings.';
  if (!storyIndexAvailable) note = 'The existing story index could not load. The approved coverage plan is still available; open the current Journal to read published reporting.';
  $('#existing-story-note').textContent = note;
  grid.innerHTML = related.length ? related.map(story => {
    const href = `/article?story=${encodeURIComponent(story.id)}`;
    return `<article class="existing-story" data-story-id="${safe(story.id)}"><small>EXISTING JOURNAL REPORT · ${safe(story.publishedAt || story.date || '')}</small><h4><a href="${href}">${safe(story.title)}</a></h4><p>${safe(story.excerpt || story.subtitle || '')}</p><a class="existing-story-open" href="${href}">READ EXISTING STORY <span aria-hidden="true">↗</span></a></article>`;
  }).join('') : `<p class="existing-empty">${storyIndexAvailable ? 'No existing article is linked to this selected coverage lane yet. The planned allocation does not mean these articles have been published.' : 'Existing article links are temporarily unavailable in this view.'} <a href="/#feed">Read the current Journal ↗</a></p>`;
}

function renderList() {
  const q = search.value.trim().toLowerCase();
  const matched = categories.filter(c => matches(c, q));
  if (matched.length && !matched.some(c => c.id === activeId)) activeId = matched[0].id;
  list.innerHTML = matched.map(c => `<button class="category-button" type="button" data-id="${c.id}" style="--tone:${c.tone}" aria-pressed="${c.id === activeId}" aria-controls="category-detail"><span class="cat-code">${code(c)}</span><span class="cat-label"><strong>${safe(c.name)}</strong><small>${safe(c.short)}</small></span><span class="cat-plan">${String(c.allocation).padStart(2,'0')}<small>PLANNED</small></span></button>`).join('') || '<p class="no-results">No district or subtopic matches that signal. Try another search.</p>';
  if (matched.length) renderDetail();
  else {
    detail.dataset.index = '';
    renderStoryFeed(null, search.value, []);
    detail.innerHTML = '<div class="micro">NO MATCHING DISTRICT</div><h3 tabindex="-1">Try another signal.</h3><p class="no-results">No planned category or subtopic matches this search. Clear the search to explore all eight districts.</p>';
  }
  clearSearch.hidden = !q;
  searchStatus.textContent = q ? `${matched.length} matching district${matched.length === 1 ? '' : 's'} for “${search.value.trim()}”. Article counts are planned.` : '8 districts · 55 subtopics. Article counts are planned.';
}

function renderDetail() {
  const c = categories.find(item => item.id === activeId);
  const q = search.value.trim().toLowerCase();
  let subs = c.subcategories.filter(s => !q || s.toLowerCase().includes(q));
  if (q && !subs.length && matches(c, q)) subs = c.subcategories;
  const selected = c.subcategories.find(s => s.toLowerCase() === q);
  const related = existingFor(c, selected || subs.length < c.subcategories.length ? subs : null);
  renderStoryFeed(c, selected || (subs.length < c.subcategories.length ? search.value.trim() : ""), related);
  detail.style.setProperty('--tone', c.tone);
  detail.style.setProperty('--glow', `${c.tone}14`);
  detail.dataset.index = code(c);
  detail.innerHTML = `<div class="detail-head"><div><div class="micro">DISTRICT ${code(c)} / JOURNAL CATEGORY</div><h3 tabindex="-1">${safe(c.name)}</h3><p class="detail-desc">${safe(c.purpose)}</p></div><div class="allocation-badge"><strong>${String(c.allocation).padStart(2,'0')}</strong><small>POSTS / PLANNED</small></div></div><div class="subtopic-head"><span>SUBTOPICS / ${String(c.subcategories.length).padStart(2,'0')}</span><span>${subs.length < c.subcategories.length ? 'MATCHING THIS SEARCH' : 'PLANNED CONTENT LANES'}</span></div><div class="subtopics">${subs.map(s => `<button class="subtopic" type="button" aria-pressed="${s === selected}" data-topic="${safe(s)}">${safe(s)}</button>`).join('')}</div><p class="topic-context">${selected ? `Selected topic: <strong>${safe(selected)}</strong>. ` : ''}These are coverage lanes, not published article counts. <a href="#district-stories">${related.length ? "Read " + related.length + " existing " + (related.length === 1 ? "story" : "stories") + " ↓" : "See existing-story status ↓"}</a> <a href="/#feed">Current Journal ↗</a>${c.id === 'web-seo-creator' ? ' <a href="/tools/">Explore the Tools Hub ↗</a>' : ''}</p>${c.note ? `<div class="editorial-note"><strong>${safe(c.note.label)}</strong>${safe(c.note.text)}</div>` : ''}`;
}

function renderDirectory() {
  const q = search.value.trim().toLowerCase();
  const openIds = new Set([...directoryGrid.querySelectorAll('details[open]')].map(d => d.dataset.id));
  directoryGrid.innerHTML = categories.map(c => `<details class="directory-card" data-id="${c.id}" style="--tone:${c.tone}" ${matches(c,q) ? '' : 'hidden'} ${openIds.has(c.id) ? 'open' : ''}><summary><span class="card-code">${code(c)}</span><span><h4>${safe(c.name)}</h4><p>${safe(c.purpose)}</p></span><span class="directory-share">${String(c.allocation).padStart(2,'0')}<small>PLANNED</small></span></summary><div class="directory-body"><div class="directory-subtopics">${c.subcategories.map(s => `<button class="directory-topic" type="button" data-district="${c.id}" data-topic="${safe(s)}">${safe(s)}</button>`).join('')}</div>${c.note ? `<p class="directory-note"><strong>${safe(c.note.label)}:</strong> ${safe(c.note.text)}</p>` : ''}</div></details>`).join('');
  updateExpandLabel();
}

function updateExpandLabel() {
  const cards = [...directoryGrid.querySelectorAll('details:not([hidden])')];
  $('#toggle-all').textContent = cards.length && cards.every(c => c.open) ? 'COLLAPSE ALL' : 'EXPAND ALL';
}

function syncUrl(mode = 'replace') {
  const params = new URLSearchParams();
  if (activeId !== categories[0].id) params.set('district', activeId);
  if (search.value.trim()) params.set('topic', search.value.trim());
  const target = `${location.pathname}${params.size ? '?' + params.toString() : ''}${location.hash}`;
  if (target !== location.pathname + location.search + location.hash) history[mode + 'State'](null, '', target);
}

function applyUrl() {
  const params = new URLSearchParams(location.search);
  activeId = categories.find(c => c.id === params.get('district'))?.id || categories[0].id;
  search.value = (params.get('topic') || '').slice(0, 160);
}

function focusDetail() {
  $('h3', detail)?.focus({preventScroll: true});
  detail.scrollIntoView({behavior: motion(), block: 'start'});
}

function selectTopic(districtId, topic) {
  activeId = districtId;
  search.value = topic;
  renderList();
  renderDirectory();
  syncUrl('push');
  const selected = [...detail.querySelectorAll('.subtopic')].find(b => b.dataset.topic === topic);
  selected?.focus({preventScroll: true});
}

list.addEventListener('click', event => {
  const button = event.target.closest('.category-button');
  if (!button) return;
  activeId = button.dataset.id;
  renderList();
  syncUrl('push');
  if (matchMedia('(max-width: 900px)').matches) focusDetail();
  else [...list.querySelectorAll('.category-button')].find(b => b.dataset.id === activeId)?.focus({preventScroll:true});
});
search.addEventListener('input', () => { renderList(); renderDirectory(); syncUrl(); });
clearSearch.addEventListener('click', () => {
  search.value = '';
  renderList();
  renderDirectory();
  syncUrl('push');
  search.focus();
});
detail.addEventListener('click', event => {
  const button = event.target.closest('.subtopic');
  if (button) selectTopic(activeId, button.dataset.topic);
});
directoryGrid.addEventListener('click', event => {
  const button = event.target.closest('.directory-topic');
  if (!button) return;
  selectTopic(button.dataset.district, button.dataset.topic);
  detail.scrollIntoView({behavior: motion(), block:'start'});
});
directoryGrid.addEventListener('toggle', updateExpandLabel, true);
window.addEventListener('popstate', () => { applyUrl(); renderList(); renderDirectory(); });
$('#toggle-directory').addEventListener('click', event => {
  const open = directory.hidden;
  directory.hidden = !open;
  event.currentTarget.setAttribute('aria-expanded', String(open));
  event.currentTarget.innerHTML = `${open ? 'CLOSE' : 'OPEN'} THE COMPLETE CATEGORY MAP <span aria-hidden="true">${open ? '−' : '＋'}</span>`;
  if (open) directory.scrollIntoView({behavior:motion(),block:'nearest'});
});
$('#toggle-all').addEventListener('click', () => {
  const cards = [...directoryGrid.querySelectorAll('details:not([hidden])')];
  const expand = cards.some(card => !card.open);
  cards.forEach(card => { card.open = expand; });
  updateExpandLabel();
});
$('#allocation-list').innerHTML = categories.map(c => `<div class="allocation-row" style="--tone:${c.tone}"><div class="allocation-name"><i aria-hidden="true"></i><span>${safe(c.name)}<small>DISTRICT ${code(c)}</small></span></div><div class="bar-track" role="img" aria-label="${c.allocation} of 100 planned posts"><span class="bar-fill" style="--share:${c.allocation}%"></span></div><div class="allocation-value"><b>${String(c.allocation).padStart(2,'0')}</b><small>OF 100</small></div></div>`).join('');
$('#editorial-guardrails').innerHTML = categories.filter(c => c.note).map(c => `<article class="guardrail" style="--tone:${c.tone}"><div class="micro">${safe(c.note.label)} / ${safe(c.name)}</div><h3>${safe(c.name)}</h3><p>${safe(c.note.text)}</p></article>`).join('');
applyUrl();
renderList();
renderDirectory();
})();
