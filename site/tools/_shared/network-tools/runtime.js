(() => {
  'use strict';
  const api = window.AHToolkit;
  const host = document.getElementById('tool-content');
  const slug = document.body.dataset.slug || '';
  const configNode = document.getElementById('new-tool-config');
  if (!api || !host || !configNode) {
    if (host) host.textContent = 'This network tool could not be loaded. Return to the Tools Hub and try again.';
    return;
  }
  let config;
  try { config = JSON.parse(configNode.textContent); }
  catch { host.textContent = 'This network tool configuration is invalid. Return to the Tools Hub and try again.'; return; }
  const handler = window.AHNetworkTools?.[config?.handler];
  const networkRequest = config?.mode === 'remote' || config?.mode === 'same-origin';
  if (!config || config.slug !== slug || typeof handler !== 'function' || !Array.isArray(config.fields)) {
    host.textContent = 'This network tool is not configured correctly. Return to the Tools Hub and try again.';
    return;
  }
  const makeField = field => {
    const id = `network-${slug}-${field.id}`;
    const wrapper = document.createElement('label');
    wrapper.className = field.type === 'checkbox' ? 'field network-consent' : 'field';
    if (field.type === 'checkbox') {
      const input = document.createElement('input');
      input.type = 'checkbox'; input.id = id; input.name = field.id;
      input.checked = field.default === true; input.required = Boolean(field.required);
      const text = document.createElement('span'); text.textContent = field.label || field.id;
      wrapper.append(input,text);
      return {wrapper,input,field};
    }
    const label = document.createElement('span'); label.textContent = field.label || field.id;
    wrapper.append(label);
    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea'); input.rows = Math.max(3,Math.min(10,Number(field.rows)||5));
      input.maxLength = 12000; input.spellcheck = false;
    } else if (field.type === 'select') {
      input = document.createElement('select');
      for (const option of field.options || []) {
        const item = document.createElement('option');
        item.value = String(option); item.textContent = String(option); input.append(item);
      }
    } else {
      input = document.createElement('input'); input.type = 'text'; input.maxLength = 2048; input.autocomplete = 'off';
    }
    input.id = id; input.name = field.id;
    if (field.default !== undefined && field.type !== 'select') input.value = String(field.default);
    else if (field.type === 'select' && field.default !== undefined) input.value = String(field.default);
    if (field.placeholder) input.placeholder = field.placeholder;
    input.required = Boolean(field.required);
    wrapper.append(input);
    if (field.help) { const help = document.createElement('small'); help.className='hint'; help.textContent=field.help; wrapper.append(help); }
    return {wrapper,input,field};
  };
  const controls = config.fields.map(makeField);
  const workspace = document.createElement('section'); workspace.className='network-tool-workspace';
  const intro = document.createElement('p'); intro.className='hint'; intro.textContent=[config.description,config.instructions].filter(Boolean).join(' ') || 'Enter the requested values and run this check.';
  const disclosure = document.createElement('p'); disclosure.className='privacy-note';
  disclosure.textContent = config.disclosure || (config.mode === 'same-origin'
    ? 'SAME-SITE TRANSFER — This sample fetches a fixed static file from this site after you press Run. The site host may receive ordinary connection metadata; no file or test data from you is uploaded.'
    : config.mode === 'remote'
      ? 'DIRECT NETWORK REQUEST — This check runs only when you press Run. Your query and public IP may be visible to the named public service. The request goes from this browser directly to that service, not through ByteAfter servers. Avoid confidential query names.'
      : 'RUNS IN THIS BROWSER — This calculation reads the values you enter and does not send them to a network service.');
  const form = document.createElement('div'); form.className='field-grid network-fields';
  for (const control of controls) form.append(control.wrapper);
  const actions = document.createElement('div'); actions.className='actions';
  const run = document.createElement('button'); run.type='button'; run.className='button button-main'; run.textContent=config.runLabel || (networkRequest ? 'Run network check ↗' : 'Run locally ↗');
  const copy = document.createElement('button'); copy.type='button'; copy.className='button'; copy.textContent='Copy result'; copy.disabled=true;
  const download = document.createElement('button'); download.type='button'; download.className='button'; download.textContent='Download result'; download.disabled=true;
  const clear = document.createElement('button'); clear.type='button'; clear.className='button'; clear.textContent='Reset inputs';
  actions.append(run,copy,download,clear);
  const status = document.createElement('div'); status.className='status'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); status.hidden=true;
  const resultBox = document.createElement('section'); resultBox.className='result'; resultBox.hidden=true;
  const heading = document.createElement('h2'); heading.textContent='CHECK RESULT';
  const output = document.createElement('pre'); output.className='output-text'; output.tabIndex=0; output.setAttribute('aria-label','Network tool result');
  resultBox.append(heading,output);
  const sources = document.createElement('p'); sources.className='hint network-sources';
  sources.textContent = config.sourcesNote || (networkRequest ? 'The named endpoint and measurement time are shown in the result.' : 'Source: browser calculation from the values entered.');
  const sourceLinks = document.createElement('div'); sourceLinks.className='network-source-links';
  for (const source of config.sources || []) {
    if (!source || typeof source.url !== 'string' || typeof source.label !== 'string') continue;
    const link = document.createElement('a'); link.href=source.url; link.target='_blank'; link.rel='noopener noreferrer'; link.textContent=source.label;
    sourceLinks.append(link);
  }
  workspace.append(intro,disclosure,form,actions,status,resultBox,sources);
  if (sourceLinks.childElementCount) workspace.append(sourceLinks);
  host.replaceChildren(workspace);
  let currentText='';
  const readValues = () => {
    const values={};
    for (const control of controls) {
      const {field,input}=control;
      const value=field.type==='checkbox'?input.checked:input.value.trim();
      if (field.required && (value === '' || value === false)) throw new Error(`Complete “${field.label || field.id}” before running the tool.`);
      if (typeof value === 'string' && value.length > 12000) throw new Error('Input is too large. The limit is 12,000 characters per field.');
      values[field.id]=value;
    }
    return values;
  };
  run.addEventListener('click',async()=>{
    if (!api.credits.canRun(status)) return;
    let values;
    try { values=readValues(); } catch(error) { api.status(status,error.message,'error'); return; }
    run.disabled=true; api.status(status,networkRequest?'Running a direct browser network check…':'Calculating in this browser…','');
    try {
      const response=await handler(values);
      const text=typeof response==='string'?response:response?.text;
      if (typeof text!=='string'||!text.trim()) throw new Error('No readable result was produced. Check the inputs and try again.');
      if (text.length>120000) throw new Error('The result is too large to display safely.');
      currentText=text; output.textContent=text; resultBox.hidden=false; copy.disabled=false; download.disabled=false;
      if (response?.ok===false) api.status(status,`${text.split('\n')[0]} No credit was used.`, 'error');
      else {
        const charged=api.credits.charge();
        api.status(status,charged?'Completed. One shared daily credit was used.':'Completed, but no credit was deducted because the shared counter changed.',charged?'success':'warn');
      }
    } catch(error) {
      api.status(status,`${error?.message || 'The check could not be completed.'} No credit was used.`, 'error');
    } finally { run.disabled=false; }
  });
  copy.addEventListener('click',async()=>api.status(status,await api.copy(currentText)?'Result copied.':'Copy failed; select the result text manually.', 'success'));
  download.addEventListener('click',()=>api.downloadText(currentText,`${slug}-result.txt`));
  clear.addEventListener('click',()=>{
    for(const {field,input} of controls){if(field.type==='checkbox')input.checked=field.default===true;else if(field.type==='select')input.value=String(field.default??field.options?.[0]??'');else input.value=String(field.default??'');}
    resultBox.hidden=true; output.textContent=''; currentText=''; copy.disabled=true; download.disabled=true;
    api.status(status,'Inputs reset in this browser.','success');
  });
})();
