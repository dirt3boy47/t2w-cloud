const express = require('express');
const {
  createUser, listUsers, deleteUser, setPassword, setRole, requireAdmin,
} = require('./auth');
const { resetProjectProgress, projectStatus, audit, recordAdminAction } = require('./admin');

const router = express.Router();
router.use(requireAdmin);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const actor = (req) => req.session && req.session.user ? req.session.user.username : 'admin';

router.get('/status', wrap(async (_req, res) => res.json(await projectStatus())));
router.get('/users', wrap(async (_req, res) => res.json(await listUsers())));
router.get('/audit', wrap(async (req, res) => res.json(await audit(req.query.limit))));

router.post('/users', wrap(async (req, res) => {
  const { username, password, fullName, role, email } = req.body || {};
  const user = await createUser(username, password, fullName, role || 'editor', email || null);
  await recordAdminAction(actor(req), 'create_user', { username: user.username, role: user.role });
  res.status(201).json(user);
}));

router.put('/users/:username/role', wrap(async (req, res) => {
  const target = String(req.params.username || '').toLowerCase();
  const role = req.body && req.body.role;
  if (target === actor(req).toLowerCase() && role !== 'admin') {
    return res.status(400).json({ error: 'You cannot remove your own administrator access while signed in.' });
  }
  await setRole(target, role);
  await recordAdminAction(actor(req), 'set_user_role', { username: target, role });
  res.json({ ok: true });
}));

router.put('/users/:username/password', wrap(async (req, res) => {
  const target = String(req.params.username || '').toLowerCase();
  await setPassword(target, req.body && req.body.password);
  await recordAdminAction(actor(req), 'set_user_password', { username: target });
  res.json({ ok: true });
}));

router.delete('/users/:username', wrap(async (req, res) => {
  const target = String(req.params.username || '').toLowerCase();
  if (target === actor(req).toLowerCase()) {
    return res.status(400).json({ error: 'You cannot delete the account you are currently using.' });
  }
  await deleteUser(target);
  await recordAdminAction(actor(req), 'delete_user', { username: target });
  res.json({ ok: true });
}));

router.post('/reset-project', wrap(async (req, res) => {
  if (!req.body || req.body.confirm !== 'RESET') {
    return res.status(400).json({ error: 'Type RESET to confirm the project reset.' });
  }
  const status = await resetProjectProgress(actor(req));
  res.json({ ok: true, status });
}));

module.exports = router;
