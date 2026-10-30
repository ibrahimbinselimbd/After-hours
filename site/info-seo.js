(() => {
  'use strict';
  const pageKeys = ['about', 'privacy', 'disclaimer', 'advertising', 'terms', 'cookies', 'editorial', 'contact'];
  const requested = new URLSearchParams(location.search).get('page');
  const valid = requested === null || pageKeys.includes(requested);
  const current = valid ? requested || 'about' : 'about';
  const heading = document.querySelector('#page-content .headline');
  const summary = document.querySelector('#page-content .dek');
  if (!heading || !summary) return;

  const setMeta = (key, value, attribute = 'name') => {
    let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attribute, key);
      document.head.appendChild(element);
    }
    element.content = value;
  };
  const title = heading.textContent.replace(/\s*\.\s*$/, '').trim();
  const description = summary.textContent.replace(/\s+/g, ' ').trim();
  document.title = `${title} | AFTERHOURS`;
  setMeta('description', description);
  setMeta('og:site_name', 'AFTERHOURS', 'property');
  setMeta('og:type', 'website', 'property');
  setMeta('og:title', document.title, 'property');
  setMeta('og:description', description, 'property');
  setMeta('twitter:card', 'summary');
  setMeta('twitter:title', document.title);
  setMeta('twitter:description', description);

  const canonicalLink = document.head.querySelector('link[rel="canonical"]');
  if (valid) {
    const canonicalUrl = new URL(location.pathname, location.origin);
    canonicalUrl.searchParams.set('page', current);
    const link = canonicalLink || document.createElement('link');
    link.rel = 'canonical';
    link.href = canonicalUrl.href;
    if (!canonicalLink) document.head.appendChild(link);
    setMeta('og:url', canonicalUrl.href, 'property');
  } else {
    canonicalLink?.remove();
    setMeta('robots', 'noindex,follow');
  }
})();
