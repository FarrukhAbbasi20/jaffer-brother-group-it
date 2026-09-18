(function () {
  'use strict';

  var tasksVisible = false;
  var painting = false;
  var pageSize = 10;
  var page = 1;
  var activeTab = 'all';
  var localQuery = '';
  var localProject = '';
  var localAssignee = '';
  var localStatus = '';
  var sortDue = 0;
  var sortUpdated = 0;

  function e(v) {
    return (v == null ? '' : String(v)).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
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
    if (!d) return '-';
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

  function relTime(d) {
    if (!d) return '-';
    try {
      var raw = String(d);
      var dt = raw.length === 10 && raw[4] === '-'
        ? new Date(raw + 'T12:00:00')
        : new Date(raw);
      if (Number.isNaN(dt.getTime())) return fmt(d);
      var diff = Date.now() - dt.getTime();
      if (diff < 0) return fmt(d);
      var mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + 'm ago';
      var hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + 'h ago';
      var days = Math.floor(hrs / 24);
      if (days < 14) return days + 'd ago';
      return fmt(d);
    } catch (_) { return fmt(d); }
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

  function isOverdueTask(t) {
    if (!t || isCompleted(t.status)) return false;
    var days = daysFromToday(t.due);
    return days != null && days < 0;
  }

  function isDueSoonTask(t) {
    if (!t || isCompleted(t.status)) return false;
    var days = daysFromToday(t.due);
    return days != null && days >= 0 && days <= 7;
  }

  function isInProgress(t) {
    return String(t.status || '') === 'In Progress';
  }

  function isMine(t) {
    var u = null;
    try { u = currentUser; } catch (_) {}
    if (!u) return false;
    var uid = u.id != null ? String(u.id) : '';
    var name = String(u.name || '').trim().toLowerCase();
    var email = String(u.email || '').trim().toLowerCase();
    var ownerIds = Array.isArray(t.ownerIds) ? t.ownerIds : (t.ownerId ? [t.ownerId] : []);
    var leadIds = Array.isArray(t.leadIds) ? t.leadIds : (t.leadId ? [t.leadId] : []);
    if (uid && (ownerIds.map(String).indexOf(uid) >= 0 || leadIds.map(String).indexOf(uid) >= 0)) return true;
    var owners = Array.isArray(t.owners) && t.owners.length ? t.owners : (t.owner ? [t.owner] : []);
    var leads = Array.isArray(t.leads) && t.leads.length ? t.leads : (t.lead ? [t.lead] : []);
    var ownerEmail = String(t.ownerEmail || '').trim().toLowerCase();
    if (name && (owners.some(function (n) { return String(n || '').trim().toLowerCase() === name; }) ||
      leads.some(function (n) { return String(n || '').trim().toLowerCase() === name; }))) return true;
    if (email && (ownerEmail === email ||
      owners.some(function (n) { return String(n || '').trim().toLowerCase() === email; }) ||
      leads.some(function (n) { return String(n || '').trim().toLowerCase() === email; }))) return true;
    return false;
  }

  function priorityClass(p) {
    p = String(p || '').toLowerCase();
    if (p === 'high' || p === 'critical') return 'high';
    if (p === 'low') return 'low';
    return 'medium';
  }

  function displayStatus(t) {
    if (isCompleted(t.status)) return { label: 'Completed', cls: 'done' };
    if (isOverdueTask(t)) return { label: 'Overdue', cls: 'overdue' };
    if (isDueSoonTask(t)) return { label: 'Due Soon', cls: 'soon' };
    if (String(t.status || '') === 'Blocked') return { label: 'Blocked', cls: 'blocked' };
    if (isInProgress(t)) return { label: 'In Progress', cls: 'progress' };
    if (String(t.status || '') === 'Not Started' || !t.status) return { label: 'To Do', cls: 'todo' };
    return { label: String(t.status), cls: 'todo' };
  }

  function taskIcon(t) {
    var hay = (
      (t.title || '') + ' ' + (t.notes || '') + ' ' + (t.projectName || '') + ' ' + (t.category || '')
    ).toLowerCase();
    if (hay.indexOf('secur') >= 0 || hay.indexOf('patch') >= 0 || hay.indexOf('firewall') >= 0) {
      return { icon: 'shield', color: 'c-red' };
    }
    if (hay.indexOf('server') >= 0 || hay.indexOf('infra') >= 0 || hay.indexOf('reboot') >= 0) {
      return { icon: 'server', color: 'c-blue' };
    }
    if (hay.indexOf('network') >= 0 || hay.indexOf('vpn') >= 0 || hay.indexOf('wifi') >= 0) {
      return { icon: 'network', color: 'c-cyan' };
    }
    if (hay.indexOf('backup') >= 0 || hay.indexOf('database') >= 0 || hay.indexOf('sql') >= 0) {
      return { icon: 'database', color: 'c-purple' };
    }
    if (hay.indexOf('email') >= 0 || hay.indexOf('mail') >= 0) {
      return { icon: 'mail', color: 'c-amber' };
    }
    if (hay.indexOf('license') >= 0 || hay.indexOf('procure') >= 0 || hay.indexOf('vendor') >= 0) {
      return { icon: 'file-text', color: 'c-slate' };
    }
    if (hay.indexOf('support') >= 0 || hay.indexOf('ticket') >= 0 || hay.indexOf('fix') >= 0) {
      return { icon: 'wrench', color: 'c-green' };
    }
    if (hay.indexOf('deploy') >= 0 || hay.indexOf('config') >= 0 || hay.indexOf('setup') >= 0) {
      return { icon: 'settings', color: 'c-blue' };
    }
    var palette = [
      { icon: 'list-checks', color: 'c-blue' },
      { icon: 'clipboard-list', color: 'c-green' },
      { icon: 'file-text', color: 'c-amber' },
      { icon: 'cog', color: 'c-purple' },
      { icon: 'wrench', color: 'c-cyan' }
    ];
    var h = 0;
    var s = String(t.id || t.title || '');
    for (var i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % palette.length;
    return palette[h] || palette[0];
  }

  function projIcon(name) {
    var c = String(name || '').toLowerCase();
    if (c.indexOf('infra') >= 0 || c.indexOf('server') >= 0) return 'server';
    if (c.indexOf('erp') >= 0 || c.indexOf('soft') >= 0) return 'code-2';
    if (c.indexOf('secur') >= 0) return 'shield';
    if (c.indexOf('network') >= 0) return 'network';
    if (c.indexOf('direct') >= 0) return 'list-checks';
    return 'folder';
  }

  function subtitleOf(t) {
    var n = String(t.notes || '').replace(/\s+/g, ' ').trim();
    if (n) {
      if (n.length > 72) n = n.slice(0, 69) + '...';
      return n;
    }
    if (t.parentTitle) return 'Under  |  ' + t.parentTitle;
    if (t.projectName && t.projectName !== 'Direct Task') return t.projectName;
    return 'Task';
  }

  function normalizeTask(m, project, parentTitle) {
    var owners = Array.isArray(m.owners) && m.owners.length
      ? m.owners.map(function (n) { return String(n || '').trim(); }).filter(Boolean)
      : (m.owner ? [String(m.owner)] : []);
    var leads = Array.isArray(m.leads) && m.leads.length
      ? m.leads.map(function (n) { return String(n || '').trim(); }).filter(Boolean)
      : (m.lead ? [String(m.lead)] : []);
    var ownerIds = Array.isArray(m.ownerIds) && m.ownerIds.length
      ? m.ownerIds.map(String)
      : (m.ownerId ? [String(m.ownerId)] : []);
    var leadIds = Array.isArray(m.leadIds) && m.leadIds.length
      ? m.leadIds.map(String)
      : (m.leadId ? [String(m.leadId)] : []);
    return {
      id: m.id,
      title: m.title || 'Untitled task',
      notes: m.notes || '',
      status: m.status || 'Not Started',
      due: m.due || '',
      owner: owners[0] || '',
      owners: owners,
      lead: leads[0] || '',
      leads: leads,
      ownerId: ownerIds[0] || null,
      ownerIds: ownerIds,
      leadId: leadIds[0] || null,
      leadIds: leadIds,
      ownerEmail: m.ownerEmail || '',
      updated: m.updated || m.updatedAt || '',
      projectId: (project && project.id) || m.projectId || null,
      projectName: (project && project.name) || parentTitle || (m.projectId ? 'Project' : 'Direct Task'),
      category: (project && project.category) || '',
      priority: (project && project.priority) || m.priority || 'Medium',
      parentTitle: parentTitle || '',
      kind: m.kind || 'task'
    };
  }

  function collectTasks() {
    var out = [];
    var seen = {};

    safeData().forEach(function (p) {
      (p.milestones || []).forEach(function (m) {
        if ((m.kind || 'task') === 'monthly') return;
        if (!m.id || seen[m.id]) return;
        seen[m.id] = true;
        out.push(normalizeTask(m, p, null));
      });
    });

    safeStandalone().forEach(function (m) {
      if ((m.kind || '') === 'monthly') {
        (m.tasks || []).forEach(function (t) {
          if (!t.id || seen[t.id]) return;
          seen[t.id] = true;
          out.push(normalizeTask(t, null, m.title));
        });
        return;
      }
      if ((m.kind || 'task') === 'task' && !m.projectId && !m.parentId) {
        if (!m.id || seen[m.id]) return;
        seen[m.id] = true;
        out.push(normalizeTask(m, null, null));
      }
    });

    return out;
  }

  function countsOf(list) {
    return {
      all: list.length,
      mine: list.filter(isMine).length,
      overdue: list.filter(isOverdueTask).length,
      soon: list.filter(isDueSoonTask).length,
      completed: list.filter(function (t) { return isCompleted(t.status); }).length,
      progress: list.filter(isInProgress).length
    };
  }

  function tabFilter(list) {
    if (activeTab === 'mine') return list.filter(isMine);
    if (activeTab === 'overdue') return list.filter(isOverdueTask);
    if (activeTab === 'soon') return list.filter(isDueSoonTask);
    if (activeTab === 'completed') return list.filter(function (t) { return isCompleted(t.status); });
    return list.slice();
  }

  function filteredList() {
    var list = tabFilter(collectTasks());
    var q = String(localQuery || '').trim().toLowerCase();

    list = list.filter(function (t) {
      if (localProject) {
        if (localProject === '__direct__') {
          if (t.projectId) return false;
        } else if (String(t.projectId || '') !== String(localProject)) {
          return false;
        }
      }
      if (localAssignee) {
        var ownerNames = Array.isArray(t.owners) && t.owners.length ? t.owners : (t.owner ? [t.owner] : []);
        if (ownerNames.indexOf(localAssignee) < 0 && String(t.owner || '') !== localAssignee) return false;
      }
      if (localStatus && String(t.status || '') !== localStatus) return false;
      if (q) {
        var id = String(t.id || '').toLowerCase();
        var title = String(t.title || '').toLowerCase();
        if (id === q || title === q) return true;
        if (id.indexOf(q) >= 0 || title.indexOf(q) >= 0) return true;
        var people = (
          (Array.isArray(t.owners) ? t.owners.join(' ') : '') + ' ' +
          (Array.isArray(t.leads) ? t.leads.join(' ') : '') + ' ' +
          (t.owner || '') + ' ' + (t.lead || '')
        );
        var hay = (
          id + ' ' + title + ' ' + (t.notes || '') + ' ' + people + ' ' +
          (t.projectName || '') + ' ' + (t.status || '') + ' ' + (t.projectId || '')
        ).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });

    if (q) {
      list.sort(function (a, b) {
        var qa = String(localQuery || '').trim().toLowerCase();
        var score = function (t) {
          var id = String(t.id || '').toLowerCase();
          var title = String(t.title || '').toLowerCase();
          if (id === qa || title === qa) return 0;
          if (id.indexOf(qa) === 0 || title.indexOf(qa) === 0) return 1;
          if (id.indexOf(qa) >= 0 || title.indexOf(qa) >= 0) return 2;
          return 3;
        };
        var sa = score(a);
        var sb = score(b);
        if (sa !== sb) return sa - sb;
        return String(a.title || '').localeCompare(String(b.title || ''));
      });
    } else if (sortDue) {
      list.sort(function (a, b) {
        var da = a.due || (sortDue > 0 ? '9999' : '');
        var db = b.due || (sortDue > 0 ? '9999' : '');
        return sortDue > 0 ? da.localeCompare(db) : db.localeCompare(da);
      });
    } else if (sortUpdated) {
      list.sort(function (a, b) {
        var da = a.updated || '';
        var db = b.updated || '';
        return sortUpdated > 0 ? da.localeCompare(db) : db.localeCompare(da);
      });
    } else {
      list.sort(function (a, b) {
        var da = a.due || '9999-99-99';
        var db = b.due || '9999-99-99';
        if (da !== db) return da.localeCompare(db);
        return String(a.title || '').localeCompare(String(b.title || ''));
      });
    }

    return list;
  }

  function ensureView() {
    var host = document.getElementById('appContent');
    if (!host) return null;
    var el = document.getElementById('tasksView');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tasksView';
      el.className = 'tasks-v3 hidden';
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
      if (hidden) el.classList.add('tk3-shell-hidden');
      else el.classList.remove('tk3-shell-hidden');
    });
    var actions = document.getElementById('pageActions');
    if (actions) {
      if (hidden) actions.classList.add('tk3-shell-hidden');
      else actions.classList.remove('tk3-shell-hidden');
    }
    var foot = document.querySelector('#appContent>.foot');
    if (foot) {
      if (hidden) foot.classList.add('tk3-shell-hidden');
      else foot.classList.remove('tk3-shell-hidden');
    }
    var cal = document.getElementById('calendarView');
    if (cal && hidden) cal.classList.add('hidden');
  }

  function syncSidebar() {
    document.querySelectorAll('#sidebarNav .nav-item').forEach(function (n) {
      n.classList.toggle('on', n.getAttribute('data-real-view') === 'tasks');
    });
  }

  function syncBody(on) {
    document.body.classList.toggle('view-tasks', on);
    if (on) {
      document.body.classList.remove('view-dashboard');
      document.body.classList.remove('view-projects');
      document.body.classList.remove('view-kanban');
      document.body.classList.remove('view-calendar');
      document.body.classList.remove('view-issues');
      document.body.classList.remove('view-milestones');
      document.body.classList.remove('view-timeline');
      syncSidebar();
    }
  }

  function dueCell(t) {
    var days = daysFromToday(t.due);
    if (!t.due) return '<span class="tk3-due">-</span>';
    if (!isCompleted(t.status) && days === 0) {
      return '<span class="tk3-due is-today">Today</span>';
    }
    var cls = 'tk3-due' + (isOverdueTask(t) ? ' is-overdue' : '');
    return '<span class="' + cls + '">' + e(fmt(t.due)) + '</span>';
  }

  function rowHtml(t) {
    var ico = taskIcon(t);
    var st = displayStatus(t);
    var canEdit = true;
    var canComment = true;
    try {
      if (typeof uiCan === 'function') {
        canEdit = !!uiCan('edit_task', t);
        canComment = !!uiCan('comment', t);
      }
    } catch (_) {}

    var actions = [];
    if (canEdit) actions.push('<button type="button" data-act="edit">Edit</button>');
    if (canComment) actions.push('<button type="button" data-act="comment">Add Comment</button>');
    var canDelete = false;
    try {
      if (typeof uiCan === 'function') canDelete = !!uiCan('delete_task', t);
    } catch (_) {}
    if (canDelete) actions.push('<button type="button" class="danger" data-act="delete">Delete</button>');
    actions.push('<button type="button" data-act="open">Open</button>');

    var owners = Array.isArray(t.owners) && t.owners.length
      ? t.owners.map(function (n) { return String(n || '').trim(); }).filter(Boolean)
      : (t.owner ? [String(t.owner).trim()] : []);
    var owner = owners[0] || '';
    var assigneeHtml = owner
      ? '<span class="tk3-assignee" title="' + e(owners.join(', ')) + '"><span class="tk3-ava">' + e(initials(owner)) + '</span>' +
          e(owners.length > 1 ? owner + ' +' + (owners.length - 1) : owner) + '</span>'
      : '<span class="tk3-assignee is-blank">-</span>';

    return '<tr data-id="' + e(t.id) + '" data-pid="' + e(t.projectId || '') + '">' +
      '<td style="width:36px"><input type="checkbox" class="tk3-check" aria-label="Select task"></td>' +
      '<td style="width:26%">' +
        '<div class="tk3-task">' +
          '<span class="tk3-task-ico ' + ico.color + '"><i data-lucide="' + ico.icon + '"></i></span>' +
          '<div class="tk3-task-copy">' +
            '<strong>' + e(t.title) + '</strong>' +
            '<span>' + e(subtitleOf(t)) + '</span>' +
          '</div>' +
        '</div>' +
      '</td>' +
      '<td style="width:14%">' +
        '<span class="tk3-proj">' +
          '<span class="tk3-proj-ico"><i data-lucide="' + projIcon(t.projectName) + '"></i></span>' +
          e(t.projectName || '-') +
        '</span>' +
      '</td>' +
      '<td style="width:12%">' + assigneeHtml + '</td>' +
      '<td style="width:8%"><span class="tk3-prio ' + priorityClass(t.priority) + '">' + e(t.priority || 'Medium') + '</span></td>' +
      '<td style="width:10%">' + dueCell(t) + '</td>' +
      '<td style="width:10%"><span class="tk3-status ' + st.cls + '">' + e(st.label) + '</span></td>' +
      '<td style="width:8%"><span class="tk3-updated">' + e(relTime(t.updated)) + '</span></td>' +
      '<td style="width:40px">' +
        '<div class="tk3-row-menu">' +
          '<button type="button" class="tk3-row-btn" aria-label="Actions"><i data-lucide="ellipsis-vertical"></i></button>' +
          '<div class="tk3-menu">' + actions.join('') + '</div>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }

  function filterOptionsHtml(all) {
    var projects = safeData().slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    var assignees = [];
    var seenA = {};
    all.forEach(function (t) {
      var names = Array.isArray(t.owners) && t.owners.length ? t.owners : (t.owner ? [t.owner] : []);
      names.forEach(function (raw) {
        var n = String(raw || '').trim();
        if (n && !seenA[n]) { seenA[n] = true; assignees.push(n); }
      });
    });
    assignees.sort();

    var statuses = [];
    var seenS = {};
    all.forEach(function (t) {
      var s = String(t.status || '').trim();
      if (s && !seenS[s]) { seenS[s] = true; statuses.push(s); }
    });
    ['Not Started', 'In Progress', 'Completed', 'Blocked'].forEach(function (s) {
      if (!seenS[s]) { seenS[s] = true; statuses.push(s); }
    });
    statuses.sort();

    return '<input type="search" id="tk3Search" class="tk3-search" placeholder="Search tasks..." aria-label="Search tasks" value="' + e(localQuery) + '">' +
      '<select id="tk3Project" aria-label="All Projects">' +
        '<option value="">All Projects</option>' +
        '<option value="__direct__"' + (localProject === '__direct__' ? ' selected' : '') + '>Direct Task</option>' +
        projects.map(function (p) {
          return '<option value="' + e(p.id) + '"' + (String(localProject) === String(p.id) ? ' selected' : '') + '>' + e(p.name) + '</option>';
        }).join('') +
      '</select>' +
      '<select id="tk3Assignee" aria-label="All Assignees">' +
        '<option value="">All Assignees</option>' +
        assignees.map(function (n) {
          return '<option value="' + e(n) + '"' + (n === localAssignee ? ' selected' : '') + '>' + e(n) + '</option>';
        }).join('') +
      '</select>' +
      '<select id="tk3Status" aria-label="All Statuses">' +
        '<option value="">All Statuses</option>' +
        statuses.map(function (s) {
          return '<option value="' + e(s) + '"' + (s === localStatus ? ' selected' : '') + '>' + e(s === 'Not Started' ? 'To Do' : s) + '</option>';
        }).join('') +
      '</select>';
  }

  function bindChrome() {
    var search = document.getElementById('tk3Search');
    if (search) {
      search.oninput = function () {
        localQuery = search.value || '';
        page = 1;
        paintBody();
      };
      search.onkeydown = function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          localQuery = search.value || '';
          page = 1;
          paintBody();
        }
      };
    }
    var pEl = document.getElementById('tk3Project');
    var aEl = document.getElementById('tk3Assignee');
    var sEl = document.getElementById('tk3Status');
    if (pEl) pEl.onchange = function () { localProject = pEl.value || ''; page = 1; paintBody(); };
    if (aEl) aEl.onchange = function () { localAssignee = aEl.value || ''; page = 1; paintBody(); };
    if (sEl) sEl.onchange = function () { localStatus = sEl.value || ''; page = 1; paintBody(); };

    document.querySelectorAll('[data-tk3-tab]').forEach(function (btn) {
      btn.onclick = function () {
        activeTab = btn.getAttribute('data-tk3-tab') || 'all';
        localStatus = '';
        page = 1;
        syncKpiChrome();
        paintBody();
      };
    });

    document.querySelectorAll('[data-tk3-kpi]').forEach(function (kpi) {
      kpi.onclick = function () {
        var key = kpi.getAttribute('data-tk3-kpi') || 'all';
        activeTab = key === 'progress' ? 'all' : key;
        if (key === 'progress') {
          localStatus = 'In Progress';
        } else if (key === 'all' || key === 'mine' || key === 'overdue' || key === 'soon' || key === 'completed') {
          localStatus = '';
        }
        page = 1;
        syncKpiChrome();
        paintBody();
      };
    });

    var nw = document.getElementById('tk3NewTask');
    if (nw) {
      nw.onclick = function () {
        if (typeof openTask === 'function') openTask();
      };
    }

    var dueBtn = document.getElementById('tk3SortDue');
    if (dueBtn) {
      dueBtn.onclick = function () {
        sortUpdated = 0;
        sortDue = sortDue === 1 ? -1 : 1;
        paintBody();
      };
    }
    var upBtn = document.getElementById('tk3SortUpdated');
    if (upBtn) {
      upBtn.onclick = function () {
        sortDue = 0;
        sortUpdated = sortUpdated === 1 ? -1 : 1;
        paintBody();
      };
    }
  }

  function bindRows(host) {
    host.querySelectorAll('.tk3-row-btn').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        var menu = btn.parentElement && btn.parentElement.querySelector('.tk3-menu');
        document.querySelectorAll('.tk3-menu.on').forEach(function (m) {
          if (m !== menu) m.classList.remove('on');
        });
        if (menu) menu.classList.toggle('on');
      };
    });

    host.querySelectorAll('.tk3-menu [data-act]').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        var tr = btn.closest('tr');
        if (!tr) return;
        var id = tr.getAttribute('data-id');
        var pid = tr.getAttribute('data-pid') || null;
        var act = btn.getAttribute('data-act');
        document.querySelectorAll('.tk3-menu.on').forEach(function (m) { m.classList.remove('on'); });
        if (act === 'comment') {
          if (typeof openComments === 'function') openComments(pid || null, id);
        } else if (act === 'delete') {
          if (typeof deleteMilestone === 'function') {
            Promise.resolve(deleteMilestone(id)).then(function (ok) {
              if (ok && typeof paintAll === 'function') paintAll();
              else if (ok) paintBody();
            });
          }
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

  function syncKpiChrome() {
    var kpiOn = function (key) {
      if (key === 'progress') return localStatus === 'In Progress' && activeTab === 'all';
      return activeTab === key && !localStatus;
    };
    document.querySelectorAll('[data-tk3-kpi]').forEach(function (el) {
      var key = el.getAttribute('data-tk3-kpi') || 'all';
      el.classList.toggle('on', !!kpiOn(key));
    });
    document.querySelectorAll('[data-tk3-tab]').forEach(function (btn) {
      var key = btn.getAttribute('data-tk3-tab') || 'all';
      var on = activeTab === key;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var statusEl = document.getElementById('tk3Status');
    if (statusEl && statusEl.value !== localStatus) statusEl.value = localStatus || '';
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

    var tbody = document.getElementById('tk3Rows');
    var empty = document.getElementById('tk3Empty');
    var foot = document.getElementById('tk3Foot');
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
        '<span>Showing ' + from + '-' + to + ' of ' + total + ' tasks</span>' +
        '<div class="tk3-pages">' +
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

    bindRows(document.getElementById('tasksView') || document);
    try { refreshLucideIcons(); } catch (_) { if (window.lucide) window.lucide.createIcons(); }
  }

  function paintAll() {
    if (!tasksVisible || painting) return;
    painting = true;
    try {
      var host = ensureView();
      if (!host) return;

      var all = collectTasks();
      var counts = countsOf(all);
      var now = new Date();
      var name = '';
      try { name = currentUser && currentUser.name ? currentUser.name.split(/\s+/)[0] : ''; } catch (_) {}
      var hour = now.getHours();
      var greet = (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening') + (name ? ', ' + name + '!' : '!');
      var canCreate = true;
      try { if (typeof uiCan === 'function') canCreate = !!uiCan('create_task'); } catch (_) {}

      var kpiOn = function (key) {
        if (key === 'progress') return localStatus === 'In Progress' && activeTab === 'all';
        return activeTab === key && !localStatus;
      };

      host.hidden = false;
      host.classList.remove('hidden');
      host.innerHTML =
        '<div class="tk3-page-head">' +
          '<div class="tk3-titleblock">' +
            '<div class="tk3-eyebrow">Jaffer Brothers Group IT</div>' +
            '<h1>Tasks</h1>' +
            '<p>Stay on top of your work. Track, manage and complete tasks across all projects and teams.</p>' +
          '</div>' +
          '<div class="tk3-head-right">' +
            '<div class="tk3-greeting">' +
              '<span class="tk3-greeting-date"><i data-lucide="calendar-days"></i>' +
                e(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })) +
              '</span>' +
              '<strong>' + e(greet) + '</strong>' +
            '</div>' +
            (canCreate
              ? '<button type="button" class="tk3-new" id="tk3NewTask"><i data-lucide="plus"></i> New Task</button>'
              : '') +
          '</div>' +
        '</div>' +
        '<div class="tk3-kpis">' +
          (typeof window.kpiAnalyticsCard === 'function'
            ? [
                window.kpiAnalyticsCard({ className: 'tk3-kpi', icon: 'list', lab: 'All Tasks', val: counts.all, pill: 'Across all projects', color: 'blue', on: kpiOn('all'), dataAttrs: 'data-tk3-kpi="all"', index: 0 }),
                window.kpiAnalyticsCard({ className: 'tk3-kpi', icon: 'square-check-big', lab: 'Completed', val: counts.completed, pill: 'Tasks finished', color: 'green', on: kpiOn('completed'), dataAttrs: 'data-tk3-kpi="completed"', index: 1 }),
                window.kpiAnalyticsCard({ className: 'tk3-kpi', icon: 'loader-circle', lab: 'In Progress', val: counts.progress, pill: 'Currently active', color: 'navy', on: kpiOn('progress'), dataAttrs: 'data-tk3-kpi="progress"', index: 2 }),
                window.kpiAnalyticsCard({ className: 'tk3-kpi', icon: 'clock-3', lab: 'Due Soon', val: counts.soon, pill: 'Next 7 days', color: 'orange', on: kpiOn('soon'), dataAttrs: 'data-tk3-kpi="soon"', index: 3 }),
                window.kpiAnalyticsCard({ className: 'tk3-kpi', icon: 'triangle-alert', lab: 'Overdue', val: counts.overdue, pill: 'Past due date', color: 'red', on: kpiOn('overdue'), dataAttrs: 'data-tk3-kpi="overdue"', index: 4 })
              ].join('')
            : '') +
        '</div>' +
        '<section class="tk3-card">' +
          '<div class="tk3-card-head">' +
            '<div class="tk3-tabs">' +
              '<button type="button" class="tk3-tab' + (activeTab === 'all' ? ' on' : '') + '" data-tk3-tab="all" aria-pressed="' + (activeTab === 'all' ? 'true' : 'false') + '">All Tasks <span class="tk3-n">' + counts.all + '</span></button>' +
              '<button type="button" class="tk3-tab' + (activeTab === 'mine' ? ' on' : '') + '" data-tk3-tab="mine" aria-pressed="' + (activeTab === 'mine' ? 'true' : 'false') + '">My Tasks <span class="tk3-n">' + counts.mine + '</span></button>' +
              '<button type="button" class="tk3-tab' + (activeTab === 'overdue' ? ' on' : '') + '" data-tk3-tab="overdue" aria-pressed="' + (activeTab === 'overdue' ? 'true' : 'false') + '">Overdue <span class="tk3-n">' + counts.overdue + '</span></button>' +
              '<button type="button" class="tk3-tab' + (activeTab === 'soon' ? ' on' : '') + '" data-tk3-tab="soon" aria-pressed="' + (activeTab === 'soon' ? 'true' : 'false') + '">Due Soon <span class="tk3-n">' + counts.soon + '</span></button>' +
              '<button type="button" class="tk3-tab' + (activeTab === 'completed' ? ' on' : '') + '" data-tk3-tab="completed" aria-pressed="' + (activeTab === 'completed' ? 'true' : 'false') + '">Completed <span class="tk3-n">' + counts.completed + '</span></button>' +
            '</div>' +
          '</div>' +
          '<div class="tk3-card-tools">' + filterOptionsHtml(all) + '</div>' +
          '<div style="overflow:auto">' +
            '<table class="tk3-table">' +
              '<thead><tr>' +
                '<th style="width:36px"></th>' +
                '<th>Task</th>' +
                '<th>Project</th>' +
                '<th>Assignee</th>' +
                '<th>Priority</th>' +
                '<th><button type="button" class="tk3-sort" id="tk3SortDue">Due Date <span class="tk3-sort-ico" aria-hidden="true"></span></button></th>' +
                '<th>Status</th>' +
                '<th><button type="button" class="tk3-sort" id="tk3SortUpdated">Updated <span class="tk3-sort-ico" aria-hidden="true"></span></button></th>' +
                '<th style="width:40px"></th>' +
              '</tr></thead>' +
              '<tbody id="tk3Rows"></tbody>' +
            '</table>' +
            '<div class="tk3-empty" id="tk3Empty" style="display:none">No tasks match your filters.</div>' +
          '</div>' +
          '<div class="tk3-foot" id="tk3Foot"></div>' +
        '</section>';

      bindChrome();
      paintBody();
    } finally {
      painting = false;
    }
  }

  window.showTasksV3 = function () {
    if (typeof hideCalendarV3 === 'function') hideCalendarV3();
    if (typeof hideIssuesV3 === 'function') hideIssuesV3();
    if (typeof hideMilestonesV3 === 'function') hideMilestonesV3();
    if (typeof hideTimelineV3 === 'function') hideTimelineV3();
    tasksVisible = true;
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

  window.hideTasksV3 = function () {
    if (!tasksVisible) return;
    tasksVisible = false;
    syncBody(false);
    var host = document.getElementById('tasksView');
    if (host) {
      host.hidden = true;
      host.classList.add('hidden');
    }
    setShellHidden(false);
  };

  /** Exact title/id/project filter helper used by QA and deep-links. */
  window.applyTasksV3Filter = function (opts) {
    opts = opts || {};
    if (opts.query != null) localQuery = String(opts.query);
    if (opts.projectId != null) localProject = String(opts.projectId);
    if (opts.assignee != null) localAssignee = String(opts.assignee);
    if (opts.status != null) localStatus = String(opts.status);
    if (opts.tab) activeTab = String(opts.tab);
    page = 1;
    if (!tasksVisible && typeof showTasksV3 === 'function') showTasksV3();
    else paintAll();
    var q = String(localQuery || '').trim();
    if (q) {
      var row = document.querySelector('#tk3Rows tr[data-id="' + q.replace(/"/g, '') + '"]');
      if (!row) {
        var needle = q.toLowerCase();
        document.querySelectorAll('#tk3Rows tr[data-id]').forEach(function (tr) {
          if (row) return;
          var title = (tr.querySelector('strong') || {}).textContent || '';
          if (String(title).toLowerCase() === needle) row = tr;
        });
      }
      return row ? row.getAttribute('data-id') : null;
    }
    return null;
  };

  document.addEventListener('click', function () {
    document.querySelectorAll('.tk3-menu.on').forEach(function (m) { m.classList.remove('on'); });
  });

  try {
    var oldSetView = window.setView;
    if (typeof oldSetView === 'function') {
      window.setView = function (v) {
        if (typeof hideTasksV3 === 'function') hideTasksV3();
        return oldSetView.apply(this, arguments);
      };
    }
  } catch (_) {}

  try {
    var oldRender = render;
    render = function () {
      var out = oldRender.apply(this, arguments);
      if (tasksVisible) setTimeout(paintAll, 0);
      return out;
    };
  } catch (_) {}

  window.addEventListener('load', function () {
    setTimeout(function () {
      ensureView();
      if (tasksVisible) paintAll();
    }, 100);
  });
})();
