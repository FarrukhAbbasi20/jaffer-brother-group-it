(function () {
  'use strict';

  var milestonesVisible = false;
  var painting = false;
  var pageSize = 10;
  var page = 1;
  var activeTab = 'all';
  var localQuery = '';
  var localProject = '';
  var localOwner = '';
  var localStatus = '';
  var filtersOpen = false;
  var sortKey = 'due';
  var sortDir = 1;

  function e(v) {
    return (v == null ? '' : String(v)).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }

  function avTone(name) {
    var s = String(name || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % 5;
    return h === 0 ? '' : 't' + (h + 1);
  }

  function parseDate(d) {
    if (!d) return null;
    try {
      var raw = String(d);
      var dt = raw.length >= 10 && raw[4] === '-'
        ? new Date(raw.slice(0, 10) + 'T00:00:00')
        : new Date(raw);
      if (Number.isNaN(dt.getTime())) return null;
      dt.setHours(0, 0, 0, 0);
      return dt;
    } catch (_) { return null; }
  }

  function today() {
    var t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }

  function daysFromToday(due) {
    var d = parseDate(due);
    if (!d) return null;
    return Math.round((d.getTime() - today().getTime()) / 86400000);
  }

  function fmt(d) {
    if (!d) return '—';
    try {
      var raw = String(d);
      var dt = raw.length >= 10 && raw[4] === '-'
        ? new Date(raw.slice(0, 10) + 'T00:00:00')
        : new Date(raw);
      if (!Number.isNaN(dt.getTime())) {
        return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    } catch (_) {}
    return String(d);
  }

  function safeData() {
    try { return Array.isArray(data) ? data : []; } catch (_) { return []; }
  }

  function safeStandalone() {
    try { return Array.isArray(standalone) ? standalone : []; } catch (_) { return []; }
  }

  function isCompleted(status) {
    return String(status || '') === 'Completed';
  }

  function isOverdue(m) {
    if (!m || isCompleted(m.status)) return false;
    var days = daysFromToday(m.due);
    return days != null && days < 0;
  }

  function isUpcoming(m) {
    if (!m || isCompleted(m.status)) return false;
    var days = daysFromToday(m.due);
    return days != null && days >= 0 && days <= 30;
  }

  function childTasks(m) {
    return Array.isArray(m && m.tasks) ? m.tasks : [];
  }

  function deriveProgress(m) {
    if (m == null) return 0;
    if (typeof m.progress === 'number' && !Number.isNaN(m.progress)) {
      return Math.max(0, Math.min(100, Math.round(m.progress)));
    }
    if (isCompleted(m.status)) return 100;
    var steps = childTasks(m);
    if (steps.length) {
      var done = steps.filter(function (t) { return isCompleted(t.status); }).length;
      return Math.round((done / steps.length) * 100);
    }
    return 0;
  }

  /**
   * Map live status + due date → mockup pills:
   * On Track | At Risk | Delayed | Upcoming | Completed
   */
  function displayStatus(m) {
    if (isCompleted(m.status)) return { label: 'Completed', cls: 'done' };
    if (isOverdue(m)) return { label: 'Delayed', cls: 'delayed' };
    if (String(m.status || '') === 'Blocked') return { label: 'At Risk', cls: 'atrisk' };

    var days = daysFromToday(m.due);
    var st = String(m.status || '');

    if (st === 'In Progress') {
      if (days != null && days <= 7) return { label: 'At Risk', cls: 'atrisk' };
      return { label: 'On Track', cls: 'ontrack' };
    }

    if (st === 'Not Started' || !st) {
      if (days != null && days <= 30) return { label: 'Upcoming', cls: 'upcoming' };
      return { label: 'Upcoming', cls: 'upcoming' };
    }

    if (days != null && days <= 7) return { label: 'At Risk', cls: 'atrisk' };
    if (days != null && days <= 30) return { label: 'Upcoming', cls: 'upcoming' };
    return { label: 'On Track', cls: 'ontrack' };
  }

  function findProject(projectId) {
    if (!projectId) return null;
    return safeData().find(function (p) { return String(p.id) === String(projectId); }) || null;
  }

  function subtitleOf(m) {
    var n = String(m.notes || '').replace(/\s+/g, ' ').trim();
    if (n) {
      if (n.length > 80) n = n.slice(0, 77) + '…';
      return n;
    }
    var steps = childTasks(m);
    if (steps.length) {
      var done = steps.filter(function (t) { return isCompleted(t.status); }).length;
      return done + '/' + steps.length + ' child tasks complete';
    }
    if (m.kind === 'monthly') return 'Monthly milestone target';
    return 'Milestone';
  }

  function normalizeMilestone(m, project) {
    var p = project || findProject(m.projectId) || null;
    var projectName = (p && p.name) || '';
    var category = (p && p.category) || '';
    if (!projectName) {
      projectName = m.projectId ? 'Project' : 'Direct';
      category = m.kind === 'monthly' ? 'Leadership' : (category || 'Standalone');
    }
    return {
      id: m.id,
      title: m.title || 'Untitled milestone',
      notes: m.notes || '',
      status: m.status || 'Not Started',
      due: m.due || '',
      start: m.start || '',
      owner: m.owner || '',
      lead: m.lead || '',
      ownerId: m.ownerId || null,
      leadId: m.leadId || null,
      projectId: (p && p.id) || m.projectId || null,
      projectName: projectName,
      category: category,
      kind: m.kind || 'monthly',
      tasks: childTasks(m),
      progress: deriveProgress(m),
      updated: m.updated || m.updatedAt || ''
    };
  }

  function isParentMilestoneRow(m) {
    if (!m) return false;
    if ((m.kind || '') === 'monthly') return true;
    if ((m.kind || 'task') === 'task') return false;
    if (Array.isArray(m.tasks) && m.tasks.length) return true;
    return false;
  }

  /**
   * Source of truth: kind === 'monthly' (standalone leadership targets + any on projects).
   * If monthly are sparse (< 3), also include other non-task parent milestone rows.
   */
  function collectMilestones() {
    var out = [];
    var seen = {};

    function push(m, project) {
      if (!m || !m.id || seen[m.id]) return;
      seen[m.id] = true;
      out.push(normalizeMilestone(m, project || null));
    }

    safeStandalone().forEach(function (m) {
      if ((m.kind || '') === 'monthly') push(m, null);
    });

    safeData().forEach(function (p) {
      (p.milestones || []).forEach(function (m) {
        if ((m.kind || '') === 'monthly') push(m, p);
      });
    });

    if (out.length < 3) {
      safeStandalone().forEach(function (m) {
        if ((m.kind || '') === 'monthly') return;
        if (!isParentMilestoneRow(m)) return;
        if (m.parentId) return;
        push(m, null);
      });
      safeData().forEach(function (p) {
        (p.milestones || []).forEach(function (m) {
          if ((m.kind || 'task') === 'task' && !(Array.isArray(m.tasks) && m.tasks.length)) return;
          if ((m.kind || '') === 'monthly') return;
          if (!isParentMilestoneRow(m)) return;
          push(m, p);
        });
      });
    }

    return out;
  }

  function countsOf(list) {
    return {
      all: list.length,
      upcoming: list.filter(isUpcoming).length,
      overdue: list.filter(isOverdue).length,
      completed: list.filter(function (m) { return isCompleted(m.status); }).length
    };
  }

  function tabFilter(list) {
    if (activeTab === 'upcoming') return list.filter(isUpcoming);
    if (activeTab === 'overdue') return list.filter(isOverdue);
    if (activeTab === 'completed') return list.filter(function (m) { return isCompleted(m.status); });
    return list.slice();
  }

  function filteredList() {
    var list = tabFilter(collectMilestones());
    var q = String(localQuery || '').trim().toLowerCase();

    list = list.filter(function (m) {
      if (localProject) {
        if (localProject === '__direct__') {
          if (m.projectId) return false;
        } else if (String(m.projectId || '') !== String(localProject)) {
          return false;
        }
      }
      if (localOwner && String(m.owner || '') !== localOwner) return false;
      if (localStatus) {
        var st = displayStatus(m);
        if (st.label !== localStatus) return false;
      }
      if (q) {
        var hay = (
          m.title + ' ' + (m.notes || '') + ' ' + (m.owner || '') + ' ' +
          (m.projectName || '') + ' ' + (m.category || '') + ' ' + (m.status || '')
        ).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });

    list.sort(function (a, b) {
      var dir = sortDir || 1;
      var ka = '';
      var kb = '';
      if (sortKey === 'title') {
        ka = String(a.title || '').toLowerCase();
        kb = String(b.title || '').toLowerCase();
      } else if (sortKey === 'project') {
        ka = String(a.projectName || '').toLowerCase();
        kb = String(b.projectName || '').toLowerCase();
      } else if (sortKey === 'owner') {
        ka = String(a.owner || '').toLowerCase();
        kb = String(b.owner || '').toLowerCase();
      } else if (sortKey === 'status') {
        ka = displayStatus(a).label;
        kb = displayStatus(b).label;
      } else if (sortKey === 'progress') {
        return dir > 0 ? (a.progress - b.progress) : (b.progress - a.progress);
      } else {
        ka = a.due || (dir > 0 ? '9999-99-99' : '');
        kb = b.due || (dir > 0 ? '9999-99-99' : '');
      }
      if (ka < kb) return -1 * dir;
      if (ka > kb) return 1 * dir;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });

    return list;
  }

  function ensureView() {
    var host = document.getElementById('appContent');
    if (!host) return null;
    var el = document.getElementById('milestonesView');
    if (!el) {
      el = document.createElement('div');
      el.id = 'milestonesView';
      el.className = 'milestones-v3 hidden';
      el.hidden = true;
      host.appendChild(el);
    }
    return el;
  }

  function setShellHidden(hidden) {
    [
      'dashboardView', 'kanbanView', 'projectsView', 'timelineView', 'issuesView', 'usersView',
      'filterBar', 'kpis', 'ovPageHead', 'ovFilters', 'pjPageHead', 'pjToolbar', 'kbPageHead', 'kbToolbar',
      'tasksView', 'issuesV3View'
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (hidden) el.classList.add('ms3-shell-hidden');
      else el.classList.remove('ms3-shell-hidden');
    });
    var actions = document.getElementById('pageActions');
    if (actions) {
      if (hidden) actions.classList.add('ms3-shell-hidden');
      else actions.classList.remove('ms3-shell-hidden');
    }
    var foot = document.querySelector('#appContent>.foot');
    if (foot) {
      if (hidden) foot.classList.add('ms3-shell-hidden');
      else foot.classList.remove('ms3-shell-hidden');
    }
    var cal = document.getElementById('calendarView');
    if (cal && hidden) cal.classList.add('hidden');
  }

  function syncSidebar() {
    document.querySelectorAll('#sidebarNav .nav-item').forEach(function (n) {
      n.classList.toggle('on', n.getAttribute('data-real-view') === 'milestones');
    });
  }

  function syncBody(on) {
    document.body.classList.toggle('view-milestones', on);
    if (on) {
      document.body.classList.remove('view-dashboard');
      document.body.classList.remove('view-projects');
      document.body.classList.remove('view-kanban');
      document.body.classList.remove('view-calendar');
      document.body.classList.remove('view-tasks');
      document.body.classList.remove('view-issues');
      syncSidebar();
    }
  }

  function dueCell(m) {
    if (!m.due) {
      return '<span class="ms3-due is-blank"><i data-lucide="calendar"></i>—</span>';
    }
    var cls = 'ms3-due' + (isOverdue(m) ? ' is-overdue' : '');
    return '<span class="' + cls + '"><i data-lucide="calendar"></i>' + e(fmt(m.due)) + '</span>';
  }

  function ownerCell(m) {
    var owner = String(m.owner || '').trim();
    if (!owner) return '<span class="ms3-owner is-blank">—</span>';
    return '<span class="ms3-owner"><span class="ms3-ava ' + avTone(owner) + '">' + e(initials(owner)) + '</span>' + e(owner) + '</span>';
  }

  function rowHtml(m) {
    var st = displayStatus(m);
    var canEdit = true;
    var canComment = true;
    try {
      if (typeof uiCan === 'function') {
        canEdit = !!(uiCan('edit_project', m) || uiCan('create_monthly') || uiCan('edit_task', m));
        canComment = !!uiCan('comment', m);
      }
    } catch (_) {}

    var actions = [];
    if (canEdit) actions.push('<button type="button" data-act="edit">Edit</button>');
    if (canComment) actions.push('<button type="button" data-act="comment">Add Comment</button>');
    actions.push('<button type="button" data-act="open">Open</button>');

    var pct = Math.max(0, Math.min(100, Number(m.progress) || 0));

    return '<tr data-id="' + e(m.id) + '" data-pid="' + e(m.projectId || '') + '">' +
      '<td style="width:36px"><input type="checkbox" class="ms3-check" aria-label="Select milestone"></td>' +
      '<td style="width:26%">' +
        '<div class="ms3-ms">' +
          '<strong>' + e(m.title) + '</strong>' +
          '<span>' + e(subtitleOf(m)) + '</span>' +
        '</div>' +
      '</td>' +
      '<td style="width:16%">' +
        '<div class="ms3-proj">' +
          '<strong>' + e(m.projectName || '—') + '</strong>' +
          '<span>' + e(m.category || '—') + '</span>' +
        '</div>' +
      '</td>' +
      '<td style="width:12%">' + dueCell(m) + '</td>' +
      '<td style="width:14%">' + ownerCell(m) + '</td>' +
      '<td style="width:10%"><span class="ms3-status ' + st.cls + '">' + e(st.label) + '</span></td>' +
      '<td style="width:12%">' +
        '<div class="ms3-prog">' +
          '<span class="ms3-prog-pct">' + pct + '%</span>' +
          '<span class="ms3-prog-track"><i style="width:' + pct + '%"></i></span>' +
        '</div>' +
      '</td>' +
      '<td style="width:40px">' +
        '<div class="ms3-row-menu">' +
          '<button type="button" class="ms3-row-btn" aria-label="Actions"><i data-lucide="ellipsis-vertical"></i></button>' +
          '<div class="ms3-menu">' + actions.join('') + '</div>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }

  function filterOptionsHtml(all) {
    var projects = safeData().slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    var owners = [];
    var seenO = {};
    all.forEach(function (m) {
      var n = String(m.owner || '').trim();
      if (n && !seenO[n]) { seenO[n] = true; owners.push(n); }
    });
    owners.sort();

    var statuses = ['On Track', 'At Risk', 'Delayed', 'Upcoming', 'Completed'];

    return '<select id="ms3Project" aria-label="All Projects">' +
        '<option value="">All Projects</option>' +
        '<option value="__direct__"' + (localProject === '__direct__' ? ' selected' : '') + '>Direct / Leadership</option>' +
        projects.map(function (p) {
          return '<option value="' + e(p.id) + '"' + (String(localProject) === String(p.id) ? ' selected' : '') + '>' + e(p.name) + '</option>';
        }).join('') +
      '</select>' +
      '<select id="ms3Owner" aria-label="All Owners">' +
        '<option value="">All Owners</option>' +
        owners.map(function (n) {
          return '<option value="' + e(n) + '"' + (n === localOwner ? ' selected' : '') + '>' + e(n) + '</option>';
        }).join('') +
      '</select>' +
      '<select id="ms3Status" aria-label="All Statuses">' +
        '<option value="">All Statuses</option>' +
        statuses.map(function (s) {
          return '<option value="' + e(s) + '"' + (s === localStatus ? ' selected' : '') + '>' + e(s) + '</option>';
        }).join('') +
      '</select>';
  }

  function bindChrome() {
    var search = document.getElementById('ms3Search');
    if (search) {
      search.oninput = function () {
        localQuery = search.value || '';
        page = 1;
        paintBody();
      };
    }

    ['ms3Project', 'ms3Owner', 'ms3Status'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.onchange = function () {
        if (id === 'ms3Project') localProject = el.value || '';
        if (id === 'ms3Owner') localOwner = el.value || '';
        if (id === 'ms3Status') localStatus = el.value || '';
        page = 1;
        paintBody();
      };
    });

    document.querySelectorAll('[data-ms3-tab]').forEach(function (btn) {
      btn.onclick = function () {
        activeTab = btn.getAttribute('data-ms3-tab') || 'all';
        page = 1;
        paintAll();
      };
    });

    document.querySelectorAll('[data-ms3-kpi]').forEach(function (kpi) {
      kpi.onclick = function () {
        activeTab = kpi.getAttribute('data-ms3-kpi') || 'all';
        page = 1;
        paintAll();
      };
    });

    var filtersBtn = document.getElementById('ms3Filters');
    if (filtersBtn) {
      filtersBtn.onclick = function () {
        filtersOpen = !filtersOpen;
        var panel = document.getElementById('ms3FilterPanel');
        if (panel) panel.classList.toggle('on', filtersOpen);
        filtersBtn.classList.toggle('on', filtersOpen);
      };
    }

    var nw = document.getElementById('ms3NewMilestone');
    if (nw) {
      nw.onclick = function () {
        if (typeof openMonthly === 'function') openMonthly();
      };
    }

    document.querySelectorAll('[data-ms3-sort]').forEach(function (btn) {
      btn.onclick = function () {
        var key = btn.getAttribute('data-ms3-sort') || 'due';
        if (sortKey === key) sortDir = sortDir === 1 ? -1 : 1;
        else {
          sortKey = key;
          sortDir = key === 'due' || key === 'progress' ? 1 : 1;
        }
        paintBody();
      };
    });
  }

  function bindRows(host) {
    host.querySelectorAll('.ms3-row-btn').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        var menu = btn.parentElement && btn.parentElement.querySelector('.ms3-menu');
        document.querySelectorAll('.ms3-menu.on').forEach(function (m) {
          if (m !== menu) m.classList.remove('on');
        });
        if (menu) menu.classList.toggle('on');
      };
    });

    host.querySelectorAll('.ms3-menu [data-act]').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        var tr = btn.closest('tr');
        if (!tr) return;
        var id = tr.getAttribute('data-id');
        var pid = tr.getAttribute('data-pid') || null;
        var act = btn.getAttribute('data-act');
        document.querySelectorAll('.ms3-menu.on').forEach(function (m) { m.classList.remove('on'); });
        if (act === 'comment') {
          if (typeof openComments === 'function') openComments(pid || null, id);
        } else if (typeof openMs === 'function') {
          openMs(pid || null, id);
        }
      };
    });

    host.querySelectorAll('tbody tr[data-id]').forEach(function (tr) {
      tr.addEventListener('dblclick', function () {
        var id = tr.getAttribute('data-id');
        var pid = tr.getAttribute('data-pid') || null;
        if (typeof openMs === 'function') openMs(pid || null, id);
      });
    });
  }

  function paintBody() {
    var list = filteredList();
    var total = list.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    if (page > totalPages) page = totalPages;
    var start = (page - 1) * pageSize;
    var slice = list.slice(start, start + pageSize);
    var from = total ? start + 1 : 0;
    var to = Math.min(start + pageSize, total);

    var tbody = document.getElementById('ms3Rows');
    var empty = document.getElementById('ms3Empty');
    var foot = document.getElementById('ms3Foot');
    if (!tbody) return;

    if (empty) empty.style.display = total ? 'none' : '';
    tbody.innerHTML = slice.map(rowHtml).join('');

    if (foot) {
      var pages = [];
      var maxBtns = Math.min(totalPages, 5);
      var startPage = Math.max(1, Math.min(page - 2, totalPages - maxBtns + 1));
      for (var i = 0; i < maxBtns; i++) {
        var n = startPage + i;
        if (n > totalPages) break;
        pages.push('<button type="button" data-page="' + n + '"' + (n === page ? ' class="on"' : '') + '>' + n + '</button>');
      }
      foot.innerHTML =
        '<span>Showing ' + from + '–' + to + ' of ' + total + ' milestones</span>' +
        '<div class="ms3-pages">' +
          '<button type="button" data-page="prev" aria-label="Previous"' + (page <= 1 ? ' disabled' : '') + '><i data-lucide="chevron-left"></i></button>' +
          pages.join('') +
          '<button type="button" data-page="next" aria-label="Next"' + (page >= totalPages ? ' disabled' : '') + '><i data-lucide="chevron-right"></i></button>' +
        '</div>';

      foot.querySelectorAll('[data-page]').forEach(function (btn) {
        btn.onclick = function () {
          var v = btn.getAttribute('data-page');
          if (v === 'prev') page = Math.max(1, page - 1);
          else if (v === 'next') page = Math.min(totalPages, page + 1);
          else page = Number(v) || 1;
          paintBody();
          try { refreshLucideIcons(); } catch (_) { if (window.lucide) window.lucide.createIcons(); }
        };
      });
    }

    bindRows(document.getElementById('milestonesView') || document);
    try { refreshLucideIcons(); } catch (_) { if (window.lucide) window.lucide.createIcons(); }
  }

  function paintAll() {
    if (!milestonesVisible || painting) return;
    painting = true;
    try {
      var host = ensureView();
      if (!host) return;

      var all = collectMilestones();
      var counts = countsOf(all);
      var now = new Date();
      var name = '';
      try { name = currentUser && currentUser.name ? currentUser.name.split(/\s+/)[0] : ''; } catch (_) {}
      var hour = now.getHours();
      var greet = (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening') + (name ? ', ' + name + '!' : '!');
      var canCreate = true;
      try { if (typeof uiCan === 'function') canCreate = !!uiCan('create_monthly'); } catch (_) {}

      host.hidden = false;
      host.classList.remove('hidden');
      host.innerHTML =
        '<div class="ms3-page-head">' +
          '<div class="ms3-titleblock">' +
            '<div class="ms3-eyebrow">Jaffer Brothers Group IT</div>' +
            '<h1>Milestones</h1>' +
            '<p>Track key project milestones and keep your teams on schedule.</p>' +
          '</div>' +
          '<div class="ms3-head-right">' +
            '<div class="ms3-greeting">' +
              '<span class="ms3-greeting-date"><i data-lucide="calendar-days"></i>' +
                e(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })) +
              '</span>' +
              '<strong>' + e(greet) + '</strong>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ms3-kpis">' +
          '<article class="ms3-kpi' + (activeTab === 'all' ? ' on' : '') + '" data-ms3-kpi="all" role="button" tabindex="0">' +
            '<span class="ms3-kpi-icon blue"><i data-lucide="target"></i></span>' +
            '<div class="ms3-kpi-copy"><div class="ms3-kpi-label">Total Milestones</div><div class="ms3-kpi-value">' + counts.all + '</div><div class="ms3-kpi-sub">Across all projects</div></div>' +
          '</article>' +
          '<article class="ms3-kpi' + (activeTab === 'upcoming' ? ' on' : '') + '" data-ms3-kpi="upcoming" role="button" tabindex="0">' +
            '<span class="ms3-kpi-icon green"><i data-lucide="calendar-days"></i></span>' +
            '<div class="ms3-kpi-copy"><div class="ms3-kpi-label">Upcoming</div><div class="ms3-kpi-value">' + counts.upcoming + '</div><div class="ms3-kpi-sub">Due in next 30 days</div></div>' +
          '</article>' +
          '<article class="ms3-kpi' + (activeTab === 'overdue' ? ' on' : '') + '" data-ms3-kpi="overdue" role="button" tabindex="0">' +
            '<span class="ms3-kpi-icon orange"><i data-lucide="clock-3"></i></span>' +
            '<div class="ms3-kpi-copy"><div class="ms3-kpi-label">Overdue</div><div class="ms3-kpi-value">' + counts.overdue + '</div><div class="ms3-kpi-sub">Past target date</div></div>' +
          '</article>' +
          '<article class="ms3-kpi' + (activeTab === 'completed' ? ' on' : '') + '" data-ms3-kpi="completed" role="button" tabindex="0">' +
            '<span class="ms3-kpi-icon purple"><i data-lucide="circle-check"></i></span>' +
            '<div class="ms3-kpi-copy"><div class="ms3-kpi-label">Completed</div><div class="ms3-kpi-value">' + counts.completed + '</div><div class="ms3-kpi-sub">Completed milestones</div></div>' +
          '</article>' +
        '</div>' +
        '<section class="ms3-card">' +
          '<div class="ms3-card-head">' +
            '<div class="ms3-tabs">' +
              '<button type="button" class="ms3-tab' + (activeTab === 'all' ? ' on' : '') + '" data-ms3-tab="all">All (' + counts.all + ')</button>' +
              '<button type="button" class="ms3-tab' + (activeTab === 'upcoming' ? ' on' : '') + '" data-ms3-tab="upcoming">Upcoming (' + counts.upcoming + ')</button>' +
              '<button type="button" class="ms3-tab' + (activeTab === 'overdue' ? ' on' : '') + '" data-ms3-tab="overdue">Overdue (' + counts.overdue + ')</button>' +
              '<button type="button" class="ms3-tab' + (activeTab === 'completed' ? ' on' : '') + '" data-ms3-tab="completed">Completed (' + counts.completed + ')</button>' +
            '</div>' +
            '<div class="ms3-card-tools">' +
              '<input type="search" id="ms3Search" class="ms3-search" placeholder="Search milestones..." aria-label="Search milestones" value="' + e(localQuery) + '">' +
              '<button type="button" class="ms3-tool-btn' + (filtersOpen ? ' on' : '') + '" id="ms3Filters"><i data-lucide="funnel"></i> Filter</button>' +
              (canCreate
                ? '<button type="button" class="ms3-new" id="ms3NewMilestone"><i data-lucide="plus"></i> New Milestone</button>'
                : '') +
            '</div>' +
            '<div class="ms3-filter-panel' + (filtersOpen ? ' on' : '') + '" id="ms3FilterPanel">' + filterOptionsHtml(all) + '</div>' +
          '</div>' +
          '<div style="overflow:auto">' +
            '<table class="ms3-table">' +
              '<thead><tr>' +
                '<th style="width:36px"></th>' +
                '<th><button type="button" class="ms3-sort" data-ms3-sort="title">Milestone <span class="ms3-sort-ico" aria-hidden="true"></span></button></th>' +
                '<th><button type="button" class="ms3-sort" data-ms3-sort="project">Project <span class="ms3-sort-ico" aria-hidden="true"></span></button></th>' +
                '<th><button type="button" class="ms3-sort" data-ms3-sort="due">Target Date <span class="ms3-sort-ico" aria-hidden="true"></span></button></th>' +
                '<th><button type="button" class="ms3-sort" data-ms3-sort="owner">Owner <span class="ms3-sort-ico" aria-hidden="true"></span></button></th>' +
                '<th><button type="button" class="ms3-sort" data-ms3-sort="status">Status <span class="ms3-sort-ico" aria-hidden="true"></span></button></th>' +
                '<th><button type="button" class="ms3-sort" data-ms3-sort="progress">Progress <span class="ms3-sort-ico" aria-hidden="true"></span></button></th>' +
                '<th style="width:40px"></th>' +
              '</tr></thead>' +
              '<tbody id="ms3Rows"></tbody>' +
            '</table>' +
            '<div class="ms3-empty" id="ms3Empty" style="display:none">No milestones match your filters.</div>' +
          '</div>' +
          '<div class="ms3-foot" id="ms3Foot"></div>' +
        '</section>';

      bindChrome();
      paintBody();
    } finally {
      painting = false;
    }
  }

  window.showMilestonesV3 = function () {
    if (typeof hideTasksV3 === 'function') hideTasksV3();
    if (typeof hideIssuesV3 === 'function') hideIssuesV3();
    if (typeof hideCalendarV3 === 'function') hideCalendarV3();
    milestonesVisible = true;
    syncBody(true);
    setShellHidden(true);
    var host = ensureView();
    if (host) {
      host.hidden = false;
      host.classList.remove('hidden');
    }
    paintAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.hideMilestonesV3 = function () {
    if (!milestonesVisible) return;
    milestonesVisible = false;
    syncBody(false);
    var host = document.getElementById('milestonesView');
    if (host) {
      host.hidden = true;
      host.classList.add('hidden');
    }
    setShellHidden(false);
  };

  document.addEventListener('click', function () {
    document.querySelectorAll('.ms3-menu.on').forEach(function (m) { m.classList.remove('on'); });
  });

  try {
    var oldSetView = window.setView;
    if (typeof oldSetView === 'function') {
      window.setView = function (v) {
        if (typeof hideMilestonesV3 === 'function') hideMilestonesV3();
        return oldSetView.apply(this, arguments);
      };
    }
  } catch (_) {}

  try {
    var oldRender = render;
    render = function () {
      var out = oldRender.apply(this, arguments);
      if (milestonesVisible) setTimeout(paintAll, 0);
      return out;
    };
  } catch (_) {}

  window.addEventListener('load', function () {
    setTimeout(function () {
      ensureView();
      if (milestonesVisible) paintAll();
    }, 100);
  });
})();
