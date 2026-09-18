const GLOBAL_ROLES = ['viewer', 'lead', 'owner', 'manager', 'admin'];

export const ACTIONS = {
  VIEW_ALL_PROJECTS: 'view_all_projects',
  CREATE_PROJECT: 'create_project',
  EDIT_ANY_PROJECT: 'edit_any_project',
  EDIT_OWN_PROJECT: 'edit_own_project',
  DELETE_PROJECT: 'delete_project',
  CREATE_MONTHLY_MILESTONE: 'create_monthly_milestone',
  CREATE_TASK_ON_OWN_PROJECT: 'create_task_on_own_project',
  EDIT_ASSIGNED_TASK: 'edit_assigned_task',
  REASSIGN_TASK: 'reassign_task',
  COMMENT: 'comment',
  VIEW_BUDGET: 'view_budget',
  EXPORT: 'export',
  MANAGE_USERS: 'manage_users',
  VIEW_AUDIT_LOG: 'view_audit_log',
};

function normalizeRole(role) {
  return GLOBAL_ROLES.includes(role) ? role : 'viewer';
}

function isProjectOwner(user, resource) {
  if (!user?.id || !resource) return false;
  if (resource.reporterId === user.id) return true;
  const ownerIds = Array.isArray(resource.ownerIds)
    ? resource.ownerIds
    : resource.ownerId
      ? [resource.ownerId]
      : [];
  if (ownerIds.includes(user.id)) return true;
  const projectOwnerIds = Array.isArray(resource.projectOwnerIds)
    ? resource.projectOwnerIds
    : resource.projectOwnerId
      ? [resource.projectOwnerId]
      : [];
  return projectOwnerIds.includes(user.id);
}

function isTaskAssignee(user, resource) {
  if (!user?.id || !resource) return false;
  if (resource.assigneeId === user.id) return true;
  const ownerIds = Array.isArray(resource.ownerIds)
    ? resource.ownerIds
    : resource.ownerId
      ? [resource.ownerId]
      : [];
  if (ownerIds.includes(user.id)) return true;
  const leadIds = Array.isArray(resource.leadIds)
    ? resource.leadIds
    : resource.leadId
      ? [resource.leadId]
      : [];
  if (leadIds.includes(user.id)) return true;
  const projectLeadIds = Array.isArray(resource.projectLeadIds)
    ? resource.projectLeadIds
    : resource.projectLeadId
      ? [resource.projectLeadId]
      : [];
  return projectLeadIds.includes(user.id);
}

export function can(user, action, resource = null) {
  const role = normalizeRole(user?.role);
  if (role === 'admin') return true;

  switch (action) {
    case ACTIONS.VIEW_ALL_PROJECTS:
      return true;
    case ACTIONS.CREATE_PROJECT:
      // Custodian (owner) may create within their department scope (enforced in routes).
      return role === 'manager' || role === 'owner';
    case ACTIONS.EDIT_ANY_PROJECT:
    case ACTIONS.CREATE_MONTHLY_MILESTONE:
    case ACTIONS.MANAGE_USERS:
    case ACTIONS.VIEW_AUDIT_LOG:
      return role === 'manager';
    case ACTIONS.EDIT_OWN_PROJECT:
      return role === 'manager' || role === 'owner' ? isProjectOwner(user, resource) : false;
    case ACTIONS.DELETE_PROJECT:
      return false;
    case ACTIONS.CREATE_TASK_ON_OWN_PROJECT:
      return role === 'manager' || (role === 'owner' && isProjectOwner(user, resource));
    case ACTIONS.EDIT_ASSIGNED_TASK:
      return role === 'manager' || role === 'owner'
        ? true
        : role === 'lead'
          ? isTaskAssignee(user, resource)
          : false;
    case ACTIONS.REASSIGN_TASK:
      return role === 'manager' || (role === 'owner' && isProjectOwner(user, resource));
    case ACTIONS.COMMENT:
      return role !== 'viewer';
    case ACTIONS.VIEW_BUDGET:
      return role === 'manager' || (role === 'owner' && isProjectOwner(user, resource));
    case ACTIONS.EXPORT:
      return true;
    default:
      return false;
  }
}

export function requireCan(user, action, resource = null) {
  if (!can(user, action, resource)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
}
