import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { writeAuditLog } from '../audit.js';
import {
  createUser,
  deleteUser,
  findUserById,
  listAssignableUsers,
  listUsers,
  updateUser,
} from '../auth-store.js';
import { ACTIONS, can } from '../rbac.js';

const router = Router();
const ROLES = ['viewer', 'lead', 'owner', 'manager', 'admin'];

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
  role: z.enum(ROLES).default('viewer'),
  department: z.string().trim().max(120).optional().or(z.literal('')),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z
    .email()
    .transform((value) => value.trim().toLowerCase())
    .optional(),
  password: z.string().min(8).max(128).optional().or(z.literal('')),
  role: z.enum(ROLES).optional(),
  department: z.string().trim().max(120).optional().or(z.literal('')),
  isActive: z.boolean().optional(),
});

function forbid(res, message = 'Forbidden') {
  return res.status(403).json({ error: message });
}

function requireManageUsers(req, res) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
  if (!can(req.user, ACTIONS.MANAGE_USERS)) {
    forbid(res, 'You do not have permission to manage users');
    return false;
  }
  return true;
}

function canAssignRole(actor, role) {
  if (actor.role === 'admin') return true;
  return role !== 'admin';
}

router.get('/options', requireAuth, async (req, res, next) => {
  try {
    const users = await listAssignableUsers();
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    if (!requireManageUsers(req, res)) return;
    const users = await listUsers();
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    if (!requireManageUsers(req, res)) return;
    const parsed = createSchema.parse(req.body || {});
    if (!canAssignRole(req.user, parsed.role)) {
      return forbid(res, 'Only admins can assign the admin role');
    }

    const user = await createUser({
      name: parsed.name,
      email: parsed.email,
      password: parsed.password,
      role: parsed.role,
      department: parsed.department || 'GIT',
    });

    await writeAuditLog({
      userId: req.user.id,
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      before: null,
      after: user,
      ip: req.ip,
    });

    res.status(201).json({ user });
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
    if (!requireManageUsers(req, res)) return;
    const parsed = updateSchema.parse(req.body || {});
    const before = await findUserById(req.params.id);
    if (!before) return res.status(404).json({ error: 'User not found' });

    if (req.user.role !== 'admin' && before.role === 'admin') {
      return forbid(res, 'Only admins can edit admin users');
    }
    if (parsed.role && !canAssignRole(req.user, parsed.role)) {
      return forbid(res, 'Only admins can assign the admin role');
    }
    if (parsed.isActive === false && req.user.id === before.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    const patch = { ...parsed };
    if (patch.password === '') delete patch.password;
    if (patch.department === '') patch.department = null;

    const user = await updateUser(req.params.id, patch);

    await writeAuditLog({
      userId: req.user.id,
      action: 'user.update',
      entityType: 'user',
      entityId: user.id,
      before: {
        id: before.id,
        name: before.name,
        email: before.email,
        role: before.role,
        department: before.department || '',
        isActive: Boolean(before.is_active),
      },
      after: user,
      ip: req.ip,
    });

    res.json({ user });
  } catch (err) {
    if (err?.name === 'ZodError') {
      return res.status(400).json({ error: err.issues?.[0]?.message || 'Invalid input' });
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!requireManageUsers(req, res)) return;
    const before = await findUserById(req.params.id);
    if (!before) return res.status(404).json({ error: 'User not found' });

    if (before.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    if (before.role === 'admin' && req.user.role !== 'admin') {
      return forbid(res, 'Only admins can delete admin users');
    }
    if (req.user.role !== 'admin' && before.role === 'admin') {
      return forbid(res, 'Only admins can delete admin users');
    }

    const removed = await deleteUser(before.id);

    await writeAuditLog({
      userId: req.user.id,
      action: 'user.delete',
      entityType: 'user',
      entityId: before.id,
      before: {
        id: before.id,
        name: before.name,
        email: before.email,
        role: before.role,
        department: before.department || '',
        isActive: Boolean(before.is_active),
      },
      after: null,
      ip: req.ip,
    });

    res.json({ ok: true, user: removed });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

export default router;
