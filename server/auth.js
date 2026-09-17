import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createSession,
  consumeSession,
  findUserByEmail,
  revokeSession,
  updateUser,
  verifyPassword,
} from './auth-store.js';

const __authDir = path.dirname(fileURLToPath(import.meta.url));
const avatarsDir = path.join(__authDir, '..', 'public', 'uploads', 'avatars');

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

/** Options for clearing the session cookie (must not re-apply maxAge). */
export function clearAuthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
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

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

export async function attachUser(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    const isDocument =
      !req.path.startsWith('/api/') && !/\.[a-z0-9]{1,8}$/i.test(req.path);

    if (!token) {
      req.user = null;
      req.session = null;
      return next();
    }

    // HTML navigations: short session check so a dead cookie cannot keep serving the SPA.
    // If MySQL is cold/slow, fall through and let the client finish auth via /api/auth/me.
    const budgetMs = isDocument ? 2500 : 12000;
    try {
      const session = await withTimeout(consumeSession(token), budgetMs, 'session lookup');
      req.user = session?.user || null;
      req.session = session || null;
      if (!req.user) {
        req.deadSession = true;
        res.clearCookie(SESSION_COOKIE, clearAuthCookieOptions());
      }
      return next();
    } catch (err) {
      console.error('attachUser:', err.message || err);
      req.user = null;
      req.session = null;
      req.sessionLookupFailed = true;
      return next();
    }
  } catch (err) {
    console.error('attachUser failed:', err.message || err);
    req.user = null;
    req.session = null;
    req.sessionLookupFailed = Boolean(req.cookies?.[SESSION_COOKIE]);
    return next();
  }
}

export function requireAuth(req, res, next) {
  if (req.user) return next();
  // Mounted routers see req.path without the /api prefix — use originalUrl/baseUrl too.
  const isApi =
    (typeof req.originalUrl === 'string' && req.originalUrl.startsWith('/api/')) ||
    (typeof req.baseUrl === 'string' && req.baseUrl.startsWith('/api/')) ||
    (typeof req.path === 'string' && req.path.startsWith('/api/'));
  if (isApi) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.deadSession) {
    return res.redirect('/login?reauth=1');
  }
  // Cookie present but session lookup timed out — paint SPA; client retries /me.
  if (req.sessionLookupFailed && req.cookies?.[SESSION_COOKIE]) {
    return next();
  }
  return res.redirect('/login');
}

/**
 * Emergency / seeded password login (kept while SSO is being verified).
 * Production intent from v2 is Microsoft SSO primary; do not remove this handler yet.
 */
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
    res.clearCookie(SESSION_COOKIE, clearAuthCookieOptions());
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

export function meHandler(req, res) {
  // Clear only confirmed-dead sessions. Do not clear when lookup timed out
  // (sessionLookupFailed) — that would log people out on cold MySQL starts.
  if (!req.user && req.cookies?.[SESSION_COOKIE] && !req.sessionLookupFailed) {
    res.clearCookie(SESSION_COOKIE, clearAuthCookieOptions());
  }
  res.json({ user: req.user || null });
}

const avatarUploadSchema = z.object({
  dataUrl: z.string().min(32).max(2_500_000),
});

/**
 * Save a cropped/resized avatar (data URL) for the signed-in user.
 * Stores under /uploads/avatars and updates users.avatar_url.
 */
export async function avatarUploadHandler(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const parsed = avatarUploadSchema.parse(req.body || {});
    const match = String(parsed.dataUrl).match(
      /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i
    );
    if (!match) {
      return res.status(400).json({ error: 'Avatar must be a PNG, JPEG, or WebP image' });
    }
    const mime = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const buf = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    if (!buf.length || buf.length > 1_800_000) {
      return res.status(400).json({ error: 'Avatar file is too large (max ~1.5MB)' });
    }

    await fs.mkdir(avatarsDir, { recursive: true });
    const safeId = String(req.user.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeId}.${ext}`;
    const abs = path.join(avatarsDir, fileName);
    await fs.writeFile(abs, buf);

    // Bust browser cache when the same path is reused.
    const avatarUrl = `/uploads/avatars/${fileName}?v=${Date.now()}`;
    const user = await updateUser(req.user.id, { avatarUrl });
    req.user = user;
    return res.json({ ok: true, user, avatarUrl });
  } catch (err) {
    return next(err);
  }
}

export async function clearAvatarHandler(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const user = await updateUser(req.user.id, { avatarUrl: '' });
    req.user = user;
    return res.json({ ok: true, user });
  } catch (err) {
    return next(err);
  }
}
