/* Project detail popup (v3)
 * Global entry point: window.openProjectDetail(projectId)
 * Reuses existing app globals: data, api(), uiCan(), openProject(),
 * deleteProject(), openProjectComments(), openTask(), fmtDate(), normalizeList().
 * Loads issues and comments live from the API; team is derived from the project. */
(function () {
  'use strict';

  var built = false;
  var currentId = null;
  var els = {};

  function e(v) {
    return (v == null ? '' : String(v)).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fmt(d) {
    if (typeof fmtDate === 'function') return fmtDate(d);
    return d || '-';
  }

  function list(multi, single) {
    if (typeof normalizeList === 'function') return normalizeList(multi, single);
    var out = [];
    (Array.isArray(multi) ? multi : multi ? [multi] : []).forEach(function (v) {
      var s = String(v || '').trim(); if (s) out.push(s);
    });
    if (!out.length && single) out.push(String(single).trim());
    return out;
  }

  function initials(name) {
    if (typeof userInitials === 'function') return userInitials(name);
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }

  var AV = ['#3B82F6', '#A78BFA', '#0891B2', '#F59E0B', '#34D399', '#EC4899', '#8B5CF6', '#14B8A6'];
  function avColor(name) {
    var s = String(name || ''), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AV[h % AV.length];
  }
  function avatar(name, size) {
    var st = size ? 'width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.38) + 'px;' : '';
    return '<span class="pd-av" style="background:' + avColor(name) + ';' + st + '">' + e(initials(name)) + '</span>';
  }

  function statusClass(s) {
    var t = String(s || '').toLowerCase();
    if (t.indexOf('complete') >= 0) return 'done';
    if (t.indexOf('on track') >= 0 || t.indexOf('in progress') >= 0 || t === 'done') return 'on';
    if (t.indexOf('risk') >= 0 || t.indexOf('hold') >= 0) return 'risk';
    if (t.indexOf('delay') >= 0) return 'delayed';
    return 'info';
  }
  function prioClass(p) {
    var t = String(p || '').toLowerCase();
    if (t.indexOf('high') >= 0) return 'high';
    if (t.indexOf('medium') >= 0) return 'med';
    return 'low';
  }
  function typeMeta(t) {
    switch (String(t || 'Task')) {
      case 'Bug': return { c: 'pd-t-bug', a: 'B' };
      case 'Story': return { c: 'pd-t-story', a: 'S' };
      case 'Epic': return { c: 'pd-t-epic', a: 'E' };
      case 'Change Request': return { c: 'pd-t-task', a: 'CR' };
      case 'Sub-task': return { c: 'pd-t-task', a: 'ST' };
      default: return { c: 'pd-t-task', a: 'T' };
    }
  }

  var ICON = {
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    folder: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0B1220" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>',
    trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>',
    warn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.29 3.86-8.4 14.55A2 2 0 0 0 3.62 21h16.76a2 2 0 0 0 1.73-2.59L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>'
  };

  function build() {
    if (built) return;
    var wrap = document.createElement('div');
    wrap.className = 'pd-backdrop';
    wrap.id = 'pdBackdrop';
    wrap.innerHTML =
      '<div class="pd-modal" role="dialog" aria-modal="true" aria-label="Project details">' +
        '<div class="pd-head">' +
          '<div class="pd-top">' +
            '<div class="pd-ico">' + ICON.folder + '</div>' +
            '<div class="pd-titlewrap">' +
              '<div class="pd-eyebrow" id="pdEyebrow"></div>' +
              '<h2 class="pd-title" id="pdTitle"></h2>' +
              '<div class="pd-badges" id="pdBadges"></div>' +
            '</div>' +
            '<button class="pd-close" id="pdClose" title="Close">' + ICON.close + '</button>' +
          '</div>' +
          '<div class="pd-meta" id="pdMeta"></div>' +
        '</div>' +
        '<div class="pd-tabs" id="pdTabs"></div>' +
        '<div class="pd-body" id="pdBody"></div>' +
        '<div class="pd-foot" id="pdFoot">' +
          '<div class="pd-normal">' +
            '<button class="pd-btn pd-btn-danger" id="pdDel">' + ICON.trash + 'Delete project</button>' +
            '<div class="pd-spacer"></div>' +
            '<button class="pd-btn" id="pdCloseFoot">Close</button>' +
            '<button class="pd-btn pd-btn-primary" id="pdEdit">' + ICON.edit + 'Edit project</button>' +
          '</div>' +
          '<div class="pd-confirm">' +
            '<div class="pd-warn">' + ICON.warn + 'Delete this project and its tasks? This cannot be undone.</div>' +
            '<button class="pd-btn" id="pdCancelDel">Cancel</button>' +
            '<button class="pd-btn pd-btn-primary" id="pdConfirmDel" style="background:var(--brand-red);border-color:var(--brand-red)">Yes, delete</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    els.wrap = wrap;
    els.eyebrow = wrap.querySelector('#pdEyebrow');
    els.title = wrap.querySelector('#pdTitle');
    els.badges = wrap.querySelector('#pdBadges');
    els.meta = wrap.querySelector('#pdMeta');
    els.tabs = wrap.querySelector('#pdTabs');
    els.body = wrap.querySelector('#pdBody');
    els.foot = wrap.querySelector('#pdFoot');
    els.del = wrap.querySelector('#pdDel');
    els.edit = wrap.querySelector('#pdEdit');

    wrap.querySelector('#pdClose').addEventListener('click', close);
    wrap.querySelector('#pdCloseFoot').addEventListener('click', close);
    wrap.addEventListener('click', function (ev) { if (ev.target === wrap) close(); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && wrap.classList.contains('open')) close();
    });

    els.edit.addEventListener('click', function () {
      var id = currentId; close();
      if (typeof openProject === 'function') openProject(id);
    });
    els.del.addEventListener('click', function () { els.foot.classList.add('confirming'); });
    wrap.querySelector('#pdCancelDel').addEventListener('click', function () { els.foot.classList.remove('confirming'); });
    wrap.querySelector('#pdConfirmDel').addEventListener('click', function () {
      var id = currentId;
      if (typeof deleteProject !== 'function') { close(); return; }
      Promise.resolve(deleteProject(id, { skipConfirm: true })).then(function (ok) {
        if (ok !== false) close(); else els.foot.classList.remove('confirming');
      });
    });

    built = true;
  }

  var TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'issues', label: 'Issues' },
    { key: 'team', label: 'Team' },
    { key: 'activity', label: 'Activity' }
  ];

  function findProject(id) {
    var d = (typeof data !== 'undefined' && data) ? data : (window.data || []);
    return (d || []).find(function (p) { return String(p.id) === String(id); }) || null;
  }

  function selectTab(key) {
    els.tabs.querySelectorAll('.pd-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.tab === key);
    });
    els.body.querySelectorAll('.pd-panel').forEach(function (p) {
      p.classList.toggle('show', p.dataset.panel === key);
    });
    if (key === 'issues') loadIssues();
    if (key === 'activity') loadActivity();
  }

  function renderShell(p) {
    var depts = list(p.departments, p.department);
    var teams = list(p.teams, p.team);
    var leadNames = (p.leads && p.leads.length) ? p.leads : list(p.leadNames, p.lead);
    var ownerNames = (p.owners && p.owners.length) ? p.owners : list(p.ownerNames, p.owner);

    els.eyebrow.textContent = (depts[0] || 'Group IT') + ' · Project';
    els.title.textContent = p.name || 'Untitled project';

    var badges = '<span class="pd-pill ' + statusClass(p.status) + '"><span class="pd-dot"></span>' + e(p.status || 'Not Started') + '</span>';
    badges += '<span class="pd-pill ' + prioClass(p.priority) + '">' + e(p.priority || 'Medium') + ' priority</span>';
    if (depts[0]) badges += '<span class="pd-pill dept">' + e(depts[0]) + '</span>';
    if (teams[0]) badges += '<span class="pd-pill dept">' + e(teams[0]) + '</span>';
    els.badges.innerHTML = badges;

    var leadAv = leadNames.slice(0, 3).map(function (n) { return avatar(n); }).join('');
    var leadLabel = leadNames.length ? (leadNames[0] + (leadNames.length > 1 ? ' + ' + (leadNames.length - 1) : '')) : '-';
    var prog = Number(p.progress) || 0;
    els.meta.innerHTML =
      '<div class="pd-meta-item"><div class="pd-avs">' + (leadAv || avatar('?')) + '</div>' +
        '<div><div class="pd-lbl">Lead</div><div class="pd-val">' + e(leadLabel) + '</div></div></div>' +
      '<div class="pd-meta-item"><div><div class="pd-lbl">Custodian</div><div class="pd-val">' + e(ownerNames[0] || '-') + '</div></div></div>' +
      '<div class="pd-meta-item"><div><div class="pd-lbl">Target</div><div class="pd-val">' + e(fmt(p.end)) + '</div></div></div>' +
      '<div class="pd-prog"><div class="pd-prog-top"><span class="pd-lbl" style="align-self:center">Progress</span><span style="font-weight:700">' + prog + '%</span></div>' +
        '<div class="pd-track"><div class="pd-fill" style="width:' + Math.max(4, prog) + '%"></div></div></div>';

    // tabs
    var taskCount = (p.milestones || []).length;
    els.tabs.innerHTML = TABS.map(function (t) {
      var cnt = '';
      if (t.key === 'tasks') cnt = ' <span class="pd-cnt">' + taskCount + '</span>';
      if (t.key === 'issues') cnt = ' <span class="pd-cnt" id="pdIssueCnt">·</span>';
      if (t.key === 'team') cnt = ' <span class="pd-cnt">' + (ownerNames.length + leadNames.length) + '</span>';
      return '<button class="pd-tab' + (t.key === 'overview' ? ' active' : '') + '" data-tab="' + t.key + '">' + t.label + cnt + '</button>';
    }).join('');
    els.tabs.querySelectorAll('.pd-tab').forEach(function (t) {
      t.addEventListener('click', function () { selectTab(t.dataset.tab); });
    });

    // panels
    els.body.innerHTML =
      '<div class="pd-panel show" data-panel="overview">' + renderOverview(p) + '</div>' +
      '<div class="pd-panel" data-panel="tasks">' + renderTasks(p) + '</div>' +
      '<div class="pd-panel" data-panel="issues"><div class="pd-loading">Loading issues…</div></div>' +
      '<div class="pd-panel" data-panel="team">' + renderTeam(p) + '</div>' +
      '<div class="pd-panel" data-panel="activity"><div class="pd-loading">Loading activity…</div></div>';
    wireAddButtons(p);

    // delete visibility
    var canDelete = (typeof uiCan === 'function') ? uiCan('delete_project', p) : false;
    els.del.classList.toggle('pd-hidden', !canDelete);
    els.foot.classList.remove('confirming');

    // edit visibility
    var canEdit = (typeof uiCan === 'function') ? uiCan('edit_project', p) : true;
    els.edit.classList.toggle('pd-hidden', !canEdit);
  }

  function renderOverview(p) {
    var notes = String(p.notes || '').trim();
    var depts = list(p.departments, p.department);
    var ownerNames = (p.owners && p.owners.length) ? p.owners : list(p.ownerNames, p.owner);
    var budget = p.budget != null && String(p.budget).trim() !== ''
      ? e(p.budget) : '<span style="color:var(--faint)">— (restricted)</span>';
    var openIssues = (p.__issueCount != null) ? p.__issueCount : '·';

    return '<p class="pd-sec">Description</p>' +
      '<div class="pd-desc' + (notes ? '' : ' empty') + '">' + (notes ? e(notes) : 'No description added yet.') + '</div>' +
      '<p class="pd-sec">Details</p>' +
      '<div class="pd-grid">' +
        kv('Department', e(depts[0] || '-')) +
        kv('Custodian', ownerNames[0] ? avatar(ownerNames[0], 22) + ' ' + e(ownerNames[0]) : '-') +
        kv('Status', '<span class="pd-pill ' + statusClass(p.status) + '" style="padding:3px 9px"><span class="pd-dot"></span>' + e(p.status || 'Not Started') + '</span>') +
        kv('Priority', '<span class="pd-pill ' + prioClass(p.priority) + '" style="padding:3px 9px">' + e(p.priority || 'Medium') + '</span>') +
        kv('Start date', e(fmt(p.start))) +
        kv('Target date', e(fmt(p.end))) +
        kv('Budget', budget) +
        kv('Last updated', e(fmt((p.updated || p.updatedAt || '').slice(0, 10)))) +
      '</div>' +
      '<p class="pd-sec">At a glance</p>' +
      '<div class="pd-stats">' +
        stat((p.milestones || []).length, 'Tasks') +
        stat('<span id="pdStatIssues">' + openIssues + '</span>', 'Open issues') +
        stat(ownerNames.length + (((p.leads && p.leads.length) ? p.leads : list(p.leadNames, p.lead)).length), 'Team') +
        stat('<span id="pdStatComments">·</span>', 'Comments') +
      '</div>';
  }
  function kv(k, v) { return '<div class="pd-kv"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; }
  function stat(n, l) { return '<div class="pd-stat"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>'; }

  function renderTasks(p) {
    var ms = p.milestones || [];
    var canAdd = (typeof uiCan === 'function') ? uiCan('create_task', p) : false;
    var head = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
      '<p class="pd-sec" style="margin:0">Tasks &amp; milestones · ' + ms.length + '</p>' +
      (canAdd ? '<button class="pd-btn" id="pdAddTask" style="padding:7px 12px;font-size:13px">' + ICON.plus + 'Add task</button>' : '') +
      '</div>';
    if (!ms.length) return head + '<div class="pd-empty">No tasks yet for this project.</div>';
    var rows = ms.map(function (m) {
      var done = statusClass(m.status) === 'done';
      var owners = (m.owners && m.owners.length) ? m.owners.join(', ') : (m.owner || '-');
      var canEdit = (typeof uiCan === 'function') ? uiCan('edit_task', m) : true;
      var canDelete = (typeof uiCan === 'function') ? uiCan('delete_task', m) : false;
      var acts = '';
      if (canEdit) acts += '<button type="button" class="pd-act" data-act="edit" data-ms="' + e(m.id) + '" title="Edit">' + ICON.edit + '<span>Edit</span></button>';
      if (canDelete) acts += '<button type="button" class="pd-act pd-act-danger" data-act="delete" data-ms="' + e(m.id) + '" title="Delete">' + ICON.trash + '<span>Delete</span></button>';
      return '<div class="pd-row" data-ms-id="' + e(m.id) + '">' +
        '<div class="pd-check' + (done ? ' done' : '') + '">' + (done ? ICON.check : '') + '</div>' +
        '<div class="pd-row-main"><div class="pd-row-title">' + e(m.title || 'Untitled task') + '</div>' +
          '<div class="pd-row-sub"><span>' + e(owners) + '</span><span>· Due ' + e(fmt(m.due)) + '</span></div></div>' +
        '<span class="pd-pill ' + statusClass(m.status) + '" style="padding:4px 10px">' + e(m.status || 'Not Started') + '</span>' +
        (acts ? '<div class="pd-acts">' + acts + '</div>' : '') +
      '</div>';
    }).join('');
    return head + '<div class="pd-list">' + rows + '</div>';
  }

  function renderTeam(p) {
    var ownerNames = (p.owners && p.owners.length) ? p.owners : list(p.ownerNames, p.owner);
    var leadNames = (p.leads && p.leads.length) ? p.leads : list(p.leadNames, p.lead);
    var ownerEmails = p.ownerEmails || (p.ownerEmail ? [p.ownerEmail] : []);
    var leadEmails = p.leadEmails || (p.leadEmail ? [p.leadEmail] : []);
    var au = (typeof assignableUsers !== 'undefined' && assignableUsers) ? assignableUsers : (window.assignableUsers || []);
    function meta(name, email) {
      var u = au.find(function (x) {
        return (email && String(x.email).toLowerCase() === String(email).toLowerCase()) ||
               String(x.name).toLowerCase() === String(name).toLowerCase();
      });
      var mail = email || (u && u.email) || '';
      var dept = (u && (u.team || u.department)) || '';
      return e([mail, dept].filter(Boolean).join(' · ') || '—');
    }
    function member(name, email, role, roleClass) {
      return '<div class="pd-member">' + avatar(name, 40) +
        '<div class="pd-member-main"><div class="pd-member-name">' + e(name) + '</div>' +
        '<div class="pd-member-mail">' + meta(name, email) + '</div></div>' +
        '<span class="pd-role ' + roleClass + '">' + role + '</span></div>';
    }
    var html = '';
    if (ownerNames.length) {
      html += '<div class="pd-grp">Custodian &amp; owners</div><div class="pd-list">' +
        ownerNames.map(function (n, i) { return member(n, ownerEmails[i], 'Custodian', 'pd-role-owner'); }).join('') + '</div>';
    }
    if (leadNames.length) {
      html += '<div class="pd-grp">Leads</div><div class="pd-list">' +
        leadNames.map(function (n, i) { return member(n, leadEmails[i], 'Lead', 'pd-role-lead'); }).join('') + '</div>';
    }
    if (!ownerNames.length && !leadNames.length) html = '<div class="pd-empty">No team assigned yet.</div>';
    return html;
  }

  function wireAddButtons(p) {
    var addTask = els.body.querySelector('#pdAddTask');
    if (addTask) addTask.addEventListener('click', function () {
      var id = currentId;
      try { window.__returnToProjectDetail = id; } catch (_) {}
      close();
      if (typeof openTask === 'function') openTask(id);
    });
    els.body.querySelectorAll('.pd-panel[data-panel="tasks"] .pd-act').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var act = btn.getAttribute('data-act');
        var msId = btn.getAttribute('data-ms');
        var pid = currentId;
        if (!msId) return;
        if (act === 'edit') {
          try { window.__returnToProjectDetail = pid; } catch (_) {}
          close();
          if (typeof openMs === 'function') openMs(pid, msId);
          return;
        }
        if (act === 'delete' && typeof deleteMilestone === 'function') {
          Promise.resolve(deleteMilestone(msId)).then(function (ok) {
            if (ok === false) return;
            var proj = findProject(pid);
            if (proj && Array.isArray(proj.milestones)) {
              proj.milestones = proj.milestones.filter(function (m) { return String(m.id) !== String(msId); });
            }
            if (String(currentId) === String(pid) && proj) {
              renderShell(proj);
              selectTab('tasks');
            } else if (typeof openProjectDetail === 'function') {
              openProjectDetail(pid);
            }
          });
        }
      });
    });
  }

  function loadIssues() {
    var panel = els.body.querySelector('.pd-panel[data-panel="issues"]');
    if (!panel || panel.dataset.loaded === '1' || panel.dataset.loading === '1') return;
    panel.dataset.loading = '1';
    var id = currentId;
    fetch('/api/issues?projectId=' + encodeURIComponent(id), { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : { issues: [] }; })
      .then(function (body) {
        if (String(currentId) !== String(id)) return;
        var issues = body.issues || [];
        var p = findProject(id); if (p) p.__issueCount = issues.length;
        var cntEl = document.getElementById('pdIssueCnt'); if (cntEl) cntEl.textContent = issues.length;
        var s1 = document.getElementById('pdStatIssues'); if (s1) s1.textContent = issues.length;
        var canAdd = (typeof uiCan === 'function') ? uiCan('create_task', p) : false;
        var head = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
          '<p class="pd-sec" style="margin:0">Linked issues · ' + issues.length + '</p></div>';
        if (!issues.length) { panel.innerHTML = head + '<div class="pd-empty">No issues linked to this project.</div>'; }
        else {
          var rows = issues.map(function (it) {
            var tm = typeMeta(it.type);
            return '<div class="pd-row">' +
              '<span class="pd-itype ' + tm.c + '">' + tm.a + '</span>' +
              '<span class="pd-ikey">' + e(it.key || '') + '</span>' +
              '<div class="pd-row-main"><div class="pd-row-title">' + e(it.summary || '') + '</div>' +
                '<div class="pd-row-sub"><span>' + e(it.type || 'Task') + '</span><span>· ' + e(it.assigneeName || 'Unassigned') + '</span>' +
                (it.status ? '<span>· ' + e(it.status) + '</span>' : '') + '</div></div>' +
              '<span class="pd-pill ' + prioClass(it.priority) + '" style="padding:4px 10px">' + e(it.priority || 'Medium') + '</span>' +
            '</div>';
          }).join('');
          panel.innerHTML = head + '<div class="pd-list">' + rows + '</div>';
        }
        panel.dataset.loaded = '1'; panel.dataset.loading = '';
      })
      .catch(function () {
        panel.innerHTML = '<div class="pd-empty">Could not load issues.</div>';
        panel.dataset.loading = '';
      });
  }

  function loadActivity() {
    var panel = els.body.querySelector('.pd-panel[data-panel="activity"]');
    if (!panel || panel.dataset.loaded === '1' || panel.dataset.loading === '1') return;
    panel.dataset.loading = '1';
    var id = currentId;
    fetch('/api/it/projects/' + encodeURIComponent(id) + '/comments', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : { comments: [] }; })
      .then(function (body) {
        if (String(currentId) !== String(id)) return;
        var comments = body.comments || [];
        var p = findProject(id);
        var canComment = (typeof uiCan === 'function') ? uiCan('comment', p) : false;
        var sc = document.getElementById('pdStatComments'); if (sc) sc.textContent = comments.length;
        var head = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
          '<p class="pd-sec" style="margin:0">Comments · ' + comments.length + '</p>' +
          (canComment ? '<button class="pd-btn" id="pdAddComment" style="padding:7px 12px;font-size:13px">' + ICON.plus + 'Add comment</button>' : '') +
          '</div>';
        var timeline;
        if (!comments.length) timeline = '<div class="pd-empty">No comments yet.</div>';
        else {
          timeline = '<div class="pd-tl">' + comments.map(function (c) {
            var when = fmt(String(c.createdAt || c.created_at || '').slice(0, 10));
            var who = c.authorName || c.author_name || 'Someone';
            var roleTxt = c.authorRole || c.author_role || '';
            return '<div class="pd-tl-item"><div class="pd-tl-dot"></div>' +
              '<div class="pd-tl-txt"><b>' + e(who) + '</b>' + (roleTxt ? ' <span style="color:var(--faint)">(' + e(roleTxt) + ')</span>' : '') + ' commented</div>' +
              '<div class="pd-tl-time">' + e(when) + '</div>' +
              '<div class="pd-cmt">' + e(c.body || '') + '</div></div>';
          }).join('') + '</div>';
        }
        panel.innerHTML = head + timeline;
        var addC = panel.querySelector('#pdAddComment');
        if (addC) addC.addEventListener('click', function () {
          var pid = currentId; close();
          if (typeof openProjectComments === 'function') openProjectComments(pid);
        });
        panel.dataset.loaded = '1'; panel.dataset.loading = '';
      })
      .catch(function () {
        panel.innerHTML = '<div class="pd-empty">Could not load activity.</div>';
        panel.dataset.loading = '';
      });
  }

  function open(id) {
    build();
    var p = findProject(id);
    if (!p) { if (typeof openProject === 'function') return openProject(id); return; }
    currentId = String(id);
    renderShell(p);
    selectTab('overview');
    els.wrap.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!built) return;
    els.wrap.classList.remove('open');
    els.foot.classList.remove('confirming');
    document.body.style.overflow = '';
    currentId = null;
  }

  window.openProjectDetail = open;
  window.closeProjectDetail = close;
})();