/*  Scope filter — Department → Sub-team on every page
 *
 *  A slim row at the top of the content area with two dropdowns. Whatever is picked here
 *  narrows the project list that EVERY page draws from (Overview, Projects, Board, Tasks,
 *  Issues, Milestones, Timeline, Calendar), so the pages' own filters work on top of it.
 *
 *  Locking follows the user's own scope (users.department / users.team, as saved by the
 *  Users form):
 *    one department          -> Department is fixed
 *    several departments     -> Department offers only those (+ "All my departments")
 *    All departments / admin -> every department
 *    one sub-team            -> Sub-team is fixed
 *    several sub-teams       -> Sub-team offers only those
 *    All sub-teams (*)       -> every sub-team of the chosen department(s)
 *
 *  Load order: after every *-v3.js (it wraps applyPayload / applyProjects / loadIssues).
 */
(function () {
  'use strict';

  var KEY = 'jbg-scope-filter';
  var state = load();
  var full = null;           // unfiltered project list
  var applying = false;

  /* ---------- small helpers ---------- */
  function lc(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function parseList(v) {
    var raw = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,;]+/), out = [];
    raw.forEach(function (x) { x = String(x == null ? '' : x).trim(); if (x && !out.some(function (y) { return lc(y) === lc(x); })) out.push(x); });
    return out;
  }
  function splitAll(v) { var t = parseList(v), all = t.some(function (x) { return /^(all|\*)$/i.test(x); }); return { all: all, list: all ? [] : t }; }
  function aliases(d) {
    var out = [String(d || '').trim()], l = lc(d);
    if (['group it', 'it / git', 'it/git', 'it', 'git'].indexOf(l) >= 0) ['Group IT', 'IT / GIT'].forEach(function (a) { if (!out.some(function (x) { return lc(x) === lc(a); })) out.push(a); });
    return out;
  }
  function sameDept(a, b) { return !!lc(a) && aliases(b).some(function (x) { return lc(x) === lc(a); }); }
  function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { dept: String(s.dept || ''), team: String(s.team || ''), person: String(s.person || '') }; } catch (_) { return { dept: '', team: '', person: '' }; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }

  function me() { try { return currentUser || null; } catch (_) { return null; } }
  function meta() { try { return orgMeta || {}; } catch (_) { return {}; } }
  function route() { return (location.hash || '').replace(/^#/, '').trim().toLowerCase(); }
  function allDepartments() {
    var out = parseList(meta().departments || []);   // configured departments first, in their configured order
    (full || []).forEach(function (p) { projDepts(p).forEach(function (d) { if (!out.some(function (o) { return sameDept(d, o); })) out.push(d); }); });
    return out;
  }
  function configTeams(dept) {   // sub-teams configured under a department (Users page -> Departments & teams)
    var out = [], map = meta().teamsByDepartment || {};
    Object.keys(map).forEach(function (k) { if (Array.isArray(map[k]) && sameDept(k, dept)) map[k].forEach(function (t) { t = String(t || '').trim(); if (t && !out.some(function (x) { return lc(x) === lc(t); })) out.push(t); }); });
    return out;
  }
  function teamsFor(dept) {
    var out = [], map = meta().teamsByDepartment || {};
    Object.keys(map).forEach(function (k) { if (Array.isArray(map[k]) && sameDept(k, dept)) map[k].forEach(function (t) { t = String(t || '').trim(); if (t && !out.some(function (x) { return lc(x) === lc(t); })) out.push(t); }); });
    (full || []).forEach(function (p) { if (projDepts(p).some(function (d) { return sameDept(d, dept); })) projTeams(p).forEach(function (t) { if (!out.some(function (x) { return lc(x) === lc(t); })) out.push(t); }); });
    return out;
  }
  // `category` is the project type / sub-team ("Networking", "Documentation"…), NOT a department.
  function projDepts(p) { return parseList((p.departments && p.departments.length) ? p.departments : [p.department]); }
  // a project's sub-team is its teams[] AND its old `category` label (the Projects table shows the latter)
  function projTeams(p) { return parseList([].concat(p.teams && p.teams.length ? p.teams : [p.team], [p.category])); }

  /* ---------- what this user may pick ---------- */
  function limits() {
    var u = me() || {}, d = splitAll(u.department), t = splitAll(u.team);
    var admin = u.role === 'admin' || (u.role === 'manager' && !d.list.length && !t.list.length);
    var depts = (admin || d.all || !d.list.length) ? allDepartments() : d.list.map(function (x) { return allDepartments().filter(function (o) { return sameDept(x, o); })[0] || x; });
    var deptLocked = !admin && !d.all && d.list.length === 1;
    var teamLocked = !admin && !t.all && t.list.length === 1;
    var teamLimited = !admin && !t.all && t.list.length > 1 ? t.list : null;   // several specific sub-teams
    // sub-teams shown depend on the department(s) currently in play
    var deptsInPlay = state.dept ? depts.filter(function (o) { return sameDept(state.dept, o); }) : depts;
    var teams = [];
    deptsInPlay.forEach(function (dep) { teamsFor(dep).forEach(function (t2) { if (!teams.some(function (x) { return lc(x) === lc(t2); })) teams.push(t2); }); });
    if (teamLimited) teams = teamLimited.slice();
    return { depts: depts, deptLocked: deptLocked, teams: teams, teamLocked: teamLocked, lockedTeam: teamLocked ? t.list[0] : '' , lockedDept: deptLocked ? depts[0] : '' };
  }

  /* ---------- filtering ---------- */
  function splitNames(v) { var out = []; [].concat(v || []).forEach(function (x) { String(x == null ? '' : x).split(/\s*[,;&]\s*|\s+and\s+/i).forEach(function (n) { n = n.trim(); if (n && out.indexOf(n) < 0) out.push(n); }); }); return out; }
  function projPeople(p) {
    var out = splitNames([].concat(p.owners || [], p.leads || [], [p.owner, p.lead]));
    (p.milestones || []).forEach(function (m) { splitNames([].concat(m.owners || [], m.leads || [], [m.owner, m.lead, m.assignee])).forEach(function (n) { if (out.indexOf(n) < 0) out.push(n); }); });
    return out;
  }
  function knownNames() { var names = {}; try { (assignableUsers || []).forEach(function (u) { if (u && u.name) names[lc(u.name)] = 1; }); } catch (_) {} (full || []).forEach(function (p) { projPeople(p).forEach(function (n) { names[lc(n)] = 1; }); }); return names; }
  function personHit(names) {
    var q = lc(state.person); if (!q) return true;
    names = splitNames(names);
    if (knownNames()[q]) return names.some(function (n) { return lc(n) === q; });   // an exact known name = that person only
    return names.some(function (n) { return lc(n).indexOf(q) >= 0; });
  }
  function keep(p) {
    if (state.person && !personHit(projPeople(p))) return false;
    // A sub-team pick is the more specific one, so it decides on its own; the department check only
    // applies when no sub-team is chosen (projects' department fields are not always filled in).
    if (state.team) return projTeams(p).some(function (t) { return lc(t) === lc(state.team); }) || projDepts(p).some(function (d) { return sameDept(d, state.team); });
    if (state.dept) {
      if (projDepts(p).some(function (d) { return sameDept(d, state.dept); })) return true;
      // or its sub-team / old label is one of that department's configured sub-teams
      var cfg = configTeams(state.dept);
      return projTeams(p).some(function (t) { return cfg.some(function (c) { return lc(c) === lc(t); }); });
    }
    return true;
  }
  function sync() {
    // anything a page added straight into `data` (new project) is folded into the full list
    var cur; try { cur = Array.isArray(data) ? data : []; } catch (_) { cur = []; }
    if (!full) full = cur.slice();
    else cur.forEach(function (p) { if (!full.some(function (q) { return String(q.id) === String(p.id); })) full.push(p); });
  }
  function apply() {
    sync();
    var lim = limits();
    // Only judge a saved choice once the department list is really known (org meta or projects
    // loaded); before that, a slow server made "HR" look unknown and the choice was wiped.
    var known = lim.depts.length > 0;
    if (!lim.deptLocked && known && state.dept && !lim.depts.some(function (o) { return sameDept(state.dept, o); })) state.dept = '';
    if (!lim.teamLocked && known && state.team && !lim.teams.some(function (o) { return lc(o) === lc(state.team); })) state.team = '';
    // a department / sub-team locked by the user's account always wins, even if Departments & teams does not list it
    if (lim.deptLocked) state.dept = lim.lockedDept;
    if (lim.teamLocked) state.team = lim.lockedTeam;
    try { data = full.filter(keep); } catch (_) {}
    filterStandalone();
    filterIssues();
    paintBar(lim);
  }
  /* Direct tasks and issues belong to no project. Under a scope they are kept only when one of
     their people is a portal user in the scoped department (and sub-team, if one is chosen). */
  function userMap() {
    var m = {}; try { (assignableUsers || []).forEach(function (u) { if (u && u.name) m[lc(u.name)] = u; }); } catch (_) {}
    return m;
  }
  function personInScope(name, users) {
    var u = users[lc(name)]; if (!u) return false;
    var d = splitAll(u.department), t = splitAll(u.team);
    // "All" / blank does not count: a direct item only follows an owner who is specifically in the scope
    var deptOk = !state.dept || d.list.some(function (x) { return sameDept(x, state.dept); });
    var teamOk = !state.team || t.list.some(function (x) { return lc(x) === lc(state.team); });
    return deptOk && teamOk;
  }
  function keepDirect(item) {
    var users = userMap(), names = [].concat(item.owners || [], item.leads || [], [item.owner, item.lead, item.assignee, item.assigneeName, item.reporter]).map(function (n) { return String(n || '').trim(); }).filter(Boolean);
    if (state.person && !personHit(names)) return false;
    if (!(state.dept || state.team)) return true;
    return names.some(function (n) { return personInScope(n, users); });
  }
  var fullStandalone = null;
  function filterStandalone() {
    try {
      if (!Array.isArray(standalone)) return;
      if (!fullStandalone) fullStandalone = standalone.slice();
      standalone = (state.dept || state.team || state.person) ? fullStandalone.filter(keepDirect) : fullStandalone.slice();
    } catch (_) {}
  }
  function keepIssue(i) {
    if (state.person && !personHit([i.owner, i.assignee, i.reporter, i.assigneeName, i.ownerName].map(function (n) { return String(n || ''); }))) {
      var pr = (data || []).filter(function (p) { return String(p.id) === String(i.projectId); })[0];
      if (!(pr && personHit(projPeople(pr)))) return false;
    }
    if (i.projectId) { var ok = (data || []).some(function (p) { return String(p.id) === String(i.projectId); }); return ok; }
    return keepDirect(i);
  }
  // issues are fetched by two different code paths, so filter the API response itself
  try {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var p = origFetch.apply(this, arguments);
      if (method !== 'GET' || !/^\/api\/issues(\?|$)/.test(url) || !(state.dept || state.team || state.person)) return p;
      return p.then(function (res) {
        if (!res.ok) return res;
        return res.clone().json().then(function (j) {
          if (!j || !Array.isArray(j.issues)) return res;
          j.issues = j.issues.filter(keepIssue);
          if (typeof j.total === 'number') j.total = j.issues.length;
          if (typeof j.count === 'number') j.count = j.issues.length;
          return new Response(JSON.stringify(j), { status: res.status, statusText: res.statusText, headers: { 'content-type': 'application/json' } });
        }).catch(function () { return res; });
      });
    };
  } catch (_) {}
  var fullIssues = null;
  function filterIssues() {
    try {
      if (!Array.isArray(issuesList)) return;
      if (!fullIssues || issuesList !== lastIssuesRef) { fullIssues = issuesList.slice(); }
      var ids = {}; (data || []).forEach(function (p) { ids[String(p.id)] = 1; });
      var active = !!(state.dept || state.team || state.person);
      issuesList = active ? fullIssues.filter(function (i) { return !i.projectId ? (!state.team && (!state.dept || sameDept(i.department, state.dept))) : !!ids[String(i.projectId)]; }) : fullIssues.slice();
      lastIssuesRef = issuesList;
    } catch (_) {}
  }
  var lastIssuesRef = null;

  function repaint() {
    try { render(); } catch (_) {}
    var r = route(), fn = { tasks: 'showTasksV3', issues: 'showIssuesV3', milestones: 'showMilestonesV3', timeline: 'showTimelineV3', calendar: 'showCalendarV3' }[r];
    try { if (fn && typeof window[fn] === 'function') window[fn](); } catch (_) {}
    try { if (r === 'issues' && typeof loadIssues === 'function') loadIssues(); } catch (_) {}
    try { if (typeof window.__pj3Paint === 'function' && r === 'projects') window.__pj3Paint(); } catch (_) {}
  }

  /* ---------- the bar ---------- */
  function css() {
    if (document.getElementById('scf-css')) return;
    var s = document.createElement('style'); s.id = 'scf-css';
    s.textContent = [
      '#scopeBar{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;margin:0 0 14px;padding:8px 12px;border:1px solid var(--border,#E2E8F0);border-radius:10px;background:var(--surface,#fff);font-size:12px;color:var(--muted,#64748B)}',
      'html[data-theme="dark"] #scopeBar{background:var(--surface-elevated,#111C2E);border-color:var(--border,#233249)}',
      '#scopeBar .scf-lab{font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:10.5px;margin-right:2px}',
      '#scopeBar select{height:32px;min-width:150px;padding:0 30px 0 10px;border:1px solid var(--border,#E2E8F0);border-radius:6px;background:var(--surface,#fff);color:var(--ink,#0F172A);font:inherit;font-size:12px;font-weight:600;cursor:pointer;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 20 20%27%3E%3Cpath fill=%27none%27 stroke=%27%2394A3B8%27 stroke-width=%271.8%27 stroke-linecap=%27round%27 d=%27M6 8l4 4 4-4%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;background-size:14px}',
      'html[data-theme="dark"] #scopeBar select{background-color:var(--surface,#0B1220);border-color:var(--border,#233249);color:#F8FAFC}',
      '#scopeBar select:focus-visible{outline:none;box-shadow:var(--focus-ring,0 0 0 3px rgba(22,119,255,.35))}',
      '#scopeBar select[disabled]{cursor:default;opacity:.85;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2394A3B8%27 stroke-width=%272%27 stroke-linecap=%27round%27%3E%3Crect x=%275%27 y=%2711%27 width=%2714%27 height=%279%27 rx=%272%27/%3E%3Cpath d=%27M8 11V8a4 4 0 0 1 8 0v3%27/%3E%3C/svg%3E")}',
      '#scopeBar .scf-arrow{opacity:.5}',
      '#scopeBar .scf-sum{margin-left:auto;white-space:nowrap}',
      '#scopeBar .scf-sum b{color:var(--ink,#0F172A);font-weight:700}',
      '#scopeBar .scf-clear{border:0;background:transparent;color:#1677FF;font:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:4px 6px;border-radius:6px}',
      '#scopeBar .scf-clear:hover{background:rgba(22,119,255,.10)}',
      'body.view-users #scopeBar,body.view-departments #scopeBar{display:none}',
      '@media (max-width:640px){#scopeBar .scf-sum{margin-left:0;width:100%}#scopeBar select{flex:1;min-width:120px}}',
      /* each page's own filter row lives inside the Scope row */
      '#scopeBar .scf-page{display:flex;align-items:center;flex-wrap:wrap;gap:8px;flex:1 1 auto;min-width:0}',
      'html body #scopeBar .scf-page > *{display:none!important;margin:0!important;padding:0!important;order:0!important;position:static!important}',
      'html body.view-dashboard #scopeBar #ovFilters,html body.view-projects #scopeBar #pjToolbar,html body.view-kanban #scopeBar #kbToolbar,html body.view-timeline #scopeBar .tl3-filters-row{display:flex!important;margin:0!important;padding:0!important;flex-wrap:wrap!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;width:auto!important;flex:1 1 auto!important;min-height:0!important}',
      '#scopeBar .scf-page select,#scopeBar .scf-page .tl3-mode{height:32px!important;min-width:140px!important;font-size:12px!important;font-weight:600!important;border-radius:6px!important}',
      '#scopeBar #pjToolbar .pj3-filters,#scopeBar #kbToolbar .kb3-filters,#scopeBar .tl3-filters{display:flex!important;flex-wrap:wrap!important;gap:8px!important;width:auto!important;padding:0!important;align-items:center!important}',
      '#scopeBar #pjToolbar .pj3-actions{margin-left:auto!important}',
      '#scopeBar .tl3-filter{flex-direction:row!important;align-items:center!important}#scopeBar .tl3-filter>span{display:none!important}',
      /* the scope row already has Department: hide the duplicates */
      '#scopeBar #pj3Cat,#scopeBar #tl3Dept{display:none!important}',
      '#scopeBar .scf-sep{width:1px;height:22px;background:var(--border,#E2E8F0);margin:0 2px}',
      '#scopeBar .scf-person{position:relative;display:inline-flex;align-items:center}#scopeBar .scf-person svg{position:absolute;left:9px;width:14px;height:14px;color:var(--muted,#64748B);pointer-events:none}',
      '#scopeBar .scf-person input{height:32px;min-width:190px;padding:0 10px 0 29px;border:1px solid var(--border,#E2E8F0);border-radius:6px;background:var(--surface,#fff);color:var(--ink,#0F172A);font:inherit;font-size:12px;font-weight:600}',
      'html[data-theme="dark"] #scopeBar .scf-person input{background-color:var(--surface,#0B1220);border-color:var(--border,#233249);color:#F8FAFC}',
      '#scopeBar .scf-person input:focus-visible{outline:none;box-shadow:var(--focus-ring,0 0 0 3px rgba(22,119,255,.35))}#scopeBar .scf-person input::placeholder{color:var(--muted,#64748B);font-weight:500}',
      '#scopeBar .scf-person input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none;height:12px;width:12px;background:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2394A3B8%27 stroke-width=%273%27 stroke-linecap=%27round%27%3E%3Cpath d=%27M6 6l12 12M18 6L6 18%27/%3E%3C/svg%3E") center/contain no-repeat;cursor:pointer}',
      'html[data-theme="dark"] #scopeBar .scf-sep{background:var(--border,#233249)}',
      'body:not(.view-dashboard):not(.view-projects):not(.view-kanban):not(.view-timeline) #scopeBar .scf-sep{display:none}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function bar() {
    var host = document.getElementById('appContent'); if (!host) return null;
    var b = document.getElementById('scopeBar');
    if (!b) {
      css();
      b = document.createElement('div'); b.id = 'scopeBar'; b.setAttribute('role', 'group'); b.setAttribute('aria-label', 'Department and sub-team filter');
      b.innerHTML = '<span class="scf-lab">Scope</span><span class="scf-dept"></span><span class="scf-arrow" aria-hidden="true">→</span><span class="scf-team"></span><span class="scf-person"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" id="scfPerson" list="scfPeople" placeholder="Search people…" aria-label="Filter by person" autocomplete="off"><datalist id="scfPeople"></datalist></span><span class="scf-sep" aria-hidden="true"></span><div class="scf-page"></div><span class="scf-sum"></span>';
      host.insertBefore(b, host.firstChild);
      b.addEventListener('change', function (ev) {
        if (ev.target.id === 'scfDept') { state.dept = ev.target.value; state.team = ''; }
        else if (ev.target.id === 'scfTeam') state.team = ev.target.value;
        else if (ev.target.id === 'scfPerson') state.person = ev.target.value.trim();
        else return;
        save(); apply(); repaint();
      });
      var pt = null;
      b.addEventListener('input', function (ev) {
        if (ev.target.id !== 'scfPerson') return;
        var v = ev.target.value.trim(); clearTimeout(pt);
        pt = setTimeout(function () { if (v !== state.person) { state.person = v; save(); apply(); repaint(); var inp = document.getElementById('scfPerson'); if (inp && document.activeElement !== inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } } }, 350);
      });
      b.addEventListener('keydown', function (ev) { if (ev.target.id === 'scfPerson' && ev.key === 'Enter') { ev.preventDefault(); clearTimeout(pt); state.person = ev.target.value.trim(); save(); apply(); repaint(); } });
      b.addEventListener('click', function (ev) { if (ev.target.closest('.scf-clear')) { state = { dept: '', team: '', person: '' }; save(); apply(); repaint(); } });
    }
    return b;
  }
  /* Move each page's filter row into the Scope row (pages find them by id, so they keep working). */
  var ADOPT = ['#ovFilters', '#pjToolbar', '#kbToolbar', '.tl3-filters-row'];
  function adopt() {
    var b = document.getElementById('scopeBar'); if (!b) return; var slot = b.querySelector('.scf-page'); if (!slot) return;
    // pages prepend their own header into the content area; the Scope row stays first
    var host = document.getElementById('appContent'); if (host && host.firstElementChild !== b) { try { host.insertBefore(b, host.firstChild); } catch (_) {} }
    ADOPT.forEach(function (sel) {
      var el = document.querySelector(sel); if (!el || slot.contains(el)) return;
      try { slot.appendChild(el); } catch (_) {}
    });
  }
  var adoptTimer = null;
  try { new MutationObserver(function () { clearTimeout(adoptTimer); adoptTimer = setTimeout(adopt, 60); }).observe(document.body, { childList: true, subtree: true }); } catch (_) {}
  function opts(list, cur, allLabel) {
    return '<option value="">' + esc(allLabel) + '</option>' + list.map(function (v) { return '<option value="' + esc(v) + '"' + (lc(v) === lc(cur) ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
  }
  function paintBar(lim) {
    var b = bar(); if (!b) return;
    var r = route(); b.style.display = (r === 'users' || r === 'departments') ? 'none' : '';   // people pages are not project-scoped
    var n; try { n = data.length; } catch (_) { n = 0; }
    var deptAll = lim.depts.length > 1 ? (lim.depts.length === allDepartments().length ? 'All departments' : 'All my departments') : 'All departments';
    var teamAll = !lim.teams.length ? 'No sub-teams' : (state.dept ? 'All sub-teams' : 'All sub-teams');
    var deptSel = lim.deptLocked
      ? '<select id="scfDept" disabled title="Your account is limited to this department"><option>' + esc(lim.lockedDept) + '</option></select>'
      : '<select id="scfDept" aria-label="Department">' + opts(lim.depts, state.dept, deptAll) + '</select>';
    var teamSel = lim.teamLocked
      ? '<select id="scfTeam" disabled title="Your account is limited to this sub-team"><option>' + esc(lim.lockedTeam) + '</option></select>'
      : '<select id="scfTeam" aria-label="Sub-team"' + (!lim.teams.length ? ' disabled' : '') + '>' + opts(lim.teams, state.team, teamAll) + '</select>';
    var active = !!((state.dept && !lim.deptLocked) || (state.team && !lim.teamLocked) || state.person);
    var where = state.dept ? state.dept + (state.team ? ' · ' + state.team : '') : (state.team ? state.team : 'everything you can see');
    if (state.person) where = (state.dept || state.team ? where + ' · ' : '') + '\u201c' + state.person + '\u201d';
    b.querySelector('.scf-dept').innerHTML = deptSel;
    b.querySelector('.scf-team').innerHTML = teamSel;
    var inp = b.querySelector('#scfPerson'); if (inp && document.activeElement !== inp && inp.value !== state.person) inp.value = state.person;
    var dl = b.querySelector('#scfPeople'); if (dl) { var names = {}; try { (assignableUsers || []).forEach(function (u) { if (u && u.name) names[u.name] = 1; }); } catch (_) {} (full || []).forEach(function (p) { projPeople(p).forEach(function (n) { names[n] = 1; }); }); try { (standalone || []).forEach(function (m) { splitNames([].concat(m.owners || [], [m.owner, m.assignee])).forEach(function (n) { names[n] = 1; }); }); } catch (_) {} dl.innerHTML = Object.keys(names).sort().map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join(''); }
    b.querySelector('.scf-sum').innerHTML = '<b>' + n + '</b> project' + (n === 1 ? '' : 's') + ' · ' + esc(where) + (active ? ' <button type="button" class="scf-clear">Clear</button>' : '');
    adopt();
  }

  /* ---------- hooks ---------- */
  function wrap(name, after) {   // applyPayload / applyProjects are top-level function declarations, i.e. window props
    try {
      var prev = window[name];
      if (typeof prev !== 'function') return;
      window[name] = function () { var r = prev.apply(this, arguments); after(r); return r; };
    } catch (_) {}
  }
  function onData() { full = null; fullStandalone = null; apply(); }
  try {
    var prevMeta = window.loadOrgMeta;
    if (typeof prevMeta === 'function') window.loadOrgMeta = function () { var r = prevMeta.apply(this, arguments); var again = function () { try { apply(); } catch (_) {} }; if (r && r.then) r.then(again, again); else again(); return r; };
  } catch (_) {}
  wrap('applyPayload', onData);
  wrap('applyProjects', onData);
  try {
    var prevLoadIssues = loadIssues;
    loadIssues = function () {
      var r = prevLoadIssues.apply(this, arguments);
      var done = function () { fullIssues = null; filterIssues(); };
      if (r && typeof r.then === 'function') return r.then(function (v) { done(); try { if (route() === 'issues' && typeof window.showIssuesV3 === 'function') window.showIssuesV3(); } catch (_) {} return v; });
      done(); return r;
    };
  } catch (_) {}
  // user / org meta arrive after the first paint; redraw the bar when they do
  function ready() { try { return !!(currentUser && Array.isArray(data)); } catch (_) { return false; } }
  var tries = 0, t = setInterval(function () { if (ready() || ++tries > 60) { clearInterval(t); if (ready()) { apply(); repaint(); } } }, 250);
  // the sidebar changes the URL with replaceState (no hashchange event), so watch the route directly
  var lastRoute = null;
  setInterval(function () {
    var r = route(); if (r === lastRoute) return; var prevRoute = lastRoute; lastRoute = r;
    try { paintBar(limits()); } catch (_) {}
    // The Projects page's search box feeds the whole portfolio filter (#q). Leaving Projects clears it,
    // so a search there never quietly filters the Overview, Board, Tasks and Reports.
    if (prevRoute !== null && prevRoute !== r && r !== 'projects') {
      try {
        var q = document.getElementById('q'), pjq = document.getElementById('pj3Search'), had = !!(q && q.value);
        if (q) q.value = ''; if (pjq) pjq.value = '';
        if (had && typeof render === 'function') render();
      } catch (_) {}
    }
  }, 300);
  /* Overview "Team Members" counts every portal user on top of the projects' people, so it never
     shrinks with the scope. While a scope is active, count only the people on the scoped projects. */
  function scopedPeople() {
    var names = {};
    function add(v) { [].concat(v || []).forEach(function (n) { n = String(n || '').trim(); if (n) names[lc(n)] = 1; }); }
    (data || []).forEach(function (p) {
      add(p.owners && p.owners.length ? p.owners : p.owner); add(p.leads && p.leads.length ? p.leads : p.lead);
      (p.milestones || []).forEach(function (m) { add(m.owners && m.owners.length ? m.owners : m.owner); add(m.leads && m.leads.length ? m.leads : m.lead); });
    });
    return Object.keys(names).length;
  }
  function fixTeamTile() {
    if (!(state.dept || state.team || state.person)) return;
    var r = route(); if (r && r !== 'dashboard' && r !== 'overview') return;
    var tile = Array.prototype.filter.call(document.querySelectorAll('#kpis .ov3-kpi'), function (t) { var l = t.querySelector('.kpi-analytics-label'); return l && /team members/i.test(l.textContent); })[0];
    if (!tile) return;
    var val = tile.querySelector('.kpi-analytics-value'), pill = tile.querySelector('.kpi-analytics-pill');
    var live = (data || []).filter(function (p) { return p.status !== 'Completed'; }).length;
    if (val) val.textContent = String(scopedPeople());
    if (pill) pill.textContent = (state.person ? 'matching \u201c' + state.person + '\u201d' : 'in ' + (state.team || state.dept)) + '  |  ' + live + ' live';
  }
  try {
    var prevKpis = window.renderKPIs;
    if (typeof prevKpis === 'function') window.renderKPIs = function () { var r = prevKpis.apply(this, arguments); setTimeout(fixTeamTile, 0); setTimeout(fixTeamTile, 400); return r; };
  } catch (_) {}
  var prevRepaint = repaint; repaint = function () { prevRepaint(); setTimeout(fixTeamTile, 50); setTimeout(fixTeamTile, 500); };

  /* The app's loader "bootstraps" Group IT projects when none of the visible projects has a gp… id.
     That call is Admin-only, so every scoped (non-admin) user got a 403 and an empty page.
     Same loader, but seed/bootstrap only for Admins, and only when the list is empty. */
  try {
    var origLoad = loadFromDb;
    loadFromDb = async function () {
      try {
        await loadCurrentUser();
        await api('/health');
        var payload = await api('/projects');
        var admin = !!(currentUser && currentUser.role === 'admin');
        if (admin && !(payload.projects || []).length) {
          payload = await api('/seed', { method: 'POST', body: '{}' });
          if (!(payload.projects || []).some(function (p) { return String(p.id).startsWith('gp'); })) payload = await api('/bootstrap-git', { method: 'POST', body: '{}' });
        }
        applyPayload(payload);
        dbOnline = true;
        setDbStatus('MySQL  |  ' + data.length + ' projects', true);
        render();
      } catch (err) {
        console.error(err);
        dbOnline = false;
        data = data || []; standalone = standalone || [];
        setDbStatus('MySQL unavailable - ' + err.message, false);
        render();
      }
    };
    // The first load started before this file loaded. Re-run it (once) only if that load FAILS —
    // the app reports a failure through setDbStatus(msg, false) — so there is never a second
    // request racing the first one.
    var retried = false, prevStatus = setDbStatus;
    setDbStatus = function (msg, ok) {
      var r = prevStatus.apply(this, arguments);
      if (!ok && !retried) { retried = true; setTimeout(function () { try { loadFromDb(); } catch (_) {} }, 50); }
      return r;
    };
  } catch (_) {}

  /* Overview: the status dropdown's default reads "Overview Statuses" */
  /* The Overview/Projects pages read their status & type from hidden legacy filter boxes (#fStatus,
     #fCat, ...). Browsers restore those boxes' last values on some reloads, so the page could open
     already filtered to "On Track". Start every load on "all", and opt the boxes out of restoration. */
  function resetLegacyFilters() {
    ['q', 'fCat', 'fStatus', 'fOwner', 'fLead', 'fPrio', 'fPriority', 'fDept', 'fTeam'].forEach(function (id) {
      var el = document.getElementById(id); if (!el) return;
      el.setAttribute('autocomplete', 'off');
      if (el.tagName === 'SELECT' || el.tagName === 'INPUT') { if (el.value !== '') { el.value = ''; try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {} } }
    });
    try { if (typeof kpiFilter !== 'undefined' && kpiFilter) kpiFilter = ''; } catch (_) {}
  }
  resetLegacyFilters();
  window.addEventListener('pageshow', function () { resetLegacyFilters(); });
  var LABELS = { ov3Status: 'Project Status', pj3Status: 'Project Status' };
  function relabelOverview() {
    try { document.querySelectorAll('#kpis .kpi-analytics-label').forEach(function (l) { if (l.textContent.trim() === 'Active IT Requests') l.textContent = 'Active Requests'; }); } catch (_) {}
    Object.keys(LABELS).forEach(function (id) {
      var sel = document.getElementById(id); if (!sel) return;
      var o = sel.options[0]; if (o && o.value === '' && o.textContent !== LABELS[id]) { o.textContent = LABELS[id]; sel.setAttribute('aria-label', LABELS[id]); }
    });
  }
  try { new MutationObserver(function () { relabelOverview(); }).observe(document.body, { childList: true, subtree: true }); } catch (_) {}
  relabelOverview();

  /* Comments: no "Posting as" choice — you post as the side you are on (Lead if you are a lead of the
     project/task, Custodian if you are a custodian). The server decides the same way. */
  (function () {
    function lcx(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
    function on(obj, idsKey, namesKey, idKey, nameKey) {
      if (!obj) return false; var u = null; try { u = currentUser; } catch (_) {} if (!u) return false;
      var ids = [].concat(obj[idsKey] || [], obj[idKey] ? [obj[idKey]] : []).map(String), names = [].concat(obj[namesKey] || [], obj[nameKey] ? [obj[nameKey]] : []).map(lcx);
      return ids.indexOf(String(u.id)) >= 0 || names.indexOf(lcx(u.name)) >= 0;
    }
    function mySide() {
      var p = null, m = null; try { p = commentCtx && commentCtx.projectId ? (data || []).filter(function (x) { return x.id === commentCtx.projectId; })[0] : null; var f = commentCtx && commentCtx.msId && typeof findMilestone === 'function' ? findMilestone(commentCtx.msId) : null; m = f && f.milestone; } catch (_) {}
      var lead = on(p, 'leadIds', 'leads', 'leadId', 'lead') || on(m, 'leadIds', 'leads', 'leadId', 'lead');
      var owner = on(p, 'ownerIds', 'owners', 'ownerId', 'owner') || on(m, 'ownerIds', 'owners', 'ownerId', 'owner');
      if (lead && !owner) return 'lead'; if (owner) return 'owner';
      var u = null; try { u = currentUser; } catch (_) {} return u && u.role === 'lead' ? 'lead' : 'owner';
    }
    try {
      var prevSync = syncChatRole;
      syncChatRole = function () {
        var sel = document.getElementById('chat_role'); if (sel) sel.value = mySide();
        var r = prevSync.apply(this, arguments);
        try { var who = document.getElementById('chatWho'), u = currentUser; if (who && u) who.textContent = (sel && sel.value === 'lead' ? 'Lead' : 'Custodian') + ' \u2014 ' + (u.name || '') + (u.email ? '  |  ' + u.email : ''); } catch (_) {}
        return r;
      };
    } catch (_) {}
    if (!document.getElementById('chat-role-css')) { var st = document.createElement('style'); st.id = 'chat-role-css'; st.textContent = '#chat_role{display:none!important}.chat-role label{margin-right:8px}'; document.head.appendChild(st); }
  })();

  /* Project / task forms: the "Grant login access" checkbox is gone — access is managed on the Users page.
     The box is unchecked so saving a project never changes anyone's role. */
  (function () {
    if (!document.getElementById('grant-access-css')) { var st = document.createElement('style'); st.id = 'grant-access-css'; st.textContent = '#p_grant_access,#m_grant_access{display:none!important}'; document.head.appendChild(st); }
    function fix() {
      ['p_grant_access', 'm_grant_access'].forEach(function (id) {
        var cb = document.getElementById(id); if (!cb) return;
        cb.checked = false;
        var fld = cb.closest('.fld'); if (fld) fld.style.display = 'none';
      });
    }
    fix(); setTimeout(fix, 500); setTimeout(fix, 2000);
    try { new MutationObserver(function () { var cb = document.getElementById('p_grant_access'); if (cb && cb.checked) fix(); }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['checked', 'class'] }); } catch (_) {}
    ['openProject', 'openMilestone', 'openTask'].forEach(function (fn) { try { var prev = window[fn]; if (typeof prev === 'function') window[fn] = function () { var r = prev.apply(this, arguments); fix(); return r; }; } catch (_) {} });
  })();

  window.__scopeFilter = {
    apply: apply, state: function () { return state; },
    set: function (patch) { patch = patch || {}; if ('dept' in patch) { state.dept = String(patch.dept || ''); if (!('team' in patch)) state.team = ''; } if ('team' in patch) state.team = String(patch.team || ''); if ('person' in patch) state.person = String(patch.person || ''); save(); apply(); repaint(); }
  };
})();


/* ── Departments & teams: Admin edits everything; someone with a WHOLE department (all sub-teams)
      may edit the sub-teams of their own department(s) only; someone limited to specific sub-teams
      does not get the button at all. The server enforces the same rule. ── */
(function () {
  'use strict';
  function lc(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function parse(v) { return String(v == null ? '' : v).split(/[,;]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function who() {
    var u; try { u = currentUser; } catch (_) { u = null; }
    if (!u) return { level: 'none' };
    if (u.role === 'admin') return { level: 'admin' };
    var d = parse(u.department), t = parse(u.team);
    var allD = !d.length || d.some(function (x) { return /^(all|\*)$/i.test(x); });
    var allT = !t.length || t.some(function (x) { return /^(all|\*)$/i.test(x); });
    if (!allT) return { level: 'none' };                       // specific sub-team(s): no button
    return { level: 'dept', depts: allD ? null : d };           // whole department(s) (or all)
  }
  function sync() { var b = document.getElementById('btnOrgSettings'); if (b) b.style.display = who().level === 'none' ? 'none' : ''; }
  function restrict() {
    var w = who(), m = document.getElementById('orgModal'); if (!m) return;
    var limited = w.level === 'dept';
    m.classList.toggle('org-limited', limited);
    var hint = m.querySelector('.mbody > .hint'); if (hint) hint.textContent = limited ? 'You can add, rename or remove sub-teams of your own department' + (w.depts && w.depts.length > 1 ? 's' : '') + '. Departments themselves are managed by an Admin.' : 'Add or remove departments and their sub-teams. These drive the User form dropdowns.';
    if (!limited) return;
    try {
      if (w.depts && orgDraft && Array.isArray(orgDraft.departments)) {
        var mine = orgDraft.departments.filter(function (d) { return w.depts.some(function (x) { return lc(x) === lc(d); }); });
        if (mine.length) { orgDraft.departments = mine; var keep = {}; mine.forEach(function (d) { keep[d] = orgDraft.teamsByDepartment[d] || []; }); orgDraft.teamsByDepartment = keep; orgRenderDepartments(mine[0]); }
      }
    } catch (_) {}
  }
  if (!document.getElementById('org-limited-css')) {
    var st = document.createElement('style'); st.id = 'org-limited-css';
    st.textContent = '#orgModal.org-limited #org_dept_new,#orgModal.org-limited #org_dept_new+button,#orgModal.org-limited [onclick="orgRenameDepartment()"],#orgModal.org-limited [onclick="orgDeleteDepartment()"]{display:none!important}';
    document.head.appendChild(st);
  }
  try {
    var prev = openOrgSettingsModal;
    openOrgSettingsModal = function () {
      if (who().level === 'none') { alert('Departments & teams can be edited by an Admin, or by someone with access to a whole department.'); return; }
      var r = prev.apply(this, arguments); restrict(); return r;
    };
  } catch (_) {}
  sync(); [500, 1500, 4000].forEach(function (ms) { setTimeout(sync, ms); });
  window.addEventListener('hashchange', function () { setTimeout(sync, 100); });
})();
