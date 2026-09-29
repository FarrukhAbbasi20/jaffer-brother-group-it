/* Client mirror of server/org.js — Group IT hierarchy + portal roles. */
(function (root) {
  'use strict';

  var GLOBAL_ROLES = ['member', 'head', 'director', 'admin'];

  var DEPARTMENTS = [
    'Group IT',
    'Group Administration',
    'P&C',
    'Finance',
    'Sales',
    'Marketing',
    'Operations',
    'Procurement',
    'Legal',
    'Admin',
    'Supply Chain'
  ];

  var GROUP_IT_TEAMS = [
    'Development', 'Infrastructure', 'Networking', 'Automation',
    'Digitization', 'Documentation', 'Website', 'Security'
  ];

  var DEPARTMENT_TEAMS = {
    'Group IT': GROUP_IT_TEAMS.slice(),
    'IT / GIT': GROUP_IT_TEAMS.slice(),: [],
    'Group Administration': [],
    "P&C": [],
    Finance: [],
    Sales: [],
    Marketing: [],
    Operations: [],
    Procurement: [],
    Legal: [],
    Admin: [],
    'Supply Chain': []
  };

  function normalizeDepartment(raw) {
    var s = String(raw || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!s) return 'Group IT';
    var lc = s.toLowerCase();
    if (lc === 'all' || lc === '*') return 'All';
    if (lc === 'git' || lc === 'it' || /^it\s*\/?\s*git$/i.test(s) || /^group\s*it$/i.test(s)) {
      return 'Group IT';
    }
    // HR roster aliases (same keys as server/org.js)
    if (/corporate people\s*&\s*culture|people\s*&\s*culture|^hr$|human resource/i.test(s)) return 'Corporate People & Culture';
    if (/group administration|^admin$/i.test(s)) return 'Group Administration';
    if (/corporate finance|^finance$/i.test(s)) return 'Finance';
    if (/group supply chain|^supply chain$/i.test(s)) return 'Supply Chain';
    for (var i = 0; i < DEPARTMENTS.length; i++) {
      if (DEPARTMENTS[i].toLowerCase() === lc) return DEPARTMENTS[i];
    }
    return s;
  }

  function teamsForDepartment(dept) {
    var key = normalizeDepartment(dept);
    if (key === 'Group IT' || key === 'IT / GIT') return GROUP_IT_TEAMS.slice();
    var list = DEPARTMENT_TEAMS[key];
    if (Array.isArray(list) && list.length) {
      return list.filter(function (t) { return t && String(t).toLowerCase() !== 'general'; });
    }
    return [];
  }

  function normalizeTeam(dept, team) {
    var options = teamsForDepartment(dept);
    var t = String(team || '').trim();
    if (/^(all|\*)$/i.test(t)) return 'All';
    for (var i = 0; i < options.length; i++) {
      if (options[i].toLowerCase() === t.toLowerCase()) return options[i];
    }
    return options[0] || '';
  }

  function normalizeRole(role) {
    var r = String(role || '').trim().toLowerCase();
    if (!r) return 'member';
    if (
      r === 'viewer' || r === 'intern' || r === 'lead' || r === 'junior' ||
      r === 'senior' || r === 'manager' || r === 'owner' || r === 'user'
    ) {
      return 'member';
    }
    return r;
  }

  function normalizeAccessLevel(role, accessLevel) {
    var r = normalizeRole(role);
    if (r === 'admin' || r === 'director' || r === 'head') return 'write';
    return String(accessLevel || '').toLowerCase() === 'view' ? 'view' : 'write';
  }

  function accessLabel(role, accessLevel) {
    var r = normalizeRole(role);
    if (r === 'admin') return { key: 'full', label: 'Full Access' };
    if (r === 'director' || r === 'head') return { key: 'elevated', label: 'Elevated' };
    if (normalizeAccessLevel(r, accessLevel) === 'view') {
      return { key: 'limited', label: 'Limited' };
    }
    return { key: 'standard', label: 'Standard' };
  }

  function roleLabel(role) {
    var n = normalizeRole(role);
    return ({
      admin: 'Admin',
      director: 'Director',
      head: 'Head / Chief',
      member: 'Member'
    })[n] || String(role || 'Member');
  }

  /** Apply live org-meta from /api/users/org-meta when available. */
  function applyOrgMeta(meta) {
    if (!meta || typeof meta !== 'object') return;
    if (Array.isArray(meta.departments) && meta.departments.length) {
      DEPARTMENTS.length = 0;
      meta.departments.forEach(function (d) {
        var label = String(d || '').trim();
        if (!label) return;
        if (/^it\s*\/\s*git$/i.test(label)) label = 'Group IT';
        if (DEPARTMENTS.indexOf(label) === -1) DEPARTMENTS.push(label);
      });
      if (DEPARTMENTS.indexOf('Group IT') === -1) DEPARTMENTS.unshift('Group IT');
    }
    if (meta.teamsByDepartment && typeof meta.teamsByDepartment === 'object') {
      Object.keys(meta.teamsByDepartment).forEach(function (key) {
        var list = meta.teamsByDepartment[key];
        if (!Array.isArray(list)) return;
        var cleaned = list.map(function (t) { return String(t || '').trim(); }).filter(Boolean)
          .filter(function (t) { return t.toLowerCase() !== 'general'; });
        DEPARTMENT_TEAMS[key] = cleaned;
        if (/^(group\s*it|it\s*\/\s*git)$/i.test(key)) {
          DEPARTMENT_TEAMS['Group IT'] = cleaned.slice();
          DEPARTMENT_TEAMS['IT / GIT'] = cleaned.slice();
        }
      });
    }
  }

  root.ORG_HIERARCHY = {
    GLOBAL_ROLES: GLOBAL_ROLES,
    DEPARTMENTS: DEPARTMENTS,
    DEPARTMENT_TEAMS: DEPARTMENT_TEAMS,
    normalizeDepartment: normalizeDepartment,
    teamsForDepartment: teamsForDepartment,
    normalizeTeam: normalizeTeam,
    normalizeRole: normalizeRole,
    normalizeAccessLevel: normalizeAccessLevel,
    accessLabel: accessLabel,
    roleLabel: roleLabel,
    applyOrgMeta: applyOrgMeta
  };
})(window);
