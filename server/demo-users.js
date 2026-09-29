import { BUSINESS_DEPARTMENTS, teamsForDepartment } from './org.js';
import {
  createUser,
  deleteUser,
  findUserByEmail,
  updateUser,
  verifyPassword,
} from './auth-store.js';
import { getMysqlPool } from './db.js';

export const DEMO_PASSWORD = 'Demo@12345';
export const DEMO_EMAIL_DOMAIN = 'demo.jaffer.local';

function slugDept(department) {
  return String(department || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.+/g, '.') || 'dept';
}

export function demoAccountsCatalog() {
  const depts = [...BUSINESS_DEPARTMENTS];
  const accounts = [
    {
      email: `demo.admin@${DEMO_EMAIL_DOMAIN}`,
      name: 'Demo Admin',
      role: 'admin',
      department: 'All',
      team: 'All',
      label: 'Admin (company-wide)',
    },
    {
      email: `demo.director@${DEMO_EMAIL_DOMAIN}`,
      name: 'Demo Director',
      role: 'director',
      department: 'All',
      team: 'All',
      label: 'Director (company-wide)',
    },
  ];

  for (const department of depts) {
    const slug = slugDept(department);
    const teams = teamsForDepartment(department);
    accounts.push({
      // Use .head suffix so department "Admin" never overwrites demo.admin@
      email: `demo.${slug}.head@${DEMO_EMAIL_DOMAIN}`,
      name: `Demo ${department} Head`,
      role: 'head',
      department,
      team: 'All',
      label: `${department} · Head`,
    });
    // One member account for first sub-team (team-scoped testing)
    if (teams[0]) {
      accounts.push({
        email: `demo.${slug}.mgr@${DEMO_EMAIL_DOMAIN}`,
        name: `Demo ${department} Member`,
        role: 'member',
        department,
        team: teams[0],
        label: `${department} · Member (${teams[0]})`,
      });
    }
  }

  return accounts;
}

export function isDemoLoginEnabled() {
  // Demo password logins removed from the portal (SSO only).
  return false;
}

export function isDemoEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return e.endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

/** Seed demo users whenever password demo login is enabled. */
export function isDemoSeedEnabled() {
  return isDemoLoginEnabled();
}

export async function ensureDemoUsers() {
  if (!isDemoSeedEnabled()) return { ok: false, reason: 'disabled' };
  const created = [];
  const updated = [];
  for (const acct of demoAccountsCatalog()) {
    const existing = await findUserByEmail(acct.email);
    if (!existing) {
      await createUser({
        name: acct.name,
        email: acct.email,
        password: DEMO_PASSWORD,
        role: acct.role,
        department: acct.department,
        businessUnit: acct.role === 'admin' || acct.role === 'director' ? 'All' : '',
        team: acct.team,
        accessLevel: 'write',
      });
      created.push(acct.email);
      continue;
    }
    // Keep demo accounts active and password fresh for testing.
    const okPass = await verifyPassword(existing, DEMO_PASSWORD);
    await updateUser(existing.id, {
      name: acct.name,
      role: acct.role,
      department: acct.department,
      businessUnit: acct.role === 'admin' || acct.role === 'director' ? 'All' : existing.business_unit || '',
      team: acct.team,
      accessLevel: 'write',
      isActive: true,
      ...(okPass ? {} : { password: DEMO_PASSWORD }),
    });
    updated.push(acct.email);
  }
  return { ok: true, created, updated, password: DEMO_PASSWORD };
}

/** Delete all *@demo.jaffer.local portal users (they should not appear in Users). */
export async function removeDemoUsers() {
  const db = await getMysqlPool();
  const [rows] = await db.query(
    `SELECT id, email FROM users WHERE LOWER(email) LIKE ?`,
    [`%@${DEMO_EMAIL_DOMAIN}`]
  );
  const removed = [];
  for (const row of rows || []) {
    try {
      await deleteUser(row.id);
      removed.push(row.email);
    } catch (err) {
      console.error('removeDemoUsers:', row.email, err.message || err);
    }
  }
  return { ok: true, removed };
}

/** Rename legacy IT / GIT department label to Group IT on portal users. */
export async function normalizeGroupItDepartments() {
  const db = await getMysqlPool();
  const [result] = await db.query(
    `UPDATE users
     SET department = 'Group IT'
     WHERE TRIM(department) IN ('IT / GIT', 'IT/GIT', 'IT /GIT', 'IT/ GIT')
        OR LOWER(TRIM(department)) IN ('it / git', 'it/git')`
  );
  return { ok: true, affectedRows: result?.affectedRows || 0 };
}
