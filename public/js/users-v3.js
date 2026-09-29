(function () {
  'use strict';

  var visible = false;
  var painting = false;
  var q = '';
  var roleFilter = '';
  var deptFilter = '';
  var teamFilter = '';
  var statusFilter = '';
  var page = 1;
  var pageSize = 10;
  var moreOpen = false;

  function e(v) {
    return (v == null ? '' : String(v)).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function org() { return window.ORG_HIERARCHY || null; }

  function users() {
    try { return Array.isArray(usersList) ? usersList : []; } catch (_) { return []; }
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function roleLabel(role) {
    return org() ? org().roleLabel(role) : String(role || 'Viewer');
  }

  function accessOf(u) {
    if (org()) return org().accessLabel(u.role, u.accessLevel);
    return { key: 'standard', label: 'Standard' };
  }

  function statusOf(u) {
    if (!u.isActive) return { key: 'inactive', label: 'Inactive' };
    if (!u.lastLoginAt) return { key: 'pending', label: 'Pending' };
    return { key: 'active', label: 'Active' };
  }

  function relativeActive(value) {
    if (!value) return 'Never';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Never';
    var diff = Date.now() - d.getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 48) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    if (days < 14) return days + 'd ago';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function filtered() {
    return users().filter(function (u) {
      if (roleFilter && u.role !== roleFilter) return false;
      if (deptFilter && String(u.department || '') !== deptFilter) return false;
      if (teamFilter && String(u.team || '') !== teamFilter) return false;
      if (statusFilter && statusOf(u).key !== statusFilter) return false;
      if (q) {
        var hay = ((u.name || '') + ' ' + (u.email || '') + ' ' + (u.department || '') + ' ' + (u.team || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function ensureView() {
    var host = document.getElementById('appContent');
    if (!host) return null;
    var el = document.getElementById('usersV3View');
    if (!el) {
      el = document.createElement('div');
      el.id = 'usersV3View';
      el.className = 'users-v3 hidden';
      el.hidden = true;
      host.appendChild(el);
    }
    return el;
  }

  function setShellHidden(hidden) {
    [
      'dashboardView', 'kanbanView', 'projectsView', 'timelineView', 'issuesView', 'usersView',
      'filterBar', 'kpis', 'ovPageHead', 'ovFilters', 'pjPageHead', 'pjToolbar', 'kbPageHead', 'kbToolbar',
      'tasksView', 'issuesV3View', 'milestonesView', 'timelineV3View', 'calendarView', 'departmentsView'
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (hidden) el.classList.add('us3-shell-hidden');
      else el.classList.remove('us3-shell-hidden');
    });
    var actions = document.getElementById('pageActions');
    if (actions) {
      if (hidden) actions.classList.add('us3-shell-hidden');
      else actions.classList.remove('us3-shell-hidden');
    }
    var foot = document.querySelector('#appContent>.foot');
    if (foot) {
      if (hidden) foot.classList.add('us3-shell-hidden');
      else foot.classList.remove('us3-shell-hidden');
    }
  }

  function syncBody(on) {
    document.body.classList.toggle('view-users', on);
    if (on) {
      ['view-dashboard', 'view-projects', 'view-kanban', 'view-tasks', 'view-issues', 'view-milestones', 'view-timeline', 'view-calendar', 'view-departments'].forEach(function (c) {
        document.body.classList.remove(c);
      });
      document.querySelectorAll('#sidebarNav .nav-item').forEach(function (n) {
        n.classList.toggle('on', n.getAttribute('data-real-view') === 'users');
      });
    }
  }

  function paint() {
    if (!visible || painting) return;
    painting = true;
    try {
      var host = ensureView();
      if (!host) return;
      var all = users();
      var list = filtered();
      var pages = Math.max(1, Math.ceil(list.length / pageSize));
      if (page > pages) page = pages;
      var start = (page - 1) * pageSize;
      var slice = list.slice(start, start + pageSize);

      var active = all.filter(function (u) { return u.isActive; }).length;
      var pending = all.filter(function (u) { return u.isActive && !u.lastLoginAt; }).length;
      var admins = all.filter(function (u) { return u.role === 'admin'; }).length;
      var activePct = all.length ? Math.round((active / all.length) * 100) : 0;
      var adminPct = all.length ? Math.round((admins / all.length) * 100) : 0;

      var now = new Date();
      var name = '';
      try { name = currentUser && currentUser.name ? currentUser.name.split(/\s+/)[0] : ''; } catch (_) {}
      var hour = now.getHours();
      var greet = (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening') + (name ? ', ' + name + '!' : '!');

      var depts = org() ? org().DEPARTMENTS.slice() : [];
      all.forEach(function (u) {
        var d = String(u.department || '').trim();
        if (d && depts.indexOf(d) === -1) depts.push(d);
      });
      var teamOpts = deptFilter && org() ? org().teamsForDepartment(deptFilter) : [];
      if (deptFilter) {
        all.forEach(function (u) {
          if (u.department === deptFilter && u.team && teamOpts.indexOf(u.team) === -1) teamOpts.push(u.team);
        });
      }

      var rows = slice.length
        ? slice.map(function (u) {
            var st = statusOf(u);
            var acc = accessOf(u);
            var dept = u.department || '—';
            var team = u.team || '';
            return '<tr data-id="' + e(u.id) + '">' +
              '<td><span class="us3-person"><span class="us3-ava">' + e(initials(u.name)) + '</span><strong>' + e(u.name || '—') + '</strong></span></td>' +
              '<td><span class="us3-email">' + e(u.email || '—') + '</span></td>' +
              '<td><span class="us3-role ' + e(u.role || 'viewer') + '">' + e(roleLabel(u.role)) + '</span></td>' +
              '<td><span class="us3-dept"><strong>' + e(dept) + '</strong>' + (team ? '<span>' + e(team) + '</span>' : '') + '</span></td>' +
              '<td><span class="us3-status ' + st.key + '"><i></i>' + e(st.label) + '</span></td>' +
              '<td>' + e(relativeActive(u.lastLoginAt)) + '</td>' +
              '<td><span class="us3-access ' + acc.key + '">' + e(acc.label) + '</span></td>' +
              '<td><div class="us3-row-menu">' +
                '<button type="button" class="us3-row-btn" aria-label="Actions"><i data-lucide="ellipsis"></i></button>' +
                '<div class="us3-menu"><button type="button" data-act="edit">Edit access</button></div>' +
              '</div></td>' +
            '</tr>';
          }).join('')
        : '<tr><td colspan="8"><div class="us3-empty">No users match your filters.</div></td></tr>';

      var pageBtns = '';
      var maxBtn = Math.min(pages, 7);
      var from = Math.max(1, Math.min(page - 3, pages - maxBtn + 1));
      for (var p = from; p < from + maxBtn && p <= pages; p++) {
        pageBtns += '<button type="button" data-page="' + p + '" class="' + (p === page ? 'on' : '') + '">' + p + '</button>';
      }

      host.hidden = false;
      host.classList.remove('hidden');
      host.innerHTML =
        '<div class="us3-page-head">' +
          '<div class="us3-titleblock">' +
            '<div class="us3-eyebrow">Jaffer Brothers Group IT</div>' +
            '<h1>Users</h1>' +
            '<p>Manage people, their access, and permissions across Jaffer Brothers.</p>' +
          '</div>' +
          '<div class="us3-greeting">' +
            '<span class="us3-greeting-date"><i data-lucide="calendar-days"></i>' +
              e(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })) +
            '</span>' +
            '<strong>' + e(greet) + '</strong>' +
          '</div>' +
        '</div>' +
        '<div class="us3-kpis">' +
          '<article class="us3-kpi"><span class="us3-kpi-icon red"><i data-lucide="users"></i></span><div><div class="us3-kpi-label">Total Users</div><div class="us3-kpi-value">' + all.length + '</div><div class="us3-kpi-sub">Across all units</div></div></article>' +
          '<article class="us3-kpi"><span class="us3-kpi-icon blue"><i data-lucide="user-check"></i></span><div><div class="us3-kpi-label">Active Users</div><div class="us3-kpi-value">' + active + '</div><div class="us3-kpi-sub">' + activePct + '% of total users</div></div></article>' +
          '<article class="us3-kpi"><span class="us3-kpi-icon orange"><i data-lucide="mail"></i></span><div><div class="us3-kpi-label">Pending Invites</div><div class="us3-kpi-value">' + pending + '</div><div class="us3-kpi-sub">Awaiting first login</div></div></article>' +
          '<article class="us3-kpi"><span class="us3-kpi-icon purple"><i data-lucide="shield"></i></span><div><div class="us3-kpi-label">Administrators</div><div class="us3-kpi-value">' + admins + '</div><div class="us3-kpi-sub">' + adminPct + '% of total users</div></div></article>' +
        '</div>' +
        '<div class="us3-toolbar">' +
          '<div class="us3-toolbar-left">' +
            '<input type="search" id="us3Search" class="us3-search" placeholder="Search users by name, email, or department..." value="' + e(q) + '">' +
            '<select id="us3Role" class="us3-select"><option value="">All Roles</option>' +
              ['admin', 'director', 'head', 'member'].map(function (r) {
                return '<option value="' + r + '"' + (roleFilter === r ? ' selected' : '') + '>' + e(roleLabel(r)) + '</option>';
              }).join('') +
            '</select>' +
            '<select id="us3Dept" class="us3-select"><option value="">All Departments</option>' +
              depts.map(function (d) {
                return '<option value="' + e(d) + '"' + (deptFilter === d ? ' selected' : '') + '>' + e(d) + '</option>';
              }).join('') +
            '</select>' +
            '<button type="button" class="us3-more' + (moreOpen ? ' on' : '') + '" id="us3More"><i data-lucide="funnel"></i> More filters</button>' +
          '</div>' +
          '<button type="button" class="us3-new" id="us3New"><i data-lucide="plus"></i> New User</button>' +
        '</div>' +
        '<div class="us3-more-panel' + (moreOpen ? ' on' : '') + '">' +
          '<select id="us3Team" class="us3-select"' + (deptFilter ? '' : ' disabled') + '>' +
            '<option value="">All Sub-teams</option>' +
            teamOpts.map(function (t) {
              return '<option value="' + e(t) + '"' + (teamFilter === t ? ' selected' : '') + '>' + e(t) + '</option>';
            }).join('') +
          '</select>' +
          '<select id="us3Status" class="us3-select">' +
            '<option value="">All Statuses</option>' +
            '<option value="active"' + (statusFilter === 'active' ? ' selected' : '') + '>Active</option>' +
            '<option value="pending"' + (statusFilter === 'pending' ? ' selected' : '') + '>Pending</option>' +
            '<option value="inactive"' + (statusFilter === 'inactive' ? ' selected' : '') + '>Inactive</option>' +
          '</select>' +
          '<select id="us3PageSize" class="us3-select">' +
            [10, 25, 50].map(function (n) {
              return '<option value="' + n + '"' + (pageSize === n ? ' selected' : '') + '>' + n + ' per page</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<section class="us3-card">' +
          '<div class="us3-table-wrap"><table class="us3-table">' +
            '<thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Status</th><th>Last Active</th><th>Access Level</th><th></th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table></div>' +
          '<div class="us3-foot">' +
            '<span>Showing ' + (list.length ? (start + 1) : 0) + '–' + Math.min(start + pageSize, list.length) + ' of ' + list.length + ' users</span>' +
            '<div class="us3-pages">' +
              '<button type="button" id="us3Prev"' + (page <= 1 ? ' disabled' : '') + '><i data-lucide="chevron-left"></i></button>' +
              pageBtns +
              '<button type="button" id="us3Next"' + (page >= pages ? ' disabled' : '') + '><i data-lucide="chevron-right"></i></button>' +
            '</div>' +
          '</div>' +
        '</section>';

      bind();
      try { refreshLucideIcons(); } catch (_) { if (window.lucide) window.lucide.createIcons(); }
    } finally {
      painting = false;
    }
  }

  function bind() {
    var search = document.getElementById('us3Search');
    if (search) search.oninput = function () { q = (search.value || '').trim().toLowerCase(); page = 1; paint(); };
    var role = document.getElementById('us3Role');
    if (role) role.onchange = function () { roleFilter = role.value || ''; page = 1; paint(); };
    var dept = document.getElementById('us3Dept');
    if (dept) dept.onchange = function () { deptFilter = dept.value || ''; teamFilter = ''; page = 1; paint(); };
    var team = document.getElementById('us3Team');
    if (team) team.onchange = function () { teamFilter = team.value || ''; page = 1; paint(); };
    var st = document.getElementById('us3Status');
    if (st) st.onchange = function () { statusFilter = st.value || ''; page = 1; paint(); };
    var ps = document.getElementById('us3PageSize');
    if (ps) ps.onchange = function () { pageSize = Number(ps.value) || 10; page = 1; paint(); };

    var more = document.getElementById('us3More');
    if (more) more.onclick = function () { moreOpen = !moreOpen; paint(); };

    var nw = document.getElementById('us3New');
    if (nw) nw.onclick = function () { if (typeof openUserModal === 'function') openUserModal(null); };

    var prev = document.getElementById('us3Prev');
    var next = document.getElementById('us3Next');
    if (prev) prev.onclick = function () { if (page > 1) { page--; paint(); } };
    if (next) next.onclick = function () { page++; paint(); };
    document.querySelectorAll('[data-page]').forEach(function (b) {
      b.onclick = function () { page = Number(b.getAttribute('data-page')) || 1; paint(); };
    });

    document.querySelectorAll('.us3-row-btn').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        var menu = btn.parentElement && btn.parentElement.querySelector('.us3-menu');
        document.querySelectorAll('.us3-menu.on').forEach(function (m) { if (m !== menu) m.classList.remove('on'); });
        if (menu) menu.classList.toggle('on');
      };
    });
    document.querySelectorAll('.us3-menu [data-act="edit"]').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        var tr = btn.closest('tr');
        var id = tr && tr.getAttribute('data-id');
        document.querySelectorAll('.us3-menu.on').forEach(function (m) { m.classList.remove('on'); });
        if (id && typeof openUserModal === 'function') openUserModal(id);
      };
    });
    document.querySelectorAll('tbody tr[data-id]').forEach(function (tr) {
      tr.ondblclick = function () {
        if (typeof openUserModal === 'function') openUserModal(tr.getAttribute('data-id'));
      };
    });
  }

  window.__usersV3Refresh = function () {
    if (visible) paint();
  };

  window.showUsersV3 = function () {
    if (typeof hideCalendarV3 === 'function') hideCalendarV3();
    if (typeof hideTimelineV3 === 'function') hideTimelineV3();
    if (typeof hideTasksV3 === 'function') hideTasksV3();
    if (typeof hideIssuesV3 === 'function') hideIssuesV3();
    if (typeof hideMilestonesV3 === 'function') hideMilestonesV3();
    if (typeof hideDepartmentsV3 === 'function') hideDepartmentsV3();
    visible = true;
    syncBody(true);
    setShellHidden(true);
    var host = ensureView();
    if (host) { host.hidden = false; host.classList.remove('hidden'); }
    if (typeof loadUsers === 'function') {
      try {
        Promise.resolve(loadUsers()).then(function () { paint(); }).catch(function () { paint(); });
      } catch (_) { paint(); }
    } else paint();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.hideUsersV3 = function () {
    if (!visible) return;
    visible = false;
    syncBody(false);
    var host = document.getElementById('usersV3View');
    if (host) { host.hidden = true; host.classList.add('hidden'); }
    setShellHidden(false);
  };

  try {
    var oldSetView = window.setView;
    if (typeof oldSetView === 'function') {
      window.setView = function (v) {
        if (v !== 'users' && typeof hideUsersV3 === 'function') hideUsersV3();
        var out = oldSetView.apply(this, arguments);
        if (v === 'users') {
          setTimeout(function () {
            if (typeof showUsersV3 === 'function') showUsersV3();
          }, 0);
        }
        return out;
      };
    }
  } catch (_) {}
})();
