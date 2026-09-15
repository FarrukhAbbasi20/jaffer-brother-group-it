import { Router } from 'express';
import { loginHandler, logoutHandler, meHandler, loginRateLimit } from '../auth.js';

const router = Router();

router.post('/login', loginRateLimit, loginHandler);
router.post('/logout', logoutHandler);
router.get('/me', meHandler);

export default router;
