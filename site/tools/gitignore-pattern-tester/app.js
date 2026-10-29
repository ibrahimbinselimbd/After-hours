(() => {
  'use strict';
  const api = window.AHToolkit;
  const engine = window.AHDevToolEngines && window.AHDevToolEngines['gitignore-pattern-tester'];
  if (!api || !engine || !window.AHDeveloperRuntime) throw new Error('This tool could not be initialized.');
  engine.slug = 'gitignore-pattern-tester';
  const credits = {
    canRun(statusTarget) { return api.credits.canRun(statusTarget); },
    charge() { return api.credits.charge(); }
  };
  window.AHDeveloperRuntime.mount(engine, api, credits);
})();
