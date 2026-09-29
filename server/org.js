/** Company hierarchy, departments, teams, and access helpers. */

export const GLOBAL_ROLES = [
  'member',
  'head',
  'director',
  'admin',
];

/** Ranks for hierarchy checks (includes legacy keys still stored on old user rows). */
export const ROLE_RANK = {
  intern: 1,
  junior: 1,
  member: 2,
  senior: 2,
  manager: 3,
  head: 4,
  director: 5,
  admin: 6,
  // legacy
  viewer: 1,
  lead: 1,
  owner: 2,
  user: 1,
};

export const ACCESS_LEVELS = ['view', 'write'];

export const BUSINESS_DEPARTMENTS = [
  'Group IT',
  'P&C',
  'Finance',
  'Sales',
  'Marketing',
  'Operations',
  'Procurement',
  'Legal',
  'Admin',
  'Supply Chain',
];

export const TEAMS_BY_DEPARTMENT = {
  'Group IT': [
    'Development',
    'Infrastructure',
    'Networking',
    'Automation',
    'Digitization',
    'Documentation',
    'Website',
    'Security',
  ],
  'IT / GIT': [
    'Development',
    'Infrastructure',
    'Networking',
    'Automation',
    'Digitization',
    'Documentation',
    'Website',
    'Security',
  ],
  // HR / Finance sub-teams cleared — recreate from Users → Org settings
  "P&C": [],
  Finance: [],
};

/** HR department names that share portal sub-departments with another key. */
export function resolveTeamsDepartmentKey(department) {
  const key = String(department || '').trim();
  if (!key) return key;
  const lc = key.toLowerCase();
  if (lc === 'all' || lc === '*') return 'All';
  const aliases = {
    'group it': 'Group IT',
    'it / git': 'Group IT',
    git: 'Group IT',
    it: 'Group IT',
    'corporate people & culture': 'P&C',
    'people & culture': 'P&C',
    hr: 'P&C',
    'human resources': 'P&C',
    'corporate finance': 'Finance',
    'group supply chain': 'Supply Chain',
    'group administration': 'Admin',
  };
  return aliases[lc] || key;
}

export function teamsForDepartment(department) {
  const raw = String(department || '').trim();
  const key = resolveTeamsDepartmentKey(department);
  const GROUP_IT = [
    'Development',
    'Infrastructure',
    'Networking',
    'Automation',
    'Digitization',
    'Documentation',
    'Website',
    'Security',
  ];
  if (key === 'All') {
    const all = Object.values(TEAMS_BY_DEPARTMENT)
      .flat()
      .filter((t) => t && String(t).toLowerCase() !== 'general');
    return [...new Set(all.length ? all : GROUP_IT)];
  }
  const pick = (list) => {
    if (!Array.isArray(list) || !list.length) return null;
    const cleaned = list.filter((t) => t && String(t).toLowerCase() !== 'general');
    return cleaned.length ? cleaned : null;
  };
  // Prefer the live department name first so empty HR/Finance stubs do not win
  const list =
    pick(TEAMS_BY_DEPARTMENT[raw]) ||
    pick(TEAMS_BY_DEPARTMENT[key]) ||
    [];
  if (list.length) return list;
  if (key === 'Group IT' || key === 'IT / GIT') return GROUP_IT.slice();
  return [];
}

/** Parse stored team field: "All" or "Development, Website". */
export function parseTeams(team) {
  const raw = String(team || '').trim();
  if (!raw) return [];
  if (/^(all|\*)$/i.test(raw)) return ['All'];
  return [
    ...new Set(
      raw
        .split(/[,|;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => !/^general$/i.test(s))
    ),
  ];
}

export function formatTeams(teams) {
  const list = Array.isArray(teams) ? teams.filter(Boolean) : parseTeams(teams);
  if (!list.length) return '';
  if (list.some((t) => /^(all|\*)$/i.test(String(t)))) return 'All';
  return list.join(', ');
}

export function isAllTeamValue(team) {
  const raw = String(team || '').trim();
  if (!raw) return false;
  const list = parseTeams(team);
  return list.some((t) => /^(all|\*)$/i.test(String(t)));
}

export function teamsOverlap(a, b) {
  if (isAllTeamValue(a) || isAllTeamValue(b)) return true;
  const setA = new Set(parseTeams(a).map((t) => String(t).toLowerCase()));
  return parseTeams(b).some((t) => setA.has(String(t).toLowerCase()));
}

/** Map legacy portal roles → current hierarchy. Custom role keys pass through. */
export function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (!r) return 'member';
  // Removed roles → Member (individual)
  if (
    r === 'viewer' ||
    r === 'intern' ||
    r === 'lead' ||
    r === 'junior' ||
    r === 'senior' ||
    r === 'manager' ||
    r === 'owner' ||
    r === 'user'
  ) {
    return 'member';
  }
  return r;
}

