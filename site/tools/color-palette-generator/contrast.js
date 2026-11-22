(function (root) {
  const luminance = hex => {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!match) throw new TypeError('Expected a six-digit hex color.');
    const channels = match[1].match(/../g).map(value => parseInt(value, 16) / 255);
    const linear = channels.map(value => value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };

  const contrastRatio = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };

  const foregroundForSwatch = background => {
    const preferred = ['#111827', '#FFFFFF'];
    const bestPreferred = preferred.reduce((best, candidate) =>
      contrastRatio(candidate, background) > contrastRatio(best, background) ? candidate : best
    );
    return contrastRatio(bestPreferred, background) >= 4.5 ? bestPreferred : '#000000';
  };

  const api = Object.freeze({ luminance, contrastRatio, foregroundForSwatch });
  if (root) root.AHPaletteContrast = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis);
