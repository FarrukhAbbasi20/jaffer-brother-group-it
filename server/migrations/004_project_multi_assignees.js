import { hasMigration, recordMigration, removeMigrationRecord } from './helpers.js';

const VERSION = '004_project_multi_assignees';
const DESCRIPTION =
  'JSON multi-value departments/teams/owners/leads on projects; backfill from singles.';

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
    'it_projects',
    'departments',
    'departments JSON NULL AFTER team'
  );
  await ensureColumn(db, 'it_projects', 'teams', 'teams JSON NULL AFTER departments');
  await ensureColumn(
    db,
    'it_projects',
    'owner_ids',
    'owner_ids JSON NULL AFTER owner_id'
  );
  await ensureColumn(
    db,
    'it_projects',
    'lead_ids',
    'lead_ids JSON NULL AFTER lead_id'
  );
  await ensureColumn(
    db,
    'it_projects',
    'owner_names',
    'owner_names JSON NULL AFTER owner'
  );
  await ensureColumn(
    db,
    'it_projects',
    'lead_names',
    'lead_names JSON NULL AFTER lead_name'
  );

  const [rows] = await db.query(
    `SELECT id, department, team, owner_id, lead_id, owner, lead_name
     FROM it_projects`
  );

  for (const row of rows || []) {
    await db.query(
      `UPDATE it_projects
       SET departments = CAST(? AS JSON),
           teams = CAST(? AS JSON),
           owner_ids = CAST(? AS JSON),
           lead_ids = CAST(? AS JSON),
           owner_names = CAST(? AS JSON),
           lead_names = CAST(? AS JSON)
       WHERE id = ?`,
      [
        toJsonArray(row.department),
        toJsonArray(row.team),
        toJsonArray(row.owner_id),
        toJsonArray(row.lead_id),
        toJsonArray(row.owner),
        toJsonArray(row.lead_name),
        row.id,
      ]
    );

    if (row.owner_id) {
      await db.query(
        `INSERT IGNORE INTO project_members (project_id, user_id, role_in_project)
         VALUES (?, ?, 'owner')`,
        [row.id, row.owner_id]
      );
    }
    if (row.lead_id) {
      await db.query(
        `INSERT IGNORE INTO project_members (project_id, user_id, role_in_project)
         VALUES (?, ?, 'lead')`,
        [row.id, row.lead_id]
      );
    }
  }

  await recordMigration(db, VERSION, DESCRIPTION);
  return true;
}

async function down(db) {
  await removeMigrationRecord(db, VERSION);
}

export default { version: VERSION, description: DESCRIPTION, up, down };
