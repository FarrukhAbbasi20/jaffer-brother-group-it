import 'dotenv/config';
import { rollbackMigration } from '../migrations/index.js';

const version = process.argv[2];

if (!version) {
  console.error('Usage: node server/scripts/rollback.js <migration-version>');
  process.exit(1);
}

rollbackMigration(version)
  .then(() => {
    console.log(`Rolled back ${version}.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`Rollback failed for ${version}:`, err);
    process.exit(1);
  });
