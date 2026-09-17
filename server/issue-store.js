import { getMysqlPool, useMysqlStorage } from './db.js';

const ISSUE_TYPES = ['Epic', 'Story', 'Task', 'Bug', 'Change Request', 'Sub-task'];
const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];

function dateStr(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function emptyToNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function mapStatus(row) {
  return {
    id: row.id,
    projectId: row.project_id || null,
    name: row.name,
    category: row.category,
    orderIndex: Number(row.order_index) || 0,
    color: row.color || '#94A3B8',
  };
}

function mapIssue(row) {
  return {
    id: row.id,
    projectId: row.project_id || null,
    projectName: row.project_name || '',
    projectKey: row.project_key || '',
    keyNum: Number(row.key_num) || 0,
    key: row.issue_key,
    type: row.type || 'Task',
    summary: row.summary,
    description: row.description || '',
    statusId: row.status_id || null,
    status: row.status_name || '',
    statusCategory: row.status_category || '',
    statusColor: row.status_color || '#94A3B8',
    resolution: row.resolution || '',
    priority: row.priority || 'Medium',
    epicId: row.epic_id || null,
    parentId: row.parent_id || null,
    reporterId: row.reporter_id || null,
    reporterName: row.reporter_name || '',
    assigneeId: row.assignee_id || null,
    assigneeName: row.assignee_name || '',
    storyPoints: row.story_points == null ? null : Number(row.story_points),
    originalEstimateH:
      row.original_estimate_h == null ? null : Number(row.original_estimate_h),
    loggedH: row.logged_h == null ? null : Number(row.logged_h),
    sprintId: row.sprint_id || null,
    sprintName: row.sprint_name || '',
    issueRank: row.issue_rank || '',
    dueDate: dateStr(row.due_date),
    actualComplete: dateStr(row.actual_complete_date),
    legacyMilestoneId: row.legacy_milestone_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function listIssueTypes() {
  return [...ISSUE_TYPES];
}

export function listIssuePriorities() {
  return [...PRIORITIES];
}

export async function listWorkflowStatuses(projectId = null) {
  if (!useMysqlStorage()) return [];
  const db = await getMysqlPool();
  const [rows] = await db.query(
    `SELECT id, project_id, name, category, order_index, color
     FROM workflow_statuses
     WHERE project_id IS NULL OR project_id = ?
     ORDER BY order_index ASC, name ASC`,
    [projectId || null]
  );
  return rows.map(mapStatus);
}

async function nextKeyNum(db, projectId) {
  // issue_key is globally unique (e.g. GIT-1). Advance across the whole
  // project_key namespace using both key_num and the numeric key suffix.
  const projectKey = await resolveProjectKey(db, projectId);
  const [rows] = await db.query(
    `SELECT
       COALESCE(MAX(key_num), 0) AS max_num,
       COALESCE(MAX(CAST(SUBSTRING_INDEX(issue_key, '-', -1) AS UNSIGNED)), 0) AS max_suffix
     FROM issues
     WHERE issue_key LIKE ?`,
    [`${projectKey}-%`]
  );
  return Math.max(Number(rows[0]?.max_num || 0), Number(rows[0]?.max_suffix || 0)) + 1;
}

async function resolveProjectKey(db, projectId) {
  if (!projectId) return 'GIT';
  const [rows] = await db.query(
    'SELECT project_key, name FROM it_projects WHERE id = ? LIMIT 1',
    [projectId]
  );
  if (!rows.length) return 'GIT';
  if (rows[0].project_key) return rows[0].project_key;
  return 'GIT';
}

const ISSUE_SELECT = `
  SELECT i.id, i.project_id, i.key_num, i.issue_key, i.type, i.summary, i.description,
         i.status_id, i.resolution, i.priority, i.epic_id, i.parent_id,
         i.reporter_id, i.assignee_id, i.story_points, i.original_estimate_h, i.logged_h,
         i.sprint_id, i.issue_rank, i.due_date, i.actual_complete_date, i.legacy_milestone_id, i.created_at, i.updated_at,
         p.name AS project_name, p.project_key,
         ws.name AS status_name, ws.category AS status_category, ws.color AS status_color,
         reporter.name AS reporter_name,
         assignee.name AS assignee_name,
         sp.name AS sprint_name
  FROM issues i
  LEFT JOIN it_projects p ON p.id = i.project_id
  LEFT JOIN workflow_statuses ws ON ws.id = i.status_id
  LEFT JOIN users reporter ON reporter.id = i.reporter_id
  LEFT JOIN users assignee ON assignee.id = i.assignee_id
  LEFT JOIN sprints sp ON sp.id = i.sprint_id
`;

let issueActualColReady = null;
async function ensureIssueActualCompleteColumn() {
  if (!useMysqlStorage()) return;
  if (issueActualColReady) return issueActualColReady;
  issueActualColReady = (async () => {
    const db = await getMysqlPool();
    const [cols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'issues' AND COLUMN_NAME = 'actual_complete_date'`
    );
    if (!cols.length) {
      await db.query(
        `ALTER TABLE issues ADD COLUMN actual_complete_date DATE NULL AFTER due_date`
      );
    }
  })();
  return issueActualColReady;
}

let issueArchivedColReady = null;
async function ensureIssueArchivedColumn() {
  if (!useMysqlStorage()) return;
  if (issueArchivedColReady) return issueArchivedColReady;
  issueArchivedColReady = (async () => {
    const db = await getMysqlPool();
    const [cols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'issues' AND COLUMN_NAME = 'archived'`
    );
    if (!cols.length) {
      await db.query(
        `ALTER TABLE issues
         ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0 AFTER legacy_milestone_id,
         ADD INDEX idx_issues_archived (archived)`
      );
    }
  })();
  return issueArchivedColReady;
}

let misplacedArchiveReady = null;
/**
 * Soft-archive Issues that belong on Tasks (or are QA junk).
 * Covers legacy mirrors and rows that were wrongly "promoted" by clearing legacy_milestone_id.
 */
export async function archiveMisplacedTaskIssues() {
  if (!useMysqlStorage()) return { archived: 0 };
  await ensureIssueActualCompleteColumn();
  await ensureIssueArchivedColumn();
  const db = await getMysqlPool();
  let archived = 0;

  const [bridge] = await db.query(
    `UPDATE issues SET archived = 1
     WHERE archived = 0 AND legacy_milestone_id IS NOT NULL`
  );
  archived += Number(bridge?.affectedRows) || 0;

  // Promoted duplicates: same project + same title as an active Tasks row.
  const [dupes] = await db.query(
    `UPDATE issues i
     INNER JOIN it_milestones m
       ON m.archived = 0
      AND COALESCE(m.kind, 'task') = 'task'
      AND m.title = i.summary
      AND (
        (m.project_id IS NULL AND i.project_id IS NULL)
        OR m.project_id = i.project_id
      )
     SET i.archived = 1
     WHERE i.archived = 0`
  );
  archived += Number(dupes?.affectedRows) || 0;

  const [qa] = await db.query(
    `UPDATE issues SET archived = 1
     WHERE archived = 0 AND (
       summary LIKE 'QA-TEST%'
       OR summary LIKE '%QA-TEST-2026%'
     )`
  );
  archived += Number(qa?.affectedRows) || 0;

  return { archived };
}

async function ensureIssueSchema() {
  await ensureIssueActualCompleteColumn();
  await ensureIssueArchivedColumn();
  if (!misplacedArchiveReady) {
    misplacedArchiveReady = archiveMisplacedTaskIssues().catch((err) => {
      misplacedArchiveReady = null;
      console.error('archiveMisplacedTaskIssues failed (non-fatal):', err?.message || err);
    });
  }
  await misplacedArchiveReady;
}

export async function listIssues({
  projectId = null,
  assigneeId = null,
  reporterId = null,
  statusId = null,
  type = null,
  priority = null,
  sprintId = null,
  backlogOnly = false,
  q = '',
  order = 'updated',
} = {}) {
  if (!useMysqlStorage()) return [];
  await ensureIssueSchema();
  const db = await getMysqlPool();
  // Hide task-bridge rows: operational work lives on Tasks, not Issues.
  const where = ['i.archived = 0', 'i.legacy_milestone_id IS NULL'];
  const params = [];

  if (projectId) {
    where.push('i.project_id = ?');
    params.push(projectId);
  }
  if (assigneeId) {
    where.push('i.assignee_id = ?');
    params.push(assigneeId);
  }
  if (reporterId) {
    where.push('i.reporter_id = ?');
    params.push(reporterId);
  }
  if (statusId) {
    where.push('i.status_id = ?');
    params.push(statusId);
  }
  if (type) {
    where.push('i.type = ?');
    params.push(type);
  }
  if (priority) {
    where.push('i.priority = ?');
    params.push(priority);
  }
  if (sprintId === 'none') {
    where.push('i.sprint_id IS NULL');
  } else if (sprintId) {
    where.push('i.sprint_id = ?');
    params.push(sprintId);
  }
  if (backlogOnly) {
    where.push(`(ws.category = 'todo' OR ws.name IN ('Backlog', 'Selected for Work') OR i.status_id IS NULL)`);
    where.push('i.sprint_id IS NULL');
  }
  if (q) {
    where.push('(i.issue_key LIKE ? OR i.summary LIKE ? OR i.description LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  let orderSql = 'i.updated_at DESC, i.key_num DESC';
  if (order === 'backlog') orderSql = 'i.issue_rank ASC, i.key_num ASC';
  if (order === 'key') orderSql = 'i.project_id ASC, i.key_num ASC';
  if (order === 'priority') {
    orderSql = `FIELD(i.priority, 'Highest', 'High', 'Medium', 'Low', 'Lowest'), i.updated_at DESC`;
  }

  const sql =
    ISSUE_SELECT +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY ${orderSql} LIMIT 500`;

  const [rows] = await db.query(sql, params);
  return rows.map(mapIssue);
}

export async function getIssueById(id) {
  if (!useMysqlStorage()) return null;
  await ensureIssueSchema();
  const db = await getMysqlPool();
  const [rows] = await db.query(
    `${ISSUE_SELECT} WHERE i.id = ? AND i.archived = 0 LIMIT 1`,
    [id]
  );
  return rows[0] ? mapIssue(rows[0]) : null;
}

export async function getIssueByKey(issueKey) {
  if (!useMysqlStorage()) return null;
  await ensureIssueSchema();
  const db = await getMysqlPool();
  const [rows] = await db.query(
    `${ISSUE_SELECT} WHERE i.issue_key = ? AND i.archived = 0 LIMIT 1`,
    [String(issueKey || '').trim().toUpperCase()]
  );
  return rows[0] ? mapIssue(rows[0]) : null;
}

export async function createIssue(input = {}) {
  if (!useMysqlStorage()) throw new Error('MySQL is not configured');
  await ensureIssueSchema();
  const db = await getMysqlPool();
  const summary = String(input.summary || '').trim();
  if (!summary) throw new Error('Summary is required');

  // Default to Bug — operational work belongs in Tasks, not Issues type=Task.
  const type = ISSUE_TYPES.includes(input.type) ? input.type : 'Bug';
  const priority = PRIORITIES.includes(input.priority) ? input.priority : 'Medium';
  const projectId = emptyToNull(input.projectId);
  const keyNum = await nextKeyNum(db, projectId);
  const projectKey = await resolveProjectKey(db, projectId);
  const issueKey = `${projectKey}-${keyNum}`;
  const id = `iss_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;

  let statusId = emptyToNull(input.statusId);
  if (!statusId) {
    const [defaults] = await db.query(
      `SELECT id FROM workflow_statuses
       WHERE project_id IS NULL AND name = 'Backlog'
       LIMIT 1`
    );
    statusId = defaults[0]?.id || null;
  }

  await db.query(
    `INSERT INTO issues
      (id, project_id, key_num, issue_key, type, summary, description, status_id,
       resolution, priority, epic_id, parent_id, reporter_id, assignee_id,
       story_points, original_estimate_h, logged_h, sprint_id, fix_version_id, issue_rank,
       due_date, actual_complete_date, legacy_milestone_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    [
      id,
      projectId,
      keyNum,
      issueKey,
      type,
      summary,
      emptyToNull(input.description),
      statusId,
      priority,
      emptyToNull(input.epicId),
      emptyToNull(input.parentId),
      emptyToNull(input.reporterId),
      emptyToNull(input.assigneeId),
      input.storyPoints == null || input.storyPoints === '' ? null : Number(input.storyPoints),
      input.originalEstimateH == null || input.originalEstimateH === ''
        ? null
        : Number(input.originalEstimateH),
      input.loggedH == null || input.loggedH === '' ? null : Number(input.loggedH),
      emptyToNull(input.sprintId),
      emptyToNull(input.issueRank) || `${Date.now().toString(36)}_${keyNum}`,
      emptyToNull(input.dueDate),
      emptyToNull(input.actualComplete),
      emptyToNull(input.legacyMilestoneId),
    ]
  );

  return getIssueById(id);
}

export async function archiveIssue(id) {
  if (!useMysqlStorage()) throw new Error('MySQL is not configured');
  await ensureIssueSchema();
  const current = await getIssueById(id);
  if (!current) {
    const err = new Error('Issue not found');
    err.status = 404;
    throw err;
  }

  const db = await getMysqlPool();
  // Archive the issue only — never cascade into Tasks/milestones.
  await db.query('UPDATE issues SET archived = 1 WHERE id = ? AND archived = 0', [id]);

  return current;
}

/** Soft-archive any Issues row that was mirrored from a Tasks milestone. */
export async function archiveIssuesLinkedToMilestone(milestoneId) {
  if (!useMysqlStorage() || !milestoneId) return 0;
  await ensureIssueSchema();
  const db = await getMysqlPool();
  const [result] = await db.query(
    'UPDATE issues SET archived = 1 WHERE legacy_milestone_id = ? AND archived = 0',
    [String(milestoneId)]
  );
  return Number(result?.affectedRows) || 0;
}

export async function updateIssue(id, patch = {}) {
  if (!useMysqlStorage()) throw new Error('MySQL is not configured');
  await ensureIssueSchema();
  const current = await getIssueById(id);
  if (!current) {
    const err = new Error('Issue not found');
    err.status = 404;
    throw err;
  }

  const db = await getMysqlPool();
  const next = {
    summary:
      patch.summary != null ? String(patch.summary).trim() : current.summary,
    description:
      patch.description != null ? emptyToNull(patch.description) : current.description || null,
    type: ISSUE_TYPES.includes(patch.type) ? patch.type : current.type,
    priority: PRIORITIES.includes(patch.priority) ? patch.priority : current.priority,
    statusId:
      patch.statusId !== undefined ? emptyToNull(patch.statusId) : current.statusId,
    assigneeId:
      patch.assigneeId !== undefined ? emptyToNull(patch.assigneeId) : current.assigneeId,
    reporterId:
      patch.reporterId !== undefined ? emptyToNull(patch.reporterId) : current.reporterId,
    epicId: patch.epicId !== undefined ? emptyToNull(patch.epicId) : current.epicId,
    parentId:
      patch.parentId !== undefined ? emptyToNull(patch.parentId) : current.parentId,
    sprintId:
      patch.sprintId !== undefined ? emptyToNull(patch.sprintId) : current.sprintId,
    dueDate: patch.dueDate !== undefined ? emptyToNull(patch.dueDate) : current.dueDate || null,
    actualComplete:
      patch.actualComplete !== undefined
        ? emptyToNull(patch.actualComplete)
        : current.actualComplete || null,
    storyPoints:
      patch.storyPoints !== undefined
        ? patch.storyPoints === '' || patch.storyPoints == null
          ? null
          : Number(patch.storyPoints)
        : current.storyPoints,
    resolution:
      patch.resolution !== undefined ? emptyToNull(patch.resolution) : current.resolution || null,
  };

  if (!next.summary) throw new Error('Summary is required');

  await db.query(
    `UPDATE issues
     SET summary = ?, description = ?, type = ?, priority = ?, status_id = ?,
         assignee_id = ?, reporter_id = ?, epic_id = ?, parent_id = ?, sprint_id = ?,
         due_date = ?, actual_complete_date = ?, story_points = ?, resolution = ?,
         issue_rank = COALESCE(?, issue_rank)
     WHERE id = ?`,
    [
      next.summary,
      next.description,
      next.type,
      next.priority,
      next.statusId,
      next.assigneeId,
      next.reporterId,
      next.epicId,
      next.parentId,
      next.sprintId,
      next.dueDate,
      next.actualComplete,
      next.storyPoints,
      next.resolution,
      patch.issueRank !== undefined ? emptyToNull(patch.issueRank) : null,
      id,
    ]
  );

  const issue = await getIssueById(id);
  await syncLegacyMilestoneFromIssue(issue);
  return issue;
}

async function syncLegacyMilestoneFromIssue(issue) {
  if (!issue?.legacyMilestoneId) return;
  const db = await getMysqlPool();
  const legacyStatus =
    issue.status === 'Done'
      ? 'Completed'
      : issue.status === 'Blocked'
        ? 'Blocked'
        : issue.status === 'In Progress' || issue.status === 'In Review'
          ? 'In Progress'
          : 'Not Started';

  let ownerName = issue.reporterName || null;
  let leadName = issue.assigneeName || null;
  if (issue.reporterId && !ownerName) {
    const [rows] = await db.query('SELECT name FROM users WHERE id = ? LIMIT 1', [issue.reporterId]);
    ownerName = rows[0]?.name || null;
  }
  if (issue.assigneeId && !leadName) {
    const [rows] = await db.query('SELECT name FROM users WHERE id = ? LIMIT 1', [issue.assigneeId]);
    leadName = rows[0]?.name || null;
  }

  await db.query(
    `UPDATE it_milestones
     SET title = ?, notes = ?, status = ?, owner = COALESCE(?, owner), lead_name = COALESCE(?, lead_name),
         owner_id = ?, lead_id = ?, due_date = ?
     WHERE id = ? AND archived = 0`,
    [
      issue.summary,
      emptyToNull(issue.description),
      legacyStatus,
      ownerName,
      leadName,
      emptyToNull(issue.reporterId),
      emptyToNull(issue.assigneeId),
      emptyToNull(issue.dueDate),
      issue.legacyMilestoneId,
    ]
  );
}

export async function reorderIssues(orderedIds = []) {
  if (!useMysqlStorage()) return [];
  const db = await getMysqlPool();
  const ids = (orderedIds || []).map(String).filter(Boolean);
  for (let i = 0; i < ids.length; i += 1) {
    const rank = String(i + 1).padStart(6, '0');
    await db.query('UPDATE issues SET issue_rank = ? WHERE id = ?', [rank, ids[i]]);
  }
  return listIssues({ order: 'backlog' });
}

function mapSprint(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name || '',
    name: row.name,
    goal: row.goal || '',
    startDate: dateStr(row.start_date),
    endDate: dateStr(row.end_date),
    state: row.state || 'future',
    committedPoints: Number(row.committed_points) || 0,
    issueCount: Number(row.issue_count) || 0,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function listSprints(projectId = null) {
  if (!useMysqlStorage()) return [];
  const db = await getMysqlPool();
  const params = [];
  let where = '';
  if (projectId) {
    where = 'WHERE s.project_id = ?';
    params.push(projectId);
  }
  const [rows] = await db.query(
    `SELECT s.*, p.name AS project_name,
            (SELECT COUNT(*) FROM issues i WHERE i.sprint_id = s.id) AS issue_count
     FROM sprints s
     LEFT JOIN it_projects p ON p.id = s.project_id
     ${where}
     ORDER BY FIELD(s.state, 'active', 'future', 'closed'), s.start_date DESC, s.created_at DESC`,
    params
  );
  return rows.map(mapSprint);
}

export async function createSprint(input = {}) {
  if (!useMysqlStorage()) throw new Error('MySQL is not configured');
  const db = await getMysqlPool();
  const projectId = emptyToNull(input.projectId);
  const name = String(input.name || '').trim();
  if (!projectId) throw new Error('Project is required for a sprint');
  if (!name) throw new Error('Sprint name is required');
  const id = `spr_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  await db.query(
    `INSERT INTO sprints
      (id, project_id, name, goal, start_date, end_date, state, committed_points)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      projectId,
      name,
      emptyToNull(input.goal),
      emptyToNull(input.startDate),
      emptyToNull(input.endDate),
      input.state === 'active' ? 'active' : 'future',
    ]
  );
  const [rows] = await db.query(
    `SELECT s.*, p.name AS project_name, 0 AS issue_count
     FROM sprints s LEFT JOIN it_projects p ON p.id = s.project_id
     WHERE s.id = ? LIMIT 1`,
    [id]
  );
  return mapSprint(rows[0]);
}

export async function updateSprint(id, patch = {}) {
  if (!useMysqlStorage()) throw new Error('MySQL is not configured');
  const db = await getMysqlPool();
  const [existing] = await db.query('SELECT * FROM sprints WHERE id = ? LIMIT 1', [id]);
  if (!existing.length) {
    const err = new Error('Sprint not found');
    err.status = 404;
    throw err;
  }
  const cur = existing[0];
  const next = {
    name: patch.name != null ? String(patch.name).trim() : cur.name,
    goal: patch.goal !== undefined ? emptyToNull(patch.goal) : cur.goal,
    startDate: patch.startDate !== undefined ? emptyToNull(patch.startDate) : dateStr(cur.start_date),
    endDate: patch.endDate !== undefined ? emptyToNull(patch.endDate) : dateStr(cur.end_date),
    state: ['future', 'active', 'closed'].includes(patch.state) ? patch.state : cur.state,
  };
  if (!next.name) throw new Error('Sprint name is required');
  if (next.state === 'active') {
    await db.query(
      `UPDATE sprints SET state = 'future' WHERE project_id = ? AND state = 'active' AND id <> ?`,
      [cur.project_id, id]
    );
  }
  await db.query(
    `UPDATE sprints
     SET name = ?, goal = ?, start_date = ?, end_date = ?, state = ?
     WHERE id = ?`,
    [next.name, next.goal, next.startDate, next.endDate, next.state, id]
  );
  const list = await listSprints(cur.project_id);
  return list.find((s) => s.id === id) || null;
}

export async function listSavedFilters(userId) {
  if (!useMysqlStorage()) return [];
  const db = await getMysqlPool();
  const [rows] = await db.query(
    `SELECT id, user_id, name, query_json, is_shared, created_at, updated_at
     FROM saved_filters
     WHERE user_id = ? OR is_shared = 1
     ORDER BY updated_at DESC`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    query: typeof row.query_json === 'string' ? JSON.parse(row.query_json) : row.query_json,
    isShared: Boolean(row.is_shared),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function createSavedFilter({ userId, name, query, isShared = false }) {
  if (!useMysqlStorage()) throw new Error('MySQL is not configured');
  const db = await getMysqlPool();
  const id = `sf_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  await db.query(
    `INSERT INTO saved_filters (id, user_id, name, query_json, is_shared)
     VALUES (?, ?, ?, ?, ?)`,
    [id, userId, String(name || '').trim(), JSON.stringify(query || {}), isShared ? 1 : 0]
  );
  const filters = await listSavedFilters(userId);
  return filters.find((f) => f.id === id);
}

export async function deleteSavedFilter(id, userId) {
  if (!useMysqlStorage()) return false;
  const db = await getMysqlPool();
  await db.query('DELETE FROM saved_filters WHERE id = ? AND user_id = ?', [id, userId]);
  return true;
}

/**
 * Intentionally disabled: Tasks (it_milestones) must not be mirrored into Issues.
 * Kept as a no-op export so older call sites / migrations stay safe.
 */
export async function upsertIssueFromMilestone(_milestone) {
  return null;
}

/** Disabled — Tasks stay on the Tasks module; Issues are created only via Issues UI/API. */
export async function syncIssuesFromLegacyMilestones() {
  return { synced: 0, skipped: 0, disabled: true };
}
