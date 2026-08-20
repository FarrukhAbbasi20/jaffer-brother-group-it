import { hasMigration, recordMigration, removeMigrationRecord } from './helpers.js';

const VERSION = '002_issue_layer';
const DESCRIPTION = 'Add Jira-style issue layer, workflow statuses, sprints, epics, and task migration bridge.';

async function ensureColumn(db, table, column, ddl) {
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (!cols.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

async function ensureDefaultWorkflowStatuses(db) {
  const defaults = [
    ['Backlog', 'todo', 10, '#94A3B8'],
    ['Selected for Work', 'todo', 20, '#64748B'],
    ['In Progress', 'in_progress', 30, '#10B981'],
    ['In Review', 'in_progress', 40, '#3B82F6'],
    ['Blocked', 'in_progress', 50, '#EF4444'],
    ['Done', 'done', 60, '#2563EB'],
  ];

  for (const [name, category, orderIndex, color] of defaults) {
    await db.query(
      `INSERT INTO workflow_statuses (id, project_id, name, category, order_index, color)
       SELECT ?, NULL, ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM workflow_statuses WHERE project_id IS NULL AND name = ?
       )`,
      [`ws_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, name, category, orderIndex, color, name]
    );
  }
}

async function ensureProjectKeys(db) {
  await ensureColumn(db, 'it_projects', 'project_key', 'project_key VARCHAR(6) NULL AFTER name');
  const [projects] = await db.query(
    `SELECT id, name, project_key FROM it_projects WHERE archived = 0 ORDER BY created_at ASC`
  );

  const used = new Set(
    projects.map((p) => String(p.project_key || '').trim()).filter(Boolean)
  );

  for (const project of projects) {
    if (project.project_key) continue;
    const raw = String(project.name || 'GIT')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 6) || 'GIT';

    let key = raw.slice(0, 6);
    let n = 1;
    while (used.has(key)) {
      const suffix = String(n++);
      key = `${raw.slice(0, Math.max(2, 6 - suffix.length))}${suffix}`;
    }
    used.add(key);
    await db.query('UPDATE it_projects SET project_key = ? WHERE id = ?', [key, project.id]);
  }
}

async function migrateMilestonesToIssues(db) {
  const [statusRows] = await db.query(
    `SELECT id, name FROM workflow_statuses WHERE project_id IS NULL`
  );
  const statusByName = new Map(statusRows.map((row) => [row.name, row.id]));
  const pickStatusId = (legacyStatus) => {
    if (legacyStatus === 'Completed') return statusByName.get('Done');
    if (legacyStatus === 'Blocked') return statusByName.get('Blocked');
    if (legacyStatus === 'In Progress') return statusByName.get('In Progress');
    if (legacyStatus === 'Not Started') return statusByName.get('Backlog');
    return statusByName.get('Backlog');
  };

  const [projects] = await db.query(
    'SELECT id, project_key, owner_id, lead_id FROM it_projects WHERE archived = 0'
  );
  const projectKeyById = new Map(projects.map((p) => [p.id, p.project_key]));

  const [rows] = await db.query(
    `SELECT id, project_id, parent_id, title, notes, status, owner, lead_name, owner_id, lead_id, due_date, created_at, updated_at
     FROM it_milestones
     WHERE archived = 0 AND kind = 'task'
     ORDER BY created_at ASC`
  );

  const keyCounters = new Map();
  for (const project of projects) {
    const [maxRows] = await db.query(
      `SELECT COALESCE(MAX(key_num), 0) AS max_num FROM issues WHERE project_id = ?`,
      [project.id]
    );
    keyCounters.set(project.id, Number(maxRows[0]?.max_num || 0));
  }
  {
    const [maxRows] = await db.query(
      `SELECT COALESCE(MAX(key_num), 0) AS max_num FROM issues WHERE project_id IS NULL`
    );
    keyCounters.set('__GIT__', Number(maxRows[0]?.max_num || 0));
  }

  for (const row of rows) {
    const projectId = row.project_id || null;
    const projectKey = projectId ? projectKeyById.get(projectId) || 'GIT' : 'GIT';
    const counterKey = projectId || '__GIT__';
    const nextNum = (keyCounters.get(counterKey) || 0) + 1;
    keyCounters.set(counterKey, nextNum);

    await db.query(
      `INSERT INTO issues
        (id, project_id, key_num, issue_key, type, summary, description, status_id,
         resolution, priority, epic_id, parent_id, reporter_id, assignee_id,
         story_points, original_estimate_h, logged_h, sprint_id, fix_version_id, issue_rank,
         due_date, legacy_milestone_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Task', ?, ?, ?, NULL, 'Medium', NULL, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         project_id = VALUES(project_id),
         status_id = VALUES(status_id),
         summary = VALUES(summary),
         description = VALUES(description),
         reporter_id = VALUES(reporter_id),
         assignee_id = VALUES(assignee_id),
         parent_id = VALUES(parent_id),
         due_date = VALUES(due_date),
         updated_at = VALUES(updated_at)`,
      [
        `iss_${row.id}`,
        projectId,
        nextNum,
        `${projectKey}-${nextNum}`,
        row.title,
        row.notes || null,
        pickStatusId(row.status),
        row.parent_id || null,
        row.owner_id || null,
        row.lead_id || null,
        `${Date.now().toString(36)}_${nextNum.toString(36)}`,
        row.due_date || null,
        row.id,
        row.created_at,
        row.updated_at,
      ]
    );
  }
}

export async function up(db) {
  if (await hasMigration(db, VERSION)) return false;

  await ensureProjectKeys(db);

  await db.query(`
    CREATE TABLE IF NOT EXISTS workflow_statuses (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      project_id VARCHAR(64) NULL,
      name VARCHAR(128) NOT NULL,
      category VARCHAR(32) NOT NULL,
      order_index INT NOT NULL DEFAULT 0,
      color VARCHAR(32) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_workflow_project (project_id),
      INDEX idx_workflow_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sprints (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      project_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      goal TEXT NULL,
      start_date DATE NULL,
      end_date DATE NULL,
      state VARCHAR(32) NOT NULL DEFAULT 'future',
      committed_points INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_sprints_project (project_id),
      INDEX idx_sprints_state (state)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS epics (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      project_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      color VARCHAR(32) NULL,
      summary TEXT NULL,
      status VARCHAR(64) NOT NULL DEFAULT 'Backlog',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_epics_project (project_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS issues (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      project_id VARCHAR(64) NULL,
      key_num INT NOT NULL,
      issue_key VARCHAR(32) NOT NULL UNIQUE,
      type VARCHAR(32) NOT NULL DEFAULT 'Task',
      summary VARCHAR(512) NOT NULL,
      description MEDIUMTEXT NULL,
      status_id VARCHAR(64) NULL,
      resolution VARCHAR(64) NULL,
      priority VARCHAR(32) NOT NULL DEFAULT 'Medium',
      epic_id VARCHAR(64) NULL,
      parent_id VARCHAR(64) NULL,
      reporter_id VARCHAR(64) NULL,
      assignee_id VARCHAR(64) NULL,
      story_points INT NULL,
      original_estimate_h DECIMAL(10,2) NULL,
      logged_h DECIMAL(10,2) NULL,
      sprint_id VARCHAR(64) NULL,
      fix_version_id VARCHAR(64) NULL,
      issue_rank VARCHAR(128) NULL,
      due_date DATE NULL,
      legacy_milestone_id VARCHAR(64) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_issues_legacy_milestone (legacy_milestone_id),
      INDEX idx_issues_project (project_id),
      INDEX idx_issues_status (status_id),
      INDEX idx_issues_assignee (assignee_id),
      INDEX idx_issues_reporter (reporter_id),
      INDEX idx_issues_fix_version (fix_version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS issue_links (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      from_issue_id VARCHAR(64) NOT NULL,
      to_issue_id VARCHAR(64) NOT NULL,
      link_type VARCHAR(32) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_issue_links_from (from_issue_id),
      INDEX idx_issue_links_to (to_issue_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS issue_labels (
      issue_id VARCHAR(64) NOT NULL,
      label VARCHAR(64) NOT NULL,
      PRIMARY KEY (issue_id, label)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS watchers (
      issue_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (issue_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS attachments (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      issue_id VARCHAR(64) NOT NULL,
      filename VARCHAR(512) NOT NULL,
      url VARCHAR(2048) NOT NULL,
      size BIGINT NOT NULL DEFAULT 0,
      uploaded_by VARCHAR(64) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_attachments_issue (issue_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS work_logs (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      issue_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      hours DECIMAL(10,2) NOT NULL,
      note TEXT NULL,
      logged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_work_logs_issue (issue_id),
      INDEX idx_work_logs_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS saved_filters (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      query_json JSON NOT NULL,
      is_shared TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_saved_filters_user (user_id),
      INDEX idx_saved_filters_shared (is_shared)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureDefaultWorkflowStatuses(db);
  await migrateMilestonesToIssues(db);
  await recordMigration(db, VERSION, DESCRIPTION);
  return true;
}

export async function down(db) {
  for (const table of [
    'saved_filters',
    'work_logs',
    'attachments',
    'watchers',
    'issue_labels',
    'issue_links',
    'issues',
    'epics',
    'sprints',
    'workflow_statuses',
  ]) {
    await db.query(`DROP TABLE IF EXISTS ${table}`);
  }

  const [projectKeyCol] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'it_projects' AND COLUMN_NAME = 'project_key'`
  );
  if (projectKeyCol.length) {
    await db.query('ALTER TABLE it_projects DROP COLUMN project_key');
  }

  await removeMigrationRecord(db, VERSION);
}

export default { version: VERSION, description: DESCRIPTION, up, down };
