import { getMysqlPool } from './db.js';

function safeJson(value) {
  return value == null ? null : JSON.stringify(value);
}

export async function writeAuditLog({
  userId,
  action,
  entityType,
  entityId,
  before,
  after,
  ip,
}) {
  const db = await getMysqlPool();
  await db.query(
    `INSERT INTO audit_log
      (user_id, action, entity_type, entity_id, before_json, after_json, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId || null,
      action,
      entityType,
      entityId,
      safeJson(before),
      safeJson(after),
      ip || null,
    ]
  );
}
