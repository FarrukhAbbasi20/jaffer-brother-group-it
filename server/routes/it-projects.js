import { Router } from 'express';
import { useMysqlStorage, probeMysql } from '../db.js';
import {
  ensureItTables,
  listItProjects,
  listStandaloneItems,
  getProjectById,
  getMilestoneById,
  upsertItProject,
  archiveItProject,
  upsertItMilestone,
  archiveItMilestone,
  seedItProjectsIfEmpty,
  bootstrapGitPortfolio,
  loadGitSeed,
  listComments,
  listProjectComments,
  createComment,
} from '../it-store.js';
import { notifyTaskComment, isEmail } from '../mailer.js';
import { can, ACTIONS } from '../rbac.js';
import { writeAuditLog } from '../audit.js';
import { requireAuth } from '../auth.js';
import {
  ensureUserRoleAtLeast,
  findUserById,
} from '../auth-store.js';
import { upsertIssueFromMilestone } from '../issue-store.js';

const router = Router();

router.use((req, res, next) => {
  if (req.path === '/health') return next();
  return requireAuth(req, res, next);
});

function requireMysql(res) {
  if (!useMysqlStorage()) {
    res.status(503).json({ error: 'MySQL is not configured on the server' });
    return false;
  }
  return true;
}

function newId(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function sanitizeProject(user, project) {
  const allowedBudget = can(user, ACTIONS.VIEW_BUDGET, project);
  return {
    ...project,
    budget: allowedBudget ? project.budget : '',
  };
}

function canSeeAllWork(user) {
  return user?.role === 'admin' || user?.role === 'manager';
}

function itemAssignedToUser(item, userId) {
  return Boolean(userId && (item?.ownerId === userId || item?.leadId === userId));
}

function filterPayloadForUser(user, projects, standalone) {
  if (canSeeAllWork(user)) {
    return {
      projects: projects.map((project) => sanitizeProject(user, project)),
      standalone,
    };
  }

  const uid = user?.id;
  const filteredProjects = projects
    .map((project) => {
      const projectAssigned = itemAssignedToUser(project, uid);
      const milestones = (project.milestones || []).filter(
        (m) => projectAssigned || itemAssignedToUser(m, uid)
      );
      if (!projectAssigned && !milestones.length) return null;
      return sanitizeProject(user, {
        ...project,
        milestones: projectAssigned ? project.milestones || [] : milestones,
      });
    })
    .filter(Boolean);

  const filteredStandalone = (standalone || []).filter((item) =>
    itemAssignedToUser(item, uid)
  );

  return { projects: filteredProjects, standalone: filteredStandalone };
}

async function hydrateAssigneeFields(record, { grantAccessRoles = false } = {}) {
  const next = { ...record };
  if (next.ownerId) {
    const owner = await findUserById(next.ownerId);
    if (!owner || !owner.is_active) {
      throw Object.assign(new Error('Selected owner user was not found or is inactive'), {
        status: 400,
      });
    }
    next.owner = owner.name;
    next.ownerEmail = owner.email;
    if (grantAccessRoles) await ensureUserRoleAtLeast(owner.id, 'owner');
  } else {
    next.ownerId = null;
  }

  if (next.leadId) {
    const lead = await findUserById(next.leadId);
    if (!lead || !lead.is_active) {
      throw Object.assign(new Error('Selected lead user was not found or is inactive'), {
        status: 400,
      });
    }
    next.lead = lead.name;
    next.leadEmail = lead.email;
    if (grantAccessRoles) await ensureUserRoleAtLeast(lead.id, 'lead');
  } else {
    next.leadId = null;
  }
  return next;
}

async function payload(user) {
  const projects = await listItProjects();
  const standalone = await listStandaloneItems();
  return {
    ...filterPayloadForUser(user, projects, standalone),
    storage: 'mysql',
  };
}

function forbid(res) {
  return res.status(403).json({ error: 'Forbidden' });
}

router.get('/health', async (req, res) => {
  try {
    if (!useMysqlStorage()) {
      return res.json({ ok: false, storage: 'none', message: 'MySQL not configured' });
    }
    await ensureItTables();
    const probe = await probeMysql();
    const projects = await listItProjects();
    res.json({ ok: Boolean(probe.ok), storage: 'mysql', projects: projects.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'MySQL health check failed' });
  }
});

router.get('/projects', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    if (!req.user || !can(req.user, ACTIONS.VIEW_ALL_PROJECTS)) return forbid(res);
    res.json(await payload(req.user));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load projects' });
  }
});

