import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { writeAuditLog } from '../audit.js';
import { can, ACTIONS } from '../rbac.js';
import { getProjectById } from '../it-store.js';
import {
  createIssue,
  createSavedFilter,
  createSprint,
  deleteSavedFilter,
  getIssueById,
  getIssueByKey,
  listIssuePriorities,
  listIssues,
  listIssueTypes,
  listSavedFilters,
  listSprints,
  listWorkflowStatuses,
  reorderIssues,
  syncIssuesFromLegacyMilestones,
  updateIssue,
  updateSprint,
} from '../issue-store.js';

const router = Router();

const issueSchema = z.object({
  projectId: z.string().trim().min(1).nullable().optional(),
  type: z.enum(['Epic', 'Story', 'Task', 'Bug', 'Change Request', 'Sub-task']).optional(),
  summary: z.string().trim().min(2).max(512),
  description: z.string().trim().max(20000).optional().or(z.literal('')),
  statusId: z.string().trim().min(1).nullable().optional(),
  priority: z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest']).optional(),
  assigneeId: z.string().trim().min(1).nullable().optional(),
  reporterId: z.string().trim().min(1).nullable().optional(),
  epicId: z.string().trim().min(1).nullable().optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
  sprintId: z.string().trim().min(1).nullable().optional(),
  dueDate: z.string().trim().optional().or(z.literal('')),
  storyPoints: z.union([z.number(), z.string(), z.null()]).optional(),
  issueRank: z.string().trim().optional().or(z.literal('')),
});

function forbid(res, message = 'Forbidden') {
  return res.status(403).json({ error: message });
}

function canSeeAll(user) {
  return user?.role === 'admin' || user?.role === 'manager';
}

function canEditIssue(user, issue, project) {
  if (!user) return false;
  if (can(user, ACTIONS.EDIT_ANY_PROJECT, project)) return true;
  return can(user, ACTIONS.EDIT_ASSIGNED_TASK, {
    ...issue,
    leadId: issue.assigneeId,
    ownerId: issue.reporterId,
    projectOwnerId: project?.ownerId || null,
    projectLeadId: project?.leadId || null,
    assigneeId: issue.assigneeId,
  });
}

function filterIssuesForUser(user, issues) {
  if (canSeeAll(user)) return issues;
  const uid = user?.id;
  return issues.filter(
    (issue) => issue.assigneeId === uid || issue.reporterId === uid
  );
}

