import 'dotenv/config';
import { runMigrations } from '../migrations/index.js';

runMigrations()
  .then(() => {
    console.log('Migrations complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