router.post('/seed', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    if (!req.user || !can(req.user, ACTIONS.MANAGE_USERS)) return forbid(res);
    const seed = Array.isArray(req.body?.projects) ? req.body.projects : loadGitSeed();
    if (!seed.length) return res.status(400).json({ error: 'projects array required' });
    const result = await seedItProjectsIfEmpty(seed);
    res.json({ ...result, ...(await payload(req.user)) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to seed projects' });
  }
});

router.post('/bootstrap-git', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    if (!req.user || !can(req.user, ACTIONS.MANAGE_USERS)) return forbid(res);
    const result = await bootstrapGitPortfolio();
    const body = await payload(req.user);
    res.json({ ...result, ...body });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to bootstrap GIT portfolio' });
  }
});

router.post('/projects', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    if (!req.user || !can(req.user, ACTIONS.CREATE_PROJECT)) return forbid(res);
    const grantAccessRoles = Boolean(req.body?.grantAccessRoles);
    const project = await hydrateAssigneeFields(
      { ...(req.body || {}) },
      { grantAccessRoles }
    );
    if (!project.id) project.id = newId('p');
    const before = await getProjectById(project.id);
    await upsertItProject(project);
    const after = await getProjectById(project.id);
    await writeAuditLog({
      userId: req.user.id,
      action: 'project.create',
      entityType: 'project',
      entityId: project.id,
      before,
      after,
      ip: req.ip,
    });
    for (const m of project.milestones || []) {
      if (!m.id) m.id = newId('m');
      const hydrated = await hydrateAssigneeFields(m, { grantAccessRoles });
      await upsertItMilestone(project.id, hydrated);
    }
    res.status(201).json({ id: project.id, ...(await payload(req.user)) });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Failed to create project' });
  }
});

router.put('/projects/:id', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const before = await getProjectById(req.params.id);
    if (!before) return res.status(404).json({ error: 'Project not found' });
    const allowed =
      req.user &&
      (can(req.user, ACTIONS.EDIT_ANY_PROJECT, before) ||
        can(req.user, ACTIONS.EDIT_OWN_PROJECT, before));
    if (!allowed) return forbid(res);
    const grantAccessRoles = Boolean(req.body?.grantAccessRoles);
    const project = await hydrateAssigneeFields(
      { ...(req.body || {}), id: req.params.id },
      { grantAccessRoles }
    );
    await upsertItProject(project);
    const after = await getProjectById(project.id);
    await writeAuditLog({
      userId: req.user.id,
      action: 'project.update',
      entityType: 'project',
      entityId: project.id,
      before,
      after,
      ip: req.ip,
    });
    res.json({ id: project.id, ...(await payload(req.user)) });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Failed to update project' });
  }
});

router.delete('/projects/:id', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const before = await getProjectById(req.params.id);
    if (!req.user || !can(req.user, ACTIONS.DELETE_PROJECT, before)) return forbid(res);
    await archiveItProject(req.params.id);
    await writeAuditLog({
      userId: req.user.id,
      action: 'project.archive',
      entityType: 'project',
      entityId: req.params.id,
      before,
      after: null,
      ip: req.ip,
    });
    res.json({ ok: true, ...(await payload(req.user)) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to archive project' });
  }
});

router.get('/projects/:id/comments', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    if (!req.user || !can(req.user, ACTIONS.VIEW_ALL_PROJECTS)) return forbid(res);
    const comments = await listProjectComments(req.params.id);
    res.json({ comments });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load project comments' });
  }
});

