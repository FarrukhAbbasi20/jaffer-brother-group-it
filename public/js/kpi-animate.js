/**
 * Attractive analytics KPI cards: pill badges + animated sparklines.
 * Sparklines are decorative, seeded from the live tile value (not fabricated history claims).
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
    '.kpi-tile',
    '.kpi-analytics'
  ].join(',');

  function reducedMotion() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function colorOf(name) {
    return COLORS[String(name || '').toLowerCase()] || COLORS.blue;
  }

  function hashSeed(n, salt) {
    var x = Math.sin((n + 1) * 12.9898 + (salt + 1) * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function buildPoints(value, salt) {
    var pts = [];
    var steps = 10;
    var base = 16 + Math.min(12, Math.log10(Math.max(value, 1) + 1) * 5);
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var wave = Math.sin(t * Math.PI * 1.75 + salt * 0.7) * 5.5;
      var trend = (t - 0.08) * (7 + (Math.abs(value) % 9));
      var jitter = (hashSeed(value, i + salt) - 0.5) * 4;
      var y = Math.max(5, Math.min(34, 36 - (base * 0.4 + wave + trend * 0.4 + jitter)));
      pts.push([2 + t * 156, y]);
    }
    return pts;
  }

  var introPlayed = false;

  function sparkSvg(color, value, index) {
    var pts = buildPoints(Number(value) || 0, index || 0);
    var line = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }).join(' ');
    var last = pts[pts.length - 1];
    var first = pts[0];
    var area = line + ' L' + last[0].toFixed(1) + ' 40 L' + first[0].toFixed(1) + ' 40 Z';
    var uid = 'ks' + (index || 0) + '_' + Math.round((Number(value) || 0) * 10) + '_' + Math.floor(Math.random() * 1e5).toString(36);
    var delay = ((index || 0) % 6) * 0.07;
    var quiet = introPlayed || reducedMotion();
    return (
      '<div class="kpi-spark' + (quiet ? ' kpi-spark-quiet' : '') + '" aria-hidden="true" style="--kpi-delay:' + delay.toFixed(2) + 's;--kpi-color:' + color + '">' +
        '<svg viewBox="0 0 160 40" preserveAspectRatio="none" width="100%" height="40">' +
          '<defs>' +
            '<linearGradient id="' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.32"/>' +
              '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>' +
            '</linearGradient>' +
          '</defs>' +
          '<path class="kpi-spark-area" d="' + area + '" fill="url(#' + uid + ')"/>' +
          '<path class="kpi-spark-line" d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>' +
      '</div>'
    );
  }

  /** Build a reference-style analytics KPI card HTML fragment. */
  window.kpiAnalyticsCard = function (opts) {
    opts = opts || {};
    var colorName = opts.color || 'blue';
    var color = colorOf(colorName);
    var cls = opts.className || 'ov3-kpi';
    var on = opts.on ? ' on' : '';
    var role = opts.clickable === false ? 'group' : 'button';
    var tab = opts.clickable === false ? '' : ' tabindex="0"';
    var click = opts.onclick ? ' onclick="' + opts.onclick + '"' : '';
    var keydown = opts.onclick
      ? ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();' + opts.onclick + '}"'
      : '';
    var dataAttrs = opts.dataAttrs || '';
    var pill = opts.pill || opts.sub || '';
    var idx = opts.index || 0;
    return (
      '<article class="' + cls + ' kpi-analytics kpi-tone-' + colorName + on + '" role="' + role + '"' + tab + click + keydown + ' ' + dataAttrs + '>' +
        '<div class="kpi-analytics-top">' +
          '<span class="kpi-analytics-ico" aria-hidden="true"><i data-lucide="' + esc(opts.icon || 'activity') + '"></i></span>' +
          '<span class="kpi-analytics-label">' + esc(opts.lab || opts.label || '') + '</span>' +
        '</div>' +
        '<div class="kpi-analytics-mid">' +
          '<div class="kpi-analytics-value ov3-kpi-value tk3-kpi-value iss3-kpi-value ms3-kpi-value val">' + esc(String(opts.val == null ? '' : opts.val)) + '</div>' +
          (pill ? '<span class="kpi-analytics-pill">' + esc(pill) + '</span>' : '') +
        '</div>' +
        sparkSvg(color, opts.val, idx) +
      '</article>'
    );
  };

  window.kpiSparkMarkup = sparkSvg;

  function detectColor(el) {
    var tone = String(el.className || '').match(/kpi-tone-([a-z]+)/);
    if (tone && COLORS[tone[1]]) return COLORS[tone[1]];
    var icon = el.querySelector(
      '.ov3-kpi-icon, .tk3-kpi-icon, .iss3-kpi-icon, .ms3-kpi-icon, .kpi-icon, .kpi-analytics-ico'
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
      '.kpi-analytics-value, .ov3-kpi-value, .tk3-kpi-value, .iss3-kpi-value, .ms3-kpi-value, .val'
    );
    if (!node) return 0;
    var raw = String(node.textContent || '').replace(/[^0-9.]/g, '');
    var n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function animateCount(el, target) {
    if (reducedMotion()) return;
    var node = el.querySelector(
      '.kpi-analytics-value, .ov3-kpi-value, .tk3-kpi-value, .iss3-kpi-value, .ms3-kpi-value, .val'
    );
    if (!node) return;
    var suffix = String(node.textContent || '').indexOf('%') >= 0 ? '%' : '';
    var end = Number(target);
    if (!Number.isFinite(end)) return;
    /* Keep the real value visible until the first frame — never blank to 0 early. */
    var start = 0;
    var t0 = null;
    var dur = 650 + Math.min(450, Math.abs(end) * 3);
    var token = String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7);
    el.dataset.kpiAnimToken = token;
    function frame(ts) {
      if (!el.isConnected || el.dataset.kpiAnimToken !== token) return;
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

  /* Intro (fade + count-up + spark draw) plays once per page load.
     Re-renders from KPI/tab clicks must stay solid — no vanish/flash. */
  function enhanceKpiTiles(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var tiles = scope.querySelectorAll(SELECTOR);
    var playIntro = !introPlayed && !reducedMotion() && tiles.length > 0;

    tiles.forEach(function (el, i) {
      el.classList.add('kpi-animated');
      if (playIntro) el.classList.remove('kpi-quiet');
      else el.classList.add('kpi-quiet');

      if (!el.querySelector('.kpi-spark')) {
        var color = detectColor(el);
        var val = readValue(el);
        el.insertAdjacentHTML('beforeend', sparkSvg(color, val, i));
        if (playIntro) animateCount(el, val);
      } else if (playIntro && !el.dataset.kpiCounted) {
        el.dataset.kpiCounted = '1';
        animateCount(el, readValue(el));
      }

      if (!el.classList.contains('kpi-in')) {
        el.style.setProperty('--kpi-delay', playIntro ? ((i % 8) * 0.06).toFixed(2) + 's' : '0s');
        el.classList.add('kpi-in');
      }
    });

    if (tiles.length) introPlayed = true;

    scope.querySelectorAll('.ov3-donut').forEach(function (donut) {
      if (donut.classList.contains('ov3-donut-anim')) return;
      donut.classList.add('ov3-donut-anim');
      void donut.offsetWidth;
      donut.classList.add('ov3-donut-in');
    });
  }

  window.enhanceKpiTiles = enhanceKpiTiles;

  var pending = null;
  function schedule() {
    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(function () {
      pending = null;
      enhanceKpiTiles(document);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule);
  else schedule();

  try {
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (!m.addedNodes || !m.addedNodes.length) continue;
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType !== 1) continue;
          if (
            (n.matches && n.matches(SELECTOR + ', .ov3-donut, #kpis, .tk3-kpis, .iss3-kpis, .ms3-kpis, .ov3-kpis')) ||
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
