import { hasMigration, recordMigration, removeMigrationRecord } from './helpers.js';

const VERSION = '011_user_multi_department';
const DESCRIPTION =
  'Widen users.department and users.team to 512 so several departments / sub-teams fit (comma-separated).';

async function up(db) {
  if (await hasMigration(db, VERSION)) return false;
  // Widening only — existing values are untouched. (007 was never registered, so team is done here too.)
  let ok = true;
  for (const column of ['department', 'team']) {
    try {
      await db.query(`ALTER TABLE users MODIFY COLUMN ${column} VARCHAR(512) NULL`);
    } catch (err) {
      ok = false;
      console.warn(`${VERSION} (${column}):`, err.message || err);
    }
  }
  // Only mark as done when both columns were widened, so a failed attempt is retried on next start.
  if (ok) await recordMigration(db, VERSION, DESCRIPTION);
  return ok;
}

async function down(db) {
  // Not narrowed back: that could truncate saved department lists.
  await removeMigrationRecord(db, VERSION);
}

export default { version: VERSION, description: DESCRIPTION, up, down };
