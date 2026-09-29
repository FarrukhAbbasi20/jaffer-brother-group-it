import { hasMigration, recordMigration, removeMigrationRecord } from './helpers.js';

const VERSION = '003_comment_threads';
const DESCRIPTION =
  'Add threaded discussion fields on it_comments: parent_id, is_issue, status, and indexes.';

async function ensureColumn(db, table, column, ddl) {
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (!cols.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

async function ensureIndex(db, table, indexName, ddl) {
  const [rows] = await db.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  if (!rows.length) await db.query(`ALTER TABLE ${table} ADD ${ddl}`);
}

async function up(db) {
  if (await hasMigration(db, VERSION)) return false;

  // Confirm base table exists (created by ensureItTables).
  await db.query(`
    CREATE TABLE IF NOT EXISTS it_comments (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      project_id VARCHAR(64) NULL,
      milestone_id VARCHAR(64) NULL,
      author_role VARCHAR(32) NOT NULL,
      author_name VARCHAR(256) NULL,
      author_email VARCHAR(320) NULL,
      body TEXT NOT NULL,
      archived TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_it_comments_milestone (milestone_id),
      INDEX idx_it_comments_project (project_id),
      INDEX idx_it_comments_archived (archived)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureColumn(db, 'it_comments', 'user_id', 'user_id VARCHAR(64) NULL AFTER project_id');
  await ensureColumn(
    db,
    'it_comments',
    'parent_id',
    'parent_id VARCHAR(64) NULL AFTER milestone_id'
  );
  await ensureColumn(
    db,
    'it_comments',
    'is_issue',
    'is_issue TINYINT(1) NOT NULL DEFAULT 0 AFTER body'
  );
  await ensureColumn(
    db,
    'it_comments',
    'status',
    "status VARCHAR(16) NULL DEFAULT NULL AFTER is_issue"
  );

  await ensureIndex(
    db,
    'it_comments',
    'idx_it_comments_parent',
    'INDEX idx_it_comments_parent (parent_id)'
  );
  await ensureIndex(
    db,
    'it_comments',
    'idx_it_comments_issue',
    'INDEX idx_it_comments_issue (is_issue, status)'
  );

  // Existing rows stay normal comments (is_issue=0, status NULL).
  await db.query(
    `UPDATE it_comments SET status = 'OPEN' WHERE is_issue = 1 AND (status IS NULL OR status = '')`
  );

  await recordMigration(db, VERSION, DESCRIPTION);
  return true;
}

async function down(db) {
  // Keep columns for safety; only drop migration record so re-run is a no-op on columns.
  await removeMigrationRecord(db, VERSION);
  return true;
}

export default { version: VERSION, description: DESCRIPTION, up, down };
