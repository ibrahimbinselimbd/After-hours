/* Bounded procedural blue vapor: cached textures, 24fps, no per-frame blur/shadow. */
(() => {
  'use strict';
  const card = document.querySelector('.related-card');
  if (!card) return;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => media.matches || document.body.classList.contains('reduce-motion');
  const canvas = document.createElement('canvas');
  canvas.className = 'smoke-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  card.prepend(canvas); card.classList.add('smoke-card');
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) { canvas.remove(); return; }
  const rand = n => { const v = Math.sin(n * 127.1 + 31.7) * 43758.5453; return v - Math.floor(v); };
  const smooth = v => v * v * (3 - 2 * v);
  function noise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), a = smooth(x - ix), b = smooth(y - iy);
    const n = (x, y) => rand(x + y * 57 + seed * 91);
    return (n(ix, iy) * (1-a) + n(ix+1, iy) * a) * (1-b) + (n(ix, iy+1) * (1-a) + n(ix+1, iy+1) * a) * b;
  }
  // Three tiny turbulent puff textures are generated once, then only composited.
  const textures = [0,1,2].map(seed => {
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 80;
    const sctx = sprite.getContext('2d'), data = sctx.createImageData(80,80);
    for (let y=0;y<80;y++) for(let x=0;x<80;x++) {
      const nx=(x-40)/40, ny=(y-40)/40;
      const warp=noise(x/17,y/17,seed)*.3;
      const falloff=Math.max(0,1-Math.hypot(nx+warp-.15,ny))*Math.pow(Math.max(0,1-Math.hypot(nx,ny)),.55);
      const turbulence=noise(x/13,y/13,seed)*.6+noise(x/6,y/6,seed+5)*.3+noise(x/3,y/3,seed+9)*.1;
      const i=(y*80+x)*4;
      data.data[i]=65+seed*17; data.data[i+1]=155+seed*18; data.data[i+2]=255;
      data.data[i+3]=Math.round(Math.pow(falloff,1.25)*Math.max(0,turbulence-.23)*225);
    }
    sctx.putImageData(data,0,0); return sprite;
  });
  let w=0,h=0,scale=1,raf=0,last=0,visible=false;
  const puffs=Array.from({length:80},(_,i)=>({
    edge:i%4, at:rand(i+2), phase:rand(i+8), life:1700+rand(i+19)*1700,
    size:22+rand(i+24)*25, curl:rand(i+35)*Math.PI*2, sprite:textures[i%3]
  }));
  function paint(time) {
    ctx.setTransform(scale,0,0,scale,0,0); ctx.clearRect(0,0,w,h);
    ctx.save(); ctx.beginPath(); ctx.rect(0,0,w,h);
    // Keep every puff within a narrow edge band, never over the story copy.
    ctx.rect(31,31,Math.max(0,w-62),Math.max(0,h-62)); ctx.clip('evenodd');
    for (const p of puffs) {
      const age=(time/p.life+p.phase)%1, envelope=Math.sin(age*Math.PI);
      const along=(p.at+age*.075)%1;
      const outward=3+age*18, curl=Math.sin(age*6+p.curl)*7;
      let x,y;
      if(p.edge===0){x=20+along*(w-40)+curl;y=20-outward;}
      else if(p.edge===1){x=w-20+outward;y=20+along*(h-40)+curl;}
      else if(p.edge===2){x=20+along*(w-40)-curl;y=h-20+outward;}
      else{x=20-outward;y=20+along*(h-40)-curl;}
      const size=p.size*(.55+age*.9);
      ctx.globalAlpha=envelope*.83;
      ctx.drawImage(p.sprite,x-size*.65,y-size*.5,size*1.3,size);
    }
    ctx.restore(); ctx.globalAlpha=1;
  }
  function stop(){if(raf)cancelAnimationFrame(raf);raf=0;}
  function tick(t){
    raf=0;if(!visible||document.hidden||reduced())return;
    if(t-last>=1000/24){last=t;paint(t);}
    raf=requestAnimationFrame(tick);
  }
  function sync(){stop();if(reduced()){ctx.clearRect(0,0,canvas.width,canvas.height);canvas.dataset.motion='reduced';return;}
    canvas.dataset.motion=visible&&!document.hidden?'running':'paused';
    if(visible&&!document.hidden){paint(performance.now());last=0;raf=requestAnimationFrame(tick);}
  }
  function resize(){w=canvas.clientWidth;h=canvas.clientHeight;scale=Math.min(1,900/w);canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);sync();}
  new ResizeObserver(resize).observe(card);
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:0});observer.observe(card);
  document.addEventListener('visibilitychange',sync);media.addEventListener('change',sync);
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
  resize();
})();
