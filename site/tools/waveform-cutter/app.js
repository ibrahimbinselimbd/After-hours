(()=>{
  const root=AHToolkit.mount(`<h2>Cut audio</h2><p>Choose an exact time range and export PCM WAV.</p><label class=drop-zone>Choose audio<input id=f type=file accept=audio/*></label><div class=controls><label>Start seconds<input id=a type=number min=0 step=.01 value=0></label><label>End seconds<input id=b type=number min=0 step=.01 value=0></label></div><button class="button button-main" id=g>Cut and download</button><div id=s class=status role=status hidden></div>`);
  const fileInput=root.querySelector('#f'),status=root.querySelector('#s');
  let audioBuffer=null;
  fileInput.onchange=async()=>{
    const file=fileInput.files[0];
    if(!file){audioBuffer=null;return;}
    try{
      audioBuffer=await new AudioContext().decodeAudioData(await file.arrayBuffer());
      root.querySelector('#b').value=audioBuffer.duration.toFixed(2);
      AHToolkit.status(status,`${audioBuffer.duration.toFixed(2)} seconds ready.`);
    }catch(error){audioBuffer=null;AHToolkit.status(status,error?.message||'Could not decode audio.','error')}
  };
  root.querySelector('#g').onclick=()=>{
    const start=+root.querySelector('#a').value,end=+root.querySelector('#b').value;
    if(!audioBuffer||end<=start||end>audioBuffer.duration)return AHToolkit.status(status,'Choose a valid range.','warn');
    if(!AHToolkit.credits.canRun(status))return;
    const sampleRate=audioBuffer.sampleRate,channels=audioBuffer.numberOfChannels;
    const first=Math.floor(start*sampleRate),last=Math.floor(end*sampleRate);
    const frameCount=last-first;
    if(frameCount<=0)return AHToolkit.status(status,'Choose a valid range.','warn');
    const dataLength=frameCount*2*channels;
    const output=new ArrayBuffer(44+dataLength),view=new DataView(output);
    const write=(offset,text)=>[...text].forEach((char,index)=>view.setUint8(offset+index,char.charCodeAt(0)));
    write(0,'RIFF');view.setUint32(4,36+dataLength,true);write(8,'WAVEfmt ');
    view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);
    view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*channels*2,true);
    view.setUint16(32,channels*2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,dataLength,true);
    let offset=44;
    for(let frame=first;frame<last;frame++)for(let channel=0;channel<channels;channel++){
      const sample=Math.max(-1,Math.min(1,audioBuffer.getChannelData(channel)[frame]));
      view.setInt16(offset,sample<0?sample*32768:sample*32767,true);offset+=2;
    }
    AHToolkit.download(new Blob([output],{type:'audio/wav'}),'cut-audio.wav');
    AHToolkit.credits.charge();AHToolkit.status(status,'Cut audio downloaded.','success');
  };
})();
