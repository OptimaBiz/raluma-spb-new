(function (window) {
  'use strict';

  var YANDEX_COUNTER_ID = 108496902;

  window.safeReachGoal = function (goal) {
    if (typeof goal !== 'string' || !goal.trim()) return;

    try {
      if (typeof window.ym === 'function') {
        window.ym(YANDEX_COUNTER_ID, 'reachGoal', goal);
      }
    } catch (_) {}

    try {
      var _tmr = window._tmr || (window._tmr = []);
      _tmr.push({ type: 'reachGoal', id: 3805017, goal: goal });
    } catch (_) {}
  };
})(window);
