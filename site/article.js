(() => {
  'use strict';
  const stories = Array.isArray(window.STORIES) ? window.STORIES : [];
  const $ = id => document.getElementById(id);
  const labels = {gaming:'GAMING',ai:'AI & SOFTWARE',gear:'GADGETS & GEAR',crypto:'CRYPTO',culture:'DIGITAL CULTURE'};
  const requested = new URLSearchParams(location.search).get('story');
  const story = stories.find(s => s.id === requested) || stories[0];
  if (!story) return;
  const esc = value => String(value || '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = d => new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  const setMeta = (key, value, attribute = 'name') => {
    let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attribute, key);
      document.head.appendChild(element);
    }
    element.content = value;
  };
  const canonicalUrl = new URL(location.pathname, location.origin);
  canonicalUrl.searchParams.set('story', story.id);
  let canonicalLink = document.head.querySelector('link[rel="canonical"]');
  if (!canonicalLink) {
    canonicalLink = document.createElement('link');
    canonicalLink.rel = 'canonical';
    document.head.appendChild(canonicalLink);
  }
  canonicalLink.href = canonicalUrl.href;
  document.title = `${story.title} | AFTERHOURS`;
  setMeta('description', story.excerpt);
  $('article-title').textContent=story.title;
  $('article-bangla').textContent=story.subtitle || '';
  $('article-excerpt').textContent=story.excerpt;
  $('article-lede').textContent=story.body[0];
  $('article-tag').textContent=story.tag+' · SOURCE REPORT '+date(story.date).toUpperCase();
  const categoryDisplay=labels[story.category]||String(story.category||'Journal').replace(/[-_]/g,' ').toUpperCase();
  $('category-label').textContent=categoryDisplay;
  $('read-time').textContent=story.minutes+' MIN READ';
  $('hero-index').textContent=String(stories.indexOf(story)+1).padStart(2,'0')+' / '+stories.length;
  const headings=story.headings || ['What changed','Why it matters','What to watch'];
  // Local editorial images are deliberately independent of third-party hotlink policies.
  const illustrations={
    gaming:{src:'editorial-gaming.webp',alt:'A game controller on a light background',caption:'Gaming illustration. The controller pictured is not a product announcement or evidence of the report.'},
    ai:{src:'editorial-technology.webp',alt:'An illustrated processor surrounded by electronic circuits',caption:'Technology illustration. This is a conceptual image, not a photograph of a system described in the report.'},
    gear:{src:'editorial-technology.webp',alt:'An illustrated processor on a circuit board',caption:'Hardware illustration. This image does not depict a specific product or configuration in the report.'},
    crypto:{src:'editorial-crypto.webp',alt:'A conceptual golden Bitcoin symbol with surrounding digital blocks',caption:'Cryptocurrency illustration, not a depiction of the specific project in this report. No investment recommendation is implied.'},
    culture:{src:'city.jpg',alt:'City lights and architecture at night',caption:'Digital culture / AFTERHOURS visual essay. Illustrative city photography, not a scene from the reported event.'}
  };
  const genericImage={src:'city.jpg',alt:'City architecture at night',caption:'AFTERHOURS editorial atmosphere. Illustrative photography, not an event or product described in this story.'};
  const pictures=Array.isArray(story.images)&&story.images.length?story.images:[illustrations[story.category]||genericImage];
  const imageUrls=pictures.map(image=>new URL(image.src,location.href).href);
  setMeta('og:site_name','AFTERHOURS','property');
  setMeta('og:type','article','property');
  setMeta('og:title',`${story.title} | AFTERHOURS`,'property');
  setMeta('og:description',story.excerpt,'property');
  setMeta('og:url',canonicalUrl.href,'property');
  setMeta('og:image',imageUrls[0],'property');
  setMeta('og:image:alt',pictures[0].alt||story.title,'property');
  setMeta('article:published_time',story.publishedAt,'property');
  setMeta('article:section',categoryDisplay,'property');
  setMeta('twitter:card','summary_large_image');
  setMeta('twitter:title',`${story.title} | AFTERHOURS`);
  setMeta('twitter:description',story.excerpt);
  setMeta('twitter:image',imageUrls[0]);
  setMeta('twitter:image:alt',pictures[0].alt||story.title);
  const heroImage=document.querySelector('.hero-image');
  if(heroImage&&Array.isArray(story.images)&&story.images.length){heroImage.style.backgroundImage='linear-gradient(90deg,#080a16f5,#080a16b0),url('+JSON.stringify(pictures[0].src)+')';heroImage.setAttribute('aria-label',pictures[0].alt||story.title);}
  const figure=document.createElement('div');figure.className='article-media';
  figure.innerHTML=pictures.map((image,i)=>`<figure class="editorial-image"><img src="${esc(image.src)}" alt="${esc(image.alt||story.title)}" width="1400" height="840" loading="lazy" decoding="async"><figcaption>${esc(image.caption||'Editorial illustration.')}${image.source?` <a href="${esc(image.source)}" target="_blank" rel="noopener noreferrer">Image source ↗</a>`:''}</figcaption></figure>`).join('');
  $('article-sections').before(figure);
  $('article-sections').innerHTML=story.body.slice(1).map((p,i)=>`<section class="article-section" id="section-${i+1}"><h2><span>${String(i+1).padStart(2,'0')}</span>${esc(headings[i])}</h2><p>${esc(p)}</p></section>`).join('');
  $('toc').innerHTML=[{id:'article-content',label:'Overview'},...headings.map((label,i)=>({id:'section-'+(i+1),label})),{id:'source-note',label:'Sources & dates'}].map((x,i)=>`<a class="toc-link${i===0?' active':''}" href="#${x.id}" data-target="${x.id}">${esc(x.label)}</a>`).join('');
  $('source-note').innerHTML=`<span class="note-kicker">SOURCES & DATES</span><p>Published by AFTERHOURS on ${date(story.publishedAt)}. Source report: ${date(story.date)}${story.updated?' (updated report; first published 16 October 2026)':''}. Reporting dates are not necessarily product launch dates. ${story.category==='crypto'?'For information only; not investment, tax or legal advice.':''}</p><ul>${story.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a> · ${date(s.date)}</li>`).join('')}</ul><p>Original AFTERHOURS summary and context, based on the linked reporting. Product availability, prices and plans can change. No firsthand product testing is claimed.</p>`;
  // Newest publication first, then report date; tied dates keep editorial array order.
  const byDate=(a,b)=>(b.publishedAt||b.date).localeCompare(a.publishedAt||a.date)||b.date.localeCompare(a.date)||stories.indexOf(a)-stories.indexOf(b);
  const sameCategory=stories.filter(s=>s.category===story.category&&s.id!==story.id).sort(byDate);
  const others=stories.filter(s=>s.category!==story.category&&s.id!==story.id).sort(byDate);
  // New categories also get two recommendations, without repeating the current article.
  const related=[...sameCategory,...others].slice(0,2);
  const categoryName={gaming:'Gaming',ai:'AI & Software',gear:'Gadgets & Gear',crypto:'Crypto',culture:'Digital Culture'}[story.category]||categoryDisplay;
  $('related-title').textContent=sameCategory.length>=2?'More in '+categoryName:'More to explore';
  $('related-grid').innerHTML=related.map(s=>{const image=s.images?.[0]||illustrations[s.category]||genericImage;return `<a class="related-card" href="article.html?story=${encodeURIComponent(s.id)}"><div class="card-visual"><img class="card-image" src="${esc(image.src)}" alt="${esc(image.alt)}" width="700" height="394" loading="lazy" decoding="async"><span class="card-image-label">${s.id==='world-id-banking-zoom-launch'?'WORLD / ORB':image.generated?'AI ILLUSTRATION':'EDITORIAL IMAGE'}</span></div><div class="card-content"><span class="card-meta"><span>${esc({gaming:'Gaming',ai:'AI & Software',gear:'Gadgets & Gear',crypto:'Crypto',culture:'Digital Culture'}[s.category]||String(s.category||'Journal').replace(/[-_]/g,' '))}</span><span>${s.minutes} MIN READ</span></span><h3>${esc(s.title)}</h3><p>${esc(s.excerpt)}</p><span class="card-arrow">Read story <span aria-hidden="true">↗</span></span></div></a>`;}).join('');
  document.querySelector('.related').hidden=related.length===0;
  let saved=[];try{saved=JSON.parse(localStorage.getItem('ah-saved')||'[]');if(!Array.isArray(saved))saved=[];}catch(_){}
  saved=saved.filter(id=>stories.some(s=>s.id===id));
  function syncSave(){const active=saved.includes(story.id);['hero-save'].forEach(id=>{const b=$(id);b.setAttribute('aria-pressed',String(active));b.querySelector('span:last-child').textContent=active?'Saved':id==='hero-save'?'Save story':'Save for later';b.querySelector('span[aria-hidden]').textContent=active?'◆':'◇';});}
  function toggle(){saved=saved.includes(story.id)?saved.filter(id=>id!==story.id):[...saved,story.id];try{localStorage.setItem('ah-saved',JSON.stringify(saved));}catch(_){}syncSave();}
  ['hero-save'].forEach(id=>$(id).addEventListener('click',toggle));syncSave();
  const media=matchMedia('(prefers-reduced-motion: reduce)');let reduced=media.matches;
  function syncMotion(){document.body.classList.toggle('reduce-motion',reduced);$('motion-toggle').setAttribute('aria-pressed',String(reduced));$('motion-toggle').setAttribute('aria-label',reduced?'Enable animations':'Reduce animations');}
  $('motion-toggle').addEventListener('click',()=>{reduced=!reduced;syncMotion();});media.addEventListener('change',e=>{reduced=e.matches;syncMotion();});syncMotion();
  document.addEventListener('keydown',e=>{if(e.key==='s'&&!/input|textarea/i.test(document.activeElement?.tagName||'')){e.preventDefault();toggle();}});
  const jsonLd=document.createElement('script');jsonLd.type='application/ld+json';jsonLd.textContent=JSON.stringify({'@context':'https://schema.org','@type':'NewsArticle',headline:story.title,description:story.excerpt,datePublished:story.publishedAt,articleSection:categoryDisplay,inLanguage:'en',mainEntityOfPage:canonicalUrl.href,image:imageUrls,citation:story.sources.map(s=>s.url)});document.head.appendChild(jsonLd);
})();
