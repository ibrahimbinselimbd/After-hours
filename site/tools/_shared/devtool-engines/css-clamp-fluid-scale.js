(() => {
  'use strict';

  window.AHDevToolEngines = window.AHDevToolEngines || {};

  const MAX_FIELD_LENGTH = 80;
  const MAX_VIEWPORT_SPAN = 1000000;
  const MAX_SIZE = 1000000;

  const formatNumber = (value, digits = 6) => {
    if (Object.is(value, -0)) return '0';
    return Number(value.toFixed(digits)).toString();
  };

  const parsePixelLength = (raw, label, allowZero = true) => {
    const input = String(raw ?? '').trim();
    if (!input) throw new Error(`${label} is required.`);
    if (input.length > MAX_FIELD_LENGTH) throw new Error(`${label} is too long; use a simple pixel value such as 16px.`);
    const match = input.match(/^([+]?(?:\d+(?:\.\d*)?|\.\d+))\s*px$/i);
    if (!match) throw new Error(`${label} must be a finite pixel length ending in px (for example, 16px).`);
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value > MAX_SIZE || (!allowZero && value <= 0)) {
      throw new Error(`${label} must be ${allowZero ? 'between 0' : 'greater than 0'} and ${MAX_SIZE}px.`);
    }
    return value;
  };

  const parseViewport = (raw, label) => parsePixelLength(raw, label, false);

  const run = (values) => {
    const input = values && typeof values === 'object' ? values : {};
    try {
      const minSize = parsePixelLength(input.minSize, 'Minimum size');
      const maxSize = parsePixelLength(input.maxSize, 'Maximum size');
      const minViewport = parseViewport(input.minViewport, 'Minimum viewport');
      const maxViewport = parseViewport(input.maxViewport, 'Maximum viewport');

      if (maxSize < minSize) throw new Error('Maximum size must be greater than or equal to minimum size.');
      if (maxViewport <= minViewport) throw new Error('Maximum viewport must be greater than minimum viewport.');
      if (maxViewport - minViewport > MAX_VIEWPORT_SPAN) throw new Error(`Viewport span must not exceed ${MAX_VIEWPORT_SPAN}px.`);

      const viewportSpan = maxViewport - minViewport;
      const sizeSpan = maxSize - minSize;
      const slopePerPixel = sizeSpan / viewportSpan;
      const vwCoefficient = slopePerPixel * 100;
      const intercept = minSize - slopePerPixel * minViewport;
      const interceptText = `${intercept < 0 ? '-' : '+'} ${formatNumber(Math.abs(intercept))}px`;
      const clamp = `clamp(${formatNumber(minSize)}px, calc(${formatNumber(vwCoefficient)}vw ${interceptText}), ${formatNumber(maxSize)}px)`;

      const sampleViewports = [...new Set([
        minViewport,
        minViewport + viewportSpan * 0.25,
        minViewport + viewportSpan * 0.5,
        minViewport + viewportSpan * 0.75,
        maxViewport
      ].map(value => Math.round(value * 100) / 100))];
      const rows = sampleViewports.map(viewport => {
        const interpolated = minSize + slopePerPixel * (viewport - minViewport);
        const clamped = Math.min(maxSize, Math.max(minSize, interpolated));
        return `| ${formatNumber(viewport)}px | ${formatNumber(clamped)}px |`;
      });

      return [
        'CSS clamp() fluid-scale result',
        '',
        `CSS: ${clamp}`,
        '',
        `Interpolation: ${formatNumber(minSize)}px at ${formatNumber(minViewport)}px → ${formatNumber(maxSize)}px at ${formatNumber(maxViewport)}px`,
        `Viewport slope: ${formatNumber(slopePerPixel, 9)} px per viewport px`,
        '',
        '| Viewport | Resulting size |',
        '| ---: | ---: |',
        ...rows,
        '',
        'Scope notes: This is a mathematical CSS interpolation preview only. It does not simulate font metrics, container queries, browser layout, line wrapping, or actual rendering. Inputs are bounded local values; no remote/server checks are performed.'
      ].join('\n');
    } catch (error) {
      return `Unable to calculate CSS clamp() scale: ${error instanceof Error ? error.message : 'Invalid input.'}`;
    }
  };

  window.AHDevToolEngines['css-clamp-fluid-scale'] = {
    title: 'CSS clamp() Fluid-Scale Calculator & Preview',
    description: 'Calculate a pixel-based CSS clamp() interpolation, inspect its formula, and review representative viewport samples locally.',
    limitations: 'Pixel inputs only; this previews the mathematical interpolation and does not simulate font metrics, container queries, browser layout, line wrapping, or actual rendering. Bounded local input only; no remote/server checks.',
    fields: [
      { id: 'minSize', label: 'Minimum size', type: 'text', placeholder: '16px', help: 'Size at the minimum viewport; use a finite non-negative pixel value.' },
      { id: 'maxSize', label: 'Maximum size', type: 'text', placeholder: '32px', help: 'Size at the maximum viewport; use a pixel value at least as large as the minimum.' },
      { id: 'minViewport', label: 'Minimum viewport', type: 'text', placeholder: '320px', help: 'Lower viewport endpoint in pixels.' },
      { id: 'maxViewport', label: 'Maximum viewport', type: 'text', placeholder: '1280px', help: 'Upper viewport endpoint in pixels.' }
    ],
    run
  };
})();
