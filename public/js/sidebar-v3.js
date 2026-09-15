(function(){
  'use strict';

  function icon(name){return '<span class="nav-ico"><i data-lucide="'+name+'"></i></span>';}
  function btn(id,label,iconName,onclick,view){
    return '<button type="button" class="nav-item"'+(id?' id="'+id+'"':'')+(view?' data-real-view="'+view+'"':'')+' onclick="'+onclick+'">'+icon(iconName)+'<span class="nav-label">'+label+'</span></button>';
  }
  function setActive(key){
    document.querySelectorAll('#sidebarNav .nav-item').forEach(function(n){n.classList.toggle('on',n.getAttribute('data-real-view')===key);});
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
  function showRealSection(mode){
    if(typeof hideTasksV3==='function') hideTasksV3();
    if(typeof hideIssuesV3==='function' && mode!=='issues') hideIssuesV3();
    if(mode==='calendar'){
      hideProjectSections('projects');
      if(typeof showCalendarV3==='function') showCalendarV3();
      setActive('calendar');
      return;
    }
    if(mode==='tasks'){
      if(typeof hideCalendarV3==='function') hideCalendarV3();
      if(typeof hideIssuesV3==='function') hideIssuesV3();
      hideProjectSections('projects');
      if(typeof showTasksV3==='function') showTasksV3();
      setActive('tasks');
      return;
    }
    if(typeof hideCalendarV3==='function') hideCalendarV3();
    if(mode==='milestones'){
      if(typeof setView==='function') setView('projects');
      hideProjectSections(mode);
      setActive(mode);
      var host=document.getElementById('projectsView');
      if(host){host.scrollIntoView({block:'start'});}
      return;
    }
    hideProjectSections('projects');
    if(typeof setView==='function') setView(mode);
    setActive(mode);
  }
  window.showRealSection=showRealSection;

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
    else if(document.body.classList.contains('view-calendar')) setActive('calendar');
    else{
      var active='dashboard';
      try{if(typeof view==='string')active=view;}catch(_){ }
      setActive(active);
    }
  }

  var oldSetView=window.setView;
  if(typeof oldSetView==='function'){
    window.setView=function(v){
      if(typeof hideTasksV3==='function') hideTasksV3();
      if(typeof hideCalendarV3==='function') hideCalendarV3();
      if(typeof hideIssuesV3==='function' && v!=='issues') hideIssuesV3();
      var out=oldSetView.apply(this,arguments);
      if(v!=='projects')hideProjectSections('projects');
      if(v==='projects'||v==='dashboard'||v==='kanban'||v==='issues'||v==='timeline'||v==='users')setActive(v);
      return out;
    };
  }

  window.addEventListener('load',function(){setTimeout(install,100);setTimeout(install,800);});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)install();});
})();
