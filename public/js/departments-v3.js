(function () {
  'use strict';

  var visible = false;
  var painting = false;
  var q = '';
  var statusFilter = '';
  var typeFilter = '';
  var locFilter = '';
  var page = 1;
  var PAGE_SIZE = 9;

  function e(v) {
    return (v == null ? '' : String(v)).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function safeProjects() {
    try { return Array.isArray(data) ? data : []; } catch (_) { return []; }
  }

  function safeUsers() {
    try {
      if (Array.isArray(usersList) && usersList.length) return usersList;
      if (Array.isArray(assignableUsers)) return assignableUsers;
    } catch (_) {}
    return [];
  }

  function categories() {
    var list = [];
    var seen = {};
    try {
      if (Array.isArray(CATEGORIES)) {
        CATEGORIES.forEach(function (c) {
          var n = String(c || '').trim();
          if (n && !seen[n]) { seen[n] = true; list.push(n); }
        });
      }
    } catch (_) {}
    safeProjects().forEach(function (p) {
      var n = String(p.category || '').trim();
      if (n && !seen[n]) { seen[n] = true; list.push(n); }
    });
    return list;
  }

  function catIcon(cat) {
    var c = String(cat || '').toLowerCase();
    if (c.includes('infra') || c.includes('server') || c.includes('cloud')) return 'server';
    if (c.includes('network')) return 'network';
    if (c.includes('web') || c.includes('site')) return 'globe';
    if (c.includes('soft') || c.includes('develop') || c.includes('automat') || c.includes('digit')) return 'code-2';
    if (c.includes('secur') || c.includes('licen')) return 'shield';
    if (c.includes('doc')) return 'file-text';
    if (c.includes('support') || c.includes('help')) return 'headset';
    return 'building-2';
  }

  function colorClass(name) {
    var s = String(name || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % 8;
    return 'c' + h;
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function parseBudget(raw) {
    if (raw == null || raw === '') return 0;
    var s = String(raw).replace(/,/g, '').replace(/pkr/ig, '').trim();
    var m = s.match(/([\d.]+)\s*([mbk])?/i);
    if (!m) return Number(s) || 0;
    var n = Number(m[1]) || 0;
    var u = (m[2] || '').toLowerCase();
    if (u === 'b') return n * 1e9;
    if (u === 'm') return n * 1e6;
    if (u === 'k') return n * 1e3;
    return n;
  }

  function fmtBudget(n) {
    if (!n) return '—';
    if (n >= 1e6) return 'PKR ' + (n / 1e6).toFixed(n >= 1e7 ? 1 : 1) + 'M';
    if (n >= 1e3) return 'PKR ' + (n / 1e3).toFixed(0) + 'K';
    return 'PKR ' + Math.round(n);
  }

  function canManage() {
    try { return typeof uiCan === 'function' && uiCan('manage_users'); } catch (_) { return false; }
  }

  function deptStatus(projects) {
    var open = projects.filter(function (p) { return String(p.status) !== 'Completed'; });
    if (open.some(function (p) { return p.status === 'Delayed'; })) {
      return { label: 'Needs Attention', cls: 'attention' };
    }
    if (open.some(function (p) { return p.status === 'At Risk'; })) {
      return { label: 'At Risk', cls: 'atrisk' };
    }
    return { label: 'On Track', cls: 'ontrack' };
  }

  function pickHead(projects, cat) {
    var scores = {};
    projects.forEach(function (p) {
      [p.lead, p.owner].forEach(function (name) {
        var n = String(name || '').trim();
        if (!n) return;
        scores[n] = (scores[n] || 0) + (name === p.lead ? 2 : 1);
      });
    });
    var users = safeUsers();
    users.forEach(function (u) {
      if (!u || !u.name) return;
      var role = String(u.role || '');
      var dept = String(u.department || '');
      if (role === 'manager' || role === 'admin') {
        if (!dept || /git/i.test(dept) || dept === cat) {
          scores[u.name] = (scores[u.name] || 0) + 3;
        }
      }
    });
    var best = '';
    var bestScore = 0;
    Object.keys(scores).forEach(function (n) {
      if (scores[n] > bestScore) { bestScore = scores[n]; best = n; }
    });
    if (!best) return { name: '', title: 'Unassigned' };
    var match = users.find(function (u) { return String(u.name) === best; });
    var title = 'Department Head';
    if (match) {
      if (match.role === 'admin') title = 'Admin';
      else if (match.role === 'head' || match.role === 'director' || match.role === 'manager') title = 'Department Head';
      else if (match.role === 'owner') title = 'Owner';
      else if (match.role === 'lead') title = 'Lead';
      else title = 'Member';
    } else {
      title = 'Lead';
    }
    return { name: best, title: title, user: match || null };
  }

  function memberCount(projects, cat) {
    var set = {};
    projects.forEach(function (p) {
      [p.owner, p.lead].forEach(function (n) {
        var x = String(n || '').trim();
        if (x) set[x] = true;
      });
    });
    safeUsers().forEach(function (u) {
      if (!u || !u.name) return;
      var dept = String(u.department || '');
      if (!dept || /git/i.test(dept) || dept === cat) set[u.name] = true;
    });
    return Object.keys(set).length;
  }

  function buildRows() {
    return categories().map(function (cat) {
      var projects = safeProjects().filter(function (p) { return String(p.category || '') === cat; });
      var active = projects.filter(function (p) { return String(p.status) !== 'Completed'; }).length;
      var budget = 0;
      var progSum = 0;
      projects.forEach(function (p) {
        budget += parseBudget(p.budget);
        var pr = Number(p.progress);
        if (String(p.status) === 'Completed') pr = 100;
        if (!Number.isNaN(pr)) progSum += Math.max(0, Math.min(100, pr));
      });
      var avgProg = projects.length ? Math.round(progSum / projects.length) : 0;
      var st = deptStatus(projects);
      var head = pickHead(projects, cat);
      return {
        name: cat,
        icon: catIcon(cat),
        color: colorClass(cat),
        head: head,
        members: memberCount(projects, cat),
        activeProjects: active,
        totalProjects: projects.length,
        budget: budget,
        budgetLabel: fmtBudget(budget),
        progress: avgProg,
        status: st,
        location: 'GIT'
      };
    });
  }

  function filteredRows() {
    return buildRows().filter(function (r) {
      if (statusFilter && r.status.cls !== statusFilter) return false;
      if (typeFilter && r.name !== typeFilter) return false;
      if (locFilter && r.location !== locFilter) return false;
      if (q) {
        var hay = (r.name + ' ' + (r.head.name || '') + ' ' + r.status.label).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function ensureView() {
    var host = document.getElementById('appContent');
    if (!host) return null;
    var el = document.getElementById('departmentsView');
    if (!el) {
      el = document.createElement('div');
      el.id = 'departmentsView';
      el.className = 'departments-v3 hidden';
      el.hidden = true;
      host.appendChild(el);
    }
    return el;
  }

  function setShellHidden(hidden) {
    [
      'dashboardView', 'kanbanView', 'projectsView', 'timelineView', 'issuesView', 'usersView',
      'filterBar', 'kpis', 'ovPageHead', 'ovFilters', 'pjPageHead', 'pjToolbar', 'kbPageHead', 'kbToolbar',
      'tasksView', 'issuesV3View', 'milestonesView', 'timelineV3View', 'calendarView'
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (hidden) el.classList.add('dp3-shell-hidden');
      else el.classList.remove('dp3-shell-hidden');
    });
    var actions = document.getElementById('pageActions');
    if (actions) {
      if (hidden) actions.classList.add('dp3-shell-hidden');
      else actions.classList.remove('dp3-shell-hidden');
    }
    var foot = document.querySelector('#appContent>.foot');
    if (foot) {
      if (hidden) foot.classList.add('dp3-shell-hidden');
      else foot.classList.remove('dp3-shell-hidden');
    }
  }

  function syncSidebar() {
    document.querySelectorAll('#sidebarNav .nav-item').forEach(function (n) {
      n.classList.toggle('on', n.getAttribute('data-real-view') === 'departments');
    });
  }

  function syncBody(on) {
    document.body.classList.toggle('view-departments', on);
    if (on) {
      ['view-dashboard', 'view-projects', 'view-kanban', 'view-tasks', 'view-issues', 'view-milestones', 'view-timeline', 'view-calendar'].forEach(function (c) {
        document.body.classList.remove(c);
      });
      syncSidebar();
    }
  }

  function openProjectsForDept(cat) {
    try {
      if (typeof hideDepartmentsV3 === 'function') hideDepartmentsV3();
      if (typeof showRealSection === 'function') showRealSection('projects');
      else if (typeof setView === 'function') setView('projects');
      setTimeout(function () {
        var fc = document.getElementById('fCat');
        if (fc) {
          fc.value = cat;
          if (typeof render === 'function') render();
        }
      }, 40);
    } catch (_) {}
  }

  function paint() {
    if (!visible || painting) return;
    painting = true;
    try {
      var host = ensureView();
      if (!host) return;
      var all = buildRows();
      var list = filteredRows();
      var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      if (page > pages) page = pages;
      var start = (page - 1) * PAGE_SIZE;
      var slice = list.slice(start, start + PAGE_SIZE);

      var onTrack = all.filter(function (r) { return r.status.cls === 'ontrack'; }).length;
      var teams = all.filter(function (r) { return r.activeProjects > 0; }).length;
      var members = 0;
      try {
        members = safeUsers().filter(function (u) { return u && u.isActive !== false; }).length;
        if (!members) {
          var names = {};
          safeProjects().forEach(function (p) {
            [p.owner, p.lead].forEach(function (n) {
              var x = String(n || '').trim();
              if (x) names[x] = true;
            });
          });
          members = Object.keys(names).length;
        }
      } catch (_) {}

      var now = new Date();
      var name = '';
      try { name = currentUser && currentUser.name ? currentUser.name.split(/\s+/)[0] : ''; } catch (_) {}
      var hour = now.getHours();
      var greet = (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening') + (name ? ', ' + name + '!' : '!');
      var manage = canManage();
      var onTrackPct = all.length ? Math.round((onTrack / all.length) * 100) : 0;

      var typeOpts = categories().map(function (c) {
        return '<option value="' + e(c) + '"' + (typeFilter === c ? ' selected' : '') + '>' + e(c) + '</option>';
      }).join('');

      var rowsHtml = slice.length
        ? slice.map(function (r, i) {
            var idx = start + i + 1;
            var headName = r.head.name || 'Unassigned';
            var blank = !r.head.name;
            return '<tr data-dept="' + e(r.name) + '">' +
              '<td class="dp3-num dp3-col-num">' + idx + '</td>' +
              '<td class="dp3-col-dept"><span class="dp3-dept">' +
                '<span class="dp3-dept-ico ' + r.color + '"><i data-lucide="' + r.icon + '"></i></span>' +
                '<span class="dp3-dept-name">' + e(r.name) + '</span>' +
              '</span></td>' +
              '<td class="dp3-col-head"><span class="dp3-head">' +
                '<span class="dp3-ava' + (blank ? ' blank' : '') + '">' + e(blank ? '—' : initials(headName)) + '</span>' +
                '<span class="dp3-head-copy"><strong>' + e(headName) + '</strong><span>' + e(r.head.title) + '</span></span>' +
              '</span></td>' +
              '<td class="dp3-col-members">' + r.members + '</td>' +
              '<td class="dp3-col-projects">' + r.activeProjects + '</td>' +
              '<td class="dp3-col-budget"><div class="dp3-budget">' +
                '<div class="dp3-budget-top"><strong>' + e(r.budgetLabel) + '</strong><span>' + r.progress + '%</span></div>' +
                '<div class="dp3-budget-bar"><i style="width:' + r.progress + '%"></i></div>' +
              '</div></td>' +
              '<td class="dp3-col-status"><span class="dp3-pill ' + r.status.cls + '">' + e(r.status.label) + '</span></td>' +
              '<td class="dp3-col-actions">' +
                '<div class="dp3-row-menu">' +
                  '<button type="button" class="dp3-row-btn" aria-label="Actions"><i data-lucide="ellipsis"></i></button>' +
                  '<div class="dp3-menu">' +
                    '<button type="button" data-act="projects">View projects</button>' +
                    (manage ? '<button type="button" data-act="users">Manage people</button>' : '') +
                  '</div>' +
                '</div>' +
              '</td>' +
            '</tr>';
          }).join('')
        : '<tr><td colspan="8"><div class="dp3-empty">No departments match your filters.</div></td></tr>';

      var pageBtns = '';
      for (var p = 1; p <= pages; p++) {
        pageBtns += '<button type="button" data-page="' + p + '" class="' + (p === page ? 'on' : '') + '">' + p + '</button>';
      }

      host.hidden = false;
      host.classList.remove('hidden');
      host.innerHTML =
        '<div class="dp3-page-head">' +
          '<div class="dp3-titleblock">' +
            '<div class="dp3-eyebrow">Jaffer Brothers Group IT</div>' +
            '<h1>Departments</h1>' +
            '<p>Manage departments, their teams, people, budgets and performance.</p>' +
          '</div>' +
          '<div class="dp3-head-right">' +
            '<div class="dp3-greeting">' +
              '<span class="dp3-greeting-date"><i data-lucide="calendar-days"></i>' +
                e(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })) +
              '</span>' +
              '<strong>' + e(greet) + '</strong>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="dp3-kpis">' +
          '<article class="dp3-kpi">' +
            '<span class="dp3-kpi-icon red"><i data-lucide="building-2"></i></span>' +
            '<div class="dp3-kpi-copy"><div class="dp3-kpi-label">Total Departments</div><div class="dp3-kpi-value">' + all.length + '</div><div class="dp3-kpi-sub">GIT work areas</div></div>' +
          '</article>' +
          '<article class="dp3-kpi">' +
            '<span class="dp3-kpi-icon blue"><i data-lucide="users"></i></span>' +
            '<div class="dp3-kpi-copy"><div class="dp3-kpi-label">Active Teams</div><div class="dp3-kpi-value">' + teams + '</div><div class="dp3-kpi-sub">With open projects</div></div>' +
          '</article>' +
          '<article class="dp3-kpi">' +
            '<span class="dp3-kpi-icon green"><i data-lucide="chart-column"></i></span>' +
            '<div class="dp3-kpi-copy"><div class="dp3-kpi-label">Total Members</div><div class="dp3-kpi-value">' + members + '</div><div class="dp3-kpi-sub">Portal accounts / assignees</div></div>' +
          '</article>' +
          '<article class="dp3-kpi">' +
            '<span class="dp3-kpi-icon purple"><i data-lucide="target"></i></span>' +
            '<div class="dp3-kpi-copy"><div class="dp3-kpi-label">On Track Departments</div><div class="dp3-kpi-value">' + onTrack + '</div><div class="dp3-kpi-sub">' + onTrackPct + '% of departments</div></div>' +
          '</article>' +
        '</div>' +
        '<div class="dp3-toolbar">' +
          '<div class="dp3-toolbar-left">' +
            '<input type="search" id="dp3Search" class="dp3-search" placeholder="Search departments, heads, or keywords..." value="' + e(q) + '">' +
            '<select id="dp3Status" class="dp3-select" aria-label="Status">' +
              '<option value="">All Statuses</option>' +
              '<option value="ontrack"' + (statusFilter === 'ontrack' ? ' selected' : '') + '>On Track</option>' +
              '<option value="atrisk"' + (statusFilter === 'atrisk' ? ' selected' : '') + '>At Risk</option>' +
              '<option value="attention"' + (statusFilter === 'attention' ? ' selected' : '') + '>Needs Attention</option>' +
            '</select>' +
            '<select id="dp3Type" class="dp3-select" aria-label="Department">' +
              '<option value="">All Departments</option>' + typeOpts +
            '</select>' +
            '<select id="dp3Loc" class="dp3-select" aria-label="Location">' +
              '<option value="">All Locations</option>' +
              '<option value="GIT"' + (locFilter === 'GIT' ? ' selected' : '') + '>GIT</option>' +
            '</select>' +
          '</div>' +
          (manage
            ? '<button type="button" class="dp3-new" id="dp3New"><i data-lucide="plus"></i> New Department</button>'
            : '') +
        '</div>' +
        '<section class="dp3-card">' +
          '<div class="dp3-table-wrap"><table class="dp3-table">' +
            '<thead><tr>' +
              '<th class="dp3-col-num">#</th>' +
              '<th class="dp3-col-dept">Department</th>' +
              '<th class="dp3-col-head">Head</th>' +
              '<th class="dp3-col-members">Members</th>' +
              '<th class="dp3-col-projects">Active Projects</th>' +
              '<th class="dp3-col-budget">Budget</th>' +
              '<th class="dp3-col-status">Status</th>' +
              '<th class="dp3-col-actions"></th>' +
            '</tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
          '</table></div>' +
          '<div class="dp3-foot">' +
            '<span>Showing ' + (list.length ? (start + 1) : 0) + '–' + Math.min(start + PAGE_SIZE, list.length) + ' of ' + list.length + ' departments</span>' +
            '<div class="dp3-pages">' +
              '<button type="button" id="dp3Prev" aria-label="Previous"' + (page <= 1 ? ' disabled' : '') + '><i data-lucide="chevron-left"></i></button>' +
              pageBtns +
              '<button type="button" id="dp3Next" aria-label="Next"' + (page >= pages ? ' disabled' : '') + '><i data-lucide="chevron-right"></i></button>' +
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
    var search = document.getElementById('dp3Search');
    if (search) {
      search.oninput = function () {
        q = (search.value || '').trim().toLowerCase();
        page = 1;
        paint();
      };
    }
    var st = document.getElementById('dp3Status');
    if (st) st.onchange = function () { statusFilter = st.value || ''; page = 1; paint(); };
    var ty = document.getElementById('dp3Type');
    if (ty) ty.onchange = function () { typeFilter = ty.value || ''; page = 1; paint(); };
    var loc = document.getElementById('dp3Loc');
    if (loc) loc.onchange = function () { locFilter = loc.value || ''; page = 1; paint(); };

    var nw = document.getElementById('dp3New');
    if (nw) {
      nw.onclick = function () {
        /* Portal has no dept CRUD — manage people into departments via Users (same RBAC). */
        if (typeof hideDepartmentsV3 === 'function') hideDepartmentsV3();
        if (typeof setView === 'function') setView('users');
        setTimeout(function () {
          if (typeof openUserModal === 'function') openUserModal(null);
        }, 60);
      };
    }

    var prev = document.getElementById('dp3Prev');
    var next = document.getElementById('dp3Next');
    if (prev) prev.onclick = function () { if (page > 1) { page--; paint(); } };
    if (next) next.onclick = function () { page++; paint(); };
    document.querySelectorAll('[data-page]').forEach(function (b) {
      b.onclick = function () { page = Number(b.getAttribute('data-page')) || 1; paint(); };
    });

    document.querySelectorAll('.dp3-row-btn').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        var menu = btn.parentElement && btn.parentElement.querySelector('.dp3-menu');
        document.querySelectorAll('.dp3-menu.on').forEach(function (m) {
          if (m !== menu) m.classList.remove('on');
        });
        if (menu) menu.classList.toggle('on');
      };
    });

    document.querySelectorAll('.dp3-menu [data-act]').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        var tr = btn.closest('tr');
        var cat = tr && tr.getAttribute('data-dept');
        document.querySelectorAll('.dp3-menu.on').forEach(function (m) { m.classList.remove('on'); });
        if (!cat) return;
        if (btn.getAttribute('data-act') === 'users') {
          if (typeof hideDepartmentsV3 === 'function') hideDepartmentsV3();
          if (typeof setView === 'function') setView('users');
        } else {
          openProjectsForDept(cat);
        }
      };
    });

    document.querySelectorAll('tbody tr[data-dept]').forEach(function (tr) {
      tr.onclick = function (ev) {
        if (ev.target.closest('.dp3-row-menu')) return;
        openProjectsForDept(tr.getAttribute('data-dept'));
      };
    });

    document.addEventListener('click', function closer(ev) {
      if (!ev.target.closest('.dp3-row-menu')) {
        document.querySelectorAll('.dp3-menu.on').forEach(function (m) { m.classList.remove('on'); });
      }
    }, { once: true });
  }

  window.showDepartmentsV3 = function () {
    if (typeof hideCalendarV3 === 'function') hideCalendarV3();
    if (typeof hideTimelineV3 === 'function') hideTimelineV3();
    if (typeof hideTasksV3 === 'function') hideTasksV3();
    if (typeof hideIssuesV3 === 'function') hideIssuesV3();
    if (typeof hideMilestonesV3 === 'function') hideMilestonesV3();
    visible = true;
    syncBody(true);
    setShellHidden(true);
    var host = ensureView();
    if (host) {
      host.hidden = false;
      host.classList.remove('hidden');
    }
    if (canManage() && typeof loadUsers === 'function') {
      try { loadUsers().then(function () { paint(); }).catch(function () { paint(); }); }
      catch (_) { paint(); }
    } else {
      paint();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.hideDepartmentsV3 = function () {
    if (!visible) return;
    visible = false;
    syncBody(false);
    var host = document.getElementById('departmentsView');
    if (host) {
      host.hidden = true;
      host.classList.add('hidden');
    }
    setShellHidden(false);
  };

  try {
    var oldRender = render;
    render = function () {
      var out = oldRender.apply(this, arguments);
      if (visible) setTimeout(paint, 0);
      return out;
    };
  } catch (_) {}
})();
