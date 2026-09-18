import { hasMigration, recordMigration, removeMigrationRecord } from './helpers.js';

const VERSION = '005_milestone_multi_assignees';
const DESCRIPTION =
  'JSON multi-value owners/leads on milestones/tasks; backfill from singles.';

async function ensureColumn(db, table, column, ddl) {
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (!cols.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function toJsonArray(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(
      [...new Set(value.map((v) => String(v || '').trim()).filter(Boolean))]
    );
  }
  const s = String(value || '').trim();
  return JSON.stringify(s ? [s] : []);
}

async function up(db) {
  if (await hasMigration(db, VERSION)) return false;

  await ensureColumn(
    db,
    'it_milestones',
    'owner_ids',
    'owner_ids JSON NULL AFTER owner_id'
  );
  await ensureColumn(
    db,
    'it_milestones',
    'lead_ids',
    'lead_ids JSON NULL AFTER lead_id'
  );
  await ensureColumn(
    db,
    'it_milestones',
    'owner_names',
    'owner_names JSON NULL AFTER owner'
  );
  await ensureColumn(
    db,
    'it_milestones',
    'lead_names',
    'lead_names JSON NULL AFTER lead_name'
  );

  const [rows] = await db.query(
    `SELECT id, owner_id, lead_id, owner, lead_name FROM it_milestones`
  );

  for (const row of rows || []) {
    await db.query(
      `UPDATE it_milestones
       SET owner_ids = CAST(? AS JSON),
           lead_ids = CAST(? AS JSON),
           owner_names = CAST(? AS JSON),
           lead_names = CAST(? AS JSON)
       WHERE id = ?`,
      [
        toJsonArray(row.owner_id),
        toJsonArray(row.lead_id),
        toJsonArray(row.owner),
        toJsonArray(row.lead_name),
        row.id,
      ]
    );
  }

  await recordMigration(db, VERSION, DESCRIPTION);
  return true;
}

async function down(db) {
  await removeMigrationRecord(db, VERSION);
}

export default { version: VERSION, description: DESCRIPTION, up, down };
