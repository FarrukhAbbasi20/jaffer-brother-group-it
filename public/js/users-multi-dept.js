/*  Users form — several departments + several sub-teams per user
 *
 *  Department : multi-select with "All departments" on top (ticking it ticks everything).
 *  Sub-team   : shows the sub-teams of EVERY ticked department, with
 *                 "All sub-teams"      -> the whole of every ticked department
 *                 "All of <dept>"      -> the whole of that one department (shown when 2+ are ticked)
 *                 specific sub-teams
 *                 nothing ticked       -> assigned work only
 *
 *  Stored exactly as server/user-scope.js documents:
 *     department "P&C, Group IT" | "All"          team "Payroll, Development" | "*" | "P&C, Development" | ""
 *
 *  Works the way the other *-v3.js files do: index.html is untouched; this replaces the
 *  global fillDeptTeamOptions / onUserDeptChange / saveUser / projectOrgScope.
 */
(function () {
  'use strict';

  var ALL = '*';
  var ALL_RE = /^(all|\*)$/i;
  var DEPT_HOST = 'u_dept_multi', TEAM_HOST = 'u_team_multi';

  function el(id) { return document.getElementById(id); }
  function lc(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function parseList(v) {
    var raw = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,;]+/), out = [];
    raw.forEach(function (x) { x = String(x == null ? '' : x).trim().replace(/\s+/g, ' '); if (x && !out.some(function (y) { return lc(y) === lc(x); })) out.push(x); });
    return out;
  }
  function splitAll(v) { var t = parseList(v), all = t.some(function (x) { return ALL_RE.test(x); }); return { all: all, list: all ? [] : t }; }
  function aliases(d) {
    var out = [String(d || '').trim()], l = lc(d);
    if (l === 'group it' || l === 'it / git' || l === 'it/git' || l === 'it' || l === 'git') ['Group IT', 'IT / GIT'].forEach(function (a) { if (!out.some(function (x) { return lc(x) === lc(a); })) out.push(a); });
    return out;
  }
  function sameDept(a, b) { return !!lc(a) && aliases(b).some(function (x) { return lc(x) === lc(a); }); }

  /* index.html keeps these as top-level let/const, so they are read by name, not from window. */
  function me() { try { return currentUser || null; } catch (_) { return null; } }
  function meta() { try { return orgMeta || {}; } catch (_) { return {}; } }
  function allUsers() { try { return usersList || []; } catch (_) { return []; } }
  function configuredDepartments() {
    var out = [];
    try { out = parseList((meta().departments && meta().departments.length) ? meta().departments : USER_DEPARTMENTS); } catch (_) {}
    return out;
  }
  function teamsMap() { var m = meta().teamsByDepartment; if (m && typeof m === 'object') return m; try { return TEAMS_BY_DEPARTMENT || {}; } catch (_) { return {}; } }
  /* exact name or known alias only — the old /it|git/ test also matched "Audit", "Facilities"… */
  function teamsFor(dept) {
    var out = [], map = teamsMap();
    Object.keys(map).forEach(function (k) { if (Array.isArray(map[k]) && sameDept(k, dept)) map[k].forEach(function (t) { t = String(t || '').trim(); if (t && !out.some(function (x) { return lc(x) === lc(t); })) out.push(t); }); });
    return out;
  }

  /* A department Manager can only hand out their own departments / sub-teams (server enforces it too). */
  function managerLimits() {
    var u = me(); if (!u || u.role === 'admin') return null;   // any non-admin who manages people is limited to their own scope
    var d = splitAll(u.department); if (!d.list.length) return null;
    var t = splitAll(u.team);
    return { depts: d.list, lockedTeams: (t.all || !t.list.length) ? null : t.list };
  }

  function injectCss() {
    if (el('umd-css')) return;
    var s = document.createElement('style'); s.id = 'umd-css';
    s.textContent =
      '.sdd .sdd-opt.umd-all{position:sticky;top:0;z-index:1;font-weight:700;background:var(--surface,#fff);border-bottom:1px solid var(--border,#E2E8F0);border-radius:0;margin-bottom:4px}' +
      'html[data-theme="dark"] .sdd .sdd-opt.umd-all{background:var(--surface-elevated,#152238)}' +
      '.sdd .sdd-opt.umd-all.is-checked,.sdd .sdd-opt.umd-all:hover{background:var(--panel-2,#F1F5F9)}' +
      '#u_scope_summary{display:block;margin-top:8px;font-size:12px;line-height:1.45;color:var(--muted,#64748B)}' +
      '#u_scope_summary b{color:var(--ink,#0F172A);font-weight:600}' +
      '#u_dept_multi .sdd-opts,#u_team_multi .sdd-opts{max-height:264px!important}' +
      '.umd-locked .sdd-toggle{opacity:.7;pointer-events:none}';
    document.head.appendChild(s);
  }

  /* Swap the two <select>s for multi-select hosts (the selects stay in the page, hidden). */
  function ensureHosts() {
    var dSel = el('u_dept'), tSel = el('u_team');
    if (!dSel || !tSel || !window.SearchableMultiSelect) return false;
    injectCss();
    [[dSel, DEPT_HOST, 'Departments', 'Select departments'], [tSel, TEAM_HOST, 'Sub-teams', 'None — assigned work only']].forEach(function (x) {
      if (el(x[1])) return;
      var host = document.createElement('div');
      host.className = 'sdd'; host.id = x[1];
      host.setAttribute('role', 'group'); host.setAttribute('aria-label', x[2]); host.setAttribute('data-ph', x[3]);
      x[0].insertAdjacentElement('afterend', host);
      x[0].style.display = 'none'; x[0].setAttribute('aria-hidden', 'true'); x[0].tabIndex = -1;
      var label = x[0].parentElement && x[0].parentElement.querySelector('label');
      if (label) { label.removeAttribute('for'); label.textContent = x[2]; }
    });
    if (!el('u_scope_summary')) {
      var sum = document.createElement('span'); sum.id = 'u_scope_summary'; sum.setAttribute('aria-live', 'polite');
      el(TEAM_HOST).insertAdjacentElement('afterend', sum);
    }
    return true;
  }

  function boxes(host) { return Array.prototype.slice.call(host.querySelectorAll('.sdd-opt:not(.umd-all) input[type="checkbox"]')); }
  function allBox(host) { return host.querySelector('.sdd-opt.umd-all input'); }
  function paint(inp) { var l = inp.closest('.sdd-opt'); if (l) l.classList.toggle('is-checked', inp.checked); }
  function isAll(hostId) { var a = allBox(el(hostId)); return !!(a && a.checked); }
  function picked(hostId) { return boxes(el(hostId)).filter(function (b) { return b.checked; }).map(function (b) { return b.value; }); }

  function relabel(host, allText) {
    var lab = host.querySelector('.sdd-toggle .sdd-lab'); if (!lab) return;
    var a = allBox(host), names = boxes(host).filter(function (b) { return b.checked; }).map(function (b) { var t = b.closest('.sdd-opt').querySelector('.sdd-tx'); return (t ? t.textContent : b.value).trim(); });
    if (a && a.checked) { lab.textContent = allText; lab.classList.remove('empty'); }
    else if (!names.length) { lab.textContent = host.getAttribute('data-ph') || 'Select…'; lab.classList.add('empty'); }
    else { lab.textContent = names.length <= 3 ? names.join(', ') : names.length + ' selected'; lab.classList.remove('empty'); }
  }

  /* Put the "All …" row on top of a filled multi-select. Ticking it ticks every row. */
  function addAllRow(host, text, sub, checked, onToggle) {
    var opts = host.querySelector('.sdd-opts'); if (!opts || !boxes(host).length) return;
    var row = document.createElement('label');
    row.className = 'sdd-opt umd-all' + (checked ? ' is-checked' : ''); row.setAttribute('data-search', text);
    row.innerHTML = '<input type="checkbox" value="' + ALL + '"' + (checked ? ' checked' : '') + '><span class="sdd-opt-body"><span class="sdd-tx"></span><span class="sdd-sub"></span></span>';
    row.querySelector('.sdd-tx').textContent = text; row.querySelector('.sdd-sub').textContent = sub;
    opts.insertBefore(row, opts.firstChild);
    var inp = row.querySelector('input');
    inp.addEventListener('click', function (e) { e.stopPropagation(); });
    inp.addEventListener('change', function () { boxes(host).forEach(function (b) { b.checked = inp.checked; paint(b); }); paint(inp); onToggle(); });
    if (checked) boxes(host).forEach(function (b) { b.checked = true; paint(b); });
  }
  function syncAllRow(host) { var a = allBox(host), b = boxes(host); if (a) { a.checked = b.length > 0 && b.every(function (x) { return x.checked; }); paint(a); } }

  /* ---------- Department picker ---------- */
  function fillDepartments(value) {
    var host = el(DEPT_HOST), lim = managerLimits(), cur = splitAll(value), options;
    if (lim) options = lim.depts.slice();
    else {
      options = configuredDepartments();
      cur.list.forEach(function (d) { if (!options.some(function (o) { return sameDept(d, o); })) options.push(d); });
      allUsers().forEach(function (u) { splitAll(u.department).list.forEach(function (d) { if (!options.some(function (o) { return lc(o) === lc(d); })) options.push(d); }); });
    }
    var selected = cur.list.map(function (d) { return options.filter(function (o) { return sameDept(d, o); })[0] || d; });
    if (lim && (!selected.length || lim.depts.length === 1)) selected = lim.depts.length === 1 ? lim.depts.slice() : selected;
    SearchableMultiSelect.fill(host, options, selected, { placeholder: 'Select departments', searchPlaceholder: 'Search departments…', onChange: function () { syncAllRow(host); afterDepartmentChange(); } });
    if (!lim) addAllRow(host, 'All departments', 'every department, including ones added later', cur.all, afterDepartmentChange);
    host.classList.toggle('umd-locked', !!(lim && lim.depts.length === 1));
    relabel(host, 'All departments');
  }
  function afterDepartmentChange() {
    relabel(el(DEPT_HOST), 'All departments');
    fillTeams(isAll(TEAM_HOST) ? ALL : picked(TEAM_HOST), true);   // keep ticks that still belong to a ticked department
  }

  /* ---------- Sub-team picker: union of every ticked department ---------- */
  function fillTeams(value, dropUnknown) {
    var host = el(TEAM_HOST), lim = managerLimits(), cur = splitAll(value);
    var depts = isAll(DEPT_HOST) ? configuredDepartments() : picked(DEPT_HOST);
    var options = [], seen = {};
    function add(v, label, sub) { var k = lc(v); if (seen[k]) { if (sub && seen[k].sub.indexOf(sub) < 0) seen[k].sub += ' · ' + sub; return; } seen[k] = { value: v, label: label, sub: sub || '' }; options.push(seen[k]); }
    if (lim && lim.lockedTeams) lim.lockedTeams.forEach(function (t) { var whole = depts.some(function (d) { return sameDept(t, d); }); add(t, whole ? 'All of ' + t : t, whole ? 'whole department' : ''); });
    else {
      // grouped: each department's "All of …" row, then its own sub-teams
      depts.forEach(function (d) { if (depts.length > 1) add(d, 'All of ' + d, 'whole department'); teamsFor(d).forEach(function (t) { add(t, t, d); }); });
      if (!dropUnknown) cur.list.forEach(function (t) { if (!seen[lc(t)] && !depts.some(function (d) { return sameDept(t, d); })) add(t, t, 'no longer in the list'); });   // never silently drop a saved value
    }
    var selected = cur.list.filter(function (t) { return !!seen[lc(t)]; });
    // one department ticked + "All of <that department>" saved earlier == all sub-teams
    var wholeOnly = depts.length === 1 && cur.list.some(function (t) { return sameDept(t, depts[0]); });
    var ph = !depts.length ? 'Select a department first' : 'None — assigned work only';
    SearchableMultiSelect.fill(host, options, selected, { placeholder: ph, searchPlaceholder: 'Search sub-teams…', emptyText: depts.length ? 'No sub-teams set up — tick “All sub-teams” or leave empty' : 'Select a department first', onChange: function () { syncAllRow(host); afterTeamChange(); } });
    host.setAttribute('data-ph', ph);
    // the component sorts A–Z; put rows back in department order
    var box = host.querySelector('.sdd-opts'), tail = box && box.querySelector('.sdd-filter-empty');
    if (box) options.forEach(function (o) { var inp = boxes(host).filter(function (b) { return lc(b.value) === lc(o.value); })[0]; if (inp) box.insertBefore(inp.closest('.sdd-opt'), tail || null); });
    if (!(lim && lim.lockedTeams) && depts.length) {
      if (options.length) addAllRow(host, 'All sub-teams', 'the whole of every selected department', cur.all || wholeOnly, afterTeamChange);
      else addLoneAllRow(host, cur.all || wholeOnly);
    }
    afterTeamChange();
  }
  /* Departments with no sub-teams configured still need a way to say "whole department". */
  function addLoneAllRow(host, checked) {
    var opts = host.querySelector('.sdd-opts'); if (!opts) return;
    var row = document.createElement('label'); row.className = 'sdd-opt umd-all' + (checked ? ' is-checked' : ''); row.setAttribute('data-search', 'All sub-teams');
    row.innerHTML = '<input type="checkbox" value="' + ALL + '"' + (checked ? ' checked' : '') + '><span class="sdd-opt-body"><span class="sdd-tx">All sub-teams</span><span class="sdd-sub">the whole of every selected department</span></span>';
    opts.insertBefore(row, opts.firstChild);
    var inp = row.querySelector('input');
    inp.addEventListener('click', function (e) { e.stopPropagation(); });
    inp.addEventListener('change', function () { paint(inp); afterTeamChange(); });
  }
  function afterTeamChange() { relabel(el(TEAM_HOST), 'All sub-teams'); summarize(); }

  function summarize() {
    var out = el('u_scope_summary'); if (!out) return;
    var role = (el('u_role') || {}).value || '', dAll = isAll(DEPT_HOST), d = picked(DEPT_HOST), tAll = isAll(TEAM_HOST), t = picked(TEAM_HOST);
    function b(s) { return '<b>' + String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }) + '</b>'; }
    var msg;
    if (role === 'admin') msg = 'Admins always see every project.';
    else if (!dAll && !d.length) msg = 'Select at least one department.';
    else if (tAll && dAll) msg = 'Will see ' + b('every project') + ' in the portal.';
    else if (tAll) msg = 'Will see every project in ' + d.map(b).join(', ') + '.';
    else if (t.length) msg = 'Will see ' + t.map(function (x) { return b(d.some(function (y) { return sameDept(x, y); }) || dAll && configuredDepartments().some(function (y) { return sameDept(x, y); }) ? 'all of ' + x : x); }).join(', ') + ' — plus anything assigned to them.';
    else msg = 'No sub-team ticked: will see ' + b('only work assigned to them') + '.';
    out.innerHTML = msg;
  }

  /* ---------- replacements for index.html's functions ---------- */
  function fillDeptTeamOptionsMulti(dept, team) {
    if (!ensureHosts()) return legacy.fill && legacy.fill.apply(this, arguments);
    var d = (dept == null || String(dept).trim() === '') ? (configuredDepartments()[0] || 'Group IT') : dept;
    fillDepartments(d);
    fillTeams(team);
  }

  async function saveUserMulti() {
    if (!ensureHosts()) return legacy.save && legacy.save.apply(this, arguments);
    if (typeof uiCan === 'function' && !uiCan('manage_users')) return;
    var name = el('u_name').value.trim(), email = el('u_email').value.trim(), role = el('u_role').value;
    var departments = isAll(DEPT_HOST) ? ['All'] : picked(DEPT_HOST);
    var teams = isAll(TEAM_HOST) ? [ALL] : picked(TEAM_HOST);
    if (!email) return alert(editingUserId ? 'Email missing.' : 'Select an employee first.');
    if (!name || name.length < 2) return alert(editingUserId ? 'Name missing.' : 'Employee name is missing - pick from the list.');
    if (!departments.length) { SearchableMultiSelect.focusOpen(DEPT_HOST); return alert('Select at least one department (or All departments).'); }
    var pageAccess = role === 'admin' ? defaultPageAccessMap('admin') : readPageAccessFromForm();
    // arrays for the current server; the joined strings keep an older server working too
    var body = { name: name, email: email, role: role, departments: departments, teams: teams, department: departments.join(', '), team: teams.join(', '), pageAccess: pageAccess };
    try {
      if (editingUserId) { body.isActive = el('u_active').value === '1'; await usersApi('/' + encodeURIComponent(editingUserId), { method: 'PUT', body: JSON.stringify(body) }); }
      else await usersApi('', { method: 'POST', body: JSON.stringify(body) });
      closeModal('userModal');
      await loadUsers();
      await loadAssignableUsers();
    } catch (err) { alert(err.message || 'Could not save user'); }
  }

  /* Custodians with several departments may create projects in any of them. */
  function projectOrgScopeMulti() {
    var base = legacy.scope ? legacy.scope.apply(this, arguments) : { unrestricted: false, departments: [], teamsByDepartment: {} };
    var u = me(); if (!u || u.role !== 'owner' || base.unrestricted) return base;
    var mine = splitAll(u.department), all = configuredDepartments(), depts = [];
    if (mine.all) depts = all.slice();
    else mine.list.forEach(function (h) { var m = all.filter(function (d) { return sameDept(d, h); }); (m.length ? m : [h]).forEach(function (d) { if (!depts.some(function (x) { return lc(x) === lc(d); })) depts.push(d); }); });
    if (!depts.length) return base;
    // sub-teams: the whole department unless the custodian is limited to specific sub-teams
    var t = splitAll(u.team), map = {};
    depts.forEach(function (d) {
      var all = teamsFor(d);
      if (t.all || !t.list.length || t.list.some(function (x) { return sameDept(x, d); })) { map[d] = all; return; }
      var mine = all.filter(function (x) { return t.list.some(function (m) { return lc(m) === lc(x); }); });
      t.list.forEach(function (m) { if (!depts.some(function (d2) { return sameDept(m, d2); }) && !mine.some(function (x) { return lc(x) === lc(m); })) mine.push(m); });
      map[d] = mine;
    });
    return { unrestricted: false, departments: depts, teamsByDepartment: map };
  }

  var legacy = {};
  function install() {
    if (install.done) return; install.done = true;
    try { legacy.fill = fillDeptTeamOptions; fillDeptTeamOptions = fillDeptTeamOptionsMulti; } catch (_) {}
    try { onUserDeptChange = function () { afterDepartmentChange(); }; } catch (_) {}
    try { legacy.save = saveUser; saveUser = saveUserMulti; } catch (_) {}
    try { legacy.scope = projectOrgScope; projectOrgScope = projectOrgScopeMulti; } catch (_) {}
    try { var prevRole = onUserRoleChange; onUserRoleChange = function () { var r = prevRole.apply(this, arguments); summarize(); return r; }; } catch (_) {}
  }
  install();
})();
