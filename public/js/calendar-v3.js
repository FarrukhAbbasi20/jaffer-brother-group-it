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

  function milestoneEventType(m){
    var kind = String(m && m.kind || 'task').toLowerCase();
    return kind === 'monthly' ? 'milestone' : 'task';
  }

  function collectEvents(){
    var out=[];
    var coveredLegacy = {};

    safeData().forEach(function(p){
      if(p.start) out.push({date:iso(p.start),type:'project',title:p.name,meta:'Project start',project:p.name,sourceId:p.id});
      if(p.end) out.push({date:iso(p.end),type:'project',title:p.name,meta:'Project target',project:p.name,sourceId:p.id});
      (p.milestones||[]).forEach(function(m){
        if(!m.due) return;
        var type = milestoneEventType(m);
        if(m.id) coveredLegacy[String(m.id)] = type;
        out.push({
          date:iso(m.due),
          type:type,
          title:m.title,
          meta:p.name,
          project:p.name,
          status:m.status,
          sourceId:m.id
        });
      });
    });

    safeStandalone().forEach(function(m){
      var type = milestoneEventType(m);
      if(m.due){
        if(m.id) coveredLegacy[String(m.id)] = type;
        out.push({
          date:iso(m.due),
          type:type,
          title:m.title,
          meta:type === 'milestone' ? 'Monthly milestone' : 'Direct task',
          status:m.status,
          sourceId:m.id
        });
      }
      (m.tasks||[]).forEach(function(t){
        if(!t.due) return;
        if(t.id) coveredLegacy[String(t.id)] = 'task';
        out.push({
          date:iso(t.due),
          type:'task',
          title:t.title,
          meta:m.title,
          status:t.status,
          sourceId:t.id
        });
      });
    });

    /* Skip issue rows that are 1:1 sync mirrors of an active task/milestone already on the calendar. */
    safeIssues().forEach(function(i){
      if(!i.dueDate) return;
      var legacy = i.legacyMilestoneId ? String(i.legacyMilestoneId) : '';
      if(legacy && coveredLegacy[legacy]) return;
      out.push({
        date:iso(i.dueDate),
        type:'issue',
        title:i.summary||i.key||'Issue',
        meta:i.projectName||i.status||'Issue',
        status:i.status,
        sourceId:i.id
      });
    });

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
  function tip(ev){
    var parts = [ev.title, typeLabel(ev.type)];
    if(ev.meta) parts.push(ev.meta);
    if(ev.status) parts.push(ev.status);
    if(ev.date) parts.push(ev.date);
    return e(parts.filter(Boolean).join(' · '));
  }
  function chipHtml(ev){
    return '<div class="cal3-chip '+ev.type+'" title="'+tip(ev)+'">'+
      '<i data-lucide="'+typeIcon(ev.type)+'"></i>'+
      '<span>'+e(ev.title)+'</span>'+
    '</div>';
  }
  function upRowHtml(ev){
    var d=new Date(ev.date+'T00:00:00');
    return '<div class="cal3-uprow" title="'+tip(ev)+'">'+
      '<div class="cal3-date"><b>'+d.getDate()+'</b><span>'+d.toLocaleDateString(undefined,{month:'short'}).toUpperCase()+'</span></div>'+
      '<div class="cal3-upcopy"><strong>'+e(ev.title)+'</strong><span>'+e(ev.meta||typeLabel(ev.type))+'</span></div>'+
      '<i class="cal3-dot '+ev.type+'" aria-label="'+e(typeLabel(ev.type))+'"></i>'+
    '</div>';
  }

  function renderCalendar(){
    var host=ensureView(); if(!host)return;
    var all=collectEvents();
    var events=calendarType==='all'?all:all.filter(function(x){return x.type===calendarType;});
    var y=calendarMonth.getFullYear(),m=calendarMonth.getMonth();
    var first=new Date(y,m,1);
    var start=new Date(y,m,1-first.getDay());
    var cells=[];
    for(var i=0;i<42;i++){
      var d=new Date(start);d.setDate(start.getDate()+i);
      var key=d.toISOString().slice(0,10);
      var dayAll=events.filter(function(ev){return sameDay(ev.date,key);});
      var dayEvents=dayAll.slice(0,3);
      cells.push(
        '<div class="cal3-day '+(d.getMonth()===m?'':'outside')+(key===new Date().toISOString().slice(0,10)?' today':'')+'">'+
          '<span class="cal3-daynum">'+d.getDate()+'</span>'+
          '<div class="cal3-events">'+
            dayEvents.map(chipHtml).join('')+
            (dayAll.length>3?'<div class="cal3-more" title="'+e(dayAll.slice(3).map(function(x){return x.title;}).join(', '))+'">+'+(dayAll.length-3)+' more</div>':'')+
          '</div>'+
        '</div>'
      );
    }
    var today=new Date();today.setHours(0,0,0,0);
    var upcoming=events.filter(function(ev){return new Date(ev.date+'T00:00:00')>=today;}).slice(0,6);
    var counts={project:0,milestone:0,task:0,issue:0};all.forEach(function(x){if(counts[x.type]!=null)counts[x.type]++;});

    host.innerHTML=
      '<div class="cal3-head"><div><div class="cal3-eyebrow">Jaffer Brothers Group IT</div><h1>Calendar</h1>'+
      '<p>Stay in sync. View project milestones, tasks, issues and important delivery dates.</p></div>'+
      '<div class="cal3-actions"><select id="cal3Type" aria-label="Event type filter">'+
      '<option value="all">All Event Types</option><option value="project">Projects</option>'+
      '<option value="milestone">Milestones</option><option value="task">Tasks</option>'+
      '<option value="issue">Issues</option></select>'+
      '<button type="button" class="cal3-btn" id="cal3Today">Today</button>'+
      '<button type="button" class="cal3-icon" id="cal3Prev" aria-label="Previous month"><i data-lucide="chevron-left"></i></button>'+
      '<button type="button" class="cal3-icon" id="cal3Next" aria-label="Next month"><i data-lucide="chevron-right"></i></button>'+
      '</div></div>'+
      '<div class="cal3-layout"><section class="cal3-card cal3-main">'+
      '<div class="cal3-cardhead"><h2>'+e(formatMonth(calendarMonth))+'</h2>'+
      '<span>'+events.filter(function(ev){var d=new Date(ev.date+'T00:00:00');return d.getFullYear()===y&&d.getMonth()===m;}).length+' scheduled items</span></div>'+
      '<div class="cal3-week"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>'+
      '<div class="cal3-grid">'+cells.join('')+'</div></section>'+
      '<aside class="cal3-side"><section class="cal3-card"><div class="cal3-cardhead"><h2>Upcoming events</h2></div>'+
      '<div class="cal3-upcoming">'+(upcoming.length?upcoming.map(upRowHtml).join(''):'<div class="cal3-empty">No upcoming dated work.</div>')+'</div></section>'+
      '<section class="cal3-card"><div class="cal3-cardhead"><h2>Event types</h2></div><div class="cal3-types">'+
      Object.keys(counts).map(function(k){
        return '<button type="button" data-caltype="'+k+'"><span><i class="cal3-dot '+k+'"></i>'+typeLabel(k)+'</span><b>'+counts[k]+'</b></button>';
      }).join('')+
      '</div></section></aside></div>';

    var sel=document.getElementById('cal3Type');if(sel){sel.value=calendarType;sel.onchange=function(){calendarType=this.value;renderCalendar();};}
    var prev=document.getElementById('cal3Prev');if(prev)prev.onclick=function(){calendarMonth=new Date(y,m-1,1);renderCalendar();};
    var next=document.getElementById('cal3Next');if(next)next.onclick=function(){calendarMonth=new Date(y,m+1,1);renderCalendar();};
    var nowBtn=document.getElementById('cal3Today');if(nowBtn)nowBtn.onclick=function(){var n=new Date();calendarMonth=new Date(n.getFullYear(),n.getMonth(),1);renderCalendar();};
    host.querySelectorAll('[data-caltype]').forEach(function(b){b.onclick=function(){calendarType=this.getAttribute('data-caltype');renderCalendar();};});
    if(typeof refreshLucideIcons==='function')refreshLucideIcons();else if(window.lucide)window.lucide.createIcons();
  }

  function setShellHidden(hidden){
    ['dashboardView','kanbanView','projectsView','timelineView','issuesView','usersView','filterBar','kpis','ovPageHead','ovFilters','tasksView','issuesV3View','milestonesView','timelineV3View'].forEach(function(id){var el=document.getElementById(id);if(!el)return;if(hidden)el.classList.add('cal3-shell-hidden');else el.classList.remove('cal3-shell-hidden');});
    var actions=document.getElementById('pageActions');if(actions){if(hidden)actions.classList.add('cal3-shell-hidden');else actions.classList.remove('cal3-shell-hidden');}
    var foot=document.querySelector('#appContent>.foot');if(foot){if(hidden)foot.classList.add('cal3-shell-hidden');else foot.classList.remove('cal3-shell-hidden');}
  }

  window.showCalendarV3=function(){
    if(typeof hideTimelineV3==='function') hideTimelineV3();
    if(typeof hideTasksV3==='function') hideTasksV3();
    if(typeof hideIssuesV3==='function') hideIssuesV3();
    if(typeof hideMilestonesV3==='function') hideMilestonesV3();
    calendarVisible=true;
    document.body.classList.remove('view-dashboard');
    document.body.classList.remove('view-timeline');
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
