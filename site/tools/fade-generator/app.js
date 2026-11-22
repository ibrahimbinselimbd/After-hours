(()=>{
  const root=AHToolkit.mount(`<h2>Generate fades</h2><p>Apply linear fades without uploading audio.</p><label class=drop-zone>Choose audio<input id=f type=file accept=audio/*></label><div class=controls><label>Fade in seconds<input id=i type=number min=0 step=.1 value=1></label><label>Fade out seconds<input id=o type=number min=0 step=.1 value=1></label></div><button class="button button-main" id=g>Apply fades</button><div id=s class=status role=status hidden></div>`);
  const fileInput=root.querySelector('#f'),status=root.querySelector('#s');
  root.querySelector('#g').onclick=async()=>{
    const file=fileInput.files[0];
    if(!file)return AHToolkit.status(status,'Choose audio first.','warn');
    if(!AHToolkit.credits.canRun(status))return;
    try{
      const audio=await new AudioContext().decodeAudioData(await file.arrayBuffer());
      const fadeIn=Math.floor(+root.querySelector('#i').value*audio.sampleRate);
      const fadeOut=Math.floor(+root.querySelector('#o').value*audio.sampleRate);
      const channels=audio.numberOfChannels;
      const dataLength=audio.length*2*channels;
      const buffer=new ArrayBuffer(44+dataLength);
      const view=new DataView(buffer);
      const write=(offset,text)=>[...text].forEach((char,index)=>view.setUint8(offset+index,char.charCodeAt(0)));
      write(0,'RIFF');view.setUint32(4,36+dataLength,true);write(8,'WAVEfmt ');
      view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);
      view.setUint32(24,audio.sampleRate,true);view.setUint32(28,audio.sampleRate*channels*2,true);
      view.setUint16(32,channels*2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,dataLength,true);
      let offset=44;
      for(let frame=0;frame<audio.length;frame++)for(let channel=0;channel<channels;channel++){
        const inGain=fadeIn?Math.min(1,frame/fadeIn):1;
        const outGain=fadeOut?Math.min(1,(audio.length-frame)/fadeOut):1;
        const sample=Math.max(-1,Math.min(1,audio.getChannelData(channel)[frame]*Math.min(inGain,outGain)));
        view.setInt16(offset,sample<0?sample*32768:sample*32767,true);offset+=2;
      }
      AHToolkit.download(new Blob([buffer],{type:'audio/wav'}),'faded-audio.wav');
      AHToolkit.credits.charge();AHToolkit.status(status,'Faded audio downloaded.','success');
    }catch(error){AHToolkit.status(status,error?.message||'Could not process audio.','error')}
  };
})();
