import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {networkTools} from '../site/tools/_shared/network-tools/definitions.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const site=path.join(root,'site');
const routeRoot=path.join(site,'tools');
const previewRoot=path.join(routeRoot,'_shared','previews');
const catalogOut=path.join(routeRoot,'_shared','network-tools-catalog-data.js');
const siteUrl='https://ibrahimbinselimbd.github.io/After-hours/';
const categoryTitle={'developer-utilities':'Network & Developer Utilities','web-seo':'Web, Network & SEO','privacy-security':'Privacy & Security'};
const icons={'privacy-security':'◈','developer-utilities':'⌘','web-seo':'◇'};
const jsonSafe=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

if(networkTools.length!==50)throw new Error(`Expected exactly 50 network tools, got ${networkTools.length}.`);
const slugs=new Set();const titles=new Set();
for(const tool of networkTools){
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tool.slug))throw new Error(`Invalid slug: ${tool.slug}`);
  if(slugs.has(tool.slug)||titles.has(tool.title))throw new Error(`Duplicate network route/title: ${tool.slug}`);
  if(!categoryTitle[tool.categoryId])throw new Error(`Unknown category ${tool.categoryId} for ${tool.slug}`);
  if(!tool.description||tool.description.length<45)throw new Error(`Short description: ${tool.slug}`);
  if(!['local','remote','same-origin'].includes(tool.mode))throw new Error(`Unknown request mode: ${tool.mode}`);
  slugs.add(tool.slug);titles.add(tool.title);
}
const engineSource=await fs.readFile(path.join(routeRoot,'_shared','network-tools','engine.js'),'utf8');
const engineWindow={};
vm.runInNewContext(engineSource,{window:engineWindow,console,URL,URLSearchParams,AbortController,performance:{now:()=>0},setTimeout,clearTimeout},{timeout:5000});
for(const tool of networkTools)if(typeof engineWindow.AHNetworkTools?.[tool.handler]!=='function')throw new Error(`Missing handler for ${tool.slug}: ${tool.handler}`);

// Evaluate the base Hub catalogue with optional additions disabled to confirm a non-destructive +50 change.
const hubWindow={AHPlannerTools:[],AHNewToolCatalog:{categories:[]},AHNetworkToolCatalog:{tools:[]}};
const hubSandbox={window:hubWindow,document:{querySelector:()=>null,querySelectorAll:()=>[]},console};
for(const dataFile of ['planner-catalog-data.js','new-tools-catalog-data.js']){
  const dataSource=await fs.readFile(path.join(routeRoot,'_shared',dataFile),'utf8');
  vm.runInNewContext(dataSource,hubSandbox,{timeout:5000});
}
let catalogSource=await fs.readFile(path.join(routeRoot,'catalog.js'),'utf8');
catalogSource=catalogSource.replace('const search=document.querySelector','#window__catalog_export#\nconst search=document.querySelector');
catalogSource=catalogSource.replace('#window__catalog_export#','window.__categories=categories;');
vm.runInNewContext(catalogSource,hubSandbox,{timeout:5000});
const existing=hubWindow.__categories?.flatMap(category=>category.availableTools)||[];
if(existing.length!==500)throw new Error(`Pre-edit hub should have 500 active tools; found ${existing.length}.`);
const additionsByCategory=new Map();
for(const tool of networkTools)additionsByCategory.set(tool.categoryId,(additionsByCategory.get(tool.categoryId)||0)+1);
const categoryCounts=new Map((hubWindow.__categories||[]).map(category=>[category.id,category.availableTools.length+(additionsByCategory.get(category.id)||0)]));
const existingSlugs=new Set(existing.map(item=>item.href));
const existingTitles=new Set(existing.map(item=>item.title));
for(const tool of networkTools){const href=`/tools/${tool.slug}/`;if(existingSlugs.has(href))throw new Error(`Route already exists: ${href}`);if(existingTitles.has(tool.title))throw new Error(`Tool title already exists: ${tool.title}`);}

