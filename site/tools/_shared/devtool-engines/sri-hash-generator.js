(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['sri-hash-generator'] = {
    title: 'Subresource Integrity Hash Generator',
    description: 'Generate SHA-256, SHA-384, or SHA-512 SRI tokens from pasted UTF-8 text bytes in this browser. URL fetching is intentionally not performed: CORS, response encoding, line endings, and deployed asset bytes can differ from pasted text.',
    limitations: 'This tool hashes only the UTF-8 bytes produced from pasted text, up to 5 MiB of text. It does not fetch URLs, read remote assets, inspect servers, or verify that the result matches a deployed file; pasted text and the deployed asset must be byte-for-byte equivalent for the token to match.',
    fields: [
      {
        id: 'content',
        label: 'Exact asset text',
        type: 'textarea',
        placeholder: 'Paste the exact script, stylesheet, or other text asset here…',
        help: 'Do not reformat, trim, or change line endings after copying the deployed bytes.'
      },
      {
        id: 'algorithms',
        label: 'Hash algorithms',
        type: 'text',
        placeholder: 'sha-256, sha-384, sha-512',
        help: 'Comma- or space-separated. Leave blank to generate all three.'
      }
    ],
    async run(values) {
      const input = values && typeof values === 'object' ? values : {};
      const content = typeof input.content === 'string' ? input.content : '';
      const maxBytes = 5 * 1024 * 1024;

      if (typeof TextEncoder !== 'function') {
        throw new Error('This browser does not provide TextEncoder, which is required to define the pasted UTF-8 bytes.');
      }
      if (!globalThis.crypto || !globalThis.crypto.subtle || typeof globalThis.crypto.subtle.digest !== 'function') {
        throw new Error('Web Crypto is unavailable in this browser context; no hash was generated.');
      }
      if (!content) {
        throw new Error('Paste the exact asset text before generating an SRI token.');
      }

      const bytes = new TextEncoder().encode(content);
      if (bytes.byteLength > maxBytes) {
        throw new Error(`Input is too large (${bytes.byteLength.toLocaleString()} UTF-8 bytes). The limit is 5 MiB.`);
      }

      const rawAlgorithms = typeof input.algorithms === 'string' ? input.algorithms : '';
      const requested = rawAlgorithms.trim()
        ? rawAlgorithms.split(/[\s,]+/).filter(Boolean)
        : ['sha-256', 'sha-384', 'sha-512'];
      const aliases = {
        'sha256': 'SHA-256',
        'sha-256': 'SHA-256',
        'sha384': 'SHA-384',
        'sha-384': 'SHA-384',
        'sha512': 'SHA-512',
        'sha-512': 'SHA-512'
      };
      const algorithms = [];
      for (const name of requested) {
        const normalized = aliases[name.toLowerCase()];
        if (!normalized) {
          throw new Error(`Unsupported algorithm “${name}”. Choose sha-256, sha-384, or sha-512.`);
        }
        if (!algorithms.includes(normalized)) algorithms.push(normalized);
      }
      if (!algorithms.length) {
        throw new Error('Choose at least one algorithm: sha-256, sha-384, or sha-512.');
      }

      const toBase64 = (buffer) => {
        const view = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let offset = 0; offset < view.length; offset += chunkSize) {
          binary += String.fromCharCode(...view.subarray(offset, Math.min(offset + chunkSize, view.length)));
        }
        return btoa(binary);
      };

      const tokens = [];
      for (const algorithm of algorithms) {
        const digest = await crypto.subtle.digest(algorithm, bytes);
        tokens.push(`${algorithm.toLowerCase()}-${toBase64(digest)}`);
      }

      return [
        `Hashed ${bytes.byteLength.toLocaleString()} UTF-8 bytes locally.`,
        '',
        'SRI tokens:',
        ...tokens,
        '',
        'Use the token(s) in the element’s integrity attribute. Confirm the deployed asset bytes independently; this tool does not fetch or verify a URL.'
      ].join('\n');
    }
  };
})();
