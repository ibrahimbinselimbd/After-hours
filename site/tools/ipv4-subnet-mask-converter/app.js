(() => {
  'use strict';
  if (!window.AHToolkit || !window.AHNetworkTools || !document.getElementById('tool-content')) {
    throw new Error('Network tool dependencies did not initialize.');
  }
})();
