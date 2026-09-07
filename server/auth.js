const { createClient } = require('@supabase/supabase-js');
const db = require('./db');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const AUTH_DOMAIN = process.env.T2W_AUTH_DOMAIN || 't2w.invalid';

function assertAuthConfig() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_PUBLISHABLE_KEY) missing.push('SUPABASE_PUBLISHABLE_KEY');
  if (!SUPABASE_SECRET_KEY) missing.push('SUPABASE_SECRET_KEY');
  if (missing.length) throw new Error(`Missing Supabase Auth configuration: ${missing.join(', ')}`);
}

function publicClient() {
  assertAuthConfig();
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function adminClient() {
  assertAuthConfig();
  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function cleanUsername(username) {
  return String(username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

function defaultEmail(username) {
  return `${cleanUsername(username)}@${AUTH_DOMAIN}`;
}

async function userCount() {
  const row = await db.prepare(`SELECT COUNT(*)::int AS n FROM app_profiles`).get();
  return row ? Number(row.n) : 0;
}

async function createUser(username, password, fullName, role = 'editor', email = null) {
  const u = cleanUsername(username);
  if (!u) throw new Error('Username is required');
  if (!password || String(password).length < 8) throw new Error('Password must be at least 8 characters');
  if (!['admin', 'editor', 'viewer'].includes(role)) throw new Error('Role must be admin, editor or viewer');

  const accountEmail = String(email || defaultEmail(u)).trim().toLowerCase();
  const supabase = adminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: accountEmail,
    password: String(password),
    email_confirm: true,
    user_metadata: { username: u, full_name: fullName || u, role },
  });
  if (error) throw new Error(error.message);

  try {
    await db.prepare(`
      INSERT INTO app_profiles (user_id, username, email, full_name, role)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET
        username=excluded.username, email=excluded.email, full_name=excluded.full_name, role=excluded.role
    `).run(data.user.id, u, accountEmail, fullName || u, role);
  } catch (err) {
    try { await supabase.auth.admin.deleteUser(data.user.id); } catch (_) {}
    throw err;
  }

  return { id: data.user.id, username: u, email: accountEmail, fullName: fullName || u, role };
}

async function profileForLogin(login) {
  const v = String(login || '').trim().toLowerCase();
  if (!v) return null;
  if (v.includes('@')) {
    return db.prepare(`SELECT * FROM app_profiles WHERE lower(email)=? LIMIT 1`).get(v);
  }
  return db.prepare(`SELECT * FROM app_profiles WHERE username=? LIMIT 1`).get(cleanUsername(v));
}

async function verifyUser(login, password) {
  const profile = await profileForLogin(login);
  if (!profile) return null;
  const supabase = publicClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: String(password || ''),
  });
  if (error || !data.user) return null;
  return {
    id: data.user.id,
    username: profile.username,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
  };
}

async function ensureFirstUser() {
  if (await userCount() > 0) return;
  const user = process.env.T2W_ADMIN_USER || 'admin';
  const pass = process.env.T2W_ADMIN_PASS;
  const fullName = process.env.T2W_ADMIN_FULL_NAME || 'Administrator';
  const email = process.env.T2W_ADMIN_EMAIL || null;
  if (!pass) {
    throw new Error('No T2W users exist. Set T2W_ADMIN_PASS before first start.');
  }
  await createUser(user, pass, fullName, 'admin', email);
  console.log(`Created first T2W administrator "${user}" in Supabase Auth.`);
}

async function listUsers() {
  return db.prepare(`
    SELECT user_id AS id, username, email, full_name AS "fullName", role, created_at AS "createdAt"
    FROM app_profiles ORDER BY username
  `).all();
}

async function deleteUser(username) {
  const u = cleanUsername(username);
  const profile = await db.prepare(`SELECT * FROM app_profiles WHERE username=?`).get(u);
  if (!profile) throw new Error('Unknown user');
  const admins = await db.prepare(`SELECT COUNT(*)::int AS n FROM app_profiles WHERE role='admin'`).get();
  if (profile.role === 'admin' && Number(admins.n) <= 1) throw new Error('You cannot delete the last administrator');
  const supabase = adminClient();
  const { error } = await supabase.auth.admin.deleteUser(profile.user_id);
  if (error) throw new Error(error.message);
  await db.prepare(`DELETE FROM app_profiles WHERE user_id=?`).run(profile.user_id);
}

async function setPassword(username, password) {
  if (!password || String(password).length < 8) throw new Error('Password must be at least 8 characters');
  const profile = await db.prepare(`SELECT * FROM app_profiles WHERE username=?`).get(cleanUsername(username));
  if (!profile) throw new Error('Unknown user');
  const supabase = adminClient();
  const { error } = await supabase.auth.admin.updateUserById(profile.user_id, { password: String(password) });
  if (error) throw new Error(error.message);
}

async function setRole(username, role) {
  if (!['admin', 'editor', 'viewer'].includes(role)) throw new Error('Role must be admin, editor or viewer');
  const u = cleanUsername(username);
  const profile = await db.prepare(`SELECT * FROM app_profiles WHERE username=?`).get(u);
  if (!profile) throw new Error('Unknown user');
  if (profile.role === 'admin' && role !== 'admin') {
    const admins = await db.prepare(`SELECT COUNT(*)::int AS n FROM app_profiles WHERE role='admin'`).get();
    if (Number(admins.n) <= 1) throw new Error('You cannot remove the last administrator');
  }
  await db.prepare(`UPDATE app_profiles SET role=?, updated_at=now() WHERE user_id=?`).run(role, profile.user_id);
}

function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not logged in' });
  return res.redirect('/login.html');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Administrator access required' });
}

function requireEditor(req, res, next) {
  const role = req.session && req.session.user && req.session.user.role;
  if (role === 'admin' || role === 'editor') return next();
  return res.status(403).json({ error: 'This account is read only' });
}

module.exports = {
  createUser, verifyUser, ensureFirstUser, userCount, listUsers, deleteUser,
  setPassword, setRole, requireLogin, requireAdmin, requireEditor,
};
