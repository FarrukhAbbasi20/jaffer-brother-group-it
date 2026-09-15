(function(){
  'use strict';
  function e(v){return (v==null?'':String(v)).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});}
  function initials(name){var p=String(name||'').trim().split(/\s+/).filter(Boolean);return ((p[0]||'?')[0]+(p.length>1?p[p.length-1][0]:'')).toUpperCase();}
  function fmt(d){if(!d)return '—';try{return new Date(d+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});}catch(_){return d;}}
  function rel(d){if(!d)return '';var today=new Date();today.setHours(0,0,0,0);var target=new Date(d+'T00:00:00');var n=Math.round((target-today)/86400000);if(n===0)return'Today';if(n===1)return'In 1 day';if(n>1)return'In '+n+' days';if(n===-1)return'1 day overdue';return Math.abs(n)+' days overdue';}
  function statusClass(s){s=String(s||'').toLowerCase();if(s.includes('complete')||s.includes('resolved')||s.includes('done')||s.includes('track'))return'good';if(s.includes('risk')||s.includes('hold')||s.includes('progress'))return'warn';if(s.includes('delay')||s.includes('block')||s.includes('overdue'))return'bad';return'neutral';}
  function progressBar(v){v=Math.max(0,Math.min(100,Number(v)||0));return '<span class="ov3-pct">'+v+'%</span><div class="ov3-progress"><i style="width:'+v+'%"></i></div>';}
  function projects(){try{return Array.isArray(data)?data:[];}catch(_){return [];}}
  function issues(){try{return Array.isArray(issuesList)?issuesList:[];}catch(_){return [];}}
  function users(){try{return Array.isArray(usersList)?usersList:[];}catch(_){return [];}}
  function currentFiltered(){try{return typeof filtered==='function'?filtered():projects();}catch(_){return projects();}}
  function isOverview(){var d=document.getElementById('dashboardView');return !!(d&&!d.classList.contains('hidden'));}

  function syncOverviewBody(){
    if(isOverview()){
      document.body.classList.add('view-dashboard');
      ['view-projects','view-kanban','view-issues','view-timeline','view-users'].forEach(function(c){document.body.classList.remove(c);});
    }
  }

  function enhanceChrome(){
    var brand=document.querySelector('.sidebar-brand');
    if(brand){brand.innerHTML='<img class="ov3-brand-lockup" src="/assets/jaffer-logo.png" alt="Jaffer Brothers Group IT">';}
    var search=document.querySelector('.topbar-search span');if(search)search.textContent='Search projects, people, assets, or anything...';
    var notif=document.getElementById('btnNotifs');if(notif&&!notif.querySelector('.ov3-notif-badge'))notif.insertAdjacentHTML('beforeend','<span class="ov3-notif-badge">3</span>');
    var theme=document.getElementById('themeToggle');if(theme)theme.classList.add('ov3-theme-hidden');

    var nav=document.getElementById('sidebarNav');
    if(nav&&!nav.dataset.ov3){
      nav.dataset.ov3='1';
      nav.innerHTML='\
        <button type="button" class="nav-item on" id="tabDashboard" data-view="dashboard" onclick="setView(\'dashboard\')"><span class="nav-ico"><i data-lucide="house"></i></span><span class="nav-label">Overview</span></button>\
        <button type="button" class="nav-item" id="tabProjects" data-view="projects" onclick="setView(\'projects\')"><span class="nav-ico"><i data-lucide="folder-kanban"></i></span><span class="nav-label">Projects</span></button>\
        <button type="button" class="nav-item" onclick="setView(\'issues\')"><span class="nav-ico"><i data-lucide="briefcase-business"></i></span><span class="nav-label">IT Services</span></button>\
        <button type="button" class="nav-item ov3-static"><span class="nav-ico"><i data-lucide="server"></i></span><span class="nav-label">Assets &amp; Inventory</span></button>\
        <button type="button" class="nav-item" id="ov3PeopleNav" onclick="if(typeof uiCan===\'function\'&&uiCan(\'manage_users\'))setView(\'users\')"><span class="nav-ico"><i data-lucide="users"></i></span><span class="nav-label">People &amp; Teams</span></button>\
        <button type="button" class="nav-item ov3-static"><span class="nav-ico"><i data-lucide="clipboard-list"></i></span><span class="nav-label">Finance &amp; Procurement</span></button>\
        <button type="button" class="nav-item" onclick="exportExcel()"><span class="nav-ico"><i data-lucide="chart-no-axes-combined"></i></span><span class="nav-label">Reports &amp; Analytics</span></button>\
        <div class="ov3-nav-sep"></div><div class="ov3-nav-label">TOOLS</div>\
        <button type="button" class="nav-item" onclick="setView(\'issues\')"><span class="nav-ico"><i data-lucide="badge-help"></i></span><span class="nav-label">Service Desk</span></button>\
        <button type="button" class="nav-item ov3-static"><span class="nav-ico"><i data-lucide="book-open"></i></span><span class="nav-label">Knowledge Base</span></button>\
        <button type="button" class="nav-item ov3-static"><span class="nav-ico"><i data-lucide="file-search"></i></span><span class="nav-label">Policies &amp; Compliance</span></button>\
        <button type="button" class="nav-item" onclick="setView(\'issues\')"><span class="nav-ico"><i data-lucide="messages-square"></i></span><span class="nav-label">Requests</span></button>\
        <button type="button" class="nav-item ov3-static"><span class="nav-ico"><i data-lucide="shield-check"></i></span><span class="nav-label">System Health</span></button>\
        <div class="ov3-nav-sep"></div><div class="ov3-nav-label">ADMINISTRATION</div>\
        <button type="button" class="nav-item ov3-static"><span class="nav-ico"><i data-lucide="settings"></i></span><span class="nav-label">Settings</span></button>\
        <button type="button" class="nav-item ov3-static"><span class="nav-ico"><i data-lucide="workflow"></i></span><span class="nav-label">Integrations</span></button>\
        <button type="button" class="nav-item ov3-static"><span class="nav-ico"><i data-lucide="notebook-tabs"></i></span><span class="nav-label">Audit Logs</span></button>';
    }
    var promo=document.querySelector('.sidebar-promo');
    if(promo)promo.innerHTML='<div class="promo-copy"><strong>Building</strong><strong>A Smarter</strong><strong>Tomorrow</strong><span class="promo-arrow">→</span></div>';
  }

  function renderHeader(){
    var head=document.getElementById('ovPageHead');if(!head)return;
    var now=new Date(),name='';try{name=currentUser&&currentUser.name?currentUser.name.split(/\s+/)[0]:'';}catch(_){name='';}
    head.hidden=false;head.classList.remove('hidden');
    head.innerHTML='<div class="ov3-titleblock"><div class="ov3-eyebrow">Jaffer Brothers Group IT</div><h1>Overview</h1><p>People. Projects. Progress. A smarter, more connected Jaffer Brothers.</p></div><div class="ov3-greeting"><span class="ov3-greeting-date"><i data-lucide="calendar-days"></i>'+e(now.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short',year:'numeric'}))+'</span><strong>'+e((function(){var h=now.getHours();return h<12?'Good morning':h<17?'Good afternoon':'Good evening';})()+(name?', '+name+'!':''))+'</strong></div>';
  }

  function renderFilters(){
    var host=document.getElementById('ovFilters');if(!host)return;
    host.hidden=false;host.classList.remove('hidden');
    var cats=[];projects().forEach(function(p){if(p.category&&!cats.includes(p.category))cats.push(p.category);});cats.sort();
    host.innerHTML='<select id="ov3Business"><option>All Business Units</option></select><select id="ov3Type"><option value="">All Project Types</option>'+cats.map(function(c){return '<option value="'+e(c)+'">'+e(c)+'</option>';}).join('')+'</select><select id="ov3Range"><option>Last 30 Days</option><option>Last 90 Days</option><option>This Year</option><option>All Time</option></select>';
    var type=host.querySelector('#ov3Type');if(type)type.addEventListener('change',function(){var legacy=document.getElementById('fCat');if(legacy){legacy.value=this.value;try{render();}catch(_){}}});
  }

  function renderKpis(){
    var list=currentFiltered(),iss=issues(),us=users();
    var activeRequests=iss.length?iss.filter(function(i){return !/resolved|closed|done/i.test(i.status||'');}).length:'—';
    var people=new Set();list.forEach(function(p){if(p.owner)people.add(p.owner);if(p.lead)people.add(p.lead);});
    var activeUsers=us.length?us.filter(function(u){return u.isActive!==false&&u.active!==false;}).length:people.size;
    var planning=list.filter(function(p){return /not started|planning/i.test(p.status||'');}).length;
    var inprogress=list.filter(function(p){return !/completed|not started/i.test(p.status||'');}).length;
    var host=document.getElementById('kpis');if(!host)return;host.className='kpis ov3-kpis';host.style.display='grid';
    host.innerHTML=[
      ['layers-3','Total Projects',list.length,planning+' in planning  ·  '+inprogress+' in progress','red'],
      ['users-round','Active IT Requests',activeRequests,iss.length?Math.max(0,iss.length-(Number(activeRequests)||0))+' resolved  ·  '+activeRequests+' active':'Requests data','blue'],
      ['shield-check','System Uptime','—','Monitoring not connected','green'],
      ['users','Team Members',activeUsers,'Across Group IT','purple']
    ].map(function(k){return '<article class="ov3-kpi"><span class="ov3-kpi-icon '+k[4]+'"><i data-lucide="'+k[0]+'"></i></span><div class="ov3-kpi-copy"><div class="ov3-kpi-label">'+k[1]+'</div><div class="ov3-kpi-value">'+k[2]+'</div><div class="ov3-kpi-sub">'+k[3]+'</div></div></article>';}).join('');
  }

  function dashboard(){
    var list=currentFiltered().slice(),iss=issues(),host=document.getElementById('dashboardView');if(!host)return;
    var attn=[];list.forEach(function(p){if(/at risk|delayed|on hold/i.test(p.status||''))attn.push({type:'Project',icon:'flag',title:p.name,detail:p.status,priority:p.priority||'Medium',due:p.end||''});(p.milestones||[]).forEach(function(m){var overdue=m.status!=='Completed'&&m.due&&new Date(m.due+'T00:00:00')<new Date(new Date().toDateString());if(overdue||/blocked/i.test(m.status||''))attn.push({type:'Task',icon:'file-text',title:m.title,detail:p.name,priority:overdue?'High':'Medium',due:m.due||''});});});
    iss.forEach(function(i){if(/high|critical/i.test(i.priority||'')&&!/resolved|closed/i.test(i.status||''))attn.push({type:'Issue',icon:'triangle-alert',title:i.summary||i.key,detail:i.projectName||i.status||'',priority:i.priority||'High',due:i.dueDate||''});});attn=attn.slice(0,5);
    var statuses=['On Track','At Risk','Delayed','Completed'],counts={};statuses.forEach(function(s){counts[s]=list.filter(function(p){return String(p.status||'')===s;}).length;});var total=list.length||1;
    var deadlines=[];list.forEach(function(p){if(p.end)deadlines.push({date:p.end,title:p.name,meta:p.category||'Project'});(p.milestones||[]).forEach(function(m){if(m.due&&m.status!=='Completed')deadlines.push({date:m.due,title:m.title,meta:p.name});});});deadlines=deadlines.filter(function(x){return new Date(x.date+'T00:00:00')>=new Date(new Date().toDateString());}).sort(function(a,b){return a.date.localeCompare(b.date);}).slice(0,5);
    var people={};list.forEach(function(p){[p.owner,p.lead].filter(Boolean).forEach(function(n){if(!people[n])people[n]={name:n,projects:0};people[n].projects++;});});var workload=Object.values(people).sort(function(a,b){return b.projects-a.projects;}).slice(0,5);
    var activity=[];list.slice().sort(function(a,b){return String(b.end||b.start||'').localeCompare(String(a.end||a.start||''));}).slice(0,5).forEach(function(p){activity.push({who:p.lead||p.owner||'Project team',text:'updated project status',meta:p.name});});
    var attnRows=attn.length?attn.map(function(x){return '<tr><td><span class="ov3-typeicon '+x.type.toLowerCase()+'"><i data-lucide="'+x.icon+'"></i></span></td><td><strong>'+e(x.title)+'</strong></td><td>'+e(x.detail||'—')+'</td><td><span class="ov3-priority '+String(x.priority).toLowerCase()+'">'+e(x.priority)+'</span></td><td><span class="ov3-due '+(rel(x.due).includes('overdue')?'late':'')+'">'+fmt(x.due)+'</span></td></tr>';}).join(''):'<tr><td colspan="5" class="ov3-empty">Nothing currently needs urgent attention.</td></tr>';
    var healthRows=statuses.map(function(s){var n=counts[s]||0;return '<div class="ov3-health-row"><span><i class="'+statusClass(s)+'"></i>'+s+'</span><b>'+n+'</b><em>'+Math.round(n/total*100)+'%</em></div>';}).join('');
    var deadlineRows=deadlines.length?deadlines.map(function(x){var d=new Date(x.date+'T00:00:00');return '<div class="ov3-deadline"><div class="ov3-date"><b>'+d.getDate()+'</b><span>'+d.toLocaleDateString(undefined,{month:'short'}).toUpperCase()+'</span></div><div class="ov3-deadline-copy"><strong>'+e(x.title)+'</strong><span>'+e(x.meta)+'</span></div><span class="ov3-rel">'+e(rel(x.date))+'</span></div>';}).join(''):'<div class="ov3-empty">No upcoming deadlines.</div>';
    var projectRows=list.slice(0,5).map(function(p){return '<tr><td><strong>'+e(p.name)+'</strong></td><td>'+e(p.category||'—')+'</td><td><span class="ov3-status '+statusClass(p.status)+'">'+e(p.status||'—')+'</span></td><td><div class="ov3-progress-cell">'+progressBar(p.progress)+'</div></td><td>'+fmt(p.end)+'</td></tr>';}).join('')||'<tr><td colspan="5" class="ov3-empty">No projects found.</td></tr>';
    var activityRows=activity.length?activity.map(function(a,i){return '<div class="ov3-activity"><span class="ov3-activity-dot '+(i%3===0?'green':'blue')+'"></span><span class="ov3-avatar">'+e(initials(a.who))+'</span><div><p><strong>'+e(a.who)+'</strong> '+e(a.text)+'</p><small>'+e(a.meta)+'</small></div><time>'+((i+1)*2)+'h ago</time></div>';}).join(''):'<div class="ov3-empty">No recent activity.</div>';
    var workloadRows=workload.length?workload.map(function(w,i){var pct=[85,62,48,71,39][i]||Math.min(100,Math.max(15,w.projects*18));return '<div class="ov3-work"><span class="ov3-avatar">'+e(initials(w.name))+'</span><div><strong>'+e(w.name)+'</strong><small>'+w.projects+' active assignments</small></div><div class="ov3-workbar"><i style="width:'+pct+'%"></i></div><b>'+pct+'%</b></div>';}).join(''):'<div class="ov3-empty">No workload data.</div>';
    host.innerHTML='<div class="ov3-grid-top"><section class="ov3-card ov3-attention"><header><h2><span class="ov3-headicon red"><i data-lucide="bell"></i></span>Needs your attention</h2><button type="button">View all ('+attn.length+')</button></header><div class="ov3-table-wrap"><table><thead><tr><th>Type</th><th>Item</th><th>Details</th><th>Priority</th><th>Due Date</th></tr></thead><tbody>'+attnRows+'</tbody></table></div></section><section class="ov3-card ov3-health"><header><h2><span class="ov3-headicon green"><i data-lucide="chart-no-axes-column-increasing"></i></span>Portfolio health</h2><button type="button">View details</button></header><div class="ov3-health-main"><div class="ov3-donut"><div><b>'+list.length+'</b><span>Projects</span></div></div><div class="ov3-health-list">'+healthRows+'</div></div><div class="ov3-health-note"><span class="ov3-check"><i data-lucide="check"></i></span><div><strong>Overall portfolio is healthy</strong><small>~'+Math.round((counts['On Track']/total)*100)+'% of projects are on track</small></div></div></section><section class="ov3-card ov3-deadlines"><header><h2><span class="ov3-headicon red"><i data-lucide="calendar-days"></i></span>Upcoming deadlines</h2><button type="button">View all</button></header><div>'+deadlineRows+'</div></section></div><div class="ov3-grid-bottom"><section class="ov3-card ov3-projects"><header><h2><span class="ov3-headicon blue"><i data-lucide="grid-2x2"></i></span>Projects at a glance</h2><button type="button" onclick="setView(\'projects\')">View all projects</button></header><div class="ov3-table-wrap"><table><thead><tr><th>Project Name</th><th>Business Unit</th><th>Status</th><th>Progress</th><th>Target Date</th></tr></thead><tbody>'+projectRows+'</tbody></table></div></section><section class="ov3-card"><header><h2><span class="ov3-headicon blue"><i data-lucide="activity"></i></span>Recent activity</h2><button type="button">View all</button></header><div class="ov3-list">'+activityRows+'</div></section><section class="ov3-card"><header><h2><span class="ov3-headicon blue"><i data-lucide="users"></i></span>Team workload</h2><button type="button">View team</button></header><div class="ov3-list">'+workloadRows+'</div></section></div>';
    try{refreshLucideIcons();}catch(_){if(window.lucide)window.lucide.createIcons();}
  }

  function renderAll(){
    if(!isOverview())return;
    syncOverviewBody();enhanceChrome();
    var legacy=document.getElementById('filterBar');if(legacy)legacy.style.setProperty('display','none','important');
    renderHeader();renderFilters();renderKpis();dashboard();
    try{refreshLucideIcons();}catch(_){if(window.lucide)window.lucide.createIcons();}
  }

  try{var oldDashboard=renderDashboard;renderDashboard=function(){renderAll();};var oldKpis=renderKPIs;renderKPIs=function(){if(isOverview())return renderKpis();return oldKpis.apply(this,arguments);};}catch(_){ }
  window.addEventListener('load',function(){setTimeout(renderAll,40);setTimeout(renderAll,450);setTimeout(renderAll,1300);});
  var mo=new MutationObserver(function(){if(isOverview())requestAnimationFrame(renderAll);});mo.observe(document.body,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)renderAll();});
})();