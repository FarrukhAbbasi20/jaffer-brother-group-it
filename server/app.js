import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { useMysqlStorage, probeMysql } from './db.js';
import { ensureItTables } from './it-store.js';
import itProjectRoutes from './routes/it-projects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let ready;
function ensureReady() {
  if (!ready) {
    ready = (async () => {
      if (useMysqlStorage()) await ensureItTables();
    })().catch((err) => {
      console.error('Failed to prepare MySQL tables', err);
    });
  }
  return ready;
}

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));

app.use(async (req, res, next) => {
  try {
    await ensureReady();
    next();
  } catch (err) {
    next(err);
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
      payload.mysql = await probeMysql();
    } catch (err) {
      payload.mysql = { ok: false, error: err.message };
    }
  }
  res.json(payload);
});

app.use('/api/it', itProjectRoutes);

app.use(express.static(path.join(root, 'public')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(root, 'public', 'index.html'), (err) => {
    if (err) res.status(404).send('Dashboard HTML missing');
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

export default app;
