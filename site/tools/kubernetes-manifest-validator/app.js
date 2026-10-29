(() => {
  'use strict';
  const api = window.AHToolkit;
  const engine = window.AHDevToolEngines && window.AHDevToolEngines['kubernetes-manifest-validator'];
  if (!api || !engine || !window.AHDeveloperRuntime) throw new Error('This tool could not be initialized.');
  engine.slug = 'kubernetes-manifest-validator';
  const credits = {
    canRun(statusTarget) { return api.credits.canRun(statusTarget); },
    charge() { return api.credits.charge(); }
  };
  window.AHDeveloperRuntime.mount(engine, api, credits);
})();
