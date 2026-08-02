import { Router } from 'express';
import { useMysqlStorage, probeMysql } from '../db.js';
import {
  ensureItTables,
  listItProjects,
  upsertItProject,
  archiveItProject,
  upsertItMilestone,
  archiveItMilestone,
  seedItProjectsIfEmpty,
  bootstrapGitPortfolio,
  loadGitSeed,
  listComments,
  createComment,
} from '../it-store.js';
import { notifyTaskComment, isEmail } from '../mailer.js';

const router = Router();

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
    const projects = await listItProjects();
    res.json({ projects, storage: 'mysql' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load projects' });
  }
});

router.post('/seed', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const seed = Array.isArray(req.body?.projects) ? req.body.projects : loadGitSeed();
    if (!seed.length) return res.status(400).json({ error: 'projects array required' });
    const result = await seedItProjectsIfEmpty(seed);
    const projects = await listItProjects();
    res.json({ ...result, projects });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to seed projects' });
  }
});

router.post('/bootstrap-git', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const result = await bootstrapGitPortfolio();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to bootstrap GIT portfolio' });
  }
});

router.post('/projects', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const project = req.body || {};
    if (!project.id) project.id = newId('p');
    await upsertItProject(project);
    for (const m of project.milestones || []) {
      if (!m.id) m.id = newId('m');
      await upsertItMilestone(project.id, m);
    }
    const projects = await listItProjects();
    res.status(201).json({ id: project.id, projects });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create project' });
  }
});

router.put('/projects/:id', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const project = { ...(req.body || {}), id: req.params.id };
    await upsertItProject(project);
    const projects = await listItProjects();
    res.json({ id: project.id, projects });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to update project' });
  }
});

router.delete('/projects/:id', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    await archiveItProject(req.params.id);
    const projects = await listItProjects();
    res.json({ ok: true, projects });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to archive project' });
  }
});

router.post('/projects/:id/milestones', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const milestone = { ...(req.body || {}) };
    if (!milestone.id) milestone.id = newId('m');
    await upsertItMilestone(req.params.id, milestone);
    const projects = await listItProjects();
    res.status(201).json({ id: milestone.id, projects });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create milestone' });
  }
});

router.put('/milestones/:id', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const projectId = req.body?.projectId;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    const milestone = { ...(req.body || {}), id: req.params.id };
    await upsertItMilestone(projectId, milestone);
    const projects = await listItProjects();
    res.json({ id: milestone.id, projects });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to update milestone' });
  }
});

router.delete('/milestones/:id', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    await archiveItMilestone(req.params.id);
    const projects = await listItProjects();
    res.json({ ok: true, projects });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to archive milestone' });
  }
});

router.get('/milestones/:id/comments', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const comments = await listComments(req.params.id);
    res.json({ comments });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load comments' });
  }
});

router.post('/milestones/:id/comments', async (req, res) => {
  try {
    if (!requireMysql(res)) return;
    const body = req.body || {};
    const projectId = body.projectId;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    const authorRole = body.authorRole === 'lead' ? 'lead' : 'owner';
    const text = String(body.body || '').trim();
    if (!text) return res.status(400).json({ error: 'Comment text is required' });

    const result = await createComment({
      id: body.id || newId('c'),
      projectId,
      milestoneId: req.params.id,
      authorRole,
      authorName: body.authorName,
      authorEmail: body.authorEmail,
      body: text,
    });

    const meta = result.meta;
    const toEmail = authorRole === 'owner' ? meta.leadEmail : meta.ownerEmail;
    const toName = authorRole === 'owner' ? meta.leadName : meta.ownerName;
    const fromName =
      authorRole === 'owner'
        ? body.authorName || meta.ownerName || 'Owner'
        : body.authorName || meta.leadName || 'Lead';
    const fromEmail =
      (isEmail(body.authorEmail) && body.authorEmail) ||
      (authorRole === 'owner' ? meta.ownerEmail : meta.leadEmail);

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
