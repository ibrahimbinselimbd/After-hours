(() => {
 'use strict';
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 const reduced=()=>media.matches||document.body.classList.contains('reduce-motion');
 let arrivalTimer=0,clearTimer=0,arrival=null;
 function clearArrival(){clearTimeout(arrivalTimer);clearTimeout(clearTimer);arrival?.classList.remove('topic-arrival');arrival=null;}
 function sync(){document.documentElement.classList.toggle('quiet-reading',reduced());if(reduced())clearArrival();}
 media.addEventListener('change',sync);
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});sync();
 document.getElementById('toc')?.addEventListener('click',e=>{
  const link=e.target.closest('a[data-target]');if(!link||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
  const target=document.getElementById(link.dataset.target);if(!target)return;e.preventDefault();clearArrival();
  target.scrollIntoView({behavior:reduced()?'instant':'smooth',block:'start'});history.replaceState(null,'',link.hash);
  if(!reduced()){arrival=target;arrivalTimer=setTimeout(()=>{if(reduced())return;target.classList.add('topic-arrival');clearTimer=setTimeout(clearArrival,500);},200);}
  target.setAttribute('tabindex','-1');target.focus({preventScroll:true});
 });
})();