router.post('/projects/:id/comments', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const project = await getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!req.user || !can(req.user, ACTIONS.COMMENT, project)) return forbid(res);
    const body = req.body || {};
    const text = String(body.body || '').trim();
    if (!text) return res.status(400).json({ error: 'Comment text is required' });
    const authorRole = req.user.role === 'lead' ? 'lead' : 'owner';

    const result = await createComment({
      id: body.id || newId('c'),
      projectId: req.params.id,
      milestoneId: null,
      authorRole,
      authorName: req.user.name,
      authorEmail: req.user.email,
      body: text,
    });

    const meta = result.meta;
    const toEmail = authorRole === 'owner' ? meta.leadEmail : meta.ownerEmail;
    const toName = authorRole === 'owner' ? meta.leadName : meta.ownerName;
    const fromName =
      authorRole === 'owner'
        ? req.user.name || meta.ownerName || 'Owner'
        : req.user.name || meta.leadName || 'Lead';
    const fromEmail =
      req.user.email || (authorRole === 'owner' ? meta.ownerEmail : meta.leadEmail);

    const mail = await notifyTaskComment({
      toEmail,
      toName,
      fromRole: authorRole === 'owner' ? 'Owner' : 'Lead',
      fromName,
      projectName: meta.projectName,
      taskTitle: meta.taskTitle,
      body: text,
      kind: 'project',
    });

    res.status(201).json({
      comment: result.comment,
      comments: result.comments,
      mail,
      notifyTo: isEmail(toEmail) ? toEmail : null,
      fromEmail: isEmail(fromEmail) ? fromEmail : null,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to post project comment' });
  }
});

router.post('/milestones', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const grantAccessRoles = Boolean(req.body?.grantAccessRoles);
    const milestone = await hydrateAssigneeFields(
      { ...(req.body || {}) },
      { grantAccessRoles }
    );
    if (!milestone.id) milestone.id = newId('m');
    const projectId = milestone.projectId || null;
    const project = projectId ? await getProjectById(projectId) : null;
    const action = milestone.kind === 'monthly' ? ACTIONS.CREATE_MONTHLY_MILESTONE : ACTIONS.CREATE_TASK_ON_OWN_PROJECT;
    if (!req.user || !can(req.user, action, project)) return forbid(res);
    const before = await getMilestoneById(milestone.id);
    await upsertItMilestone(projectId, milestone);
    const after = await getMilestoneById(milestone.id);
    if (after && after.kind !== 'monthly') {
      await upsertIssueFromMilestone(after);
    }
    await writeAuditLog({
      userId: req.user.id,
      action: milestone.kind === 'monthly' ? 'milestone.create' : 'task.create',
      entityType: milestone.kind === 'monthly' ? 'milestone' : 'task',
      entityId: milestone.id,
      before,
      after,
      ip: req.ip,
    });
    res.status(201).json({ id: milestone.id, ...(await payload(req.user)) });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Failed to create milestone' });
  }
});

router.post('/projects/:id/milestones', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const project = await getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const grantAccessRoles = Boolean(req.body?.grantAccessRoles);
    const milestone = await hydrateAssigneeFields(
      { ...(req.body || {}) },
      { grantAccessRoles }
    );
    if (!milestone.id) milestone.id = newId('m');
    const action = milestone.kind === 'monthly' ? ACTIONS.CREATE_MONTHLY_MILESTONE : ACTIONS.CREATE_TASK_ON_OWN_PROJECT;
    if (!req.user || !can(req.user, action, project)) return forbid(res);
    const before = await getMilestoneById(milestone.id);
    await upsertItMilestone(req.params.id, milestone);
    const after = await getMilestoneById(milestone.id);
    if (after && after.kind !== 'monthly') {
      await upsertIssueFromMilestone(after);
    }
    await writeAuditLog({
      userId: req.user.id,
      action: milestone.kind === 'monthly' ? 'milestone.create' : 'task.create',
      entityType: milestone.kind === 'monthly' ? 'milestone' : 'task',
      entityId: milestone.id,
      before,
      after,
      ip: req.ip,
    });
    res.status(201).json({ id: milestone.id, ...(await payload(req.user)) });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Failed to create milestone' });
  }
});

