import { hasMigration, recordMigration, removeMigrationRecord } from './helpers.js';

const VERSION = '009_project_completed_at';
const DESCRIPTION =
  'Add completed_at (actual completion) on it_projects, it_milestones, and issues; start_date on issues.';

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
    'completed_at',
    'completed_at DATE NULL AFTER end_date'
  );
  await ensureColumn(
    db,
    'it_milestones',
    'completed_at',
    'completed_at DATE NULL AFTER due_date'
  );
  await ensureColumn(
    db,
    'issues',
    'start_date',
    'start_date DATE NULL AFTER issue_rank'
  );
  await ensureColumn(
    db,
    'issues',
    'completed_at',
    'completed_at DATE NULL AFTER due_date'
  );

  await recordMigration(db, VERSION, DESCRIPTION);
  return true;
}

async function down(db) {
  await dropColumnIfExists(db, 'issues', 'completed_at');
  await dropColumnIfExists(db, 'issues', 'start_date');
  await dropColumnIfExists(db, 'it_milestones', 'completed_at');
  await dropColumnIfExists(db, 'it_projects', 'completed_at');
  await removeMigrationRecord(db, VERSION);
}

export default { version: VERSION, description: DESCRIPTION, up, down };
