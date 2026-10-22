/* Reading telemetry: cached geometry, one scheduled update, no read/write layout loop. */
(() => {
  'use strict';
  const body=document.querySelector('.article-body');if(!body)return;
  const sections=[...body.querySelectorAll('.article-section')];
  const telemetry=document.createElement('div');telemetry.className='reader-frequency';
  telemetry.innerHTML='<div class="reader-line"><span>READING <strong id="reader-percent">0% read</strong></span><span class="frequency-section">Overview</span></div><div class="reader-progress-track" role="progressbar" aria-label="Article reading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="progress-bar"></span></div>';
  document.querySelector('.article-hero').insertAdjacentElement('afterend',telemetry);
  const percentage=document.getElementById('reader-percent'),bar=document.getElementById('progress-bar'),current=telemetry.querySelector('.frequency-section');
  const links=[...document.querySelectorAll('.toc-link')];
  sections.forEach((s,i)=>{s.dataset.signalTone=['cyan','pink','violet'][i%3];s.dataset.signalIndex=String(i+1).padStart(2,'0');});
  const targets=[document.getElementById('article-content'),...sections,document.getElementById('source-note')].filter(Boolean);
  let positions=[],start=0,end=1,frame=0,dirty=true,lastPercent=-1,lastId='';
  function measure(){
    const y=scrollY,r=body.getBoundingClientRect();start=r.top+y;end=r.bottom+y-innerHeight;
    positions=targets.map(el=>({id:el.id,top:el.getBoundingClientRect().top+y,title:el===body?'Overview':el.id==='source-note'?'Sources & dates':el.querySelector('h2')?.textContent.replace(/^\d{2}\s*/, '')||'Overview'}));dirty=false;
  }
  function update(){
    frame=0;if(dirty)measure();
    const y=scrollY,percent=end>start?Math.round(Math.max(0,Math.min(1,(y-start)/(end-start)))*100):0;
    const active=positions.filter(p=>p.top<y+innerHeight*.43).pop()||positions[0];
    if(percent!==lastPercent){percentage.textContent=percent+'% read';bar.style.transform='scaleX('+percent/100+')';telemetry.querySelector('[role=progressbar]').setAttribute('aria-valuenow',String(percent));lastPercent=percent;}
    if(active&&active.id!==lastId){current.textContent=active.title;links.forEach(a=>{const on=a.dataset.target===active.id;a.classList.toggle('active',on);if(on)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});lastId=active.id;}
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(update);}
  function invalidate(){dirty=true;schedule();}
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',invalidate,{passive:true});
  new ResizeObserver(invalidate).observe(body);
  document.fonts?.ready.then(invalidate);update();
  // Preserve the earlier chromatic diamond markers as each section crosses the reading band.
  if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>entries.forEach(e=>e.target.dataset.signalActive=String(e.isIntersecting)),{rootMargin:'-22% 0px -56% 0px'});sections.forEach(s=>observer.observe(s));}
})();