router.get('/meta', requireAuth, async (req, res, next) => {
  try {
    const [statuses, sprints, filters] = await Promise.all([
      listWorkflowStatuses(),
      listSprints(),
      listSavedFilters(req.user.id),
    ]);
    res.json({
      types: listIssueTypes(),
      priorities: listIssuePriorities(),
      statuses,
      sprints,
      savedFilters: filters,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    if (!can(req.user, ACTIONS.VIEW_ALL_PROJECTS)) return forbid(res);
    const issues = await listIssues({
      projectId: req.query.projectId || null,
      assigneeId: req.query.assigneeId || null,
      reporterId: req.query.reporterId || null,
      statusId: req.query.statusId || null,
      type: req.query.type || null,
      priority: req.query.priority || null,
      sprintId: req.query.sprintId || null,
      backlogOnly: req.query.backlogOnly === '1' || req.query.backlogOnly === 'true',
      q: String(req.query.q || '').trim(),
      order: req.query.order || 'updated',
    });
    res.json({ issues: filterIssuesForUser(req.user, issues) });
  } catch (err) {
    next(err);
  }
});

router.post('/sync-legacy', requireAuth, async (req, res, next) => {
  try {
    if (!can(req.user, ACTIONS.MANAGE_USERS)) return forbid(res);
    const result = await syncIssuesFromLegacyMilestones();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/reorder', requireAuth, async (req, res, next) => {
  try {
    if (!can(req.user, ACTIONS.EDIT_ANY_PROJECT) && req.user.role !== 'owner') {
      return forbid(res);
    }
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];
    const issues = await reorderIssues(orderedIds);
    res.json({ issues: filterIssuesForUser(req.user, issues) });
  } catch (err) {
    next(err);
  }
});

router.get('/sprints', requireAuth, async (req, res, next) => {
  try {
    const sprints = await listSprints(req.query.projectId || null);
    res.json({ sprints });
  } catch (err) {
    next(err);
  }
});

router.post('/sprints', requireAuth, async (req, res, next) => {
  try {
    if (!can(req.user, ACTIONS.CREATE_PROJECT) && req.user.role !== 'owner') {
      return forbid(res);
    }
    const sprint = await createSprint(req.body || {});
    await writeAuditLog({
      userId: req.user.id,
      action: 'sprint.create',
      entityType: 'sprint',
      entityId: sprint.id,
      before: null,
      after: sprint,
      ip: req.ip,
    });
    res.status(201).json({ sprint });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.put('/sprints/:id', requireAuth, async (req, res, next) => {
  try {
    if (!can(req.user, ACTIONS.CREATE_PROJECT) && req.user.role !== 'owner') {
      return forbid(res);
    }
    const sprint = await updateSprint(req.params.id, req.body || {});
    await writeAuditLog({
      userId: req.user.id,
      action: 'sprint.update',
      entityType: 'sprint',
      entityId: sprint.id,
      before: null,
      after: sprint,
      ip: req.ip,
    });
    res.json({ sprint });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get('/filters', requireAuth, async (req, res, next) => {
  try {
    const filters = await listSavedFilters(req.user.id);
    res.json({ filters });
  } catch (err) {
    next(err);
  }
});

router.post('/filters', requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Filter name is required' });
    const filter = await createSavedFilter({
      userId: req.user.id,
      name,
      query: req.body?.query || {},
      isShared: Boolean(req.body?.isShared),
    });
    res.status(201).json({ filter });
  } catch (err) {
    next(err);
  }
});

router.delete('/filters/:id', requireAuth, async (req, res, next) => {
  try {
    await deleteSavedFilter(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:idOrKey', requireAuth, async (req, res, next) => {
  try {
    const idOrKey = req.params.idOrKey;
    const issue =
      (await getIssueById(idOrKey)) || (await getIssueByKey(idOrKey));
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    if (!canSeeAll(req.user)) {
      const allowed = filterIssuesForUser(req.user, [issue]);
      if (!allowed.length) return forbid(res);
    }
    res.json({ issue });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = issueSchema.parse(req.body || {});
    const project = parsed.projectId ? await getProjectById(parsed.projectId) : null;
    if (parsed.projectId && !project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const allowed =
      can(req.user, ACTIONS.CREATE_PROJECT) ||
      can(req.user, ACTIONS.CREATE_TASK_ON_OWN_PROJECT, project) ||
      req.user.role === 'lead';
    if (!allowed) return forbid(res);

    const issue = await createIssue({
      ...parsed,
      reporterId: parsed.reporterId || req.user.id,
    });

    await writeAuditLog({
      userId: req.user.id,
      action: 'issue.create',
      entityType: 'issue',
      entityId: issue.id,
      before: null,
      after: issue,
      ip: req.ip,
    });

    res.status(201).json({ issue });
  } catch (err) {
    if (err?.name === 'ZodError') {
      return res.status(400).json({ error: err.issues?.[0]?.message || 'Invalid input' });
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const before = await getIssueById(req.params.id);
    if (!before) return res.status(404).json({ error: 'Issue not found' });
    const project = before.projectId ? await getProjectById(before.projectId) : null;
    if (!canEditIssue(req.user, before, project)) return forbid(res);

    const parsed = issueSchema.partial().extend({
      summary: z.string().trim().min(2).max(512).optional(),
    }).parse(req.body || {});

    const issue = await updateIssue(req.params.id, parsed);

    await writeAuditLog({
      userId: req.user.id,
      action: 'issue.update',
      entityType: 'issue',
      entityId: issue.id,
      before,
      after: issue,
      ip: req.ip,
    });

    res.json({ issue });
  } catch (err) {
    if (err?.name === 'ZodError') {
      return res.status(400).json({ error: err.issues?.[0]?.message || 'Invalid input' });
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

export default router;
