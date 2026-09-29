(function(){
  'use strict';

  function icon(name){return '<span class="nav-ico"><i data-lucide="'+name+'"></i></span>';}
  function btn(id,label,iconName,onclick,view){
    return '<button type="button" class="nav-item"'+(id?' id="'+id+'"':'')+(view?' data-real-view="'+view+'"':'')+' onclick="'+onclick+'">'+icon(iconName)+'<span class="nav-label">'+label+'</span></button>';
  }
  function setActive(key){
    document.querySelectorAll('#sidebarNav .nav-item').forEach(function(n){
      var on = n.getAttribute('data-real-view') === key;
      n.classList.toggle('on', on);
      if (on) n.setAttribute('aria-current', 'page');
      else n.removeAttribute('aria-current');
    });
  }
  function hideProjectSections(mode){
    var host=document.getElementById('projectsView');
    if(!host)return;
    var boards=host.querySelectorAll('.projects-board');
    boards.forEach(function(b,i){
      if(mode==='projects') b.style.display='';
      else if(mode==='milestones') b.style.display=(i===2?'':'none');
      else if(i===0) b.style.display='';
      else b.style.display='none';
    });
  }
  function normalizeMode(mode){
    var m = String(mode || '').trim().toLowerCase();
    if(!m || m === 'overview' || m === 'home') return 'dashboard';
    if(m === 'board') return 'kanban';
    return m;
  }

  function clearOverlayShellHidden(){
    document.querySelectorAll(
      '.tk3-shell-hidden, .cal3-shell-hidden, .iss3-shell-hidden, .ms3-shell-hidden, .tl3-shell-hidden'
    ).forEach(function(el){
      el.classList.remove(
        'tk3-shell-hidden', 'cal3-shell-hidden', 'iss3-shell-hidden',
        'ms3-shell-hidden', 'tl3-shell-hidden'
      );
    });
  }

  var HASH_VIEWS = {
    dashboard:1, projects:1, kanban:1, tasks:1, issues:1,
    milestones:1, timeline:1, calendar:1, users:1
  };

  function showRealSection(mode){
    mode = normalizeMode(mode);
    if(!HASH_VIEWS[mode]) return;
    if(typeof hideTasksV3==='function' && mode!=='tasks') hideTasksV3();
    if(typeof hideIssuesV3==='function' && mode!=='issues') hideIssuesV3();
    if(typeof hideMilestonesV3==='function' && mode!=='milestones') hideMilestonesV3();
    if(typeof hideTimelineV3==='function' && mode!=='timeline') hideTimelineV3();
    if(typeof hideCalendarV3==='function' && mode!=='calendar') hideCalendarV3();
    if(mode==='calendar'){
      try{ view='calendar'; }catch(_){}
      try{ document.body.classList.remove('view-dashboard'); }catch(_){}
      hideProjectSections('projects');
      if(typeof showCalendarV3==='function') showCalendarV3();
      setActive('calendar');
      return;
    }
    if(mode==='tasks'){
      if(typeof hideCalendarV3==='function') hideCalendarV3();
      if(typeof hideIssuesV3==='function') hideIssuesV3();
      if(typeof hideMilestonesV3==='function') hideMilestonesV3();
      if(typeof hideTimelineV3==='function') hideTimelineV3();
      hideProjectSections('projects');
      if(typeof showTasksV3==='function') showTasksV3();
      setActive('tasks');
      return;
    }
    if(mode==='issues'){
      if(typeof hideCalendarV3==='function') hideCalendarV3();
      if(typeof hideTasksV3==='function') hideTasksV3();
      if(typeof hideMilestonesV3==='function') hideMilestonesV3();
      if(typeof hideTimelineV3==='function') hideTimelineV3();
      hideProjectSections('projects');
      if(typeof setView==='function') setView('issues');
      if(typeof showIssuesV3==='function') showIssuesV3();
      setActive('issues');
      return;
    }
    if(mode==='milestones'){
      if(typeof hideCalendarV3==='function') hideCalendarV3();
      if(typeof hideTasksV3==='function') hideTasksV3();
      if(typeof hideIssuesV3==='function') hideIssuesV3();
      if(typeof hideTimelineV3==='function') hideTimelineV3();
      hideProjectSections('projects');
      if(typeof showMilestonesV3==='function') showMilestonesV3();
      setActive('milestones');
      return;
    }
    if(mode==='timeline'){
      if(typeof hideCalendarV3==='function') hideCalendarV3();
      if(typeof hideTasksV3==='function') hideTasksV3();
      if(typeof hideIssuesV3==='function') hideIssuesV3();
      if(typeof hideMilestonesV3==='function') hideMilestonesV3();
      hideProjectSections('projects');
      if(typeof setView==='function') setView('timeline');
      if(typeof showTimelineV3==='function') showTimelineV3();
      setActive('timeline');
      return;
    }
    if(typeof hideCalendarV3==='function') hideCalendarV3();
    if(typeof hideTimelineV3==='function') hideTimelineV3();
    clearOverlayShellHidden();
    hideProjectSections('projects');
    if(mode === 'dashboard' || mode === 'kanban' || mode === 'projects' || mode === 'users' || mode === 'timeline'){
      try{ document.body.classList.remove('view-tasks','view-issues','view-milestones','view-timeline','view-calendar'); }catch(_){}
      if(mode === 'dashboard'){
        document.body.classList.add('view-dashboard');
        document.body.classList.remove('view-projects','view-kanban');
        ['ovPageHead','ovFilters'].forEach(function(id){
          var el=document.getElementById(id);
          if(!el) return;
          el.hidden=false;
          el.removeAttribute('hidden');
          el.classList.remove('hidden','tk3-shell-hidden','cal3-shell-hidden','iss3-shell-hidden','ms3-shell-hidden','tl3-shell-hidden');
        });
      }
      else if(mode === 'kanban') document.body.classList.add('view-kanban');
      else if(mode === 'projects') document.body.classList.add('view-projects');
    }
    if(typeof setView==='function') setView(mode);
    setActive(mode);
    if(mode === 'dashboard'){
      setTimeout(function(){
        try{ if(typeof renderDashboard === 'function') renderDashboard(); }catch(_){}
      }, 0);
      setTimeout(function(){
        try{ if(typeof renderDashboard === 'function') renderDashboard(); }catch(_){}
      }, 120);
    } else if(mode === 'kanban'){
      setTimeout(function(){
        try{ if(typeof renderKanban === 'function') renderKanban(); }catch(_){}
      }, 0);
    }
  }
  window.showRealSection=showRealSection;

  var hashNavLock = false;

  function currentHashView(){
    var h = (location.hash || '').replace(/^#/, '').trim().toLowerCase();
    return normalizeMode(h) && HASH_VIEWS[normalizeMode(h)] ? normalizeMode(h) : (h ? null : 'dashboard');
  }

  function setHashForView(mode){
    mode = normalizeMode(mode);
    var key = mode === 'dashboard' ? '' : String(mode || '');
    var cur = normalizeMode((location.hash || '').replace(/^#/, ''));
    var curKey = cur === 'dashboard' ? '' : cur;
    if((key || '') === (curKey || '') && (location.hash || '').replace(/^#/, '') !== 'overview' && (location.hash || '').replace(/^#/, '') !== 'board' && (location.hash || '').replace(/^#/, '') !== 'home') return;
    hashNavLock = true;
    try{
      if(key) history.replaceState(null, '', '#' + key);
      else history.replaceState(null, '', location.pathname + location.search);
    }catch(_){}
    setTimeout(function(){ hashNavLock = false; }, 0);
  }

  function applyHashRoute(){
    if(hashNavLock) return;
    var mode = currentHashView();
    if(!mode) return;
    showRealSection(mode);
  }

  function install(){
    var nav=document.getElementById('sidebarNav');
    if(!nav)return;
    nav.innerHTML=
      btn('tabDashboard','Overview','house',"showRealSection('dashboard')",'dashboard')+
      btn('tabProjects','Projects','folder-kanban',"showRealSection('projects')",'projects')+
      btn('tabKanban','Board','columns-3',"showRealSection('kanban')",'kanban')+
      btn('tabTasks','Tasks','list-checks',"showRealSection('tasks')",'tasks')+
      btn('tabIssues','Issues','triangle-alert',"showRealSection('issues')",'issues')+
      btn('tabMilestones','Monthly Milestones','flag',"showRealSection('milestones')",'milestones')+
      btn('tabTimeline','Timeline','gantt-chart',"showRealSection('timeline')",'timeline')+
      btn('tabCalendar','Calendar','calendar-days',"showRealSection('calendar')",'calendar')+
      btn('tabUsers','Users','users',"showRealSection('users')",'users');

    var usersBtn=document.getElementById('tabUsers');
    if(usersBtn&&typeof uiCan==='function'&&!uiCan('manage_users'))usersBtn.style.display='none';

    if(typeof refreshLucideIcons==='function')refreshLucideIcons();
    else if(window.lucide&&window.lucide.createIcons)window.lucide.createIcons();

    if(document.body.classList.contains('view-tasks')) setActive('tasks');
    else if(document.body.classList.contains('view-issues')) setActive('issues');
    else if(document.body.classList.contains('view-milestones')) setActive('milestones');
    else if(document.body.classList.contains('view-timeline')) setActive('timeline');
    else if(document.body.classList.contains('view-calendar')) setActive('calendar');
    else{
      var active='dashboard';
      try{if(typeof view==='string')active=view;}catch(_){ }
      setActive(active);
    }
  }

  var _showReal = showRealSection;
  showRealSection = function(mode){
    mode = normalizeMode(mode);
    var out = _showReal(mode);
    setHashForView(mode);
    return out;
  };
  window.showRealSection = showRealSection;

  var oldSetView=window.setView;
  if(typeof oldSetView==='function'){
    window.setView=function(v){
      v = normalizeMode(v);
      if(typeof hideTasksV3==='function' && v!=='tasks') hideTasksV3();
      if(typeof hideCalendarV3==='function' && v!=='calendar') hideCalendarV3();
      if(typeof hideIssuesV3==='function' && v!=='issues') hideIssuesV3();
      if(typeof hideMilestonesV3==='function' && v!=='milestones') hideMilestonesV3();
      if(typeof hideTimelineV3==='function' && v!=='timeline') hideTimelineV3();
      if(v==='dashboard' || v==='kanban' || v==='projects' || v==='users') clearOverlayShellHidden();
      var out=oldSetView.call(this, v);
      if(v!=='projects')hideProjectSections('projects');
      if(v==='projects'||v==='dashboard'||v==='kanban'||v==='issues'||v==='timeline'||v==='users')setActive(v);
      setHashForView(v);
      return out;
    };
  }

  window.addEventListener('hashchange', function(){ applyHashRoute(); });
  window.addEventListener('load',function(){
    setTimeout(install,100);
    setTimeout(install,800);
    setTimeout(applyHashRoute, 200);
  });
  document.addEventListener('visibilitychange',function(){if(!document.hidden)install();});
})();

/* ── Search / command palette: close (X) button + click outside to close ──
   Before this, Esc or Ctrl+K were the only ways out — nothing for the mouse. */
(function () {
  'use strict';
  function closeIt() {
    try { if (typeof closeCommandPalette === 'function') closeCommandPalette(); } catch (_) {}
    var opener = document.getElementById('btnCommandPalette');
    if (opener) { try { opener.focus({ preventScroll: true }); } catch (_) {} }
  }
  function enhance() {
    var overlay = document.getElementById('cmdOverlay');
    if (!overlay || overlay.getAttribute('data-close-ready')) return;
    overlay.setAttribute('data-close-ready', '1');
    var wrap = overlay.querySelector('.cmd-input-wrap');
    if (wrap && !wrap.querySelector('.cmd-close')) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cmd-close';
      b.title = 'Close (Esc)';
      b.setAttribute('aria-label', 'Close search');
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      b.addEventListener('click', closeIt);
      wrap.appendChild(b);
    }
    // click on the dimmed area (not on the palette itself) closes it
    overlay.addEventListener('mousedown', function (ev) { if (ev.target === overlay) closeIt(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance); else enhance();
  window.addEventListener('load', enhance);
})();


/* ── Refresh guard ──────────────────────────────────────────────────────────
   Tasks / Milestones / Calendar are overlays: the app's own `view` variable stays
   "dashboard" while they are open. After a refresh the project data arrives AFTER the
   page from the URL (#tasks) is already showing; render() then repainted the Overview on
   top of it — Overview header gap, Overview KPI tiles under the list, body class flipped
   to view-dashboard (so the page lost its dark-mode styles) and "Overview" lit up in the
   sidebar. The Overview must only paint when the URL says Overview. */
(function () {
  'use strict';
  function route() { return (location.hash || '').replace(/^#/, '').trim().toLowerCase(); }
  function offOverview() { var r = route(); return !!r && r !== 'dashboard' && r !== 'overview' && r !== 'home'; }
  try {
    var paintDashboard = renderDashboard;
    renderDashboard = function () { if (offOverview()) return; return paintDashboard.apply(this, arguments); };
  } catch (_) {}
  try {
    // render() calls this with `true` whenever the app's `view` is still "dashboard" — which it is
    // underneath Tasks / Milestones / Calendar. It re-showed the Overview header and flipped the body class.
    var showOverviewChrome = setOvOnlyVisible;
    setOvOnlyVisible = function (show) { if (show && offOverview()) return; return showOverviewChrome.apply(this, arguments); };
  } catch (_) {}
  try {
    var paintKpis = renderKPIs;
    renderKPIs = function () {
      var r = route();
      // overlay pages have their own KPI row; the shared one belongs to Overview / Projects / Board
      if (r === 'tasks' || r === 'milestones' || r === 'calendar' || r === 'issues' || r === 'timeline' || r === 'users') return;
      return paintKpis.apply(this, arguments);
    };
  } catch (_) {}
})();


/* ── Page-enter cleanup ─────────────────────────────────────────────────────
   Arriving on a page by clicking must look the same as refreshing on it. Two leftovers broke that:
   1. Board hides the Projects header + filter row with an inline `display:none !important` and
      never undoes it — after one visit to Board, Projects lost its title, greeting, the three
      filter dropdowns and the Table/Board switch until the next refresh.
   2. Calendar only removes two of the other pages' body classes when it opens, so coming from
      Board left `view-kanban` on <body> and the Board header + toolbar showed on top of Calendar
      (coming from Projects left `view-projects`).
   The URL says which page is showing; keep only that page's body class. */
(function () {
  'use strict';
  var KEEP = { '': 'view-dashboard', dashboard: 'view-dashboard', overview: 'view-dashboard', home: 'view-dashboard',
    projects: 'view-projects', kanban: 'view-kanban', board: 'view-kanban', tasks: 'view-tasks', issues: 'view-issues',
    milestones: 'view-milestones', timeline: 'view-timeline', calendar: 'view-calendar', users: '' };
  var KNOWN = ['view-dashboard', 'view-projects', 'view-kanban', 'view-tasks', 'view-issues', 'view-milestones', 'view-timeline', 'view-calendar'];
  function route() { return (location.hash || '').replace(/^#/, '').trim().toLowerCase(); }
  function tidy() {
    var r = route();
    if (!Object.prototype.hasOwnProperty.call(KEEP, r)) return;   // e.g. a project detail URL — leave alone
    KNOWN.forEach(function (c) { if (c !== KEEP[r]) document.body.classList.remove(c); });
    if (r === 'projects') ['pjPageHead', 'pjToolbar'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.style.display === 'none') el.style.removeProperty('display');
    });
  }
  function soon() { [0, 120, 400].forEach(function (ms) { setTimeout(tidy, ms); }); }
  window.addEventListener('hashchange', soon);
  document.addEventListener('click', function (ev) {
    if (ev.target && ev.target.closest && ev.target.closest('#sidebarNav .nav-item, #cmdList .cmd-item, .ov3-kpi, .kpi-analytics')) soon();
  }, true);
  window.addEventListener('load', soon);
})();


/* ── "Milestones" is called "Monthly Milestones" everywhere (search box + Users page access list) ── */
(function () {
  'use strict';
  function rename(list) { try { (list || []).forEach(function (x) { if ((x.id === 'milestones' || x.key === 'milestones') && /^milestones$/i.test(x.label || '')) x.label = 'Monthly Milestones'; }); } catch (_) {} }
  function go() {
    try { rename(CMD_ACTIONS); } catch (_) {}
    try { rename(orgMeta && orgMeta.pages); } catch (_) {}
  }
  go(); window.addEventListener('load', go); setTimeout(go, 2000); setTimeout(go, 6000);   // orgMeta.pages is replaced when /api/users/meta arrives
})();


/* ── Brand logos per theme + auto-collapsing sidebar ─────────────────────── */
(function () {
  'use strict';
  function brand() {
    var wrap = document.querySelector('#appSidebar .sidebar-brand'); if (!wrap || wrap.querySelector('.brand-logo')) return;
    var mark = wrap.querySelector('img'); if (mark) mark.classList.add('brand-mark');
    var light = document.createElement('img'); light.src = '/assets/jaffer-logo-light.png'; light.alt = 'Jaffer'; light.className = 'brand-logo brand-logo-light';
    var dark = document.createElement('img'); dark.src = '/assets/jaffer-logo-dark.png'; dark.alt = 'Jaffer — Inspiring Growth, Transforming Lives'; dark.className = 'brand-logo brand-logo-dark';
    wrap.appendChild(light); wrap.appendChild(dark);
  }
  function mobile() { try { return typeof isMobileNav === 'function' && isMobileNav(); } catch (_) { return window.innerWidth < 992; } }
  function autoCollapse() {
    var sb = document.getElementById('appSidebar'); if (!sb || mobile()) return;
    // always start collapsed; the ▯ button opens it only until the next click on a menu item or on the page
    if (typeof applySidebarCollapsed === 'function' && !sb.classList.contains('collapsed')) applySidebarCollapsed(true);
    if (sb.getAttribute('data-peek-ready')) return;
    sb.setAttribute('data-peek-ready', '1');
    var t;
    function close() { if (mobile()) return; sb.classList.remove('peek'); if (!sb.classList.contains('collapsed') && typeof applySidebarCollapsed === 'function') applySidebarCollapsed(true); }
    document.addEventListener('click', function (ev) {
      if (mobile()) return;
      var inSidebar = sb.contains(ev.target), onToggle = !!ev.target.closest('#btnSidebarToggle');
      if (onToggle) return;
      if (!inSidebar) { close(); return; }
      if (ev.target.closest('#sidebarNav .nav-item, .sidebar-foot .nav-item')) setTimeout(close, 120);
    }, true);
    sb.addEventListener('mouseenter', function () { if (mobile() || !sb.classList.contains('collapsed')) return; clearTimeout(t); sb.classList.add('peek'); });
    sb.addEventListener('mouseleave', function () { clearTimeout(t); t = setTimeout(function () { sb.classList.remove('peek'); }, 150); });
    // a keyboard user tabbing into the sidebar gets the same peek
    sb.addEventListener('focusin', function () { if (!mobile() && sb.classList.contains('collapsed')) sb.classList.add('peek'); });
    sb.addEventListener('focusout', function () { setTimeout(function () { if (!sb.contains(document.activeElement)) sb.classList.remove('peek'); }, 100); });
  }
  function go() { brand(); autoCollapse(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  window.addEventListener('load', go); setTimeout(go, 1500);
})();


/* ── Theme button: light <-> dark only (no "system" step) ── */
(function () {
  'use strict';
  try {
    cycleTheme = function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    };
    // someone still on "system" from before gets pinned to what they currently see
    if (typeof getThemeMode === 'function' && getThemeMode() === 'system') {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    }
    (CMD_ACTIONS || []).forEach(function (x) { if (x.id === 'theme') { x.label = 'Toggle theme (light / dark)'; x.icon = 'sun-moon'; } });
    var b = document.getElementById('themeToggle'); if (b) b.setAttribute('aria-label', 'Toggle light / dark theme');
  } catch (_) {}
})();