/** Optional runtime ranks from org_config (admin-edited). */
let runtimeRanks = null;
let runtimeLabels = null;

export function setRuntimeOrgRoles(roles = []) {
  const ranks = { ...ROLE_RANK };
  const labels = {};
  for (const r of roles || []) {
    if (!r?.key) continue;
    const key = String(r.key).toLowerCase();
    ranks[key] = Number(r.rank) || ranks[key] || 1;
    labels[key] = String(r.label || key);
  }
  runtimeRanks = ranks;
  runtimeLabels = labels;
}

export function roleRank(role) {
  const key = normalizeRole(role);
  if (runtimeRanks && runtimeRanks[key] != null) return runtimeRanks[key];
  return ROLE_RANK[key] || 0;
}

export function roleLabel(role) {
  const n = normalizeRole(role);
  if (runtimeLabels && runtimeLabels[n]) return runtimeLabels[n];
  const map = {
    admin: 'Admin',
    director: 'Director',
    head: 'Head / Chief',
    member: 'Member',
    manager: 'Member',
    senior: 'Member',
    junior: 'Member',
    intern: 'Member',
    owner: 'Member',
    lead: 'Member',
    viewer: 'Member',
  };
  return map[n] || map[role] || role || '—';
}

export function normalizeAccessLevel(role, accessLevel) {
  // View/Write is available for every role (page-level can override further).
  const v = String(accessLevel || 'write').toLowerCase();
  return v === 'view' ? 'view' : 'write';
}

export function hasWriteAccess(user) {
  return normalizeAccessLevel(user?.role, user?.accessLevel || user?.access_level) === 'write';
}

/**
 * Portal Users management (department-scoped for non-admins).
 * Requires explicit pageAccess.users = write (admins always have it).
 */
export function canManageUsers(user) {
  const role = normalizeRole(user?.role);
  if (role === 'admin') return true;
  // Department Head/Director with Team=All can manage people in their department
  if (
    (role === 'head' || role === 'director') &&
    isAllTeamValue(user?.team || user?.teamName)
  ) {
    return true;
  }
  const raw = user?.pageAccess || user?.page_access;
  let map = raw;
  if (typeof raw === 'string') {
    try {
      map = JSON.parse(raw);
    } catch (_) {
      map = {};
    }
  }
  return String(map?.users || '').toLowerCase() === 'write';
}

/** View Users page (list) without edit — pageAccess.users = view|write */
export function canViewUsers(user) {
  if (canManageUsers(user)) return true;
  const role = normalizeRole(user?.role);
  if (role === 'admin') return true;
  const raw = user?.pageAccess || user?.page_access;
  let map = raw;
  if (typeof raw === 'string') {
    try {
      map = JSON.parse(raw);
    } catch (_) {
      map = {};
    }
  }
  const v = String(map?.users || '').toLowerCase();
  return v === 'view' || v === 'write';
}

/** Roles the actor is allowed to assign (strictly below self, except admin). */
export function assignableRolesFor(actor, roleKeys = null) {
  const keys = roleKeys?.length ? roleKeys : GLOBAL_ROLES;
  const role = normalizeRole(actor?.role);
  const myRank = roleRank(role);
  if (role === 'admin') return [...keys];
  return keys.filter((k) => {
    const key = normalizeRole(k);
    if (key === 'admin') return false;
    return roleRank(key) < myRank;
  });
}

export function canAssignRole(actor, targetRole, roleKeys = null) {
  const want = normalizeRole(targetRole);
  return assignableRolesFor(actor, roleKeys).includes(want);
}

