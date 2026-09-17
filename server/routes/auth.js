import { Router } from 'express';
import {
  loginHandler,
  logoutHandler,
  meHandler,
  loginRateLimit,
  requireAuth,
  avatarUploadHandler,
  clearAvatarHandler,
} from '../auth.js';

const router = Router();

router.post('/login', loginRateLimit, loginHandler);
router.post('/logout', logoutHandler);
router.get('/me', meHandler);
router.post('/avatar', requireAuth, avatarUploadHandler);
router.delete('/avatar', requireAuth, clearAvatarHandler);

export default router;
