(() => {
  'use strict';
  const api = window.AHToolkit;
  const engine = window.AHDevToolEngines && window.AHDevToolEngines['typescript-config-explorer'];
  if (!api || !engine || !window.AHDeveloperRuntime) throw new Error('This tool could not be initialized.');
  engine.slug = 'typescript-config-explorer';
  const credits = {
    canRun(statusTarget) { return api.credits.canRun(statusTarget); },
    charge() { return api.credits.charge(); }
  };
  window.AHDeveloperRuntime.mount(engine, api, credits);
})();
