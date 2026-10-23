'use strict';
(()=>{
const $=s=>document.querySelector(s), MiB=1024*1024, KEY='afterhours-heic-credits-v1';
const mobile=matchMedia('(max-width:700px)').matches||navigator.deviceMemory<=4;
const MAX_PIXELS=mobile?16000000:20000000, ZIP_CAP=(mobile?50:100)*MiB, OUTPUT_CAP=(mobile?80:160)*MiB;
let queue=[],serial=0,running=false,paused=false,zipBusy=false,active=null,addChain=Promise.resolve(),db=null,storageOK=true,memory=null,toastTimer;
const date=()=>{const d=new Date();return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`};
const fresh=()=>({day:date(),used:0});
const normalize=v=>v&&v.day===date()&&Number.isInteger(v.used)&&v.used>=0&&v.used<=10?v:fresh();
function tell(text){$('#status').textContent=text;$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),5000)}
function notice(text){$('#message').hidden=!text;$('#message').textContent=text||''}
function bytes(n){return n<MiB?`${(n/1024).toFixed(0)} KB`:`${(n/MiB).toFixed(1)} MB`}
async function openStore(){try{db=await new Promise((resolve,reject)=>{const r=indexedDB.open(KEY,1);r.onupgradeneeded=()=>r.result.createObjectStore('credits');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Storage blocked'))});db.onversionchange=()=>{db.close();db=null;fallback()};}catch{fallback()}}
function fallback(){storageOK=false;memory=memory||fresh();$('#storage-note').hidden=false}
async function credit(spend=false){
 if(!storageOK||!db){memory=normalize(memory);if(spend&&memory.used<10){memory.used++;return true}return spend?false:10-memory.used}
 return new Promise((resolve,reject)=>{
  let tx;try{tx=db.transaction('credits','readwrite');const store=tx.objectStore('credits'),r=store.get('today');let result;
  r.onsuccess=()=>{const v=normalize(r.result);result=spend?v.used<10:10-v.used;if(spend&&result)v.used++;store.put(v,'today')};
  tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage transaction aborted'));}catch(e){reject(e)}
 }).catch(()=>{fallback();return credit(spend)});
}
async function updateCredits(){const n=await credit();$('#credits').textContent=n;return n}
function safeName(name){let b=name.normalize('NFC').replace(/\.(heic|heif)$/i,'').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'_').replace(/^[.\s]+|[.\s]+$/g,'').slice(0,100)||'photo';if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(b))b='photo-'+b;const used=new Set(queue.map(x=>x.output.toLowerCase()));let n=b+'.jpg',i=2;while(used.has(n.toLowerCase()))n=`${b}-${i++}.jpg`;return n}
function action(text,kind,id,disabled=false){const b=document.createElement('button');b.type='button';b.className=kind==='remove'?'remove':'button button-quiet';b.textContent=text;b.dataset.action=kind;b.dataset.id=id;b.disabled=disabled;return b}
const empty=$('#queue').innerHTML;
function render(){
 $('#queue-count').textContent=String(queue.length).padStart(2,'0');const done=queue.filter(x=>x.state==='done');$('#done-count').textContent=`${done.length} READY`;$('#zip-count').textContent=done.length;
 $('#convert').disabled=running||zipBusy||!queue.some(x=>x.state==='queued');$('#convert').textContent=paused?'Resume queue ↗':'Convert queue ↗';$('#pause').disabled=!running;$('#pause').textContent=paused?'Pausing…':'Pause';$('#clear').disabled=!queue.length||running||zipBusy;$('#retry-all').disabled=running||zipBusy||!queue.some(x=>x.state==='error');$('#zip').disabled=running||zipBusy||!done.length;
 $('#quality').disabled=running;$('#max-edge').disabled=running;
 if(!queue.length){$('#queue').innerHTML=empty;return}
 const frag=document.createDocumentFragment();
 for(const item of queue){
  const row=document.createElement('article');row.className='file-row '+item.state;row.dataset.id=item.id;
  const thumb=action('HEIC','preview',item.id,item.state!=='done'||zipBusy);thumb.className='file-thumb';thumb.setAttribute('aria-label','Preview '+item.output);
  if(item.thumb){thumb.textContent='';const img=document.createElement('img');img.src=item.thumb;img.alt='';thumb.append(img)}row.append(thumb);
  const main=document.createElement('div');main.className='file-main';const name=document.createElement('h3');name.className='file-name';name.textContent=item.state==='done'?item.output:item.name;main.append(name);
  const meta=document.createElement('div');meta.className='file-meta';meta.textContent=item.state==='done'?`${bytes(item.size)} → ${bytes(item.blob.size)} · ${item.width} × ${item.height} · quality ${item.quality}% · JPG VERIFIED`:`${bytes(item.size)} · ${item.output}`;main.append(meta);
  const state=document.createElement('div');state.className='file-meta file-state '+item.state;state.textContent=item.state==='done'?'✓ Ready to download':item.state==='error'?item.error:item.stage||'Queued · waiting to convert';main.append(state);
  if(item.state==='processing'){const p=document.createElement('progress');p.className='file-progress';p.max=100;p.value=item.progress||0;p.setAttribute('aria-label',`${item.name}: ${item.stage}`);main.append(p)}row.append(main);
  const acts=document.createElement('div');acts.className='file-actions';if(item.state==='done'){acts.append(action('Preview','preview',item.id,zipBusy),action('↓ JPG','download',item.id,zipBusy))}if(item.state==='error')acts.append(action('Retry','retry',item.id,running||zipBusy));
  const remove=action(item.state==='processing'?'Cancel':'×','remove',item.id,zipBusy||item.committing);remove.setAttribute('aria-label',(item.state==='processing'?'Cancel ':'Remove ')+item.name);acts.append(remove);row.append(acts);frag.append(row);
 }$('#queue').replaceChildren(frag);
}
async function addFiles(files){
 notice('');let skipped=[];
 for(const file of Array.from(files).slice(0,100)){
  if(queue.length>=10){skipped.push('Queue limit: 10 files. Remove a file to add more.');break}
  if(!/\.(heic|heif)$/i.test(file.name)){skipped.push(`${file.name}: choose a .heic or .heif file.`);continue}
  if(!file.size){skipped.push(`${file.name}: empty file.`);continue}
  if(file.size>20*MiB){skipped.push(`${file.name}: exceeds the 20 MB per-file limit.`);continue}
  if(queue.reduce((n,x)=>n+x.size,0)+file.size>80*MiB){skipped.push(`${file.name}: the queue would exceed 80 MB.`);continue}
  if(queue.some(x=>x.name===file.name&&x.size===file.size&&x.modified===file.lastModified)){skipped.push(`${file.name}: already in this queue.`);continue}
  const head=new Uint8Array(await file.slice(0,256).arrayBuffer()),text=new TextDecoder('latin1').decode(head);
  if(text.slice(4,8)!=='ftyp'||!/(heic|heix|hevc|hevx|mif1|msf1|heim|heis)/.test(text.slice(8))){skipped.push(`${file.name}: not a recognized HEIC/HEIF container.`);continue}
  queue.push({id:String(++serial),file,name:file.name,size:file.size,modified:file.lastModified,output:safeName(file.name),state:'queued',progress:0});
 }
 if(files.length>100)skipped.push('Only the first 100 selections were checked.');notice([...new Set(skipped)].slice(0,8).join(' '));render();tell(queue.length?`${queue.length} photo${queue.length===1?'':'s'} in the queue. Settings apply when conversion starts.`:'No supported photos added.');
}
function decode(item){return new Promise((resolve,reject)=>{
 const worker=new Worker('decoder-worker.js');let settled=false;const timer=setTimeout(()=>finish(null,Error('This photo took too long. Try a smaller HEIC or another device.')),90000);
 function finish(result,error){if(settled)return;settled=true;clearTimeout(timer);worker.terminate();active=null;error?reject(error):resolve(result)}
 active={id:item.id,cancel:()=>finish(null,Error('Cancelled. No credit used.'))};
 worker.onmessage=({data})=>{if(data.error)finish(null,Error(data.error));else if(data.done)finish(data);else{item.stage=data.stage;item.progress=Math.round((data.progress||0)*95);render()}};
 worker.onerror=e=>{e.preventDefault();finish(null,Error('The decoder could not start. A browser or hosting security check may have interrupted it. Complete any displayed verification, then refresh or retry. Your file stays on this device.'))};
 worker.postMessage({file:item.file,quality:item.quality/100,maxEdge:item.maxEdge,maxPixels:MAX_PIXELS});
})}
async function verify(result){
 const magic=new Uint8Array(await result.blob.slice(0,3).arrayBuffer());if(magic[0]!==255||magic[1]!==216||magic[2]!==255)throw Error('Output did not pass the JPEG signature check.');
 const bitmap=await createImageBitmap(result.blob);try{if(bitmap.width!==result.width||bitmap.height!==result.height)throw Error('JPEG decode dimensions did not match.');const c=document.createElement('canvas');const ratio=Math.min(1,160/Math.max(bitmap.width,bitmap.height));c.width=Math.max(1,Math.round(bitmap.width*ratio));c.height=Math.max(1,Math.round(bitmap.height*ratio));c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.72));c.width=c.height=1;if(!blob)throw Error('Preview could not be created.');return blob;}finally{bitmap.close()}
}
async function run(){
 if(running||zipBusy)return;if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined'){notice('This browser lacks the local image APIs required by this tool. Try an up-to-date Chrome, Edge, Firefox or Safari. No credit used.');return}
 running=true;paused=false;notice('');render();
 try{const batch=queue.filter(x=>x.state==='queued');for(const item of batch){
  if(paused)break;if(!queue.includes(item)||item.state!=='queued')continue;
  if(await updateCredits()<1){tell('Today’s 10 local credits are used. Queued photos remain for later.');break}
  if(!queue.includes(item))continue;item.state='processing';item.stage='Starting local engine';item.progress=0;item.quality=Number($('#quality').value);item.maxEdge=Number($('#max-edge').value);render();
  try{const result=await decode(item);if(!queue.includes(item))continue;if(queue.reduce((n,x)=>n+(x.blob?.size||0),0)+result.blob.size>OUTPUT_CAP)throw Error('Saved results reached this device’s memory budget. Download and remove completed JPGs, then retry this photo.');item.stage='Verifying JPG';item.progress=95;render();const thumb=await verify(result);if(!queue.includes(item))continue;
   item.committing=true;item.stage='Finalizing verified JPG';render();
   if(!(await credit(true)))throw Error('Another tab used the last local credit. No credit charged here; try after local midnight.');
   Object.assign(item,result);item.thumb=URL.createObjectURL(thumb);item.state='done';item.progress=100;item.file=null;item.error=null;
  }catch(e){if(queue.includes(item)){item.state='error';item.error=(e?.message||'This photo could not be converted.')+' No credit used.';item.progress=0}}
  item.committing=false;await updateCredits();render();
 }}finally{running=false;active=null;render();await updateCredits();if(paused)tell('Paused. The current photo has finished; remaining photos are still queued.');else if(queue.every(x=>x.state!=='queued'))tell(`${queue.filter(x=>x.state==='done').length} JPGs ready. ${queue.filter(x=>x.state==='error').length} failed. Originals are unchanged.`)}
}
function release(item){if(item.thumb)URL.revokeObjectURL(item.thumb);item.blob=null;item.file=null}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
let previewURL=null;
function closePreview(){const dialog=$('#preview-dialog');if(dialog.open)dialog.close();$('#preview-image').removeAttribute('src');if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null}
function preview(item){closePreview();previewURL=URL.createObjectURL(item.blob);$('#preview-image').src=previewURL;$('#preview-name').textContent=item.output;$('#preview-info').textContent=`${item.width} × ${item.height} · ${bytes(item.blob.size)} · JPG verified · Inspect orientation and colors`;
 $('#preview-dialog').showModal();}
async function zip(){
 const done=queue.filter(x=>x.state==='done');if(!done.length||running||zipBusy)return;
 if(done.reduce((n,x)=>n+x.blob.size,0)>ZIP_CAP){notice(`This device’s ZIP safety limit is ${ZIP_CAP/MiB} MB. Download JPGs individually instead.`);return}
 zipBusy=true;render();$('#zip').textContent='Building ZIP…';
 try{const chunks=[];const blob=await new Promise((resolve,reject)=>{try{const zip=new fflate.Zip((error,data,final)=>{if(error){reject(error);return}chunks.push(data);if(final)resolve(new Blob(chunks,{type:'application/zip'}))});(async()=>{for(const item of done){const entry=new fflate.ZipPassThrough(item.output);zip.add(entry);entry.push(new Uint8Array(await item.blob.arrayBuffer()),true)}zip.end()})().catch(reject)}catch(e){reject(e)}});
 download(blob,'afterhours-jpg-batch.zip');tell(`ZIP ready: ${done.length} verified JPGs. No extra credits used.`);
 }catch{notice('ZIP could not be built on this device. Download the JPGs individually; no extra credits used.')}finally{zipBusy=false;$('#zip').innerHTML='↓ Download ZIP <b id="zip-count">0</b>';render()}
}
$('#files').addEventListener('change',e=>{const files=Array.from(e.target.files);e.target.value='';addChain=addChain.then(()=>addFiles(files)).catch(()=>notice('Files could not be read. Please choose them again.'))});
const dz=$('#dropzone');for(const event of ['dragenter','dragover'])dz.addEventListener(event,e=>{e.preventDefault();dz.classList.add('dragover')});for(const event of ['dragleave','drop'])dz.addEventListener(event,e=>{e.preventDefault();dz.classList.remove('dragover')});dz.addEventListener('drop',e=>{const files=Array.from(e.dataTransfer.files);addChain=addChain.then(()=>addFiles(files))});
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
$('#quality').addEventListener('input',()=>$('#quality-value').textContent=$('#quality').value+'%');$('#convert').addEventListener('click',run);$('#pause').addEventListener('click',()=>{paused=true;render();tell('Pausing after the current photo finishes…')});
$('#retry-all').addEventListener('click',()=>{queue.filter(x=>x.state==='error').forEach(x=>{x.state='queued';x.error=null});run()});
$('#clear').addEventListener('click',()=>{if(running||zipBusy)return;closePreview();queue.forEach(release);queue=[];notice('');render();tell('Queue cleared. Downloaded files and originals are unchanged.')});$('#zip').addEventListener('click',zip);
$('#queue').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const item=queue.find(x=>x.id===b.dataset.id);if(!item)return;
 switch(b.dataset.action){case 'remove':if(item.committing)return;if(active?.id===item.id)active.cancel();closePreview();queue=queue.filter(x=>x!==item);release(item);render();break;case 'download':download(item.blob,item.output);tell('JPG download started. No extra credit used.');break;case 'preview':preview(item);break;case 'retry':item.state='queued';item.error=null;run();break}
});
$('#close-preview').addEventListener('click',closePreview);$('#preview-dialog').addEventListener('close',()=>{if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null}$('#preview-image').removeAttribute('src')});
window.addEventListener('focus',updateCredits);document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateCredits()});setInterval(updateCredits,30000);
$('#device-mode').textContent=`${mobile?'Mobile-safe':'Desktop'} mode · ${MAX_PIXELS/1000000} MP source limit · ${ZIP_CAP/MiB} MB ZIP limit.`;
$('#safety-detail').textContent=`Up to 10 queued files, 20 MB each, 80 MB combined. This device has a ${MAX_PIXELS/1000000} MP source limit and a 12,000 px source-edge limit, checked before RGBA rendering (container parsing still uses memory). Output size settings do not bypass source limits. Retained JPGs are capped at ${OUTPUT_CAP/MiB} MB on this device. Download and remove finished results to free space. One worker is released per photo. ZIP limit: ${ZIP_CAP/MiB} MB. For larger results, download individually. Progress shows real processing stages, not measured decode time.`;
openStore().then(updateCredits);render();
})();
