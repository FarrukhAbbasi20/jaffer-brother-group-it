import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  listNotifications,
  unreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../notifications-store.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [items, unread] = await Promise.all([
      listNotifications(req.user.id),
      unreadNotificationCount(req.user.id),
    ]);
    res.json({ notifications: items, unread });
  } catch (err) {
    next(err);
  }
});

router.get('/unread-count', requireAuth, async (req, res, next) => {
  try {
    const unread = await unreadNotificationCount(req.user.id);
    res.json({ unread });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', requireAuth, async (req, res, next) => {
  try {
    const updated = await markAllNotificationsRead(req.user.id);
    res.json({ ok: true, updated });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const ok = await markNotificationRead(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Notification not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
