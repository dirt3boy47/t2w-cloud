const express = require('express');
const db = require('./db');
const schedule = require('./schedule');
const { requireEditor } = require('./auth');

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const editor = [requireEditor];

function by(req) {
  return (req.session.user && req.session.user.fullName) || 'web';
}

router.get('/live', asyncRoute(async (req, res) => {
  res.json(await schedule.liveProgress(req.query.asOf));
}));

router.get('/activities', asyncRoute(async (req, res) => {
  const rows = await schedule.activityCandidates({
    section: req.query.section || '',
    crew: req.query.crew || '',
    date: req.query.date || '',
    chainage: req.query.chainage === undefined ? null : req.query.chainage,
  });
  res.json(rows);
}));

router.post('/eod-link', ...editor, asyncRoute(async (req, res) => {
  res.json(await schedule.linkEod({ ...(req.body || {}), by: by(req) }));
}));

router.put('/manual/:activityId', ...editor, asyncRoute(async (req, res) => {
  await schedule.updateManual(req.params.activityId, req.body || {}, by(req));
  res.json(await schedule.liveProgress(req.body && req.body.asOf));
}));

router.put('/method/:activityId', ...editor, asyncRoute(async (req, res) => {
  const allowed = new Set(['METRES', 'ASSETS', 'MANUAL', 'MILESTONE']);
  const method = String((req.body && req.body.method) || '').toUpperCase();
  if (!allowed.has(method)) return res.status(400).json({ error: 'Method must be METRES, ASSETS, MANUAL or MILESTONE' });
  const track = method === 'METRES' ? String((req.body && req.body.track) || 'pipe').toLowerCase() : null;
  if (track && !['pipe', 'trench'].includes(track)) return res.status(400).json({ error: 'Track must be pipe or trench' });
  const row = await db.prepare(`
    UPDATE app_schedule_activity SET progress_method=?, progress_track=?, method_locked=true,
      planned_quantity=CASE WHEN ?='METRES' AND chainage_from_m IS NOT NULL AND chainage_to_m IS NOT NULL
        THEN GREATEST(0, chainage_to_m-chainage_from_m) ELSE planned_quantity END,
      updated_at=now()
    WHERE activity_id=? RETURNING activity_id
  `).get(method, track, method, req.params.activityId);
  if (!row) return res.status(404).json({ error: 'Schedule activity not found' });
  res.json(await schedule.liveProgress(req.body && req.body.asOf));
}));

module.exports = router;
