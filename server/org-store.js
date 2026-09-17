import { getMysqlPool, useMysqlStorage } from './db.js';

const CONFIG_ID = 'default';
let cache = null;
let cacheAt = 0;
const CACHE_MS = 15_000;

export const DEFAULT_DEPARTMENTS = [
  'Group IT',
  'HR',
  'Finance',
  'Sales',
  'Marketing',
  'Operations',
  'Procurement',
  'Legal',
  'Admin',
  'Supply Chain',
  'Corporate People & Culture',
  'Group Administration',
];

export const DEFAULT_TEAMS_BY_DEPARTMENT = {
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
  HR: [],
  Finance: [],
  'Corporate People & Culture': [],
  'Group Administration': [],
};

export function defaultOrgConfig() {
  return {
    departments: [...DEFAULT_DEPARTMENTS],
    teamsByDepartment: JSON.parse(JSON.stringify(DEFAULT_TEAMS_BY_DEPARTMENT)),
  };
}

export function normalizeOrgConfig(input = {}) {
  const base = defaultOrgConfig();
  const departments = Array.isArray(input.departments)
    ? [...new Set(input.departments.map((d) => String(d || '').trim()).filter(Boolean))]
    : base.departments.slice();
  if (!departments.length) departments.push(...base.departments);

  const teamsIn =
    input.teamsByDepartment && typeof input.teamsByDepartment === 'object'
      ? input.teamsByDepartment
      : base.teamsByDepartment;
  const teamsByDepartment = {};
  for (const dept of departments) {
    const list = Array.isArray(teamsIn[dept])
      ? [...new Set(teamsIn[dept].map((t) => String(t || '').trim()).filter(Boolean))]
      : Array.isArray(base.teamsByDepartment[dept])
        ? [...base.teamsByDepartment[dept]]
        : [];
    teamsByDepartment[dept] = list;
  }
  for (const [dept, rawList] of Object.entries(teamsIn || {})) {
    if (teamsByDepartment[dept] != null) continue;
    if (!Array.isArray(rawList)) continue;
    const cleaned = [...new Set(rawList.map((t) => String(t || '').trim()).filter(Boolean))];
    if (cleaned.length) teamsByDepartment[dept] = cleaned;
  }
  if (teamsByDepartment['Group IT']?.length) {
    teamsByDepartment['IT / GIT'] = [...teamsByDepartment['Group IT']];
  } else if (teamsByDepartment['IT / GIT']?.length) {
    teamsByDepartment['Group IT'] = [...teamsByDepartment['IT / GIT']];
  }
  return { departments, teamsByDepartment };
}

export async function ensureOrgConfigTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS org_config (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      payload JSON NOT NULL,
      updated_by VARCHAR(64) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export function invalidateOrgConfigCache() {
  cache = null;
  cacheAt = 0;
}

export async function getOrgConfig({ force = false } = {}) {
  if (!useMysqlStorage()) return defaultOrgConfig();
  const now = Date.now();
  if (!force && cache && now - cacheAt < CACHE_MS) return cache;
  const db = await getMysqlPool();
  await ensureOrgConfigTable(db);
  const [rows] = await db.query(`SELECT payload FROM org_config WHERE id = ? LIMIT 1`, [CONFIG_ID]);
  let payload = rows?.[0]?.payload;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (_) {
      payload = null;
    }
  }
  if (!payload) {
    const seeded = defaultOrgConfig();
    await db.query(
      `INSERT INTO org_config (id, payload) VALUES (?, CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE id = id`,
      [CONFIG_ID, JSON.stringify(seeded)]
    );
    cache = seeded;
    cacheAt = now;
    return seeded;
  }
  cache = normalizeOrgConfig(payload);
  cacheAt = now;
  return cache;
}

export async function saveOrgConfig(input, { userId } = {}) {
  const db = await getMysqlPool();
  await ensureOrgConfigTable(db);
  const next = normalizeOrgConfig(input);
  await db.query(
    `INSERT INTO org_config (id, payload, updated_by)
     VALUES (?, CAST(? AS JSON), ?)
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_by = VALUES(updated_by)`,
    [CONFIG_ID, JSON.stringify(next), userId || null]
  );
  invalidateOrgConfigCache();
  return next;
}

