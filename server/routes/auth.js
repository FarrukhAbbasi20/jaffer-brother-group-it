import { Router } from 'express';
import { loginHandler, logoutHandler, meHandler, loginRateLimit, requireAuth } from '../auth.js';

const router = Router();

router.post('/login', loginRateLimit, loginHandler);
router.post('/logout', requireAuth, logoutHandler);
router.get('/me', meHandler);

export default router;
