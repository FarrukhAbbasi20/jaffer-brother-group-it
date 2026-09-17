(function () {
  'use strict';

  var pageSize = 10;
  var page = 1;
  var tableQuery = '';
  var ensured = false;
  var painting = false;

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
      if (raw.length >= 10 && raw[4] === '-') {
        return new Date(raw.slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, {
          day: '2-digit', month: 'short', year: 'numeric'
        });
      }
      var dt = new Date(raw);
      if (!Number.isNaN(dt.getTime())) {
        return dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
      }
    } catch (_) {}
    return String(d);
  }

  function statusClass(s) {
    s = String(s || '').toLowerCase();
    if (s.includes('complete') || s.includes('done')) return 'done';
    if (s === 'on track') return 'good';
    if (s.includes('risk') || s.includes('hold')) return 'warn';
    if (s.includes('delay') || s.includes('block') || s.includes('overdue')) return 'bad';
    if (s.includes('not started') || s.includes('progress')) return 'info';
    return 'neutral';
  }

  function priorityClass(p) {
    p = String(p || '').toLowerCase();
    if (p === 'high' || p === 'critical') return 'high';
    if (p === 'low') return 'low';
    return 'medium';
  }

  function catIcon(cat) {
    var c = String(cat || '').toLowerCase();
    if (c.includes('infra') || c.includes('server') || c.includes('cloud')) return 'server';
    if (c.includes('network')) return 'network';
    if (c.includes('web') || c.includes('site')) return 'globe';
    if (c.includes('soft') || c.includes('develop') || c.includes('automat') || c.includes('digit')) return 'code-2';
    if (c.includes('secur') || c.includes('licen')) return 'shield';
    if (c.includes('doc')) return 'file-text';
    return 'folder';
  }

  function projects() {
    try { return Array.isArray(data) ? data : []; } catch (_) { return []; }
  }

  function currentFiltered() {
    try { return typeof filtered === 'function' ? filtered() : projects(); } catch (_) { return projects(); }
  }

  /* KPI strip: respect category/owner/search/priority, ignore status so all 5 tiles stay meaningful. */
  function kpiBaseList() {
    var q = '';
    var fo = '';
    var fl = '';
    var fc = '';
    var fp = '';
    try {
      var qEl = document.getElementById('q');
      var foEl = document.getElementById('fOwner');
      var flEl = document.getElementById('fLead');
      var fcEl = document.getElementById('fCat');
      var fpEl = document.getElementById('fPrio');
      if (qEl) q = (qEl.value || '').trim().toLowerCase();
      if (foEl) fo = foEl.value || '';
      if (flEl) fl = flEl.value || '';
      if (fcEl) fc = fcEl.value || '';
      if (fpEl) fp = fpEl.value || '';
    } catch (_) {}
    return projects().filter(function (p) {
      if (fo && p.owner !== fo) return false;
      if (fl && p.lead !== fl) return false;
      if (fc && p.category !== fc) return false;
      if (fp && p.priority !== fp) return false;
      if (q) {
        var hay = (
          p.name + ' ' + (p.owner || '') + ' ' + (p.lead || '') + ' ' + (p.category || '') + ' ' + (p.notes || '') + ' ' +
          (p.milestones || []).map(function (m) { return m.title + ' ' + (m.notes || '') + ' ' + (m.owner || ''); }).join(' ')
        ).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function isProjects() {
    var d = document.getElementById('projectsView');
    return !!(d && !d.classList.contains('hidden'));
  }

  function syncBody() {
    var on = isProjects();
    document.body.classList.toggle('view-projects', on);
    if (on) {
      document.body.classList.remove('view-dashboard');
      var legacy = document.getElementById('filterBar');
      if (legacy) legacy.style.setProperty('display', 'none', 'important');
      var actions = document.getElementById('pageActions');
      if (actions) actions.classList.remove('visible');
    }
  }

  function ensureHosts() {
    var content = document.getElementById('appContent');
    if (!content) return;
    var head = document.getElementById('pjPageHead');
    if (!head) {
      head = document.createElement('div');
      head.id = 'pjPageHead';
      head.className = 'pj3-page-head hidden';
      head.hidden = true;
      content.insertBefore(head, content.firstChild);
    }
    var toolbar = document.getElementById('pjToolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'pjToolbar';
      toolbar.className = 'pj3-toolbar hidden';
      toolbar.hidden = true;
      head.insertAdjacentElement('afterend', toolbar);
    }
  }

  function ensureTableChrome() {
    var host = document.getElementById('projectsView');
    if (!host) return;
    var boards = host.querySelectorAll('.projects-board');
    var board = boards[0];
    if (!board) return;
    board.classList.add('pj3-card');

    var head = board.querySelector('.panel-h, .pj3-card-head');
    if (!head || !head.classList.contains('pj3-card-head')) {
      var wrap = document.createElement('div');
      wrap.className = 'pj3-card-head';
      wrap.innerHTML =
        '<h2><i data-lucide="layout-grid"></i> All Projects <span class="pj3-count" id="projCount">0</span></h2>' +
        '<div class="pj3-card-tools">' +
          '<input type="search" id="pj3Search" class="pj3-search" placeholder="Search projects..." aria-label="Search projects">' +
          '<button type="button" class="pj3-tool-btn" id="pj3FiltersBtn" aria-label="Show filters"><i data-lucide="sliders-horizontal"></i> Filters</button>' +
          '<div style="position:relative">' +
            '<button type="button" class="pj3-icon-btn" id="pj3OverflowBtn" aria-label="More actions"><i data-lucide="ellipsis"></i></button>' +
            '<div class="pj3-menu" id="pj3OverflowMenu">' +
              '<button type="button" id="pj3Export">Export Excel</button>' +
              '<button type="button" id="pj3NewFromMenu">New Project</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      if (head) head.replaceWith(wrap);
      else board.insertBefore(wrap, board.firstChild);
      head = wrap;
    }

    var table = board.querySelector('table.projects-table');
    if (table) {
      var thead = table.querySelector('thead');
      if (thead) {
        thead.innerHTML =
          '<tr>' +
            '<th style="width:36px"></th>' +
            '<th style="width:22%">Project Name</th>' +
            '<th style="width:12%">Department</th>' +
            '<th style="width:12%">Lead</th>' +
            '<th style="width:9%">Status</th>' +
            '<th style="width:12%">Progress</th>' +
            '<th style="width:8%">Priority</th>' +
            '<th style="width:9%">Target Date</th>' +
            '<th style="width:9%">Updated</th>' +
            '<th style="width:40px"></th>' +
          '</tr>';
      }
    }

    var foot = document.getElementById('pj3Foot');
    if (!foot) {
      foot = document.createElement('div');
      foot.id = 'pj3Foot';
      foot.className = 'pj3-foot';
      board.appendChild(foot);
    }

    if (!ensured) {
      ensured = true;
      var search = document.getElementById('pj3Search');
      if (search) {
        search.addEventListener('input', function () {
          tableQuery = search.value || '';
          page = 1;
          var q = document.getElementById('q');
          if (q) q.value = tableQuery;
          try { render(); } catch (_) { paintTable(); }
        });
      }
      var filtBtn = document.getElementById('pj3FiltersBtn');
      if (filtBtn) {
        filtBtn.addEventListener('click', function () {
          var bar = document.getElementById('pjToolbar');
          if (bar) bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
      var overBtn = document.getElementById('pj3OverflowBtn');
      var overMenu = document.getElementById('pj3OverflowMenu');
      if (overBtn && overMenu) {
        overBtn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          overMenu.classList.toggle('on');
        });
      }
      var exp = document.getElementById('pj3Export');
      if (exp) exp.addEventListener('click', function () {
        if (typeof exportExcel === 'function') exportExcel();
      });
      var nw = document.getElementById('pj3NewFromMenu');
      if (nw) nw.addEventListener('click', function () {
        if (typeof openProject === 'function') openProject();
      });
      document.addEventListener('click', function () {
        document.querySelectorAll('.pj3-menu.on').forEach(function (m) { m.classList.remove('on'); });
      });
    }
  }

  function setHostsVisible(show) {
    ['pjPageHead', 'pjToolbar'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.hidden = !show;
      el.classList.toggle('hidden', !show);
    });
  }

  function renderHeader() {
    var head = document.getElementById('pjPageHead');
    if (!head) return;
    var now = new Date();
    var name = '';
    try { name = currentUser && currentUser.name ? currentUser.name.split(/\s+/)[0] : ''; } catch (_) {}
    var hour = now.getHours();
    var greet = (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening') + (name ? ', ' + name + '!' : '!');
    head.innerHTML =
      '<div class="pj3-titleblock">' +
        '<div class="pj3-eyebrow">Jaffer Brothers Group IT</div>' +
        '<h1>Projects</h1>' +
        '<p>Plan. Deliver. Create a smarter, more connected Jaffer Brothers.</p>' +
      '</div>' +
      '<div class="pj3-greeting">' +
        '<span class="pj3-greeting-date"><i data-lucide="calendar-days"></i>' +
          e(now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })) +
        '</span>' +
        '<strong>' + e(greet) + '</strong>' +
      '</div>';
  }

  function onFilterChange() {
    var cat = document.getElementById('pj3Cat');
    var owner = document.getElementById('pj3Owner');
    var status = document.getElementById('pj3Status');
    var fCat = document.getElementById('fCat');
    var fOwner = document.getElementById('fOwner');
    var fStatus = document.getElementById('fStatus');
    if (cat && fCat) fCat.value = cat.value;
    if (owner && fOwner) fOwner.value = owner.value;
    if (status && fStatus) fStatus.value = status.value;
    page = 1;
    try {
      if (typeof kpiFilter !== 'undefined') {
        if (status && (kpiFilter === 'On Track' || kpiFilter === 'Delayed' || kpiFilter === 'At Risk' || kpiFilter === 'Completed')) {
          if (status.value !== kpiFilter) kpiFilter = null;
        }
      }
    } catch (_) {}
    try { render(); } catch (_) { paintAll(); }
  }

  function renderFilters() {
    var host = document.getElementById('pjToolbar');
    if (!host) return;

    var cats = [];
    var owners = [];
    projects().forEach(function (p) {
      if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category);
      if (p.owner && owners.indexOf(p.owner) < 0) owners.push(p.owner);
    });
    cats.sort();
    owners.sort();

    var curCat = '';
    var curOwner = '';
    var curStatus = '';
    try {
      var fCat = document.getElementById('fCat');
      var fOwner = document.getElementById('fOwner');
      var fStatus = document.getElementById('fStatus');
      if (fCat) curCat = fCat.value || '';
      if (fOwner) curOwner = fOwner.value || '';
      if (fStatus) curStatus = fStatus.value || '';
    } catch (_) {}

    var statuses = ['Not Started', 'On Track', 'At Risk', 'Delayed', 'On Hold', 'Completed'];
    var canCreate = true;
    try { if (typeof uiCan === 'function') canCreate = !!uiCan('create_project'); } catch (_) {}

    host.innerHTML =
      '<div class="pj3-filters">' +
        '<select id="pj3Cat" aria-label="All Departments">' +
          '<option value="">All Departments</option>' +
          cats.map(function (c) {
            return '<option value="' + e(c) + '"' + (c === curCat ? ' selected' : '') + '>' + e(c) + '</option>';
          }).join('') +
        '</select>' +
        '<select id="pj3Owner" aria-label="All Custodians">' +
          '<option value="">All Custodians</option>' +
          owners.map(function (o) {
            return '<option value="' + e(o) + '"' + (o === curOwner ? ' selected' : '') + '>' + e(o) + '</option>';
          }).join('') +
        '</select>' +
        '<select id="pj3Status" aria-label="All Statuses">' +
          '<option value="">All Statuses</option>' +
          statuses.map(function (s) {
            return '<option value="' + e(s) + '"' + (s === curStatus ? ' selected' : '') + '>' + e(s) + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div class="pj3-actions">' +
        '<div class="pj3-toggle" role="group" aria-label="View mode">' +
          '<button type="button" class="on" id="pj3ViewTable"><i data-lucide="table-2"></i> Table</button>' +
          '<button type="button" id="pj3ViewBoard"><i data-lucide="columns-3"></i> Board</button>' +
        '</div>' +
        (canCreate
          ? '<button type="button" class="pj3-new" id="pj3NewProject"><i data-lucide="plus"></i> New Project</button>'
          : '') +
      '</div>';

    ['pj3Cat', 'pj3Owner', 'pj3Status'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.onchange = onFilterChange;
    });
    var boardBtn = document.getElementById('pj3ViewBoard');
    if (boardBtn) {
      boardBtn.onclick = function () {
        if (typeof setView === 'function') setView('kanban');
      };
    }
    var newBtn = document.getElementById('pj3NewProject');
    if (newBtn) {
      newBtn.onclick = function () {
        if (typeof openProject === 'function') openProject();
      };
    }
  }

  function pctOf(n, total) {
    if (!total) return '0% of total projects';
    return Math.round((n / total) * 100) + '% of total projects';
  }

  function applyStatusFilter(status) {
    try {
      if (status === 'total') {
        if (typeof clearKpiFilter === 'function') clearKpiFilter(false);
        var fs = document.getElementById('fStatus');
        if (fs) fs.value = '';
        kpiFilter = null;
      } else {
        kpiFilter = status;
        var fStatus = document.getElementById('fStatus');
        if (fStatus) fStatus.value = status;
      }
    } catch (_) {}
    page = 1;
    try { render(); } catch (_) { paintAll(); }
  }

  function renderKpis() {
    var list = kpiBaseList();
    var total = list.length;
    var planning = list.filter(function (p) {
      return p.status === 'Not Started' || p.status === 'On Hold';
    }).length;
    var execution = list.filter(function (p) {
      return p.status === 'On Track' || p.status === 'At Risk' || p.status === 'Delayed';
    }).length;
    var onTrack = list.filter(function (p) { return p.status === 'On Track'; }).length;
    var atRisk = list.filter(function (p) { return p.status === 'At Risk'; }).length;
    var delayed = list.filter(function (p) { return p.status === 'Delayed'; }).length;
    var completed = list.filter(function (p) { return p.status === 'Completed'; }).length;

    var host = document.getElementById('kpis');
    if (!host) return;
    host.className = 'kpis ov3-kpis pj3-kpis';
    host.style.display = 'grid';

    var activeKey = '';
    try { activeKey = kpiFilter || ''; } catch (_) {}

    var tiles = [
      {
        key: 'total', icon: 'layers-3', lab: 'Total Projects', val: total,
        sub: planning + ' in planning · ' + execution + ' in execution', color: 'red',
        click: "window.__pj3ApplyFilter('total')"
      },
      {
        key: 'On Track', icon: 'shield-check', lab: 'On Track', val: onTrack,
        sub: pctOf(onTrack, total), color: 'green',
        click: "window.__pj3ApplyFilter('On Track')"
      },
      {
        key: 'At Risk', icon: 'triangle-alert', lab: 'At Risk', val: atRisk,
        sub: pctOf(atRisk, total), color: 'orange',
        click: "window.__pj3ApplyFilter('At Risk')"
      },
      {
        key: 'Delayed', icon: 'clock', lab: 'Delayed', val: delayed,
        sub: pctOf(delayed, total), color: 'purple',
        click: "window.__pj3ApplyFilter('Delayed')"
      },
      {
        key: 'Completed', icon: 'flag', lab: 'Completed', val: completed,
        sub: pctOf(completed, total), color: 'blue',
        click: "window.__pj3ApplyFilter('Completed')"
      }
    ];

    host.innerHTML = tiles.map(function (k) {
      var cls = (activeKey && kpiFilter === k.key) ? ' on' : '';
      return '<article class="ov3-kpi' + cls + '" role="button" tabindex="0" onclick="' + k.click + '" onkeydown="if(event.key===\'Enter\'){' + k.click + '}">' +
        '<span class="ov3-kpi-icon ' + k.color + '"><i data-lucide="' + k.icon + '"></i></span>' +
        '<div class="ov3-kpi-copy">' +
          '<div class="ov3-kpi-label">' + e(k.lab) + '</div>' +
          '<div class="ov3-kpi-value">' + e(String(k.val)) + '</div>' +
          '<div class="ov3-kpi-sub">' + e(k.sub) + '</div>' +
        '</div></article>';
    }).join('');
  }

  window.__pj3ApplyFilter = applyStatusFilter;

  function updatedOf(p) {
    return p.updated || p.updatedAt || p.end || p.start || '';
  }

  function subtitleOf(p) {
    if (p.notes) {
      var n = String(p.notes).replace(/\s+/g, ' ').trim();
      if (n.length > 72) n = n.slice(0, 69) + '…';
      return n;
    }
    if (p.projectKey) return String(p.projectKey);
    if (p.owner) return 'Custodian · ' + p.owner;
    return 'Project';
  }

  function paintTable() {
    ensureTableChrome();
    var list = currentFiltered();
    var tb = document.getElementById('rows');
    var empty = document.getElementById('emptyState');
    var countEl = document.getElementById('projCount');
    if (!tb) return;

    if (countEl) countEl.textContent = String(list.length);

    var totalPages = Math.max(1, Math.ceil(list.length / pageSize) || 1);
    if (page > totalPages) page = totalPages;
    var start = (page - 1) * pageSize;
    var slice = list.slice(start, start + pageSize);

    if (empty) empty.classList.toggle('hidden', list.length > 0);
    tb.innerHTML = '';

    slice.forEach(function (p) {
      var isOpen = false;
      try { isOpen = !!(openRows && openRows[p.id]); } catch (_) {}
      var progress = Math.max(0, Math.min(100, Number(p.progress) || 0));
      var canEdit = true;
      var canComment = true;
      try {
        if (typeof uiCan === 'function') {
          canEdit = !!uiCan('edit_project', p);
          canComment = !!uiCan('comment', p);
        }
      } catch (_) {}

      var lead = (p.lead || '').trim();
      var actions = [];
      if (canEdit) actions.push('<button type="button" data-act="edit">Edit</button>');
      if (canComment) actions.push('<button type="button" data-act="comment">Add Comment</button>');
      actions.push('<button type="button" data-act="toggle">' + (isOpen ? 'Hide tasks' : 'Show tasks') + '</button>');

      var tr = document.createElement('tr');
      tr.className = 'proj' + (isOpen ? ' open' : '');
      tr.dataset.id = p.id;
      tr.innerHTML =
        '<td><input type="checkbox" class="pj3-check" onclick="event.stopPropagation()" aria-label="Select project"></td>' +
        '<td>' +
          '<div class="pj3-name">' +
            '<strong>' + e(p.name) + '</strong>' +
            '<span>' + e(subtitleOf(p)) + '</span>' +
          '</div>' +
        '</td>' +
        '<td>' +
          '<span class="pj3-dept">' +
            '<span class="pj3-dept-ico"><i data-lucide="' + catIcon(p.category) + '"></i></span>' +
            e(p.category || '—') +
          '</span>' +
        '</td>' +
        '<td>' +
          '<span class="pj3-lead">' +
            '<span class="pj3-ava' + (lead ? '' : ' empty') + '">' + e(lead ? initials(lead) : '—') + '</span>' +
            e(lead || 'Unassigned') +
          '</span>' +
        '</td>' +
        '<td><span class="ov3-status ' + statusClass(p.status) + '">' + e(p.status || '—') + '</span></td>' +
        '<td>' +
          '<div class="pj3-prog">' +
            '<div class="ov3-progress"><i style="width:' + progress + '%"></i></div>' +
            '<span class="ov3-pct">' + progress + '%</span>' +
          '</div>' +
        '</td>' +
        '<td><span class="ov3-priority ' + priorityClass(p.priority) + '">' + e(p.priority || 'Medium') + '</span></td>' +
        '<td><span class="pj3-date">' + e(fmt(p.end)) + '</span></td>' +
        '<td><span class="pj3-date">' + e(fmt(updatedOf(p))) + '</span></td>' +
        '<td>' +
          '<div class="pj3-row-menu">' +
            '<button type="button" class="pj3-row-btn" aria-label="Actions"><i data-lucide="ellipsis"></i></button>' +
            '<div class="pj3-menu">' + actions.join('') + '</div>' +
          '</div>' +
        '</td>';

      tr.addEventListener('click', function (ev) {
        if (ev.target.closest('.pj3-row-menu') || ev.target.closest('input') || ev.target.closest('button')) return;
        if (typeof openProject === 'function') openProject(p.id);
      });

      var menuBtn = tr.querySelector('.pj3-row-btn');
      var menu = tr.querySelector('.pj3-menu');
      if (menuBtn && menu) {
        menuBtn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          document.querySelectorAll('.pj3-menu.on').forEach(function (m) {
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
          if (act === 'edit' && typeof openProject === 'function') openProject(p.id);
          else if (act === 'comment' && typeof openProjectComments === 'function') openProjectComments(p.id);
          else if (act === 'toggle' && typeof toggleRow === 'function') toggleRow(p.id);
        });
      }

      tb.appendChild(tr);

      if (isOpen) {
        var mtr = document.createElement('tr');
        mtr.className = 'msrow';
        var rows = (p.milestones || []).slice().sort(function (a, b) {
          return String(a.due || '').localeCompare(String(b.due || ''));
        }).map(function (m) {
          var itemActions = [];
          try {
            if (typeof uiCan === 'function' && uiCan('edit_task', m)) {
              itemActions.push('<button class="btn tiny ghost" onclick="openMs(\'' + p.id + '\',\'' + m.id + '\')">Edit</button>');
            }
            if (typeof uiCan === 'function' && uiCan('comment', m)) {
              itemActions.push('<button class="btn tiny" onclick="openComments(\'' + p.id + '\',\'' + m.id + '\')">Add Comment</button>');
            }
          } catch (_) {}
          return '<tr>' +
            '<td style="width:28%"><span class="ms-title">' + e(m.title) + '</span></td>' +
            '<td style="width:12%"><span class="ov3-status ' + statusClass(m.status) + '">' + e(m.status) + '</span></td>' +
            '<td style="width:14%" class="num small">' + e(fmt(m.due)) + '</td>' +
            '<td style="width:12%" class="small muted">' + e(m.owner || '—') + '</td>' +
            '<td style="width:18%" class="ms-note">' + (m.notes ? e(m.notes) : '<span class="muted">—</span>') + '</td>' +
            '<td style="width:16%" class="right"><div class="row-actions">' + itemActions.join('') + '</div></td>' +
          '</tr>';
        }).join('');
        var canAdd = false;
        try { canAdd = typeof uiCan === 'function' && uiCan('create_task', p); } catch (_) {}
        mtr.innerHTML =
          '<td colspan="10"><div class="ms-inner">' +
            '<table class="ms-tab">' +
              '<thead><tr><th>Task</th><th>Status</th><th>Due Date</th><th>Custodian</th><th>Remarks</th><th></th></tr></thead>' +
              '<tbody>' + (rows || '<tr><td colspan="6" class="muted small" style="padding:8px">No tasks yet.</td></tr>') + '</tbody>' +
            '</table>' +
            '<div class="ms-add">' +
              (canAdd ? '<button class="btn tiny" onclick="openTask(\'' + p.id + '\')">+ Add task</button>' : '') +
            '</div>' +
          '</div></td>';
        tb.appendChild(mtr);
      }
    });

    var foot = document.getElementById('pj3Foot');
    if (foot) {
      var from = list.length ? start + 1 : 0;
      var to = Math.min(start + pageSize, list.length);
      var pagesHtml = '';
      var maxButtons = Math.min(totalPages, 5);
      var startPage = Math.max(1, Math.min(page - 2, totalPages - maxButtons + 1));
      for (var i = 0; i < maxButtons; i++) {
        var n = startPage + i;
        if (n > totalPages) break;
        pagesHtml += '<button type="button" class="' + (n === page ? 'on' : '') + '" data-page="' + n + '">' + n + '</button>';
      }
      foot.innerHTML =
        '<span>Showing ' + from + '–' + to + ' of ' + list.length + ' projects</span>' +
        '<div class="pj3-pages">' +
          '<button type="button" data-page="prev"' + (page <= 1 ? ' disabled' : '') + '>Back</button>' +
          pagesHtml +
          '<button type="button" data-page="next"' + (page >= totalPages ? ' disabled' : '') + '>Next</button>' +
          '<select class="pj3-perpage" id="pj3PerPage" aria-label="Rows per page">' +
            '<option value="10"' + (pageSize === 10 ? ' selected' : '') + '>10 per page</option>' +
            '<option value="25"' + (pageSize === 25 ? ' selected' : '') + '>25 per page</option>' +
            '<option value="50"' + (pageSize === 50 ? ' selected' : '') + '>50 per page</option>' +
          '</select>' +
        '</div>';
      foot.querySelectorAll('button[data-page]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var v = btn.getAttribute('data-page');
          if (v === 'prev') page = Math.max(1, page - 1);
          else if (v === 'next') page = Math.min(totalPages, page + 1);
          else page = Number(v) || 1;
          paintTable();
          try { refreshLucideIcons(); } catch (_) { if (window.lucide) window.lucide.createIcons(); }
        });
      });
      var per = document.getElementById('pj3PerPage');
      if (per) {
        per.onchange = function () {
          pageSize = Number(per.value) || 10;
          page = 1;
          paintTable();
        };
      }
    }

    try {
      if (typeof renderStandaloneTables === 'function') renderStandaloneTables();
    } catch (_) {}
  }

  function syncSecondaryBoards() {
    var host = document.getElementById('projectsView');
    if (!host) return;
    var active = document.querySelector('#sidebarNav .nav-item.on');
    var mode = active ? active.getAttribute('data-real-view') : 'projects';
    var boards = host.querySelectorAll('.projects-board');
    boards.forEach(function (b, i) {
      if (mode === 'milestones') b.style.display = i === 2 ? '' : 'none';
      else if (i === 0) b.style.display = '';
      else b.style.display = 'none';
    });
  }

  function paintAll() {
    if (!isProjects() || painting) return;
    painting = true;
    try {
      ensureHosts();
      syncBody();
      setHostsVisible(true);
      ensureTableChrome();
      syncSecondaryBoards();
      renderHeader();
      renderFilters();
      renderKpis();
      paintTable();
      try { refreshLucideIcons(); } catch (_) {
        if (window.lucide) window.lucide.createIcons();
      }
    } finally {
      painting = false;
    }
  }

  function teardown() {
    setHostsVisible(false);
    document.body.classList.remove('view-projects');
  }

  try {
    var oldProjects = renderProjects;
    renderProjects = function () {
      if (isProjects()) {
        paintAll();
        return;
      }
      return oldProjects.apply(this, arguments);
    };

    var oldKpis = renderKPIs;
    renderKPIs = function () {
      if (isProjects()) return renderKpis();
      if (typeof oldKpis === 'function') return oldKpis.apply(this, arguments);
    };

    var oldSetView = window.setView;
    if (typeof oldSetView === 'function') {
      window.setView = function (v) {
        var out = oldSetView.apply(this, arguments);
        if (v === 'projects') {
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
      if (isProjects()) paintAll();
    }, 80);
    setTimeout(function () {
      if (isProjects()) paintAll();
    }, 700);
  });
})();
