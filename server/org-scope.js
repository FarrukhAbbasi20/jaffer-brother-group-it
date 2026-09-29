/**
 * Shared org visibility: Business Unit → Department → Sub-team.
 * Used by projects API, issues, reports/scoreboard, and Ask Portal.
 */
import {
  sameDept,
  resolveTeamsDepartmentKey,
  teamsForDepartment,
  isAllTeamValue,
  parseTeams,
  normalizeDeptKey,
  normalizeRole,
} from './org.js';

const GIT_WORK_AREA_HINTS = [
  'website support',
  'website development',
  'software development',
  'infrastructure',
  'networking',
  'automation',
  'digitization',
  'documentation',
  'security',
  'development',
  'website',
];

export function canSeeAllWork(user) {
  const role = String(user?.role || '').toLowerCase();
  // Specific sub-team lock scopes data even for Admin/Director (Team=All = company-wide).
  const teams = parseUserTeams(user?.team);
  if (teams.length > 0 && !isAllTeam(user?.team)) return false;
  if (role === 'admin') return true;
  if (role === 'director') {
    const dept = String(user?.department || '').trim();
    // Only company-wide directors; dept-locked directors stay scoped
    return !dept || /^(all|\*)$/i.test(dept);
  }
  return false;
}

/**
 * Reports / Scoreboard visibility mode:
 * - self: Member (and Admin locked to a sub-team) → only own stats
 * - subteam: Head locked to one sub-team → that sub-team's people
 * - department: Head with Team=All / Director (dept) / company-wide Admin → all sub-teams in scope
 */
export function opsViewMode(user) {
  if (!user) return 'self';
  if (canSeeAllWork(user)) return 'department';
  const role = normalizeRole(user.role);
  // Only Heads/Directors browse team/dept roll-ups. Team-locked Admin stays personal.
  if (role === 'head' || role === 'director') {
    if (isAllTeam(user.team)) return 'department';
    if (parseUserTeams(user.team).length) return 'subteam';
    return 'department';
  }
  return 'self';
}

/** Head/Director may browse projects by dept/team; Members & team-locked Admin see assigned only. */
export function canBrowseOrgScope(user) {
  if (!user) return false;
  if (canSeeAllWork(user)) return true;
  const role = normalizeRole(user.role);
  return role === 'head' || role === 'director';
}

/** @deprecated use opsViewMode — true when not personal-only */
export function canSeeTeamOpsStats(user) {
  return opsViewMode(user) !== 'self';
}

export function isAllDept(department) {
  const d = String(department || '').trim().toLowerCase();
  return !d || d === 'all' || d === '*';
}

export function isAllTeam(team) {
  return isAllTeamValue(team);
}

export function parseUserTeams(team) {
  return parseTeams(team).filter((t) => !/^(all|\*)$/i.test(t));
}

export function itemAssignedToUser(item, userId) {
  if (!userId || !item) return false;
  const uid = String(userId);
  if (String(item.ownerId || '') === uid || String(item.leadId || '') === uid) return true;
  if (Array.isArray(item.ownerIds) && item.ownerIds.some((id) => String(id) === uid)) return true;
  if (Array.isArray(item.leadIds) && item.leadIds.some((id) => String(id) === uid)) return true;
  if (Array.isArray(item.memberIds) && item.memberIds.some((id) => String(id) === uid)) return true;
  if (String(item.assigneeId || '') === uid || String(item.reporterId || '') === uid) return true;
  return false;
}

function isGitWorkArea(category) {
  const c = String(category || '').trim().toLowerCase();
  if (!c) return false;
  if (GIT_WORK_AREA_HINTS.some((h) => c === h || c.includes(h))) return true;
  const gitTeams = teamsForDepartment('Group IT').map((t) => String(t).toLowerCase());
  return gitTeams.some((t) => c === t);
}

/** Resolve which company department an item belongs to. */
export function resolveItemDepartment(item) {
  const explicit = String(item?.department || '').trim();
  const cat = String(item?.category || '').trim();
  if (explicit && !isGitWorkArea(explicit) && !teamsForDepartment('Group IT').some((t) => sameDept(explicit, t))) {
    return explicit;
  }
  if (isGitWorkArea(cat) || isGitWorkArea(explicit)) return 'Group IT';
  if (explicit) return explicit;
  if (cat) {
    const key = resolveTeamsDepartmentKey(cat);
    if (key && key !== cat) return key;
    return cat;
  }
  return '';
}

