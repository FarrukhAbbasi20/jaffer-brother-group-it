import { hasMigration, recordMigration, removeMigrationRecord } from './helpers.js';

const VERSION = '007_user_team_multi';
const DESCRIPTION =
  'Widen users.team so multiple sub-teams can be stored (comma-separated).';

async function up(db) {
  if (await hasMigration(db, VERSION)) return false;

  try {
    await db.query(`ALTER TABLE users MODIFY COLUMN team VARCHAR(512) NULL`);
  } catch (err) {
    console.warn('007_user_team_multi:', err.message || err);
  }

  await recordMigration(db, VERSION, DESCRIPTION);
  return true;
}

async function down(db) {
  await removeMigrationRecord(db, VERSION);
}

export default { version: VERSION, description: DESCRIPTION, up, down };
