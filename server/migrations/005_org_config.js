import { hasMigration, recordMigration, removeMigrationRecord } from './helpers.js';
import { defaultOrgConfig, ensureOrgConfigTable } from '../org-store.js';

const VERSION = '005_org_config';
const DESCRIPTION = 'Admin-editable departments, teams, and portal roles (org_config).';

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
  await recordMigration(db, VERSION, DESCRIPTION);
  return true;
}

async function down(db) {
  await removeMigrationRecord(db, VERSION);
}

export default { version: VERSION, description: DESCRIPTION, up, down };
