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
