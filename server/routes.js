const express = require('express');
const db = require('./db');
const engine = require('./engine');
const analysis = require('./analysis');
const crews = require('./crews');
const { requireEditor } = require('./auth');

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const editor = [requireEditor];

function by(req) {
  return (req.session.user && req.session.user.fullName) || 'web';
}

router.get('/assets', asyncRoute(async (req, res) => {
  const { section, register, assetType, chFrom, chTo, text, drawing, notComplete } = req.query;
  let sql = `SELECT * FROM tblAsset WHERE 1=1`;
  const params = [];
  if (section) { sql += ` AND "Pipeline Section"=?`; params.push(section); }
  if (register) { sql += ` AND "Register"=?`; params.push(register); }
  if (assetType) { sql += ` AND "Asset Type"=?`; params.push(assetType); }
  if (chFrom) { sql += ` AND COALESCE("Chainage End (m)","Chainage Start (m)") >= ?`; params.push(Number(chFrom)); }
  if (chTo) { sql += ` AND "Chainage Start (m)" <= ?`; params.push(Number(chTo)); }
  if (drawing) { sql += ` AND "Drawing (Start)" ILIKE ?`; params.push(`%${drawing}%`); }
  if (text) {
    sql += ` AND ("Feature Name" ILIKE ? OR "Utility Description" ILIKE ? OR "Operator" ILIKE ?
      OR "Comments" ILIKE ? OR "Asset ID" ILIKE ? OR "Record Key" ILIKE ?)`;
    for (let i = 0; i < 6; i++) params.push(`%${text}%`);
  }
  if (notComplete === 'true') sql += ` AND COALESCE("Complete",'') <> 'Yes'`;
  sql += ` ORDER BY "Pipeline Section", "Chainage Start (m)" LIMIT 1000`;
  res.json(await db.prepare(sql).all(...params));
}));

router.get('/assets/facets', asyncRoute(async (_req, res) => {
  const col = async (name) => (await db.prepare(
    `SELECT DISTINCT "${name}" AS v FROM tblAsset WHERE "${name}" IS NOT NULL ORDER BY 1`
  ).all()).map((r) => r.v);
  const [sections, registers, assetTypes] = await Promise.all([
    col('Pipeline Section'), col('Register'), col('Asset Type'),
  ]);
  res.json({ sections, registers, assetTypes });
}));

router.get('/assets/:key', asyncRoute(async (req, res) => {
  const row = await db.prepare(`SELECT * FROM tblAsset WHERE "Record Key"=?`).get(req.params.key);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
}));

router.put('/assets/:key', ...editor, asyncRoute(async (req, res) => {
  await engine.updateAsset(req.params.key, req.body, by(req));
  res.json({ ok: true });
}));

router.get('/assets/:key/history', asyncRoute(async (req, res) => {
  res.json(await db.prepare(`
    SELECT * FROM tblEditLog WHERE "Record Key"=? ORDER BY "Timestamp" DESC LIMIT 200
  `).all(req.params.key));
}));

router.get('/progress-control', asyncRoute(async (_req, res) => {
  res.json(await db.prepare(`SELECT * FROM tblProgressControl ORDER BY "Pipeline Section"`).all());
}));
router.get('/trench-sections', asyncRoute(async (req, res) => res.json(await engine.trenchSections(req.query.section))));
router.get('/pipe-segments', asyncRoute(async (req, res) => res.json(await engine.pipeSegments(req.query.section))));
router.get('/point-assets', asyncRoute(async (req, res) => res.json(await engine.pointAssets(req.query.section))));

router.get('/dashboard/totals', asyncRoute(async (_req, res) => res.json(await engine.projectTotals())));
router.get('/dashboard/by-trench-type', asyncRoute(async (_req, res) => res.json(await engine.costByTrenchType())));
router.get('/dashboard/by-pipe-type', asyncRoute(async (_req, res) => res.json(await engine.costByPipeType())));
router.get('/dashboard/by-point-asset', asyncRoute(async (_req, res) => res.json(await engine.costByPointAsset())));
router.get('/dashboard/unpriced', asyncRoute(async (_req, res) => {
  res.json(await db.prepare(`
    SELECT "Pipeline Section" AS section, "Register" AS register, "Asset Type" AS "assetType",
      COUNT(*)::int AS records
    FROM tblAsset WHERE "Total Cost ($)" IS NULL AND "Register" NOT IN ('Trench Type','Pipe')
    GROUP BY 1,2,3 ORDER BY records DESC
  `).all());
}));

