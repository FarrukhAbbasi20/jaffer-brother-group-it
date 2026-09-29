/**
 * Multi-department / multi-sub-team rules for portal users — one place, no SQL.
 *
 * Storage (no new columns):
 *   users.department  "P&C, Group IT"      several departments, comma separated
 *                     "All"               every department, now and in future
 *   users.team        "Development, Security"   specific sub-teams
 *                     "*"                 all sub-teams of the user's departments
 *                     "P&C, Development"   a department's own name used as a sub-team means
 *                                         "the whole of that department" (only honoured when
 *                                         the user belongs to that department)
 *                     ""                  none -> assigned work only
 *
 * What a non-admin user can see:
 *   All departments + all sub-teams          -> everything
 *   departments + "*"                        -> those whole departments
 *   specific sub-teams (+ whole-dept names)  -> exactly those
 *   no sub-team                              -> only work assigned to them
 */
import { departmentAliases } from './org-store.js';

const ALL_RE = /^(all|\*)$/i;
export const ALL_DEPARTMENTS = 'All';
export const ALL_TEAMS = '*';
export const MAX_ORG_FIELD = 512;

export function normTag(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

export function isAllToken(s) {
  return ALL_RE.test(String(s == null ? '' : s).trim());
}

/** "a, b;c" | ["a","b"] -> ["a","b","c"] (trimmed, case-insensitive de-dupe, order kept). */
export function parseList(value) {
  const raw = Array.isArray(value) ? value : String(value == null ? '' : value).split(/[,;]+/);
  const out = [];
  for (const item of raw) {
    const s = String(item == null ? '' : item).trim().replace(/\s+/g, ' ');
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}

function splitAll(value) {
  const tokens = parseList(value);
  const all = tokens.some(isAllToken);
  return { all, list: all ? [] : tokens };
}

export function userDepartments(user) {
  return splitAll(user?.department);
}

export function userTeams(user) {
  return splitAll(user?.team);
}

function sameDepartment(a, b) {
  const na = normTag(a);
  if (!na) return false;
  return departmentAliases(b).some((alias) => normTag(alias) === na);
}

/**
 * Sub-teams configured for a department. Exact name or a known alias only —
 * deliberately NOT the loose /it|git/ match, which also hits "Audit" or "Facilities".
 */
export function strictTeamsFor(config, department) {
  const map = config?.teamsByDepartment || {};
  const out = [];
  for (const [key, teams] of Object.entries(map)) {
    if (!Array.isArray(teams) || !sameDepartment(key, department)) continue;
    for (const t of teams) {
      const s = String(t || '').trim();
      if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
    }
  }
  return out;
}

/** Company-wide view? */
export function canSeeAllWork(user) {
  if (user?.role === 'admin') return true;
  const d = userDepartments(user);
  const t = userTeams(user);
  // Any specific department or sub-team scopes the user to it.
  if (d.list.length || t.list.length) return false;
  // Explicit "All departments" + "All sub-teams" is company-wide for any role.
  if (d.all && t.all) return true;
  // Unchanged fallback: a Manager with nothing specific set stays company-wide.
  return user?.role === 'manager';
}

/** Tags (lower-case) that make a project visible to a scoped user; null = assigned work only. */
export function userScopeTags(user, orgConfig) {
  const d = userDepartments(user);
  const t = userTeams(user);
  const tags = new Set();

  const addWholeDepartment = (name) => {
    for (const alias of departmentAliases(name)) tags.add(normTag(alias));
    for (const team of strictTeamsFor(orgConfig, name)) tags.add(normTag(team));
  };

  if (t.all) {
    if (!d.list.length) return null; // "all sub-teams" with no department grants nothing by itself
    d.list.forEach(addWholeDepartment);
  } else if (t.list.length) {
    const knownDepts = d.all ? (Array.isArray(orgConfig?.departments) ? orgConfig.departments : []) : d.list;
    for (const token of t.list) {
      const whole = knownDepts.find((dept) => sameDepartment(token, dept));
      if (whole) addWholeDepartment(whole);
      else tags.add(normTag(token));
    }
  } else {
    return null;
  }

  tags.delete('');
  return tags.size ? tags : null;
}

/**
 * Which users a department Manager may manage. null = everyone
 * (Admins, and Managers with no specific department).
 */
export function managerScope(user) {
  // Any non-admin who manages people is limited to their own departments / sub-teams.
  if (!user || user.role === 'admin') return null;
  const d = userDepartments(user);
  if (!d.list.length) return null;
  const t = userTeams(user);
  const wholeDepts = t.list.filter((tok) => d.list.some((dept) => sameDepartment(tok, dept)));
  const teamNames = t.list.filter((tok) => !wholeDepts.includes(tok));
  return {
    deptNames: d.list,
    allTeams: t.all || !t.list.length,
    teamNames,
    wholeDepts,
    lockedTeams: t.list, // what a team-locked manager may hand out
  };
}

export function userInManagerScope(scope, target) {
  if (!scope) return true;
  const td = userDepartments(target);
  const shared = td.list.filter((x) => scope.deptNames.some((dept) => sameDepartment(x, dept)));
  if (!shared.length) return false;
  if (scope.allTeams) return true;
  if (shared.some((x) => scope.wholeDepts.some((w) => sameDepartment(x, w)))) return true;
  const tt = userTeams(target);
  return tt.list.some((x) => scope.teamNames.some((y) => normTag(x) === normTag(y)));
}

/**
 * Clean what the Users form sends into the two stored strings.
 *  - unknown sub-teams are dropped (except ones the user already had — never lose data on edit)
 *  - a scoped Manager can only hand out their own departments / sub-teams
 */
export function normalizeOrgAssignment({
  config,
  departments,
  teams,
  scope = null,
  existingTeams = [],
  fallbackDepartments = [],
  cleanDepartmentName = (x) => x,
}) {
  let deptTokens = parseList(departments);
  let allDepts = deptTokens.some(isAllToken);
  let deptList = allDepts ? [] : parseList(deptTokens.map((x) => cleanDepartmentName(x) || x));

  if (scope) {
    allDepts = false;
    deptList = deptList.filter((x) => scope.deptNames.some((dept) => sameDepartment(x, dept)));
    if (!deptList.length) deptList = scope.deptNames.slice();
  }
  if (!allDepts && !deptList.length) deptList = parseList(fallbackDepartments);

  const teamTokens = parseList(teams);
  let allTeams = teamTokens.some(isAllToken);
  let teamList = [];
  if (!allTeams) {
    const deptPool = allDepts ? (Array.isArray(config?.departments) ? config.departments : []) : deptList;
    const allowed = [];
    deptPool.forEach((dept) => {
      allowed.push(dept);
      strictTeamsFor(config, dept).forEach((tn) => allowed.push(tn));
    });
    const kept = parseList(existingTeams);
    teamList = teamTokens
      .map((tok) => {
        const hit = allowed.find((a) => normTag(a) === normTag(tok) || sameDepartment(tok, a));
        if (hit) return hit;
        return kept.find((k) => normTag(k) === normTag(tok)) || '';
      })
      .filter(Boolean);
    teamList = parseList(teamList);
  }

  if (scope && !scope.allTeams) {
    // Team-locked manager: only their own sub-teams, and never "all".
    const mine = scope.lockedTeams;
    teamList = (allTeams ? mine : teamList.filter((x) => mine.some((m) => normTag(m) === normTag(x)))).slice();
    if (!teamList.length) teamList = mine.slice();
    allTeams = false;
  }

  const department = allDepts ? ALL_DEPARTMENTS : deptList.join(', ');
  const team = allTeams ? ALL_TEAMS : teamList.join(', ');
  if (department.length > MAX_ORG_FIELD || team.length > MAX_ORG_FIELD) {
    const err = new Error('Too many departments or sub-teams selected — use "All" instead.');
    err.status = 400;
    throw err;
  }
  return { department: department || null, team };
}
