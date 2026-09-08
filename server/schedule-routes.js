const express = require('express');
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

module.exports = router;