const RATE_TABLES = {
  trench: 'tblRateTrench', pipe: 'tblRatePipe', point: 'tblRatePoint',
  thrustblock: 'tblRateThrustBlock', bend: 'tblRateBend', valve: 'tblRateValve',
  plantlabour: 'tblRatePlantLabour',
};
router.get('/rates/:table', asyncRoute(async (req, res) => {
  const t = RATE_TABLES[req.params.table];
  if (!t) return res.status(404).json({ error: 'Unknown rate table' });
  res.json(await db.prepare(`SELECT _id, * FROM ${t} ORDER BY _id`).all());
}));
router.put('/rates/:table/:id', ...editor, asyncRoute(async (req, res) => {
  const t = RATE_TABLES[req.params.table];
  if (!t) return res.status(404).json({ error: 'Unknown rate table' });
  const sets = Object.keys(req.body).filter((k) => k !== '_id').map((k) => `"${k.replace(/"/g, '""')}"=?`);
  if (!sets.length) return res.json({ ok: true });
  const values = Object.entries(req.body).filter(([k]) => k !== '_id').map(([, v]) => v);
  await db.prepare(`UPDATE ${t} SET ${sets.join(', ')} WHERE _id=?`).run(...values, req.params.id);
  res.json({ ok: true });
}));

router.post('/end-of-day', ...editor, asyncRoute(async (req, res) => {
  res.json(await engine.endOfDay({ ...req.body, by: by(req) }));
}));
router.post('/tick-passed-assets', ...editor, asyncRoute(async (req, res) => {
  res.json({ ticked: await engine.tickPassedAssets(by(req)) });
}));
router.post('/recalculate', ...editor, asyncRoute(async (_req, res) => {
  await engine.recalcAllTrenchFronts();
  res.json({ ok: true });
}));
router.get('/daily-progress', asyncRoute(async (_req, res) => {
  res.json(await db.prepare(`SELECT * FROM tblDailyProgress ORDER BY "Date" DESC, _id DESC LIMIT 200`).all());
}));

router.get('/plant-labour', asyncRoute(async (req, res) => {
  const { date, section, crew } = req.query;
  const where = [], params = [];
  if (date) { where.push(`"Date"=?`); params.push(date); }
  if (section) { where.push(`"Pipeline Section"=?`); params.push(section); }
  if (crew) { where.push(`"Crew"=?`); params.push(crew); }
  const sql = `SELECT _id, * FROM tblDailyPlantLabour`
    + (where.length ? ` WHERE ${where.join(' AND ')}` : '')
    + ` ORDER BY "Date" DESC, _id` + (!date ? ` LIMIT 200` : '');
  res.json(await db.prepare(sql).all(...params));
}));

router.get('/plant-labour/options', asyncRoute(async (req, res) => {
  const date = req.query.date || '9999-12-31';
  const section = req.query.section || '';
  const crew = req.query.crew || '';
  const [history, rates, standing] = await Promise.all([
    db.prepare(`
      SELECT "Type" AS "Type", "Description" AS "Description", "Number" AS "Number",
        "Hours" AS "Hours", "Date" AS "lastUsed", "Pipeline Section" AS section, "Crew" AS crew
      FROM tblDailyPlantLabour WHERE "Date"<? AND COALESCE("Description",'')<>''
      ORDER BY CASE WHEN "Pipeline Section"=? AND "Crew"=? THEN 0 ELSE 1 END, "Date" DESC, _id DESC
    `).all(date, section, crew),
    db.prepare(`
      SELECT "Type" AS "Type", "Description" AS "Description" FROM tblRatePlantLabour
      WHERE COALESCE("Description",'')<>'' ORDER BY "Type", "Description"
    `).all(),
    db.prepare(`
      SELECT "Type" AS "Type", "Description" AS "Description", "Number" AS "Number",
        "Default Hours" AS "Hours" FROM tblStandingResource
      WHERE COALESCE("Description",'')<>'' ORDER BY "Type", "Description"
    `).all(),
  ]);
  const out = [], seen = new Set();
  const add = (r) => {
    const key = `${r.Type || ''}|${r.Description || ''}`;
    if (!r.Description || seen.has(key)) return;
    seen.add(key); out.push(r);
  };
  history.forEach(add);
  rates.forEach((r) => add({ ...r, Number: 1, Hours: null, lastUsed: null }));
  standing.forEach((r) => add({ ...r, lastUsed: null }));
  res.json(out);
}));