/**
 * Strict category → sub-team match.
 * Exact / known aliases only — no bidirectional short substring matching.
 */
export function categoryMatchesTeam(category, team, dept) {
  if (isAllTeam(team)) return true;
  const c = String(category || '').trim().toLowerCase();
  const t = String(team || '').trim().toLowerCase();
  if (!c || !t) return false;
  if (c === t) return true;

  // Allow "Software development" ↔ Development, "Website Support" ↔ Website, etc.
  const aliases = {
    development: [
      /^software\s*development$/,
      /^development$/,
      /\bsoftware\s*dev(elopment)?\b/,
      /\boracle\b/,
      /\bimplement(ation)?\b/,
    ],
    website: [/^website(\s+support|\s+development)?$/, /\bwebsite\b/, /\bcms\b/],
    infrastructure: [/^infrastructure$/, /\binfra\b/, /\bcloud\b/, /\bserver(s)?\b/, /\bhost(ing)?\b/],
    networking: [/^networking$/, /\bnetwork(ing)?\b/, /\blan\b/, /\bwan\b/, /\bwifi\b/],
    security: [/^security$/, /\bsecur(e|ity)\b/, /\bfirewall\b/, /\bvulnerab/, /\bpenetrat/, /\bthreat\b/],
    automation: [/^automation$/, /\bautomat/, /\brpa\b/],
    digitization: [/^digitization$/, /\bdigit/, /\bpaperless\b/],
    documentation: [/^documentation$/, /\bdocument(ation|s)?\b/, /\bsop\b/, /\bwiki\b/],
    payroll: [/^payroll$/, /\bsalary\b/, /\bcompensa/],
    'l&d': [/^l&d$/, /\blearning\b/, /\btraining\b/, /\btalent\b/],
    operations: [/^operations$/, /\boperation(s)?\b/, /\bhr\s*ops\b/],
  };

  const patterns = aliases[t];
  if (patterns && patterns.some((re) => re.test(c))) {
    // Keep Security out of Development / Website accidental hits
    if (t === 'development' && /(secur|firewall|vulnerab|penetrat|threat|website)/.test(c)) return false;
    if (t === 'website' && /(secur|firewall|vulnerab)/.test(c)) return false;
    if (t === 'networking' && /(secur|threat)/.test(c) && !/(network|lan|wan|wifi)/.test(c)) return false;
    return true;
  }

  // Safe containment only when both sides are long enough (avoids "d" ⊂ "l&d")
  if (c.length >= 4 && t.length >= 4 && (c.includes(t) || t.includes(c))) return true;

  // Legacy: category saved as parent department → default first sub-team for that dept
  if (sameDept(category, dept) || resolveTeamsDepartmentKey(category) === resolveTeamsDepartmentKey(dept)) {
    const teams = teamsForDepartment(dept).filter((x) => x && !/^general$/i.test(x));
    const def = String(teams[0] || '').toLowerCase();
    if (def && def === t) {
      // Only when category is the parent label itself, not another sub-team name
      const catIsTeam = teams.some((x) => String(x).toLowerCase() === c);
      if (!catIsTeam) return true;
    }
  }

  // Parent department label alone is not a specific team when it doesn't match default
  if (sameDept(category, dept) && c === String(dept || '').trim().toLowerCase()) return false;
  return false;
}

function itemDepartmentsList(item) {
  if (Array.isArray(item?.departments) && item.departments.length) {
    return item.departments.map((d) => String(d || '').trim()).filter(Boolean);
  }
  if (Array.isArray(item?.categories) && item.categories.length) {
    return item.categories.map((d) => String(d || '').trim()).filter(Boolean);
  }
  const one = String(item?.department || item?.category || '').trim();
  if (!one) return [];
  if (one.includes(',')) return one.split(',').map((s) => s.trim()).filter(Boolean);
  return [one];
}

