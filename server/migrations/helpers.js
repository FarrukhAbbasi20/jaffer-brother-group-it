export async function ensureMigrationsTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) NOT NULL PRIMARY KEY,
      description VARCHAR(255) NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function hasMigration(db, version) {
  await ensureMigrationsTable(db);
  const [rows] = await db.query(
    'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1',
    [version]
  );
  return rows.length > 0;
}

export async function recordMigration(db, version, description) {
  await ensureMigrationsTable(db);
  await db.query(
    `INSERT INTO schema_migrations (version, description)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE description = VALUES(description)`,
    [version, description || null]
  );
}

export async function removeMigrationRecord(db, version) {
  await ensureMigrationsTable(db);
  await db.query('DELETE FROM schema_migrations WHERE version = ?', [version]);
}
