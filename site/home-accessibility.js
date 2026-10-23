/* A disclosure, not an application menu: native links keep normal keyboard behavior. */
(() => {
  const toggle = document.getElementById('home-menu-toggle');
  const nav = document.getElementById('home-navigation');
  if (!toggle || !nav) return;
  const header = toggle.closest('header');
  const mobile = window.matchMedia('(max-width: 700px)');
  const icon = toggle.querySelector('.menu-icon');
  const label = toggle.querySelector('.menu-label');
  function setOpen(open, returnFocus = false) {
    toggle.setAttribute('aria-expanded', String(open));
    nav.hidden = mobile.matches && !open;
    icon.textContent = open ? '×' : '☰';
    label.textContent = open ? 'Close' : 'Menu';
    if (returnFocus) toggle.focus({ preventScroll: true });
  }
  function syncLayout() {
    const focusWasInNav = nav.contains(document.activeElement);
    setOpen(false, mobile.matches && focusWasInNav);
    if (!mobile.matches && document.activeElement === toggle) nav.querySelector('a').focus({ preventScroll: true });
  }
  header.classList.add('home-nav-ready');
  toggle.hidden = false;
  syncLayout();
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  header.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mobile.matches && toggle.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  nav.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link || !mobile.matches) return;
    const destination = new URL(link.href);
    if (destination.origin !== location.origin || destination.pathname !== location.pathname || !destination.hash) return;
    const target = document.getElementById(destination.hash.slice(1));
    if (!target) return;
    // Retain native hash/history/scroll behavior; move focus out of the closing disclosure.
    setOpen(false);
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
  document.addEventListener('click', event => {
    if (mobile.matches && !header.contains(event.target) && toggle.getAttribute('aria-expanded') === 'true') setOpen(false);
  });
  header.addEventListener('focusout', event => {
    if (mobile.matches && event.relatedTarget && !header.contains(event.relatedTarget)) setOpen(false);
  });
  mobile.addEventListener('change', syncLayout);
})();
