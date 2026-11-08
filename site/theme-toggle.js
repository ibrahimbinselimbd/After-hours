(() => {
  'use strict';

  const preferenceKey = 'byteafter-theme';
  const root = document.documentElement;
  const icons = {
    day: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>',
    night: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.3 15.4A8.5 8.5 0 0 1 8.6 3.7 8.6 8.6 0 1 0 20.3 15.4Z"/><path d="M16.5 4.5v3m-1.5-1.5h3"/></svg>'
  };

  let theme = 'night';
  try {
    theme = localStorage.getItem(preferenceKey) === 'day' ? 'day' : 'night';
  } catch {
    // Private browsing settings may disable storage; the switch still works for this page view.
  }

  function updateControl() {
    const isDay = theme === 'day';
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.setAttribute('aria-pressed', String(isDay));
      button.title = isDay ? 'Switch to night mode' : 'Switch to day mode';
      button.innerHTML = isDay ? icons.night : icons.day;
    }
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', isDay ? '#f1f4ed' : '#080a16');
  }

  function setTheme(nextTheme, persist = true) {
    theme = nextTheme === 'day' ? 'day' : 'night';
    root.dataset.theme = theme;
    updateControl();
    if (persist) {
      try {
        localStorage.setItem(preferenceKey, theme);
      } catch {
        // The active theme remains applied for this page view if storage is unavailable.
      }
    }
  }

  function mountToggle() {
    if (!document.body || document.getElementById('theme-toggle')) return;
    const button = document.createElement('button');
    button.id = 'theme-toggle';
    button.type = 'button';
    button.className = 'theme-toggle';
    button.setAttribute('aria-label', 'Day and night mode');
    button.setAttribute('aria-pressed', String(theme === 'day'));
    button.title = theme === 'day' ? 'Switch to night mode' : 'Switch to day mode';
    button.innerHTML = theme === 'day' ? icons.night : icons.day;
    button.addEventListener('click', () => setTheme(theme === 'day' ? 'night' : 'day'));
    document.body.append(button);
  }

  setTheme(theme, false);
  document.addEventListener('DOMContentLoaded', mountToggle, { once: true });
})();
