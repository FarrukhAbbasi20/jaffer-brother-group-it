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
import {
  findEmployeeByEmail,
  normalizeHrDepartmentName,
  searchEmployees,
} from '../employees-store.js';
import { getOrgConfig, saveOrgConfig } from '../org-store.js';
import {
  PORTAL_PAGES,
  defaultPageAccessForRole,
  sanitizePageAccess,
} from '../pages.js';
import { ACTIONS, can } from '../rbac.js';
import {
  managerScope,
  userInManagerScope as userInScope,
  normalizeOrgAssignment,
  parseList,
} from '../user-scope.js';

const router = Router();
const ROLES = ['viewer', 'lead', 'owner', 'manager', 'admin'];

const pageAccessSchema = z.record(z.string(), z.enum(['none', 'view', 'write'])).optional();

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128).optional().or(z.literal('')),
  role: z.enum(ROLES).default('viewer'),
  // Several departments / sub-teams: send arrays, or a comma-separated string (legacy clients).
  department: z.string().trim().max(512).optional().or(z.literal('')),
  team: z.string().trim().max(512).optional().or(z.literal('')),
  departments: z.array(z.string().trim().max(120)).max(60).optional(),
  teams: z.array(z.string().trim().max(120)).max(120).optional(),
  pageAccess: pageAccessSchema,
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z
    .email()
    .transform((value) => value.trim().toLowerCase())
    .optional(),
  password: z.string().min(8).max(128).optional().or(z.literal('')),
  role: z.enum(ROLES).optional(),
  // Several departments / sub-teams: send arrays, or a comma-separated string (legacy clients).
  department: z.string().trim().max(512).optional().or(z.literal('')),
  team: z.string().trim().max(512).optional().or(z.literal('')),
  departments: z.array(z.string().trim().max(120)).max(60).optional(),
  teams: z.array(z.string().trim().max(120)).max(120).optional(),
  pageAccess: pageAccessSchema,
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

// managerScope() / userInScope() now live in ../user-scope.js (multi-department aware).

router.get('/options', requireAuth, async (req, res, next) => {
  try {
    const users = await listAssignableUsers();
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

router.get('/meta', requireAuth, async (req, res, next) => {
  try {
    // Any signed-in user may read org departments/teams (needed for Custodian project create).
    // Editing org config still requires Admin/Manager via PUT /org-config.
    const config = await getOrgConfig();
    res.json({
      departments: config.departments,
      teamsByDepartment: config.teamsByDepartment,
      pages: PORTAL_PAGES,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/org-config', requireAuth, async (req, res, next) => {
  try {
    if (!requireManageUsers(req, res)) return;
    const current = await getOrgConfig();
    const scope = managerScope(req.user);
    let payload;
    if (req.user.role === 'admin') {
      payload = {
        departments: Array.isArray(req.body?.departments) ? req.body.departments : current.departments,
        teamsByDepartment:
          req.body?.teamsByDepartment && typeof req.body.teamsByDepartment === 'object'
            ? req.body.teamsByDepartment
            : current.teamsByDepartment,
      };
    } else if (scope && scope.allTeams) {
      // Whole-department managers/custodians: may edit the sub-teams of their own departments only.
      const incoming = req.body?.teamsByDepartment && typeof req.body.teamsByDepartment === 'object' ? req.body.teamsByDepartment : {};
      const teams = { ...current.teamsByDepartment };
      const norm = (x) => String(x || '').trim().toLowerCase();
      for (const [dept, list] of Object.entries(incoming)) {
        const mine = scope.deptNames.some((d) => norm(d) === norm(dept));
        if (mine && Array.isArray(list)) teams[dept] = list.map((t) => String(t || '').trim()).filter(Boolean);
      }
      payload = { departments: current.departments, teamsByDepartment: teams };
    } else {
      return forbid(res, 'Only an Admin, or someone with access to a whole department, can edit departments and teams');
    }
    const saved = await saveOrgConfig(payload, { userId: req.user.id });
    await writeAuditLog({
      userId: req.user.id,
      action: 'org.config.update',
      entityType: 'org_config',
      entityId: 'default',
      before: current,
      after: saved,
      ip: req.ip,
    });
    res.json({
      departments: saved.departments,
      teamsByDepartment: saved.teamsByDepartment,
      pages: PORTAL_PAGES,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/employees', requireAuth, async (req, res, next) => {
  try {
    if (!requireManageUsers(req, res)) return;
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ employees: [] });
    }
    const employees = await searchEmployees(q, { limit: Number(req.query.limit) || 40 });
    res.json({
      employees: employees.map((e) => ({
        ...e,
        departmentHint: normalizeHrDepartmentName(e.department) || e.department || '',
      })),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    if (!requireManageUsers(req, res)) return;
    const users = await listUsers();
    const scope = managerScope(req.user);
    res.json({ users: scope ? users.filter((u) => userInScope(scope, u)) : users });
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

    const employee = await findEmployeeByEmail(parsed.email);
    if (!employee) {
      return res.status(400).json({
        error:
          'Employee not found in connection.employees. Search and select a Jaffer employee.',
      });
    }

    const config = await getOrgConfig();
    const name =
      String(parsed.name || employee.fullName || '').trim() || employee.fullName;
    // One or many departments / sub-teams. Dept managers can only hand out their own.
    const { department, team } = normalizeOrgAssignment({
      config,
      departments: parsed.departments ?? parsed.department,
      teams: parsed.teams ?? parsed.team,
      scope: managerScope(req.user),
      fallbackDepartments: [
        normalizeHrDepartmentName(employee.department) ||
          employee.department ||
          config.departments[0] ||
          'Group IT',
      ],
      cleanDepartmentName: normalizeHrDepartmentName,
    });
    const pageAccess =
      parsed.role === 'admin'
        ? sanitizePageAccess({}, { defaultLevel: 'write' })
        : sanitizePageAccess(parsed.pageAccess || defaultPageAccessForRole(parsed.role));

    const user = await createUser({
      name,
      email: employee.email,
      password: parsed.password || null,
      role: parsed.role,
      department,
      team,
      pageAccess,
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

    res.status(201).json({ user, employee });
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
    const editScope = managerScope(req.user);
    if (editScope && !userInScope(editScope, before)) {
      return forbid(res, 'You can only manage users in your department');
    }

    const patch = { ...parsed };
    delete patch.departments;
    delete patch.teams;
    if (patch.password === '') delete patch.password;
    if (patch.pageAccess) {
      patch.pageAccess = sanitizePageAccess(patch.pageAccess);
    }
    const sentDept = parsed.departments !== undefined || parsed.department !== undefined;
    const sentTeam = parsed.teams !== undefined || parsed.team !== undefined;
    if (sentDept || sentTeam || editScope) {
      // Whatever was not sent keeps its current value; a scoped Manager cannot move
      // users out of their own departments / sub-teams.
      const org = normalizeOrgAssignment({
        config: await getOrgConfig(),
        departments: sentDept ? parsed.departments ?? parsed.department : before.department,
        teams: sentTeam ? parsed.teams ?? parsed.team : before.team,
        scope: editScope,
        existingTeams: parseList(before.team),
        cleanDepartmentName: normalizeHrDepartmentName,
      });
      if (org.department != null || sentDept) patch.department = org.department || '';
      patch.team = org.team;
    }

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
        team: before.team || '',
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
    const delScope = managerScope(req.user);
    if (delScope && !userInScope(delScope, before)) {
      return forbid(res, 'You can only manage users in your department');
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