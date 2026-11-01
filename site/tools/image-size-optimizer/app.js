(() => {
'use strict';
const $ = s => document.querySelector(s);
const input=$('#file-input'), drop=$('#drop-zone'), grid=$('#results-grid'), processBtn=$('#process-button'), clearBtn=$('#clear-button'), allBtn=$('#download-all');
const ACCEPTED=new Set(['image/jpeg','image/png','image/webp']);
const MAX_FILES=10, MAX_BYTES=50*1024*1024, MAX_PIXELS=40_000_000, MAX_SIDE=12000;
const CREDIT_KEY='afterhours:daily-credits';
let queue=[], nextId=1, busy=false, downloading=false, toastTimer, lockRatio=true, memoryCredits=null, storageAvailable=true;
const nowDay=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
function credits(){
  let v=memoryCredits;
  try { v=JSON.parse(localStorage.getItem(CREDIT_KEY)||'null'); } catch { storageAvailable=false; }
  return v?.day===nowDay()&&Number.isInteger(v.remaining)?Math.max(0,Math.min(10,v.remaining)):10;
}
function setCredits(n){
  memoryCredits={day:nowDay(),remaining:n};
  try{localStorage.setItem(CREDIT_KEY,JSON.stringify(memoryCredits));}catch{storageAvailable=false;}
  $('#credits').textContent=n;
}
function announce(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),6000)}
function bytes(n){if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';return (n/1048576).toFixed(2)+' MB'}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function base(n){return n.replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|]/g,'_').trim()||'image'}
function supported(f){return ACCEPTED.has(f.type)||(!f.type&&/\.(jpe?g|png|webp)$/i.test(f.name))}
function revoke(x){if(x.inputUrl)URL.revokeObjectURL(x.inputUrl);if(x.outputUrl)URL.revokeObjectURL(x.outputUrl)}
function addFiles(list){
  if(busy||downloading)return;
  let added=0,bad=0,large=0,many=0;
  for(const f of Array.from(list||[])){
    if(!supported(f)){bad++;continue}
    if(f.size>MAX_BYTES){large++;continue}
    if(queue.length>=MAX_FILES){many++;continue}
    queue.push({id:nextId++,file:f,inputUrl:URL.createObjectURL(f),output:null,outputUrl:null,status:'queued',error:''});added++;
  }
  render();
  const notes=[];
  if(added)notes.push(`${added} image${added===1?'':'s'} added`);
  if(bad)notes.push(`${bad} unsupported file${bad===1?'':'s'} skipped`);
  if(large)notes.push(`${large} file${large===1?'':'s'} over 50 MB skipped`);
  if(many)notes.push('Queue limit is 10 images');
  if(notes.length)announce(notes.join(' · '));
}
function render(){
  const done=queue.filter(x=>x.status==='done');
  $('#queue-count').textContent=String(queue.length).padStart(2,'0');
  $('#queue-subtitle').textContent=queue.length?`${done.length} finished · ${queue.length-done.length} waiting`:'Waiting for your first image';
  $('#result-count').textContent=done.length?String(done.length).padStart(2,'0')+' READY':'—';
  $('#empty-state').hidden=queue.length>0;
  clearBtn.disabled=!queue.length||busy||downloading;
  processBtn.disabled=busy||downloading||!queue.some(x=>x.status==='queued'||x.status==='error')||credits()<1;
  processBtn.innerHTML=busy?'<span>…</span> Optimizing…':'<span>✳</span> Optimize images <b>↗</b>';
  input.disabled=busy||downloading;
  document.querySelectorAll('.settings input,.settings select,.settings button').forEach(e=>e.disabled=busy);
  if(!busy)$('#quality').disabled=$('#format').value==='image/png';
  allBtn.disabled=busy||downloading||!done.length;
  $('#download-count').textContent=String(done.length).padStart(2,'0');
  $('#credits').textContent=credits();
  grid.innerHTML=queue.map(card).join('');
}
function card(x){
  const disabled=busy||downloading?' disabled':'';
  if(x.status!=='done')return `<article class="result-card" data-id="${x.id}"><div class="error-card"><strong>${x.status==='error'?'Could not optimize':x.status==='processing'?'Optimizing…':'Ready to optimize'}</strong><p>${esc(x.file.name)}</p><div>${x.status==='error'?esc(x.error):bytes(x.file.size)+' · Local processing'}</div><div class="card-buttons"><button type="button" data-action="remove"${disabled}>Remove</button>${x.status==='error'?`<button class="primary" type="button" data-action="retry"${disabled}>Retry</button>`:''}</div></div></article>`;
  const diff=(1-x.output.size/x.file.size)*100, larger=diff<0;
  return `<article class="result-card" data-id="${x.id}"><div class="compare"><figure><img src="${x.inputUrl}" alt="Original ${esc(x.file.name)}" loading="lazy"><figcaption>BEFORE · ${bytes(x.file.size)}<br>${x.width} × ${x.height}</figcaption></figure><figure><img src="${x.outputUrl}" alt="Optimized ${esc(x.file.name)}" loading="lazy"><figcaption>AFTER · ${bytes(x.output.size)}<br>${x.outWidth} × ${x.outHeight}</figcaption></figure></div><div class="card-body"><div class="card-name" title="${esc(x.file.name)}">${esc(x.file.name)}</div><div class="card-meta"><span class="${larger?'saving larger':'saving'}">${larger?'Output is ':'Saved '}${Math.abs(diff).toFixed(1)}%${larger?' larger':''}</span><span>${x.mime.replace('image/','').toUpperCase()}</span></div><div class="card-buttons"><button type="button" data-action="remove"${disabled}>Remove</button><button class="primary" type="button" data-action="download"${disabled}>Download ↓</button></div></div></article>`;
}
async function validateFile(file){
  const b=new Uint8Array(await file.arrayBuffer()), d=new DataView(b.buffer);
  const text=(i,n)=>String.fromCharCode(...b.subarray(i,i+n));
  if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return;
  if(b.length>=24&&b[0]===137&&text(1,3)==='PNG'){
    if(d.getUint32(16)*d.getUint32(20)>MAX_PIXELS)throw new Error('Image exceeds the safe 40 megapixel limit.');
    for(let i=8;i+12<=b.length;){const n=d.getUint32(i);if(text(i+4,4)==='acTL')throw new Error('Animated PNG is not supported. Choose a still image.');if(n>b.length-i-12)break;i+=n+12;}
    return;
  }
  if(b.length>=16&&text(0,4)==='RIFF'&&text(8,4)==='WEBP'){
    for(let i=12;i+8<=b.length;){const n=d.getUint32(i+4,true), tag=text(i,4);if(tag==='ANIM'||tag==='ANMF'||(tag==='VP8X'&&i+8<b.length&&(b[i+8]&2)))throw new Error('Animated WebP is not supported. Choose a still image.');if(n>b.length-i-8)break;i+=8+n+(n%2);}
    return;
  }
  throw new Error('This file is not a valid JPEG, PNG or WebP image.');
}
function imageFrom(file){return new Promise((resolve,reject)=>{
  const u=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{URL.revokeObjectURL(u);resolve({width:img.naturalWidth,height:img.naturalHeight,draw:(ctx,w,h)=>ctx.drawImage(img,0,0,w,h)});};
  img.onerror=()=>{URL.revokeObjectURL(u);reject(new Error('The image is corrupt or could not be decoded.'))};img.src=u;
})}
async function decode(file){
  await validateFile(file);
  if('createImageBitmap' in window){try{const b=await createImageBitmap(file);return {width:b.width,height:b.height,draw:(ctx,w,h)=>ctx.drawImage(b,0,0,w,h),close:()=>b.close()};}catch{}}
  return imageFrom(file);
}
function targetDims(w,h){
  const p=$('#preset').value;
  if(p==='original')return {w,h};
  if(p!=='custom'){
    const max={small:1280,social:1080,medium:1920,large:2560}[p];
    const s=Math.min(1,max/Math.max(w,h));return {w:Math.max(1,Math.round(w*s)),h:Math.max(1,Math.round(h*s))};
  }
  const ws=$('#width').value, hs=$('#height').value;
  const check=s=>s===''||(Number.isInteger(Number(s))&&Number(s)>=1&&Number(s)<=MAX_SIDE);
  if(!check(ws)||!check(hs))throw new Error('Custom dimensions must be whole numbers from 1 to 12,000.');
  if(!ws&&!hs)throw new Error('Enter a custom width or height, or choose a preset.');
  let tw=ws?Number(ws):null, th=hs?Number(hs):null;
  if(lockRatio){const s=Math.min(tw?tw/w:Infinity,th?th/h:Infinity);tw=Math.max(1,Math.round(w*s));th=Math.max(1,Math.round(h*s));}
  else {tw=tw||w;th=th||h;}
  if(tw>MAX_SIDE||th>MAX_SIDE)throw new Error('Output must be no more than 12,000 pixels on either side.');
  return {w:tw,h:th};
}
function canvasBlob(c,m,q){return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('This browser could not encode the image. Try smaller dimensions.')),m,m==='image/png'?undefined:q))}
async function optimize(item){
  const source=await decode(item.file);
  try{
    if(source.width*source.height>MAX_PIXELS||source.width>MAX_SIDE||source.height>MAX_SIDE)throw new Error('Image exceeds the safe 40 MP / 12,000 pixel limit.');
    const d=targetDims(source.width,source.height);
    if(d.w*d.h>MAX_PIXELS)throw new Error('Target dimensions exceed the safe 40 megapixel limit.');
    const c=document.createElement('canvas');c.width=d.w;c.height=d.h;
    const ctx=c.getContext('2d');if(!ctx)throw new Error('Canvas is unavailable in this browser.');
    const requested=$('#format').value;
    if(requested==='image/jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,d.w,d.h);}
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';source.draw(ctx,d.w,d.h);
    const blob=await canvasBlob(c,requested,Number($('#quality').value)/100);
    c.width=c.height=1;
    if(blob.type!==requested)throw new Error(`This browser cannot export ${requested.split('/')[1].toUpperCase()}. Choose PNG or JPEG instead. No credit used.`);
    item.width=source.width;item.height=source.height;item.output=blob;item.outputUrl=URL.createObjectURL(blob);item.outWidth=d.w;item.outHeight=d.h;item.mime=blob.type;item.status='done';
  }finally{source.close?.();}
}
async function processQueue(){
  const todo=queue.filter(x=>x.status==='queued'||x.status==='error');
  $('#progress-panel').hidden=false;let success=0,failed=0;
  for(let i=0;i<todo.length;i++){
    if(credits()<1){announce('No local credits left today. Your remaining images are queued for tomorrow.');break;}
    const x=todo[i];x.status='processing';render();
    const pc=Math.round(i/todo.length*100);
    $('#progress-title').textContent=`Optimizing image ${i+1} of ${todo.length}`;
    $('#progress-detail').textContent='Canvas processing runs locally. No image upload is involved.';
    $('#progress-percent').textContent=pc+'%';$('#progress-bar').setAttribute('aria-valuenow',String(pc));$('#progress-bar span').style.width=pc+'%';
    try{await optimize(x);setCredits(credits()-1);success++;}
    catch(e){x.status='error';x.error=String(e.message||'Optimization failed');failed++;}
    render();await new Promise(r=>setTimeout(r,0));
  }
  $('#progress-percent').textContent='100%';$('#progress-bar').setAttribute('aria-valuenow','100');$('#progress-bar span').style.width='100%';
  $('#progress-title').textContent='Batch complete';$('#progress-detail').textContent=`${success} completed · ${failed} failed. Failed images were not charged.`;
  if(success||failed)announce(`${success} optimized · ${failed} failed. ${credits()} local credits left today.`);
}
async function run(){
  if(busy||downloading||!queue.some(x=>x.status==='queued'||x.status==='error'))return;
  if(credits()<1){announce('Your 10 local daily credits are used. They reset at local midnight.');return;}
  busy=true;render();
  try{if(navigator.locks?.request)await navigator.locks.request(CREDIT_KEY,processQueue);else await processQueue();}
  finally{busy=false;render();}
}
function download(x){if(!x.output)return;const a=document.createElement('a');a.href=x.outputUrl;a.download=base(x.file.name)+'-optimized.'+(x.mime==='image/jpeg'?'jpg':x.mime.split('/')[1]);document.body.append(a);a.click();a.remove();}
function settingsChange(e){
  if(e.target.id==='quality')$('#quality-value').textContent=e.target.value;
  if(e.target.id==='format'){
    const m=e.target.value;$('#format-note').textContent=m==='image/jpeg'?'JPEG replaces transparent pixels with white. PNG preserves transparency.':m==='image/png'?'PNG is lossless; quality setting does not affect PNG size.':'WebP often gives a good size-to-quality balance. Availability depends on your browser.';
    $('#quality').disabled=m==='image/png';
  }
  if(['width','height'].includes(e.target.id))$('#preset').value='custom';
  if(e.target.id==='preset'&&e.target.value!=='custom'){$('#width').value='';$('#height').value='';}
}
input.addEventListener('change',e=>{addFiles(e.target.files);e.target.value='';});
['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag-active');}));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag-active');if(ev==='drop')addFiles(e.dataTransfer.files);}));
drop.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target===drop){e.preventDefault();input.click();}});
processBtn.addEventListener('click',run);
clearBtn.addEventListener('click',()=>{if(busy||downloading)return;queue.forEach(revoke);queue=[];$('#progress-panel').hidden=true;render();});
$('#lock').addEventListener('click',e=>{lockRatio=!lockRatio;e.currentTarget.setAttribute('aria-pressed',String(lockRatio));announce(lockRatio?'Aspect ratio locked. Dimensions fit inside your target; no crop.':'Aspect ratio unlocked. Custom dimensions can stretch the image.');});
document.querySelector('.settings').addEventListener('input',settingsChange);
document.querySelector('.settings').addEventListener('change',settingsChange);
grid.addEventListener('click',e=>{
  if(busy||downloading)return;
  const b=e.target.closest('button');if(!b)return;const x=queue.find(i=>i.id===Number(b.closest('.result-card').dataset.id));if(!x)return;
  if(b.dataset.action==='retry'){x.status='queued';x.error='';run();}
  if(b.dataset.action==='download')download(x);
  if(b.dataset.action==='remove'){revoke(x);queue=queue.filter(i=>i!==x);render();}
});
allBtn.addEventListener('click',async()=>{
  if(busy||downloading)return;downloading=true;const done=queue.filter(x=>x.status==='done');render();
  for(const x of done){download(x);await new Promise(r=>setTimeout(r,250));}
  downloading=false;render();announce(`${done.length} individual downloads requested. Your browser may ask to allow multiple downloads.`);
});
window.addEventListener('storage',e=>{if(e.key===CREDIT_KEY)render();});
setInterval(()=>{if(!busy&&Number($('#credits').textContent)!==credits())render();},60000);
setCredits(credits());render();
if(!storageAvailable)announce('Browser storage is unavailable. Credits are tracked only for this open page.');
})();
