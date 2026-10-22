'use strict';
const $ = s => document.querySelector(s);
const stories = window.STORIES || [];
const labels = {gaming:'Gaming',ai:'AI & Software',gear:'Gadgets & Gear',crypto:'Crypto',culture:'Digital culture'};
let saved = []; let signals = [];
try {saved = JSON.parse(localStorage.getItem('ah-saved') || '[]');signals = JSON.parse(localStorage.getItem('ah-signals') || '[]');} catch(e) {}
if (!Array.isArray(saved)) saved=[]; if (!Array.isArray(signals)) signals=[];
let filter='all', toastTimer;
const persist = () => {try {localStorage.setItem('ah-saved',JSON.stringify(saved));localStorage.setItem('ah-signals',JSON.stringify(signals));}catch(e){}};
const toast = text => {$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4200);};
const artTypes=['city','ai','gear','crypto','culture','game2'];
const artWords=['ENTER<br>ANOTHER WORLD','A DIFFERENT<br>KIND OF INTELLIGENCE','LESS, BUT<br>BETTER.','TRUST.<br>VERIFY.','AFTER<br>MIDNIGHT','WORLDS<br>WITHIN WORLDS'];
const shapes=['','<span class="orb"></span>','<span class="gear-shape"></span>','<span class="cube"></span>','<span class="culture-lines"></span>','<span class="game-ring"></span>'];
const newestFirst=(a,b)=>String(b.publishedAt||b.date||'').localeCompare(String(a.publishedAt||a.date||''))||String(b.date||'').localeCompare(String(a.date||''))||stories.indexOf(a)-stories.indexOf(b);
function render(){const matching=stories.filter(s=>filter==='all'||(filter==='saved'?saved.includes(s.id):s.category===filter)).sort(newestFirst);const list=filter==='all'?matching.slice(0,6):matching;$('#empty').hidden=!!list.length;$('#stories').innerHTML=list.map(s=>{const i=stories.indexOf(s);return `<article class="story" data-story-id="${s.id}" style="cursor:pointer"><a href="/article?story=${encodeURIComponent(s.id)}" class="card-visual art-${artTypes[i % artTypes.length]}${s.images?.[0]?' has-story-image':''}" aria-label="Read ${s.title}">${s.images?.[0]?`<img class="feed-card-image" src="${s.images[0].src}" alt="${s.images[0].alt||s.title}" loading="lazy" decoding="async">`:''}<span class="visual-label">${s.images?.[0]?.generated?'AI ILLUSTRATION':s.id==='world-id-banking-zoom-launch'?'WORLD / ORB':s.tag}</span><span class="read-arrow">↗</span>${s.images?.[0]?'':shapes[i % shapes.length]+'<span class="art-word">'+artWords[i % artWords.length]+'</span>'}</a><div class="story-meta"><span class="category">${labels[s.category]}</span><span>· ${s.minutes} MIN READ</span>${s.date?`<span>· ${s.date}</span>`:''}<button class="bookmark" data-save="${s.id}" aria-label="${saved.includes(s.id)?'Unsave':'Save'} ${s.title}" aria-pressed="${saved.includes(s.id)}">${saved.includes(s.id)?'◆':'◇'}</button></div><a class="story-title" href="/article?story=${encodeURIComponent(s.id)}">${s.title}</a><p>${s.excerpt}</p></article>`}).join('');syncCategories(list.length);}
function syncCategories(total){
 document.querySelectorAll('[data-filter]').forEach(b=>{const active=b.dataset.filter===filter;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
 document.querySelectorAll('[data-count]').forEach(el=>{const key=el.dataset.count;el.textContent=String(key==='all'?stories.length:key==='saved'?stories.filter(s=>saved.includes(s.id)).length:stories.filter(s=>s.category===key).length).padStart(2,'0');});
 document.querySelectorAll('[data-district-count]').forEach(el=>{const count=stories.filter(s=>s.category===el.dataset.districtCount).length;el.textContent=String(count).padStart(2,'0')+' SIGNAL'+(count===1?'':'S');});
 $('#feed-count').textContent=String(total).padStart(2,'0')+' SIGNAL'+(total===1?'':'S')+' / '+(filter==='all'?'LATEST STORIES':filter==='saved'?'YOUR ARCHIVE':labels[filter].toUpperCase());
 $('#feed-reset').hidden=filter==='all';
}
$('#feed-reset').addEventListener('click',()=>{filter='all';render();});
function read(id){if(stories.some(s=>s.id===id))location.href='/article?story='+encodeURIComponent(id);}
document.addEventListener('click',e=>{const card=e.target.closest('.story[data-story-id]');if(card&&!e.target.closest('a,button,input,select,textarea,[role=button]')&&!window.getSelection()?.toString()){read(card.dataset.storyId);return;}const reader=e.target.closest('[data-read]');if(reader)read(reader.dataset.read);const save=e.target.closest('[data-save]');if(save){const id=save.dataset.save;const has=saved.includes(id);saved=has?saved.filter(x=>x!==id):[...saved,id];persist();render();toast(has?'Removed from your collection.':'Saved to your collection. It will remain in this browser.');}const f=e.target.closest('[data-filter]');if(f){filter=f.dataset.filter;render();}const jump=e.target.closest('[data-jump]');if(jump){filter=jump.dataset.jump;render();$('#feed').scrollIntoView({behavior:document.body.classList.contains('reduce-motion')?'instant':'smooth'});const active=document.querySelector('[data-filter="'+filter+'"]');if(active)active.focus({preventScroll:true});}const signal=e.target.closest('[data-signal]');if(signal)discover(Number(signal.dataset.signal));});
document.querySelectorAll('.dialog-close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#surprise').addEventListener('click',()=>read(stories[Math.floor(Math.random()*stories.length)].id));
const aliases={gaming:'gaming game games virtual world',ai:'ai artificial intelligence software model',gear:'gadgets gadget gear hardware device',crypto:'crypto cryptocurrency blockchain wallet',culture:'culture digital internet rituals'};
const normalize=value=>String(value).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim();
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const searchIndex=stories.map(story=>({story,title:normalize(story.title+' '+(story.subtitle||'')),text:normalize([story.title,story.subtitle,story.excerpt,labels[story.category],aliases[story.category],...(story.body||[])].join(' '))}));
const searchGlyphs={gaming:'<path d="M6 7h12l3 10c.5 2-2 3-3 1l-3-3H9l-3 3c-1 2-3.5 1-3-1Z"/><path d="M6 11h6m-3-3v6m7-3h.1m2 2h.1"/>',ai:'<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',gear:'<path d="m13 2-9 12h7l-1 8L20 9h-8Z"/>',crypto:'<path d="m12 2 9 5v10l-9 5-9-5V7Z"/><path d="m3 7 9 5 9-5M12 12v10"/>',culture:'<circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="11" ry="5" transform="rotate(-35 12 12)"/>'};
let searchCategory='all',searchMatches=[],activeResult=-1,searchOpener=null;
function search(){
 const query=normalize($('#search-input').value),tokens=query.split(/\s+/).filter(Boolean);
 searchMatches=searchIndex.filter(item=>(searchCategory==='all'||item.story.category===searchCategory)&&tokens.every(token=>item.text.includes(token))).sort((a,b)=>Number(b.title.includes(query))-Number(a.title.includes(query))).map(item=>item.story);
 activeResult=-1;$('#search-input').removeAttribute('aria-activedescendant');
 $('#search-clear').hidden=!$('#search-input').value;
 $('#search-trends').hidden=!!query;
 $('#search-empty').hidden=!!searchMatches.length;
 $('#search-input').setAttribute('aria-expanded',String(searchMatches.length>0));
 $('#search-summary').textContent=(query?'SEARCH RESULTS':'STORIES TO EXPLORE')+' · '+String(searchMatches.length).padStart(2,'0')+(searchCategory==='all'?'':' · '+labels[searchCategory].toUpperCase());
 $('#search-results').innerHTML=searchMatches.map((story,i)=>`<button class="search-result" id="search-option-${i}" role="option" aria-selected="false" tabindex="-1" data-category="${story.category}" data-result-index="${i}" data-read="${story.id}"><span class="result-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${searchGlyphs[story.category]||''}</svg></span><span class="result-copy"><span>${escapeHTML(labels[story.category])} · ${story.minutes} MIN READ</span><strong>${escapeHTML(story.title)}</strong><small lang="en">${escapeHTML(story.subtitle||story.excerpt||'')}</small></span><span class="result-arrow" aria-hidden="true">↗</span></button>`).join('');
 document.querySelectorAll('[data-search-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.searchCategory===searchCategory)));
}
function selectSearchResult(index){
 if(!searchMatches.length)return;
 activeResult=(index+searchMatches.length)%searchMatches.length;
 document.querySelectorAll('[data-result-index]').forEach((el,i)=>el.setAttribute('aria-selected',String(i===activeResult)));
 const el=$('#search-option-'+activeResult);$('#search-input').setAttribute('aria-activedescendant',el.id);el.scrollIntoView({block:'nearest',behavior:'instant'});
}
function openSearch(event){
 if($('#search-dialog').open)return;
 searchOpener=event?.currentTarget instanceof HTMLElement?event.currentTarget:document.activeElement;
 search();$('#search-dialog').showModal();document.body.classList.add('search-active');$('#search-input').focus({preventScroll:true});
}
$('#search-open').addEventListener('click',openSearch);
document.querySelectorAll('[data-open-search]').forEach(button=>button.addEventListener('click',openSearch));
$('#search-input').addEventListener('input',search);
$('#search-input').addEventListener('keydown',e=>{
 if(e.isComposing)return;
 if(e.key==='Escape'){e.preventDefault();$('#search-dialog').close();return;}
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();selectSearchResult(activeResult<0?(e.key==='ArrowDown'?0:searchMatches.length-1):activeResult+(e.key==='ArrowDown'?1:-1));}
 if(e.key==='Enter'&&searchMatches.length){e.preventDefault();read(searchMatches[activeResult<0?0:activeResult].id);}
});
$('#search-clear').addEventListener('click',()=>{$('#search-input').value='';search();$('#search-input').focus();});
$('#search-dialog').addEventListener('click',e=>{
 const category=e.target.closest('[data-search-category]');if(category){searchCategory=category.dataset.searchCategory;search();$('#search-input').focus();}
 const suggestion=e.target.closest('[data-search-query]');if(suggestion){$('#search-input').value=suggestion.dataset.searchQuery;searchCategory='all';search();$('#search-input').focus();}
 if(e.target.closest('[data-search-reset]')){$('#search-input').value='';searchCategory='all';search();$('#search-input').focus();}
});
$('#search-dialog').addEventListener('close',()=>{document.body.classList.remove('search-active');$('#search-input').setAttribute('aria-expanded','false');if(searchOpener?.isConnected)searchOpener.focus({preventScroll:true});});
document.addEventListener('keydown',e=>{
 const editing=document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
 const command=(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k';
 if((command||(e.key==='/'&&!editing&&!e.ctrlKey&&!e.metaKey&&!e.altKey))&&!document.querySelector('dialog[open]')){e.preventDefault();openSearch();}
});
const signalMessages=['CITY SIGNAL / Not every city light is an advertisement. Some are the beginning of a new story.','FUTURE SIGNAL / The future is not only predicted; it is made.','CURIOSITY SIGNAL / The final of three signals: asking a question is the first step through a new door.'];
function syncSignals(){$('#discovery-count').textContent=`${signals.length} / 3 DISCOVERED`;document.querySelectorAll('[data-signal]').forEach(b=>{const found=signals.includes(Number(b.dataset.signal));b.classList.toggle('found',found);const plus=b.querySelector(':scope > span:not(.orbit):not(.core)');if(plus)plus.textContent=found?'✓':'+';});}
function discover(n){if(!signals.includes(n)){signals.push(n);persist();syncSignals();}toast(signals.length===3?'You found every signal! Try “night” in the secret channel.':signalMessages[n]);}
$('#terminal-open').addEventListener('click',()=>{$('#terminal').showModal();$('#command').focus();});
$('#terminal-form').addEventListener('submit',e=>{e.preventDefault();const value=$('#command').value.trim().toLowerCase();const el=$('#terminal-output');if(value==='help')el.textContent='AVAILABLE COMMANDS → night / explore / status / clear';else if(value==='night'){document.body.classList.toggle('alt-frequency');el.textContent='FREQUENCY SHIFTED. Same city. New wave.';}else if(value==='explore'){$('#terminal').close();$('#districts').scrollIntoView({behavior:'smooth'});}else if(value==='status')el.textContent=`SYSTEM ONLINE. SIGNALS DISCOVERED: ${signals.length}/3. SAVED STORIES: ${saved.length}.`;else if(value==='clear')el.textContent='';else el.textContent='UNKNOWN SIGNAL. Type “help” to try again.';$('#command').value='';});
const mq=window.matchMedia('(prefers-reduced-motion: reduce)');let reduce=mq.matches;mq.addEventListener('change',e=>{reduce=e.matches;setMotion();});function setMotion(){document.body.classList.toggle('reduce-motion',reduce);$('#motion').setAttribute('aria-pressed',String(reduce));$('#motion').setAttribute('aria-label',reduce?'Enable animations':'Reduce animations');}setMotion();$('#motion').addEventListener('click',()=>{reduce=!reduce;setMotion();toast(reduce?'Quiet mode on. Animation paused.':'Animation on.');});
window.addEventListener('pointermove',e=>{if(reduce||e.pointerType==='touch')return;document.body.style.setProperty('--cx',e.clientX+'px');document.body.style.setProperty('--cy',e.clientY+'px');$('.hero').style.setProperty('--mx',((e.clientX/innerWidth-.5)*-12)+'px');$('.hero').style.setProperty('--my',((e.clientY/innerHeight-.5)*-8)+'px');},{passive:true});
function clock(){$('#clock').textContent=new Date().toLocaleTimeString('en-GB',{hour12:false,timeZone:'Asia/Dhaka'})+' BST';}clock();setInterval(clock,1000);render();syncSignals();
