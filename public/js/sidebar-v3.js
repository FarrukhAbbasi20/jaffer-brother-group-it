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
      btn('tabMilestones','Milestones','flag',"showRealSection('milestones')",'milestones')+
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
