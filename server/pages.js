/** Portal pages with per-user None / View / Write access. */

export const PORTAL_PAGES = [
  { key: 'dashboard', label: 'Overview' },
  { key: 'projects', label: 'Projects' },
  { key: 'kanban', label: 'Board' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'issues', label: 'Issues' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'users', label: 'Users' },
];

export const PAGE_ACCESS_LEVELS = ['none', 'view', 'write'];

export function parsePageAccess(raw) {
  if (!raw) return {};
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out = {};
  for (const { key } of PORTAL_PAGES) {
    const v = String(obj[key] || '').toLowerCase();
    if (v === 'view' || v === 'write' || v === 'none') out[key] = v;
  }
  return out;
}

export function sanitizePageAccess(input, { defaultLevel = 'write' } = {}) {
  const parsed = parsePageAccess(input);
  const out = {};
  for (const { key } of PORTAL_PAGES) {
    const v = parsed[key];
    if (v === 'view' || v === 'write' || v === 'none') out[key] = v;
    else out[key] = defaultLevel === 'view' ? 'view' : defaultLevel === 'none' ? 'none' : 'write';
  }
  return out;
}

export function defaultPageAccessForRole(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'admin' || r === 'manager') {
    return sanitizePageAccess({}, { defaultLevel: 'write' });
  }
  const base = sanitizePageAccess({}, { defaultLevel: r === 'viewer' ? 'view' : 'write' });
  base.users = 'none';
  return base;
}

export function canViewPage(user, pageKey) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const level = String(user.pageAccess?.[pageKey] || '').toLowerCase();
  return level === 'view' || level === 'write';
}

export function canWritePage(user, pageKey) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return String(user.pageAccess?.[pageKey] || '').toLowerCase() === 'write';
}
