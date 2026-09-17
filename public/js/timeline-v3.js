(function () {
  'use strict';

  var timelineVisible = false;
  var painting = false;
  var localProject = '';
  var localDept = '';
  var localTimeframe = 'year';
  var viewMode = 'months';
  var anchorDate = null;

  var MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function e(v) {
    return (v == null ? '' : String(v)).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
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

  function safeData() {
    try { return Array.isArray(data) ? data : []; } catch (_) { return []; }
  }

  function getAnchor() {
    if (!anchorDate) anchorDate = today();
    return new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  }

  function setAnchor(d) {
    anchorDate = new Date(d.getFullYear(), d.getMonth(), 1);
  }

  /**
   * Live project status  ->  mockup pill + bar class.
   * Uses real status labels (no invented "In Progress").
   */
  function statusMeta(status) {
    var s = String(status || '').trim();
    if (s === 'Completed') return { label: 'Completed', cls: 'done', bar: 'done' };
    if (s === 'Delayed') return { label: 'Delayed', cls: 'delayed', bar: 'delayed' };
    if (s === 'At Risk') return { label: 'At Risk', cls: 'atrisk', bar: 'atrisk' };
    if (s === 'On Track') return { label: 'On Track', cls: 'ontrack', bar: 'ontrack' };
    if (s === 'On Hold') return { label: 'On Hold', cls: 'hold', bar: 'hold' };
    if (s === 'Not Started') return { label: 'Not Started', cls: 'planned', bar: 'planned' };
    if (!s) return { label: 'Not Started', cls: 'planned', bar: 'planned' };
    return { label: s, cls: 'info', bar: 'info' };
  }

  function progressOf(p) {
    var n = Number(p && p.progress);
    if (Number.isNaN(n)) n = 0;
    if (String(p && p.status) === 'Completed') return 100;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function projectSpan(p) {
    var s = parseDate(p.start) || parseDate(p.end);
    var en = parseDate(p.end);
    if (!en && s) {
      var t = today();
      var pct = progressOf(p);
      /* Open-ended: span to today when underway; otherwise a point bar at start. */
      if (String(p && p.status) !== 'Completed' && pct < 100 && t.getTime() > s.getTime()) en = t;
      else en = s;
    }
    if (!s && en) s = en;
    return { start: s, end: en };
  }

  function timeframeRange() {
    var a = getAnchor();
    var y = a.getFullYear();
    var m = a.getMonth();
    if (localTimeframe === 'quarter') {
      var q = Math.floor(m / 3) * 3;
      return {
        start: new Date(y, q, 1),
        end: new Date(y, q + 3, 0),
        label: 'Q' + (Math.floor(q / 3) + 1) + ' ' + y
      };
    }
    if (localTimeframe === 'all') {
      return { start: null, end: null, label: 'All Time' };
    }
    return {
      start: new Date(y, 0, 1),
      end: new Date(y, 11, 31),
      label: 'This Year (Jan - Dec ' + y + ')'
    };
  }

  function overlapsRange(p, range) {
    if (!range.start || !range.end) return true;
    var span = projectSpan(p);
    if (!span.start && !span.end) return true;
    var s = span.start || span.end;
    var en = span.end || span.start;
    if (!s || !en) return true;
    return s.getTime() <= range.end.getTime() && en.getTime() >= range.start.getTime();
  }

  function filteredProjects() {
    var range = timeframeRange();
    return safeData().filter(function (p) {
      if (localProject && String(p.id) !== String(localProject)) return false;
      if (localDept && String(p.category || '') !== localDept) return false;
      if (!overlapsRange(p, range)) return false;
      return true;
    }).slice().sort(function (a, b) {
      var as = parseDate(a.start) || parseDate(a.end) || new Date(8640000000000000);
      var bs = parseDate(b.start) || parseDate(b.end) || new Date(8640000000000000);
      if (as.getTime() !== bs.getTime()) return as - bs;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }

  function kpiCounts(list) {
    var total = list.length;
    var onTrack = 0;
    var atRisk = 0;
    var delayed = 0;
    var completed = 0;
    list.forEach(function (p) {
      var s = String(p.status || '');
      if (s === 'On Track') onTrack++;
      else if (s === 'At Risk') atRisk++;
      else if (s === 'Delayed') delayed++;
      else if (s === 'Completed') completed++;
    });
    function pct(n) { return total ? Math.round((n / total) * 100) : 0; }
    return {
      total: total,
      onTrack: onTrack,
      atRisk: atRisk,
      delayed: delayed,
      completed: completed,
      onTrackPct: pct(onTrack),
      atRiskPct: pct(atRisk),
      delayedPct: pct(delayed),
      completedPct: pct(completed),
      totalPct: total ? 100 : 0
    };
  }

  /** Build column headers for the right-side grid based on viewMode + timeframe. */
  function buildColumns() {
    var range = timeframeRange();
    var cols = [];
    var a = getAnchor();
    var y = a.getFullYear();

    if (viewMode === 'year') {
      var startY = range.start ? range.start.getFullYear() : y - 2;
      var endY = range.end ? range.end.getFullYear() : y + 2;
      if (localTimeframe === 'all') {
        var years = {};
        safeData().forEach(function (p) {
          var s = parseDate(p.start); var en = parseDate(p.end);
          if (s) years[s.getFullYear()] = true;
          if (en) years[en.getFullYear()] = true;
        });
        years[y] = true;
        Object.keys(years).map(Number).sort().forEach(function (yy) {
          cols.push({ key: 'y' + yy, label: String(yy), start: new Date(yy, 0, 1), end: new Date(yy, 11, 31) });
        });
        if (!cols.length) cols.push({ key: 'y' + y, label: String(y), start: new Date(y, 0, 1), end: new Date(y, 11, 31) });
        return cols;
      }
      for (var yy = startY; yy <= endY; yy++) {
        cols.push({ key: 'y' + yy, label: String(yy), start: new Date(yy, 0, 1), end: new Date(yy, 11, 31) });
      }
      return cols;
    }

    if (viewMode === 'quarters') {
      var qs; var qe;
      if (localTimeframe === 'quarter' && range.start) {
        qs = range.start;
        qe = range.end;
        cols.push({
          key: 'q' + qs.getFullYear() + '-' + Math.floor(qs.getMonth() / 3),
          label: 'Q' + (Math.floor(qs.getMonth() / 3) + 1) + ' ' + qs.getFullYear(),
          start: qs,
          end: qe
        });
        return cols;
      }
      var startQ = localTimeframe === 'all' ? new Date(y - 1, 0, 1) : new Date(y, 0, 1);
      var endQ = localTimeframe === 'all' ? new Date(y + 1, 11, 31) : new Date(y, 11, 31);
      var c = new Date(startQ.getFullYear(), Math.floor(startQ.getMonth() / 3) * 3, 1);
      while (c <= endQ) {
        var qn = Math.floor(c.getMonth() / 3);
        var qStart = new Date(c.getFullYear(), qn * 3, 1);
        var qEnd = new Date(c.getFullYear(), qn * 3 + 3, 0);
        cols.push({
          key: 'q' + c.getFullYear() + '-' + qn,
          label: 'Q' + (qn + 1) + ' ' + c.getFullYear(),
          start: qStart,
          end: qEnd
        });
        c = new Date(c.getFullYear(), c.getMonth() + 3, 1);
      }
      return cols;
    }

    /* months (default) */
    var ms; var me;
    if (localTimeframe === 'quarter' && range.start) {
      ms = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
      me = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
    } else if (localTimeframe === 'all') {
      ms = new Date(y, 0, 1);
      me = new Date(y, 11, 1);
      var allDates = [];
      safeData().forEach(function (p) {
        if (p.start) allDates.push(p.start);
        if (p.end) allDates.push(p.end);
      });
      if (allDates.length) {
        allDates.sort();
        var d0 = parseDate(allDates[0]);
        var d1 = parseDate(allDates[allDates.length - 1]);
        if (d0) ms = new Date(d0.getFullYear(), d0.getMonth(), 1);
        if (d1) me = new Date(d1.getFullYear(), d1.getMonth(), 1);
      }
    } else {
      ms = new Date(y, 0, 1);
      me = new Date(y, 11, 1);
    }
    var cur = new Date(ms);
    while (cur <= me) {
      cols.push({
        key: 'm' + cur.getFullYear() + '-' + cur.getMonth(),
        label: MN[cur.getMonth()] + ' ' + cur.getFullYear(),
        start: new Date(cur.getFullYear(), cur.getMonth(), 1),
        end: new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
      });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    if (!cols.length) {
      cols.push({
        key: 'm' + y + '-' + a.getMonth(),
        label: MN[a.getMonth()] + ' ' + y,
        start: new Date(y, a.getMonth(), 1),
        end: new Date(y, a.getMonth() + 1, 0)
      });
    }
    return cols;
  }

  function gridBounds(cols) {
    if (!cols.length) {
      var t = today();
      return { start: new Date(t.getFullYear(), 0, 1), end: new Date(t.getFullYear(), 11, 31) };
    }
    return { start: cols[0].start, end: cols[cols.length - 1].end };
  }

  function pctInRange(d, bounds) {
    if (!d) return null;
    var total = bounds.end.getTime() - bounds.start.getTime() || 1;
    return Math.max(0, Math.min(100, ((d.getTime() - bounds.start.getTime()) / total) * 100));
  }

  function ensureView() {
    var host = document.getElementById('appContent');
    if (!host) return null;
    var el = document.getElementById('timelineV3View');
    if (!el) {
      el = document.createElement('div');
      el.id = 'timelineV3View';
      el.className = 'timeline-v3 hidden';
      el.hidden = true;
      host.appendChild(el);
    }
    return el;
  }

  function setShellHidden(hidden) {
    [
      'dashboardView', 'kanbanView', 'projectsView', 'timelineView', 'issuesView', 'usersView',
      'filterBar', 'kpis', 'ovPageHead', 'ovFilters', 'pjPageHead', 'pjToolbar', 'kbPageHead', 'kbToolbar',
      'tasksView', 'issuesV3View', 'milestonesView', 'calendarView'
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (hidden) el.classList.add('tl3-shell-hidden');
      else el.classList.remove('tl3-shell-hidden');
    });
    var actions = document.getElementById('pageActions');
    if (actions) {
      if (hidden) actions.classList.add('tl3-shell-hidden');
      else actions.classList.remove('tl3-shell-hidden');
    }
    var foot = document.querySelector('#appContent>.foot');
    if (foot) {
      if (hidden) foot.classList.add('tl3-shell-hidden');
      else foot.classList.remove('tl3-shell-hidden');
    }
  }

  function syncSidebar() {
    document.querySelectorAll('#sidebarNav .nav-item').forEach(function (n) {
      n.classList.toggle('on', n.getAttribute('data-real-view') === 'timeline');
    });
  }

  function syncBody(on) {
    document.body.classList.toggle('view-timeline', on);
    if (on) {
      document.body.classList.remove('view-dashboard');
      document.body.classList.remove('view-projects');
      document.body.classList.remove('view-kanban');
      document.body.classList.remove('view-calendar');
      document.body.classList.remove('view-tasks');
      document.body.classList.remove('view-issues');
      document.body.classList.remove('view-milestones');
      syncSidebar();
    }
  }

  function filterOptionsHtml() {
    var projects = safeData().slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    var depts = [];
    var seen = {};
    safeData().forEach(function (p) {
      var c = String(p.category || '').trim();
      if (c && !seen[c]) { seen[c] = true; depts.push(c); }
    });
    try {
      if (Array.isArray(CATEGORIES)) {
        CATEGORIES.forEach(function (c) {
          var n = String(c || '').trim();
          if (n && !seen[n]) { seen[n] = true; depts.push(n); }
        });
      }
    } catch (_) {}
    depts.sort();

    var tf = timeframeRange();
    var year = getAnchor().getFullYear();

    return '' +
      '<label class="tl3-filter">' +
        '<span>Project</span>' +
        '<select id="tl3Project" aria-label="Project">' +
          '<option value="">All Projects</option>' +
          projects.map(function (p) {
            return '<option value="' + e(p.id) + '"' + (String(localProject) === String(p.id) ? ' selected' : '') + '>' + e(p.name) + '</option>';
          }).join('') +
        '</select>' +
      '</label>' +
      '<label class="tl3-filter">' +
        '<span>Department</span>' +
        '<select id="tl3Dept" aria-label="Department">' +
          '<option value="">All Departments</option>' +
          depts.map(function (d) {
            return '<option value="' + e(d) + '"' + (d === localDept ? ' selected' : '') + '>' + e(d) + '</option>';
          }).join('') +
        '</select>' +
      '</label>' +
      '<label class="tl3-filter tl3-filter-time">' +
        '<span>Timeframe</span>' +
        '<select id="tl3Timeframe" aria-label="Timeframe">' +
          '<option value="year"' + (localTimeframe === 'year' ? ' selected' : '') + '>This Year (Jan - Dec ' + year + ')</option>' +
          '<option value="quarter"' + (localTimeframe === 'quarter' ? ' selected' : '') + '>' + e(tf.label.indexOf('Q') === 0 ? tf.label : ('Q' + (Math.floor(getAnchor().getMonth() / 3) + 1) + ' ' + year)) + '</option>' +
          '<option value="all"' + (localTimeframe === 'all' ? ' selected' : '') + '>All Time</option>' +
        '</select>' +
      '</label>';
  }

  function todayLeftPct(bounds) {
    var t = today();
    if (t < bounds.start || t > bounds.end) return null;
    return pctInRange(t, bounds);
  }

  function todayMarkerHtml(bounds, withPill) {
    var left = todayLeftPct(bounds);
    if (left == null) return '';
    var t = today();
    var label = MN[t.getMonth()] + ' ' + t.getFullYear();
    return '<div class="tl3-today" style="left:' + left + '%">' +
      (withPill ? '<span class="tl3-today-pill">' + e(label) + '</span>' : '') +
      '<span class="tl3-today-line"></span>' +
    '</div>';
  }

  function rowHtml(p, cols, bounds) {
    var st = statusMeta(p.status);
    var pct = progressOf(p);
    var span = projectSpan(p);
    var left = 0;
    var width = 0;
    var hasBar = !!(span.start || span.end);
    if (hasBar) {
      var s = span.start || span.end;
      var en = span.end || span.start;
      /* Inclusive end day: place the bar edge at end-of-day so single-day spans are visible. */
      var endInclusive = new Date(en.getFullYear(), en.getMonth(), en.getDate(), 23, 59, 59, 999);
      var L = pctInRange(s, bounds);
      var R = pctInRange(endInclusive, bounds);
      if (L == null) L = 0;
      if (R == null) R = L;
      if (R < L) { var tmp = L; L = R; R = tmp; }
      left = L;
      width = Math.max(R - L, 1.8);
    }

    var colsHtml = cols.map(function () {
      return '<div class="tl3-col"></div>';
    }).join('');

    return '<div class="tl3-row" data-id="' + e(p.id) + '">' +
      '<div class="tl3-left-cell tl3-name" title="' + e(p.name || '') + '">' + e(p.name || 'Untitled') + '</div>' +
      '<div class="tl3-left-cell tl3-dept" title="' + e(p.category || '') + '">' + e(p.category || '-') + '</div>' +
      '<div class="tl3-left-cell tl3-status"><span class="tl3-pill ' + st.cls + '">' + e(st.label) + '</span></div>' +
      '<div class="tl3-left-cell tl3-date">' + e(fmt(p.start)) + '</div>' +
      '<div class="tl3-left-cell tl3-date">' + e(fmt(p.end)) + '</div>' +
      '<div class="tl3-left-cell tl3-prog">' +
        '<span class="tl3-prog-pct">' + pct + '%</span>' +
        '<span class="tl3-prog-track"><i style="width:' + pct + '%"></i></span>' +
      '</div>' +
      '<div class="tl3-track">' +
        '<div class="tl3-cols">' + colsHtml + '</div>' +
        todayMarkerHtml(bounds, false) +
        (hasBar
          ? '<div class="tl3-bar ' + st.bar + '" style="left:' + left + '%;width:' + width + '%" title="' + e((p.name || '') + '  |  ' + pct + '%') + '">' +
              '<i style="width:' + pct + '%"></i>' +
            '</div>'
          : '') +
      '</div>' +
    '</div>';
  }

  function bindChrome() {
    ['tl3Project', 'tl3Dept', 'tl3Timeframe'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.onchange = function () {
        if (id === 'tl3Project') localProject = el.value || '';
        if (id === 'tl3Dept') localDept = el.value || '';
        if (id === 'tl3Timeframe') localTimeframe = el.value || 'year';
        paintAll();
      };
    });

    var todayBtn = document.getElementById('tl3Today');
    if (todayBtn) {
      todayBtn.onclick = function () {
        setAnchor(today());
        paintAll();
      };
    }

    var prev = document.getElementById('tl3Prev');
    var next = document.getElementById('tl3Next');
    if (prev) {
      prev.onclick = function () {
        var a = getAnchor();
        if (viewMode === 'year' || localTimeframe === 'year') setAnchor(new Date(a.getFullYear() - 1, a.getMonth(), 1));
        else if (viewMode === 'quarters' || localTimeframe === 'quarter') setAnchor(new Date(a.getFullYear(), a.getMonth() - 3, 1));
        else setAnchor(new Date(a.getFullYear(), a.getMonth() - 1, 1));
        paintAll();
      };
    }
    if (next) {
      next.onclick = function () {
        var a = getAnchor();
        if (viewMode === 'year' || localTimeframe === 'year') setAnchor(new Date(a.getFullYear() + 1, a.getMonth(), 1));
        else if (viewMode === 'quarters' || localTimeframe === 'quarter') setAnchor(new Date(a.getFullYear(), a.getMonth() + 3, 1));
        else setAnchor(new Date(a.getFullYear(), a.getMonth() + 1, 1));
        paintAll();
      };
    }

    var mode = document.getElementById('tl3ViewMode');
    if (mode) {
      mode.onchange = function () {
        viewMode = mode.value || 'months';
        paintAll();
      };
    }

    document.querySelectorAll('.tl3-row[data-id]').forEach(function (row) {
      row.addEventListener('dblclick', function () {
        var id = row.getAttribute('data-id');
        if (id && typeof openProject === 'function') openProject(id);
        else if (id && typeof editProject === 'function') editProject(id);
      });
    });
  }

  function paintAll() {
    if (!timelineVisible || painting) return;
    painting = true;
    try {
      var host = ensureView();
      if (!host) return;

      var list = filteredProjects();
      var counts = kpiCounts(list);
      var cols = buildColumns();
      var bounds = gridBounds(cols);
      var now = new Date();
      var name = '';
      try { name = currentUser && currentUser.name ? currentUser.name.split(/\s+/)[0] : ''; } catch (_) {}
      var hour = now.getHours();
      var greet = (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening') + (name ? ', ' + name + '!' : '!');

      var headCols = cols.map(function (c) {
        return '<div class="tl3-mhead">' + e(c.label) + '</div>';
      }).join('');

      var rows = list.length
        ? list.map(function (p) { return rowHtml(p, cols, bounds); }).join('')
        : '<div class="tl3-empty">No projects match your filters.</div>';

      host.hidden = false;
      host.classList.remove('hidden');
      host.innerHTML =
        '<div class="tl3-page-head">' +
          '<div class="tl3-titleblock">' +
            '<div class="tl3-eyebrow">Jaffer Brothers Group IT</div>' +
            '<h1>Timeline</h1>' +
            '<p>Plan. Track. Deliver. Visualize project schedules across the Group IT portfolio.</p>' +
          '</div>' +
          '<div class="tl3-head-right">' +
            '<div class="tl3-greeting">' +
              '<span class="tl3-greeting-date"><i data-lucide="calendar-days"></i>' +
                e(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })) +
              '</span>' +
              '<strong>' + e(greet) + '</strong>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="tl3-filters-row">' +
          '<div class="tl3-filters">' + filterOptionsHtml() + '</div>' +
          '<div class="tl3-legend">' +
            '<span><i class="tl3-dot ontrack"></i>On Track</span>' +
            '<span><i class="tl3-dot atrisk"></i>At Risk</span>' +
            '<span><i class="tl3-dot delayed"></i>Delayed</span>' +
            '<span><i class="tl3-dot done"></i>Completed</span>' +
          '</div>' +
        '</div>' +
        '<section class="tl3-card">' +
          '<div class="tl3-card-head">' +
            '<div class="tl3-card-title"><i data-lucide="gantt-chart"></i><span>Project Timeline</span></div>' +
            '<div class="tl3-card-tools">' +
              '<button type="button" class="tl3-tool-btn" id="tl3Today">Today</button>' +
              '<div class="tl3-nav">' +
                '<button type="button" class="tl3-icon-btn" id="tl3Prev" aria-label="Previous"><i data-lucide="chevron-left"></i></button>' +
                '<button type="button" class="tl3-icon-btn" id="tl3Next" aria-label="Next"><i data-lucide="chevron-right"></i></button>' +
              '</div>' +
              '<select id="tl3ViewMode" class="tl3-mode" aria-label="View mode">' +
                '<option value="months"' + (viewMode === 'months' ? ' selected' : '') + '>Months</option>' +
                '<option value="quarters"' + (viewMode === 'quarters' ? ' selected' : '') + '>Quarters</option>' +
                '<option value="year"' + (viewMode === 'year' ? ' selected' : '') + '>Years</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="tl3-gantt">' +
            '<div class="tl3-gantt-head">' +
              '<div class="tl3-left-head">' +
                '<div class="tl3-th tl3-name">Project Name</div>' +
                '<div class="tl3-th tl3-dept">Department</div>' +
                '<div class="tl3-th tl3-status">Status</div>' +
                '<div class="tl3-th tl3-date">Start Date</div>' +
                '<div class="tl3-th tl3-date">End Date</div>' +
                '<div class="tl3-th tl3-prog">Progress</div>' +
              '</div>' +
              '<div class="tl3-right-head">' +
                '<div class="tl3-months">' + headCols + '</div>' +
                todayMarkerHtml(bounds, true) +
              '</div>' +
            '</div>' +
            '<div class="tl3-gantt-body">' +
              (list.length
                ? '<div class="tl3-rows">' + rows + '</div>'
                : rows) +
            '</div>' +
          '</div>' +
        '</section>' +
        '<div class="tl3-kpis">' +
          '<article class="tl3-kpi">' +
            '<span class="tl3-kpi-icon blue"><i data-lucide="layers"></i></span>' +
            '<div class="tl3-kpi-copy">' +
              '<div class="tl3-kpi-value">' + counts.total + '</div>' +
              '<div class="tl3-kpi-label">Total Projects</div>' +
              '<div class="tl3-kpi-bar"><i class="blue" style="width:' + counts.totalPct + '%"></i></div>' +
            '</div>' +
          '</article>' +
          '<article class="tl3-kpi">' +
            '<span class="tl3-kpi-icon green"><i data-lucide="shield-check"></i></span>' +
            '<div class="tl3-kpi-copy">' +
              '<div class="tl3-kpi-value">' + counts.onTrack + '</div>' +
              '<div class="tl3-kpi-label">On Track</div>' +
              '<div class="tl3-kpi-bar"><i class="green" style="width:' + counts.onTrackPct + '%"></i><span>' + counts.onTrackPct + '%</span></div>' +
            '</div>' +
          '</article>' +
          '<article class="tl3-kpi">' +
            '<span class="tl3-kpi-icon orange"><i data-lucide="triangle-alert"></i></span>' +
            '<div class="tl3-kpi-copy">' +
              '<div class="tl3-kpi-value">' + counts.atRisk + '</div>' +
              '<div class="tl3-kpi-label">At Risk</div>' +
              '<div class="tl3-kpi-bar"><i class="orange" style="width:' + counts.atRiskPct + '%"></i><span>' + counts.atRiskPct + '%</span></div>' +
            '</div>' +
          '</article>' +
          '<article class="tl3-kpi">' +
            '<span class="tl3-kpi-icon red"><i data-lucide="circle-alert"></i></span>' +
            '<div class="tl3-kpi-copy">' +
              '<div class="tl3-kpi-value">' + counts.delayed + '</div>' +
              '<div class="tl3-kpi-label">Delayed</div>' +
              '<div class="tl3-kpi-bar"><i class="red" style="width:' + counts.delayedPct + '%"></i><span>' + counts.delayedPct + '%</span></div>' +
            '</div>' +
          '</article>' +
          '<article class="tl3-kpi">' +
            '<span class="tl3-kpi-icon purple"><i data-lucide="flag"></i></span>' +
            '<div class="tl3-kpi-copy">' +
              '<div class="tl3-kpi-value">' + counts.completed + '</div>' +
              '<div class="tl3-kpi-label">Completed</div>' +
              '<div class="tl3-kpi-bar"><i class="purple" style="width:' + counts.completedPct + '%"></i><span>' + counts.completedPct + '%</span></div>' +
            '</div>' +
          '</article>' +
        '</div>';

      bindChrome();
      try { refreshLucideIcons(); } catch (_) { if (window.lucide) window.lucide.createIcons(); }
    } finally {
      painting = false;
    }
  }

  window.showTimelineV3 = function () {
    if (typeof hideTasksV3 === 'function') hideTasksV3();
    if (typeof hideIssuesV3 === 'function') hideIssuesV3();
    if (typeof hideMilestonesV3 === 'function') hideMilestonesV3();
    if (typeof hideCalendarV3 === 'function') hideCalendarV3();
    timelineVisible = true;
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

  window.hideTimelineV3 = function () {
    if (!timelineVisible) return;
    timelineVisible = false;
    syncBody(false);
    var host = document.getElementById('timelineV3View');
    if (host) {
      host.hidden = true;
      host.classList.add('hidden');
    }
    setShellHidden(false);
  };

  try {
    var oldSetView = window.setView;
    if (typeof oldSetView === 'function') {
      window.setView = function (v) {
        if (v !== 'timeline' && typeof hideTimelineV3 === 'function') hideTimelineV3();
        var out = oldSetView.apply(this, arguments);
        if (v === 'timeline') {
          setTimeout(function () {
            if (typeof showTimelineV3 === 'function') showTimelineV3();
          }, 0);
        }
        return out;
      };
    }
  } catch (_) {}

  try {
    var oldRender = render;
    render = function () {
      var out = oldRender.apply(this, arguments);
      if (timelineVisible) setTimeout(paintAll, 0);
      return out;
    };
  } catch (_) {}

  window.addEventListener('load', function () {
    setTimeout(function () {
      ensureView();
      try {
        if (typeof view === 'string' && view === 'timeline') showTimelineV3();
      } catch (_) {}
    }, 120);
  });
})();