const catalogTools=networkTools.map((tool,index)=>({slug:tool.slug,title:tool.title,description:tool.description,categoryId:tool.categoryId,href:`/tools/${tool.slug}/`,icon:icons[tool.categoryId],index:501+index}));
await fs.writeFile(catalogOut,`window.AHNetworkToolCatalog = ${jsonSafe({tools:catalogTools})};\n`);
const source={
  ipify:{label:'ipify public IP API',url:'https://www.ipify.org/'},
  ipwho:{label:'IPWho.is API documentation',url:'https://ipwhois.io/documentation'},
  cloudflare:{label:'Cloudflare DNS-over-HTTPS documentation',url:'https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/'},
  google:{label:'Google Public DNS JSON API documentation',url:'https://developers.google.com/speed/public-dns/docs/doh/json'},
  nullMx:{label:'RFC 7505: Null MX',url:'https://www.rfc-editor.org/rfc/rfc7505'},
  iana4:{label:'IANA IPv4 special-purpose registry',url:'https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml'},
  iana6:{label:'IANA IPv6 special-purpose registry',url:'https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml'},
  networkInfo:{label:'MDN Network Information API reference',url:'https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation'},
  webRtc:{label:'WebRTC ICE/STUN overview',url:'https://webrtc.org/getting-started/peer-connections'},
  icePrivacy:{label:'MDN ICE-candidate IP privacy notes',url:'https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidate/address'},
  speed:{label:'ByteAfter fixed 256 KiB speed-test asset',url:`${siteUrl}tools/_shared/network-tools/payload-256k.bin`},
};
const compareDns=new Set(['my-dns-resolver-check','dns-propagation-comparison','dns-resolver-latency-check','dns-answer-consistency-check','doh-query-url-builder']);
function sourcesFor(tool){
  if(tool.slug==='mx-priority-target-checker')return [source.cloudflare,source.nullMx];
  if(tool.slug==='ip-special-use-checker')return [source.iana4,source.iana6];
  if(tool.slug==='browser-network-profile')return [source.networkInfo];
  if(tool.slug==='vpn-webrtc-leak-check')return [source.ipify,source.webRtc,source.icePrivacy];
  if(tool.slug==='download-speed-sample')return [source.speed];
  if(tool.slug==='ip-geolocation-lookup'||tool.slug==='isp-asn-lookup')return [source.ipwho];
  if(['what-is-my-ip','ipv4-connectivity-check','ipv6-connectivity-check','public-ip-change-tracker'].includes(tool.slug))return [source.ipify];
  if(compareDns.has(tool.slug))return [source.cloudflare,source.google];
  if(tool.mode==='remote'&&(tool.slug.startsWith('dns-')||tool.slug.startsWith('email-')||tool.slug.startsWith('spf-')||tool.slug.startsWith('mx-')||tool.slug==='my-dns-resolver-check'))return [source.cloudflare];
  return [];
}
const contentSecurity=`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://api.ipify.org https://api4.ipify.org https://api6.ipify.org https://api64.ipify.org https://ipwho.is https://cloudflare-dns.com https://dns.google stun:; object-src 'none'; base-uri 'none'; form-action 'none'`;
const fieldMarkup=fields=>fields.length?fields.map(field=>{
  const label=escapeHtml(field.label||field.id);
  const id=`static-${field.id}`;
  const help=field.help?`<small class="hint">${escapeHtml(field.help)}</small>`:'';
  if(field.type==='checkbox')return `<label class="check-row"><input id="${id}" type="checkbox" disabled><span>${label}</span>${help}</label>`;
  if(field.type==='textarea')return `<label class="field" for="${id}"><span>${label}</span><textarea id="${id}" rows="${Math.max(3,Math.min(10,Number(field.rows)||5))}" placeholder="${escapeHtml(field.placeholder||'')}" disabled>${escapeHtml(field.default||'')}</textarea>${help}</label>`;
  if(field.type==='select'){const options=(field.options||[]).map(option=>`<option value="${escapeHtml(option)}"${option===field.default?' selected':''}>${escapeHtml(option)}</option>`).join('');return `<label class="field" for="${id}"><span>${label}</span><select id="${id}" disabled>${options}</select>${help}</label>`;}
  return `<label class="field" for="${id}"><span>${label}</span><input id="${id}" type="text" placeholder="${escapeHtml(field.placeholder||'')}" value="${escapeHtml(field.default||'')}" disabled>${help}</label>`;
}).join(''):'<p class="privacy-note">No input is needed. Enable JavaScript, then press Run to start the check.</p>';

