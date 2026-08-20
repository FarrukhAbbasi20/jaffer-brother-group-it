import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getMysqlPool } from './db.js';

const SESSION_HOURS = 8;

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

export function sessionTtlMs() {
  return SESSION_HOURS * 60 * 60 * 1000;
}

export async function findUserByEmail(email) {
  const db = await getMysqlPool();
  const normalized = String(email || '').trim().toLowerCase();
  const [rows] = await db.query(
    `SELECT id, name, email, password_hash, role, department, avatar_url, is_active, last_login_at, created_at
     FROM users WHERE email = ? LIMIT 1`,
    [normalized]
  );
  return rows[0] || null;
}

export async function findUserById(id) {
  const db = await getMysqlPool();
  const [rows] = await db.query(
    `SELECT id, name, email, role, department, avatar_url, is_active, last_login_at, created_at
     FROM users WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function verifyPassword(user, password) {
  if (!user?.password_hash) return false;
  return bcrypt.compare(String(password || ''), user.password_hash);
}

export async function createSession({ userId, token, userAgent, ip }) {
  const db = await getMysqlPool();
  const id = `sess_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  await db.query(
    `INSERT INTO sessions
      (id, user_id, token_hash, expires_at, last_seen_at, user_agent, ip)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
    [id, userId, sha256(token), expiresAt, userAgent || null, ip || null]
  );
  await db.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
  return { id, expiresAt };
}

export async function consumeSession(token, { touch = true } = {}) {
  const db = await getMysqlPool();
  const tokenHash = sha256(token);
  const [rows] = await db.query(
    `SELECT s.id, s.user_id, s.expires_at,
            u.id AS uid, u.name, u.email, u.role, u.department, u.avatar_url, u.is_active
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row || !row.is_active) return null;
  if (touch) {
    const expiresAt = new Date(Date.now() + sessionTtlMs());
    await db.query(
      `UPDATE sessions
       SET last_seen_at = CURRENT_TIMESTAMP, expires_at = ?
       WHERE id = ?`,
      [expiresAt, row.id]
    );
    row.expires_at = expiresAt;
  }
  return {
    sessionId: row.id,
    expiresAt: row.expires_at,
    user: {
      id: row.uid,
      name: row.name,
      email: row.email,
      role: row.role,
      department: row.department || '',
      avatarUrl: row.avatar_url || '',
    },
  };
}

export async function revokeSession(token) {
  const db = await getMysqlPool();
  await db.query('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
}

export async function listProjectMemberships(userId) {
  const db = await getMysqlPool();
  const [rows] = await db.query(
    `SELECT project_id, role_in_project
     FROM project_members
     WHERE user_id = ?`,
    [userId]
  );
  return rows;
}

function mapPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department || '',
    avatarUrl: row.avatar_url || '',
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at || null,
    createdAt: row.created_at || null,
    hasPassword: Boolean(row.password_hash),
  };
}

export async function listUsers() {
  const db = await getMysqlPool();
  const [rows] = await db.query(
    `SELECT id, name, email, password_hash, role, department, avatar_url, is_active, last_login_at, created_at
     FROM users
     ORDER BY
       FIELD(role, 'admin', 'manager', 'owner', 'lead', 'viewer'),
       name ASC`
  );
  return rows.map(mapPublicUser);
}

export async function createUser({ name, email, password, role, department }) {
  const db = await getMysqlPool();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    const err = new Error('A user with this email already exists');
    err.status = 409;
    throw err;
  }

  const id = `u_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  const passwordHash = password ? await bcrypt.hash(String(password), 10) : null;
  await db.query(
    `INSERT INTO users
      (id, name, email, password_hash, role, department, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [
      id,
      String(name || '').trim(),
      normalizedEmail,
      passwordHash,
      role,
      department ? String(department).trim() : null,
    ]
  );
  return findUserById(id).then((row) =>
    mapPublicUser({ ...row, password_hash: passwordHash, is_active: 1 })
  );
}

export async function updateUser(id, patch = {}) {
  const db = await getMysqlPool();
  const current = await findUserById(id);
  if (!current) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const next = {
    name: patch.name != null ? String(patch.name).trim() : current.name,
    email:
      patch.email != null
        ? String(patch.email).trim().toLowerCase()
        : current.email,
    role: patch.role != null ? patch.role : current.role,
    department:
      patch.department != null
        ? String(patch.department).trim()
        : current.department || null,
    is_active:
      patch.isActive != null ? (patch.isActive ? 1 : 0) : current.is_active,
  };

  if (patch.email != null && next.email !== current.email) {
    const clash = await findUserByEmail(next.email);
    if (clash && clash.id !== id) {
      const err = new Error('A user with this email already exists');
      err.status = 409;
      throw err;
    }
  }

  const params = [next.name, next.email, next.role, next.department, next.is_active];
  let sql = `UPDATE users
    SET name = ?, email = ?, role = ?, department = ?, is_active = ?`;

  if (patch.password) {
    const passwordHash = await bcrypt.hash(String(patch.password), 10);
    sql += `, password_hash = ?`;
    params.push(passwordHash);
  }

  sql += ` WHERE id = ?`;
  params.push(id);
  await db.query(sql, params);

  const [rows] = await db.query(
    `SELECT id, name, email, password_hash, role, department, avatar_url, is_active, last_login_at, created_at
     FROM users WHERE id = ? LIMIT 1`,
    [id]
  );
  return mapPublicUser(rows[0]);
}