function itemInDepartment(item, userDept) {
  if (isAllDept(userDept)) return true;
  const depts = itemDepartmentsList(item);
  if (!depts.length) return false;
  return depts.some((d) => {
    const resolved = resolveItemDepartment({ ...item, category: d, department: d });
    return resolved ? sameDept(resolved, userDept) : false;
  });
}

/** Dept + team visibility (assignment short-circuits at the top). */
export function itemInUserScope(item, user) {
  if (!item || !user) return false;
  const uid = user?.id;
  if (itemAssignedToUser(item, uid)) return true;

  const dept = user?.department || '';
  const team = user?.team || '';
  // Empty / All dept: only company-wide roles use canSeeAllWork — others see assigned only
  if (!dept || isAllDept(dept)) return false;
  if (!itemInDepartment(item, dept)) return false;

  if (isAllTeam(team)) return true; // whole department (already matched dept)

  const userTeams = parseUserTeams(team);
  if (!userTeams.length) return false;
  const cats = itemDepartmentsList(item);
  return userTeams.some((t) => cats.some((cat) => categoryMatchesTeam(cat, t, dept)));
}

/** Business unit check when both sides have a BU set. */
export function itemMatchesUserBu(item, user) {
  const userBu = String(user?.businessUnit || '').trim().toUpperCase();
  if (!userBu || userBu === 'ALL' || userBu === '*') return true;
  const itemBu = String(item?.businessUnit || '').trim().toUpperCase();
  if (!itemBu) return true; // legacy rows without BU stay visible within dept/team rules
  return itemBu === userBu;
}

export function itemVisibleToUser(item, user) {
  if (!user || !item) return false;
  if (canSeeAllWork(user)) return true;
  if (itemAssignedToUser(item, user.id)) return true;
  if (!canBrowseOrgScope(user)) return false;
  if (!itemMatchesUserBu(item, user)) return false;
  return itemInUserScope(item, user);
}

/**
 * Issue visibility: assignee/reporter OR project in scope.
 * Heads/managers are NOT company-wide.
 */
export function issueVisibleToUser(issue, project, user) {
  if (!user || !issue) return false;
  if (canSeeAllWork(user)) return true;
  const uid = user.id;
  if (issue.assigneeId === uid || issue.reporterId === uid) return true;
  if (project) {
    if (itemAssignedToUser(project, uid)) return true;
    if (!canBrowseOrgScope(user)) return false;
    if (!itemMatchesUserBu(project, user) && project.businessUnit) return false;
    return itemInUserScope(project, user);
  }
  // Orphan issue: only via assignment (already checked) or issue.department in scope
  if (!canBrowseOrgScope(user)) return false;
  const fake = {
    category: issue.department || '',
    department: issue.department || '',
    businessUnit: issue.businessUnit,
  };
  if (!String(fake.department || fake.category).trim()) return false;
  return itemInUserScope(fake, user);
}

/** Whether a people row (user account) belongs in actor's org filter. */
export function userInOrgScope(actor, target) {
  if (!actor || !target) return false;
  if (actor.id && target.id && actor.id === target.id) return true;
  if (canSeeAllWork(actor)) return true;
  // Personal-only actors never include other people in roll-ups
  if (!canBrowseOrgScope(actor)) return false;

  const aBu = String(actor.businessUnit || '').trim().toUpperCase();
  const tBu = String(target.businessUnit || '').trim().toUpperCase();
  if (aBu && aBu !== 'ALL' && aBu !== '*' && tBu && tBu !== aBu) return false;

  const aDept = String(actor.department || '').trim();
  const tDept = String(target.department || '').trim();
  if (!aDept || isAllDept(aDept)) return true;
  if (!tDept) return false;
  if (!sameDept(aDept, tDept)) return false;

  if (isAllTeam(actor.team)) return true;
  const aTeams = parseUserTeams(actor.team);
  if (!aTeams.length) return true;
  const tTeam = target.team || target.teamName || '';
  // Specific-team actors: target must share a team (blank team ≠ every sub-team)
  if (!String(tTeam).trim() || isAllTeam(tTeam)) return false;
  const tTeams = parseUserTeams(tTeam);
  return aTeams.some((a) => tTeams.some((t) => String(a).toLowerCase() === String(t).toLowerCase()));
}

export { sameDept, normalizeDeptKey };
