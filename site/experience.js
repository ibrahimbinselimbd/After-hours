'use strict';
(() => {
 const hero=document.querySelector('.hero'), canvas=document.querySelector('#city-weather');
 if(!hero||!canvas)return;
 const ctx=canvas.getContext('2d'); if(!ctx)return;
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 let width=0,height=0,particles=[],raf=0,last=0,active=true,scene='rain';
 const mobile=matchMedia('(max-width:700px)');
 function resize(){width=hero.clientWidth;height=hero.clientHeight;const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);particles=Array.from({length:mobile.matches?32:66},()=>({x:Math.random()*width,y:Math.random()*height,s:.4+Math.random(),a:.12+Math.random()*.23}));}
 function stopped(){return document.body.classList.contains('reduce-motion')||document.hidden||!active;}
 function draw(t){raf=0;if(stopped()){ctx.clearRect(0,0,width,height);return;}raf=requestAnimationFrame(draw);if(t-last<33)return;const delta=Math.min((t-last)/33,2);last=t;ctx.clearRect(0,0,width,height);for(const p of particles){if(scene==='rain'){p.x-=p.s*1.2*delta;p.y+=p.s*7*delta;ctx.strokeStyle=`rgba(170,224,243,${p.a})`;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-3,p.y+11*p.s);ctx.stroke();}else{p.y-=p.s*(scene==='signal'?1.1:.4)*delta;p.x+=Math.sin(t/1800+p.s*9)*.35*delta;ctx.fillStyle=scene==='signal'?`rgba(211,251,86,${p.a+.12})`:`rgba(169,225,255,${p.a})`;ctx.beginPath();ctx.arc(p.x,p.y,p.s*1.8,0,Math.PI*2);ctx.fill();}if(p.y>height+20)p.y=-20;if(p.y<-22)p.y=height+20;if(p.x<-10)p.x=width+10;if(p.x>width+12)p.x=-5;}}
 function sync(){if(stopped()){cancelAnimationFrame(raf);raf=0;ctx.clearRect(0,0,width,height);}else if(!raf){last=0;raf=requestAnimationFrame(draw);}}
 const names={rain:'RAIN / NIGHT CITY',signal:'SIGNAL / PARTICLE FIELD',drift:'DRIFT / QUIET ORBIT'};
 document.querySelectorAll('[data-scene-select]').forEach(button=>button.addEventListener('click',()=>{scene=button.dataset.sceneSelect;hero.dataset.scene=scene;document.querySelectorAll('[data-scene-select]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelector('#scene-label').textContent=names[scene];}));
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
 new IntersectionObserver(entries=>{active=entries[0].isIntersecting;sync();},{threshold:.01}).observe(hero);
 document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('motion-paused',document.hidden);sync();});
 let timer;addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(()=>{resize();sync();},180);},{passive:true});resize();sync();
})();