for(let i=0;i<networkTools.length;i++){
  const tool=networkTools[i];
  const folder=path.join(routeRoot,tool.slug);
  await fs.mkdir(folder,{recursive:true});
  const pageUrl=`${siteUrl}tools/${tool.slug}/`;
  const pageTitle=`${tool.title} | ByteAfter`;
  const pageSources=sourcesFor(tool);
  const sourceConfig=pageSources.map(item=>({label:item.label,url:item.url}));
  let disclosure;
  if(tool.mode==='remote'&&(tool.slug==='ip-geolocation-lookup'||tool.slug==='isp-asn-lookup'))disclosure='DIRECT REQUEST — This lookup sends the IP you enter, or the address visible to the request, to IPWho.is. Its free CORS endpoint allows 1,000 requests per day per site domain, shared across visitors; location accuracy is standard and the provider offers no SLA.';
  if(tool.slug==='vpn-webrtc-leak-check')disclosure='DIRECT REQUEST — This check contacts ipify and, after you confirm the checkbox, Google’s public STUN service. These services can see your public network address. No request is relayed through ByteAfter servers; VPN/proxy classification is not provided.';
  if(tool.mode==='same-origin')disclosure='SAME-SITE TRANSFER — This sample fetches a fixed static file from this site after you press Run. The site host may receive ordinary connection metadata; no file or test data from you is uploaded.';
  const config={slug:tool.slug,handler:tool.handler,title:tool.title,description:tool.description,mode:tool.mode,fields:tool.fields,sources:sourceConfig,disclosure,instructions:tool.mode==='remote'?'Review the provider and observation time in the result; public resolvers and IP databases may be rate-limited or temporarily unavailable.':tool.mode==='same-origin'?'This sample transfers a fixed 256 KiB static file from this site. It is not a full broadband speed test.':'Validate the input and review the displayed assumptions before relying on a result.',sourcesNote:tool.mode==='remote'?'Result provenance and observation time are shown below. Public services may apply rate limits.':tool.mode==='same-origin'?'This estimate measures one same-origin HTTPS transfer and may vary with browser, CDN, device and network conditions.':'The result identifies its basis; entered values are processed locally in this browser.'};
  if(tool.mode==='same-origin')config.runLabel='Measure download sample ↗';
  const schema={'@context':'https://schema.org','@graph':[
    {'@type':'WebPage','@id':`${pageUrl}#webpage`,url:pageUrl,name:pageTitle,description:tool.description,inLanguage:'en',mainEntity:{'@id':`${pageUrl}#application`},isPartOf:{'@type':'WebSite',name:'ByteAfter',url:siteUrl}},
    {'@type':'WebApplication','@id':`${pageUrl}#application`,name:pageTitle,url:pageUrl,description:tool.description,applicationCategory:'UtilitiesApplication',operatingSystem:'Any modern web browser',offers:{'@type':'Offer',price:'0',priceCurrency:'USD'}}
  ]};
  const index=501+i;
  const sourceLinks=pageSources.map(item=>`<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a>`).join(' · ');
  const direct=tool.mode==='remote';
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#080b12"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(contentSecurity)}"><link rel="stylesheet" href="/tools/_shared/toolkit.css"><link rel="stylesheet" href="/tools/_shared/network-tools/network-tools.css"><script defer src="/tools/_shared/toolkit.js"></script><script defer src="/tools/_shared/network-tools/engine.js"></script><script defer src="/tools/_shared/network-tools/runtime.js"></script><script defer src="/tools/${tool.slug}/app.js"></script><title>${escapeHtml(pageTitle)}</title><meta name="description" content="${escapeHtml(tool.description)}"><meta name="robots" content="index,follow"><link rel="canonical" href="${escapeHtml(pageUrl)}"><meta property="og:site_name" content="ByteAfter"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(pageTitle)}"><meta property="og:description" content="${escapeHtml(tool.description)}"><meta property="og:url" content="${escapeHtml(pageUrl)}"><meta property="og:locale" content="en_US"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(pageTitle)}"><meta name="twitter:description" content="${escapeHtml(tool.description)}"><script type="application/ld+json">${jsonSafe(schema)}</script><script type="application/json" id="new-tool-config">${jsonSafe(config)}</script></head><body data-title="${escapeHtml(tool.title)}" data-category="${escapeHtml(categoryTitle[tool.categoryId])}" data-index="${index}" data-description="${escapeHtml(tool.description)}" data-slug="${tool.slug}" data-request-mode="${tool.mode}"><div id="tool-shell"></div><noscript><main><h1>${escapeHtml(tool.title)}</h1><p>${escapeHtml(tool.description)}</p><p>${direct?'The live query is not sent unless JavaScript is enabled and you press Run. The named public service may receive your IP address and query; requests do not pass through ByteAfter servers.':tool.mode==='same-origin'?'This sample fetches a fixed file from this site only after Run; the site host may receive ordinary connection metadata.':'This browser-only calculation requires JavaScript; entered data is not sent to a network service.'}</p><div class="field-grid">${fieldMarkup(tool.fields)}</div><p>Sources and limits: ${sourceLinks||'Browser-side calculation from entered values.'}</p><p>All tools are free. Existing shared daily credit limit: 10 successful actions. Failed actions use no credit.</p></main></noscript></body></html>`;
  await fs.writeFile(path.join(folder,'index.html'),html);
  await fs.writeFile(path.join(folder,'app.js'),`(() => {\n  'use strict';\n  if (!window.AHToolkit || !window.AHNetworkTools || !document.getElementById('tool-content')) {\n    throw new Error('Network tool dependencies did not initialize.');\n  }\n})();\n`);
}

