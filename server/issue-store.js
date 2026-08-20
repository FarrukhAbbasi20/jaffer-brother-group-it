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
    issueRank: row.issue_rank || '',
    dueDate: dateStr(row.due_date),
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
  const [rows] = await db.query(
    `SELECT COALESCE(MAX(key_num), 0) AS max_num
     FROM issues
     WHERE ${projectId ? 'project_id = ?' : 'project_id IS NULL'}`,
    projectId ? [projectId] : []
  );
  return Number(rows[0]?.max_num || 0) + 1;
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
         i.sprint_id, i.issue_rank, i.due_date, i.legacy_milestone_id, i.created_at, i.updated_at,
         p.name AS project_name, p.project_key,
         ws.name AS status_name, ws.category AS status_category, ws.color AS status_color,
         reporter.name AS reporter_name,
         assignee.name AS assignee_name
  FROM issues i
  LEFT JOIN it_projects p ON p.id = i.project_id
  LEFT JOIN workflow_statuses ws ON ws.id = i.status_id
  LEFT JOIN users reporter ON reporter.id = i.reporter_id
  LEFT JOIN users assignee ON assignee.id = i.assignee_id
`;

export async function listIssues({ projectId = null, assigneeId = null, q = '' } = {}) {
  if (!useMysqlStorage()) return [];
  const db = await getMysqlPool();
  const where = [];
  const params = [];

  if (projectId) {
    where.push('i.project_id = ?');
    params.push(projectId);
  }
  if (assigneeId) {
    where.push('i.assignee_id = ?');
    params.push(assigneeId);
  }
  if (q) {
    where.push('(i.issue_key LIKE ? OR i.summary LIKE ? OR i.description LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const sql =
    ISSUE_SELECT +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY i.updated_at DESC, i.key_num DESC LIMIT 500';

  const [rows] = await db.query(sql, params);
  return rows.map(mapIssue);
}

export async function getIssueById(id) {
  if (!useMysqlStorage()) return null;
  const db = await getMysqlPool();
  const [rows] = await db.query(`${ISSUE_SELECT} WHERE i.id = ? LIMIT 1`, [id]);
  return rows[0] ? mapIssue(rows[0]) : null;
}

export async function getIssueByKey(issueKey) {
  if (!useMysqlStorage()) return null;
  const db = await getMysqlPool();
  const [rows] = await db.query(`${ISSUE_SELECT} WHERE i.issue_key = ? LIMIT 1`, [
    String(issueKey || '').trim().toUpperCase(),
  ]);
  return rows[0] ? mapIssue(rows[0]) : null;
}

export async function createIssue(input = {}) {
  if (!useMysqlStorage()) throw new Error('MySQL is not configured');
  const db = await getMysqlPool();
  const summary = String(input.summary || '').trim();
  if (!summary) throw new Error('Summary is required');

  const type = ISSUE_TYPES.includes(input.type) ? input.type : 'Task';
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
       due_date, legacy_milestone_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
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
      emptyToNull(input.legacyMilestoneId),
    ]
  );

  return getIssueById(id);
}

export async function updateIssue(id, patch = {}) {
  if (!useMysqlStorage()) throw new Error('MySQL is not configured');
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
         due_date = ?, story_points = ?, resolution = ?
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
      next.storyPoints,
      next.resolution,
      id,
    ]
  );

  return getIssueById(id);
}

function legacyStatusToWorkflowName(legacyStatus) {
  if (legacyStatus === 'Completed') return 'Done';
  if (legacyStatus === 'Blocked') return 'Blocked';
  if (legacyStatus === 'In Progress') return 'In Progress';
  return 'Backlog';
}

export async function upsertIssueFromMilestone(milestone) {
  if (!useMysqlStorage() || !milestone?.id) return null;
  if ((milestone.kind || 'task') === 'monthly') return null;

  const db = await getMysqlPool();
  const [statuses] = await db.query(
    `SELECT id, name FROM workflow_statuses WHERE project_id IS NULL`
  );
  const statusByName = new Map(statuses.map((row) => [row.name, row.id]));
  const statusId = statusByName.get(legacyStatusToWorkflowName(milestone.status));

  const [existing] = await db.query(
    `SELECT id FROM issues WHERE legacy_milestone_id = ? LIMIT 1`,
    [milestone.id]
  );

  if (existing.length) {
    await db.query(
      `UPDATE issues
       SET project_id = ?, summary = ?, description = ?, status_id = ?,
           reporter_id = ?, assignee_id = ?, parent_id = ?, due_date = ?
       WHERE legacy_milestone_id = ?`,
      [
        emptyToNull(milestone.projectId),
        String(milestone.title || '').trim() || 'Untitled task',
        emptyToNull(milestone.notes),
        statusId || null,
        emptyToNull(milestone.ownerId),
        emptyToNull(milestone.leadId),
        emptyToNull(milestone.parentId),
        emptyToNull(milestone.due),
        milestone.id,
      ]
    );
    return getIssueById(existing[0].id);
  }

  return createIssue({
    projectId: milestone.projectId || null,
    type: 'Task',
    summary: milestone.title,
    description: milestone.notes || '',
    statusId,
    reporterId: milestone.ownerId || null,
    assigneeId: milestone.leadId || null,
    parentId: milestone.parentId || null,
    dueDate: milestone.due || null,
    legacyMilestoneId: milestone.id,
    priority: 'Medium',
  });
}

export async function syncIssuesFromLegacyMilestones() {
  if (!useMysqlStorage()) return { synced: 0 };
  const db = await getMysqlPool();
  const [rows] = await db.query(
    `SELECT id, project_id, parent_id, title, notes, status, owner_id, lead_id, due_date, kind
     FROM it_milestones
     WHERE archived = 0 AND kind = 'task'
     ORDER BY created_at ASC`
  );

  let synced = 0;
  for (const row of rows) {
    await upsertIssueFromMilestone({
      id: row.id,
      projectId: row.project_id,
      parentId: row.parent_id,
      title: row.title,
      notes: row.notes,
      status: row.status,
      ownerId: row.owner_id,
      leadId: row.lead_id,
      due: dateStr(row.due_date),
      kind: row.kind,
    });
    synced += 1;
  }
  return { synced };
}
