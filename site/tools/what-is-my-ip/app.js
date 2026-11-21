(() => {
  'use strict';
  const api = window.AHToolkit;
  const tools = window.AHNetworkTools;
  const host = document.getElementById('tool-content');
  // This provider-backed lookup has no ByteAfter credit cap; suppress the generic local-credit UI on this route.
  document.getElementById('credit-pill')?.remove();
  document.querySelector('.tool-main .workspace > .credit-note')?.remove();
  if (!api || !tools || !host || typeof tools['what-is-my-ip'] !== 'function' || typeof tools['ip-geolocation-lookup'] !== 'function') {
    throw new Error('Network tool dependencies did not initialize.');
  }

  const pageScript = document.currentScript;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('style.css', pageScript?.src || location.href).href;
  document.head.append(stylesheet);

  host.innerHTML = `
    <section class="ba-ip-checker" aria-label="Public IP checker">
      <p class="ba-ip-disclosure"><strong>NETWORK DISCLOSURE — BEFORE REQUEST.</strong> After this notice is visible, this page automatically asks <a href="https://www.ipify.org/" target="_blank" rel="noopener noreferrer">ipify</a> for the public address it sees; ipify necessarily receives that address. ipify says its public endpoint has no request limit, but availability and provider terms can change. If you press the optional details button, the selected address goes directly from your browser to <a href="https://ipwho.is/" target="_blank" rel="noopener noreferrer">IPWho.is</a>; its free CORS quota is 1,000 requests per day shared across traffic from this domain, so lookups may be rate-limited. ByteAfter does not impose a daily credit cap on this tool. Provider logging and retention are not independently verified here; requests do not pass through ByteAfter servers.</p>
      <section class="ba-ip-card" aria-labelledby="ba-ip-current-title">
        <div class="ba-ip-card-head"><h2 class="ba-ip-kicker" id="ba-ip-current-title">01 / Public address seen by ipify</h2><span class="ba-ip-state" id="ba-ip-current-state" aria-live="polite">Starting check</span></div>
        <p class="ba-ip-address" id="ba-ip-primary" data-empty="true">Checking your public IP…</p>
        <p class="ba-ip-meta" id="ba-ip-meta"></p>
        <div class="ba-ip-result" id="ba-ip-current-result" hidden>
          <h3>Endpoint responses</h3><pre id="ba-ip-current-text"></pre>
          <details class="ba-ip-raw"><summary>Show source and observation details</summary><pre id="ba-ip-current-raw"></pre></details>
        </div>
        <div class="ba-ip-actions">
          <button class="ba-ip-button ba-ip-button-primary" id="ba-ip-copy" type="button" disabled>Copy public IP</button>
          <button class="ba-ip-button" id="ba-ip-refresh" type="button">Check again</button>
        </div>
      </section>
      <section class="ba-ip-card" aria-labelledby="ba-ip-lookup-title">
        <div class="ba-ip-card-head"><h2 class="ba-ip-kicker" id="ba-ip-lookup-title">02 / Optional address details</h2><span class="ba-ip-state">User-initiated lookup</span></div>
        <form class="ba-ip-form" id="ba-ip-lookup-form" novalidate>
          <label class="ba-ip-field" for="ba-ip-lookup-input">Different IPv4 or IPv6 address <span class="ba-ip-optional">(optional)</span>
            <input id="ba-ip-lookup-input" name="ip" type="text" inputmode="url" autocomplete="off" spellcheck="false" maxlength="64" placeholder="Leave empty to use the detected address">
          </label>
          <button class="ba-ip-button ba-ip-button-primary" id="ba-ip-lookup-button" type="submit">Look up details</button>
        </form>
        <p class="ba-ip-hint">Leave the field empty to look up the automatically detected public IP. The address used for this lookup is sent to IPWho.is only after you press the button. Location is an approximate database estimate, not GPS.</p>
        <section class="ba-ip-result" id="ba-ip-lookup-result" aria-live="polite" hidden>
          <h3>Lookup result</h3><pre id="ba-ip-lookup-text"></pre>
        </section>
      </section>
      <p class="ba-ip-status" id="ba-ip-status" role="status" aria-live="polite" hidden></p>
    </section>`;

  const currentState = document.getElementById('ba-ip-current-state');
  const primary = document.getElementById('ba-ip-primary');
  const meta = document.getElementById('ba-ip-meta');
  const currentResult = document.getElementById('ba-ip-current-result');
  const currentText = document.getElementById('ba-ip-current-text');
  const currentRaw = document.getElementById('ba-ip-current-raw');
  const copyButton = document.getElementById('ba-ip-copy');
  const refreshButton = document.getElementById('ba-ip-refresh');
  const lookupForm = document.getElementById('ba-ip-lookup-form');
  const lookupInput = document.getElementById('ba-ip-lookup-input');
  const lookupButton = document.getElementById('ba-ip-lookup-button');
  const lookupResult = document.getElementById('ba-ip-lookup-result');
  const lookupText = document.getElementById('ba-ip-lookup-text');
  const status = document.getElementById('ba-ip-status');
  let selectedAddress = '';
  let busy = false;

  const setStatus = (message, kind='') => {
    status.textContent = message;
    status.dataset.kind = kind;
    status.hidden = !message;
  };
  const isFailure = response => typeof response === 'object' && response?.ok === false;
  const responseText = response => typeof response === 'string' ? response : response?.text;
  const withoutCreditSuffix = text => String(text ?? '').replace(/(?:\s*No credit was used\.?)+$/gi, '').trim();
  const safeSourceLinkNote = () => {
    const note = document.querySelector('.workspace > .privacy-note');
    if (note) note.textContent = 'This page automatically requests your public IP from ipify after showing the disclosure above; ipify says its public endpoint has no request limit. Optional IPWho.is lookups happen only when you press the button and share a 1,000/day CORS quota across this domain. ByteAfter applies no daily credit cap to this tool. Provider logging and retention are not independently verified.';
  };
  safeSourceLinkNote();

  function updateButtons(disabled) {
    busy = disabled;
    refreshButton.disabled = disabled;
    lookupButton.disabled = disabled;
    copyButton.disabled = disabled || !selectedAddress;
  }
  function publishCurrent(response) {
    const text = responseText(response) || 'No readable result was returned.';
    currentRaw.textContent = text;
    currentResult.hidden = false;
    const lines = text.split('\n');
    const v4line = lines.find(line => /^IPv4-only endpoint:\s*/i.test(line)) || '';
    const dualLine = lines.find(line => /^dual-stack endpoint:\s*/i.test(line)) || '';
    const endpointValue = line => line.replace(/^[^:]+:\s*/, '').trim();
    const v4 = endpointValue(v4line);
    const dual = endpointValue(dualLine);
    const successful = value => value && !/^unavailable\b/i.test(value);
    selectedAddress = successful(v4) ? v4 : successful(dual) ? dual : '';
    primary.textContent = selectedAddress || 'No public address was returned';
    primary.dataset.empty = selectedAddress ? 'false' : 'true';
    copyButton.disabled = !selectedAddress || busy;
    const family = selectedAddress ? (selectedAddress.includes(':') ? 'IPv6' : 'IPv4') : 'Unavailable';
    const observedLine = lines.find(line => /^Observed:/i.test(line)) || '';
    meta.textContent = [family, observedLine.replace(/^Observed:\s*/i, 'Observed: ')].filter(Boolean).join(' · ');
    currentText.textContent = [
      `IPv4-only endpoint: ${successful(v4) ? v4 : (v4 || 'not reported')}`,
      `Dual-stack endpoint: ${successful(dual) ? dual : (dual || 'not reported')}`
    ].join('\n');
    if (isFailure(response)) {
      currentState.textContent = 'Check failed';
      currentState.dataset.kind = 'error';
      primary.textContent = 'Could not detect your public IP';
      primary.dataset.empty = 'true';
      selectedAddress = '';
      copyButton.disabled = true;
      setStatus(text, 'error');
    } else if (selectedAddress) {
      currentState.textContent = v4 && !/^unavailable\b/i.test(v4) && dual && !/^unavailable\b/i.test(dual) ? 'Detected' : 'Partial response';
      currentState.dataset.kind = '';
      setStatus('Public IP check completed; this tool has no ByteAfter-imposed daily credit cap.');
    } else {
      currentState.textContent = 'No address returned';
      currentState.dataset.kind = 'error';
      setStatus('The providers did not return a usable public address.', 'error');
    }
  }

  async function runCurrentCheck() {
    if (busy) return;
    updateButtons(true);
    currentState.textContent = 'Checking…';
    currentState.dataset.kind = '';
    primary.textContent = 'Checking your public IP…';
    primary.dataset.empty = 'true';
    setStatus('Requesting your public address from ipify directly from this browser…');
    try {
      const response = await tools['what-is-my-ip']();
      const text = responseText(response) || '';
      const hasAddress = /(?:IPv4-only endpoint|dual-stack endpoint):\s*(?!unavailable\b)\S+/i.test(text);
      if (isFailure(response) || !hasAddress) {
        publishCurrent(isFailure(response) ? response : {ok:false,text: text || 'Neither endpoint returned a usable address. No credit was used.'});
        return;
      }
      publishCurrent(response);
    } catch (error) {
      currentState.textContent = 'Check failed';
      currentState.dataset.kind = 'error';
      primary.textContent = 'Could not detect your public IP';
      primary.dataset.empty = 'true';
      setStatus(`${error?.message || 'The check could not be completed.'}`, 'error');
    } finally { updateButtons(false); }
  }

  refreshButton.addEventListener('click', runCurrentCheck);
  copyButton.addEventListener('click', async () => {
    if (!selectedAddress || busy) return;
    const ok = await api.copy(selectedAddress);
    setStatus(ok ? 'Public IP copied to the clipboard.' : 'Copy failed; select the address and copy it manually.', ok ? '' : 'error');
  });

  lookupForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const requested = lookupInput.value.trim() || selectedAddress;
    if (!requested) {
      setStatus('No detected address is available. Enter an IPv4 or IPv6 address to continue.', 'error');
      lookupInput.focus();
      return;
    }
    updateButtons(true);
    lookupResult.hidden = false;
    lookupText.textContent = 'Looking up approximate network and location data…';
    setStatus('Sending the selected IP address directly to IPWho.is for a user-requested lookup…');
    try {
      const response = await tools['ip-geolocation-lookup']({ip:requested});
      const text = responseText(response) || 'No readable result was returned.';
      lookupText.textContent = text;
      if (isFailure(response)) {
        setStatus(`${withoutCreditSuffix(text)}`, 'error');
      } else {
        setStatus('Lookup completed; this tool has no ByteAfter-imposed daily credit cap. IPWho.is provider quota may still apply.');
      }
    } catch (error) {
      lookupText.textContent = error?.message || 'The lookup could not be completed.';
      setStatus(`${withoutCreditSuffix(lookupText.textContent)}`, 'error');
    } finally { updateButtons(false); }
  });

  // Let the disclosure and controls paint before the automatic direct request begins.
  requestAnimationFrame(() => requestAnimationFrame(runCurrentCheck));
})();