export function normalizeDeptKey(department) {
  const lc = String(department || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!lc) return '';
  if (lc === 'all' || lc === '*') return 'all';
  const aliases = {
    'group it': 'it / git',
    'it / git': 'it / git',
    'it/git': 'it / git',
    git: 'it / git',
    it: 'it / git',
    'corporate people & culture': 'hr',
    'people & culture': 'hr',
    hr: 'hr',
    'corporate finance': 'finance',
    'group supply chain': 'supply chain',
    'group administration': 'admin',
  };
  return aliases[lc] || lc;
}

export function sameDept(a, b) {
  const x = normalizeDeptKey(a);
  const y = normalizeDeptKey(b);
  return Boolean(x && y && x === y);
}

export function sameTeam(a, b) {
  return teamsOverlap(a, b);
}

/** Whether target user is visible for assignment under actor's org scope. */
export function userInActorScope(actor, target) {
  if (!actor || !target) return false;
  if (actor.id && target.id && actor.id === target.id) return true;
  const aRole = normalizeRole(actor.role);
  if (aRole === 'admin' || aRole === 'director') return true;
  const tRole = normalizeRole(target.role);
  // Bosses / company-wide accounts must stay assignable for everyone
  if (tRole === 'admin' || tRole === 'director') return true;
  const aDept = String(actor.department || '').trim();
  const tDept = String(target.department || '').trim();
  if (!aDept || /^(all|\*)$/i.test(aDept)) return true;
  if (!tDept || /^(all|\*)$/i.test(tDept)) return false;
  if (!sameDept(aDept, tDept)) return false;
  if (aRole === 'head' || isAllTeamValue(actor.team || actor.teamName)) return true;
  // Same department: include people with no team yet (common for HR imports)
  const tTeam = target.team || target.teamName;
  if (!String(tTeam || '').trim() || /^general$/i.test(String(tTeam)) || isAllTeamValue(tTeam)) {
    return true;
  }
  return teamsOverlap(actor.team || actor.teamName, tTeam);
}

/**
 * Can actor create/edit this target user (by dept/team/role rules)?
 * target may be a draft { role, department, team }.
 */
export function canManageTargetUser(actor, target) {
  if (!actor || !target) return false;
  const aRole = normalizeRole(actor.role);
  const tRole = normalizeRole(target.role);
  const aRank = roleRank(aRole);
  const tRank = roleRank(tRole);

  if (aRole === 'admin') return true;
  if (tRole === 'admin' && aRole !== 'admin') return false;

  // Business unit lock for scoped managers
  const aBu = String(actor.businessUnit || actor.business_unit || '')
    .trim()
    .toUpperCase();
  const tBu = String(target.businessUnit || target.business_unit || '')
    .trim()
    .toUpperCase();
  if (aBu && aBu !== 'ALL' && aBu !== '*' && tBu && tBu !== 'ALL' && tBu !== '*') {
    if (tBu !== aBu) return false;
  }

  if (aRank >= roleRank('director') && aRole !== 'admin') {
    return tRole !== 'admin' && tRank < aRank;
  }

  if (aRank >= roleRank('head') && aRank < roleRank('director')) {
    if (!sameDept(actor.department, target.department)) return false;
    return tRank < aRank;
  }

  // Member with Users Write: manage members (and below) in same department / team
  if (canManageUsers(actor) && aRank >= roleRank('member') && aRank < roleRank('head')) {
    if (!sameDept(actor.department, target.department)) return false;
    if (tRole === 'admin' || tRole === 'director' || tRole === 'head') return false;
    if (tRank > aRank) return false;
    if (isAllTeamValue(actor.team || actor.teamName)) return true;
    const tTeam = target.team || target.teamName;
    if (!String(tTeam || '').trim() || isAllTeamValue(tTeam)) return true;
    return teamsOverlap(actor.team || actor.teamName, tTeam);
  }

  return false;
}

export function orgMeta() {
  return {
    roles: GLOBAL_ROLES,
    roleLabels: Object.fromEntries(GLOBAL_ROLES.map((r) => [r, roleLabel(r)])),
    accessLevels: ACCESS_LEVELS,
    departments: BUSINESS_DEPARTMENTS,
    teamsByDepartment: TEAMS_BY_DEPARTMENT,
  };
}
