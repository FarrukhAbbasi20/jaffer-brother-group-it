/*  Reports page  (#reports)
 *
 *  Four reports, built from the same project data every other page uses (so the Scope row and the
 *  user's own visibility apply automatically):
 *    1. Portfolio summary   — counts by status, per department and per sub-team, progress, overdue
 *    2. Project list        — custodian, lead, dates, progress, days left / overdue
 *    3. Tasks & milestones  — done / open / overdue / due soon, per item, with owner
 *    4. Team workload       — open, overdue, due-soon and recently completed items per person
 *
 *  Export: Excel (.xlsx via the SheetJS library the app already loads; CSV if it is not there)
 *  and Print / PDF (browser print of just the report).
 *
 *  Works like the other *-v3 pages: index.html is untouched. Load after sidebar-v3.js and
 *  scope-filter.js.
 */
(function () {
  'use strict';

  var visible = false, tab = 'summary', period = 'all';
  var SHELL = ['dashboardView', 'kanbanView', 'projectsView', 'timelineView', 'issuesView', 'usersView', 'filterBar', 'kpis', 'ovPageHead', 'ovFilters', 'pjPageHead', 'pjToolbar', 'kbPageHead', 'kbToolbar', 'pageActions'];
  var STATUSES = ['Not Started', 'On Track', 'At Risk', 'Delayed', 'On Hold', 'Completed'];

  /* ---------- helpers ---------- */
  function e(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lc(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function num(v) { return Number(v) || 0; }
  function list(v) { return [].concat(v || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean); }
  function toDate(v) { if (!v) return null; var s = String(v); var t = /^\d{4}-\d{2}-\d{2}/.test(s) ? Date.parse(s.slice(0, 10) + 'T00:00:00') : Date.parse(s); return isNaN(t) ? null : new Date(t); }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function days(d) { return d ? Math.round((d.getTime() - today().getTime()) / 86400000) : null; }
  function fmt(d) { if (!d) return ''; var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return d.getDate() + ' ' + M[d.getMonth()] + ' ' + d.getFullYear(); }
  function isDone(s) { return /^(completed?|done|closed|delivered)$/i.test(String(s || '').trim()); }
  function projects() { try { return Array.isArray(data) ? data : []; } catch (_) { return []; } }
  function direct() { try { return Array.isArray(standalone) ? standalone : []; } catch (_) { return []; } }
  function depts(p) { var l = list(p.departments && p.departments.length ? p.departments : [p.department]); return l.length ? l : ['—']; }
  function teams(p) { var l = list(p.teams && p.teams.length ? p.teams : [p.team]); return l.length ? l : (p.category ? [String(p.category)] : ['—']); }
  function people(o) { var out = []; [].concat(o.owners || [], o.leads || [], [o.owner, o.lead, o.assignee]).forEach(function (n) { n = String(n || '').trim(); if (n && out.indexOf(n) < 0) out.push(n); }); return out; }
  function custodians(p) { var l = list(p.owners && p.owners.length ? p.owners : [p.owner]); return l.join(', '); }
  function leads(p) { var l = list(p.leads && p.leads.length ? p.leads : [p.lead]); return l.join(', '); }
  function pct(n, d) { return d ? Math.round(n / d * 100) : 0; }

  function inPeriod(d) {
    if (period === 'all') return true;
    if (!d) return false;
    var t = today(), y = t.getFullYear(), m = t.getMonth();
    if (period === 'month') return d.getFullYear() === y && d.getMonth() === m;
    if (period === 'quarter') return d.getFullYear() === y && Math.floor(d.getMonth() / 3) === Math.floor(m / 3);
    if (period === 'year') return d.getFullYear() === y;
    if (period === '30') { var diff = days(d); return diff != null && diff >= -30 && diff <= 0; }
    if (period === 'next30') { var df = days(d); return df != null && df >= 0 && df <= 30; }
    return true;
  }
  function periodLabel() { return { all: 'All time', month: 'This month', quarter: 'This quarter', year: 'This year', '30': 'Last 30 days', next30: 'Next 30 days' }[period] || 'All time'; }

  /* every task-like item: project milestones + direct tasks */
  function items() {
    var out = [];
    projects().forEach(function (p) { (p.milestones || []).forEach(function (m) { out.push({ m: m, project: p.name || '', kind: m.kind === 'monthly' ? 'Monthly milestone' : 'Task' }); }); });
    direct().forEach(function (m) { out.push({ m: m, project: 'Direct task', kind: m.kind === 'monthly' ? 'Monthly milestone' : 'Task' }); });
    return out.map(function (x) {
      var due = toDate(x.m.due || x.m.end), d = days(due), done = isDone(x.m.status);
      return { m: x.m, title: x.m.title || x.m.name || '', project: x.project, kind: x.kind, status: x.m.status || '', owner: people(x.m).join(', ') || '—', due: due, days: d, done: done, overdue: !done && d != null && d < 0, soon: !done && d != null && d >= 0 && d <= 7, completedAt: toDate(x.m.actualComplete) };
    });
  }

  /* ---------- the four reports: each returns {title, columns, rows, summary?} ---------- */
  function rSummary() {
    var P = projects().filter(function (p) { return inPeriod(toDate(p.end)) || period === 'all'; });
    var byStatus = {}; STATUSES.forEach(function (s) { byStatus[s] = 0; });
    P.forEach(function (p) { var s = p.status || 'Not Started'; byStatus[s] = (byStatus[s] || 0) + 1; });
    var overdue = P.filter(function (p) { var d = days(toDate(p.end)); return !isDone(p.status) && d != null && d < 0; }).length;
    var avg = P.length ? Math.round(P.reduce(function (a, p) { return a + num(p.progress); }, 0) / P.length) : 0;
    function group(keyFn, label) {
      var g = {};
      P.forEach(function (p) { keyFn(p).forEach(function (k) { if (!g[k]) { g[k] = { name: k, total: 0, prog: 0, overdue: 0 }; STATUSES.forEach(function (s) { g[k][s] = 0; }); } var r = g[k]; r.total++; r.prog += num(p.progress); r[p.status || 'Not Started'] = (r[p.status || 'Not Started'] || 0) + 1; var d = days(toDate(p.end)); if (!isDone(p.status) && d != null && d < 0) r.overdue++; }); });
      var rows = Object.keys(g).sort().map(function (k) { var r = g[k]; return [r.name, r.total].concat(STATUSES.map(function (s) { return r[s] || 0; })).concat([Math.round(r.prog / r.total) + '%', r.overdue]); });
      return { title: label, columns: [label, 'Projects'].concat(STATUSES).concat(['Avg progress', 'Overdue']), rows: rows };
    }
    return {
      title: 'Portfolio summary',
      summary: [['Projects', P.length], ['Avg progress', avg + '%'], ['Completed', byStatus['Completed'] + ' (' + pct(byStatus['Completed'], P.length) + '%)'], ['On track', byStatus['On Track']], ['At risk / delayed', (byStatus['At Risk'] || 0) + (byStatus['Delayed'] || 0)], ['On hold', byStatus['On Hold']], ['Not started', byStatus['Not Started']], ['Overdue', overdue]],
      sections: [group(depts, 'Department'), group(teams, 'Sub-team')]
    };
  }
  function rProjects() {
    var rows = projects().filter(function (p) { return period === 'all' || inPeriod(toDate(p.end)); }).map(function (p) {
      var end = toDate(p.end), d = days(end), when = isDone(p.status) ? 'Completed' : d == null ? '—' : d < 0 ? Math.abs(d) + ' days overdue' : d === 0 ? 'Due today' : d + ' days left';
      return [p.name || '', depts(p).join(', '), teams(p).join(', '), p.status || '', p.priority || '', num(p.progress) + '%', custodians(p) || '—', leads(p) || '—', fmt(toDate(p.start)), fmt(end), when];
    }).sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });
    return { title: 'Project list', columns: ['Project', 'Department', 'Sub-team', 'Status', 'Priority', 'Progress', 'Custodian', 'Lead', 'Start', 'Target', 'Timing'], rows: rows };
  }
  function rTasks() {
    var all = items().filter(function (x) { return period === 'all' || inPeriod(x.due); });
    var done = all.filter(function (x) { return x.done; }).length, overdue = all.filter(function (x) { return x.overdue; }).length, soon = all.filter(function (x) { return x.soon; }).length;
    var rows = all.sort(function (a, b) { return (a.due ? a.due.getTime() : 9e15) - (b.due ? b.due.getTime() : 9e15); }).map(function (x) {
      return [x.title, x.project, x.kind, x.owner, x.status || '', fmt(x.due), x.done ? 'Done' : x.days == null ? '—' : x.days < 0 ? Math.abs(x.days) + ' days overdue' : x.days === 0 ? 'Due today' : 'in ' + x.days + ' days'];
    });
    return { title: 'Tasks & monthly milestones', summary: [['Items', all.length], ['Completed', done + ' (' + pct(done, all.length) + '%)'], ['Open', all.length - done], ['Overdue', overdue], ['Due in 7 days', soon]], columns: ['Item', 'Project', 'Type', 'Owner', 'Status', 'Due', 'Timing'], rows: rows };
  }
  function rWorkload() {
    var W = {};
    function row(n) { if (!W[n]) W[n] = { name: n, dept: '', open: 0, overdue: 0, soon: 0, done30: 0, projects: 0 }; return W[n]; }
    try { (assignableUsers || []).forEach(function (u) { if (u && u.name) row(u.name).dept = u.department || ''; }); } catch (_) {}
    projects().forEach(function (p) { people(p).forEach(function (n) { row(n).projects++; }); });
    items().forEach(function (x) { people(x.m).forEach(function (n) { var r = row(n); if (x.done) { if (x.completedAt && days(x.completedAt) >= -30) r.done30++; return; } r.open++; if (x.overdue) r.overdue++; if (x.soon) r.soon++; }); });
    var rows = Object.keys(W).map(function (k) { return W[k]; }).filter(function (r) { return r.open || r.projects || r.done30; }).sort(function (a, b) { return b.open - a.open || a.name.localeCompare(b.name); })
      .map(function (r) { return [r.name, r.dept || '—', r.projects, r.open, r.overdue, r.soon, r.done30]; });
    return { title: 'Team workload', columns: ['Person', 'Department', 'Projects (custodian / lead)', 'Open items', 'Overdue', 'Due in 7 days', 'Completed (30 days)'], rows: rows };
  }
  function build() { return { summary: rSummary, projects: rProjects, tasks: rTasks, workload: rWorkload }[tab](); }

  /* ---------- rendering ---------- */
  var COL = { 'Not Started': '#3B82F6', 'On Track': '#34D399', 'At Risk': '#FB923C', 'Delayed': '#EF4444', 'On Hold': '#F59E0B', 'Completed': '#A78BFA' };
  function css() {
    if (document.getElementById('rp3-css')) return;
    var st = document.createElement('style'); st.id = 'rp3-css';
    st.textContent = [
      '.rp3-shell-hidden{display:none!important}',
      'html body.view-reports #pjPageHead,html body.view-reports #pjToolbar,html body.view-reports #kbPageHead,html body.view-reports #kbToolbar,html body.view-reports #ovPageHead,html body.view-reports #ovFilters,html body.view-reports #kpis,html body.view-reports #filterBar,html body.view-reports #pageActions,html body.view-reports .tl3-filters-row{display:none!important}',
      /* tokens: light first, dark overrides */
      '#reportsView{--rp-bg:transparent;--rp-card:#FFFFFF;--rp-card2:#F4F7FB;--rp-line:#E2E8F0;--rp-line2:#EEF2F7;--rp-ink:#0F172A;--rp-ink2:#334155;--rp-mut:#64748B;--rp-mut2:#8A97AA;--rp-chip:#EEF2F7;--rp-track:#E9EEF5;--rp-active:#EAF2FF;--rp-red-card:#FFF1F2;--rp-red-line:#FECDD3;--rp-red:#DC2626;--rp-red2:#9F1239;--rp-note:#F8FAFC;padding:0 0 28px;color:var(--rp-ink);font-size:14px}',
      'html[data-theme="dark"] #reportsView{--rp-card:#111C2E;--rp-card2:#17263D;--rp-line:#233249;--rp-line2:#1A2740;--rp-ink:#F1F5F9;--rp-ink2:#DCE6F5;--rp-mut:#A9B6C9;--rp-mut2:#8FA0B8;--rp-chip:#17263D;--rp-track:#1A2740;--rp-active:#10203A;--rp-red-card:#1A1420;--rp-red-line:#5B1F2A;--rp-red:#FF8A9A;--rp-red2:#E6B4BD;--rp-note:#17263D}',
      '#reportsView *{box-sizing:border-box}',
      '.rp3-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin:0 0 16px}',
      '.rp3-head h1{margin:0 0 6px;font-size:32px;font-weight:800;letter-spacing:-.02em;color:var(--rp-ink)}',
      '.rp3-sub{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13.5px;color:var(--rp-mut)}.rp3-sub b{color:var(--rp-ink);font-weight:700}.rp3-dot{width:4px;height:4px;border-radius:50%;background:var(--rp-mut2)}',
      '.rp3-scope{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:var(--rp-chip);border:1px solid var(--rp-line);font-weight:600;color:var(--rp-ink2)}',
      '.rp3-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.rp3-seg{display:flex;gap:2px;padding:4px;border:1px solid var(--rp-line);border-radius:10px;background:var(--rp-card)}',
      '.rp3-seg button{height:34px;padding:0 13px;border:0;border-radius:7px;background:transparent;color:var(--rp-mut);font:inherit;font-size:13px;font-weight:600;cursor:pointer}.rp3-seg button.on{background:#1677FF;color:#fff;font-weight:700}',
      '.rp3-btn{height:42px;padding:0 16px;border:1px solid var(--rp-line);border-radius:10px;background:var(--rp-card);color:var(--rp-ink);font:inherit;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:8px}.rp3-btn svg{width:16px;height:16px}',
      '.rp3-btn.primary{background:#1677FF;border-color:#1677FF;color:#fff;box-shadow:0 8px 20px -10px rgba(22,119,255,.8)}',
      '.rp3-export{position:relative}.rp3-menu{position:absolute;right:0;top:calc(100% + 6px);min-width:220px;padding:6px;border:1px solid var(--rp-line);border-radius:10px;background:var(--rp-card);box-shadow:0 16px 40px -16px rgba(0,0,0,.45);z-index:20;display:none}.rp3-export.open .rp3-menu{display:block}',
      '.rp3-menu button{display:block;width:100%;text-align:left;padding:9px 10px;border:0;border-radius:7px;background:transparent;color:var(--rp-ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer}.rp3-menu button:hover{background:var(--rp-chip)}',
      '.rp3-pick{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:0 0 16px}',
      '.rp3-card-btn{text-align:left;padding:14px 16px;border:1px solid var(--rp-line);border-radius:14px;background:var(--rp-card);color:var(--rp-ink);font:inherit;cursor:pointer;display:flex;align-items:center;gap:14px}.rp3-card-btn.on{border-color:#1677FF;background:var(--rp-active);box-shadow:0 0 0 3px rgba(22,119,255,.18)}',
      '.rp3-ico{width:40px;height:40px;border-radius:10px;background:var(--rp-chip);display:grid;place-items:center;flex:none}.rp3-ico svg{width:20px;height:20px}.rp3-card-btn.on .rp3-ico{background:#1677FF;color:#fff!important}',
      '.rp3-card-btn b{display:block;font-size:14px}.rp3-card-btn span.d{display:block;font-size:12px;color:var(--rp-mut);margin-top:2px}',
      '.rp3-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:0 0 14px}',
      '.rp3-card{padding:18px 20px;border:1px solid var(--rp-line);border-radius:16px;background:var(--rp-card);margin:0 0 14px}',
      '.rp3-card.red{background:var(--rp-red-card);border-color:var(--rp-red-line)}',
      '.rp3-k{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--rp-mut2)}.rp3-card.red .rp3-k{color:var(--rp-red2)}',
      '.rp3-big{font-size:40px;font-weight:800;line-height:1;color:var(--rp-ink);margin:10px 0}.rp3-card.red .rp3-big{color:var(--rp-red)}',
      '.rp3-small{font-size:12px;color:var(--rp-mut)}.rp3-card.red .rp3-small{color:var(--rp-red2)}',
      '.rp3-chips{display:flex;gap:6px;flex-wrap:wrap}.rp3-chip{padding:3px 9px;border-radius:999px;font-size:12px;font-weight:700}',
      '.rp3-ring{display:flex;align-items:center;justify-content:space-between;gap:12px}.rp3-ring svg{width:76px;height:76px;flex:none}',
      '.rp3-bar{height:8px;border-radius:6px;background:var(--rp-track);overflow:hidden}.rp3-bar i{display:block;height:100%;border-radius:6px;background:#1677FF}',
      '.rp3-stack{display:flex;height:18px;border-radius:9px;overflow:hidden;gap:2px}.rp3-stack i{display:block;height:100%}.rp3-stack.sm{height:10px;border-radius:5px;gap:1px}',
      '.rp3-legend{display:flex;gap:22px;flex-wrap:wrap;font-size:13px;color:var(--rp-ink2);margin-top:12px}.rp3-legend span{display:inline-flex;align-items:center;gap:7px}.rp3-legend i{width:10px;height:10px;border-radius:3px}.rp3-legend b{color:var(--rp-ink)}',
      '.rp3-ch{display:flex;align-items:center;justify-content:space-between;margin:0 0 12px}.rp3-ch h2{margin:0;font-size:16px;font-weight:700;color:var(--rp-ink)}.rp3-ch span{font-size:12px;color:var(--rp-mut)}',
      '.rp3-cols{display:grid;grid-template-columns:1fr 1.35fr;gap:14px}',
      '.rp3-mix{display:grid;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--rp-line2)}.rp3-mix:last-child{border-bottom:0}.rp3-mix.h{padding:0 0 8px;border-bottom:1px solid var(--rp-line);font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--rp-mut2)}',
      '.rp3-mix .n{text-align:right;font-variant-numeric:tabular-nums}.rp3-mix .nm{font-weight:600}.rp3-mix .pg{display:flex;align-items:center;gap:8px}.rp3-mix .pg b{font-size:12px;width:34px;text-align:right}.rp3-mix .od{text-align:right;color:var(--rp-mut2)}.rp3-mix .od.bad{color:var(--rp-red);font-weight:700}',
      '.rp3-note{margin-top:12px;padding:12px 14px;border-radius:12px;background:var(--rp-note);border:1px dashed var(--rp-line);font-size:12.5px;color:var(--rp-ink2);line-height:1.45}.rp3-note b{color:var(--rp-ink)}',
      '.rp3-tablewrap{overflow-x:auto}.rp3-table{width:100%;border-collapse:collapse;font-size:13px}',
      '.rp3-table th{text-align:left;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--rp-mut2);padding:8px 10px;border-bottom:1px solid var(--rp-line);white-space:nowrap}',
      '.rp3-table td{padding:9px 10px;border-bottom:1px solid var(--rp-line2);vertical-align:middle}.rp3-table tr:last-child td{border-bottom:0}.rp3-table td.num{text-align:right;font-variant-numeric:tabular-nums}',
      '.rp3-table td.bad{color:var(--rp-red);font-weight:700}.rp3-table td.ok{color:#059669;font-weight:700}html[data-theme="dark"] .rp3-table td.ok{color:#6EE7B7}',
      '.rp3-status{display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700;background:var(--rp-chip)}.rp3-status i{width:7px;height:7px;border-radius:50%}',
      '.rp3-pcell{display:flex;align-items:center;gap:8px;min-width:120px}.rp3-pcell .rp3-bar{flex:1}.rp3-pcell b{font-size:12px;width:34px;text-align:right}',
      '.rp3-empty{padding:22px;text-align:center;color:var(--rp-mut)}',
      '.rp3-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--rp-mut2);margin-top:4px}',
      '@media (max-width:1100px){.rp3-pick,.rp3-grid4{grid-template-columns:repeat(2,1fr)}.rp3-cols{grid-template-columns:1fr}}',
      '@media print{body *{visibility:hidden!important}#reportsView,#reportsView *{visibility:visible!important}#reportsView{position:absolute!important;left:0;top:0;width:100%;padding:0;--rp-card:#fff;--rp-ink:#000;--rp-ink2:#222;--rp-mut:#444;--rp-mut2:#555;--rp-line:#bbb;--rp-line2:#ddd;--rp-chip:#eee;--rp-track:#e5e5e5;--rp-note:#f5f5f5}#appSidebar,.app-topbar,#scopeBar,.rp3-actions,.rp3-pick{display:none!important}.rp3-card{break-inside:avoid}html,body{background:#fff!important}}'
    ].join('\n');
    document.head.appendChild(st);
  }
  function host() {
    var c = document.getElementById('appContent'); if (!c) return null;
    var el = document.getElementById('reportsView');
    if (!el) { css(); el = document.createElement('div'); el.id = 'reportsView'; el.className = 'reports-v3 hidden'; el.hidden = true; c.appendChild(el); el.addEventListener('click', onClick); }
    return el;
  }
  var ICONS = {
    summary: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19h16"/><path d="M6 15V9"/><path d="M11 15V5"/><path d="M16 15v-3"/></svg>',
    projects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/></svg>',
    tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
    workload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 5"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M6 17v4h12v-4"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:12px;height:12px"><path d="M6 9l6 6 6-6"/></svg>'
  };
  var ICON_COLOR = { summary: '#1677FF', projects: '#7DB4FF', tasks: '#34D399', workload: '#A78BFA' };
  function stack(counts, total, small) {
    if (!total) return '<div class="rp3-stack' + (small ? ' sm' : '') + '"><i style="width:100%;background:var(--rp-track)"></i></div>';
    return '<div class="rp3-stack' + (small ? ' sm' : '') + '">' + STATUSES.filter(function (st) { return counts[st]; }).map(function (st) { return '<i style="width:' + (counts[st] / total * 100).toFixed(1) + '%;background:' + COL[st] + '" title="' + e(st) + ': ' + counts[st] + '"></i>'; }).join('') + '</div>';
  }
  function bar(p, color) { return '<div class="rp3-bar"><i style="width:' + Math.max(2, Math.min(100, p)) + '%' + (color ? ';background:' + color : '') + '"></i></div>'; }
  function statusChip(st) { return '<span class="rp3-status"><i style="background:' + (COL[st] || '#94A3B8') + '"></i>' + e(st || '—') + '</span>'; }
  function mixTable(S, label) {
    var cols = '1.3fr 0.5fr 1.6fr 1.1fr 0.6fr';
    var head = '<div class="rp3-mix h" style="grid-template-columns:' + cols + '"><span>' + e(label) + '</span><span class="n">Projects</span><span>Status mix</span><span>Avg progress</span><span class="n">Overdue</span></div>';
    var rows = S.groups.sort(function (a, b) { return b.total - a.total || a.name.localeCompare(b.name); }).map(function (g) {
      return '<div class="rp3-mix" style="grid-template-columns:' + cols + '"><span class="nm">' + e(g.name) + '</span><span class="n">' + g.total + '</span>' + stack(g, g.total, true) + '<div class="pg">' + bar(Math.round(g.prog / g.total)) + '<b>' + Math.round(g.prog / g.total) + '%</b></div><span class="od' + (g.overdue ? ' bad' : '') + '">' + g.overdue + '</span></div>';
    }).join('');
    return head + (rows || '<div class="rp3-empty">Nothing to report.</div>');
  }
  function summaryGroups(P, keyFn) {
    var g = {};
    P.forEach(function (p) { keyFn(p).forEach(function (k) { if (!g[k]) { g[k] = { name: k, total: 0, prog: 0, overdue: 0 }; STATUSES.forEach(function (st) { g[k][st] = 0; }); } var r = g[k]; r.total++; r.prog += num(p.progress); var st = p.status || 'Not Started'; r[st] = (r[st] || 0) + 1; var d = days(toDate(p.end)); if (!isDone(p.status) && d != null && d < 0) r.overdue++; }); });
    return { groups: Object.keys(g).map(function (k) { return g[k]; }) };
  }
  function paintSummary() {
    var P = projects().filter(function (p) { return period === 'all' || inPeriod(toDate(p.end)); });
    var counts = {}; STATUSES.forEach(function (st) { counts[st] = 0; }); P.forEach(function (p) { var st = p.status || 'Not Started'; counts[st] = (counts[st] || 0) + 1; });
    var late = P.filter(function (p) { var d = days(toDate(p.end)); return !isDone(p.status) && d != null && d < 0; }).sort(function (a, b) { return days(toDate(a.end)) - days(toDate(b.end)); });
    var avg = P.length ? Math.round(P.reduce(function (a, p) { return a + num(p.progress); }, 0) / P.length) : 0;
    var noDept = P.filter(function (p) { return depts(p)[0] === '—'; }).length;
    var scopeDept = ''; try { scopeDept = (window.__scopeFilter && window.__scopeFilter.state().dept) || ''; } catch (_) {}
    var byDept = summaryGroups(P, function (p) { var d = depts(p); return d[0] === '—' && scopeDept ? [scopeDept] : d; });
    var bySub = summaryGroups(P, teams);
    var chips = [['On Track', 'rgba(52,211,153,.16)', '#059669', '#6EE7B7'], ['Not Started', 'rgba(59,130,246,.16)', '#1D4ED8', '#93C5FD'], ['At Risk', 'rgba(251,146,60,.16)', '#C2410C', '#FDBA74'], ['Delayed', 'rgba(239,68,68,.16)', '#B91C1C', '#FCA5A5'], ['On Hold', 'rgba(245,158,11,.16)', '#B45309', '#FCD34D'], ['Completed', 'rgba(167,139,250,.18)', '#6D28D9', '#C4B5FD']].filter(function (c) { return counts[c[0]]; });
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var worst = late[0] ? e(late[0].name) + ' · ' + Math.abs(days(toDate(late[0].end))) + ' days' + (late.length > 1 ? ' &nbsp;·&nbsp; ' + (late.length - 1) + ' more' : '') : 'Nothing overdue';
    return '<div class="rp3-grid4">' +
      '<div class="rp3-card" style="margin:0"><div class="rp3-k">Projects</div><div class="rp3-big">' + P.length + '</div><div class="rp3-chips">' + chips.map(function (c) { return '<span class="rp3-chip" style="background:' + c[1] + ';color:' + (dark ? c[3] : c[2]) + '">' + counts[c[0]] + ' ' + e(c[0].toLowerCase()) + '</span>'; }).join('') + '</div></div>' +
      '<div class="rp3-card rp3-ring" style="margin:0"><div><div class="rp3-k">Avg progress</div><div class="rp3-big">' + avg + '%</div><div class="rp3-small">across ' + P.length + ' projects</div></div><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--rp-track)" stroke-width="3.6"/><circle cx="18" cy="18" r="15.9" fill="none" stroke="#1677FF" stroke-width="3.6" stroke-linecap="round" stroke-dasharray="' + avg + ' 100" transform="rotate(-90 18 18)"/></svg></div>' +
      '<div class="rp3-card" style="margin:0"><div class="rp3-k">Completed</div><div class="rp3-big">' + counts['Completed'] + ' <span style="font-size:16px;color:' + (dark ? '#C4B5FD' : '#6D28D9') + '">' + pct(counts['Completed'], P.length) + '%</span></div>' + bar(pct(counts['Completed'], P.length), '#A78BFA') + '<div class="rp3-small" style="margin-top:8px">' + counts['Completed'] + ' of ' + P.length + ' delivered</div></div>' +
      '<div class="rp3-card' + (late.length ? ' red' : '') + '" style="margin:0"><div class="rp3-k">Overdue</div><div class="rp3-big">' + late.length + '</div><div class="rp3-small">' + worst + '</div></div></div>' +
      '<div class="rp3-card"><div class="rp3-ch"><h2>Status distribution</h2><span>' + P.length + ' projects' + (scopeDept ? ' · ' + e(scopeDept) : '') + '</span></div>' + stack(counts, P.length) + '<div class="rp3-legend">' + STATUSES.map(function (st) { return '<span><i style="background:' + COL[st] + '"></i>' + e(st) + ' <b>' + (counts[st] || 0) + '</b></span>'; }).join('') + '</div></div>' +
      '<div class="rp3-cols"><div class="rp3-card" style="margin:0"><div class="rp3-ch"><h2>By department</h2><span>' + byDept.groups.length + ' department' + (byDept.groups.length === 1 ? '' : 's') + '</span></div>' + mixTable(byDept, 'Department') +
      (noDept ? '<div class="rp3-note"><b>Data gap:</b> ' + noDept + ' of ' + P.length + ' projects have no department set in the project form' + (scopeDept ? '; they are grouped here under the department in scope' : '') + '. Set it on each project to see a true breakdown.</div>' : '') + '</div>' +
      '<div class="rp3-card" style="margin:0"><div class="rp3-ch"><h2>By sub-team</h2><span>' + bySub.groups.length + ' sub-team' + (bySub.groups.length === 1 ? '' : 's') + ' · sorted by projects</span></div>' + mixTable(bySub, 'Sub-team') + '</div></div>';
  }
  function cell(v, colName, isLast) {
    if (colName === 'Status') return '<td>' + statusChip(v) + '</td>';
    if (colName === 'Progress') { var p = parseInt(v, 10) || 0; return '<td><div class="rp3-pcell">' + bar(p) + '<b>' + p + '%</b></div></td>'; }
    var cls = typeof v === 'number' ? 'num' : '';
    if (/overdue/i.test(String(v))) cls += ' bad';
    if (/^(Done|Completed)$/i.test(String(v)) && isLast) cls += ' ok';
    if (typeof v === 'number' && colName === 'Overdue' && v > 0) cls += ' bad';
    return '<td class="' + cls.trim() + '">' + e(v) + '</td>';
  }
  function table(cols, rows) {
    if (!rows.length) return '<div class="rp3-empty">Nothing to report for this selection.</div>';
    return '<div class="rp3-tablewrap"><table class="rp3-table"><thead><tr>' + cols.map(function (c) { return '<th>' + e(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (v, i) { return cell(v, cols[i], i === r.length - 1); }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function tiles(summary) { return '<div class="rp3-grid4">' + summary.map(function (s, i) { var red = /overdue/i.test(s[0]) && parseInt(s[1], 10) > 0; return '<div class="rp3-card' + (red ? ' red' : '') + '" style="margin:0"><div class="rp3-k">' + e(s[0]) + '</div><div class="rp3-big" style="font-size:32px">' + e(s[1]) + '</div></div>'; }).join('') + '</div>'; }
  function paint() {
    var el = host(); if (!el || !visible) return;
    var scope = '', st = null; try { st = window.__scopeFilter && window.__scopeFilter.state(); } catch (_) {}
    var scopeTxt = st && (st.dept || st.team) ? e(st.dept || 'All departments') + '<span style="color:var(--rp-mut2)">→</span>' + e(st.team || 'All sub-teams') : 'All departments<span style="color:var(--rp-mut2)">→</span>All sub-teams';
    var d = new Date(), DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var n = projects().length, nItems = items().length;
    var body;
    if (tab === 'summary') body = paintSummary();
    else { var R = build(); body = (R.summary ? tiles(R.summary) : '') + '<div class="rp3-card"><div class="rp3-ch"><h2>' + e(R.title) + '</h2><span>' + R.rows.length + ' rows</span></div>' + table(R.columns, R.rows) + '</div>'; }
    var pick = [['summary', 'Portfolio summary', 'Status by department & sub-team'], ['projects', 'Project list', n + ' project' + (n === 1 ? '' : 's') + ' · custodian, lead, dates'], ['tasks', 'Tasks & milestones', nItems + ' item' + (nItems === 1 ? '' : 's') + ' · done, overdue, due soon'], ['workload', 'Team workload', 'Open items per person']];
    el.innerHTML = '<div class="rp3-head"><div><h1>Reports</h1><div class="rp3-sub"><b>' + n + ' project' + (n === 1 ? '' : 's') + '</b><span>in view</span><span class="rp3-dot"></span><span class="rp3-scope">' + scopeTxt + '</span><span class="rp3-dot"></span><span>' + DAYS[d.getDay()] + ', ' + fmt(d) + '</span></div></div>' +
      '<div class="rp3-actions"><div class="rp3-seg" role="group" aria-label="Period">' + [['all', 'All time'], ['month', 'This month'], ['quarter', 'Quarter'], ['year', 'Year'], ['next30', 'Next 30 days']].map(function (o) { return '<button type="button" data-period="' + o[0] + '"' + (period === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>'; }).join('') + '</div>' +
      '<button type="button" class="rp3-btn" data-rp="print">' + ICONS.print + 'Print / PDF</button>' +
      '<div class="rp3-export"><button type="button" class="rp3-btn primary" data-rp="menu" aria-haspopup="true">' + ICONS.down + 'Export to Excel<span style="width:1px;height:18px;background:rgba(255,255,255,.35);margin:0 2px"></span>' + ICONS.chev + '</button><div class="rp3-menu"><button type="button" data-rp="xlsx">This report</button><button type="button" data-rp="xlsx-all">All four reports (one workbook)</button></div></div></div></div>' +
      '<div class="rp3-pick">' + pick.map(function (p) { return '<button type="button" class="rp3-card-btn' + (tab === p[0] ? ' on' : '') + '" data-tab="' + p[0] + '"><span class="rp3-ico" style="color:' + ICON_COLOR[p[0]] + '">' + ICONS[p[0]] + '</span><span><b>' + e(p[1]) + '</b><span class="d">' + e(p[2]) + '</span></span></button>'; }).join('') + '</div>' +
      body +
      '<div class="rp3-foot"><span>Generated ' + fmt(d) + ' · Period: ' + periodLabel() + (st && (st.dept || st.team) ? ' · Scope: ' + e(st.dept || '') + (st.team ? ' → ' + e(st.team) : '') : '') + ' · ' + n + ' project' + (n === 1 ? '' : 's') + ' in view</span><span>Printing hides the navigation and keeps each card on one page</span></div>';
  }
  function onClick(ev) {
    var t = ev.target.closest('[data-tab]'); if (t) { tab = t.getAttribute('data-tab'); paint(); return; }
    var pr = ev.target.closest('[data-period]'); if (pr) { period = pr.getAttribute('data-period'); paint(); return; }
    var a = ev.target.closest('[data-rp]');
    if (!a) { var open = document.querySelector('#reportsView .rp3-export.open'); if (open) open.classList.remove('open'); return; }
    var k = a.getAttribute('data-rp');
    if (k === 'menu') { a.parentElement.classList.toggle('open'); return; }
    if (k === 'print') window.print();
    else if (k === 'xlsx') exportXlsx([build()]);
    else if (k === 'xlsx-all') exportXlsx([rSummary(), rProjects(), rTasks(), rWorkload()]);
    var m = a.closest('.rp3-export'); if (m) m.classList.remove('open');
  }
  document.addEventListener('click', function (ev) { if (!ev.target.closest('#reportsView .rp3-export')) { var o = document.querySelector('#reportsView .rp3-export.open'); if (o) o.classList.remove('open'); } });

  /* ---------- export ---------- */
  function sheetRows(R) {
    var out = [[R.title], ['Period: ' + periodLabel() + ' · generated ' + fmt(new Date())], []];
    if (R.summary) { R.summary.forEach(function (s) { out.push([s[0], s[1]]); }); out.push([]); }
    if (R.sections) R.sections.forEach(function (S) { out.push(['By ' + S.title.toLowerCase()]); out.push(S.columns); S.rows.forEach(function (r) { out.push(r); }); out.push([]); });
    else { out.push(R.columns); R.rows.forEach(function (r) { out.push(r); }); }
    return out;
  }
  function exportXlsx(reports) {
    var stamp = new Date().toISOString().slice(0, 10);
    if (typeof XLSX !== 'undefined' && XLSX.utils) {
      var wb = XLSX.utils.book_new();
      reports.forEach(function (R) { var ws = XLSX.utils.aoa_to_sheet(sheetRows(R)); ws['!cols'] = (R.columns || (R.sections && R.sections[0].columns) || []).map(function () { return { wch: 22 }; }); XLSX.utils.book_append_sheet(wb, ws, R.title.replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31)); });
      XLSX.writeFile(wb, 'jaffer-reports-' + stamp + '.xlsx');
      return;
    }
    // no spreadsheet library: one CSV per report
    reports.forEach(function (R) {
      var csv = sheetRows(R).map(function (r) { return r.map(function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' })); a.download = R.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + stamp + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    });
  }

  /* ---------- show / hide + routing ---------- */
  function shell(hidden) { SHELL.forEach(function (id) { var el = document.getElementById(id); if (el) el.classList.toggle('rp3-shell-hidden', hidden); }); var foot = document.querySelector('#appContent>.foot'); if (foot) foot.classList.toggle('rp3-shell-hidden', hidden); }
  function setActive() { document.querySelectorAll('#sidebarNav .nav-item').forEach(function (n) { n.classList.toggle('on', n.getAttribute('data-real-view') === 'reports'); }); }
  window.showReportsV3 = function () {
    ['hideTasksV3', 'hideIssuesV3', 'hideMilestonesV3', 'hideTimelineV3', 'hideCalendarV3'].forEach(function (f) { try { if (typeof window[f] === 'function') window[f](); } catch (_) {} });
    try { document.body.classList.remove('view-dashboard', 'view-projects', 'view-kanban', 'view-tasks', 'view-issues', 'view-milestones', 'view-timeline', 'view-calendar'); document.body.classList.add('view-reports'); } catch (_) {}
    try { view = 'reports'; } catch (_) {}   // the app's own repaints follow this; otherwise the Projects page keeps redrawing its header
    visible = true; shell(true);
    var el = host(); if (el) { el.hidden = false; el.classList.remove('hidden'); }
    try { if (location.hash !== '#reports') history.replaceState(null, '', '#reports'); } catch (_) {}
    paint(); setActive(); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  // while open, keep other pages' body classes and headers out (some pages re-add them on repaint)
  setInterval(function () {
    if (!visible) return;
    ['view-dashboard', 'view-projects', 'view-kanban', 'view-tasks', 'view-issues', 'view-milestones', 'view-timeline', 'view-calendar'].forEach(function (c) { if (document.body.classList.contains(c)) document.body.classList.remove(c); });
    if (!document.body.classList.contains('view-reports')) document.body.classList.add('view-reports');
    shell(true);
  }, 300);
  window.hideReportsV3 = function () {
    if (!visible) return; visible = false; shell(false);
    try { document.body.classList.remove('view-reports'); } catch (_) {}
    var el = document.getElementById('reportsView'); if (el) { el.hidden = true; el.classList.add('hidden'); }
  };
  try {
    var prevShow = window.showRealSection;
    if (typeof prevShow === 'function') window.showRealSection = function (mode) {
      if (String(mode || '').toLowerCase() === 'reports') return window.showReportsV3();
      window.hideReportsV3(); return prevShow.apply(this, arguments);
    };
    var prevSet = window.setView;
    if (typeof prevSet === 'function') window.setView = function (v) { if (String(v || '').toLowerCase() !== 'reports') window.hideReportsV3(); return prevSet.apply(this, arguments); };
    var prevRender = render;
    render = function () { var r = prevRender.apply(this, arguments); if (visible) setTimeout(paint, 0); return r; };
  } catch (_) {}

  /* sidebar item + command palette */
  function nav() {
    var n = document.getElementById('sidebarNav'); if (!n || document.getElementById('tabReports')) return;
    var after = document.getElementById('tabCalendar');
    var b = document.createElement('button'); b.type = 'button'; b.className = 'nav-item'; b.id = 'tabReports'; b.setAttribute('data-real-view', 'reports'); b.setAttribute('onclick', "showRealSection('reports')");
    b.innerHTML = '<span class="nav-ico"><i data-lucide="file-text"></i></span><span class="nav-label">Reports</span>';
    if (after && after.parentElement === n) after.insertAdjacentElement('afterend', b); else n.appendChild(b);
    try { if (window.lucide && window.lucide.createIcons) window.lucide.createIcons(); } catch (_) {}
    if (visible) setActive();
  }
  try { new MutationObserver(function () { nav(); }).observe(document.body, { childList: true, subtree: true }); } catch (_) {}
  nav();
  try { if (Array.isArray(CMD_ACTIONS) && !CMD_ACTIONS.some(function (x) { return x.id === 'reports'; })) { var idx = CMD_ACTIONS.findIndex(function (x) { return x.id === 'users'; }); var item = { id: 'reports', label: 'Reports', icon: 'file-text', run: function () { showRealSection('reports'); } }; if (idx >= 0) CMD_ACTIONS.splice(idx, 0, item); else CMD_ACTIONS.push(item); } } catch (_) {}

  /* deep link: #reports on load */
  function boot() { if (/^#reports$/i.test(location.hash)) { var t = 0, iv = setInterval(function () { try { if ((currentUser && Array.isArray(data)) || ++t > 40) { clearInterval(iv); showRealSection('reports'); } } catch (_) { if (++t > 40) clearInterval(iv); } }, 250); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('hashchange', function () { if (/^#reports$/i.test(location.hash) && !visible) showRealSection('reports'); });
})();
