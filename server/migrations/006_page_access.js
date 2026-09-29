import { hasMigration, recordMigration, removeMigrationRecord } from './helpers.js';
import { defaultPageAccessForRole, sanitizePageAccess } from '../pages.js';

const VERSION = '006_page_access';
const DESCRIPTION = 'Per-user page access (view/write/none) for portal pages.';

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

  await ensureColumn(
    db,
    'users',
    'page_access',
    'page_access JSON NULL AFTER access_level'
  );

  const [rows] = await db.query(`SELECT id, role, access_level, page_access FROM users`);
  for (const row of rows || []) {
    if (row.page_access) continue;
    const seeded = defaultPageAccessForRole(row.role, row.access_level);
    await db.query(`UPDATE users SET page_access = CAST(? AS JSON) WHERE id = ?`, [
      JSON.stringify(sanitizePageAccess(seeded)),
      row.id,
    ]);
  }

  await recordMigration(db, VERSION, DESCRIPTION);
  return true;
}

async function down(db) {
  await removeMigrationRecord(db, VERSION);
}

export default { version: VERSION, description: DESCRIPTION, up, down };
