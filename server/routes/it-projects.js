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
} from '../it-store.js';

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
    const seed = Array.isArray(req.body?.projects) ? req.body.projects : [];
    if (!seed.length) return res.status(400).json({ error: 'projects array required' });
    const result = await seedItProjectsIfEmpty(seed);
    const projects = await listItProjects();
    res.json({ ...result, projects });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to seed projects' });
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

export default router;
