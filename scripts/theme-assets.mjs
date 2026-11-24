const escapeAttribute = value => String(value).replace(/[&"<>]/g, character => ({'&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;'}[character]));

function normalizeBasePath(basePath) {
  const value = String(basePath || '').trim().replace(/^\/+|\/+$/g, '');
  return value ? `/${value}` : '';
}

function upsertThemeColor(html) {
  const tag = '<meta name="theme-color" content="#080a16">';
  const pattern = /<meta\s+name=["']theme-color["'][^>]*>/i;
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace(/<\/head>/i, `${tag}</head>`);
}

function insertBeforeLastBodyClose(html, markup) {
  const closingIndex = html.toLowerCase().lastIndexOf('</body>');
  if (closingIndex < 0) return html;
  return `${html.slice(0, closingIndex)}${markup}${html.slice(closingIndex)}`;
}

export function ensureThemeAssets(source, basePath = '') {
  const prefix = normalizeBasePath(basePath);
  const isStandaloneAdminPreview = prefix === '/admin/analytics-preview/assets';
  let html = upsertThemeColor(String(source));
  if (!isStandaloneAdminPreview) {
    html = html.replace(/(<link\b[^>]*\bhref=["'][^"']*display-settings\.css)(?:[?#][^"']*)?(["'][^>]*>)/gi, '$1?v=6$2');
  }
  const hasThemeStylesheet = /<link\b[^>]*\bhref=["'][^"']*theme-toggle\.css(?:[?#][^"']*)?["'][^>]*>/i.test(html);
  const hasPagesStylesheet = /<link\b[^>]*\bhref=["'][^"']*pages-theme\.css(?:[?#][^"']*)?["'][^>]*>/i.test(html);
  const hasDisplaySettingsStylesheet = /<link\b[^>]*\bhref=["'][^"']*display-settings\.css(?:[?#][^"']*)?["'][^>]*>/i.test(html);
  const hasThemeController = /<script\b[^>]*\bsrc=["'][^"']*theme-toggle\.js(?:[?#][^"']*)?["'][^>]*>/i.test(html);
  if (!hasThemeStylesheet) html = html.replace(/<\/head>/i, `<link rel="stylesheet" href="${escapeAttribute(prefix)}/theme-toggle.css?v=1"></head>`);
  if (!hasPagesStylesheet) html = html.replace(/<\/head>/i, `<link rel="stylesheet" href="${escapeAttribute(prefix)}/pages-theme.css?v=1"></head>`);
  if (!hasDisplaySettingsStylesheet && !isStandaloneAdminPreview) html = html.replace(/<\/head>/i, `<link rel="stylesheet" href="${escapeAttribute(prefix)}/display-settings.css?v=6"></head>`);
  if (!hasThemeController) html = insertBeforeLastBodyClose(html, `<script defer src="${escapeAttribute(prefix)}/theme-toggle.js?v=1"></script>`);
  return html;
}
