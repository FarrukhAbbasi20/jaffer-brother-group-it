import bcrypt from 'bcryptjs';
import { hasMigration, recordMigration, removeMigrationRecord } from './helpers.js';

const VERSION = '001_auth_foundation';
const DESCRIPTION = 'Add users, sessions, RBAC support, audit log, notifications, and owner/lead backfill.';

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

async function findOrCreateUserByEmail(db, { email, fallbackName, role }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;
  const [existing] = await db.query(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [normalizedEmail]
  );
  if (existing.length) return existing[0].id;

  const id = `u_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  await db.query(
    `INSERT INTO users
      (id, name, email, password_hash, role, department, is_active)
     VALUES (?, ?, ?, NULL, ?, 'GIT', 1)`,
    [id, fallbackName || normalizedEmail, normalizedEmail, role || 'viewer']
  );
  return id;
}

async function backfillOwnerLeadUsers(db) {
  const [projects] = await db.query(
    `SELECT id, name, owner, owner_email, lead_name, lead_email
     FROM it_projects WHERE archived = 0`
  );

  for (const project of projects) {
    let ownerId = null;
    let leadId = null;

    if (project.owner_email) {
      ownerId = await findOrCreateUserByEmail(db, {
        email: project.owner_email,
        fallbackName: project.owner || project.name || 'Project Owner',
        role: 'owner',
      });
    }
    if (project.lead_email) {
      leadId = await findOrCreateUserByEmail(db, {
        email: project.lead_email,
        fallbackName: project.lead_name || project.name || 'Project Lead',
        role: 'lead',
      });
    }

    await db.query(
      `UPDATE it_projects
       SET owner_id = COALESCE(?, owner_id),
           lead_id = COALESCE(?, lead_id)
       WHERE id = ?`,
      [ownerId, leadId, project.id]
    );

    if (ownerId) {
      await db.query(
        `INSERT IGNORE INTO project_members (project_id, user_id, role_in_project)
         VALUES (?, ?, 'owner')`,
        [project.id, ownerId]
      );
    }
    if (leadId) {
      await db.query(
        `INSERT IGNORE INTO project_members (project_id, user_id, role_in_project)
         VALUES (?, ?, 'lead')`,
        [project.id, leadId]
      );
    }
  }
}

async function seedAdminUser(db) {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '').trim();
  if (!email || !password) return;

  const name = String(process.env.ADMIN_NAME || 'GIT Admin').trim();
  const [rows] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  const passwordHash = await bcrypt.hash(password, 10);

  if (!rows.length) {
    await db.query(
      `INSERT INTO users
        (id, name, email, password_hash, role, department, is_active)
       VALUES (?, ?, ?, ?, 'admin', 'GIT', 1)`,
      [`u_admin_${Date.now().toString(36)}`, name, email, passwordHash]
    );
    return;
  }

  await db.query(
    `UPDATE users
     SET name = ?, password_hash = ?, role = 'admin', is_active = 1
     WHERE email = ?`,
    [name, passwordHash, email]
  );
}

export async function up(db) {
  if (await hasMigration(db, VERSION)) return false;

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(320) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'viewer',
      department VARCHAR(128) NULL,
      avatar_url VARCHAR(1024) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      last_login_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_users_role (role),
      INDEX idx_users_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(db, 'users', 'department', 'department VARCHAR(128) NULL AFTER role');
  await ensureColumn(db, 'users', 'avatar_url', 'avatar_url VARCHAR(1024) NULL AFTER department');
  await ensureColumn(db, 'users', 'is_active', 'is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER avatar_url');
  await ensureColumn(db, 'users', 'last_login_at', 'last_login_at TIMESTAMP NULL AFTER is_active');
  await ensureColumn(db, 'users', 'updated_at', 'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');

  await db.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      last_seen_at TIMESTAMP NULL,
      user_agent VARCHAR(512) NULL,
      ip VARCHAR(128) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_sessions_token_hash (token_hash),
      INDEX idx_sessions_user (user_id),
      INDEX idx_sessions_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(db, 'sessions', 'last_seen_at', 'last_seen_at TIMESTAMP NULL AFTER expires_at');
  await ensureColumn(db, 'sessions', 'user_agent', 'user_agent VARCHAR(512) NULL AFTER last_seen_at');
  await ensureColumn(db, 'sessions', 'ip', 'ip VARCHAR(128) NULL AFTER user_agent');

  await db.query(`
    CREATE TABLE IF NOT EXISTS project_members (
      project_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      role_in_project VARCHAR(32) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (project_id, user_id, role_in_project),
      INDEX idx_project_members_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(64) NULL,
      action VARCHAR(64) NOT NULL,
      entity_type VARCHAR(64) NOT NULL,
      entity_id VARCHAR(64) NOT NULL,
      before_json JSON NULL,
      after_json JSON NULL,
      ip VARCHAR(128) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_entity (entity_type, entity_id),
      INDEX idx_audit_user (user_id),
      INDEX idx_audit_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      type VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT NULL,
      link VARCHAR(1024) NULL,
      read_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notifications_user (user_id),
      INDEX idx_notifications_read (read_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureColumn(db, 'it_projects', 'owner_id', 'owner_id VARCHAR(64) NULL AFTER owner_email');
  await ensureColumn(db, 'it_projects', 'lead_id', 'lead_id VARCHAR(64) NULL AFTER lead_email');
  await ensureColumn(db, 'it_milestones', 'owner_id', 'owner_id VARCHAR(64) NULL AFTER owner');
  await ensureColumn(db, 'it_milestones', 'lead_id', 'lead_id VARCHAR(64) NULL AFTER lead_name');
  await ensureColumn(db, 'it_comments', 'user_id', 'user_id VARCHAR(64) NULL AFTER project_id');

  await ensureIndex(db, 'it_projects', 'idx_it_projects_owner_id', 'INDEX idx_it_projects_owner_id (owner_id)');
  await ensureIndex(db, 'it_projects', 'idx_it_projects_lead_id', 'INDEX idx_it_projects_lead_id (lead_id)');
  await ensureIndex(db, 'it_milestones', 'idx_it_milestones_owner_id', 'INDEX idx_it_milestones_owner_id (owner_id)');
  await ensureIndex(db, 'it_milestones', 'idx_it_milestones_lead_id', 'INDEX idx_it_milestones_lead_id (lead_id)');
  await ensureIndex(db, 'it_comments', 'idx_it_comments_user_id', 'INDEX idx_it_comments_user_id (user_id)');

  await backfillOwnerLeadUsers(db);
  await seedAdminUser(db);
  await recordMigration(db, VERSION, DESCRIPTION);
  return true;
}

export async function down(db) {
  await db.query('DROP TABLE IF EXISTS notifications');
  await db.query('DROP TABLE IF EXISTS audit_log');
  await db.query('DROP TABLE IF EXISTS project_members');
  await db.query('DROP TABLE IF EXISTS sessions');
  await db.query('DROP TABLE IF EXISTS users');

  for (const table of ['it_projects', 'it_milestones', 'it_comments']) {
    for (const column of ['owner_id', 'lead_id', 'user_id']) {
      const [rows] = await db.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
      );
      if (rows.length) {
        await db.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
      }
    }
  }

  await removeMigrationRecord(db, VERSION);
}

export default { version: VERSION, description: DESCRIPTION, up, down };
