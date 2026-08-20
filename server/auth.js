import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  createSession,
  consumeSession,
  findUserByEmail,
  revokeSession,
  verifyPassword,
} from './auth-store.js';

const SESSION_COOKIE = 'git_session';

export const loginSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8),
});

export function authCookieName() {
  return SESSION_COOKIE;
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  };
}

export function authParsers() {
  return [cookieParser()];
}

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: { error: 'Too many login attempts. Please try again later.' },
});

function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export async function attachUser(req, _res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) {
      req.user = null;
      return next();
    }
    const session = await consumeSession(token);
    req.user = session?.user || null;
    req.session = session || null;
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return res.redirect('/login');
}

export async function loginHandler(req, res, next) {
  try {
    const parsed = loginSchema.parse(req.body || {});
    const user = await findUserByEmail(parsed.email);
    if (!user?.is_active) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await verifyPassword(user, parsed.password);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = newSessionToken();
    await createSession({
      userId: user.id,
      token,
      userAgent: req.headers['user-agent'] || '',
      ip: req.ip,
    });

    res.cookie(SESSION_COOKIE, token, authCookieOptions());
    return res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department || '',
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function logoutHandler(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await revokeSession(token);
    res.clearCookie(SESSION_COOKIE, authCookieOptions());
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

export function meHandler(req, res) {
  res.json({ user: req.user || null });
}
