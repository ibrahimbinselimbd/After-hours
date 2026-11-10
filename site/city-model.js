'use strict';
(() => {
  const viewer = document.querySelector('.touch-stage > model-viewer');
  if (!viewer) return;
  const stage = viewer.parentElement;
  const readout = stage.parentElement.querySelector('.touch-readout');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const syncMotion = () => {
    const enabled = !motion.matches && !document.body.classList.contains('reduce-motion');
    viewer.toggleAttribute('auto-rotate', enabled);
  };
  const syncCamera = () => {
    if (!viewer.loaded || typeof viewer.getCameraOrbit !== 'function') return;
    const yaw = ((Math.round(viewer.getCameraOrbit().theta * 180 / Math.PI) % 360) + 360) % 360;
    stage.setAttribute('aria-valuenow', String(yaw));
    stage.setAttribute('aria-valuetext', `${yaw} degrees. Horizontal rotation.`);
    if (stage.classList.contains('is-held') && readout) readout.textContent = `LIVE INPUT / ${yaw}°`;
  };
  const ready = () => {
    stage.classList.add('model-ready');
    syncCamera();
  };
  viewer.addEventListener('load', ready);
  viewer.addEventListener('error', () => stage.classList.remove('model-ready'));
  viewer.addEventListener('camera-change', syncCamera);
  if (viewer.loaded) ready();
  syncMotion();
  motion.addEventListener?.('change', syncMotion);
  new MutationObserver(syncMotion).observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
