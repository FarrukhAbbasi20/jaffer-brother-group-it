(function(){
  'use strict';

  var calendarMonth = new Date();
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  var calendarType = 'all';
  var calendarVisible = false;

  function e(v){return (v==null?'':String(v)).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});}
  function iso(d){return d && /^\d{4}-\d{2}-\d{2}/.test(String(d)) ? String(d).slice(0,10) : '';}
  function sameDay(a,b){return iso(a)===iso(b);}
  function safeData(){try{return Array.isArray(data)?data:[];}catch(_){return [];}}
  function safeStandalone(){try{return Array.isArray(standalone)?standalone:[];}catch(_){return [];}}
  function safeIssues(){try{return Array.isArray(issuesList)?issuesList:[];}catch(_){return [];}}

  function collectEvents(){
    var out=[];
    safeData().forEach(function(p){
      if(p.start) out.push({date:iso(p.start),type:'project',title:p.name,meta:'Project start',project:p.name});
      if(p.end) out.push({date:iso(p.end),type:'project',title:p.name,meta:'Project target',project:p.name});
      (p.milestones||[]).forEach(function(m){
        if(m.due) out.push({date:iso(m.due),type:'milestone',title:m.title,meta:p.name,project:p.name,status:m.status});
      });
    });
    safeStandalone().forEach(function(m){
      var kind=(m.kind||'task').toLowerCase();
      if(m.due) out.push({date:iso(m.due),type:kind==='monthly'?'milestone':'task',title:m.title,meta:kind==='monthly'?'Monthly milestone':'Direct task',status:m.status});
      (m.tasks||[]).forEach(function(t){if(t.due) out.push({date:iso(t.due),type:'task',title:t.title,meta:m.title,status:t.status});});
    });
    safeIssues().forEach(function(i){if(i.dueDate) out.push({date:iso(i.dueDate),type:'issue',title:i.summary||i.key||'Issue',meta:i.projectName||i.status||'Issue',status:i.status});});
    return out.filter(function(x){return x.date;}).sort(function(a,b){return a.date.localeCompare(b.date);});
  }

  function ensureView(){
    var host=document.getElementById('appContent');
    if(!host)return null;
    var el=document.getElementById('calendarView');
    if(!el){el=document.createElement('div');el.id='calendarView';el.className='calendar-v3 hidden';host.appendChild(el);}
    return el;
  }

  function typeLabel(t){return {project:'Projects',milestone:'Milestones',task:'Tasks',issue:'Issues'}[t]||t;}
  function typeIcon(t){return {project:'folder-kanban',milestone:'flag',task:'list-checks',issue:'triangle-alert'}[t]||'calendar-days';}
  function formatMonth(d){return d.toLocaleDateString(undefined,{month:'long',year:'numeric'});}
  function fmtDate(d){try{return new Date(d+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short'});}catch(_){return d;}}

  function renderCalendar(){
    var host=ensureView(); if(!host)return;
    var all=collectEvents();
    var events=calendarType==='all'?all:all.filter(function(x){return x.type===calendarType;});
    var y=calendarMonth.getFullYear(),m=calendarMonth.getMonth();
    var first=new Date(y,m,1),last=new Date(y,m+1,0);
    var start=new Date(y,m,1-first.getDay());
    var cells=[];
    for(var i=0;i<42;i++){
      var d=new Date(start);d.setDate(start.getDate()+i);
      var key=d.toISOString().slice(0,10);
      var dayEvents=events.filter(function(ev){return sameDay(ev.date,key);}).slice(0,3);
      cells.push('<div class="cal3-day '+(d.getMonth()===m?'':'outside')+(key===new Date().toISOString().slice(0,10)?' today':'')+'"><span class="cal3-daynum">'+d.getDate()+'</span><div class="cal3-events">'+dayEvents.map(function(ev){return '<div class="cal3-chip '+ev.type+'" title="'+e(ev.title)+'"><i data-lucide="'+typeIcon(ev.type)+'"></i><span>'+e(ev.title)+'</span></div>';}).join('')+(events.filter(function(ev){return sameDay(ev.date,key);}).length>3?'<div class="cal3-more">+'+(events.filter(function(ev){return sameDay(ev.date,key);}).length-3)+' more</div>':'')+'</div></div>');
    }
    var today=new Date();today.setHours(0,0,0,0);
    var upcoming=events.filter(function(ev){return new Date(ev.date+'T00:00:00')>=today;}).slice(0,6);
    var counts={project:0,milestone:0,task:0,issue:0};all.forEach(function(x){if(counts[x.type]!=null)counts[x.type]++;});

    host.innerHTML='<div class="cal3-head"><div><div class="cal3-eyebrow">Jaffer Brothers Group IT</div><h1>Calendar</h1><p>Stay in sync. View project milestones, tasks, issues and important delivery dates.</p></div><div class="cal3-actions"><select id="cal3Type"><option value="all">All Event Types</option><option value="project">Projects</option><option value="milestone">Milestones</option><option value="task">Tasks</option><option value="issue">Issues</option></select><button type="button" class="cal3-btn" id="cal3Today">Today</button><button type="button" class="cal3-icon" id="cal3Prev" aria-label="Previous month"><i data-lucide="chevron-left"></i></button><button type="button" class="cal3-icon" id="cal3Next" aria-label="Next month"><i data-lucide="chevron-right"></i></button></div></div><div class="cal3-layout"><section class="cal3-card cal3-main"><div class="cal3-cardhead"><h2>'+e(formatMonth(calendarMonth))+'</h2><span>'+events.filter(function(ev){var d=new Date(ev.date+'T00:00:00');return d.getFullYear()===y&&d.getMonth()===m;}).length+' scheduled items</span></div><div class="cal3-week"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="cal3-grid">'+cells.join('')+'</div></section><aside class="cal3-side"><section class="cal3-card"><div class="cal3-cardhead"><h2>Upcoming events</h2></div><div class="cal3-upcoming">'+(upcoming.length?upcoming.map(function(ev){var d=new Date(ev.date+'T00:00:00');return '<div class="cal3-uprow"><div class="cal3-date"><b>'+d.getDate()+'</b><span>'+d.toLocaleDateString(undefined,{month:'short'}).toUpperCase()+'</span></div><div class="cal3-upcopy"><strong>'+e(ev.title)+'</strong><span>'+e(ev.meta||typeLabel(ev.type))+'</span></div><i class="cal3-dot '+ev.type+'"></i></div>';}).join(''):'<div class="cal3-empty">No upcoming dated work.</div>')+'</div></section><section class="cal3-card"><div class="cal3-cardhead"><h2>Event types</h2></div><div class="cal3-types">'+Object.keys(counts).map(function(k){return '<button type="button" data-caltype="'+k+'"><span><i class="cal3-dot '+k+'"></i>'+typeLabel(k)+'</span><b>'+counts[k]+'</b></button>';}).join('')+'</div></section></aside></div>';
    var sel=document.getElementById('cal3Type');if(sel){sel.value=calendarType;sel.onchange=function(){calendarType=this.value;renderCalendar();};}
    var prev=document.getElementById('cal3Prev');if(prev)prev.onclick=function(){calendarMonth=new Date(y,m-1,1);renderCalendar();};
    var next=document.getElementById('cal3Next');if(next)next.onclick=function(){calendarMonth=new Date(y,m+1,1);renderCalendar();};
    var nowBtn=document.getElementById('cal3Today');if(nowBtn)nowBtn.onclick=function(){var n=new Date();calendarMonth=new Date(n.getFullYear(),n.getMonth(),1);renderCalendar();};
    host.querySelectorAll('[data-caltype]').forEach(function(b){b.onclick=function(){calendarType=this.getAttribute('data-caltype');renderCalendar();};});
    if(typeof refreshLucideIcons==='function')refreshLucideIcons();else if(window.lucide)window.lucide.createIcons();
  }

  function setShellHidden(hidden){
    ['dashboardView','kanbanView','projectsView','timelineView','issuesView','usersView','filterBar','kpis','ovPageHead','ovFilters'].forEach(function(id){var el=document.getElementById(id);if(!el)return;if(hidden)el.classList.add('cal3-shell-hidden');else el.classList.remove('cal3-shell-hidden');});
    var actions=document.getElementById('pageActions');if(actions){if(hidden)actions.classList.add('cal3-shell-hidden');else actions.classList.remove('cal3-shell-hidden');}
    var foot=document.querySelector('#appContent>.foot');if(foot){if(hidden)foot.classList.add('cal3-shell-hidden');else foot.classList.remove('cal3-shell-hidden');}
  }

  window.showCalendarV3=function(){
    calendarVisible=true;
    document.body.classList.remove('view-dashboard');
    document.body.classList.add('view-calendar');
    setShellHidden(true);
    var host=ensureView();if(host)host.classList.remove('hidden');
    renderCalendar();
    window.scrollTo({top:0,behavior:'smooth'});
  };
  window.hideCalendarV3=function(){
    if(!calendarVisible)return;
    calendarVisible=false;
    document.body.classList.remove('view-calendar');
    var host=document.getElementById('calendarView');if(host)host.classList.add('hidden');
    setShellHidden(false);
  };
})();