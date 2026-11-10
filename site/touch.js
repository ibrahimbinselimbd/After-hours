'use strict';
(() => {
 const hero=document.querySelector('.hero'), pad=document.querySelector('.touch-stage');
 if(!hero||!pad)return;
 const canvas=pad.querySelector('canvas'),ctx=canvas.getContext('2d'),trail=document.querySelector('#touch-trail'),fx=trail.getContext('2d');
 if(!ctx||!fx)return;
 const readout=pad.parentElement.querySelector('.touch-readout'), motion=matchMedia('(prefers-reduced-motion: reduce)');
 let w=0,h=0,hw=0,hh=0,angle=.45,tilt=-.2,target=.45,targetTilt=-.2,velocity=0,down=false,startX=0,startAngle=0,lastX=0,lastTime=0,pointer=null,raf=0,previous=0,visible=true,burst=1,born=performance.now(),points=[],rings=[];
 const reduced=()=>motion.matches||document.body.classList.contains('reduce-motion');
 function resize(){const d=Math.min(devicePixelRatio||1,1.5);w=pad.clientWidth;h=pad.clientHeight;canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);hw=hero.clientWidth;hh=hero.clientHeight;trail.width=hw*d;trail.height=hh*d;fx.setTransform(d,0,0,d,0,0);render(performance.now());}
 function project(x,y,z,r){const ca=Math.cos(angle),sa=Math.sin(angle),ct=Math.cos(tilt),st=Math.sin(tilt);let xx=x*ca+z*sa,zz=-x*sa+z*ca,yy=y*ct-zz*st;zz=y*st+zz*ct;const p=3.8/(3.8-zz);return [w/2+xx*r*p,h*.49+yy*r*p,zz];}
 function line(coords,r,color){ctx.beginPath();coords.forEach((a,i)=>{const p=project(a[0],a[1],a[2],r);i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);});ctx.strokeStyle=color;ctx.stroke();}
 const sphere=document.createElement('canvas'), sc=sphere.getContext('2d');
 const size=240; sphere.width=sphere.height=size;const pixels=sc.createImageData(size,size),normals=[];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const nx=(x+.5-size/2)/(size/2),ny=(y+.5-size/2)/(size/2),d=nx*nx+ny*ny;if(d<=1){const nz=Math.sqrt(1-d),light=Math.max(.12,nx*(-.48)+ny*(-.5)+nz*.68),edge=Math.pow(1-nz,3);normals.push([4*(y*size+x),nx,ny,nz,light,edge]);}}
 let texture=null,tw=0,th=0;const image=new Image();image.onload=()=>{const c=document.createElement('canvas');tw=c.width=image.width;th=c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);texture=x.getImageData(0,0,tw,th).data;wake();};image.src='earth.jpg';
 function render(t){ctx.clearRect(0,0,w,h);const r=Math.min(w*.31,h*.385),cx=w/2,cy=h*.49;
 const glow=ctx.createRadialGradient(cx,cy,r*.85,cx,cy,r*1.4);glow.addColorStop(0,'#5dbdff22');glow.addColorStop(.4,'#3c78d818');glow.addColorStop(1,'#3c78d800');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
 ctx.save();ctx.translate(cx,cy);ctx.rotate(-.30);ctx.strokeStyle='#91baff44';ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(0,0,r*1.37,r*.36,0,0,Math.PI*2);ctx.stroke();ctx.restore();
 if(texture){const out=pixels.data,ca=Math.cos(angle),sa=Math.sin(angle),ct=Math.cos(tilt),st=Math.sin(tilt);for(const [i,nx,ny,nz,light,edge] of normals){const yy=ny*ct+nz*st,zz=-ny*st+nz*ct,xx=nx*ca-zz*sa,z=nx*sa+zz*ca;const u=((Math.atan2(xx,z)/Math.PI/2+.5)%1+1)%1,v=Math.acos(Math.max(-1,Math.min(1,-yy)))/Math.PI,j=(Math.min(th-1,Math.floor(v*th))*tw+Math.min(tw-1,Math.floor(u*tw)))*4;out[i]=Math.min(255,texture[j]*light+edge*45);out[i+1]=Math.min(255,texture[j+1]*light+edge*110);out[i+2]=Math.min(255,texture[j+2]*light+edge*175);out[i+3]=255;}sc.putImageData(pixels,0,0);ctx.drawImage(sphere,cx-r,cy-r,2*r,2*r);}else{const g=ctx.createRadialGradient(cx-r*.35,cy-r*.4,r*.1,cx,cy,r);g.addColorStop(0,'#478bba');g.addColorStop(1,'#06152d');ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();}
 ctx.strokeStyle='#a4e1ff85';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
 ctx.save();ctx.translate(cx,cy);ctx.rotate(-.30);const rg=ctx.createLinearGradient(-r,0,r,0);rg.addColorStop(0,'#6fcaff00');rg.addColorStop(.4,'#a9e9ffbb');rg.addColorStop(1,'#c4adff22');ctx.strokeStyle=rg;ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(0,0,r*1.37,r*.36,0,0,Math.PI);ctx.stroke();const a=-t*.00015;const dx=Math.cos(a)*r*1.37,dy=Math.sin(a)*r*.36;ctx.fillStyle='#b9ecff';ctx.shadowColor='#7af3ff';ctx.shadowBlur=8;ctx.beginPath();ctx.arc(dx,dy,2,0,Math.PI*2);ctx.fill();ctx.restore();
 ctx.fillStyle='#aac4d6';ctx.font='6px monospace';ctx.textAlign='left';ctx.fillText('EARTH / 001',12,h*.78);ctx.textAlign='right';ctx.fillText('23.4° AXIAL TILT',w-12,h*.22);
 }
 function frame(t){raf=0;if(document.hidden||!visible)return;if(reduced()){angle=target;tilt=targetTilt;burst=0;points=[];rings=[];fx.clearRect(0,0,hw,hh);render(t);return;}raf=requestAnimationFrame(frame);if(t-previous<(down?16:30))return;const dt=Math.min((t-previous)/16.67,2);previous=t;
 if(!down){target+=velocity*dt;velocity*=Math.pow(.93,dt);if(Math.abs(velocity)<.0002)target+=.0018*dt;}angle+=(target-angle)*.18*dt;tilt+=(targetTilt-tilt)*.13*dt;burst*=Math.pow(.94,dt);render(t);fx.clearRect(0,0,hw,hh);
 points=points.filter(p=>t-p.t<650).slice(-44);for(let i=1;i<points.length;i++){const p=points[i],q=points[i-1],a=1-(t-p.t)/650;fx.strokeStyle=`rgba(146,255,231,${a*.9})`;fx.lineWidth=a*7;fx.shadowColor='#6bffe6';fx.shadowBlur=14;fx.lineCap='round';fx.beginPath();fx.moveTo(q.x,q.y);fx.lineTo(p.x,p.y);fx.stroke();}fx.shadowBlur=0;
 rings=rings.filter(p=>t-p.t<800).slice(-5);for(const p of rings){const a=(t-p.t)/800;fx.strokeStyle=`rgba(211,251,86,${(1-a)*.8})`;fx.lineWidth=2*(1-a);fx.beginPath();fx.arc(p.x,p.y,10+a*100,0,Math.PI*2);fx.stroke();}
 }
 function wake(){if(!raf){previous=0;raf=requestAnimationFrame(frame);}}
 function ink(e,ripple=false){if(reduced())return;const b=hero.getBoundingClientRect(),p={x:e.clientX-b.left,y:e.clientY-b.top,t:performance.now()};points.push(p);if(ripple)rings.push(p);wake();}
 function status(){const n=((Math.round(target*180/Math.PI)%360)+360)%360;pad.setAttribute('aria-valuenow',n);pad.setAttribute('aria-valuetext',`${n} degrees`);readout.textContent=down?`LIVE INPUT / ${n}°`:'DRAG TO EXPLORE';}
 pad.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointer=e.pointerId;pad.setPointerCapture(pointer);down=true;startX=lastX=e.clientX;startAngle=target;lastTime=performance.now();velocity=0;burst=1;pad.classList.add('is-held');ink(e,true);status();wake();});
 pad.addEventListener('pointermove',e=>{if(!down||e.pointerId!==pointer)return;const now=performance.now();target=startAngle+(e.clientX-startX)*.014;const b=pad.getBoundingClientRect();targetTilt=Math.max(-.8,Math.min(.8,((e.clientY-b.top)/h-.5)*1.6));velocity=Math.max(-.08,Math.min(.08,(e.clientX-lastX)*.014/Math.max(1,(now-lastTime)/16.67)));lastX=e.clientX;lastTime=now;ink(e);status();wake();});
 function release(e){if(e.pointerId!==pointer)return;down=false;pointer=null;pad.classList.remove('is-held');targetTilt=-.2;readout.textContent=reduced()?'STILL MODE / ARROWS TO ROTATE':'EARTH / FREE ORBIT';setTimeout(()=>{if(!down)status();},1000);wake();}
 ['pointerup','pointercancel','lostpointercapture'].forEach(type=>pad.addEventListener(type,release));
 pad.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home',' '].includes(e.key))return;e.preventDefault();if(e.key==='Home'){target=.45;targetTilt=-.2;}else if(e.key==='ArrowLeft')target-=.25;else if(e.key==='ArrowRight')target+=.25;burst=1;status();wake();});
 hero.addEventListener('pointerdown',e=>{if(!pad.contains(e.target))ink(e,true);},{passive:true});
 hero.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&!down)ink(e);},{passive:true});
 new ResizeObserver(resize).observe(pad);new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)wake();else{cancelAnimationFrame(raf);raf=0;}},{threshold:.01}).observe(hero);
 new MutationObserver(()=>{cancelAnimationFrame(raf);raf=0;readout.textContent=reduced()?'STILL MODE / ARROWS TO ROTATE':'DRAG TO EXPLORE';wake();}).observe(document.body,{attributes:true,attributeFilter:['class']});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else wake();});motion.addEventListener('change',wake);addEventListener('resize',resize,{passive:true});resize();wake();
})();
