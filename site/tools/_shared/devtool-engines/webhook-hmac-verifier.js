(() => {
  'use strict';

  const MAX_PAYLOAD_BYTES = 1024 * 1024;
  const MAX_SECRET_BYTES = 64 * 1024;
  const MAX_SIGNATURE_CHARS = 256;

  const textEncoder = () => new TextEncoder();

  function byteLength(value) {
    return textEncoder().encode(value).byteLength;
  }

  function decodeHex(value) {
    if (!/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) {
      throw new Error('Hex signatures must contain an even number of hexadecimal characters.');
    }
    const bytes = new Uint8Array(value.length / 2);
    for (let i = 0; i < value.length; i += 2) {
      bytes[i / 2] = parseInt(value.slice(i, i + 2), 16);
    }
    return bytes;
  }

  function decodeBase64(value) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) {
      throw new Error('Base64 signatures must use standard base64 characters and valid padding (base64url is not supported).');
    }
    const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
    let binary;
    try {
      binary = atob(padded);
    } catch (_) {
      throw new Error('The signature is not valid standard base64.');
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function normalizeValues(values) {
    const input = values && typeof values === 'object' ? values : {};
    const payload = typeof input.payload === 'string' ? input.payload : '';
    const secret = typeof input.secret === 'string' ? input.secret : '';
    const signature = typeof input.signature === 'string' ? input.signature.trim() : '';
    const encoding = typeof input.encoding === 'string' ? input.encoding.trim().toLowerCase() : '';
    return {payload, secret, signature, encoding};
  }

  async function run(values) {
    const {payload, secret, signature, encoding} = normalizeValues(values);
    if (!payload) return 'Enter the exact raw UTF-8 payload text to verify.';
    if (!secret) return 'Enter the HMAC secret. It is used only in this browser.';
    if (!signature) return 'Enter the expected SHA-256 signature in hex or base64.';
    if (encoding !== 'hex' && encoding !== 'base64') {
      return 'Choose an explicit signature encoding: hex or base64.';
    }
    if (byteLength(payload) > MAX_PAYLOAD_BYTES) {
      return 'Payload is too large. The local verifier accepts at most 1 MiB of UTF-8 text.';
    }
    if (byteLength(secret) > MAX_SECRET_BYTES) {
      return 'Secret is too large. The local verifier accepts at most 64 KiB of UTF-8 secret text.';
    }
    if (signature.length > MAX_SIGNATURE_CHARS) {
      return 'Signature is too long. Enter one SHA-256 digest (at most 256 characters).';
    }
    if (/\s/.test(signature)) {
      return 'Signature must be a single hex or standard base64 value without internal whitespace.';
    }

    let expected;
    try {
      expected = encoding === 'hex' ? decodeHex(signature) : decodeBase64(signature);
    } catch (error) {
      return `Signature parsing failed: ${error.message}`;
    }
    if (expected.byteLength !== 32) {
      return `A SHA-256 HMAC must decode to exactly 32 bytes; this ${encoding} value decodes to ${expected.byteLength} bytes.`;
    }
    if (!globalThis.crypto || !globalThis.crypto.subtle) {
      return 'Web Crypto is unavailable in this browser context; no server-side fallback is used.';
    }

    try {
      const encoder = textEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        {name: 'HMAC', hash: 'SHA-256'},
        false,
        ['verify']
      );
      const valid = await crypto.subtle.verify(
        'HMAC',
        key,
        expected,
        encoder.encode(payload)
      );
      return valid
        ? 'Valid: the supplied signature matches HMAC-SHA-256 over the exact UTF-8 payload text.'
        : 'Invalid: the supplied signature does not match HMAC-SHA-256 over the exact UTF-8 payload text.';
    } catch (error) {
      return `Verification could not run locally: ${error && error.message ? error.message : 'Web Crypto rejected the inputs.'}`;
    }
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['webhook-hmac-verifier'] = {
    title: 'Webhook HMAC Signature Verifier',
    description: 'Verify a pasted raw UTF-8 webhook payload with a user-entered secret and an HMAC-SHA-256 signature, entirely in your browser.',
    limitations: 'Supports only HMAC-SHA-256 with standard hex or base64 signatures. It does not canonicalize provider payloads, parse provider timestamp schemes, accept base64url, or verify original binary bytes; the pasted text is encoded as UTF-8 exactly as entered. Inputs are capped at 1 MiB payload, 64 KiB secret, and 256 signature characters. No provider or server check is performed.',
    fields: [
      {id: 'payload', label: 'Raw payload', type: 'textarea', placeholder: '{"event":"checkout.completed"}', help: 'Paste the payload exactly as received; parsed or reformatted JSON can change the signature.'},
      {id: 'secret', label: 'HMAC secret', type: 'text', sensitive: true, placeholder: 'whsec_…', help: 'Used locally as UTF-8 text, masked on screen, and never sent to a provider.'},
      {id: 'signature', label: 'Expected signature', type: 'text', placeholder: '64 hex characters or base64', help: 'Paste one SHA-256 digest only; do not include a provider prefix or timestamp.'},
      {id: 'encoding', label: 'Signature encoding', type: 'text', placeholder: 'hex or base64', help: 'Enter exactly hex or base64. Standard base64 only; base64url is not supported.'}
    ],
    run
  };
})();
