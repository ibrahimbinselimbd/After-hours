(() => {
  'use strict';
  const api = window.AHToolkit;
  const engine = window.AHDevToolEngines && window.AHDevToolEngines['graphql-query-validator'];
  if (!api || !engine || !window.AHDeveloperRuntime) throw new Error('This tool could not be initialized.');
  engine.slug = 'graphql-query-validator';
  const credits = {
    canRun(statusTarget) { return api.credits.canRun(statusTarget); },
    charge() { return api.credits.charge(); }
  };
  window.AHDeveloperRuntime.mount(engine, api, credits);
})();
