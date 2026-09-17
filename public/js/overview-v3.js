(function () {
  'use strict';

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
      return new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
        day: '2-digit', month: 'short', year: 'numeric'
      });
    } catch (_) {
      return d;
    }
  }

  function daysLeft(d) {
    if (!d) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var target = new Date(d + 'T00:00:00');
    return Math.round((target - today) / 86400000);
  }

  function relTag(d) {
    var n = daysLeft(d);
    if (n == null) return '';
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n > 1) return 'In ' + n + ' days';
    return Math.abs(n) + 'd overdue';
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

  function progressBar(v) {
    v = Math.max(0, Math.min(100, Number(v) || 0));
    return '<span class="ov3-pct">' + v + '%</span><div class="ov3-progress"><i style="width:' + v + '%"></i></div>';
  }

  function projects() {
    try { return Array.isArray(data) ? data : []; } catch (_) { return []; }
  }

  function issues() {
    try { return Array.isArray(issuesList) ? issuesList : []; } catch (_) { return []; }
  }

  function assignable() {
    try { return Array.isArray(assignableUsers) ? assignableUsers : []; } catch (_) { return []; }
  }

  function currentFiltered() {
    try { return typeof filtered === 'function' ? filtered() : projects(); } catch (_) { return projects(); }
  }

  function isOverview() {
    try {
      if (typeof view === 'string' && (view === 'dashboard' || view === 'overview' || view === 'home')) return true;
    } catch (_) {}
    var d = document.getElementById('dashboardView');
    return !!(d && !d.classList.contains('hidden'));
  }

  function isOpenIssue(issue) {
    var cat = String(issue.statusCategory || '').toLowerCase();
    if (cat === 'done') return false;
    var st = String(issue.status || '').toLowerCase();
    return st !== 'done' && st !== 'completed' && st !== 'cancelled' && st !== 'canceled';
  }

  function isInProgressIssue(issue) {
    var cat = String(issue.statusCategory || '').toLowerCase();
    if (cat === 'in_progress' || cat === 'in-progress') return true;
    var st = String(issue.status || '').toLowerCase();
    return st.includes('progress') || st.includes('review') || st === 'selected for work';
  }

  function openIssueSafe(id) {
    if (typeof openIssueModal === 'function') openIssueModal(id);
    else if (typeof setView === 'function') setView('issues');
  }

  function forceShowOverviewChrome() {
    document.body.classList.add('view-dashboard');
    document.body.classList.remove(
      'view-projects', 'view-kanban', 'view-tasks', 'view-issues',
      'view-milestones', 'view-timeline', 'view-calendar'
    );
    ['ovPageHead', 'ovFilters'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.hidden = false;
      el.removeAttribute('hidden');
      el.classList.remove('hidden', 'tk3-shell-hidden', 'cal3-shell-hidden', 'iss3-shell-hidden', 'ms3-shell-hidden', 'tl3-shell-hidden');
      el.style.removeProperty('display');
      el.style.setProperty('visibility', 'visible');
    });
    var dash = document.getElementById('dashboardView');
    if (dash) {
      dash.classList.remove('hidden', 'tk3-shell-hidden', 'cal3-shell-hidden', 'iss3-shell-hidden', 'ms3-shell-hidden', 'tl3-shell-hidden');
      dash.hidden = false;
    }
  }

  function syncOverviewBody() {
    if (isOverview()) forceShowOverviewChrome();
  }

  function renderHeader() {
    var head = document.getElementById('ovPageHead');
    if (!head) return;
    forceShowOverviewChrome();
    var now = new Date();
    var name = '';
    try { name = currentUser && currentUser.name ? currentUser.name.split(/\s+/)[0] : ''; } catch (_) {}
    var hour = now.getHours();
    var greet = (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening') + (name ? ', ' + name + '!' : '!');
    head.innerHTML =
      '<div class="ov3-titleblock">' +
        '<div class="ov3-eyebrow">Jaffer Brothers Group IT</div>' +
        '<h1>Overview</h1>' +
        '<p>People. Projects. Progress. A smarter, more connected Jaffer Brothers.</p>' +
      '</div>' +
      '<div class="ov3-greeting">' +
        '<span class="ov3-greeting-date"><i data-lucide="calendar-days"></i>' +
          e(now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })) +
        '</span>' +
        '<strong>' + e(greet) + '</strong>' +
      '</div>';
  }

  function onFilterChange() {
    var type = document.getElementById('ov3Type');
    var status = document.getElementById('ov3Status');
    var range = document.getElementById('ov3Range');
    var fCat = document.getElementById('fCat');
    var fStatus = document.getElementById('fStatus');
    if (type && fCat) fCat.value = type.value;
    if (status && fStatus) fStatus.value = status.value;
    try {
      if (range && typeof kpiFilter !== 'undefined') {
        if (range.value === '30') kpiFilter = 'due30';
        else if (kpiFilter === 'due30') kpiFilter = null;
      }
    } catch (_) {}
    try { render(); } catch (_) {}
  }

  function renderFilters() {
    var host = document.getElementById('ovFilters');
    if (!host) return;
    host.hidden = false;
    host.classList.remove('hidden');

    /* No Business Unit field on projects — Status + Project Types + range are the real filters. */
    var cats = [];
    projects().forEach(function (p) {
      if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category);
    });
    cats.sort();

    var curCat = '';
    var curStatus = '';
    var curRange = '';
    try {
      var fCat = document.getElementById('fCat');
      var fStatus = document.getElementById('fStatus');
      if (fCat) curCat = fCat.value || '';
      if (fStatus) curStatus = fStatus.value || '';
      if (typeof kpiFilter !== 'undefined' && kpiFilter === 'due30') curRange = '30';
    } catch (_) {}

    var statuses = ['Not Started', 'On Track', 'At Risk', 'Delayed', 'On Hold', 'Completed'];
    host.innerHTML =
      '<select id="ov3Status" aria-label="All Statuses">' +
        '<option value="">All Statuses</option>' +
        statuses.map(function (s) {
          return '<option value="' + e(s) + '"' + (s === curStatus ? ' selected' : '') + '>' + e(s) + '</option>';
        }).join('') +
      '</select>' +
      '<select id="ov3Type" aria-label="All Project Types">' +
        '<option value="">All Project Types</option>' +
        cats.map(function (c) {
          return '<option value="' + e(c) + '"' + (c === curCat ? ' selected' : '') + '>' + e(c) + '</option>';
        }).join('') +
      '</select>' +
      '<select id="ov3Range" aria-label="Date range">' +
        '<option value=""' + (!curRange ? ' selected' : '') + '>All time</option>' +
        '<option value="30"' + (curRange === '30' ? ' selected' : '') + '>Last 30 Days</option>' +
      '</select>';

    ['ov3Status', 'ov3Type', 'ov3Range'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.onchange = onFilterChange;
    });
  }

  function renderKpis() {
    var list = currentFiltered();
    var iss = issues();
    var planning = list.filter(function (p) {
      return p.status === 'Not Started' || p.status === 'On Hold';
    }).length;
    var inprogress = list.filter(function (p) {
      return p.status === 'On Track' || p.status === 'At Risk' || p.status === 'Delayed';
    }).length;
    var onTrack = list.filter(function (p) { return p.status === 'On Track'; }).length;
    var avgProgress = list.length
      ? Math.round(list.reduce(function (s, p) { return s + (Number(p.progress) || 0); }, 0) / list.length)
      : 0;

    var openIssues = iss.filter(isOpenIssue);
    var activeRequests = openIssues.length;
    var issuesInProg = openIssues.filter(isInProgressIssue).length;
    var issuesOpenOnly = Math.max(0, activeRequests - issuesInProg);
    var hasIssues = iss.length > 0;

    var openMs = 0;
    var msInProg = 0;
    if (!hasIssues) {
      list.forEach(function (p) {
        (p.milestones || []).forEach(function (m) {
          if (m.status !== 'Completed') {
            openMs++;
            if (m.status === 'In Progress') msInProg++;
          }
        });
      });
    }

    var people = new Set();
    list.forEach(function (p) {
      if (p.owner) people.add(String(p.owner).trim());
      if (p.lead) people.add(String(p.lead).trim());
    });
    assignable().forEach(function (u) {
      if (u && u.name) people.add(String(u.name).trim());
    });
    var cats = new Set();
    list.forEach(function (p) {
      if (p.category) cats.add(p.category);
    });

    var requestVal = hasIssues ? activeRequests : openMs;
    var requestSub = hasIssues
      ? (issuesOpenOnly + ' open · ' + issuesInProg + ' in progress')
      : (Math.max(0, openMs - msInProg) + ' open · ' + msInProg + ' in progress');

    var host = document.getElementById('kpis');
    if (!host) return;
    host.className = 'kpis ov3-kpis';
    host.style.display = 'grid';
    var tiles = [
      {
        icon: 'layers-3', lab: 'Total Projects', val: list.length,
        pill: planning + ' plan · ' + inprogress + ' active', color: 'red',
        click: "applyKpiFilter('total')"
      },
      {
        icon: 'ticket', lab: 'Active IT Requests', val: requestVal,
        pill: requestSub, color: 'blue',
        click: hasIssues ? "setView('issues')" : "setView('projects')"
      },
      {
        icon: 'gauge', lab: 'On Track', val: onTrack,
        pill: list.length
          ? (Math.round((onTrack / list.length) * 100) + '% · avg ' + avgProgress + '%')
          : 'no projects',
        color: 'green',
        click: "applyKpiFilter('On Track')"
      },
      {
        icon: 'users', lab: 'Team Members', val: people.size,
        pill: cats.size ? ('Across ' + cats.size + ' depts · ' + list.filter(function (p) { return p.status !== 'Completed'; }).length + ' live') : 'custodians & leads',
        color: 'navy',
        click: "if(typeof uiCan==='function'&&uiCan('manage_users'))setView('users')"
      }
    ];
    host.innerHTML = tiles.map(function (k, i) {
      if (typeof window.kpiAnalyticsCard === 'function') {
        return window.kpiAnalyticsCard({
          className: 'ov3-kpi',
          icon: k.icon,
          lab: k.lab,
          val: k.val,
          pill: k.pill,
          color: k.color,
          onclick: k.click,
          index: i
        });
      }
      return '<article class="ov3-kpi kpi-analytics kpi-tone-' + k.color + '" role="button" tabindex="0" onclick="' + k.click + '">' +
        '<div class="kpi-analytics-top"><span class="kpi-analytics-ico"><i data-lucide="' + k.icon + '"></i></span>' +
        '<span class="kpi-analytics-label">' + e(k.lab) + '</span></div>' +
        '<div class="kpi-analytics-mid"><div class="kpi-analytics-value ov3-kpi-value">' + e(String(k.val)) + '</div>' +
        '<span class="kpi-analytics-pill">' + e(k.pill) + '</span></div></article>';
    }).join('');
    try { if (typeof window.enhanceKpiTiles === 'function') window.enhanceKpiTiles(host); } catch (_) {}
  }

  var STATUS_COLORS = {
    'On Track': '#10B981',
    'At Risk': '#F59E0B',
    'Delayed': '#C8102E',
    'Completed': '#7C3AED',
    'On Hold': '#F59E0B',
    'Not Started': '#3B82F6'
  };
  var PRIO_COLORS = {
    Critical: '#991B1B',
    High: '#C8102E',
    Medium: '#F59E0B',
    Low: '#2563EB'
  };
  var DEPT_PALETTE = ['#0F2744', '#C8102E', '#2563EB', '#10B981', '#F59E0B', '#0D9488', '#1E3A8A', '#64748B'];

  function donutStyle(counts, total) {
    var order = ['On Track', 'At Risk', 'Delayed', 'Completed', 'On Hold', 'Not Started'];
    if (!total) return 'conic-gradient(#e5eaf0 0 100%)';
    var parts = [];
    var cursor = 0;
    order.forEach(function (s) {
      var n = counts[s] || 0;
      if (!n) return;
      var start = (cursor / total) * 100;
      cursor += n;
      var end = (cursor / total) * 100;
      parts.push(STATUS_COLORS[s] + ' ' + start.toFixed(2) + '% ' + end.toFixed(2) + '%');
    });
    return 'conic-gradient(' + (parts.join(',') || '#e5eaf0 0 100%') + ')';
  }

  function normalizePriority(p) {
    var s = String(p || 'Medium').trim();
    if (/critical|highest/i.test(s)) return 'Critical';
    if (/high/i.test(s)) return 'High';
    if (/low/i.test(s)) return 'Low';
    return 'Medium';
  }

  function barRow(label, count, max, color, delay) {
    var pct = max > 0 ? Math.max(count ? 6 : 0, Math.round((count / max) * 100)) : 0;
    var d = (delay || 0).toFixed(2);
    return '<div class="ov3-bar-row" style="--ov3-bar-delay:' + d + 's">' +
      '<div class="ov3-bar-meta"><span>' + e(label) + '</span><b>' + count + '</b></div>' +
      '<div class="ov3-bar-track" role="presentation"><i class="ov3-bar-fill" style="width:' + pct + '%;background:' + color + '"></i></div>' +
    '</div>';
  }

  function stackedStrip(parts, total) {
    if (!total) return '<div class="ov3-stack empty"></div>';
    return '<div class="ov3-stack" role="img" aria-label="Distribution">' +
      parts.map(function (p, i) {
        var w = Math.max(0, (p.n / total) * 100);
        if (!p.n) return '';
        return '<span class="ov3-stack-seg" style="width:' + w.toFixed(2) + '%;background:' + p.color + ';--ov3-bar-delay:' + (i * 0.06).toFixed(2) + 's" title="' + e(p.label + ': ' + p.n) + '"></span>';
      }).join('') +
    '</div>';
  }

  function buildAnalytics(list, iss) {
    var statuses = ['On Track', 'At Risk', 'Delayed', 'Completed', 'On Hold', 'Not Started'];
    var statusCounts = {};
    statuses.forEach(function (s) { statusCounts[s] = 0; });
    var prioOrder = ['Critical', 'High', 'Medium', 'Low'];
    var prioCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    var deptMap = {};
    var bands = [
      { key: '0–24%', min: 0, max: 24, n: 0, color: '#94A3B8' },
      { key: '25–49%', min: 25, max: 49, n: 0, color: '#F59E0B' },
      { key: '50–74%', min: 50, max: 74, n: 0, color: '#2563EB' },
      { key: '75–100%', min: 75, max: 100, n: 0, color: '#10B981' }
    ];
    var dueBuckets = [
      { key: 'Overdue', n: 0, color: '#C8102E' },
      { key: '7 days', n: 0, color: '#F59E0B' },
      { key: '30 days', n: 0, color: '#2563EB' },
      { key: 'Later', n: 0, color: '#0F2744' }
    ];
    var active = 0;
    var avgProgress = 0;

    list.forEach(function (p) {
      var st = String(p.status || '');
      if (statusCounts[st] != null) statusCounts[st]++;
      else statusCounts['Not Started'] = (statusCounts['Not Started'] || 0) + 1;

      var pr = normalizePriority(p.priority);
      prioCounts[pr]++;

      var dept = String(p.category || '').trim() || 'General';
      if (!deptMap[dept]) deptMap[dept] = { name: dept, n: 0, risk: 0, open: 0 };
      deptMap[dept].n++;
      if (/at risk|delayed|on hold/i.test(st)) deptMap[dept].risk++;
      if (st !== 'Completed') deptMap[dept].open++;

      var prog = Math.max(0, Math.min(100, Number(p.progress) || 0));
      avgProgress += prog;
      for (var i = 0; i < bands.length; i++) {
        if (prog >= bands[i].min && prog <= bands[i].max) { bands[i].n++; break; }
      }
      if (st !== 'Completed') active++;

      if (p.end && st !== 'Completed') {
        var left = daysLeft(p.end);
        if (left == null) dueBuckets[3].n++;
        else if (left < 0) dueBuckets[0].n++;
        else if (left <= 7) dueBuckets[1].n++;
        else if (left <= 30) dueBuckets[2].n++;
        else dueBuckets[3].n++;
      }
    });

    var openIssues = (iss || []).filter(isOpenIssue);
    openIssues.forEach(function (issue) {
      var pr = normalizePriority(issue.priority);
      prioCounts[pr]++;
    });

    avgProgress = list.length ? Math.round(avgProgress / list.length) : 0;
    var statusMax = Math.max(1, Math.max.apply(null, statuses.map(function (s) { return statusCounts[s] || 0; })));
    var prioTotal = prioOrder.reduce(function (s, k) { return s + (prioCounts[k] || 0); }, 0) || 1;
    var prioMax = Math.max(1, Math.max.apply(null, prioOrder.map(function (k) { return prioCounts[k] || 0; })));
    var depts = Object.values(deptMap).sort(function (a, b) {
      return b.n - a.n || b.risk - a.risk || a.name.localeCompare(b.name);
    }).slice(0, 6);
    var deptMax = Math.max(1, depts.length ? depts[0].n : 1);
    var bandMax = Math.max(1, Math.max.apply(null, bands.map(function (b) { return b.n; })));
    var dueMax = Math.max(1, Math.max.apply(null, dueBuckets.map(function (b) { return b.n; })));
    var dueTotal = dueBuckets.reduce(function (s, b) { return s + b.n; }, 0);

    var statusRows = statuses.map(function (s, i) {
      return barRow(s, statusCounts[s] || 0, statusMax, STATUS_COLORS[s], i * 0.05);
    }).join('');

    var prioStack = stackedStrip(prioOrder.map(function (k) {
      return { label: k, n: prioCounts[k] || 0, color: PRIO_COLORS[k] };
    }), prioTotal);

    var prioRows = prioOrder.map(function (k, i) {
      var n = prioCounts[k] || 0;
      var pct = Math.round((n / prioTotal) * 100);
      return '<div class="ov3-prio-row" style="--ov3-bar-delay:' + (i * 0.06).toFixed(2) + 's">' +
        '<span class="ov3-prio-dot" style="background:' + PRIO_COLORS[k] + '"></span>' +
        '<span class="ov3-prio-lab">' + e(k) + '</span>' +
        '<div class="ov3-bar-track thin"><i class="ov3-bar-fill" style="width:' + Math.max(n ? 5 : 0, Math.round((n / prioMax) * 100)) + '%;background:' + PRIO_COLORS[k] + '"></i></div>' +
        '<b>' + n + '</b><em>' + pct + '%</em>' +
      '</div>';
    }).join('');

    var deptRows = depts.length
      ? depts.map(function (d, i) {
          var color = DEPT_PALETTE[i % DEPT_PALETTE.length];
          var sub = d.risk ? (d.risk + ' need focus') : (d.open + ' active');
          return '<div class="ov3-dept-row" style="--ov3-bar-delay:' + (i * 0.05).toFixed(2) + 's">' +
            '<div class="ov3-bar-meta"><span>' + e(d.name) + '</span><b>' + d.n + '</b></div>' +
            '<div class="ov3-bar-track"><i class="ov3-bar-fill" style="width:' + Math.max(8, Math.round((d.n / deptMax) * 100)) + '%;background:' + color + '"></i></div>' +
            '<small>' + e(sub) + '</small>' +
          '</div>';
        }).join('')
      : '<div class="ov3-empty">No department data.</div>';

    var pulseRows = bands.map(function (b, i) {
      return barRow(b.key, b.n, bandMax, b.color, i * 0.05);
    }).join('');

    var dueRows = dueBuckets.map(function (b, i) {
      return barRow(b.key, b.n, dueMax, b.color, 0.2 + i * 0.05);
    }).join('');

    var statusTotal = list.length || 1;
    var statusStack = stackedStrip(statuses.map(function (s) {
      return { label: s, n: statusCounts[s] || 0, color: STATUS_COLORS[s] };
    }), statusTotal);

    return {
      statusRows: statusRows,
      statusStack: statusStack,
      prioStack: prioStack,
      prioRows: prioRows,
      prioTotal: prioTotal,
      deptRows: deptRows,
      deptCount: Object.keys(deptMap).length,
      pulseRows: pulseRows,
      dueRows: dueRows,
      dueTotal: dueTotal,
      avgProgress: avgProgress,
      active: active,
      highPrio: (prioCounts.Critical || 0) + (prioCounts.High || 0)
    };
  }

  function dashboard() {
    var list = currentFiltered().slice();
    var iss = issues();
    var host = document.getElementById('dashboardView');
    if (!host) return;

    var attn = [];
    list.forEach(function (p) {
      if (/at risk|delayed|on hold/i.test(p.status || '')) {
        attn.push({
          type: 'Project', icon: 'flag', title: p.name,
          detail: (p.category || 'General') + ' · ' + (p.owner || 'Unassigned'),
          priority: p.priority || 'Medium', due: p.end || '', pid: p.id, mid: null
        });
      }
      (p.milestones || []).forEach(function (m) {
        var overdue = m.status !== 'Completed' && m.due && daysLeft(m.due) < 0;
        if (overdue || /blocked/i.test(m.status || '')) {
          attn.push({
            type: overdue ? 'Overdue' : 'Task', icon: overdue ? 'clock-alert' : 'file-text',
            title: m.title, detail: p.name + (overdue ? ' · ' + Math.abs(daysLeft(m.due)) + 'd late' : ''),
            priority: overdue ? 'High' : (p.priority || 'Medium'),
            due: m.due || '', pid: p.id, mid: m.id
          });
        }
      });
    });
    iss.forEach(function (i) {
      if (/high|highest|critical/i.test(i.priority || '') && isOpenIssue(i)) {
        attn.push({
          type: 'Issue', icon: 'triangle-alert', title: i.summary || i.key,
          detail: i.projectName || i.status || '',
          priority: i.priority || 'High', due: i.dueDate || '',
          issueId: i.id
        });
      }
    });
    var attnTotal = attn.length;
    attn = attn.slice(0, 8);

    var statuses = ['On Track', 'At Risk', 'Delayed', 'Completed', 'On Hold', 'Not Started'];
    var counts = {};
    statuses.forEach(function (s) {
      counts[s] = list.filter(function (p) { return String(p.status || '') === s; }).length;
    });
    var total = list.length || 1;
    var onTrackPct = list.length ? Math.round(((counts['On Track'] || 0) / list.length) * 100) : 0;

    var deadlines = [];
    list.forEach(function (p) {
      (p.milestones || []).forEach(function (m) {
        if (m.due && m.status !== 'Completed') {
          var left = daysLeft(m.due);
          if (left != null && left >= 0 && left <= 30) {
            deadlines.push({
              date: m.due, title: m.title, meta: p.category || p.name,
              pid: p.id, mid: m.id
            });
          }
        }
      });
    });
    deadlines.sort(function (a, b) { return a.date.localeCompare(b.date); });
    deadlines = deadlines.slice(0, 8);

    var people = {};
    list.forEach(function (p) {
      [p.owner, p.lead].filter(Boolean).forEach(function (n, idx) {
        n = String(n).trim();
        if (!people[n]) people[n] = { name: n, open: 0, projects: 0, cats: {} };
        people[n].projects++;
        if (p.status !== 'Completed') people[n].open++;
        people[n].open += (p.milestones || []).filter(function (m) { return m.status !== 'Completed'; }).length;
        var cat = p.category || 'General';
        people[n].cats[cat] = (people[n].cats[cat] || 0) + 1;
      });
    });
    var workload = Object.values(people).sort(function (a, b) {
      return b.open - a.open || b.projects - a.projects;
    }).slice(0, 8);
    var maxOpen = Math.max(1, ...workload.map(function (w) { return w.open; }));

    var activity = [];
    list.forEach(function (p) {
      var who = (p.owner || p.lead || '').trim() || 'Unassigned';
      if (p.status === 'Completed') {
        activity.push({ who: who, text: 'completed ' + p.name, meta: p.category || 'Project', when: p.end || p.start || '', sort: p.end || p.start || '' });
      } else if (/at risk|delayed/i.test(p.status || '')) {
        activity.push({ who: who, text: 'marked ' + p.name + ' as ' + p.status, meta: p.category || 'Project', when: p.end || '', sort: p.end || '9999' });
      }
      (p.milestones || []).forEach(function (m) {
        var mWho = (m.owner || who).trim();
        if (m.status === 'Completed' && m.due) {
          activity.push({ who: mWho, text: 'completed ' + m.title, meta: p.name, when: m.due, sort: m.due });
        } else if (m.due && daysLeft(m.due) < 0 && m.status !== 'Completed') {
          activity.push({ who: mWho, text: 'has overdue ' + m.title, meta: p.name, when: m.due, sort: m.due });
        }
      });
    });
    iss.slice(0, 40).forEach(function (issue) {
      if (!issue.updatedAt && !issue.createdAt) return;
      var who = (issue.assigneeName || issue.reporterName || '').trim() || 'Unassigned';
      var stamp = String(issue.updatedAt || issue.createdAt).slice(0, 10);
      activity.push({
        who: who,
        text: (isOpenIssue(issue) ? 'updated ' : 'resolved ') + (issue.key || 'issue'),
        meta: issue.summary || issue.projectName || 'Issue',
        when: stamp,
        sort: stamp
      });
    });
    activity.sort(function (a, b) { return String(b.sort).localeCompare(String(a.sort)); });
    activity = activity.slice(0, 10);

    var rank = { Delayed: 0, 'At Risk': 1, 'On Hold': 2, 'Not Started': 3, 'On Track': 4, Completed: 5 };
    var sorted = list.slice().sort(function (a, b) {
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
        (b.priority === 'High') - (a.priority === 'High') ||
        (Number(a.progress) || 0) - (Number(b.progress) || 0);
    });

    var attnRows = attn.length
      ? attn.map(function (x) {
          var click;
          if (x.issueId) {
            click = "typeof openIssueModal==='function'?openIssueModal('" + e(x.issueId) + "'):setView('issues')";
          } else if (x.mid) {
            click = "openMs(" + (x.pid ? "'" + e(x.pid) + "'" : 'null') + ",'" + e(x.mid) + "')";
          } else {
            click = "openProject('" + e(x.pid) + "')";
          }
          var prio = String(x.priority || 'Medium');
          return '<tr tabindex="0" onclick="' + click + '" onkeydown="if(event.key===\'Enter\'){' + click + '}">' +
            '<td><span class="ov3-typeicon ' + e(String(x.type).toLowerCase()) + '"><i data-lucide="' + e(x.icon) + '"></i></span></td>' +
            '<td><strong>' + e(x.title) + '</strong></td>' +
            '<td>' + e(x.detail || '—') + '</td>' +
            '<td><span class="ov3-priority ' + e(prio.toLowerCase()) + '">' + e(prio) + '</span></td>' +
            '<td><span class="ov3-due ' + (relTag(x.due).includes('overdue') ? 'late' : '') + '">' + fmt(x.due) + '</span></td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="5" class="ov3-empty">Nothing currently needs urgent attention.</td></tr>';

    var healthRows = statuses.filter(function (s) { return counts[s]; }).map(function (s, i) {
      var n = counts[s] || 0;
      var pct = Math.round((n / total) * 100);
      return '<div class="ov3-health-row" style="--ov3-bar-delay:' + (i * 0.05).toFixed(2) + 's">' +
        '<span><i class="' + statusClass(s) + '"></i>' + e(s) + '</span>' +
        '<div class="ov3-health-meter"><i style="width:' + pct + '%;background:' + (STATUS_COLORS[s] || '#94A3B8') + '"></i></div>' +
        '<b>' + n + '</b><em>' + pct + '%</em></div>';
    }).join('') || '<div class="ov3-empty">No status data</div>';

    var deadlineRows = deadlines.length
      ? deadlines.map(function (x) {
          var d = new Date(x.date + 'T00:00:00');
          var tag = relTag(x.date);
          var tagCls = (tag === 'Today' || /overdue/i.test(tag) || (/^In \d/i.test(tag) && parseInt(String(tag).replace(/\D/g, ''), 10) <= 14))
            ? ' urgent'
            : '';
          var action = "openMs(" + (x.pid ? "'" + e(x.pid) + "'" : 'null') + ",'" + e(x.mid) + "')";
          return '<div class="ov3-deadline" role="button" tabindex="0" onclick="' + action + '" onkeydown="if(event.key===\'Enter\'){' + action + '}">' +
            '<div class="ov3-date"><b>' + d.getDate() + '</b><span>' + d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase() + '</span></div>' +
            '<div class="ov3-deadline-copy"><strong>' + e(x.title) + '</strong><span>' + e(x.meta) + '</span></div>' +
            '<span class="ov3-rel' + tagCls + '">' + e(tag) + '</span>' +
          '</div>';
        }).join('')
      : '<div class="ov3-empty">No upcoming deadlines.</div>';

    var projectRows = sorted.slice(0, 12).map(function (p) {
      return '<tr tabindex="0" onclick="openProject(\'' + e(p.id) + '\')" onkeydown="if(event.key===\'Enter\'){openProject(\'' + e(p.id) + '\')}">' +
        '<td><strong>' + e(p.name) + '</strong></td>' +
        '<td>' + e(p.category || '—') + '</td>' +
        '<td><span class="ov3-status ' + statusClass(p.status) + '">' + e(p.status || '—') + '</span></td>' +
        '<td><div class="ov3-progress-cell">' + progressBar(p.progress) + '</div></td>' +
        '<td>' + fmt(p.end) + '</td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="5" class="ov3-empty">No projects found.</td></tr>';

    var activityRows = activity.length
      ? activity.map(function (a) {
          return '<div class="ov3-activity">' +
            '<span class="ov3-activity-dot"></span>' +
            '<span class="ov3-avatar">' + e(initials(a.who)) + '</span>' +
            '<div><p><strong>' + e(a.who) + '</strong> ' + e(a.text) + '</p><small>' + e(a.meta) + '</small></div>' +
            '<time>' + e(a.when ? fmt(a.when) : '') + '</time>' +
          '</div>';
        }).join('')
      : '<div class="ov3-empty">No recent activity.</div>';

    var workloadRows = workload.length
      ? workload.map(function (w, i) {
          var pct = Math.max(8, Math.round((w.open / maxOpen) * 100));
          var topCat = Object.keys(w.cats).sort(function (a, b) { return w.cats[b] - w.cats[a]; })[0] || 'General';
          return '<div class="ov3-work">' +
            '<span class="ov3-avatar">' + e(initials(w.name)) + '</span>' +
            '<div><strong>' + e(w.name) + '</strong><small>' + e(topCat) + ' · ' + w.open + ' open</small></div>' +
            '<div class="ov3-workbar"><i style="width:' + pct + '%"></i></div>' +
            '<b>' + pct + '%</b>' +
          '</div>';
        }).join('')
      : '<div class="ov3-empty">No workload data.</div>';

    var ax = buildAnalytics(list, iss);

    var noteHtml = onTrackPct >= 55
      ? '<div class="ov3-health-note"><span class="ov3-check"><i data-lucide="check"></i></span><div><strong>Overall portfolio is healthy</strong><small>~' + onTrackPct + '% on track · avg progress ' + ax.avgProgress + '%</small></div></div>'
      : '<div class="ov3-health-note" style="background:#fff7ed;color:#9a5e0e"><span class="ov3-check" style="background:#f59e0b"><i data-lucide="info"></i></span><div><strong>Portfolio needs focus</strong><small>~' + onTrackPct + '% on track · ' + ax.highPrio + ' high-priority items</small></div></div>';

    host.innerHTML =
      '<div class="ov3-grid-top">' +
        '<section class="ov3-card ov3-attention">' +
          '<header><h2><span class="ov3-headicon red"><i data-lucide="bell"></i></span>Needs your attention</h2>' +
          (attnTotal ? '<button type="button" onclick="setView(\'projects\')">View all (' + attnTotal + ')</button>' : '') +
          '</header>' +
          '<div class="ov3-table-wrap"><table><thead><tr><th>Type</th><th>Item</th><th>Details</th><th>Priority</th><th>Due Date</th></tr></thead><tbody>' + attnRows + '</tbody></table></div>' +
        '</section>' +
        '<section class="ov3-card ov3-health">' +
          '<header><h2><span class="ov3-headicon green"><i data-lucide="chart-no-axes-column-increasing"></i></span>Portfolio health</h2></header>' +
          '<div class="ov3-health-main">' +
            '<div class="ov3-donut" style="background:' + donutStyle(counts, list.length) + '"><div><b>' + list.length + '</b><span>Projects</span></div></div>' +
            '<div class="ov3-health-list">' + healthRows + '</div>' +
          '</div>' +
          '<div class="ov3-health-stack">' + ax.statusStack + '</div>' +
          noteHtml +
        '</section>' +
        '<section class="ov3-card ov3-deadlines">' +
          '<header><h2><span class="ov3-headicon red"><i data-lucide="calendar-days"></i></span>Upcoming deadlines</h2><span style="font-size:9.5px;color:#8793a5">30 days</span></header>' +
          '<div>' + deadlineRows + '</div>' +
        '</section>' +
      '</div>' +
      '<div class="ov3-grid-analytics" aria-label="Portfolio analytics">' +
        '<section class="ov3-card ov3-ax ov3-ax-status">' +
          '<header><h2><span class="ov3-headicon green"><i data-lucide="pie-chart"></i></span>Status mix</h2>' +
          '<span class="ov3-ax-chip">' + list.length + ' projects</span></header>' +
          '<div class="ov3-ax-body">' +
            '<div class="ov3-ax-summary">' + ax.statusStack + '</div>' +
            '<div class="ov3-ax-bars">' + ax.statusRows + '</div>' +
          '</div>' +
        '</section>' +
        '<section class="ov3-card ov3-ax ov3-ax-prio">' +
          '<header><h2><span class="ov3-headicon red"><i data-lucide="signal"></i></span>Priority breakdown</h2>' +
          '<span class="ov3-ax-chip">' + ax.highPrio + ' high+</span></header>' +
          '<div class="ov3-ax-body">' +
            '<div class="ov3-ax-summary">' + ax.prioStack + '</div>' +
            '<div class="ov3-ax-bars">' + ax.prioRows + '</div>' +
          '</div>' +
        '</section>' +
        '<section class="ov3-card ov3-ax ov3-ax-dept">' +
          '<header><h2><span class="ov3-headicon blue"><i data-lucide="building-2"></i></span>Department load</h2>' +
          '<span class="ov3-ax-chip">' + ax.deptCount + ' depts</span></header>' +
          '<div class="ov3-ax-body"><div class="ov3-ax-bars dept">' + ax.deptRows + '</div></div>' +
        '</section>' +
        '<section class="ov3-card ov3-ax ov3-ax-pulse">' +
          '<header><h2><span class="ov3-headicon navy"><i data-lucide="activity"></i></span>Delivery pulse</h2>' +
          '<span class="ov3-ax-chip">avg ' + ax.avgProgress + '%</span></header>' +
          '<div class="ov3-ax-body">' +
            '<p class="ov3-ax-caption">Progress bands · ' + ax.active + ' active</p>' +
            '<div class="ov3-ax-bars">' + ax.pulseRows + '</div>' +
            '<p class="ov3-ax-caption mt">Target dates</p>' +
            '<div class="ov3-ax-bars">' + ax.dueRows + '</div>' +
          '</div>' +
        '</section>' +
      '</div>' +
      '<div class="ov3-grid-bottom">' +
        '<section class="ov3-card ov3-projects">' +
          '<header><h2><span class="ov3-headicon blue"><i data-lucide="grid-2x2"></i></span>Projects at a glance</h2>' +
          '<button type="button" onclick="setView(\'projects\')">View all projects</button></header>' +
          '<div class="ov3-table-wrap"><table><thead><tr><th>Project Name</th><th>Category</th><th>Status</th><th>Progress</th><th>Target Date</th></tr></thead><tbody>' + projectRows + '</tbody></table></div>' +
        '</section>' +
        '<section class="ov3-card">' +
          '<header><h2><span class="ov3-headicon blue"><i data-lucide="activity"></i></span>Recent activity</h2></header>' +
          '<div class="ov3-list">' + activityRows + '</div>' +
        '</section>' +
        '<section class="ov3-card">' +
          '<header><h2><span class="ov3-headicon blue"><i data-lucide="users"></i></span>Team workload</h2></header>' +
          '<div class="ov3-list">' + workloadRows + '</div>' +
        '</section>' +
      '</div>';

    try { refreshLucideIcons(); } catch (_) {
      if (window.lucide) window.lucide.createIcons();
    }
  }

  var painting = false;
  function renderAll() {
    if (!isOverview() || painting) return;
    painting = true;
    try {
      forceShowOverviewChrome();
      var legacy = document.getElementById('filterBar');
      if (legacy) legacy.style.setProperty('display', 'none', 'important');
      renderHeader();
      renderFilters();
      renderKpis();
      dashboard();
      try { refreshLucideIcons(); } catch (_) {
        if (window.lucide) window.lucide.createIcons();
      }
    } finally {
      painting = false;
    }
  }

  try {
    var oldDashboard = renderDashboard;
    renderDashboard = function () {
      forceShowOverviewChrome();
      if (typeof ensureIssuesForOverview === 'function') {
        try { ensureIssuesForOverview(); } catch (_) {}
      }
      renderAll();
    };
    var oldKpis = renderKPIs;
    renderKPIs = function () {
      if (isOverview()) {
        forceShowOverviewChrome();
        var head = document.getElementById('ovPageHead');
        if (head && !head.querySelector('h1')) renderHeader();
        return renderKpis();
      }
      return oldKpis.apply(this, arguments);
    };
    var oldSetView = window.setView;
    if (typeof oldSetView === 'function') {
      window.setView = function (v) {
        var out = oldSetView.apply(this, arguments);
        var mode = String(v || '').toLowerCase();
        if (mode === 'dashboard' || mode === 'overview' || mode === 'home') {
          forceShowOverviewChrome();
          setTimeout(renderAll, 0);
          setTimeout(renderAll, 80);
          setTimeout(renderAll, 250);
        } else {
          document.body.classList.remove('view-dashboard');
        }
        return out;
      };
    }
  } catch (_) {}

  window.addEventListener('load', function () {
    setTimeout(function () { if (isOverview()) { forceShowOverviewChrome(); renderAll(); } }, 0);
    setTimeout(function () { if (isOverview()) renderAll(); }, 100);
    setTimeout(function () { if (isOverview()) renderAll(); }, 500);
    setTimeout(function () { if (isOverview()) renderAll(); }, 1200);
  });
})();
