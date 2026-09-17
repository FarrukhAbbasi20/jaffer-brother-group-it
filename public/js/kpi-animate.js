/**
 * Animated KPI sparklines + value count-up for all portal KPI tiles.
 * Decorative only — path is seeded from the live tile value (not historical data).
 */
(function () {
  'use strict';

  var COLORS = {
    red: '#C8102E',
    r: '#C8102E',
    blue: '#2563EB',
    b: '#3B82F6',
    green: '#10B981',
    g: '#10B981',
    purple: '#7C3AED',
    orange: '#F59E0B',
    a: '#F59E0B',
    navy: '#1E3A8A',
    teal: '#0D9488'
  };

  var SELECTOR = [
    '.ov3-kpi',
    '.tk3-kpi',
    '.iss3-kpi',
    '.ms3-kpi',
    '.kpi.kpi-tile',
    '.kpi-tile'
  ].join(',');

  function reducedMotion() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  function detectColor(el) {
    var icon = el.querySelector(
      '.ov3-kpi-icon, .tk3-kpi-icon, .iss3-kpi-icon, .ms3-kpi-icon, .kpi-icon'
    );
    var cls = ((icon && icon.className) || '') + ' ' + (el.className || '');
    var keys = Object.keys(COLORS);
    for (var i = 0; i < keys.length; i++) {
      if (new RegExp('(?:^|\\s)' + keys[i] + '(?:\\s|$)').test(cls)) return COLORS[keys[i]];
    }
    return '#2563EB';
  }

  function readValue(el) {
    var node = el.querySelector(
      '.ov3-kpi-value, .tk3-kpi-value, .iss3-kpi-value, .ms3-kpi-value, .val'
    );
    if (!node) return 0;
    var raw = String(node.textContent || '').replace(/[^0-9.]/g, '');
    var n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function hashSeed(n, salt) {
    var x = Math.sin((n + 1) * 12.9898 + (salt + 1) * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function buildPoints(value, salt) {
    var pts = [];
    var steps = 8;
    var base = 18 + Math.min(10, Math.log10(Math.max(value, 1) + 1) * 4);
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var wave = Math.sin(t * Math.PI * 1.6 + salt) * 6;
      var trend = (t - 0.15) * (6 + (value % 7));
      var jitter = (hashSeed(value, i + salt) - 0.5) * 5;
      var y = Math.max(4, Math.min(28, 30 - (base * 0.35 + wave + trend * 0.35 + jitter)));
      pts.push([2 + t * 116, y]);
    }
    return pts;
  }

  function sparkSvg(color, value, index) {
    var pts = buildPoints(value, index);
    var line = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }).join(' ');
    var last = pts[pts.length - 1];
    var first = pts[0];
    var area = line + ' L' + last[0].toFixed(1) + ' 32 L' + first[0].toFixed(1) + ' 32 Z';
    var uid = 'ks' + index + '_' + Math.round(value * 10);
    var delay = (index % 6) * 0.08;
    return (
      '<div class="kpi-spark" aria-hidden="true" style="--kpi-delay:' + delay.toFixed(2) + 's">' +
        '<svg viewBox="0 0 120 32" preserveAspectRatio="none" width="100%" height="32">' +
          '<defs>' +
            '<linearGradient id="' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.28"/>' +
              '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>' +
            '</linearGradient>' +
          '</defs>' +
          '<path class="kpi-spark-area" d="' + area + '" fill="url(#' + uid + ')"/>' +
          '<path class="kpi-spark-line" d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>' +
      '</div>'
    );
  }

  function animateCount(el, target) {
    if (reducedMotion()) return;
    var node = el.querySelector(
      '.ov3-kpi-value, .tk3-kpi-value, .iss3-kpi-value, .ms3-kpi-value, .val'
    );
    if (!node) return;
    var suffix = '';
    var text = String(node.textContent || '');
    if (text.indexOf('%') >= 0) suffix = '%';
    var end = Number(target);
    if (!Number.isFinite(end)) return;
    var start = 0;
    var t0 = null;
    var dur = 700 + Math.min(400, end * 4);
    function frame(ts) {
      if (t0 == null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      var cur = end % 1 ? (start + (end - start) * eased).toFixed(1) : Math.round(start + (end - start) * eased);
      node.textContent = cur + suffix;
      if (p < 1) requestAnimationFrame(frame);
      else node.textContent = (end % 1 ? String(end) : String(Math.round(end))) + suffix;
    }
    requestAnimationFrame(frame);
  }

  function enhanceKpiTiles(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var tiles = scope.querySelectorAll(SELECTOR);
    tiles.forEach(function (el, i) {
      var fresh = !el.querySelector('.kpi-spark');
      el.classList.add('kpi-animated');
      if (fresh) {
        var color = detectColor(el);
        var val = readValue(el);
        el.insertAdjacentHTML('beforeend', sparkSvg(color, val, i));
        el.style.setProperty('--kpi-delay', ((i % 8) * 0.06).toFixed(2) + 's');
        el.classList.remove('kpi-in');
        void el.offsetWidth;
        el.classList.add('kpi-in');
        animateCount(el, val);
      }
    });

    scope.querySelectorAll('.ov3-donut').forEach(function (donut) {
      if (donut.classList.contains('ov3-donut-anim')) return;
      donut.classList.add('ov3-donut-anim');
      void donut.offsetWidth;
      donut.classList.add('ov3-donut-in');
    });
  }

  window.enhanceKpiTiles = enhanceKpiTiles;

  // Auto-enhance after common render paths settle
  var pending = null;
  function schedule() {
    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(function () {
      pending = null;
      enhanceKpiTiles(document);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }

  try {
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (!m.addedNodes || !m.addedNodes.length) continue;
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType !== 1) continue;
          if (
            (n.matches && n.matches(SELECTOR + ', .ov3-donut, #kpis, .tk3-kpis, .iss3-kpis, .ms3-kpis')) ||
            (n.querySelector && n.querySelector(SELECTOR + ', .ov3-donut'))
          ) {
            schedule();
            return;
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) { /* ignore */ }
})();
