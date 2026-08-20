import { getMysqlPool, useMysqlStorage } from '../db.js';
import { ensureMigrationsTable } from './helpers.js';
import authFoundation from './001_auth_foundation.js';
import issueLayer from './002_issue_layer.js';
import { syncIssuesFromLegacyMilestones } from '../issue-store.js';

const migrations = [authFoundation, issueLayer];
let readyPromise = null;

export async function runMigrations() {
  if (!useMysqlStorage()) return false;
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    const db = await getMysqlPool();
    await ensureMigrationsTable(db);
    for (const migration of migrations) {
      await migration.up(db);
    }
    // Keep issue bridge in sync for tasks created after the first migration run.
    await syncIssuesFromLegacyMilestones();
    return true;
  })().catch((err) => {
    readyPromise = null;
    throw err;
  });

  return readyPromise;
}

export async function rollbackMigration(version) {
  const db = await getMysqlPool();
  const migration = migrations.find((item) => item.version === version);
  if (!migration) throw new Error(`Unknown migration: ${version}`);
  await migration.down(db);
}

export { migrations };