router.put('/milestones/:id', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const before = await getMilestoneById(req.params.id);
    if (!before) return res.status(404).json({ error: 'Task or milestone not found' });
    const projectId = req.body?.projectId || null;
    const project = before.projectId ? await getProjectById(before.projectId) : null;
    const isMonthly = before.kind === 'monthly';
    const allowed =
      req.user &&
      (isMonthly
        ? can(req.user, ACTIONS.CREATE_MONTHLY_MILESTONE, project)
        : can(req.user, ACTIONS.EDIT_ASSIGNED_TASK, {
            ...before,
            projectOwnerId: project?.ownerId || null,
            projectLeadId: project?.leadId || null,
            assigneeId: before.leadId,
          }));
    if (!allowed) return forbid(res);
    const grantAccessRoles = Boolean(req.body?.grantAccessRoles);
    const milestone = await hydrateAssigneeFields(
      { ...(req.body || {}), id: req.params.id },
      { grantAccessRoles }
    );
    await upsertItMilestone(projectId, milestone);
    const after = await getMilestoneById(milestone.id);
    if (after && after.kind !== 'monthly') {
      await upsertIssueFromMilestone(after);
    }
    await writeAuditLog({
      userId: req.user.id,
      action: isMonthly ? 'milestone.update' : 'task.update',
      entityType: isMonthly ? 'milestone' : 'task',
      entityId: milestone.id,
      before,
      after,
      ip: req.ip,
    });
    res.json({ id: milestone.id, ...(await payload(req.user)) });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Failed to update milestone' });
  }
});

router.delete('/milestones/:id', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const before = await getMilestoneById(req.params.id);
    if (!before) return res.status(404).json({ error: 'Task or milestone not found' });
    const project = before.projectId ? await getProjectById(before.projectId) : null;
    const allowed = req.user && (
      before.kind === 'monthly'
        ? can(req.user, ACTIONS.CREATE_MONTHLY_MILESTONE, project)
        : can(req.user, ACTIONS.REASSIGN_TASK, project)
    );
    if (!allowed) return forbid(res);
    await archiveItMilestone(req.params.id);
    await writeAuditLog({
      userId: req.user.id,
      action: before.kind === 'monthly' ? 'milestone.archive' : 'task.archive',
      entityType: before.kind === 'monthly' ? 'milestone' : 'task',
      entityId: req.params.id,
      before,
      after: null,
      ip: req.ip,
    });
    res.json({ ok: true, ...(await payload(req.user)) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to archive milestone' });
  }
});

router.get('/milestones/:id/comments', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    if (!req.user || !can(req.user, ACTIONS.VIEW_ALL_PROJECTS)) return forbid(res);
    const comments = await listComments(req.params.id);
    res.json({ comments });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load comments' });
  }
});

router.post('/milestones/:id/comments', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const milestone = await getMilestoneById(req.params.id);
    if (!milestone) return res.status(404).json({ error: 'Task or milestone not found' });
    const project = milestone.projectId ? await getProjectById(milestone.projectId) : null;
    if (!req.user || !can(req.user, ACTIONS.COMMENT, project || milestone)) return forbid(res);
    const body = req.body || {};
    const authorRole = req.user.role === 'lead' ? 'lead' : 'owner';
    const text = String(body.body || '').trim();
    if (!text) return res.status(400).json({ error: 'Comment text is required' });

    const result = await createComment({
      id: body.id || newId('c'),
      projectId: body.projectId || null,
      milestoneId: req.params.id,
      authorRole,
      authorName: req.user.name,
      authorEmail: req.user.email,
      body: text,
    });

    const meta = result.meta;
    const toEmail = authorRole === 'owner' ? meta.leadEmail : meta.ownerEmail;
    const toName = authorRole === 'owner' ? meta.leadName : meta.ownerName;
    const fromName =
      authorRole === 'owner'
        ? req.user.name || meta.ownerName || 'Owner'
        : req.user.name || meta.leadName || 'Lead';
    const fromEmail =
      req.user.email || (authorRole === 'owner' ? meta.ownerEmail : meta.leadEmail);

    const mail = await notifyTaskComment({
      toEmail,
      toName,
      fromRole: authorRole === 'owner' ? 'Owner' : 'Lead',
      fromName,
      projectName: meta.projectName,
      taskTitle: meta.taskTitle,
      body: text,
      kind: meta.kind,
    });

    res.status(201).json({
      comment: result.comment,
      comments: result.comments,
      mail,
      notifyTo: isEmail(toEmail) ? toEmail : null,
      fromEmail: isEmail(fromEmail) ? fromEmail : null,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to post comment' });
  }
});

export default router;
