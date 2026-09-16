(function(){
  'use strict';

  function e(v){return (v==null?'':String(v)).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});}
  function initials(name){
    var p=String(name||'').trim().split(/\s+/).filter(Boolean);
    return ((p[0]||'?')[0]+(p.length>1?p[p.length-1][0]:'')).toUpperCase();
  }
  function fmt(d){
    if(!d) return '—';
    try{return new Date(d+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});}catch(_){return d;}
  }
  function rel(d){
    if(!d) return '';
    var today=new Date(); today.setHours(0,0,0,0);
    var target=new Date(d+'T00:00:00');
    var n=Math.round((target-today)/86400000);
    if(n===0) return 'Today';
    if(n===1) return 'Tomorrow';
    if(n>1) return 'In '+n+' days';
    if(n===-1) return '1 day overdue';
    return Math.abs(n)+' days overdue';
  }
  function statusClass(s){
    s=String(s||'').toLowerCase();
    if(s.includes('complete')||s.includes('resolved')||s.includes('done')) return 'good';
    if(s.includes('risk')||s.includes('hold')||s.includes('progress')) return 'warn';
    if(s.includes('delay')||s.includes('block')||s.includes('overdue')) return 'bad';
    return 'neutral';
  }
  function progressBar(v){
    v=Math.max(0,Math.min(100,Number(v)||0));
    return '<div class="ov3-progress"><i style="width:'+v+'%"></i></div><span class="ov3-pct">'+v+'%</span>';
  }
  function getProjects(){return Array.isArray(window.data)?window.data:[];}
  function getIssues(){return Array.isArray(window.issuesList)?window.issuesList:[];}
  function getUsers(){return Array.isArray(window.usersList)?window.usersList:[];}

  function renderKpis(){
    var list=(typeof window.filtered==='function'?window.filtered():getProjects());
    var issues=getIssues();
    var users=getUsers();
    var activeRequests=issues.filter(function(i){return !/resolved|closed|done/i.test(i.status||'');}).length;
    var activeUsers=users.filter(function(u){return u.active!==false && u.isActive!==false;}).length;
    var activeProjects=list.filter(function(p){return !/completed/i.test(p.status||'');}).length;
    var host=document.getElementById('kpis');
    if(!host) return;
    host.className='kpis ov3-kpis';
    host.innerHTML=[
      ['folder-kanban','Total Projects',list.length,activeProjects+' active','blue'],
      ['ticket-check','Active IT Requests',activeRequests,issues.length?issues.length+' total requests':'No request data','amber'],
      ['activity','System Uptime','—','Monitoring not connected','green'],
      ['users','Team Members',activeUsers||users.length,users.length?(activeUsers||users.length)+' active users':'No user data','purple']
    ].map(function(k){return '<article class="ov3-kpi"><span class="ov3-kpi-icon '+k[4]+'"><i data-lucide="'+k[0]+'"></i></span><div><div class="ov3-kpi-label">'+k[1]+'</div><div class="ov3-kpi-value">'+k[2]+'</div><div class="ov3-kpi-sub">'+k[3]+'</div></div></article>';}).join('');
  }

  function dashboard(){
    var list=(typeof window.filtered==='function'?window.filtered():getProjects()).slice();
    var issues=getIssues();
    var users=getUsers();
    var host=document.getElementById('dashboardView');
    if(!host) return;

    var attn=[];
    list.forEach(function(p){
      if(/at risk|delayed|on hold/i.test(p.status||'')) attn.push({type:'Project',title:p.name,detail:p.status,priority:p.priority||'Medium',due:p.end||'',raw:p});
      (p.milestones||[]).forEach(function(m){
        var overdue=m.status!=='Completed' && m.due && new Date(m.due+'T00:00:00')<new Date(new Date().toDateString());
        if(overdue || /blocked/i.test(m.status||'')) attn.push({type:'Task',title:m.title,detail:p.name,priority:overdue?'High':'Medium',due:m.due||'',raw:m});
      });
    });
    issues.forEach(function(i){if(/high|critical/i.test(i.priority||'') && !/resolved|closed/i.test(i.status||'')) attn.push({type:'Issue',title:i.summary||i.key,detail:i.projectName||i.status||'',priority:i.priority||'High',due:i.dueDate||'',raw:i});});
    attn=attn.slice(0,6);

    var statusNames=['On Track','At Risk','Delayed','Completed'];
    var counts={}; statusNames.forEach(function(s){counts[s]=list.filter(function(p){return String(p.status||'')===s;}).length;});
    var total=list.length||1;
    var completion=Math.round((counts.Completed/total)*100);

    var deadlines=[];
    list.forEach(function(p){if(p.end) deadlines.push({date:p.end,title:p.name,meta:p.category||'Project'}); (p.milestones||[]).forEach(function(m){if(m.due && m.status!=='Completed') deadlines.push({date:m.due,title:m.title,meta:p.name});});});
    deadlines=deadlines.filter(function(x){return new Date(x.date+'T00:00:00')>=new Date(new Date().toDateString());}).sort(function(a,b){return a.date.localeCompare(b.date);}).slice(0,5);

    var people={};
    list.forEach(function(p){[p.owner,p.lead].filter(Boolean).forEach(function(n){if(!people[n]) people[n]={name:n,projects:0,done:0}; people[n].projects++; if(/completed/i.test(p.status||'')) people[n].done++;});});
    var workload=Object.values(people).sort(function(a,b){return b.projects-a.projects;}).slice(0,5);

    var activity=[];
    list.slice().sort(function(a,b){return String(b.end||b.start||'').localeCompare(String(a.end||a.start||''));}).slice(0,5).forEach(function(p){activity.push({who:p.lead||p.owner||'Project team',text:'updated '+p.name,when:p.status||'Project'});});
    issues.slice(0,2).forEach(function(i){activity.push({who:i.assigneeName||'IT team',text:'working on '+(i.summary||i.key),when:i.status||'Issue'});});
    activity=activity.slice(0,5);

    var attnRows=attn.length?attn.map(function(x){return '<tr><td><span class="ov3-type '+x.type.toLowerCase()+'">'+e(x.type)+'</span></td><td><strong>'+e(x.title)+'</strong></td><td>'+e(x.detail||'—')+'</td><td><span class="ov3-priority '+String(x.priority).toLowerCase()+'">'+e(x.priority)+'</span></td><td><span>'+fmt(x.due)+'</span><small>'+e(rel(x.due))+'</small></td></tr>';}).join(''):'<tr><td colspan="5" class="ov3-empty">Nothing currently needs urgent attention.</td></tr>';

    var healthRows=statusNames.map(function(s){var n=counts[s]||0; return '<div class="ov3-health-row"><span><i class="'+statusClass(s)+'"></i>'+s+'</span><b>'+n+'</b><em>'+Math.round(n/total*100)+'%</em></div>';}).join('');

    var deadlineRows=deadlines.length?deadlines.map(function(x){var d=new Date(x.date+'T00:00:00'); return '<div class="ov3-deadline"><div class="ov3-date"><b>'+d.getDate()+'</b><span>'+d.toLocaleDateString(undefined,{month:'short'}).toUpperCase()+'</span></div><div class="ov3-deadline-copy"><strong>'+e(x.title)+'</strong><span>'+e(x.meta)+'</span></div><span class="ov3-rel">'+e(rel(x.date))+'</span></div>';}).join(''):'<div class="ov3-empty">No upcoming deadlines.</div>';

    var projectRows=list.slice(0,7).map(function(p){return '<tr><td><strong>'+e(p.name)+'</strong><small>'+e(p.category||'Project')+'</small></td><td>'+e(p.category||'—')+'</td><td><span class="ov3-status '+statusClass(p.status)+'"><i></i>'+e(p.status||'—')+'</span></td><td><div class="ov3-progress-cell">'+progressBar(p.progress)+'</div></td><td>'+fmt(p.end)+'</td></tr>';}).join('')||'<tr><td colspan="5" class="ov3-empty">No projects found.</td></tr>';

    var activityRows=activity.length?activity.map(function(a){return '<div class="ov3-activity"><span class="ov3-avatar">'+e(initials(a.who))+'</span><div><strong>'+e(a.who)+'</strong><p>'+e(a.text)+'</p><small>'+e(a.when)+'</small></div></div>';}).join(''):'<div class="ov3-empty">No recent activity.</div>';

    var workloadRows=workload.length?workload.map(function(w){var pct=Math.min(100,Math.max(12,w.projects*22)); return '<div class="ov3-work"><span class="ov3-avatar">'+e(initials(w.name))+'</span><div><strong>'+e(w.name)+'</strong><small>'+w.projects+' active assignment'+(w.projects===1?'':'s')+'</small><div class="ov3-progress"><i style="width:'+pct+'%"></i></div></div><b>'+pct+'%</b></div>';}).join(''):'<div class="ov3-empty">No workload data.</div>';

    host.innerHTML='\
      <div class="ov3-grid-top">\
        <section class="ov3-card ov3-attention"><header><h2><span class="ov3-headicon red"><i data-lucide="triangle-alert"></i></span>Needs your attention</h2><span>'+attn.length+' items</span></header><div class="ov3-table-wrap"><table><thead><tr><th>Type</th><th>Item</th><th>Details</th><th>Priority</th><th>Due Date</th></tr></thead><tbody>'+attnRows+'</tbody></table></div></section>\
        <section class="ov3-card ov3-health"><header><h2><span class="ov3-headicon green"><i data-lucide="heart-pulse"></i></span>Portfolio health</h2></header><div class="ov3-health-main"><div class="ov3-donut" style="--pct:'+completion+'"><div><b>'+list.length+'</b><span>Projects</span></div></div><div class="ov3-health-list">'+healthRows+'</div></div><div class="ov3-health-note"><i data-lucide="circle-check"></i><span>'+counts['On Track']+' projects are on track.</span></div></section>\
        <section class="ov3-card ov3-deadlines"><header><h2><span class="ov3-headicon purple"><i data-lucide="calendar-clock"></i></span>Upcoming deadlines</h2><span>Next 30 days</span></header><div>'+deadlineRows+'</div></section>\
      </div>\
      <div class="ov3-grid-bottom">\
        <section class="ov3-card ov3-projects"><header><h2><span class="ov3-headicon blue"><i data-lucide="table-2"></i></span>Projects at a glance</h2><button type="button" onclick="setView(\'projects\')">View all projects <i data-lucide="arrow-right"></i></button></header><div class="ov3-table-wrap"><table><thead><tr><th>Project Name</th><th>Business Unit / Type</th><th>Status</th><th>Progress</th><th>Target Date</th></tr></thead><tbody>'+projectRows+'</tbody></table></div></section>\
        <section class="ov3-card"><header><h2><span class="ov3-headicon cyan"><i data-lucide="activity"></i></span>Recent activity</h2></header><div class="ov3-list">'+activityRows+'</div></section>\
        <section class="ov3-card"><header><h2><span class="ov3-headicon amber"><i data-lucide="users"></i></span>Team workload</h2></header><div class="ov3-list">'+workloadRows+'</div></section>\
      </div>';

    if(window.refreshLucideIcons) window.refreshLucideIcons();
  }

  function enhanceHeader(){
    var head=document.getElementById('ovPageHead');
    if(!head) return;
    var now=new Date();
    head.innerHTML='<div><div class="ov-eyebrow">Jaffer Brothers Group IT</div><h1>Overview</h1><p class="ov-sub">People. Projects. Progress. A smarter, more connected Jaffer Brothers.</p></div><div class="ov-head-right"><strong>'+now.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})+'</strong><span>Portfolio command centre</span></div>';
  }

  var originalRenderKpis=window.renderKPIs;
  var originalRenderDashboard=window.renderDashboard;
  window.renderKPIs=function(){
    if(window.view==='dashboard') return renderKpis();
    if(typeof originalRenderKpis==='function') return originalRenderKpis.apply(this,arguments);
  };
  window.renderDashboard=function(){ enhanceHeader(); renderKpis(); dashboard(); };

  function refresh(){
    if(window.view==='dashboard'){
      enhanceHeader();
      renderKpis();
      dashboard();
    }
  }
  window.addEventListener('load',function(){setTimeout(refresh,120);setTimeout(refresh,900);});
  document.addEventListener('visibilitychange',function(){if(!document.hidden) refresh();});
})();