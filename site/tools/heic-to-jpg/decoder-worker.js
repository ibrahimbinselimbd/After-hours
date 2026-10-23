/* Dedicated one-photo worker; engine pinned to heic-to 1.6.6 / libheif. */
importScripts('./vendor/heic-engine-1.6.6.js');
const progress=(stage,value)=>self.postMessage({stage,progress:value});
self.onmessage=async({data})=>{
 let images,decoder,lib;
 try{
  const {file}=data;const quality=Math.max(.4,Math.min(1,Number(data.quality)||.85));
  const maxPixels=Math.min(20000000,Number(data.maxPixels)||16000000);
  const edge=Math.max(0,Math.min(8192,Number(data.maxEdge)||0));
  progress('Reading container',.08);
  const bytes=await file.arrayBuffer();if(bytes.byteLength<12)throw Error('This file is too small to contain a HEIC image.');
  lib=await self.HeicEngine.getLibheif();decoder=new lib.HeifDecoder();images=decoder.decode(bytes);
  if(!images?.length)throw Error('No supported HEIC still image found. The file may be damaged or use an unsupported codec.');
  const image=images.find(x=>typeof x.is_primary==='function'&&x.is_primary())||images[0],sourceWidth=image.get_width(),sourceHeight=image.get_height();
  if(!Number.isSafeInteger(sourceWidth)||!Number.isSafeInteger(sourceHeight)||sourceWidth<1||sourceHeight<1)throw Error('Invalid image dimensions.');
  if(sourceWidth*sourceHeight>maxPixels||Math.max(sourceWidth,sourceHeight)>12000)throw Error(`Source photo exceeds this device’s ${maxPixels/1000000} MP safety limit. Try a smaller original${maxPixels<20000000?' or a desktop':''}.`);
  progress('Decoding pixels',.3);
  const rgba=new ImageData(sourceWidth,sourceHeight);
  const pixels=await new Promise((resolve,reject)=>image.display(rgba,result=>result?resolve(result):reject(Error('Pixel decoding failed. Try another HEIC export.'))));
  progress('Rendering JPG',.7);
  const source=new OffscreenCanvas(sourceWidth,sourceHeight);source.getContext('2d').putImageData(pixels,0,0);
  const ratio=edge?Math.min(1,edge/Math.max(sourceWidth,sourceHeight)):1;
  const width=Math.max(1,Math.round(sourceWidth*ratio)),height=Math.max(1,Math.round(sourceHeight*ratio));
  const out=new OffscreenCanvas(width,height),ctx=out.getContext('2d',{alpha:false});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,width,height);source.width=source.height=1;
  const blob=await out.convertToBlob({type:'image/jpeg',quality});out.width=out.height=1;
  if(!blob||blob.type!=='image/jpeg'||blob.size<100)throw Error('JPEG encoding failed.');
  progress('Checking output',.92);self.postMessage({done:true,blob,width,height,sourceWidth,sourceHeight});
 }catch(e){self.postMessage({error:e?.message||'Conversion failed on this device.'});}
 finally{if(images)for(const image of images){try{image.free()}catch{}}if(decoder?.decoder&&lib){try{lib.heif_context_free(decoder.decoder)}catch{}}}
};
