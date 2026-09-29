import { hasMigration, recordMigration, removeMigrationRecord } from './helpers.js';

const VERSION = '010_project_multi_fields';
const DESCRIPTION =
  'Add JSON multi-value columns for project custodians, leads, and departments (category).';

async function ensureColumn(db, table, column, ddl) {
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (!cols.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

async function dropColumnIfExists(db, table, column) {
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (cols.length) await db.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
}

async function up(db) {
  if (await hasMigration(db, VERSION)) return false;

  await ensureColumn(
    db,
    'it_projects',
    'owners_json',
    'owners_json JSON NULL AFTER owner_id'
  );
  await ensureColumn(
    db,
    'it_projects',
    'leads_json',
    'leads_json JSON NULL AFTER lead_id'
  );
  await ensureColumn(
    db,
    'it_projects',
    'departments_json',
    'departments_json JSON NULL AFTER category'
  );

  // Backfill from legacy single-value columns so reads stay consistent.
  await db.query(`
    UPDATE it_projects
    SET owners_json = JSON_ARRAY(
      JSON_OBJECT(
        'id', COALESCE(owner_id, ''),
        'name', COALESCE(owner, ''),
        'email', COALESCE(owner_email, '')
      )
    )
    WHERE owners_json IS NULL
      AND (COALESCE(owner_id, '') <> '' OR COALESCE(owner, '') <> '')
  `);
  await db.query(`
    UPDATE it_projects
    SET leads_json = JSON_ARRAY(
      JSON_OBJECT(
        'id', COALESCE(lead_id, ''),
        'name', COALESCE(lead_name, ''),
        'email', COALESCE(lead_email, '')
      )
    )
    WHERE leads_json IS NULL
      AND (COALESCE(lead_id, '') <> '' OR COALESCE(lead_name, '') <> '')
  `);
  await db.query(`
    UPDATE it_projects
    SET departments_json = JSON_ARRAY(category)
    WHERE departments_json IS NULL
      AND COALESCE(category, '') <> ''
  `);

  await recordMigration(db, VERSION, DESCRIPTION);
  return true;
}

async function down(db) {
  await dropColumnIfExists(db, 'it_projects', 'departments_json');
  await dropColumnIfExists(db, 'it_projects', 'leads_json');
  await dropColumnIfExists(db, 'it_projects', 'owners_json');
  await removeMigrationRecord(db, VERSION);
}

export default { version: VERSION, description: DESCRIPTION, up, down };
