import { hasMigration, recordMigration, removeMigrationRecord } from './helpers.js';
import { defaultOrgConfig, ensureOrgConfigTable } from '../org-store.js';
import { defaultPageAccessForRole, sanitizePageAccess } from '../pages.js';

const VERSION = '003_org_page_access';
const DESCRIPTION = 'Org departments/teams config + per-user page access and team.';

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

  await ensureOrgConfigTable(db);
  const seeded = defaultOrgConfig();
  await db.query(
    `INSERT INTO org_config (id, payload)
     VALUES ('default', CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE id = id`,
    [JSON.stringify(seeded)]
  );

  await ensureColumn(db, 'users', 'team', 'team VARCHAR(128) NULL AFTER department');
  await ensureColumn(db, 'users', 'page_access', 'page_access JSON NULL AFTER team');

  const [rows] = await db.query(`SELECT id, role, page_access FROM users`);
  for (const row of rows || []) {
    if (row.page_access) continue;
    const seededAccess = defaultPageAccessForRole(row.role);
    await db.query(`UPDATE users SET page_access = CAST(? AS JSON) WHERE id = ?`, [
      JSON.stringify(sanitizePageAccess(seededAccess)),
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
