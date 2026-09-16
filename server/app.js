import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { useMysqlStorage, probeMysql } from './db.js';
import { ensureItTables } from './it-store.js';
import { runMigrations } from './migrations/index.js';
import {
  attachUser,
  authParsers,
  requireAuth,
  authCookieName,
  clearAuthCookieOptions,
} from './auth.js';
import { consumeSession, revokeSession } from './auth-store.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import issueRoutes from './routes/issues.js';
import itProjectRoutes from './routes/it-projects.js';
import {
  startAzureLogin,
  handleAzureCallback,
  azureSsoPublicConfig,
} from './azure-sso.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let ready;
function ensureReady() {
  if (!ready) {
    ready = (async () => {
      if (useMysqlStorage()) {
        await ensureItTables();
        await runMigrations();
      }
    })().catch((err) => {
      console.error('Failed to prepare MySQL tables', err);
      ready = null;
      throw err;
    });
  }
  return ready;
}

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
for (const parser of authParsers()) app.use(parser);
app.use(express.json({ limit: '5mb' }));

app.use(async (req, res, next) => {
  if (/\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|woff2?|map)$/i.test(req.path)) return next();
  if (!req.path.startsWith('/api/')) return next();
  try {
    await Promise.race([
      ensureReady(),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
    next();
  } catch (err) {
    console.error('ensureReady:', err.message || err);
    next();
  }
});

app.get('/api/health', async (req, res) => {
  const payload = {
    ok: true,
    app: 'jaffer-brother-group-it',
    storage: useMysqlStorage() ? 'mysql' : 'none',
    time: Date.now(),
  };
  if (useMysqlStorage() && req.query.probe === '1') {
    try {
      await ensureReady();
      payload.mysql = await probeMysql();
    } catch (err) {
      payload.mysql = { ok: false, error: err.message };
    }
  }
  res.json(payload);
});

app.use(attachUser);
app.use('/api/auth', authRoutes);
app.get('/api/auth/sso', (req, res) => res.json(azureSsoPublicConfig()));
app.get('/auth/azure', startAzureLogin);
app.get('/auth/azure/callback', handleAzureCallback);
app.use('/api/users', userRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/it', itProjectRoutes);

app.get('/login', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const token = req.cookies?.[authCookieName()];
  const forceReauth = String(req.query.reauth || '') === '1';

  if (forceReauth) {
    if (token) {
      try { await revokeSession(token); } catch (_) {}
    }
    res.clearCookie(authCookieName(), clearAuthCookieOptions());
    return res.sendFile(path.join(root, 'public', 'login.html'));
  }

  if (token) {
    try {
      const session = await Promise.race([
        consumeSession(token),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
      if (session?.user) return res.redirect('/');
    } catch (_) {
      res.clearCookie(authCookieName(), clearAuthCookieOptions());
    }
  }
  res.sendFile(path.join(root, 'public', 'login.html'));
});

app.use((req, res, next) => {
  if (req.path === '/login' || req.path.startsWith('/api/') || req.path.startsWith('/auth/')) return next();
  if (req.path.startsWith('/css/') || req.path.startsWith('/assets/') || req.path.startsWith('/js/')) return next();
  if (/\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|woff2?|map)$/i.test(req.path)) return next();
  return requireAuth(req, res, next);
});

app.use(express.static(path.join(root, 'public'), {
  index: false,
  maxAge: '1h',
  setHeaders(res, filePath) {
    if (/index\.html$/i.test(filePath) || /login\.html$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  },
}));

async function sendAppShell(res) {
  const file = path.join(root, 'public', 'index.html');
  let html = await fs.readFile(file, 'utf8');
  const additions = [];
  if (!html.includes('/css/final-polish.css')) additions.push('<link rel="stylesheet" href="/css/final-polish.css?v=4">');
  if (!html.includes('/css/overview-v3.css')) additions.push('<link rel="stylesheet" href="/css/overview-v3.css?v=3">');
  if (!html.includes('/css/sidebar-v3.css')) additions.push('<link rel="stylesheet" href="/css/sidebar-v3.css?v=1">');
  if (additions.length) html = html.replace('</head>', additions.join('\n') + '\n</head>');
  const scripts = [];
  if (!html.includes('/js/overview-v3.js')) scripts.push('<script src="/js/overview-v3.js?v=3"></script>');
  if (!html.includes('/js/sidebar-v3.js')) scripts.push('<script src="/js/sidebar-v3.js?v=1"></script>');
  if (scripts.length) html = html.replace('</body>', scripts.join('\n') + '\n</body>');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.type('html').send(html);
}

app.get('/', async (req, res, next) => {
  try { await sendAppShell(res); } catch (err) { next(err); }
});

app.get('*', async (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  try { await sendAppShell(res); }
  catch (err) {
    console.error('Dashboard HTML missing', err);
    res.status(404).send('Dashboard HTML missing');
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: err.message || 'Server error' });
  return res.redirect('/login');
});

export default app;