// Keep the Hub's initial HTML and structured data aligned with the expanded catalogue.
const hubPath=path.join(routeRoot,'index.html');
let hub=await fs.readFile(hubPath,'utf8');
if(!hub.includes('/tools/_shared/network-tools-catalog-data.js')){
  const anchor='<script defer src="/tools/catalog.js';
  if(!hub.includes(anchor))throw new Error('Could not add network catalog script before catalog.js.');
  hub=hub.replace(anchor,'<script defer src="/tools/_shared/network-tools-catalog-data.js"></script>'+anchor);
}
hub=hub.replaceAll('A home for 500 active browser tools across 20 useful categories.','A home for 550 free browser and network tools across 20 useful categories.');
hub=hub.replaceAll('Explore 500 free browser-local tools','Explore 550 free browser-local and network tools');
hub=hub.replaceAll('500 free browser-local tools','550 free browser-local and network tools');
hub=hub.replaceAll('with no paid APIs or live-data claims','with most tools running locally and selected network checks querying named public services directly');
hub=hub.replaceAll('no paid APIs or live-data claims','most tools run locally; selected network checks query named free public services directly');
hub=hub.replaceAll('no paid APIs or live lookups are required','no paid APIs are used; selected network checks make direct free public lookups');
hub=hub.replaceAll('Web &amp; SEO','Web, Network &amp; SEO');
hub=hub.replace(/(?:Network &amp; )*Developer Utilities/g,'Network &amp; Developer Utilities');
hub=hub.replaceAll('500 active ByteAfter browser tools','550 active ByteAfter free tools');
for(const [categoryId,count] of categoryCounts){
  if(!additionsByCategory.has(categoryId))continue;
  const cardPattern=new RegExp(`<button class="category"[^>]*data-category="${categoryId}"[^>]*>[\\s\\S]*?<\\/button>`);
  const card=hub.match(cardPattern)?.[0];
  if(!card)throw new Error(`Missing static category card: ${categoryId}`);
  const updated=card.replace(/aria-label="([^"]*) — \d+ available tools"/,`aria-label="$1 — ${count} available tools"`).replace(/<span class="planned">\d+ TOOLS AVAILABLE<\/span>/,`<span class="planned">${count} TOOLS AVAILABLE</span>`).replace(/<span>\d+ TOOLS READY<\/span>/,`<span>${count} TOOLS READY</span>`);
  hub=hub.replace(card,updated);
}
const schemaPattern=/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i;
const schemaMatch=hub.match(schemaPattern);
if(!schemaMatch)throw new Error('Tools Hub JSON-LD was not found.');
const graph=JSON.parse(schemaMatch[1]);
const collection=graph['@graph']?.find(item=>item['@type']==='CollectionPage');
const list=graph['@graph']?.find(item=>item['@type']==='ItemList');
if(!collection||!list)throw new Error('Tools Hub structured collection/list is incomplete.');
const hubDescription='Explore 550 free browser-local and network tools across 20 categories. Most tools run on this device; selected network checks query named public services directly from your browser after you run them.';
collection.description=hubDescription;
list.name='550 active ByteAfter free tools';list.numberOfItems=550;
list.itemListElement=Array.isArray(list.itemListElement)?list.itemListElement:[];
const listed=new Set(list.itemListElement.map(item=>item.url));
for(const [i,tool] of networkTools.entries()){
  const url=`${siteUrl}tools/${tool.slug}/`;
  if(!listed.has(url))list.itemListElement.push({'@type':'ListItem',position:501+i,name:tool.title,url});
}
hub=hub.replace(schemaPattern,`<script type="application/ld+json">${jsonSafe(graph)}</script>`);
hub=hub.replaceAll('Explore 550 free browser-local tools across 20 useful categories for everyday work and life. Process your inputs on this device; no paid APIs or live lookups are required.',hubDescription);
hub=hub.replaceAll('Explore 550 free browser-local tools across 20 useful categories. Use practical local utilities for everyday work and life.',hubDescription);
hub=hub.replaceAll('Browse 550 free browser-local tools across 20 categories for everyday work, home, travel, learning and more.',hubDescription);
hub=hub.replaceAll('550 free browser-local tools across 20 useful categories','550 free browser-local and network tools across 20 useful categories');
await fs.writeFile(hubPath,hub);

// This incompressible static payload makes the byte count a more honest approximation of the transfer.
const payload=path.join(routeRoot,'_shared','network-tools','payload-256k.bin');
try { const stats=await fs.stat(payload);if(stats.size!==256*1024)throw new Error('Existing speed-test payload has the wrong size.'); }
catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(payload,randomBytes(256*1024));}
await fs.mkdir(previewRoot,{recursive:true});
console.log(`Generated ${networkTools.length} network tool pages, updated the 550-item Hub, and wrote ${catalogOut}.`);
