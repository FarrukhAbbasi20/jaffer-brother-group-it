(function () {
  'use strict';

  var painting = false;
  var ensured = false;
  var localProject = '';
  var localAssignee = '';
  var localDue = '';

  /* Visual columns ↔ real project.status values (API-safe). */
  var COLS = [
    {
      key: 'backlog',
      title: 'Backlog',
      sub: 'Ideas and future work',
      icon: 'circle-dashed',
      color: 'grey',
      statuses: ['Not Started', 'On Hold'],
      dropStatus: 'Not Started'
    },
    {
      key: 'progress',
      title: 'In Progress',
      sub: 'Actively being worked on',
      icon: 'refresh-cw',
      color: 'blue',
      statuses: ['On Track'],
      dropStatus: 'On Track'
    },
    {
      key: 'review',
      title: 'Review',
      sub: 'In review or awaiting approval',
      icon: 'clock',
      color: 'orange',
      statuses: ['At Risk'],
      dropStatus: 'At Risk'
    },
    {
      key: 'blocked',
      title: 'Blocked',
      sub: 'Waiting on dependencies',
      icon: 'ban',
      color: 'red',
      statuses: ['Delayed'],
      dropStatus: 'Delayed'
    },
    {
      key: 'done',
      title: 'Done',
      sub: 'Completed and delivered',
      icon: 'circle-check',
      color: 'green',
      statuses: ['Completed'],
      dropStatus: 'Completed'
    }
  ];

  var STATUS_TO_COL = {};
  COLS.forEach(function (c) {
    c.statuses.forEach(function (s) { STATUS_TO_COL[s] = c.key; });
  });

  function e(v) {
    return (v == null ? '' : String(v)).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
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

  function isOverdue(p) {
    if (!p || String(p.status || '') === 'Completed') return false;
    var due = parseDate(p.end);
    if (!due) return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
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

  function priorityClass(p) {
    p = String(p || '').toLowerCase();
    if (p === 'high' || p === 'critical') return 'prio-high';
    if (p === 'low') return 'prio-low';
    return 'prio-medium';
  }

  function catClass(cat) {
    var c = String(cat || '').toLowerCase();
    if (c.includes('infra') || c.includes('network') || c.includes('procure') || c.includes('financ')) return 'cat-blue';
    if (c.includes('service') || c.includes('compliance') || c.includes('erp') || c.includes('soft')) return 'cat-purple';
    if (c.includes('secur') || c.includes('monitor') || c.includes('cloud')) return 'cat-green';
    if (c.includes('process') || c.includes('ops') || c.includes('hr')) return 'cat-amber';
    if (c.includes('risk') || c.includes('critical')) return 'cat-red';
    var palette = ['cat-blue', 'cat-purple', 'cat-green', 'cat-amber', 'cat-red', 'cat-slate'];
    var h = 0;
    for (var i = 0; i < c.length; i++) h = (h + c.charCodeAt(i) * (i + 1)) % palette.length;
    return palette[h] || 'cat-slate';
  }

  function projects() {
    try { return Array.isArray(data) ? data : []; } catch (_) { return []; }
  }

  function isKanban() {
    var d = document.getElementById('kanbanView');
    return !!(d && !d.classList.contains('hidden'));
  }

  function syncSidebar() {
    document.querySelectorAll('#sidebarNav .nav-item').forEach(function (n) {
      n.classList.toggle('on', n.getAttribute('data-real-view') === 'kanban');
    });
  }

  function syncBody() {
    var on = isKanban();
    document.body.classList.toggle('view-kanban', on);
    if (on) {
      document.body.classList.remove('view-dashboard');
      document.body.classList.remove('view-projects');
      syncSidebar();
      ['filterBar', 'pageActions', 'kpis', 'ovPageHead', 'ovFilters', 'pjPageHead', 'pjToolbar'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.setProperty('display', 'none', 'important');
      });
      var actions = document.getElementById('pageActions');
      if (actions) actions.classList.remove('visible');
    }
  }

  function ensureHosts() {
    var content = document.getElementById('appContent');
    if (!content) return;
    var head = document.getElementById('kbPageHead');
    if (!head) {
      head = document.createElement('div');
      head.id = 'kbPageHead';
      head.className = 'kb3-page-head hidden';
      head.hidden = true;
      content.insertBefore(head, content.firstChild);
    }
    var toolbar = document.getElementById('kbToolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'kbToolbar';
      toolbar.className = 'kb3-toolbar hidden';
      toolbar.hidden = true;
      head.insertAdjacentElement('afterend', toolbar);
    }
  }

  function setHostsVisible(show) {
    var head = document.getElementById('kbPageHead');
    if (head) {
      head.hidden = !show;
      head.classList.toggle('hidden', !show);
    }
    var toolbar = document.getElementById('kbToolbar');
    if (toolbar) {
      toolbar.hidden = !show;
      toolbar.classList.toggle('hidden', !show);
    }
  }

  function peopleOf(p) {
    var names = [];
    var seen = {};
    function add(n) {
      n = String(n || '').trim();
      if (!n || seen[n]) return;
      seen[n] = true;
      names.push(n);
    }
    add(p.lead);
    add(p.owner);
    (p.milestones || []).forEach(function (m) { add(m.owner); });
    return names;
  }

  function descOf(p) {
    var n = String(p.notes || '').replace(/\s+/g, ' ').trim();
    if (n) return n;
    if (p.projectKey) return String(p.projectKey);
    if (p.category) return String(p.category) + ' project';
    return 'No description';
  }

  function boardList() {
    var list = projects().slice();
    try {
      if (typeof filtered === 'function') list = filtered();
    } catch (_) {}

    return list.filter(function (p) {
      if (localProject && p.id !== localProject) return false;
      if (localAssignee) {
        var people = peopleOf(p);
        if (people.indexOf(localAssignee) < 0) return false;
      }
      if (localDue) {
        var due = parseDate(p.end);
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        if (localDue === 'none') {
          if (due) return false;
        } else if (localDue === 'overdue') {
          if (!due || due >= today) return false;
        } else if (localDue === '7') {
          if (!due) return false;
          var lim7 = new Date(today); lim7.setDate(lim7.getDate() + 7);
          if (due < today || due > lim7) return false;
        } else if (localDue === '30') {
          if (!due) return false;
          var lim30 = new Date(today); lim30.setDate(lim30.getDate() + 30);
          if (due < today || due > lim30) return false;
        }
      }
      return true;
    });
  }

  function filterSelectsHtml() {
    var all = projects();
    var assignees = [];
    var seenA = {};
    all.forEach(function (p) {
      peopleOf(p).forEach(function (n) {
        if (!seenA[n]) { seenA[n] = true; assignees.push(n); }
      });
    });
    assignees.sort();

    return '<div class="kb3-filters">' +
      '<select id="kb3Project" aria-label="All Projects">' +
        '<option value="">All Projects</option>' +
        all.slice().sort(function (a, b) {
          return String(a.name || '').localeCompare(String(b.name || ''));
        }).map(function (p) {
          return '<option value="' + e(p.id) + '"' + (p.id === localProject ? ' selected' : '') + '>' + e(p.name) + '</option>';
        }).join('') +
      '</select>' +
      '<select id="kb3Assignee" aria-label="All Assignees">' +
        '<option value="">All Assignees</option>' +
        assignees.map(function (n) {
          return '<option value="' + e(n) + '"' + (n === localAssignee ? ' selected' : '') + '>' + e(n) + '</option>';
        }).join('') +
      '</select>' +
      '<select id="kb3Due" aria-label="Due Date">' +
        '<option value=""' + (!localDue ? ' selected' : '') + '>Due Date: Any time</option>' +
        '<option value="overdue"' + (localDue === 'overdue' ? ' selected' : '') + '>Overdue</option>' +
        '<option value="7"' + (localDue === '7' ? ' selected' : '') + '>Next 7 days</option>' +
        '<option value="30"' + (localDue === '30' ? ' selected' : '') + '>Next 30 days</option>' +
        '<option value="none"' + (localDue === 'none' ? ' selected' : '') + '>No due date</option>' +
      '</select>' +
    '</div>';
  }

  function bindFilters() {
    var pEl = document.getElementById('kb3Project');
    var aEl = document.getElementById('kb3Assignee');
    var dEl = document.getElementById('kb3Due');
    if (pEl) pEl.onchange = function () { localProject = pEl.value || ''; paintBoard(); };
    if (aEl) aEl.onchange = function () { localAssignee = aEl.value || ''; paintBoard(); };
    if (dEl) dEl.onchange = function () { localDue = dEl.value || ''; paintBoard(); };
  }

  function renderHeader() {
    var head = document.getElementById('kbPageHead');
    if (!head) return;
    var now = new Date();
    var name = '';
    try { name = currentUser && currentUser.name ? currentUser.name.split(/\s+/)[0] : ''; } catch (_) {}
    var hour = now.getHours();
    var greet = (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening') + (name ? ', ' + name + '!' : '!');
    var canCreate = true;
    try { if (typeof uiCan === 'function') canCreate = !!uiCan('create_project'); } catch (_) {}

    head.innerHTML =
      '<div class="kb3-titleblock">' +
        '<div class="kb3-eyebrow">Jaffer Brothers Group IT</div>' +
        '<h1>Board</h1>' +
        '<p>Track, manage, and deliver projects across Jaffer Brothers.</p>' +
      '</div>' +
      '<div class="kb3-head-right">' +
        '<div class="kb3-greeting">' +
          '<span class="kb3-greeting-date"><i data-lucide="calendar-days"></i>' +
            e(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })) +
          '</span>' +
          '<strong>' + e(greet) + '</strong>' +
        '</div>' +
        (canCreate
          ? '<button type="button" class="kb3-new" id="kb3NewProject"><i data-lucide="plus"></i> New Project</button>'
          : '') +
      '</div>';

    var toolbar = document.getElementById('kbToolbar');
    if (toolbar) {
      toolbar.hidden = false;
      toolbar.classList.remove('hidden');
      toolbar.innerHTML = filterSelectsHtml();
    }

    bindFilters();
    var nw = document.getElementById('kb3NewProject');
    if (nw) {
      nw.onclick = function () {
        if (typeof openProject === 'function') openProject();
      };
    }
  }

  function avatarsHtml(names) {
    if (!names.length) {
      return '<div class="kb3-avas"><span class="kb3-ava more" title="Unassigned">?</span></div>';
    }
    var show = names.slice(0, 3);
    var extra = names.length - show.length;
    return '<div class="kb3-avas">' +
      show.map(function (n) {
        return '<span class="kb3-ava" title="' + e(n) + '">' + e(initials(n)) + '</span>';
      }).join('') +
      (extra > 0 ? '<span class="kb3-ava more" title="' + e(String(extra) + ' more') + '">+' + extra + '</span>' : '') +
      '</div>';
  }

  function cardHtml(p) {
    var canEdit = true;
    var canComment = true;
    try {
      if (typeof uiCan === 'function') {
        canEdit = !!uiCan('edit_project', p);
        canComment = !!uiCan('comment', p);
      }
    } catch (_) {}
    var actions = [];
    if (canEdit) actions.push('<button type="button" data-act="edit">Edit</button>');
    if (canComment) actions.push('<button type="button" data-act="comment">Add Comment</button>');
    actions.push('<button type="button" data-act="open">Open</button>');

    var cat = p.category || 'General';
    var prio = p.priority || 'Medium';
    var people = peopleOf(p);
    var dueAlert = isOverdue(p) ? ' is-alert' : '';

    return '<article class="kb3-card" draggable="true" data-id="' + e(p.id) + '">' +
      '<div class="kb3-card-top">' +
        '<h3 class="kb3-card-title">' + e(p.name) + '</h3>' +
        '<button type="button" class="kb3-card-more" aria-label="Actions"><i data-lucide="ellipsis-vertical"></i></button>' +
        '<div class="kb3-menu">' + actions.join('') + '</div>' +
      '</div>' +
      '<p class="kb3-card-desc">' + e(descOf(p)) + '</p>' +
      '<div class="kb3-pills">' +
        '<span class="kb3-pill ' + catClass(cat) + '">' + e(cat) + '</span>' +
        '<span class="kb3-pill ' + priorityClass(prio) + '">' + e(prio) + '</span>' +
      '</div>' +
      '<div class="kb3-card-foot">' +
        '<span class="kb3-due' + dueAlert + '"><i data-lucide="calendar"></i>' + e(fmt(p.end)) + '</span>' +
        avatarsHtml(people) +
      '</div>' +
    '</article>';
  }

  function bindCard(card) {
    var id = card.getAttribute('data-id');
    card.addEventListener('dragstart', function (ev) {
      try {
        if (typeof dragProjectId !== 'undefined') dragProjectId = id;
      } catch (_) {}
      ev.dataTransfer.setData('text/plain', id);
      ev.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
      ev.stopPropagation();
    });
    card.addEventListener('dragend', function () {
      card.classList.remove('dragging');
      document.querySelectorAll('.kb3-col.drag-over').forEach(function (c) { c.classList.remove('drag-over'); });
      try { if (typeof dragProjectId !== 'undefined') dragProjectId = null; } catch (_) {}
    });
    card.addEventListener('click', function (ev) {
      if (ev.target.closest('.kb3-card-more') || ev.target.closest('.kb3-menu')) return;
      if (typeof openProject === 'function') openProject(id);
    });
    var more = card.querySelector('.kb3-card-more');
    var menu = card.querySelector('.kb3-menu');
    if (more && menu) {
      more.addEventListener('click', function (ev) {
        ev.stopPropagation();
        document.querySelectorAll('.kb3-menu.on').forEach(function (m) {
          if (m !== menu) m.classList.remove('on');
        });
        menu.classList.toggle('on');
      });
      menu.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var btn = ev.target.closest('button[data-act]');
        if (!btn) return;
        menu.classList.remove('on');
        var act = btn.getAttribute('data-act');
        if (act === 'edit' || act === 'open') {
          if (typeof openProject === 'function') openProject(id);
        } else if (act === 'comment' && typeof openProjectComments === 'function') {
          openProjectComments(id);
        }
      });
    }
  }

  async function applyStatus(id, status) {
    var p = null;
    try { p = data.find(function (x) { return x.id === id; }); } catch (_) {}
    if (!p || p.status === status) return;
    var prev = p.status;
    p.status = status;
    paintBoard();
    try {
      if (typeof dbOnline !== 'undefined' && dbOnline && typeof api === 'function') {
        var out = await api('/projects/' + encodeURIComponent(id), {
          method: 'PUT',
          body: JSON.stringify(Object.assign({}, p, { status: status }))
        });
        if (typeof applyProjects === 'function') applyProjects(out);
        if (typeof render === 'function') render();
        else paintBoard();
      } else if (typeof render === 'function') {
        render();
      } else {
        paintBoard();
      }
    } catch (err) {
      p.status = prev;
      alert('Could not update status: ' + (err && err.message ? err.message : err));
      if (typeof render === 'function') render();
      else paintBoard();
    }
  }

  function bindColumn(colEl, col) {
    colEl.addEventListener('dragover', function (ev) {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      colEl.classList.add('drag-over');
    });
    colEl.addEventListener('dragleave', function (ev) {
      if (!colEl.contains(ev.relatedTarget)) colEl.classList.remove('drag-over');
    });
    colEl.addEventListener('drop', function (ev) {
      ev.preventDefault();
      colEl.classList.remove('drag-over');
      var id = ev.dataTransfer.getData('text/plain');
      try { if (!id && typeof dragProjectId !== 'undefined') id = dragProjectId; } catch (_) {}
      if (!id || !col.dropStatus) return;
      var cur = null;
      try { cur = data.find(function (x) { return x.id === id; }); } catch (_) {}
      if (cur && col.statuses.indexOf(cur.status) >= 0) return;
      applyStatus(id, col.dropStatus);
    });
  }

  function paintBoard() {
    var host = document.getElementById('kanbanView');
    if (!host || !isKanban()) return;
    var list = boardList();
    var byCol = {};
    COLS.forEach(function (c) { byCol[c.key] = []; });
    list.forEach(function (p) {
      var key = STATUS_TO_COL[p.status];
      if (!key) key = 'backlog';
      byCol[key].push(p);
    });

    host.innerHTML = '<div class="kb3-board">' + COLS.map(function (col) {
      var items = byCol[col.key] || [];
      return '<section class="kb3-col" data-col="' + col.key + '" data-drop-status="' + e(col.dropStatus) + '">' +
        '<header class="kb3-col-h">' +
          '<div class="kb3-col-h-main">' +
            '<span class="kb3-col-ico ' + col.color + '"><i data-lucide="' + col.icon + '"></i></span>' +
            '<div class="kb3-col-copy">' +
              '<h2 class="kb3-col-title">' + e(col.title) +
                '<span class="kb3-count">' + items.length + '</span>' +
              '</h2>' +
              '<p class="kb3-col-sub">' + e(col.sub) + '</p>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="kb3-col-menu" aria-label="Column menu"><i data-lucide="ellipsis"></i></button>' +
        '</header>' +
        '<div class="kb3-col-body">' +
          (items.length ? items.map(cardHtml).join('') : '<div class="kb3-empty">No projects</div>') +
        '</div>' +
      '</section>';
    }).join('') + '</div>';

    host.querySelectorAll('.kb3-col').forEach(function (el) {
      var key = el.getAttribute('data-col');
      var col = COLS.find(function (c) { return c.key === key; });
      if (col) bindColumn(el, col);
    });
    host.querySelectorAll('.kb3-card').forEach(bindCard);
  }

  function paintAll() {
    if (!isKanban() || painting) return;
    painting = true;
    try {
      ensureHosts();
      syncBody();
      setHostsVisible(true);
      renderHeader();
      paintBoard();
      try { refreshLucideIcons(); } catch (_) {
        if (window.lucide) window.lucide.createIcons();
      }
    } finally {
      painting = false;
    }
  }

  function teardown() {
    setHostsVisible(false);
    document.body.classList.remove('view-kanban');
  }

  if (!ensured) {
    ensured = true;
    document.addEventListener('click', function () {
      document.querySelectorAll('.kb3-menu.on').forEach(function (m) { m.classList.remove('on'); });
    });
  }

  try {
    var oldKanban = renderKanban;
    renderKanban = function () {
      if (isKanban()) {
        paintAll();
        return;
      }
      if (typeof oldKanban === 'function') return oldKanban.apply(this, arguments);
    };

    var oldSetView = window.setView;
    if (typeof oldSetView === 'function') {
      window.setView = function (v) {
        var out = oldSetView.apply(this, arguments);
        if (v === 'kanban') {
          setTimeout(paintAll, 0);
        } else {
          teardown();
        }
        return out;
      };
    }
  } catch (_) {}

  window.addEventListener('load', function () {
    setTimeout(function () {
      ensureHosts();
      if (isKanban()) paintAll();
    }, 90);
    setTimeout(function () {
      if (isKanban()) paintAll();
    }, 750);
  });
})();



