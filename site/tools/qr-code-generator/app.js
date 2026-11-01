(() => {
'use strict';
const $ = s => document.querySelector(s);
const typeButtons = [...document.querySelectorAll('.type-tabs button')];
const CREDIT_KEY = 'afterhours:daily-credits', MAX = 1800, QUIET = 4;
let current = null, busy = false, toastTimer, memoryCredits = null, storageAvailable = true;
const nowDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function credits() {
  let x = memoryCredits;
  if (storageAvailable) { try { x = JSON.parse(localStorage.getItem(CREDIT_KEY) || 'null'); } catch { storageAvailable = false; } }
  return x?.day === nowDay() && Number.isInteger(x.remaining) ? Math.max(0, Math.min(10,x.remaining)) : 10;
}
function setCredits(n) {
  memoryCredits = { day: nowDay(), remaining: n };
  try { localStorage.setItem(CREDIT_KEY, JSON.stringify(memoryCredits)); } catch { storageAvailable = false; }
  $('#credits').textContent = n;
  $('#storage-note').hidden = storageAvailable;
}
function announce(s) { const t=$('#toast'); t.textContent=s; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),6000); }
function status(label,msg,mark='○') { $('#status-label').textContent=label; $('#status').textContent=msg; $('#status-mark').textContent=mark; }
function escWifi(v) { return String(v).replace(/([\\;,:\"])/g,'\\$1'); }
function payload() {
  const active=document.querySelector('.type-tabs button.active')?.dataset.type || 'url';
  if(active==='url') {
    const raw=$('#url').value.trim(); if(!raw) throw Error('Enter a URL.');
    let u; try { u=new URL(raw); } catch { throw Error('Enter a complete valid URL.'); }
    if(!/^https?:$/.test(u.protocol)) throw Error('URL must start with http:// or https://.');
    if(raw.length>1600) throw Error('This URL is too long for this practical QR limit.');
    return raw;
  }
  if(active==='wifi') {
    const s=$('#ssid').value,p=$('#password').value,sec=$('#security').value;
    if(!s) throw Error('Enter a Wi-Fi network name.');
    if(s.length>128 || p.length>128) throw Error('SSID and password must be 128 characters or fewer.');
    if(sec!=='nopass' && !p) throw Error('Enter the network password, or choose No password.');
    return `WIFI:T:${sec};S:${escWifi(s)};P:${sec==='nopass'?'':escWifi(p)};H:${$('#hidden').checked?'true':'false'};;`;
  }
  const t=$('#text').value;
  if(!t) throw Error('Enter some text.');
  if(t.length>MAX) throw Error('Text is limited to 1,800 characters.');
  return t;
}
function luminance(x) {
  const f=v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
  return .2126*f(parseInt(x.slice(1,3),16))+.7152*f(parseInt(x.slice(3,5),16))+.0722*f(parseInt(x.slice(5,7),16));
}
function ratio(a,b) { const x=luminance(a),y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
function printWidth() { return Math.max(20,Math.min(250,Number($('#width').value)||50)); }
function checks(q) {
  const modules=q.getModuleCount(), mm=printWidth()/(modules+QUIET*2);
  const cr=ratio(current.ink,current.paper), normal=luminance(current.ink)<luminance(current.paper), contrast=cr>=4.5&&normal;
  $('#quiet-check').textContent='4 MODULES · PASS'; $('#quiet-check').className='pass';
  $('#contrast-check').textContent=`${cr.toFixed(1)}:1 ${!normal?'INVERTED':contrast?'PASS':'LOW'}`;
  $('#contrast-check').className=contrast?'pass':'warn';
  $('#module-check').textContent=`${mm.toFixed(2)} mm ${mm>=.4?'ADVISORY OK':'ADVISORY LOW'}`;
  $('#module-check').className=mm>=.4?'pass':'warn';
  $('#print-advice').textContent=mm>=.4&&contrast ? 'Screen checks pass at the selected full QR width, including its quiet zone. Test a physical print on your intended devices; printers, paper and scaling can change results.' : 'Use dark ink on light paper, stronger contrast, or a larger print width. These are advisory heuristics, not a scan guarantee. Test a physical print on your intended devices.';
  document.documentElement.style.setProperty('--qr-print-width',printWidth()+'mm');
}
function render(q) {
  const c=$('#qr-canvas'),ctx=c.getContext('2d'),n=q.getModuleCount(),total=n+QUIET*2,scale=Math.max(4,Math.floor(1200/total));
  c.width=c.height=total*scale;
  ctx.fillStyle=current.paper;ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=current.ink;
  let paths=[];
  for(let r=0;r<n;r++)for(let col=0;col<n;col++)if(q.isDark(r,col)) {
    ctx.fillRect((col+QUIET)*scale,(r+QUIET)*scale,scale,scale);
    paths.push(`M${col+QUIET} ${r+QUIET}h1v1h-1z`);
  }
  current.total=total;current.path=paths.join('');
  c.classList.add('ready');$('#empty-state').hidden=true;checks(q);
}
function svg() {
  const {total,path,ink,paper}=current,mm=printWidth();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${mm}mm" height="${mm}mm" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><title>Verified static QR code</title><rect width="${total}" height="${total}" fill="${paper}"/><path d="${path}" fill="${ink}"/></svg>`;
}
function verify(original) {
  const c=$('#qr-canvas'),ctx=c.getContext('2d'),d=ctx.getImageData(0,0,c.width,c.height);
  const decoded=window.jsQR(d.data,d.width,d.height,{inversionAttempts:'attemptBoth'});
  const originalBytes=new TextEncoder().encode(original),decodedBytes=decoded?.binaryData;
  const ok=!!decoded, match=ok&&decoded.data===original&&decodedBytes?.length===originalBytes.length&&originalBytes.every((v,i)=>decodedBytes[i]===v);
  $('#decode-check').textContent=ok?'PASS':'FAIL';$('#match-check').textContent=match?'EXACT MATCH':'NO MATCH';
  $('#decode-check').className=ok?'pass':'warn';$('#match-check').className=match?'pass':'warn';
  return {ok,match};
}
function unlock(ok) { ['#download-png','#download-svg','#print'].forEach(s=>$(s).disabled=!ok);$('#result-state').textContent=ok?'VERIFIED':'—'; }
function invalidate() {
  current=null;unlock(false);$('#qr-canvas').classList.remove('ready');$('#empty-state').hidden=false;
  ['#decode-check','#match-check','#quiet-check','#contrast-check','#module-check'].forEach(s=>{$(s).textContent='WAITING';$(s).className='';});
  $('#payload-preview').textContent='';$('#print-advice').textContent='Generate a code to run the local print checks.';
}
function setBusy(value) {
  busy=value;$('#generate').disabled=value;$('#generate').setAttribute('aria-busy',String(value));
  document.querySelectorAll('.settings input,.settings select,.settings textarea,.settings button').forEach(e=>e.disabled=value);
  syncSecurity();
}
async function generate() {
  if(busy)return;
  if(!window.qrcode||!window.jsQR){status('ENGINE ERROR','Local QR libraries could not load. Reload to try again.','!');return;}
  let data;
  try {data=payload();} catch(e) {invalidate();status('CHECK INPUT',e.message,'!');announce(e.message);return;}
  const ecc=$('#ecc').value,ink=$('#ink').value,paper=$('#paper').value;
  setBusy(true);invalidate();status('ENCODING','Building and independently decoding the QR locally…','…');
  const operation=async()=>{
    if(credits()<1)throw Error('Your 10 local daily credits are used; they reset at local midnight.');
    window.qrcode.stringToBytes=window.qrcode.stringToBytesFuncs['UTF-8'];
    const q=window.qrcode(0,ecc);q.addData(data,'Byte');
    try {q.make();} catch {throw Error('Payload exceeds this error-correction level. Shorten it or choose a lower level.');}
    current={payload:data,q,ink,paper};render(q);
    const result=verify(data);
    if(!result.ok||!result.match)throw Error(result.ok?'Rendered QR decoded, but did not match the original payload exactly.':'The rendered QR could not be decoded locally. Try dark ink on light paper.');
    // Charge only after the exact rendered output has been decoded and compared.
    setCredits(credits()-1);$('#payload-preview').textContent=data;unlock(true);
    status('VERIFIED','Canvas decoded and matched the original UTF-8 payload exactly.','✓');
    announce(`Verified locally. 1 credit used; ${credits()} remain today.`);
  };
  try {if(navigator.locks?.request)await navigator.locks.request(CREDIT_KEY,operation);else await operation();}
  catch(e) {current=null;unlock(false);$('#result-state').textContent='FAILED';status('VERIFY FAILED',`${e.message||'Generation failed.'} No credit used.`,'!');announce(`${e.message||'Generation failed.'} No credit used.`);}
  finally {setBusy(false);$('#credits').textContent=credits();}
}
function downloadBlob(blob,name) {
  if(!blob){announce('Download could not be created. Try again. No credit used.');return;}
  const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function syncSecurity() {$('#password').disabled=busy||$('#security').value==='nopass';}
typeButtons.forEach(b=>b.addEventListener('click',()=>{
  if(busy)return;
  typeButtons.forEach(x=>{x.classList.remove('active');x.setAttribute('aria-selected','false');});
  b.classList.add('active');b.setAttribute('aria-selected','true');
  ['url','wifi','text'].forEach(t=>$('#'+t+'-fields').hidden=t!==b.dataset.type);
  invalidate();status('READY TO ENCODE','Enter a payload to begin.');
}));
$('.type-tabs').addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||busy)return;
  e.preventDefault();const i=typeButtons.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;typeButtons[next].click();typeButtons[next].focus();
});
$('#generate').addEventListener('click',generate);
$('#download-png').addEventListener('click',()=>{if(current&&!busy)$('#qr-canvas').toBlob(b=>downloadBlob(b,'afterhours-qr-verified.png'),'image/png');});
$('#download-svg').addEventListener('click',()=>{if(current&&!busy)downloadBlob(new Blob([svg()],{type:'image/svg+xml'}),'afterhours-qr-verified.svg');});
$('#print').addEventListener('click',()=>{if(current&&!busy)window.print();});
$('#reset').addEventListener('click',()=>{
  if(busy)return;
  ['url','ssid','password','text'].forEach(id=>$('#'+id).value='');$('#security').value='WPA';$('#hidden').checked=false;$('#ecc').value='M';$('#ink').value='#0b1019';$('#paper').value='#f2f4ed';$('#width').value=50;$('#width-value').textContent=50;$('#text-count').textContent=0;syncSecurity();invalidate();status('READY TO ENCODE','Enter a payload to begin.');
});
['url','ssid','password','text','security','hidden','ecc','ink','paper'].forEach(id=>$('#'+id).addEventListener('input',()=>{
  if(id==='text')$('#text-count').textContent=$('#text').value.length;
  if(id==='security')syncSecurity();invalidate();status('READY TO ENCODE','Settings changed. Generate again to verify a fresh output.');
}));
$('#width').addEventListener('input',()=>{$('#width-value').textContent=printWidth();if(current)checks(current.q);});
window.addEventListener('storage',e=>{if(e.key===CREDIT_KEY||e.key===null)$('#credits').textContent=credits();});
setInterval(()=>{if(!busy)$('#credits').textContent=credits();},30000);
setCredits(credits());syncSecurity();
if(!storageAvailable)announce('Browser storage is unavailable. Credits are tracked only for this open page.');
})();
