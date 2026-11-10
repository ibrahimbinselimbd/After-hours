'use strict';
(() => {
  const viewer = document.querySelector('.touch-stage > model-viewer');
  if (!viewer) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const syncMotion = () => {
    const enabled = !motion.matches && !document.body.classList.contains('reduce-motion');
    viewer.toggleAttribute('auto-rotate', enabled);
  };
  syncMotion();
  motion.addEventListener?.('change', syncMotion);
  new MutationObserver(syncMotion).observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
