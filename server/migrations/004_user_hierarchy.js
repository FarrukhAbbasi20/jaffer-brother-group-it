import { hasMigration, recordMigration, removeMigrationRecord } from './helpers.js';
import { normalizeRole, normalizeAccessLevel } from '../org.js';

const VERSION = '004_user_hierarchy';
const DESCRIPTION =
  'Add users.team and users.access_level; normalize legacy roles to company hierarchy.';

async function ensureColumn(db, table, column, ddl) {
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (!cols.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

async function up(db) {
  if (await hasMigration(db, VERSION)) return false;

  await ensureColumn(db, 'users', 'team', 'team VARCHAR(128) NULL AFTER department');
  await ensureColumn(
    db,
    'users',
    'access_level',
    "access_level VARCHAR(16) NOT NULL DEFAULT 'write' AFTER team"
  );

  const [rows] = await db.query(`SELECT id, role, access_level FROM users`);
  for (const row of rows || []) {
    const nextRole = normalizeRole(row.role);
    const nextAccess = normalizeAccessLevel(nextRole, row.access_level);
    if (nextRole !== row.role || nextAccess !== row.access_level) {
      await db.query(`UPDATE users SET role = ?, access_level = ? WHERE id = ?`, [
        nextRole,
        nextAccess,
        row.id,
      ]);
    }
  }

  // Default team for IT / GIT users without one
  await db.query(
    `UPDATE users SET team = 'Development'
     WHERE (team IS NULL OR TRIM(team) = '')
       AND department IN ('IT / GIT', 'GIT', 'IT')`
  );
  await db.query(
    `UPDATE users SET team = 'General'
     WHERE (team IS NULL OR TRIM(team) = '')`
  );

  await recordMigration(db, VERSION, DESCRIPTION);
  return true;
}

async function down(db) {
  // Keep columns; only remove migration record
  await removeMigrationRecord(db, VERSION);
}

export default { version: VERSION, description: DESCRIPTION, up, down };
