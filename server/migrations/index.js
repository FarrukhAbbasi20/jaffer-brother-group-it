import { getMysqlPool, useMysqlStorage } from '../db.js';
import { ensureMigrationsTable } from './helpers.js';
import authFoundation from './001_auth_foundation.js';
import issueLayer from './002_issue_layer.js';
import orgPageAccess from './003_org_page_access.js';
import projectMultiAssignees from './004_project_multi_assignees.js';
const migrations = [authFoundation, issueLayer, orgPageAccess, projectMultiAssignees];
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
    // Do not sync Tasks into Issues on boot — modules stay separate.
    // Soft-archive any leftover task mirrors / QA junk that still sit on Issues.
    try {
      const { archiveMisplacedTaskIssues } = await import('../issue-store.js');
      await archiveMisplacedTaskIssues();
    } catch (err) {
      console.error('archiveMisplacedTaskIssues on boot failed (non-fatal):', err?.message || err);
    }
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