router.post('/plant-labour', ...editor, asyncRoute(async (req, res) => {
  const f = req.body || {};
  await db.prepare(`
    INSERT INTO tblDailyPlantLabour ("Date","Recorded By","Pipeline Section","Crew",
      "Type","Description","Number","Hours","Standby Hours","Notes")
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(f.Date, by(req), f['Pipeline Section'] || null, f.Crew || null,
    f.Type, f.Description, f.Number, f.Hours, f['Standby Hours'] || 0, f.Notes || '');
  res.json({ ok: true });
}));
router.delete('/plant-labour/:id', ...editor, asyncRoute(async (req, res) => {
  await db.prepare(`DELETE FROM tblDailyPlantLabour WHERE _id=?`).run(req.params.id);
  res.json({ ok: true });
}));

router.post('/plant-labour/carry-forward', ...editor, asyncRoute(async (req, res) => {
  const { date, section, crew } = req.body || {};
  if (!date || !section || !crew) return res.status(400).json({ error: 'date, section and crew are required' });
  const already = await db.prepare(`
    SELECT COUNT(*)::int AS n FROM tblDailyPlantLabour WHERE "Date"=? AND "Pipeline Section"=? AND "Crew"=?
  `).get(date, section, crew);
  if (Number(already.n) > 0) return res.status(400).json({ error: 'This crew already has plant and labour entries today.' });

  const prevRow = await db.prepare(`
    SELECT MAX("Date") AS d FROM tblDailyPlantLabour WHERE "Date"<? AND "Pipeline Section"=? AND "Crew"=?
  `).get(date, section, crew);
  const prev = prevRow && prevRow.d;
  let count = 0;
  await db.transaction(async () => {
    let rows;
    if (prev) {
      rows = await db.prepare(`
        SELECT * FROM tblDailyPlantLabour WHERE "Date"=? AND "Pipeline Section"=? AND "Crew"=? ORDER BY _id
      `).all(prev, section, crew);
    } else {
      rows = await db.prepare(`SELECT * FROM tblStandingResource ORDER BY _id`).all();
    }
    const ins = db.prepare(`
      INSERT INTO tblDailyPlantLabour ("Date","Recorded By","Pipeline Section","Crew",
        "Type","Description","Number","Hours","Standby Hours","Notes")
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    for (const r of rows) {
      await ins.run(date, by(req), section, crew, r.Type, r.Description, r.Number,
        prev ? r.Hours : (r['Default Hours'] || 0), 0, prev ? (r.Notes || '') : '');
      count++;
    }
  });
  res.json({ ok: true, from: prev || 'standing resources', count });
}));

router.get('/hold-points', asyncRoute(async (req, res) => {
  const sql = req.query.open === 'true'
    ? `SELECT _id, * FROM tblDailyHoldPoint WHERE "Status"<>'Released' ORDER BY "Date", _id`
    : `SELECT _id, * FROM tblDailyHoldPoint ORDER BY "Date" DESC, _id DESC LIMIT 200`;
  res.json(await db.prepare(sql).all());
}));
router.post('/hold-points', ...editor, asyncRoute(async (req, res) => {
  const f = req.body || {};
  await db.prepare(`
    INSERT INTO tblDailyHoldPoint ("Date","Recorded By","Reference","Description","Status","Record Key","Notes")
    VALUES (?,?,?,?,?,?,?)
  `).run(f.Date, by(req), f.Reference, f.Description, f.Status || 'Open', f['Record Key'] || null, f.Notes || '');
  res.json({ ok: true });
}));
router.put('/hold-points/:id', ...editor, asyncRoute(async (req, res) => {
  const entries = Object.entries(req.body || {}).filter(([k]) => k !== '_id');
  if (entries.length) {
    const sets = entries.map(([k]) => `"${k.replace(/"/g, '""')}"=?`);
    await db.prepare(`UPDATE tblDailyHoldPoint SET ${sets.join(', ')} WHERE _id=?`)
      .run(...entries.map(([, v]) => v), req.params.id);
  }
  res.json({ ok: true });
}));
router.delete('/hold-points/:id', ...editor, asyncRoute(async (req, res) => {
  await db.prepare(`DELETE FROM tblDailyHoldPoint WHERE _id=?`).run(req.params.id);
  res.json({ ok: true });
}));

