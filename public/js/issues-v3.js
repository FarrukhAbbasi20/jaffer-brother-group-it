(function () {
  'use strict';

  var issuesVisible = false;
  var painting = false;
  var loading = false;
  var preferClassic = false;
  var pageSize = 10;
  var page = 1;
  var activeTab = 'all';
  var localQuery = '';
  var localType = '';
  var localPriority = '';
  var localAssignee = '';
  var localProject = '';
  var localSprint = '';
  var filtersOpen = false;
  var sortCreated = -1;
  var cache = [];

  function openClassicMode(mode) {
    preferClassic = true;
    issuesVisible = false;
    syncBody(false);
    var host = document.getElementById('issuesV3View');
    if (host) {
      host.hidden = true;
      host.classList.add('hidden');
    }
    setShellHidden(false);
    if (typeof setView === 'function') setView('issues');
    if (typeof setIssueMode === 'function') setIssueMode(mode || 'list');
  }

  function e(v) {
    return (v == null ? '' : String(v)).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }

  function projectLabel(iss) {
    if (!iss || !iss.projectId) return 'Direct';
    try {
      var list = typeof data !== 'undefined' && Array.isArray(data) ? data : [];
      var p = list.find(function (x) { return String(x.id) === String(iss.projectId); });
      if (p && p.name) return String(p.name);
    } catch (_) {}
    var n = String(iss.projectName || '').trim();
    if (!n) return 'Direct';
    try {
      var stolen = (cache || []).some(function (x) {
        return x && String(x.id) !== String(iss.id) && String(x.summary || '') === n;
      });
      if (stolen) return 'Direct';
    } catch (_) {}
    return n;
  }

  function avTone(name) {
    var s = String(name || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % 5;
    return h === 0 ? '' : 't' + (h + 1);
  }

  function pctOf(n, total) {
    if (!total) return '0% of total';
    return Math.round((n / total) * 100) + '% of total';
  }

  function parseCreated(d) {
    if (!d) return null;
    try {
      var dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return null;
      return dt;
    } catch (_) { return null; }
  }

  function fmtDate(d) {
    var dt = parseCreated(d);
    if (!dt) return '—';
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtTime(d) {
    var dt = parseCreated(d);
    if (!dt) return '';
    return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function safeIssues() {
    if (cache.length) return cache.slice();
    try {
      return Array.isArray(issuesList) ? issuesList.slice() : [];
    } catch (_) {
      return [];
    }
  }

  function safeMeta() {
    try { return issueMeta || { types: [], priorities: [], statuses: [], sprints: [], savedFilters: [] }; }
    catch (_) { return { types: [], priorities: [], statuses: [], sprints: [], savedFilters: [] }; }
  }

  function safeUsers() {
    try { return Array.isArray(assignableUsers) ? assignableUsers : []; }
    catch (_) { return []; }
  }

  function safeProjects() {
    try { return Array.isArray(data) ? data : []; }
    catch (_) { return []; }
  }

  /** Map live workflow status → Open | In Progress | Resolved | Closed */
  function issueBucket(issue) {
    if (!issue) return 'open';
    var cat = String(issue.statusCategory || '').toLowerCase().replace(/-/g, '_');
    var st = String(issue.status || '').toLowerCase().trim();
    var resolution = String(issue.resolution || '').toLowerCase().trim();

    var closedByName =
      st.indexOf('closed') >= 0 ||
      st.indexOf('cancel') >= 0 ||
      resolution.indexOf('closed') >= 0 ||
      resolution.indexOf('cancel') >= 0;
    var resolvedByName =
      st === 'done' ||
      st === 'completed' ||
      st.indexOf('resolved') >= 0 ||
      resolution.indexOf('fixed') >= 0 ||
      resolution.indexOf('done') >= 0;

    if (cat === 'done' || closedByName || resolvedByName || st === 'done' || st === 'completed') {
      if (closedByName) return 'closed';
      return 'resolved';
    }

    var inProg = false;
    try {
      if (typeof isInProgressIssue === 'function') inProg = !!isInProgressIssue(issue);
    } catch (_) {}
    if (!inProg) {
      if (cat === 'in_progress') inProg = true;
      else if (st.indexOf('progress') >= 0 || st.indexOf('review') >= 0 || st === 'blocked') inProg = true;
    }
    if (inProg) return 'progress';

    return 'open';
  }

  function bucketLabel(b) {
    if (b === 'progress') return 'In Progress';
    if (b === 'resolved') return 'Resolved';
    if (b === 'closed') return 'Closed';
    return 'Open';
  }

  /** Map live priority → Critical | High | Medium | Low */
  function severityOf(issue) {
    var p = String((issue && issue.priority) || 'Medium').trim().toLowerCase();
    if (p === 'highest' || p === 'critical') return { label: 'Critical', cls: 'critical', icon: 'triangle-alert' };
    if (p === 'high') return { label: 'High', cls: 'high', icon: 'circle-alert' };
    if (p === 'low' || p === 'lowest') return { label: 'Low', cls: 'low', icon: 'arrow-down' };
    return { label: 'Medium', cls: 'medium', icon: 'circle-alert' };
  }

  function countsOf(list) {
    var all = list.length;
    var open = 0;
    var progress = 0;
    var resolved = 0;
    var closed = 0;
    list.forEach(function (iss) {
      var b = issueBucket(iss);
      if (b === 'progress') progress++;
      else if (b === 'resolved') resolved++;
      else if (b === 'closed') closed++;
      else open++;
    });
    return { all: all, open: open, progress: progress, resolved: resolved, closed: closed };
  }

  function tabFilter(list) {
    if (activeTab === 'open') return list.filter(function (i) { return issueBucket(i) === 'open'; });
    if (activeTab === 'progress') return list.filter(function (i) { return issueBucket(i) === 'progress'; });
    if (activeTab === 'resolved') return list.filter(function (i) { return issueBucket(i) === 'resolved'; });
    if (activeTab === 'closed') return list.filter(function (i) { return issueBucket(i) === 'closed'; });
    return list.slice();
  }

  function filteredList() {
    var list = tabFilter(safeIssues());
    var q = String(localQuery || '').trim().toLowerCase();

    list = list.filter(function (iss) {
      if (localType && String(iss.type || '') !== localType) return false;
      if (localPriority && String(iss.priority || '') !== localPriority) return false;
      if (localAssignee && String(iss.assigneeId || '') !== String(localAssignee)) return false;
      if (localProject) {
        if (localProject === '__direct__') {
          if (iss.projectId) return false;
        } else if (String(iss.projectId || '') !== String(localProject)) {
          return false;
        }
      }
      if (localSprint) {
        if (localSprint === 'none') {
          if (iss.sprintId) return false;
        } else if (String(iss.sprintId || '') !== String(localSprint)) {
          return false;
        }
      }
      if (q) {
        var hay = (
          (iss.key || '') + ' ' + (iss.summary || '') + ' ' + (iss.projectName || '') + ' ' +
          (iss.assigneeName || '') + ' ' + (iss.reporterName || '') + ' ' + (iss.status || '') + ' ' +
          (iss.priority || '') + ' ' + (iss.type || '')
        ).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });

    list.sort(function (a, b) {
      var da = a.createdAt || '';
      var db = b.createdAt || '';
      var cmp = String(da).localeCompare(String(db));
      if (!cmp) cmp = String(a.key || '').localeCompare(String(b.key || ''));
      return sortCreated > 0 ? cmp : -cmp;
    });

    return list;
  }

  function syncNativeFilters() {
    try {
      var iq = document.getElementById('iq');
      if (iq) iq.value = localQuery || '';
      var t = document.getElementById('i_type');
      if (t) t.value = localType || '';
      var p = document.getElementById('i_priority');
      if (p) p.value = localPriority || '';
      var a = document.getElementById('i_assignee');
      if (a) a.value = localAssignee || '';
      var pr = document.getElementById('i_project');
      if (pr) pr.value = localProject === '__direct__' ? '' : (localProject || '');
      var s = document.getElementById('i_sprint');
      if (s) s.value = localSprint || '';
      var st = document.getElementById('i_status');
      if (st) st.value = '';
    } catch (_) {}
  }

  function personHtml(name) {
    var n = String(name || '').trim();
    if (!n) return '<span class="iss3-person is-blank">—</span>';
    var tone = avTone(n);
    return '<span class="iss3-person"><span class="iss3-ava' + (tone ? ' ' + tone : '') + '">' +
      e(initials(n)) + '</span>' + e(n) + '</span>';
  }

  function rowHtml(iss) {
    var bucket = issueBucket(iss);
    var sev = severityOf(iss);
    var created = iss.createdAt || iss.updatedAt || '';
    var canEdit = true;
    try {
      if (typeof canCreateIssue === 'function') canEdit = !!canCreateIssue();
    } catch (_) {}

    var actions = [];
    if (canEdit) actions.push('<button type="button" data-act="edit">Edit</button>');
    actions.push('<button type="button" data-act="open">Open</button>');

    return '<tr data-id="' + e(iss.id) + '">' +
      '<td style="width:36px"><input type="checkbox" class="iss3-check" aria-label="Select issue"></td>' +
      '<td style="width:26%">' +
        '<div class="iss3-issue">' +
          '<div class="iss3-issue-line">' +
            '<button type="button" class="iss3-key" data-act="open">' + e(iss.key || '—') + '</button>' +
            '<span class="iss3-summary" title="' + e(iss.summary || '') + '">' + e(iss.summary || 'Untitled') + '</span>' +
          '</div>' +
        '</div>' +
      '</td>' +
      '<td class="iss3-proj-cell"><span class="iss3-proj" title="' + e(projectLabel(iss)) + '">' + e(projectLabel(iss)) + '</span></td>' +
      '<td style="width:12%">' + personHtml(iss.reporterName) + '</td>' +
      '<td style="width:10%">' +
        '<span class="iss3-sev ' + sev.cls + '"><i data-lucide="' + sev.icon + '"></i>' + e(sev.label) + '</span>' +
      '</td>' +
      '<td style="width:10%"><span class="iss3-status ' + (bucket === 'progress' ? 'progress' : bucket) + '">' +
        e(bucketLabel(bucket)) + '</span></td>' +
      '<td style="width:10%">' +
        '<div class="iss3-created"><strong>' + e(fmtDate(created)) + '</strong><span>' + e(fmtTime(created)) + '</span></div>' +
      '</td>' +
      '<td style="width:12%">' + personHtml(iss.assigneeName) + '</td>' +
      '<td style="width:40px">' +
        '<div class="iss3-row-menu">' +
          '<button type="button" class="iss3-row-btn" aria-label="Actions"><i data-lucide="ellipsis-vertical"></i></button>' +
          '<div class="iss3-menu">' + actions.join('') + '</div>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }

  function filterOptionsHtml() {
    var meta = safeMeta();
    var projects = safeProjects().slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    var users = safeUsers().slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    return '<select id="iss3Type" aria-label="All types">' +
        '<option value="">All types</option>' +
        (meta.types || []).map(function (t) {
          return '<option value="' + e(t) + '"' + (t === localType ? ' selected' : '') + '>' + e(t) + '</option>';
        }).join('') +
      '</select>' +
      '<select id="iss3Priority" aria-label="All priorities">' +
        '<option value="">All priorities</option>' +
        (meta.priorities || []).map(function (p) {
          return '<option value="' + e(p) + '"' + (p === localPriority ? ' selected' : '') + '>' + e(p) + '</option>';
        }).join('') +
      '</select>' +
      '<select id="iss3Assignee" aria-label="All assignees">' +
        '<option value="">All assignees</option>' +
        users.map(function (u) {
          return '<option value="' + e(u.id) + '"' + (String(localAssignee) === String(u.id) ? ' selected' : '') + '>' + e(u.name) + '</option>';
        }).join('') +
      '</select>' +
      '<select id="iss3Project" aria-label="All projects">' +
        '<option value="">All projects</option>' +
        '<option value="__direct__"' + (localProject === '__direct__' ? ' selected' : '') + '>Direct / unscoped</option>' +
        projects.map(function (p) {
          return '<option value="' + e(p.id) + '"' + (String(localProject) === String(p.id) ? ' selected' : '') + '>' + e(p.name) + '</option>';
        }).join('') +
      '</select>' +
      '<select id="iss3Sprint" aria-label="All sprints">' +
        '<option value="">All sprints</option>' +
        '<option value="none"' + (localSprint === 'none' ? ' selected' : '') + '>No sprint</option>' +
        (meta.sprints || []).map(function (s) {
          return '<option value="' + e(s.id) + '"' + (String(localSprint) === String(s.id) ? ' selected' : '') + '>' + e(s.name) + '</option>';
        }).join('') +
      '</select>';
  }

  function ensureView() {
    var host = document.getElementById('appContent');
    if (!host) return null;
    var el = document.getElementById('issuesV3View');
    if (!el) {
      el = document.createElement('div');
      el.id = 'issuesV3View';
      el.className = 'issues-v3 hidden';
      el.hidden = true;
      host.appendChild(el);
    }
    return el;
  }

  function setShellHidden(hidden) {
    [
      'dashboardView', 'kanbanView', 'projectsView', 'timelineView', 'issuesView', 'usersView',
      'filterBar', 'kpis', 'ovPageHead', 'ovFilters', 'pjPageHead', 'pjToolbar', 'kbPageHead', 'kbToolbar'
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (hidden) el.classList.add('iss3-shell-hidden');
      else el.classList.remove('iss3-shell-hidden');
    });
    var actions = document.getElementById('pageActions');
    if (actions) {
      if (hidden) actions.classList.add('iss3-shell-hidden');
      else actions.classList.remove('iss3-shell-hidden');
    }
    var foot = document.querySelector('#appContent>.foot');
    if (foot) {
      if (hidden) foot.classList.add('iss3-shell-hidden');
      else foot.classList.remove('iss3-shell-hidden');
    }
    var cal = document.getElementById('calendarView');
    if (cal && hidden) cal.classList.add('hidden');
    var tasks = document.getElementById('tasksView');
    if (tasks && hidden) {
      tasks.classList.add('hidden');
      tasks.hidden = true;
    }
  }

  function syncSidebar() {
    document.querySelectorAll('#sidebarNav .nav-item').forEach(function (n) {
      n.classList.toggle('on', n.getAttribute('data-real-view') === 'issues');
    });
  }

  function syncBody(on) {
    document.body.classList.toggle('view-issues', on);
    if (on) {
      document.body.classList.remove('view-dashboard');
      document.body.classList.remove('view-projects');
      document.body.classList.remove('view-kanban');
      document.body.classList.remove('view-calendar');
      document.body.classList.remove('view-tasks');
      syncSidebar();
    }
  }

  function openIssue(id) {
    if (typeof openIssueModal === 'function') openIssueModal(id || null);
  }

  function doExport() {
    var list = filteredList();
    var prev = null;
    try {
      prev = issuesList;
      issuesList = list;
      if (typeof exportIssuesExcel === 'function') exportIssuesExcel();
    } finally {
      try { if (prev != null) issuesList = prev; } catch (_) {}
    }
  }

  function bindChrome() {
    var search = document.getElementById('iss3Search');
    if (search) {
      search.oninput = function () {
        localQuery = search.value || '';
        page = 1;
        syncNativeFilters();
        paintBody();
      };
    }

    ['iss3Type', 'iss3Priority', 'iss3Assignee', 'iss3Project', 'iss3Sprint'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.onchange = function () {
        if (id === 'iss3Type') localType = el.value || '';
        if (id === 'iss3Priority') localPriority = el.value || '';
        if (id === 'iss3Assignee') localAssignee = el.value || '';
        if (id === 'iss3Project') localProject = el.value || '';
        if (id === 'iss3Sprint') localSprint = el.value || '';
        page = 1;
        syncNativeFilters();
        paintBody();
      };
    });

    document.querySelectorAll('[data-iss3-tab]').forEach(function (btn) {
      btn.onclick = function () {
        activeTab = btn.getAttribute('data-iss3-tab') || 'all';
        page = 1;
        paintAll();
      };
    });

    document.querySelectorAll('[data-iss3-kpi]').forEach(function (kpi) {
      kpi.onclick = function () {
        activeTab = kpi.getAttribute('data-iss3-kpi') || 'all';
        page = 1;
        paintAll();
      };
    });

    var nw = document.getElementById('iss3NewIssue');
    if (nw) nw.onclick = function () { openIssue(null); };

    var filtersBtn = document.getElementById('iss3Filters');
    if (filtersBtn) {
      filtersBtn.onclick = function () {
        filtersOpen = !filtersOpen;
        var panel = document.getElementById('iss3FilterPanel');
        if (panel) panel.classList.toggle('on', filtersOpen);
        filtersBtn.classList.toggle('on', filtersOpen);
      };
    }

    var exportBtn = document.getElementById('iss3Export');
    if (exportBtn) exportBtn.onclick = function () { doExport(); };

    var moreBtn = document.getElementById('iss3More');
    var moreMenu = document.getElementById('iss3MoreMenu');
    if (moreBtn && moreMenu) {
      moreBtn.onclick = function (ev) {
        ev.stopPropagation();
        moreMenu.classList.toggle('on');
      };
      moreMenu.querySelectorAll('[data-iss3-more]').forEach(function (btn) {
        btn.onclick = function (ev) {
          ev.stopPropagation();
          moreMenu.classList.remove('on');
          var act = btn.getAttribute('data-iss3-more');
          if (act === 'export') doExport();
          else if (act === 'board') openClassicMode('board');
          else if (act === 'backlog') openClassicMode('backlog');
          else if (act === 'sprints') openClassicMode('sprints');
          else if (act === 'save' && typeof saveCurrentIssueFilter === 'function') {
            syncNativeFilters();
            saveCurrentIssueFilter();
          } else if (act === 'refresh') {
            refreshData(true);
          }
        };
      });
    }

    var sortBtn = document.getElementById('iss3SortCreated');
    if (sortBtn) {
      sortBtn.onclick = function () {
        sortCreated = sortCreated === -1 ? 1 : -1;
        paintBody();
      };
    }
  }

  function bindRows(host) {
    host.querySelectorAll('.iss3-row-btn').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        var menu = btn.parentElement && btn.parentElement.querySelector('.iss3-menu');
        document.querySelectorAll('.iss3-menu.on').forEach(function (m) {
          if (m !== menu) m.classList.remove('on');
        });
        if (menu) menu.classList.toggle('on');
      };
    });

    host.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        var tr = btn.closest('tr');
        if (!tr) return;
        var id = tr.getAttribute('data-id');
        document.querySelectorAll('.iss3-menu.on').forEach(function (m) { m.classList.remove('on'); });
        openIssue(id);
      };
    });

    host.querySelectorAll('tbody tr[data-id]').forEach(function (tr) {
      tr.addEventListener('dblclick', function () {
        openIssue(tr.getAttribute('data-id'));
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

    var tbody = document.getElementById('iss3Rows');
    var empty = document.getElementById('iss3Empty');
    var foot = document.getElementById('iss3Foot');
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
        '<span>Showing ' + from + '–' + to + ' of ' + total + ' issues</span>' +
        '<div class="iss3-pages">' +
          '<button type="button" data-page="prev" aria-label="Previous"' + (page <= 1 ? ' disabled' : '') + '><i data-lucide="chevron-left"></i></button>' +
          pages.join('') +
          '<button type="button" data-page="next" aria-label="Next"' + (page >= totalPages ? ' disabled' : '') + '><i data-lucide="chevron-right"></i></button>' +
        '</div>' +
        '<select class="iss3-perpage" id="iss3PerPage" aria-label="Per page">' +
          [10, 25, 50].map(function (n) {
            return '<option value="' + n + '"' + (pageSize === n ? ' selected' : '') + '>' + n + ' per page</option>';
          }).join('') +
        '</select>';

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

      var per = document.getElementById('iss3PerPage');
      if (per) {
        per.onchange = function () {
          pageSize = Number(per.value) || 10;
          page = 1;
          paintBody();
        };
      }
    }

    bindRows(document.getElementById('issuesV3View') || document);
    try { refreshLucideIcons(); } catch (_) { if (window.lucide) window.lucide.createIcons(); }
  }

  function paintAll() {
    if (!issuesVisible || painting) return;
    painting = true;
    try {
      var host = ensureView();
      if (!host) return;

      var all = safeIssues();
      var counts = countsOf(all);
      var now = new Date();
      var name = '';
      try { name = currentUser && currentUser.name ? currentUser.name.split(/\s+/)[0] : ''; } catch (_) {}
      var hour = now.getHours();
      var greet = (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening') + (name ? ', ' + name + '!' : '!');
      var canCreate = true;
      try { if (typeof canCreateIssue === 'function') canCreate = !!canCreateIssue(); } catch (_) {}

      host.hidden = false;
      host.classList.remove('hidden');
      host.innerHTML =
        '<div class="iss3-page-head">' +
          '<div class="iss3-titleblock">' +
            '<div class="iss3-eyebrow">Jaffer Brothers Group IT</div>' +
            '<h1>Issues</h1>' +
            '<p>Track, manage, and resolve IT issues and incidents across the organization.</p>' +
          '</div>' +
          '<div class="iss3-head-right">' +
            '<div class="iss3-greeting">' +
              '<span class="iss3-greeting-date"><i data-lucide="calendar-days"></i>' +
                e(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })) +
              '</span>' +
              '<strong>' + e(greet) + '</strong>' +
            '</div>' +
            (canCreate
              ? '<button type="button" class="iss3-new" id="iss3NewIssue"><i data-lucide="plus"></i> New Issue</button>'
              : '') +
          '</div>' +
        '</div>' +
        '<div class="iss3-kpis">' +
          '<article class="iss3-kpi' + (activeTab === 'all' ? ' on' : '') + '" data-iss3-kpi="all" role="button" tabindex="0">' +
            '<span class="iss3-kpi-icon red"><i data-lucide="circle-alert"></i></span>' +
            '<div class="iss3-kpi-copy"><div class="iss3-kpi-label">All Issues</div><div class="iss3-kpi-value">' + counts.all + '</div><div class="iss3-kpi-sub">Total tracked issues</div></div>' +
          '</article>' +
          '<article class="iss3-kpi' + (activeTab === 'open' ? ' on' : '') + '" data-iss3-kpi="open" role="button" tabindex="0">' +
            '<span class="iss3-kpi-icon blue"><i data-lucide="folder"></i></span>' +
            '<div class="iss3-kpi-copy"><div class="iss3-kpi-label">Open</div><div class="iss3-kpi-value">' + counts.open + '</div><div class="iss3-kpi-sub">' + e(pctOf(counts.open, counts.all)) + '</div></div>' +
          '</article>' +
          '<article class="iss3-kpi' + (activeTab === 'progress' ? ' on' : '') + '" data-iss3-kpi="progress" role="button" tabindex="0">' +
            '<span class="iss3-kpi-icon orange"><i data-lucide="refresh-cw"></i></span>' +
            '<div class="iss3-kpi-copy"><div class="iss3-kpi-label">In Progress</div><div class="iss3-kpi-value">' + counts.progress + '</div><div class="iss3-kpi-sub">' + e(pctOf(counts.progress, counts.all)) + '</div></div>' +
          '</article>' +
          '<article class="iss3-kpi' + (activeTab === 'resolved' ? ' on' : '') + '" data-iss3-kpi="resolved" role="button" tabindex="0">' +
            '<span class="iss3-kpi-icon green"><i data-lucide="circle-check"></i></span>' +
            '<div class="iss3-kpi-copy"><div class="iss3-kpi-label">Resolved</div><div class="iss3-kpi-value">' + counts.resolved + '</div><div class="iss3-kpi-sub">' + e(pctOf(counts.resolved, counts.all)) + '</div></div>' +
          '</article>' +
          '<article class="iss3-kpi' + (activeTab === 'closed' ? ' on' : '') + '" data-iss3-kpi="closed" role="button" tabindex="0">' +
            '<span class="iss3-kpi-icon purple"><i data-lucide="archive"></i></span>' +
            '<div class="iss3-kpi-copy"><div class="iss3-kpi-label">Closed</div><div class="iss3-kpi-value">' + counts.closed + '</div><div class="iss3-kpi-sub">' + e(pctOf(counts.closed, counts.all)) + '</div></div>' +
          '</article>' +
        '</div>' +
        '<section class="iss3-card">' +
          '<div class="iss3-card-head">' +
            '<div class="iss3-tabs">' +
              '<button type="button" class="iss3-tab' + (activeTab === 'all' ? ' on' : '') + '" data-iss3-tab="all">All Issues <span class="iss3-n">' + counts.all + '</span></button>' +
              '<button type="button" class="iss3-tab' + (activeTab === 'open' ? ' on' : '') + '" data-iss3-tab="open">Open <span class="iss3-n">' + counts.open + '</span></button>' +
              '<button type="button" class="iss3-tab' + (activeTab === 'progress' ? ' on' : '') + '" data-iss3-tab="progress">In Progress <span class="iss3-n">' + counts.progress + '</span></button>' +
              '<button type="button" class="iss3-tab' + (activeTab === 'resolved' ? ' on' : '') + '" data-iss3-tab="resolved">Resolved <span class="iss3-n">' + counts.resolved + '</span></button>' +
              '<button type="button" class="iss3-tab' + (activeTab === 'closed' ? ' on' : '') + '" data-iss3-tab="closed">Closed <span class="iss3-n">' + counts.closed + '</span></button>' +
            '</div>' +
            '<div class="iss3-card-tools">' +
              '<input type="search" id="iss3Search" class="iss3-search" placeholder="Search issues..." aria-label="Search issues" value="' + e(localQuery) + '">' +
              '<button type="button" class="iss3-tool-btn' + (filtersOpen ? ' on' : '') + '" id="iss3Filters"><i data-lucide="funnel"></i> Filters</button>' +
              '<button type="button" class="iss3-tool-btn" id="iss3Export"><i data-lucide="download"></i> Export</button>' +
              '<div class="iss3-more-wrap">' +
                '<button type="button" class="iss3-tool-btn icon-only" id="iss3More" aria-label="More"><i data-lucide="ellipsis-vertical"></i></button>' +
                '<div class="iss3-more-menu" id="iss3MoreMenu">' +
                  '<button type="button" data-iss3-more="refresh">Refresh</button>' +
                  '<button type="button" data-iss3-more="export">Export Excel</button>' +
                  '<button type="button" data-iss3-more="save">Save filter</button>' +
                  '<button type="button" data-iss3-more="board">Board view</button>' +
                  '<button type="button" data-iss3-more="backlog">Backlog</button>' +
                  '<button type="button" data-iss3-more="sprints">Sprints</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="iss3-filter-panel' + (filtersOpen ? ' on' : '') + '" id="iss3FilterPanel">' + filterOptionsHtml() + '</div>' +
          '</div>' +
          '<div style="overflow:auto">' +
            '<table class="iss3-table">' +
              '<thead><tr>' +
                '<th style="width:36px"></th>' +
                '<th>Issue</th>' +
                '<th>Project</th>' +
                '<th>Reporter</th>' +
                '<th>Severity</th>' +
                '<th>Status</th>' +
                '<th><button type="button" class="iss3-sort" id="iss3SortCreated">Created <i data-lucide="arrow-up-down"></i></button></th>' +
                '<th>Owner</th>' +
                '<th style="width:40px"></th>' +
              '</tr></thead>' +
              '<tbody id="iss3Rows"></tbody>' +
            '</table>' +
            '<div class="iss3-empty" id="iss3Empty" style="display:none">No issues match your filters.</div>' +
          '</div>' +
          '<div class="iss3-foot" id="iss3Foot"></div>' +
        '</section>';

      bindChrome();
      paintBody();
    } finally {
      painting = false;
    }
  }

  async function refreshData(force) {
    if (loading) return;
    loading = true;
    try {
      if (typeof loadIssueMeta === 'function') {
        try { await loadIssueMeta(); } catch (_) {}
      }
      if (typeof issuesApi === 'function') {
        var payload = await issuesApi('');
        cache = (payload && payload.issues) || [];
        try {
          issuesList = cache.slice();
          issuesOverviewLoaded = true;
        } catch (_) {}
      } else if (typeof loadIssues === 'function') {
        await loadIssues();
        try { cache = Array.isArray(issuesList) ? issuesList.slice() : []; } catch (_) { cache = []; }
      }
      if (force || issuesVisible) paintAll();
    } catch (err) {
      console.error(err);
      try { cache = Array.isArray(issuesList) ? issuesList.slice() : []; } catch (_) { cache = []; }
      if (issuesVisible) paintAll();
    } finally {
      loading = false;
    }
  }

  window.showIssuesV3 = function () {
    if (typeof hideTasksV3 === 'function') hideTasksV3();
    if (typeof hideCalendarV3 === 'function') hideCalendarV3();
    issuesVisible = true;
    syncBody(true);
    setShellHidden(true);
    var host = ensureView();
    if (host) {
      host.hidden = false;
      host.classList.remove('hidden');
    }
    paintAll();
    refreshData(false).then(function () {
      if (issuesVisible) paintAll();
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.hideIssuesV3 = function () {
    if (!issuesVisible) return;
    issuesVisible = false;
    syncBody(false);
    var host = document.getElementById('issuesV3View');
    if (host) {
      host.hidden = true;
      host.classList.add('hidden');
    }
    setShellHidden(false);
  };

  document.addEventListener('click', function () {
    document.querySelectorAll('.iss3-menu.on, .iss3-more-menu.on').forEach(function (m) {
      m.classList.remove('on');
    });
  });

  try {
    var oldSetView = window.setView;
    if (typeof oldSetView === 'function') {
      window.setView = function (v) {
        if (v !== 'issues' && typeof hideIssuesV3 === 'function') hideIssuesV3();
        var out = oldSetView.apply(this, arguments);
        if (v === 'issues') {
          setTimeout(function () {
            if (preferClassic) {
              preferClassic = false;
              return;
            }
            if (typeof showIssuesV3 === 'function') showIssuesV3();
          }, 0);
        }
        return out;
      };
    }
  } catch (_) {}

  try {
    var oldLoad = loadIssues;
    loadIssues = function () {
      var result = oldLoad.apply(this, arguments);
      Promise.resolve(result).then(function () {
        if (!issuesVisible) return;
        try { cache = Array.isArray(issuesList) ? issuesList.slice() : cache; } catch (_) {}
        setTimeout(paintAll, 0);
      });
      return result;
    };
  } catch (_) {}

  try {
    var oldRenderIssues = renderIssues;
    renderIssues = function () {
      if (issuesVisible) {
        try { cache = Array.isArray(issuesList) ? issuesList.slice() : cache; } catch (_) {}
        paintAll();
        return;
      }
      return oldRenderIssues.apply(this, arguments);
    };
  } catch (_) {}

  window.addEventListener('load', function () {
    setTimeout(function () {
      ensureView();
      try {
        if (typeof view === 'string' && view === 'issues') showIssuesV3();
      } catch (_) {}
    }, 120);
  });
})();
