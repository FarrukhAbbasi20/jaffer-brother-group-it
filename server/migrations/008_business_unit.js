import { hasMigration, recordMigration, removeMigrationRecord } from './helpers.js';
import { BU_DIVISION_SEED } from '../bu-map.js';

const VERSION = '008_business_unit';
const DESCRIPTION = 'Business Unit map (bu_division_map) and users.business_unit column.';

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

  await db.query(`
    CREATE TABLE IF NOT EXISTS bu_division_map (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      bu VARCHAR(50) NOT NULL,
      division VARCHAR(255) NOT NULL,
      UNIQUE KEY uq_bu_division (bu, division),
      INDEX idx_bu_division_div (division)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  for (const [bu, division] of BU_DIVISION_SEED) {
    const div = String(division || '').trim();
    if (!div) continue;
    await db.query(
      `INSERT IGNORE INTO bu_division_map (bu, division) VALUES (?, ?)`,
      [String(bu).trim().toUpperCase(), div]
    );
  }

  await ensureColumn(
    db,
    'users',
    'business_unit',
    'business_unit VARCHAR(32) NULL AFTER department'
  );

  await recordMigration(db, VERSION, DESCRIPTION);
  return true;
}

async function down(db) {
  await removeMigrationRecord(db, VERSION);
}

export default { version: VERSION, description: DESCRIPTION, up, down };
