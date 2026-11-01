(() => {
  'use strict';

  const MAX_INPUT = 64 * 1024;
  const MAX_ITEMS = 200;
  const MAX_TOKEN = 128;
  const MAX_DIGITS = 80;
  const MAX_EXPONENT = 30;
  const DEFAULT_PLACES = 3;

  const POW10 = (n) => 10n ** BigInt(n);
  const gcd = (a, b) => {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b) { const t = a % b; a = b; b = t; }
    return a || 1n;
  };
  const reduce = (n, d) => {
    if (d === 0n) throw new Error('Internal zero denominator.');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d);
    return { n: n / g, d: d / g };
  };
  const add = (a, b) => reduce(a.n * b.d + b.n * a.d, a.d * b.d);
  const multiplyInt = (a, k) => reduce(a.n * BigInt(k), a.d);

  function decimalToRational(sign, digits, fraction, exponent) {
    const raw = (digits + fraction).replace(/^0+(?=\d)/, '') || '0';
    const scale = fraction.length - exponent;
    let n = BigInt(raw);
    let d = 1n;
    if (scale >= 0) d = POW10(scale); else n *= POW10(-scale);
    if (sign === '-') n = -n;
    return reduce(n, d);
  }

  function parseQuantity(source) {
    const token = String(source).trim();
    if (!token) throw new Error('empty quantity');
    if (token.length > MAX_TOKEN) throw new Error(`quantity exceeds ${MAX_TOKEN} characters`);
    const match = token.match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))([eE][+-]?\d+)?([a-zA-Z]*)$/);
    if (!match) throw new Error('use a Kubernetes-style number and suffix, such as 500m, 1.5Gi, or 2e6');
    const sign = match[1] || '';
    if (sign === '-') throw new Error('negative resource quantities are not supported');
    const digits = match[2] || '0';
    const fraction = match[3] !== undefined ? match[3] : (match[4] || '');
    const exponent = match[5] ? Number(match[5].slice(1)) : 0;
    if (!Number.isInteger(exponent) || Math.abs(exponent) > MAX_EXPONENT) {
      throw new Error(`exponent must be between -${MAX_EXPONENT} and ${MAX_EXPONENT}`);
    }
    if (digits.length + fraction.length > MAX_DIGITS) {
      throw new Error(`significand exceeds ${MAX_DIGITS} digits`);
    }

    const suffix = match[6] || '';
    const decimal = {
      '': 1,
      k: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18,
      m: 1e-3, u: 1e-6, n: 1e-9
    };
    const binary = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5, Ei: 1024 ** 6 };
    let multiplier;
    let family;
    if (Object.prototype.hasOwnProperty.call(binary, suffix)) {
      multiplier = { n: BigInt(binary[suffix]), d: 1n }; family = 'binary';
    } else if (Object.prototype.hasOwnProperty.call(decimal, suffix)) {
      const exponents = {'': 0, k: 3, M: 6, G: 9, T: 12, P: 15, E: 18, m: -3, u: -6, n: -9};
      const power = exponents[suffix];
      multiplier = power >= 0 ? { n: POW10(power), d: 1n } : { n: 1n, d: POW10(-power) };
      family = 'decimal';
    } else {
      throw new Error(`unsupported suffix “${suffix}”; use m, u, n, k/M/G/T/P/E, or Ki/Mi/Gi/Ti/Pi/Ei`);
    }
    return { source: token, suffix, family, value: reduce(decimalToRational(sign, digits, fraction, exponent).n * multiplier.n, decimalToRational(sign, digits, fraction, exponent).d * multiplier.d) };
  }

  function decimalString(value, places, trim) {
    const negative = value.n < 0n;
    const n = negative ? -value.n : value.n;
    const whole = n / value.d;
    let remainder = n % value.d;
    let out = whole.toString();
    if (places > 0) {
      let fraction = '';
      for (let i = 0; i < places; i++) {
        remainder *= 10n;
        fraction += (remainder / value.d).toString();
        remainder %= value.d;
      }
      if (remainder * 2n >= value.d) {
        let rounded = BigInt(out + fraction) + 1n;
        let text = rounded.toString().padStart(places + 1, '0');
        out = text.slice(0, -places);
        fraction = text.slice(-places);
      }
      if (!trim || /[1-9]/.test(fraction)) out += `.${fraction}`;
      else { const t = fraction.replace(/0+$/, ''); if (t) out += `.${t}`; }
    }
    return `${negative ? '-' : ''}${out}`;
  }

  function exactDecimalString(value) {
    const negative = value.n < 0n;
    let n = negative ? -value.n : value.n;
    let d = value.d;
    let twos = 0;
    let fives = 0;
    while (d % 2n === 0n) { d /= 2n; twos++; }
    while (d % 5n === 0n) { d /= 5n; fives++; }
    if (d !== 1n) return decimalString(value, 18, true);
    const places = Math.max(twos, fives);
    n *= POW10(places);
    let text = (n / value.d).toString().padStart(places + 1, '0');
    if (places) {
      text = `${text.slice(0, -places)}.${text.slice(-places)}`.replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1');
    }
    return `${negative ? '-' : ''}${text}`;
  }

  function parsePlaces(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return DEFAULT_PLACES;
    if (!/^\d+$/.test(text)) throw new Error('rounding places must be a whole number from 0 to 9');
    const places = Number(text);
    if (places > 9) throw new Error('rounding places must be a whole number from 0 to 9');
    return places;
  }

  function conversion(value, divisor, places) {
    return decimalString(reduce(value.n, value.d * BigInt(divisor)), places, true);
  }

  function formatResult(item, mode, places) {
    const lines = [`${item.source}  [suffix: ${item.suffix || 'none'}]`];
    if (mode === 'memory') {
      lines.push(`  exact base value: ${exactDecimalString(item.value)} bytes`);
      lines.push(`  decimal: ${conversion(item.value, 1000, places)} kB | ${conversion(item.value, 1000000, places)} MB | ${conversion(item.value, 1000000000, places)} GB`);
      lines.push(`  binary:  ${conversion(item.value, 1024, places)} KiB | ${conversion(item.value, 1024 ** 2, places)} MiB | ${conversion(item.value, 1024 ** 3, places)} GiB`);
    } else {
      lines.push(`  exact base value: ${exactDecimalString(item.value)} cores`);
      lines.push(`  ${decimalString(item.value, 6, true)} cores | ${decimalString(multiplyInt(item.value, 1000), 6, true)} millicores | ${decimalString(multiplyInt(item.value, 1000000000), 6, true)} nanocores`);
    }
    return lines.join('\n');
  }

  function run(values) {
    const input = values && typeof values === 'object' ? String(values.quantities ?? '') : '';
    if (!input.trim()) return 'Enter one Kubernetes quantity per line (or separated by commas).';
    if (input.length > MAX_INPUT) return `Input is too large. Limit it to ${MAX_INPUT} characters.`;
    let mode = String(values.kind ?? 'memory').trim().toLowerCase();
    if (mode === 'cpu') mode = 'cpu';
    else if (mode === 'memory' || mode === 'mem') mode = 'memory';
    else return 'Kind must be “cpu” or “memory”. This tool converts quantities only; it does not evaluate scheduling or resource suitability.';
    let places;
    try { places = parsePlaces(values.rounding); } catch (error) { return `Input error: ${error.message}`; }
    const tokens = input.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
    if (tokens.length > MAX_ITEMS) return `Too many quantities. Limit the input to ${MAX_ITEMS} items.`;
    const output = [`Kubernetes quantity conversion (${mode}; ${places} decimal places)`, 'Exact arithmetic is used where possible; displayed conversions are rounded half-up.', ''];
    let errors = 0;
    tokens.forEach((token, index) => {
      try { output.push(formatResult(parseQuantity(token), mode, places)); }
      catch (error) { errors++; output.push(`${token}\n  ERROR: ${error.message}`); }
      if (index !== tokens.length - 1) output.push('');
    });
    output.push('', 'Scope: suffix parsing and unit conversion only. No scheduler, admission, manifest, cluster, or server checks are performed.');
    if (errors) output.push(`${errors} item(s) could not be parsed.`);
    return output.join('\n');
  }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['kubernetes-quantity-converter'] = {
    title: 'Kubernetes CPU / Memory Quantity Converter',
    description: 'Convert common Kubernetes CPU and memory quantity suffixes locally with exact base values and rounded decimal/binary views. Inputs stay in this browser; practical size and count caps prevent unsafe work. This does not evaluate scheduler semantics or resource suitability.',
    limitations: 'Supports bounded, single-token quantities using decimal SI (m, u, n, k, M, G, T, P, E), binary IEC (Ki, Mi, Gi, Ti, Pi, Ei), and decimal/exponent notation. It rejects negative values, unsupported suffixes, oversized significands/exponents, and more than 200 quantities. It does not validate manifests, Kubernetes versions, cluster behavior, scheduler decisions, admission policies, or server state.',
    fields: [
      { id: 'quantities', label: 'Quantities', type: 'textarea', placeholder: '500m\n1.5Gi\n2500000', help: 'One quantity per line or comma-separated; maximum 200 quantities and 64 KiB.' },
      { id: 'kind', label: 'Interpret as', type: 'text', placeholder: 'cpu or memory', help: 'Choose cpu for cores/millicores or memory for bytes and decimal/binary storage views.' },
      { id: 'rounding', label: 'Display decimal places', type: 'text', placeholder: '3', help: 'Optional whole number from 0 to 9; exact base values remain unrounded internally.' }
    ],
    run
  };
})();