/** Resolve IT department name aliases used across HR vs portal. */
export function departmentAliases(department) {
  const raw = String(department || '').trim();
  if (!raw) return [];
  const out = [raw];
  const lower = raw.toLowerCase();
  const isIt =
    lower === 'group it' ||
    lower === 'it / git' ||
    lower === 'it/git' ||
    lower === 'it' ||
    lower === 'git';
  if (isIt) {
    for (const alias of ['Group IT', 'IT / GIT']) {
      if (!out.some((d) => d.toLowerCase() === alias.toLowerCase())) out.push(alias);
    }
  }
  return out;
}

export function teamsForDepartment(config, department) {
  const raw = String(department || '').trim();
  const map = config?.teamsByDepartment || {};
  if (Array.isArray(map[raw])) return map[raw].slice();
  for (const alias of departmentAliases(raw)) {
    if (Array.isArray(map[alias]) && map[alias].length) return map[alias].slice();
  }
  if (/it|git/i.test(raw) && Array.isArray(map['Group IT'])) return map['Group IT'].slice();
  return [];
}

/**
 * Departments + sub-teams a user may assign when creating/editing projects.
 * Admins and IT Managers are unrestricted (full org config).
 * Custodians (owner) are limited to their home department and that dept's sub-teams.
 */
export function projectCreateScope(user, config) {
  const role = String(user?.role || '').toLowerCase();
  const departments = Array.isArray(config?.departments) ? config.departments.slice() : [];
  const teamsByDepartment =
    config?.teamsByDepartment && typeof config.teamsByDepartment === 'object'
      ? config.teamsByDepartment
      : {};

  if (role === 'admin' || role === 'manager') {
    return { unrestricted: true, departments, teamsByDepartment };
  }

  if (role !== 'owner') {
    return { unrestricted: false, departments: [], teamsByDepartment: {} };
  }

  const home = String(user?.department || '').trim();
  if (!home) {
    return { unrestricted: false, departments: [], teamsByDepartment: {} };
  }

  const aliases = departmentAliases(home);
  const matched = departments.filter((d) =>
    aliases.some((a) => a.toLowerCase() === String(d).toLowerCase())
  );
  const scopedDepts = matched.length ? matched : [home];
  const scopedTeams = {};
  for (const d of scopedDepts) {
    scopedTeams[d] = teamsForDepartment(config, d);
  }
  return {
    unrestricted: false,
    departments: scopedDepts,
    teamsByDepartment: scopedTeams,
  };
}

/** Throws an Error with .status when project department/team is outside custodian scope. */
export function assertProjectInCreateScope(user, project, config) {
  const scope = projectCreateScope(user, config);
  if (scope.unrestricted) return scope;

  const role = String(user?.role || '').toLowerCase();
  if (role !== 'owner') {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }

  const departments = Array.isArray(project?.departments)
    ? project.departments.map((d) => String(d || '').trim()).filter(Boolean)
    : [];
  if (!departments.length) {
    const single = String(project?.department || '').trim();
    if (single) departments.push(single);
  }
  const teams = Array.isArray(project?.teams)
    ? project.teams.map((t) => String(t || '').trim()).filter(Boolean)
    : [];
  if (!teams.length) {
    const singleTeam = String(project?.team || '').trim();
    if (singleTeam) teams.push(singleTeam);
  }

  if (!departments.length) {
    const err = new Error('Department is required');
    err.status = 400;
    throw err;
  }

  for (const dept of departments) {
    const deptOk = scope.departments.some(
      (d) => String(d).toLowerCase() === dept.toLowerCase()
    );
    if (!deptOk) {
      const err = new Error(
        'Custodians can only create projects for their department and its sub-teams'
      );
      err.status = 403;
      throw err;
    }
  }

  if (teams.length) {
    const allowedTeams = new Set();
    for (const dept of departments) {
      const list =
        scope.teamsByDepartment[dept] ||
        teamsForDepartment(config, dept) ||
        [];
      for (const t of list) allowedTeams.add(String(t).toLowerCase());
    }
    for (const team of teams) {
      if (!allowedTeams.has(team.toLowerCase())) {
        const err = new Error('Sub-team is outside your department scope');
        err.status = 403;
        throw err;
      }
    }
  }

  return scope;
}
