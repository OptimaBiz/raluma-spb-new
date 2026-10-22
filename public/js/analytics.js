(function (window, document) {
  'use strict';

  var VK_PIXEL_ID = '3805017';
  var YANDEX_COUNTER_ID = 108496902;
  var queue = window._tmr || (window._tmr = []);
  var hasPageView = queue.some(function (event) {
    return String(event.id) === VK_PIXEL_ID && event.type === 'pageView';
  });

  if (!hasPageView) {
    queue.push({
      id: VK_PIXEL_ID,
      type: 'pageView',
      start: new Date().getTime(),
    });
  }

  if (!document.getElementById('tmr-code')) {
    var script = document.createElement('script');
    var firstScript = document.getElementsByTagName('script')[0];
    script.id = 'tmr-code';
    script.type = 'text/javascript';
    script.async = true;
    script.src = 'https://top-fwz1.mail.ru/js/code.js';
    firstScript.parentNode.insertBefore(script, firstScript);
  }

  window.safeReachGoal = function (goal) {
    if (typeof goal !== 'string' || !goal.trim()) return;

    try {
      if (typeof window.ym === 'function') {
        window.ym(YANDEX_COUNTER_ID, 'reachGoal', goal);
      }
    } catch (_) {}

    try {
      var vkQueue = window._tmr || (window._tmr = []);
      vkQueue.push({ id: VK_PIXEL_ID, type: 'reachGoal', goal: goal });
    } catch (_) {}
  };
})(window, document);
