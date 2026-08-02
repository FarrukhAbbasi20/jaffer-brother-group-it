import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { getMysqlPool, useMysqlStorage } from './db.js';

let itTablesReady = null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ensureColumn(db, table, column, ddl) {
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (!cols.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

/** Create ONLY it_* tables. Never DROP / TRUNCATE existing tables. */
export async function ensureItTables() {
  if (!useMysqlStorage()) return false;
  if (itTablesReady) return itTablesReady;
  itTablesReady = (async () => {
    const db = await getMysqlPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS it_projects (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        name VARCHAR(512) NOT NULL,
        category VARCHAR(128) NULL,
        owner VARCHAR(256) NULL,
        lead_name VARCHAR(256) NULL,
        status VARCHAR(64) NOT NULL DEFAULT 'Not Started',
        priority VARCHAR(32) NOT NULL DEFAULT 'Medium',
        start_date DATE NULL,
        end_date DATE NULL,
        budget VARCHAR(128) NULL,
        progress INT NOT NULL DEFAULT 0,
        notes TEXT NULL,
        archived TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_it_projects_archived (archived),
        INDEX idx_it_projects_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS it_milestones (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        project_id VARCHAR(64) NOT NULL,
        title VARCHAR(512) NOT NULL,
        due_date DATE NULL,
        status VARCHAR(64) NOT NULL DEFAULT 'Not Started',
        owner VARCHAR(256) NULL,
        notes TEXT NULL,
        kind VARCHAR(32) NOT NULL DEFAULT 'task',
        archived TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_it_milestones_project (project_id),
        INDEX idx_it_milestones_archived (archived),
        CONSTRAINT fk_it_milestones_project
          FOREIGN KEY (project_id) REFERENCES it_projects(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await ensureColumn(db, 'it_projects', 'lead_name', 'lead_name VARCHAR(256) NULL AFTER owner');
    await ensureColumn(db, 'it_projects', 'owner_email', 'owner_email VARCHAR(320) NULL AFTER lead_name');
    await ensureColumn(db, 'it_projects', 'lead_email', 'lead_email VARCHAR(320) NULL AFTER owner_email');
    await ensureColumn(db, 'it_milestones', 'notes', 'notes TEXT NULL AFTER owner');
    await ensureColumn(db, 'it_milestones', 'kind', "kind VARCHAR(32) NOT NULL DEFAULT 'task' AFTER notes");

    // Allow standalone tasks/milestones (no project link).
    try {
      const [fks] = await db.query(
        `SELECT CONSTRAINT_NAME AS name FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'it_milestones'
           AND COLUMN_NAME = 'project_id' AND REFERENCED_TABLE_NAME IS NOT NULL`
      );
      for (const fk of fks) {
        await db.query(`ALTER TABLE it_milestones DROP FOREIGN KEY \`${fk.name}\``);
      }
      await db.query(`ALTER TABLE it_milestones MODIFY project_id VARCHAR(64) NULL`);
    } catch (err) {
      console.warn('Nullable project_id migration:', err.message || err);
    }

    try {
      const [cfks] = await db.query(
        `SELECT CONSTRAINT_NAME AS name FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'it_comments'
           AND COLUMN_NAME = 'project_id' AND REFERENCED_TABLE_NAME IS NOT NULL`
      );
      for (const fk of cfks) {
        await db.query(`ALTER TABLE it_comments DROP FOREIGN KEY \`${fk.name}\``);
      }
      await db.query(`ALTER TABLE it_comments MODIFY project_id VARCHAR(64) NULL`);
    } catch (err) {
      console.warn('Nullable comment project_id migration:', err.message || err);
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS it_comments (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        project_id VARCHAR(64) NULL,
        milestone_id VARCHAR(64) NOT NULL,
        author_role VARCHAR(32) NOT NULL,
        author_name VARCHAR(256) NULL,
        author_email VARCHAR(320) NULL,
        body TEXT NOT NULL,
        archived TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_it_comments_milestone (milestone_id),
        INDEX idx_it_comments_project (project_id),
        INDEX idx_it_comments_archived (archived)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`UPDATE it_projects SET owner = 'GIT' WHERE owner = 'IT PMO'`);
    await db.query(`UPDATE it_milestones SET owner = 'GIT' WHERE owner = 'IT PMO'`);
    await db.query(`UPDATE it_projects SET owner = NULL WHERE owner = 'Saad'`);
    await db.query(`UPDATE it_milestones SET owner = NULL WHERE owner = 'Saad'`);
    return true;
  })().catch((err) => {
    itTablesReady = null;
    throw err;
  });
  return itTablesReady;
}

function emptyToNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function dateStr(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

function mapProject(row, milestones = []) {
  return {
    id: row.id,
    name: row.name,
    category: row.category || '',
    owner: row.owner || '',
    lead: row.lead_name || '',
    ownerEmail: row.owner_email || '',
    leadEmail: row.lead_email || '',
    status: row.status,
    priority: row.priority,
    start: dateStr(row.start_date),
    end: dateStr(row.end_date),
    budget: row.budget || '',
    progress: Number(row.progress) || 0,
    notes: row.notes || '',
    milestones,
  };
}

function mapMilestone(row) {
  return {
    id: row.id,
    projectId: row.project_id || null,
    title: row.title,
    due: dateStr(row.due_date),
    status: row.status,
    owner: row.owner || '',
    notes: row.notes || '',
    kind: row.kind || 'task',
  };
}

export async function listItProjects() {
  await ensureItTables();
  const db = await getMysqlPool();
  const [projects] = await db.query(
    `SELECT id, name, category, owner, lead_name, owner_email, lead_email, status, priority, start_date, end_date, budget, progress, notes
     FROM it_projects WHERE archived = 0 ORDER BY updated_at DESC`
  );
  if (!projects.length) return [];
  const ids = projects.map((p) => p.id);
  const [milestones] = await db.query(
    `SELECT id, project_id, title, due_date, status, owner, notes, kind
     FROM it_milestones WHERE archived = 0 AND project_id IN (?)
     ORDER BY due_date IS NULL, due_date ASC`,
    [ids]
  );
  const byProject = new Map(ids.map((id) => [id, []]));
  for (const m of milestones) {
    if ((m.kind || 'task') === 'monthly') continue;
    const list = byProject.get(m.project_id);
    if (list) list.push(mapMilestone(m));
  }
  return projects.map((p) => mapProject(p, byProject.get(p.id) || []));
}

export async function listStandaloneItems() {
  await ensureItTables();
  const db = await getMysqlPool();
  const [rows] = await db.query(
    `SELECT id, project_id, title, due_date, status, owner, notes, kind
     FROM it_milestones
     WHERE archived = 0 AND (
       project_id IS NULL OR project_id = '' OR kind = 'monthly'
     )
     ORDER BY FIELD(kind,'monthly','task'), due_date IS NULL, due_date ASC, updated_at DESC`
  );
  return rows
    .filter((r) => (r.kind || 'task') === 'monthly' || !r.project_id)
    .map(mapMilestone);
}

export async function countActiveItProjects() {
  await ensureItTables();
  const db = await getMysqlPool();
  const [rows] = await db.query('SELECT COUNT(*) AS c FROM it_projects WHERE archived = 0');
  return Number(rows[0]?.c) || 0;
}

export async function upsertItProject(project) {
  await ensureItTables();
  const db = await getMysqlPool();
  const id = String(project.id || '').trim();
  if (!id) throw new Error('Project id is required');
  const name = String(project.name || '').trim();
  if (!name) throw new Error('Project name is required');

  await db.query(
    `INSERT INTO it_projects
      (id, name, category, owner, lead_name, owner_email, lead_email, status, priority, start_date, end_date, budget, progress, notes, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      category = VALUES(category),
      owner = VALUES(owner),
      lead_name = VALUES(lead_name),
      owner_email = VALUES(owner_email),
      lead_email = VALUES(lead_email),
      status = VALUES(status),
      priority = VALUES(priority),
      start_date = VALUES(start_date),
      end_date = VALUES(end_date),
      budget = VALUES(budget),
      progress = VALUES(progress),
      notes = VALUES(notes),
      archived = 0`,
    [
      id,
      name,
      emptyToNull(project.category),
      emptyToNull(project.owner),
      emptyToNull(project.lead),
      emptyToNull(project.ownerEmail),
      emptyToNull(project.leadEmail),
      project.status || 'Not Started',
      project.priority || 'Medium',
      emptyToNull(project.start),
      emptyToNull(project.end),
      emptyToNull(project.budget),
      Math.max(0, Math.min(100, Number(project.progress) || 0)),
      emptyToNull(project.notes),
    ]
  );
  return id;
}

export async function archiveItProject(id) {
  await ensureItTables();
  const db = await getMysqlPool();
  await db.query('UPDATE it_projects SET archived = 1 WHERE id = ?', [id]);
  await db.query('UPDATE it_milestones SET archived = 1 WHERE project_id = ?', [id]);
  await db.query('UPDATE it_comments SET archived = 1 WHERE project_id = ?', [id]);
}

export async function upsertItMilestone(projectId, milestone) {
  await ensureItTables();
  const db = await getMysqlPool();
  const id = String(milestone.id || '').trim();
  if (!id) throw new Error('Milestone id is required');
  const title = String(milestone.title || '').trim();
  if (!title) throw new Error('Milestone title is required');

  const pid = emptyToNull(projectId);
  if (pid) {
    const [projects] = await db.query(
      'SELECT id FROM it_projects WHERE id = ? AND archived = 0 LIMIT 1',
      [pid]
    );
    if (!projects.length) throw new Error('Project not found');
  }

  const kind = milestone.kind === 'monthly' ? 'monthly' : 'task';

  await db.query(
    `INSERT INTO it_milestones
      (id, project_id, title, due_date, status, owner, notes, kind, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE
      project_id = VALUES(project_id),
      title = VALUES(title),
      due_date = VALUES(due_date),
      status = VALUES(status),
      owner = VALUES(owner),
      notes = VALUES(notes),
      kind = VALUES(kind),
      archived = 0`,
    [
      id,
      pid,
      title,
      emptyToNull(milestone.due),
      milestone.status || 'Not Started',
      emptyToNull(milestone.owner),
      emptyToNull(milestone.notes),
      kind,
    ]
  );
  return id;
}

export async function archiveItMilestone(id) {
  await ensureItTables();
  const db = await getMysqlPool();
  await db.query('UPDATE it_milestones SET archived = 1 WHERE id = ?', [id]);
  await db.query('UPDATE it_comments SET archived = 1 WHERE milestone_id = ?', [id]);
}

function mapComment(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    milestoneId: row.milestone_id,
    authorRole: row.author_role,
    authorName: row.author_name || '',
    authorEmail: row.author_email || '',
    body: row.body || '',
    createdAt: row.created_at,
  };
}

export async function listComments(milestoneId) {
  await ensureItTables();
  const db = await getMysqlPool();
  const [rows] = await db.query(
    `SELECT id, project_id, milestone_id, author_role, author_name, author_email, body, created_at
     FROM it_comments
     WHERE archived = 0 AND milestone_id = ?
     ORDER BY created_at ASC`,
    [milestoneId]
  );
  return rows.map(mapComment);
}

export async function createComment({ id, projectId, milestoneId, authorRole, authorName, authorEmail, body }) {
  await ensureItTables();
  const db = await getMysqlPool();
  const cid = String(id || '').trim();
  if (!cid) throw new Error('Comment id is required');
  const text = String(body || '').trim();
  if (!text) throw new Error('Comment text is required');
  const role = authorRole === 'lead' ? 'lead' : 'owner';

  const [ms] = await db.query(
    `SELECT m.id, m.title, m.kind, m.project_id, m.owner AS task_owner,
            p.name AS project_name, p.owner, p.lead_name, p.owner_email, p.lead_email
     FROM it_milestones m
     LEFT JOIN it_projects p ON p.id = m.project_id AND p.archived = 0
     WHERE m.id = ? AND m.archived = 0
     LIMIT 1`,
    [milestoneId]
  );
  if (!ms.length) throw new Error('Task/milestone not found');
  const row = ms[0];
  const resolvedProjectId = row.project_id || emptyToNull(projectId);

  await db.query(
    `INSERT INTO it_comments
      (id, project_id, milestone_id, author_role, author_name, author_email, body, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      cid,
      resolvedProjectId,
      milestoneId,
      role,
      emptyToNull(authorName),
      emptyToNull(authorEmail),
      text,
    ]
  );

  const comments = await listComments(milestoneId);
  return {
    comment: comments.find((c) => c.id === cid) || comments[comments.length - 1],
    comments,
    meta: {
      projectName: row.project_name || 'Standalone',
      taskTitle: row.title,
      kind: row.kind || 'task',
      ownerName: row.owner || row.task_owner || '',
      leadName: row.lead_name || '',
      ownerEmail: row.owner_email || '',
      leadEmail: row.lead_email || '',
    },
  };
}

export async function seedItProjectsIfEmpty(seed) {
  await ensureItTables();
  const count = await countActiveItProjects();
  if (count > 0) return { seeded: false, count };

  for (const project of seed || []) {
    await upsertItProject(project);
    for (const m of project.milestones || []) {
      await upsertItMilestone(project.id, m);
    }
  }
  return { seeded: true, count: (seed || []).length };
}

export function loadGitSeed() {
  const p = path.join(__dirname, 'git-seed.json');
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Soft-archive legacy sample rows and upsert GIT seed. Never DROP tables. */
export async function bootstrapGitPortfolio() {
  await ensureItTables();
  const db = await getMysqlPool();
  const seed = loadGitSeed();
  if (!seed.length) return { ok: false, message: 'No GIT seed file' };

  // Soft-archive old tracker samples (p1..p7) and retired Waqar/Usher rows.
  await db.query(`UPDATE it_projects SET archived = 1 WHERE id REGEXP '^p[0-9]+$' AND archived = 0`);
  await db.query(
    `UPDATE it_milestones SET archived = 1
     WHERE project_id REGEXP '^p[0-9]+$' AND archived = 0`
  );
  await db.query(
    `UPDATE it_projects SET archived = 1
     WHERE archived = 0 AND (
       id IN ('gp1','gp2','xfzr5jn7','x1ilt7o7')
       OR LOWER(COALESCE(lead_name,'')) IN ('waqar','usher')
       OR LOWER(COALESCE(owner,'')) IN ('waqar','usher','pnc','p&c')
     )`
  );
  await db.query(
    `UPDATE it_milestones SET archived = 1
     WHERE archived = 0 AND (
       project_id IN ('gp1','gp2')
       OR LOWER(COALESCE(owner,'')) IN ('waqar','usher')
     )`
  );

  for (const project of seed) {
    await upsertItProject(project);
    for (const m of project.milestones || []) {
      await upsertItMilestone(project.id, m);
    }
  }
  const projects = await listItProjects();
  return { ok: true, count: projects.length, projects };
}
