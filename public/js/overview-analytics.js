/*  Overview analytics — v3 (matches "Overview & Analytics" mockup v2)
 *
 *  Layout:  KPI strip
 *           Delivery Trend            | Portfolio Health
 *           Key Ratios | Team Velocity | Priority Mix
 *           Dept x Status heatmap     | Team Workload
 *           Completion Forecast       | Upcoming Deadlines
 *
 *  Optional ctx settings:
 *    ctx.capacity   open items one person can carry before "overloaded" (default 10)
 *
 *  Dates are read defensively. For each project the first field that parses wins:
 *    created   : createdAt, created_at, created, dateCreated, created_on   (falls back to start)
 *    start     : start, startDate, start_date
 *    target    : end, endDate, end_date, due, dueDate, targetDate
 *    completed : completedAt, completed_at, completedDate, completed_on, actualEnd, actual_end, closedAt
 *                (falls back to the target date, and the panel says so)
 */
(function () {
  'use strict';

  var CAPACITY_DEFAULT = 10;
  var SNAP_KEY = 'anx_snap_v1';
  var CREATED_KEYS = ['createdAt', 'created_at', 'created', 'dateCreated', 'created_on'];
  var START_KEYS = ['start', 'startDate', 'start_date'];
  var END_KEYS = ['end', 'endDate', 'end_date', 'due', 'dueDate', 'targetDate'];
  var DONE_KEYS = ['completedAt', 'completed_at', 'completedDate', 'completed_on', 'actualEnd', 'actual_end', 'closedAt'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var NEUTRAL = 'rgba(148,163,184,.16)';   // reads correctly on light and dark themes
  var NEUTRAL_STRONG = 'rgba(148,163,184,.30)';
  var GRID = 'rgba(148,163,184,.28)';

  /* ---------- helpers ---------- */
  function e(v) { return (v == null ? '' : String(v)).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(v) { return Number(v) || 0; }
  function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
  function isDone(s) { return /^(completed?|done|closed|delivered)$/i.test(String(s || '').trim()); }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function toDate(v) {
    if (v == null || v === '' || v === true || v === false) return null;
    var t;
    if (typeof v === 'number') { if (v < 1e9) return null; t = v < 1e11 ? v * 1000 : v; }
    else { var s = String(v); t = /^\d{4}-\d{2}-\d{2}/.test(s) ? Date.parse(s.slice(0, 10) + 'T00:00:00') : Date.parse(s); }
    return isNaN(t) ? null : new Date(t);
  }
  function pickDate(o, keys) { for (var i = 0; i < keys.length; i++) { var d = toDate(o[keys[i]]); if (d) return d; } return null; }
  function dayDiff(a, b) { return Math.round((a.getTime() - b.getTime()) / 86400000); }
  function ym(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
  function ymShift(k, n) { var p = k.split('-'); return ym(new Date(+p[0], (+p[1]) - 1 + n, 1)); }
  function ymRange(a, b) { var out = [], k = a, g = 0; while (k <= b && g++ < 60) { out.push(k); k = ymShift(k, 1); } return out; }
  function ymLabel(k, withYear) { var p = k.split('-'); var m = MON[(+p[1]) - 1]; return (withYear || p[1] === '01') ? m + ' ' + p[0].slice(2) : m; }
  function initials(n) { var p = String(n || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
  var AV = ['#2563EB', '#7C3AED', '#0E7490', '#B45309', '#047857', '#BE185D', '#6D28D9', '#0F766E'];   // all dark enough for white initials
  function avColor(n) { var s = String(n || ''), h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AV[h % AV.length]; }
  // At Risk and On Hold used to share one amber, so they could not be told apart.
  var STATUS_COLORS = { 'On Track': '#34D399', 'Completed': '#A78BFA', 'On Hold': '#F59E0B', 'At Risk': '#FB923C', 'Delayed': '#EF4444', 'Not Started': '#3B82F6' };
  var STATUS_SHORT = { 'Not Started': 'Not St.', 'On Track': 'On Trk', 'At Risk': 'Risk', 'On Hold': 'Hold', 'Completed': 'Done' };
  var uid = 0;

  function injectCss() {
    if (document.getElementById('anx-v3-css')) return;
    var s = document.createElement('style'); s.id = 'anx-v3-css';
    s.textContent = [
      /* donut label: "44%" and "on track" were pushed apart by a stretched grid */
      '.anx .anx-donut .anx-din{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-align:center}',
      '.anx .anx-donut .anx-din b,.anx .anx-donut .anx-din span{display:block;line-height:1}',
      '.anx-delta{font-size:11px;font-weight:700;margin-top:6px}',
      '.anx-up{color:#10B981}.anx-dn{color:#EF4444}.anx-am{color:#D97706}.anx-flat{opacity:.55}',
      '.anx-gauges{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center}',
      '.anx-gauge-ring{position:relative;width:92px;max-width:100%;aspect-ratio:1/1;margin:0 auto 6px}',
      '.anx-gauge-ring svg{width:100%;height:100%;display:block}',
      '.anx-gauge-in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1}',
      '.anx-gauge-in b{font-size:17px;font-weight:800}',
      '.anx-gauge-in span{font-size:9.5px;opacity:.6;margin-top:2px}',
      '.anx-go{cursor:pointer;transition:transform .12s ease,box-shadow .12s ease,filter .12s ease}',
      '.anx-go:hover{filter:brightness(1.06)}.anx-kpi.anx-go:hover,.anx-tw-row.anx-go:hover,.anx-bl.anx-go:hover{transform:translateY(-1px)}',
      '.anx-cell.anx-go:hover{outline:2px solid #1677FF;outline-offset:-2px}.anx-lg.anx-go:hover,.anx-hh.anx-go:hover{text-decoration:underline}',
      '.anx-go:focus-visible{outline:2px solid #1677FF;outline-offset:2px}',
      '.anx-hint{font-size:11px;color:var(--muted,#64748B);margin:-4px 0 12px}',
      '.anx-gauge-lbl{font-size:11.5px;opacity:.75}',
      '.anx-lgnd{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:11px;margin-top:8px;align-items:center}',
      '.anx-lgnd i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px;vertical-align:middle}',
      '.anx-lgnd .anx-lnote{opacity:.62}',
      '.anx-chart{display:block;width:100%;height:auto;max-height:240px}',
      '.anx svg .anx-ax{font-size:10px;fill:currentColor;opacity:.62}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------- small builders ---------- */
  function bar(label, count, max, color, text, go) {
    var w = max ? Math.max(2, Math.round(count / max * 100)) : 2;
    return '<div class="anx-bl' + (go ? ' anx-go' : '') + '"' + (go ? ' data-go="' + e(go) + '" role="button" tabindex="0"' : '') + '><div class="anx-bl-top"><span>' + e(label) + '</span><b>' + e(text == null ? count : text) + '</b></div><div class="anx-track"><div class="anx-fill" style="width:' + w + '%;background:' + color + '"></div></div></div>';
  }
  function kpi(lab, n, sub, ic, tone, extra, go) {
    return '<div class="anx-kpi tone-' + tone + (go ? ' anx-go' : '') + '"' + (go ? ' data-go="' + e(go) + '" role="button" tabindex="0"' : '') + '><div class="anx-k-ic">' + ic + '</div><div class="anx-k-lab">' + e(lab) + '</div><div class="anx-k-num">' + e(n) + '</div><div class="anx-k-sub">' + e(sub) + '</div>' + (extra || '') + '</div>';
  }
  function card(title, pill, body, pillCls) {
    return '<div class="anx-card"><div class="anx-ch"><h2>' + e(title) + '</h2>' + (pill ? '<span class="anx-pill' + (pillCls ? ' ' + pillCls : '') + '">' + e(pill) + '</span>' : '') + '</div>' + body + '</div>';
  }
  function empty(msg) { return '<div class="anx-empty">' + e(msg) + '</div>'; }
  function legend(items, note) {
    return '<div class="anx-lgnd">' + items.map(function (it) { return '<span><i style="background:' + it[1] + '"></i>' + e(it[0]) + '</span>'; }).join('') + (note ? '<span class="anx-lnote">' + e(note) + '</span>' : '') + '</div>';
  }
  function gauge(p, color, unit, label, go) {
    p = Math.max(0, Math.min(100, p));
    var arc = p > 0 ? '<circle cx="18" cy="18" r="15.9155" fill="none" stroke="' + color + '" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="' + p + ' 100" transform="rotate(-90 18 18)"/>' : '';
    return '<div' + (go ? ' class="anx-go" data-go="' + e(go) + '" role="button" tabindex="0"' : '') + '><div class="anx-gauge-ring"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9155" fill="none" stroke="' + NEUTRAL_STRONG + '" stroke-width="3.4"/>' + arc + '</svg><div class="anx-gauge-in"><b>' + p + '%</b><span>' + e(unit) + '</span></div></div><div class="anx-gauge-lbl">' + e(label) + '</div></div>';
  }
  function niceMax(v) { v = Math.max(1, v); if (v <= 3) return 3; return Math.ceil(v / 3) * 3; }

  // o: {w,h,labels,yMax,ticks,fmt,series:[{vals,color,dash,area,dot}]}; null values break a line.
  function lineChart(o) {
    var L = 40, R = o.w - 14, T = 16, B = o.h - 32, n = o.labels.length;
    function X(i) { return n > 1 ? L + (R - L) * i / (n - 1) : (L + R) / 2; }
    function Y(v) { return B - (B - T) * (v / o.yMax); }
    var out = '';
    o.ticks.forEach(function (t) {
      var y = Y(t).toFixed(1);
      out += '<line x1="' + L + '" y1="' + y + '" x2="' + R + '" y2="' + y + '" stroke="' + GRID + '" stroke-width="1"/>';
      out += '<text class="anx-ax" x="' + (L - 8) + '" y="' + (+y + 3.5) + '" text-anchor="end">' + e(o.fmt ? o.fmt(t) : t) + '</text>';
    });
    o.series.forEach(function (s) {
      var pts = []; s.vals.forEach(function (v, i) { if (v != null) pts.push([X(i), Y(Math.min(v, o.yMax))]); });
      if (!pts.length) return;
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      if (s.area && pts.length > 1) {
        var id = 'anxg' + (++uid);
        out += '<defs><linearGradient id="' + id + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + s.color + '" stop-opacity=".28"/><stop offset="1" stop-color="' + s.color + '" stop-opacity="0"/></linearGradient></defs>';
        out += '<path d="' + d + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + B + ' L' + pts[0][0].toFixed(1) + ' ' + B + ' Z" fill="url(#' + id + ')"/>';
      }
      out += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"' + (s.dash ? ' stroke-dasharray="6 5"' : '') + '/>';
      if (s.dot || pts.length === 1) { var lp = pts[pts.length - 1]; out += '<circle cx="' + lp[0].toFixed(1) + '" cy="' + lp[1].toFixed(1) + '" r="4" fill="' + s.color + '"/>'; }
    });
    var step = n > 9 ? 2 : 1;
    o.labels.forEach(function (lab, i) { if (i % step && i !== n - 1) return; out += '<text class="anx-ax" x="' + X(i).toFixed(1) + '" y="' + (o.h - 10) + '" text-anchor="' + (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') + '">' + e(lab) + '</text>'; });
    return '<svg class="anx-chart" viewBox="0 0 ' + o.w + ' ' + o.h + '" role="img">' + out + '</svg>';
  }

  /* Month-over-month deltas need history the app does not store, so this keeps one
     snapshot per month in this browser. Deltas appear once a previous month exists.
     (A server-side monthly snapshot would make them identical for every user.) */
  function snapshots(metrics, canWrite) {
    try {
      var ls = window.localStorage, all = JSON.parse(ls.getItem(SNAP_KEY) || '{}'), cur = ym(new Date());
      if (canWrite) {
        all[cur] = metrics;
        var keys = Object.keys(all).sort(); while (keys.length > 14) delete all[keys.shift()];
        ls.setItem(SNAP_KEY, JSON.stringify(all));
      }
      var prev = Object.keys(all).filter(function (k) { return k < cur; }).sort().pop();
      return prev ? { key: prev, m: all[prev] } : null;
    } catch (_) { return null; }
  }
  function delta(cur, prev, unit, goodWhenUp, label) {
    if (cur == null || prev == null) return '';
    var d = Math.round((cur - prev) * 10) / 10;
    if (!d) return '<div class="anx-delta anx-flat">● no change vs ' + e(label) + '</div>';
    var up = d > 0, good = (up === goodWhenUp);
    return '<div class="anx-delta ' + (good ? 'anx-up' : 'anx-dn') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(d) + unit + ' vs ' + e(label) + '</div>';
  }

  /* ---------- render ---------- */
  /* ---------- click-through: every figure opens the matching filtered view ---------- */
  function go(target) {
    var m = String(target || '').split(':'), kind = m[0], val = m.slice(1).join(':');
    function nav(page) { try { showRealSection(page); } catch (_) {} }
    function setSel(id, v) { var el = document.getElementById(id); if (!el) return false; el.value = v; try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {} return true; }
    function scope(patch) { try { if (window.__scopeFilter && window.__scopeFilter.set) window.__scopeFilter.set(patch); } catch (_) {} }
    if (kind === 'projects') { nav('projects'); return; }
    if (kind === 'status') { nav('projects'); setTimeout(function () { setSel('fStatus', val); setSel('pj3Status', val); }, 150); return; }
    if (kind === 'prio') { nav('projects'); setTimeout(function () { setSel('fPrio', val); setSel('pj3Prio', val); setSel('pj3Priority', val); }, 150); return; }
    if (kind === 'dept') { scope({ team: val }); nav('projects'); return; }
    if (kind === 'cell') { var parts = val.split('|'); scope({ team: parts[0] }); nav('projects'); setTimeout(function () { setSel('fStatus', parts[1]); setSel('pj3Status', parts[1]); }, 150); return; }
    if (kind === 'person') { scope({ person: val }); nav('projects'); return; }
    if (kind === 'tasks') { nav('tasks'); setTimeout(function () { var tab = document.querySelector('[data-tk3-tab="' + (val === 'overdue' ? 'overdue' : 'soon') + '"]') || document.querySelector('[data-tk3-tab="all"]'); if (tab) tab.click(); }, 250); return; }
    if (kind === 'reports') { nav('reports'); return; }
  }
  document.addEventListener('click', function (ev) { var t = ev.target.closest('.anx .anx-go[data-go]'); if (!t) return; ev.preventDefault(); go(t.getAttribute('data-go')); });
  document.addEventListener('keydown', function (ev) { if (ev.key !== 'Enter' && ev.key !== ' ') return; var t = ev.target.closest && ev.target.closest('.anx .anx-go[data-go]'); if (!t) return; ev.preventDefault(); go(t.getAttribute('data-go')); });

    window.renderAnalyticsOverride = function (host, ctx) {
    try {
      if (!host) return;
      injectCss();
      var list = (ctx && ctx.list) || (window.data || []);
      var capacity = (ctx && +ctx.capacity) || CAPACITY_DEFAULT;
      var unfiltered = !(ctx && ctx.list) || !Array.isArray(window.data) || ctx.list.length === window.data.length;
      var total = list.length || 0, now = today(), curKey = ym(now);

      /* per-project facts */
      var anyCreatedField = false, approxDone = 0;
      var P = list.map(function (p) {
        var done = isDone(p.status), end = pickDate(p, END_KEYS), start = pickDate(p, START_KEYS);
        var created = pickDate(p, CREATED_KEYS); if (created) anyCreatedField = true;
        var doneAt = null, approx = false;
        if (done) { doneAt = pickDate(p, DONE_KEYS); if (!doneAt && end) { doneAt = end; approx = true; approxDone++; } if (doneAt && doneAt > now) doneAt = now; }
        var late = end ? (done ? (!approx && doneAt && dayDiff(doneAt, end) > 0) : end < now) : false;
        return { p: p, done: done, end: end, start: start, born: created || start, doneAt: doneAt, approx: approx, late: !!late };
      });

      /* status / priority */
      var order = ['On Track', 'Completed', 'On Hold', 'At Risk', 'Delayed', 'Not Started'];
      var counts = {}; order.forEach(function (s) { counts[s] = 0; });
      list.forEach(function (p) { var s = String(p.status || 'Not Started'); if (counts[s] == null) { counts[s] = 0; order.push(s); } counts[s]++; });
      var onTrack = counts['On Track'] || 0, completed = P.filter(function (x) { return x.done; }).length, notStarted = counts['Not Started'] || 0;
      var avgProgress = total ? Math.round(list.reduce(function (a, p) { return a + num(p.progress); }, 0) / total) : 0;
      var onTrackPct = pct(onTrack, total), completionPct = pct(completed, total);
      var prio = { High: 0, Medium: 0, Low: 0, Critical: 0 };
      list.forEach(function (p) { var s = String(p.priority || 'Medium').toLowerCase(); if (s.indexOf('critical') >= 0) prio.Critical++; else if (s.indexOf('high') >= 0) prio.High++; else if (s.indexOf('low') >= 0) prio.Low++; else prio.Medium++; });
      var prioMax = Math.max(1, prio.High, prio.Medium, prio.Low, prio.Critical);

      /* on-time + cycle time */
      var dated = P.filter(function (x) { return x.end; }), lateN = dated.filter(function (x) { return x.late; }).length;
      var onTimePct = dated.length ? pct(dated.length - lateN, dated.length) : null;
      var cyc = P.filter(function (x) { return x.done && x.doneAt && x.born && x.doneAt >= x.born; });
      var avgDays = cyc.length ? Math.round(cyc.reduce(function (a, x) { return a + dayDiff(x.doneAt, x.born); }, 0) / cyc.length) : null;
      var cycApprox = cyc.some(function (x) { return x.approx; });

      /* KPI strip — only metrics the page's top row does not already show */
      var prev = snapshots({ avgProgress: avgProgress, onTimePct: onTimePct, avgDays: avgDays, completed: completed, total: total }, unfiltered && total > 0);
      var pl = prev && unfiltered && total ? ymLabel(prev.key) : null, pm = pl ? prev.m : {};
      var kpiStrip = '<div class="anx-kpis">' +
        kpi('Avg Progress', avgProgress + '%', 'across ' + total + ' projects', '◔', 'emerald', pl ? delta(avgProgress, pm.avgProgress, ' pts', true, pl) : '') +
        kpi('On-Time Rate', onTimePct == null ? '—' : onTimePct + '%', dated.length ? (lateN + ' late of ' + dated.length + ' with a target date') : 'no target dates set', '◷', 'cyan', pl ? delta(onTimePct, pm.onTimePct, ' pts', true, pl) : '') +
        kpi('Avg Days to Complete', avgDays == null ? '—' : avgDays + 'd', avgDays == null ? 'needs start + completion dates' : (cyc.length + ' completed' + (cycApprox ? ' · uses target date as finish' : '')), '▤', 'blue', pl ? delta(avgDays, pm.avgDays, 'd', false, pl) : '') +
        kpi('Completed', completionPct + '%', completed + ' of ' + total + ' delivered', '✔', 'purple', pl ? delta(completed, pm.completed, '', true, pl) : '', 'status:Completed') +
        '</div>';

      /* Delivery Trend — cumulative created vs completed, last 8 months */
      var trendCard;
      var bornN = P.filter(function (x) { return x.born; }).length, doneDatedN = P.filter(function (x) { return x.doneAt; }).length;
      var bornLabel = anyCreatedField ? 'Created' : 'Started';
      if (total && (bornN || doneDatedN)) {
        var tKeys = ymRange(ymShift(curKey, -7), curKey);
        var cCum = tKeys.map(function (k) { return P.filter(function (x) { return !x.born || ym(x.born) <= k; }).length; });
        var dCum = tKeys.map(function (k) { return P.filter(function (x) { return x.done && (!x.doneAt || ym(x.doneAt) <= k); }).length; });
        var tMax = niceMax(Math.max.apply(null, cCum));
        var gapNow = cCum[cCum.length - 1] - dCum[dCum.length - 1], gapThen = cCum[0] - dCum[0];
        var tNote = 'Open backlog ' + gapNow + (gapNow > gapThen ? ' — up from ' + gapThen + '; completions are trailing new work.' : gapNow < gapThen ? ' — down from ' + gapThen + '; completions are outpacing new work.' : ' — unchanged over the period.');
        trendCard = card('Delivery Trend — ' + bornLabel + ' vs Completed', 'cumulative · last 8 months',
          lineChart({ w: 640, h: 220, labels: tKeys.map(function (k) { return ymLabel(k); }), yMax: tMax, ticks: [0, tMax / 3, tMax * 2 / 3, tMax], series: [{ vals: cCum, color: '#3B82F6', area: true }, { vals: dCum, color: '#34D399' }] }) +
          legend([[bornLabel, '#3B82F6'], ['Completed', '#34D399']], tNote + (approxDone ? ' Completion dates use the target date.' : '')));
      } else {
        trendCard = card('Delivery Trend — Created vs Completed', null, empty('Needs a created/start date on projects to draw a trend.'));
      }

      /* Portfolio Health */
      var acc = 0, segs = [];
      order.forEach(function (s) { var c = counts[s] || 0; if (!c) return; var f = total ? c / total : 0; segs.push((STATUS_COLORS[s] || '#64748B') + ' ' + (acc * 100).toFixed(1) + '% ' + ((acc + f) * 100).toFixed(1) + '%'); acc += f; });
      var conic = segs.length ? 'conic-gradient(' + segs.join(',') + ')' : 'conic-gradient(' + NEUTRAL_STRONG + ' 0 100%)';
      var troubled = lateN + (counts['At Risk'] || 0) + (counts['Delayed'] || 0);
      var hp = !total ? ['no projects', ''] : pct(troubled, total) >= 25 ? ['needs attention', 'anx-dn'] : troubled ? ['watch', 'anx-am'] : ['healthy', 'anx-up'];
      var healthCard = card('Portfolio Health', hp[0], '<div class="anx-health"><div class="anx-donut" style="background:' + conic + '"><div class="anx-din"><b>' + onTrackPct + '%</b><span>on track</span></div></div><div class="anx-legend">' +
        order.filter(function (s) { return counts[s]; }).map(function (s) { return '<div class="anx-lg anx-go" data-go="status:' + e(s) + '" role="button" tabindex="0"><span class="anx-dot" style="background:' + (STATUS_COLORS[s] || '#64748B') + '"></span><span class="anx-name">' + e(s) + '</span><b>' + counts[s] + '</b><span class="anx-pctv">' + pct(counts[s], total) + '%</span></div>'; }).join('') +
        '</div></div>', hp[1]);

      /* Key Ratios */
      var ratiosCard = card('Key Ratios', null, '<div class="anx-gauges">' + gauge(onTimePct == null ? 0 : onTimePct, '#34D399', onTimePct == null ? 'no dates' : 'on-time', 'On-Time', 'projects') + gauge(pct(notStarted, total), '#F59E0B', 'idle', 'Not Started', 'status:Not Started') + gauge(completionPct, '#A78BFA', 'done', 'Completion', 'status:Completed') + '</div>');

      /* Team Velocity — completed projects + milestones per month, next month = 3-month average */
      var vKeys = ymRange(ymShift(curKey, -3), curKey), vMap = {}; vKeys.forEach(function (k) { vMap[k] = 0; });
      P.forEach(function (x) {
        if (x.doneAt && vMap[ym(x.doneAt)] != null) vMap[ym(x.doneAt)]++;
        (x.p.milestones || []).forEach(function (m) { if (!isDone(m.status)) return; var d = pickDate(m, DONE_KEYS) || pickDate(m, END_KEYS); if (d && d > now) d = now; if (d && vMap[ym(d)] != null) vMap[ym(d)]++; });
      });
      var vVals = vKeys.map(function (k) { return vMap[k]; }), vSum = vVals.reduce(function (a, b) { return a + b; }, 0), velocityCard;
      if (vSum) {
        var vFc = Math.round(vVals.slice(-3).reduce(function (a, b) { return a + b; }, 0) / 3 * 10) / 10;
        var vAll = vVals.concat([vFc]), vMax = Math.max.apply(null, vAll), best = vVals.indexOf(Math.max.apply(null, vVals)), bw = 34, gap = 22, x0 = 22;
        var rects = vAll.map(function (v, i) {
          var fc = i === vAll.length - 1, h = Math.max(v ? 6 : 2, Math.round(v / vMax * 92)), x = x0 + i * (bw + gap), lab = fc ? ymLabel(ymShift(curKey, 1)) + '*' : ymLabel(vKeys[i]);
          return '<rect x="' + x + '" y="' + (122 - h) + '" width="' + bw + '" height="' + h + '" rx="4" fill="' + (fc ? NEUTRAL_STRONG : i === best ? '#34D399' : '#3B82F6') + '"' + (fc ? ' stroke="' + GRID + '" stroke-dasharray="4 3"' : '') + '/>' +
            '<text class="anx-ax" x="' + (x + bw / 2) + '" y="' + (116 - h) + '" text-anchor="middle">' + v + '</text><text class="anx-ax" x="' + (x + bw / 2) + '" y="140" text-anchor="middle">' + e(lab) + '</text>';
        }).join('');
        velocityCard = card('Team Velocity', 'items / month', '<svg class="anx-chart" viewBox="0 0 300 150" role="img">' + rects + '</svg>' + legend([['Best month', '#34D399'], ['Forecast (3-mo avg)', NEUTRAL_STRONG]]));
      } else {
        velocityCard = card('Team Velocity', 'items / month', empty('No projects or milestones completed in the last 4 months.'));
      }

      /* Priority Mix */
      function pt(n) { return n + ' · ' + pct(n, total) + '%'; }
      var priorityCard = card('Priority Mix', (prio.High + prio.Critical) + ' high+', '<div class="anx-barlist">' + bar('🔴 Critical', prio.Critical, prioMax, '#C8102E', pt(prio.Critical), 'prio:Critical') + bar('🟠 High', prio.High, prioMax, '#FB923C', pt(prio.High), 'prio:High') + bar('🟡 Medium', prio.Medium, prioMax, '#F59E0B', pt(prio.Medium), 'prio:Medium') + bar('🔵 Low', prio.Low, prioMax, '#3B82F6', pt(prio.Low), 'prio:Low') + '</div>');

      /* Heatmap — columns include every status in use, so rows always add up to Total */
      var dept = {}; list.forEach(function (p) { var d = String(p.category || p.department || 'Other').trim() || 'Other'; dept[d] = (dept[d] || 0) + 1; });
      var deptArr = Object.keys(dept).map(function (k) { return { k: k, v: dept[k] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 6);
      var hmStatuses = ['Not Started', 'On Track', 'At Risk', 'On Hold', 'Completed'];
      order.forEach(function (s) { if (counts[s] && hmStatuses.indexOf(s) < 0) hmStatuses.splice(hmStatuses.length - 1, 0, s); });
      var hm = {}; deptArr.forEach(function (d) { hm[d.k] = { __t: 0 }; });
      list.forEach(function (p) { var d = String(p.category || p.department || 'Other').trim() || 'Other'; if (!hm[d]) return; var s = String(p.status || 'Not Started'); hm[d][s] = (hm[d][s] || 0) + 1; hm[d].__t++; });
      var heatCard = card('Workload Heatmap — Dept × Status', 'projects', deptArr.length ? '<div class="anx-heat" style="grid-template-columns:100px repeat(' + (hmStatuses.length + 1) + ',1fr)"><div class="anx-hh"></div>' +
        hmStatuses.map(function (s) { return '<div class="anx-hh" style="text-align:center">' + e(STATUS_SHORT[s] || s) + '</div>'; }).join('') + '<div class="anx-hh" style="text-align:center">Total</div>' +
        deptArr.map(function (d) {
          return '<div class="anx-hh anx-go" data-go="dept:' + e(d.k) + '" role="button" tabindex="0">' + e(d.k) + '</div>' + hmStatuses.map(function (s) { var v = hm[d.k][s] || 0; return '<div class="anx-cell' + (v ? ' anx-go' : '') + '"' + (v ? ' data-go="cell:' + e(d.k) + '|' + e(s) + '" role="button" tabindex="0"' : '') + ' style="background:' + (v ? (STATUS_COLORS[s] || '#94A3B8') : NEUTRAL) + ';color:' + (v ? '#0B1220' : 'inherit') + ';' + (v ? '' : 'opacity:.55') + '">' + v + '</div>'; }).join('') +
            '<div class="anx-cell" style="background:' + NEUTRAL_STRONG + ';color:inherit">' + hm[d.k].__t + '</div>';
        }).join('') + '</div>' : empty('No projects yet.'));

      /* Team Workload — % of a real capacity, not of whoever is busiest */
      var people = {};
      function person(n, p) { if (!people[n]) people[n] = { name: n, open: 0, dept: (p.category || p.department || '') }; return people[n]; }
      list.forEach(function (p) {
        var names = []; [p.owner, p.lead].forEach(function (n) { n = String(n || '').trim(); if (n && names.indexOf(n) < 0) names.push(n); });   // owner == lead is counted once
        names.forEach(function (n) { var w = person(n, p); if (!isDone(p.status)) w.open++; });
        (p.milestones || []).forEach(function (m) { if (isDone(m.status)) return; var mo = String(m.owner || m.assignee || m.assignedTo || '').trim(); (mo ? [mo] : names).forEach(function (n) { person(n, p).open++; }); });
      });
      var workload = Object.keys(people).map(function (k) { return people[k]; }).sort(function (a, b) { return b.open - a.open; }).slice(0, 6);
      var over = workload.filter(function (w) { return w.open >= capacity; }), near = workload.filter(function (w) { return w.open >= capacity * 0.8; });
      var twPill = over.length ? [over.length + ' overloaded', 'anx-dn'] : near.length ? [near.length + ' near capacity', 'anx-am'] : workload.length ? ['balanced', 'anx-up'] : [null, ''];
      var teamCard = card('Team Workload & Balance', twPill[0], workload.length ? '<div class="anx-tw">' + workload.map(function (w) {
        var p2 = Math.round(w.open / capacity * 100), col = p2 >= 100 ? '#C8102E' : p2 >= 80 ? '#FB923C' : '#34D399';
        return '<div class="anx-tw-row anx-go" data-go="person:' + e(w.name) + '" role="button" tabindex="0"><span class="anx-av" style="background:' + avColor(w.name) + '">' + e(initials(w.name)) + '</span><div class="anx-tw-main"><div class="anx-tw-name">' + e(w.name) + '</div><div class="anx-tw-sub">' + e(w.dept ? w.dept + ' · ' : '') + w.open + ' open of ' + capacity + '</div><div class="anx-tw-bar"><div class="anx-tw-fill" style="width:' + Math.min(100, Math.max(4, p2)) + '%;background:' + col + '"></div></div></div><span class="anx-tw-pct">' + p2 + '%</span></div>';
      }).join('') + '</div>' + (near.length ? '<div class="anx-warn">⚠ ' + e(near.map(function (w) { return w.name; }).join(' & ')) + (near.length > 1 ? ' are' : ' is') + ' at or near capacity (' + capacity + ' open items) — consider redistributing.</div>' : '') : empty('No assigned owners yet.'), twPill[1]);

      /* Completion Forecast — actual vs plan (target dates) vs current pace */
      var forecastCard;
      if (total) {
        var lastEnd = dated.reduce(function (a, x) { var k = ym(x.end); return k > a ? k : a; }, ymShift(curKey, 3));
        var fKeys = ymRange(ymShift(curKey, -2), lastEnd > ymShift(curKey, 6) ? ymShift(curKey, 6) : lastEnd), ci = fKeys.indexOf(curKey);
        var actual = fKeys.map(function (k, i) { return i > ci ? null : pct(P.filter(function (x) { return x.done && (!x.doneAt || ym(x.doneAt) <= k); }).length, total); });
        var plan = dated.length ? fKeys.map(function (k) { return pct(dated.filter(function (x) { return ym(x.end) <= k; }).length, total); }) : null;
        var recent = P.filter(function (x) { return x.doneAt && ym(x.doneAt) >= ymShift(curKey, -2) && ym(x.doneAt) <= curKey; }).length / 3;   // projects per month
        var pace = fKeys.map(function (k, i) { return i < ci ? null : Math.min(100, Math.round(actual[ci] + (i - ci) * recent / total * 100)); });
        var lastLab = ymLabel(fKeys[fKeys.length - 1], true), series = [{ vals: actual, color: '#34D399', dot: true }, { vals: pace, color: '#A78BFA', dash: true }];
        if (plan) series.unshift({ vals: plan, color: '#3B82F6', dash: true });
        var fNote = (plan ? 'Plan says ' + plan[plan.length - 1] + '% by ' + lastLab + '. ' : '') + (recent ? 'Current pace reaches ' + pace[pace.length - 1] + '%.' : 'No completions in the last 3 months, so the pace line is flat.') + (plan && plan[ci] > actual[ci] ? ' Today: ' + actual[ci] + '% done vs ' + plan[ci] + '% planned.' : '');
        forecastCard = card('Completion Forecast', 'plan vs pace', lineChart({ w: 640, h: 190, labels: fKeys.map(function (k) { return ymLabel(k); }), yMax: 100, ticks: [0, 50, 100], fmt: function (t) { return t + '%'; }, series: series }) +
          legend([['Actual', '#34D399']].concat(plan ? [['Plan (target dates)', '#3B82F6']] : []).concat([['At current pace', '#A78BFA']]), fNote));
      } else {
        forecastCard = card('Completion Forecast', null, empty('No projects yet.'));
      }

      /* Upcoming Deadlines — names the next item due */
      var dd = { overdue: 0, d7: 0, d30: 0, later: 0 }, next = null;
      function bucket(d, status, name) { if (isDone(status)) return; d = toDate(d); if (!d) return; var L = dayDiff(d, now); if (L < 0) dd.overdue++; else { if (L <= 7) dd.d7++; else if (L <= 30) dd.d30++; else dd.later++; if (!next || L < next.L) next = { L: L, name: name }; } }
      P.forEach(function (x) { var p = x.p; bucket(x.end, p.status, p.name || p.title || 'Project'); (p.milestones || []).forEach(function (m) { bucket(pickDate(m, END_KEYS), m.status, m.name || m.title || 'Milestone'); }); });
      var ddMax = Math.max(1, dd.overdue, dd.d7, dd.d30, dd.later), warn = [];
      if (dd.overdue) warn.push(dd.overdue + ' item' + (dd.overdue > 1 ? 's' : '') + ' overdue');
      if (next && next.L <= 30) warn.push(next.name + ' due ' + (next.L === 0 ? 'today' : 'in ' + next.L + ' day' + (next.L > 1 ? 's' : '')));
      var deadlineCard = card('Upcoming Deadlines', 'projects + milestones', '<div class="anx-barlist">' + bar('Overdue', dd.overdue, ddMax, '#C8102E', null, 'tasks:overdue') + bar('Due in 7 days', dd.d7, ddMax, '#FB923C', null, 'tasks:due') + bar('Due in 8\u201330 days', dd.d30, ddMax, '#F59E0B', null, 'tasks:due') + bar('Later', dd.later, ddMax, '#3B82F6') + '</div>' + (warn.length ? '<div class="anx-warn">⚠ ' + e(warn.join(' — ')) + '.</div>' : ''));

      host.innerHTML = '<div class="anx"><div class="anx-hint">Click any status, priority, person, sub-team or deadline to open that view.</div>' + kpiStrip +
        '<div class="anx-grid anx-wide">' + trendCard + healthCard + '</div>' +
        '<div class="anx-grid anx-c3">' + ratiosCard + velocityCard + priorityCard + '</div>' +
        '<div class="anx-grid anx-c2">' + heatCard + teamCard + '</div>' +
        '<div class="anx-grid anx-c2">' + forecastCard + deadlineCard + '</div></div>';
    } catch (err) { if (window.console) console.error('analytics render failed:', err); }
  };
})();