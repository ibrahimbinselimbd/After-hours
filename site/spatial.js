/* Event-driven spatial interaction: no perpetual render loop, sensors or scroll hijacking. */
(()=>{'use strict';
 const query='.card-visual,.frequency-search-launch,.district-grid button,.signal-art,.feature-transmission,.search-result,.related-card,.article-hero .hero-copy';
 const motion=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover: hover) and (pointer: fine)');
 const reduced=()=>motion.matches||document.body.classList.contains('reduce-motion');
 let active=null,frame=0,point=null,pressed=null;
 function hydrate(root=document){if(root.nodeType===1&&root.matches(query))root.classList.add('spatial-surface');root.querySelectorAll?.(query).forEach(el=>el.classList.add('spatial-surface'));}
 hydrate();
 const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)hydrate(node);});
 observer.observe(document.body,{childList:true,subtree:true});
 function reset(){if(active){active.classList.remove('spatial-tracking');active.style.removeProperty('--spatial-rx');active.style.removeProperty('--spatial-ry');active=null;}cancelAnimationFrame(frame);frame=0;point=null;}
 function paint(){frame=0;if(!active||!point||reduced())return;const rect=active.getBoundingClientRect();if(!rect.width||!rect.height)return;const max=active.matches('.search-result')?1.8:active.matches('.feature-transmission,.article-hero .hero-copy')?2:5;const x=Math.max(-.5,Math.min(.5,(point.x-rect.left)/rect.width-.5)),y=Math.max(-.5,Math.min(.5,(point.y-rect.top)/rect.height-.5));active.style.setProperty('--spatial-rx',(-y*max*2).toFixed(2)+'deg');active.style.setProperty('--spatial-ry',(x*max*2).toFixed(2)+'deg');}
 document.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||!fine.matches||reduced())return;const target=e.target.closest?.(query);if(target!==active){reset();active=target;if(active)active.classList.add('spatial-tracking');}if(!active)return;point={x:e.clientX,y:e.clientY};if(!frame)frame=requestAnimationFrame(paint);},{passive:true});
 document.documentElement.addEventListener('pointerleave',reset,{passive:true});
 window.addEventListener('scroll',reset,{passive:true});
 document.addEventListener('focusin',reset);
 function release(){if(pressed){pressed.classList.remove('spatial-pressed');pressed=null;}}
 document.addEventListener('pointerdown',e=>{release();if(e.button!==0||reduced())return;const target=e.target.closest?.(query+',.category-channel,.search-chips button');if(target&&e.pointerType!=='mouse'){pressed=target;pressed.classList.add('spatial-pressed');}},{passive:true});
 for(const type of ['pointerup','pointercancel','touchcancel'])document.addEventListener(type,release,{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){reset();release();}});
 function stop(){reset();release();}
 motion.addEventListener('change',stop);fine.addEventListener('change',stop);
 new MutationObserver(()=>{if(reduced())stop();}).observe(document.body,{attributes:true,attributeFilter:['class']});
 document.querySelectorAll('dialog').forEach(el=>el.addEventListener('close',stop));
})();
