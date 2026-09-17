import crypto from 'crypto';
import { getMysqlPool } from './db.js';

function mapNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type || 'info',
    title: row.title || '',
    body: row.body || '',
    link: row.link || '',
    readAt: row.read_at || null,
    createdAt: row.created_at || null,
  };
}

export async function listNotifications(userId, { limit = 40 } = {}) {
  const db = await getMysqlPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const [rows] = await db.query(
    `SELECT id, type, title, body, link, read_at, created_at
     FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ${safeLimit}`,
    [userId]
  );
  return rows.map(mapNotification);
}

export async function unreadNotificationCount(userId) {
  const db = await getMysqlPool();
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL`,
    [userId]
  );
  return Number(rows[0]?.c || 0);
}

export async function createNotification({
  userId,
  type = 'info',
  title,
  body = '',
  link = '',
}) {
  if (!userId || !title) return null;
  const db = await getMysqlPool();
  const id = `ntf_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  await db.query(
    `INSERT INTO notifications (id, user_id, type, title, body, link)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      String(type || 'info').slice(0, 64),
      String(title).slice(0, 255),
      body ? String(body).slice(0, 4000) : null,
      link ? String(link).slice(0, 1024) : null,
    ]
  );
  return id;
}

export async function markNotificationRead(userId, id) {
  const db = await getMysqlPool();
  const [result] = await db.query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
     WHERE id = ? AND user_id = ?`,
    [id, userId]
  );
  return result.affectedRows > 0;
}

export async function markAllNotificationsRead(userId) {
  const db = await getMysqlPool();
  const [result] = await db.query(
    `UPDATE notifications
     SET read_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND read_at IS NULL`,
    [userId]
  );
  return result.affectedRows || 0;
}
