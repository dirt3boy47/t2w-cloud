const express = require('express');
const db = require('./db');
const analysis = require('./analysis');

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function requireClientReportAccess(req, res, next) {
  const role = req.session && req.session.user && req.session.user.role;
  if (role === 'client_viewer' || role === 'admin') return next();
  return res.status(403).json({ error: 'Client report access is required' });
}

function pick(row, keys) {
  if (!row) return null;
  const out = {};
  for (const key of keys) out[key] = row[key];
  return out;
}

const PROGRESS_FIELDS = [
  'Pipeline Section', 'Trench From Ch (m)', 'Trench To Ch (m)', 'Trench m Today',
  'Pipe From Ch (m)', 'Pipe To Ch (m)', 'Pipe m Today', 'Weather', 'Downtime (hrs)',
];
const PLANT_FIELDS = [
  'Pipeline Section', 'Crew', 'Type', 'Description', 'Number', 'Hours', 'Standby Hours',
];
const SAFETY_FIELDS = [
  'Date', 'Toolbox Held', 'Toolbox Topic', 'Personnel On Site', 'Incident Class',
  'Incident Detail', 'Lost Time (hrs)',
];
const HOLD_POINT_FIELDS = ['_id', 'Date', 'Reference', 'Description', 'Status', 'Record Key'];

async function completedRows(from, to) {
  return db.prepare(`
    SELECT a."Record Key" AS "recordKey",
      a."Pipeline Section" AS section,
      a."Register" AS register,
      a."Asset Type" AS "assetType",
      a."Chainage Start (m)" AS chainage,
      a."Completion Date" AS "completionDate",
      a."Quantity" AS quantity,
      a."Unit" AS unit,
      a."Claim Item No (PC02)" AS "claimItem",
      COALESCE(eod_link.activity_id, schedule_link.activity_id) AS "activityId",
      sa.activity_name AS "activityName",
      sa.cost_code AS "costCode"
    FROM tblAsset a
    LEFT JOIN LATERAL (
      SELECT x.activity_id
      FROM app_eod_activity_asset x
      WHERE x.record_key = a."Record Key"
      ORDER BY x.created_at DESC NULLS LAST, x.id DESC
      LIMIT 1
    ) eod_link ON true
    LEFT JOIN LATERAL (
      SELECT x.activity_id
      FROM app_schedule_activity_asset x
      WHERE x.record_key = a."Record Key"
      ORDER BY x.linked_at DESC NULLS LAST
      LIMIT 1
    ) schedule_link ON true
    LEFT JOIN app_schedule_activity sa
      ON sa.activity_id = COALESCE(eod_link.activity_id, schedule_link.activity_id)
    WHERE a."Complete"='Yes'
      AND a."Completion Date">=?
      AND a."Completion Date"<=?
    ORDER BY a."Completion Date" DESC, a."Pipeline Section", a."Chainage Start (m)"
  `).all(from, to);
}

router.use(requireClientReportAccess);

router.get('/overview', asyncRoute(async (_req, res) => {
  const [sections, counts] = await Promise.all([
    db.prepare(`
      SELECT "Pipeline Section" AS section,
        "Section extent (m)" AS extent,
        "TRENCH" AS "trenchFront",
        "PIPE" AS "pipeFront",
        "As At Date" AS "asAt"
      FROM tblProgressControl
      ORDER BY "Pipeline Section"
    `).all(),
    db.prepare(`
      SELECT "Pipeline Section" AS section,
        COUNT(*)::int AS records,
        SUM(CASE WHEN "Complete"='Yes' THEN 1 ELSE 0 END)::int AS complete
      FROM tblAsset
      GROUP BY "Pipeline Section"
      ORDER BY "Pipeline Section"
    `).all(),
  ]);
  res.json({ sections, counts });
}));

router.get('/day', asyncRoute(async (req, res) => {
  const date = String(req.query.date || '');
  const d = await analysis.dayReport(date);
  const completed = await completedRows(date, date);
  res.json({
    date,
    progress: d.progress.map((r) => pick(r, PROGRESS_FIELDS)),
    plant: d.plant.map((r) => pick(r, PLANT_FIELDS)),
    safety: pick(d.safety, SAFETY_FIELDS),
    holdPoints: d.holdPoints.map((r) => pick(r, HOLD_POINT_FIELDS)),
    completed,
  });
}));

router.get('/production', asyncRoute(async (req, res) => {
  const d = await analysis.production(req.query.from, req.query.to);
  res.json({
    rows: d.rows.map((r) => ({
      date: r.date,
      section: r.section,
      trenchM: Number(r.trenchM || 0),
      pipeM: Number(r.pipeM || 0),
      downtime: Number(r.downtime || 0),
    })),
    totals: {
      days: d.totals.days,
      trenchM: d.totals.trenchM,
      pipeM: d.totals.pipeM,
      downtime: d.totals.downtime,
      avgTrenchM: d.totals.avgTrenchM,
      avgPipeM: d.totals.avgPipeM,
    },
  });
}));

router.get('/look-ahead', asyncRoute(async (req, res) => {
  const rows = await analysis.lookAhead(Number(req.query.metres) || 500);
  res.json(rows.map((r) => ({
    recordKey: r.recordKey,
    section: r.section,
    register: r.register,
    assetType: r.assetType,
    chainage: r.chainage,
    driver: r.driver,
    front: r.front,
    ahead: r.ahead,
    feature: r.feature,
  })));
}));

router.get('/quantities', asyncRoute(async (_req, res) => {
  const rows = await analysis.quantities();
  res.json(rows.map((r) => ({
    section: r.section,
    register: r.register,
    assetType: r.assetType,
    records: r.records,
    complete: r.complete,
    quantity: r.quantity,
    unit: r.unit,
  })));
}));

router.get('/outstanding', asyncRoute(async (_req, res) => {
  const rows = await analysis.outstanding();
  res.json(rows.map((r) => ({
    recordKey: r.recordKey,
    section: r.section,
    register: r.register,
    assetType: r.assetType,
    chainage: r.chainage,
    driver: r.driver,
    feature: r.feature,
  })));
}));

router.get('/completed', asyncRoute(async (req, res) => {
  res.json(await completedRows(req.query.from, req.query.to));
}));

router.get('/safety-plant', asyncRoute(async (req, res) => {
  const d = await analysis.safetyAndPlant(req.query.from, req.query.to);
  res.json({
    safety: d.safety.map((r) => pick(r, SAFETY_FIELDS)),
    plant: d.plant.map((r) => ({
      date: r.date,
      section: r.section,
      crew: r.crew,
      type: r.type,
      description: r.description,
      hours: r.hours,
    })),
    holdPoints: d.holdPoints.map((r) => pick(r, HOLD_POINT_FIELDS)),
  });
}));

module.exports = router;
