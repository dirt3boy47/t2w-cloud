const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const db = require('./db');
const { verifyUser, ensureFirstUser, requireLogin } = require('./auth');
const apiRoutes = require('./routes');
const adminRoutes = require('./admin-routes');
const { migrate } = require('./migrate');
const { seed } = require('./seed-postgres');

const app = express();
const PORT = Number(process.env.PORT || 3000);

async function start() {
  await db.ready();
  await migrate();

  if (process.env.T2W_AUTO_SEED !== 'false') {
    const row = await db.prepare(`SELECT COUNT(*)::int AS n FROM tblAsset`).get();
    if (!row || Number(row.n) === 0) {
      console.log('No T2W source data found. Loading the packaged project baseline.');
      await seed({ force: false, freshStart: process.env.T2W_FRESH_START_ON_SEED !== 'false' });
    }
  }

  await ensureFirstUser();

  if (process.env.T2W_TRUST_PROXY === 'true') app.set('trust proxy', 1);

  app.use(express.json({ limit: '2mb' }));
  app.use(session({
    proxy: process.env.T2W_TRUST_PROXY === 'true',
    store: new pgSession({
      pool: db.pool,
      tableName: 'user_sessions',
      createTableIfMissing: true,
      pruneSessionInterval: 60 * 15,
    }),
    secret: process.env.T2W_SESSION_SECRET || 'development-only-change-me',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 12,
      secure: process.env.NODE_ENV === 'production' && process.env.T2W_TRUST_PROXY === 'true',
      httpOnly: true,
      sameSite: 'lax',
    },
  }));

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  app.post('/api/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const user = await verifyUser(username || '', password || '');
      if (!user) return res.status(401).json({ error: 'Wrong username or password' });
      req.session.user = user;
      return req.session.save(() => res.json({
        ok: true,
        user: { username: user.username, fullName: user.fullName, role: user.role },
      }));
    } catch (err) {
      console.error('Login error', err);
      return res.status(500).json({ error: 'Login service is unavailable' });
    }
  });

  app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get('/api/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
    return res.json(req.session.user);
  });

  const publicDir = path.join(__dirname, '..', 'public');
  app.use('/login.html', express.static(path.join(publicDir, 'login.html')));
  app.use('/login.js', express.static(path.join(publicDir, 'login.js')));
  app.use('/style.css', express.static(path.join(publicDir, 'style.css')));

  app.use(requireLogin);
  app.use('/api/admin', adminRoutes);
  app.use('/api', apiRoutes);
  app.use(express.static(publicDir));

  app.use((err, _req, res, _next) => {
    console.error(err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Unexpected server error' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`T2W register listening on 0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error('T2W failed to start:', err);
  process.exit(1);
});