router.get('/daily-safety', asyncRoute(async (req, res) => {
  if (req.query.date) {
    res.json((await db.prepare(`SELECT _id, * FROM tblDailySafety WHERE "Date"=?`).get(req.query.date)) || null);
  } else {
    res.json(await db.prepare(`SELECT _id, * FROM tblDailySafety ORDER BY "Date" DESC, _id DESC LIMIT 200`).all());
  }
}));
router.post('/daily-safety', ...editor, asyncRoute(async (req, res) => {
  const f = req.body || {};
  const existing = await db.prepare(`SELECT _id FROM tblDailySafety WHERE "Date"=? ORDER BY _id LIMIT 1`).get(f.Date);
  if (existing) {
    await db.prepare(`
      UPDATE tblDailySafety SET "Toolbox Held"=?, "Toolbox Topic"=?, "Personnel On Site"=?,
        "Incident Class"=?, "Incident Detail"=?, "Lost Time (hrs)"=?, "Recorded By"=? WHERE _id=?
    `).run(f['Toolbox Held'] || 'No', f['Toolbox Topic'] || '', f['Personnel On Site'] || null,
      f['Incident Class'] || 'None', f['Incident Detail'] || '', f['Lost Time (hrs)'] || 0, by(req), existing._id);
  } else {
    await db.prepare(`
      INSERT INTO tblDailySafety ("Date","Recorded By","Toolbox Held","Toolbox Topic",
        "Personnel On Site","Incident Class","Incident Detail","Lost Time (hrs)") VALUES (?,?,?,?,?,?,?,?)
    `).run(f.Date, by(req), f['Toolbox Held'] || 'No', f['Toolbox Topic'] || '',
      f['Personnel On Site'] || null, f['Incident Class'] || 'None', f['Incident Detail'] || '', f['Lost Time (hrs)'] || 0);
  }
  res.json({ ok: true });
}));

router.get('/edit-log', asyncRoute(async (_req, res) => {
  res.json(await db.prepare(`SELECT * FROM tblEditLog ORDER BY "Timestamp" DESC, _id DESC LIMIT 500`).all());
}));
router.get('/settings', asyncRoute(async (_req, res) => res.json(await db.prepare(`SELECT * FROM tblSetting`).all())));

router.get('/strip', asyncRoute(async (req, res) => res.json(await analysis.chainageStrip(req.query.section))));
router.get('/reports/day', asyncRoute(async (req, res) => res.json(await analysis.dayReport(req.query.date))));
router.get('/reports/production', asyncRoute(async (req, res) => res.json(await analysis.production(req.query.from, req.query.to))));
router.get('/reports/look-ahead', asyncRoute(async (req, res) => res.json(await analysis.lookAhead(Number(req.query.metres) || 500))));
router.get('/reports/quantities', asyncRoute(async (_req, res) => res.json(await analysis.quantities())));
router.get('/reports/outstanding', asyncRoute(async (_req, res) => res.json(await analysis.outstanding())));
router.get('/reports/completed', asyncRoute(async (req, res) => res.json(await analysis.completed(req.query.from, req.query.to))));
router.get('/reports/safety-plant', asyncRoute(async (req, res) => res.json(await analysis.safetyAndPlant(req.query.from, req.query.to))));
router.get('/drawings', asyncRoute(async (_req, res) => res.json(await analysis.drawings())));
router.get('/data-quality', asyncRoute(async (_req, res) => res.json(await analysis.dataQuality())));

router.post('/assets/bulk', ...editor, asyncRoute(async (req, res) => {
  const { keys, field, value } = req.body || {};
  if (!Array.isArray(keys) || !keys.length || !field) return res.status(400).json({ error: 'keys and field are required' });
  let updated = 0;
  await db.transaction(async () => {
    for (const k of keys) {
      try { await engine.updateAsset(k, { [field]: value }, by(req)); updated++; } catch (_) {}
    }
  });
  res.json({ ok: true, updated });
}));

router.get('/crews', asyncRoute(async (_req, res) => res.json(await crews.crewState())));
router.get('/crews/new-ground', asyncRoute(async (req, res) => {
  const { section, track, from, to } = req.query;
  res.json(await crews.assetsInRange(section, track, Number(from), Number(to)));
}));
router.get('/crews/catching-up', asyncRoute(async (req, res) => res.json(await crews.catchingUp(req.query.section))));
router.post('/crews/set-opening', ...editor, asyncRoute(async (req, res) => {
  const { section, crew, track, chainage, date } = req.body || {};
  if (!section || !crew || !track || chainage == null) return res.status(400).json({ error: 'section, crew, track and chainage are required' });
  await db.transaction(async () => {
    await crews.setOpening(section, crew, track, Number(chainage), date || null);
    await crews.syncProgress();
  });
  res.json({ ok: true });
}));
router.post('/crews/save-day', ...editor, asyncRoute(async (req, res) => {
  res.json(await crews.saveCrewDay({ ...req.body, by: by(req) }));
}));

module.exports = router;
