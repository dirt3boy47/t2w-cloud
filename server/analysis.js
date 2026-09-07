/** Reporting and data quality derived from the live register. */
const db = require('./db');
const engine = require('./engine');

async function chainageStrip(section) {
  const pc = await db.prepare(
    `SELECT "Pipeline Section" AS section, "Section extent (m)" AS extent,
            "PIPE" AS "pipeFront", "TRENCH" AS "trenchFront"
     FROM tblProgressControl ${section ? 'WHERE "Pipeline Section" = ?' : ''}`
  ).all(...(section ? [section] : []));
  const out = [];
  for (const s of pc) {
    const [trenchRows, pipeRows, assetRows] = await Promise.all([
      engine.trenchSections(s.section), engine.pipeSegments(s.section), engine.pointAssets(s.section),
    ]);
    out.push({
      ...s,
      trench: trenchRows.map((t) => ({
        recordKey: t.recordKey, start: t.chStart, end: t.chEnd, length: t.length,
        trenchType: t.trenchType, complete: t.complete, pct: t.pct,
      })),
      pipe: pipeRows.map((p) => ({
        recordKey: p.recordKey, start: p.chStart, end: p.chEnd, length: p.length,
        pipeType: p.pipeType, laid: p.laid, pct: p.pct,
      })),
      assets: assetRows.filter((a) => a.chainage != null).map((a) => ({
        recordKey: a.recordKey, chainage: a.chainage, register: a.register,
        assetType: a.assetType, driver: a.driver, complete: a.complete, autoComplete: a.autoComplete,
      })),
    });
  }
  return out;
}

async function dayReport(date) {
  const [progress, plant, safety, holdPoints, profit, completed] = await Promise.all([
    db.prepare(`SELECT * FROM tblDailyProgress WHERE "Date"=? ORDER BY "Pipeline Section"`).all(date),
    db.prepare(`
      SELECT d.*, r."Cost Rate ($/h)" AS "costRate",
        COALESCE(d."Number",1) * COALESCE(d."Hours",0) * COALESCE(r."Cost Rate ($/h)",0) AS cost
      FROM tblDailyPlantLabour d LEFT JOIN tblRatePlantLabour r ON d."Description"=r."Description"
      WHERE d."Date"=? ORDER BY d."Pipeline Section", d."Crew", d._id
    `).all(date),
    db.prepare(`SELECT * FROM tblDailySafety WHERE "Date"=?`).get(date),
    db.prepare(`SELECT _id, * FROM tblDailyHoldPoint WHERE "Date"=? ORDER BY _id`).all(date),
    db.prepare(`SELECT * FROM tblDailyProfit WHERE "Date"=?`).get(date),
    db.prepare(`
      SELECT "Record Key" AS "recordKey", "Pipeline Section" AS section, "Register" AS register,
             "Asset Type" AS "assetType", "Chainage Start (m)" AS chainage
      FROM tblAsset WHERE "Completion Date"=? ORDER BY "Pipeline Section", "Chainage Start (m)"
    `).all(date),
  ]);
  return { date, progress, plant, safety: safety || null, holdPoints, profit: profit || null, completed };
}

async function production(from, to) {
  const rows = await db.prepare(`
    SELECT "Date" AS date, "Pipeline Section" AS section,
      SUM(COALESCE("Trench m Today",0)) AS "trenchM",
      SUM(COALESCE("Pipe m Today",0)) AS "pipeM",
      SUM(COALESCE("Earned Today ($)",0)) AS earned,
      SUM(COALESCE("Our Cost Today ($)",0)) AS cost,
      SUM(COALESCE("Downtime (hrs)",0)) AS downtime
    FROM tblDailyProgress WHERE "Date">=? AND "Date"<=?
    GROUP BY "Date", "Pipeline Section" ORDER BY "Date", "Pipeline Section"
  `).all(from, to);
  const byDate = {};
  for (const r of rows) {
    if (!byDate[r.date]) byDate[r.date] = { date: r.date, trenchM: 0, pipeM: 0, earned: 0, cost: 0, downtime: 0 };
    const d = byDate[r.date];
    d.trenchM += Number(r.trenchM || 0); d.pipeM += Number(r.pipeM || 0);
    d.earned += Number(r.earned || 0); d.cost += Number(r.cost || 0); d.downtime += Number(r.downtime || 0);
  }
  const days = Object.values(byDate), denom = days.length || 1;
  const sum = (k) => days.reduce((s, d) => s + Number(d[k] || 0), 0);
  return { rows, days, totals: {
    days: days.length, trenchM: sum('trenchM'), pipeM: sum('pipeM'), earned: sum('earned'),
    cost: sum('cost'), downtime: sum('downtime'), avgTrenchM: sum('trenchM') / denom, avgPipeM: sum('pipeM') / denom,
  } };
}

async function lookAhead(metres) {
  const fronts = await db.prepare(`
    SELECT "Pipeline Section" AS section, "PIPE" AS pipe, "TRENCH" AS trench FROM tblProgressControl
  `).all();
  const out = [];
  for (const f of fronts) {
    const assets = await engine.pointAssets(f.section);
    for (const a of assets) {
      if (a.chainage == null || !a.driver || a.complete === 'Yes') continue;
      const front = a.driver === 'PIPE' ? Number(f.pipe || 0) : Number(f.trench || 0);
      const ahead = a.chainage - front;
      if (ahead >= 0 && ahead <= metres) out.push({
        recordKey: a.recordKey, section: f.section, register: a.register, assetType: a.assetType,
        chainage: a.chainage, driver: a.driver, front, ahead, feature: a.feature, budget: a.budget,
      });
    }
  }
  return out.sort((a, b) => a.ahead - b.ahead);
}

async function quantities() {
  return db.prepare(`
    SELECT "Pipeline Section" AS section, "Register" AS register, "Asset Type" AS "assetType",
      COUNT(*)::int AS records, SUM(CASE WHEN "Complete"='Yes' THEN 1 ELSE 0 END)::int AS complete,
      SUM(COALESCE("Quantity",0)) AS quantity, MAX("Unit") AS unit,
      SUM(COALESCE("Total Cost ($)",0)) AS budget,
      SUM(CASE WHEN "Complete"='Yes' THEN COALESCE("Total Cost ($)",0) ELSE 0 END) AS earned
    FROM tblAsset GROUP BY "Pipeline Section", "Register", "Asset Type"
    ORDER BY "Pipeline Section", "Register", "Asset Type"
  `).all();
}

async function outstanding() {
  const rows = await engine.pointAssets();
  return rows.filter((a) => a.autoComplete === 'YES' && a.complete !== 'Yes').map((a) => ({
    recordKey: a.recordKey, section: a.section, register: a.register, assetType: a.assetType,
    chainage: a.chainage, driver: a.driver, feature: a.feature, budget: a.budget,
  })).sort((a, b) => (a.section || '').localeCompare(b.section || '') || a.chainage - b.chainage);
}

async function completed(from, to) {
  return db.prepare(`
    SELECT "Record Key" AS "recordKey", "Pipeline Section" AS section, "Register" AS register,
      "Asset Type" AS "assetType", "Chainage Start (m)" AS chainage,
      "Completion Date" AS "completionDate", "Total Cost ($)" AS budget
    FROM tblAsset WHERE "Complete"='Yes' AND "Completion Date">=? AND "Completion Date"<=?
    ORDER BY "Completion Date" DESC, "Pipeline Section", "Chainage Start (m)"
  `).all(from, to);
}

async function safetyAndPlant(from, to) {
  const [safety, plant, holdPoints] = await Promise.all([
    db.prepare(`SELECT * FROM tblDailySafety WHERE "Date">=? AND "Date"<=? ORDER BY "Date" DESC`).all(from, to),
    db.prepare(`
      SELECT d."Date" AS date, d."Pipeline Section" AS section, d."Crew" AS crew,
        d."Type" AS type, d."Description" AS description,
        SUM(COALESCE(d."Number",1)*COALESCE(d."Hours",0)) AS hours,
        SUM(COALESCE(d."Number",1)*COALESCE(d."Hours",0)*COALESCE(r."Cost Rate ($/h)",0)) AS cost
      FROM tblDailyPlantLabour d LEFT JOIN tblRatePlantLabour r ON d."Description"=r."Description"
      WHERE d."Date">=? AND d."Date"<=?
      GROUP BY d."Date", d."Pipeline Section", d."Crew", d."Type", d."Description"
      ORDER BY d."Date" DESC, d."Pipeline Section", d."Crew"
    `).all(from, to),
    db.prepare(`SELECT _id, * FROM tblDailyHoldPoint WHERE "Date">=? AND "Date"<=? ORDER BY "Date" DESC`).all(from, to),
  ]);
  return { safety, plant, holdPoints };
}

async function drawings() {
  return db.prepare(`
    SELECT "Drawing (Start)" AS drawing, "Pipeline Section" AS section,
      COUNT(*)::int AS records, MIN("Chainage Start (m)") AS "fromCh",
      MAX(COALESCE("Chainage End (m)","Chainage Start (m)")) AS "toCh",
      SUM(CASE WHEN "Complete"='Yes' THEN 1 ELSE 0 END)::int AS complete
    FROM tblAsset WHERE "Drawing (Start)" IS NOT NULL AND "Drawing (Start)"<>''
    GROUP BY "Drawing (Start)", "Pipeline Section" ORDER BY "Pipeline Section", "Drawing (Start)"
  `).all();
}

async function dataQuality() {
  const checks = [];
  const add = (id, label, why, rows) => checks.push({ id, label, why, count: rows.length, rows });

  const [backwards, nochainage, nodriver, unpriced, nodate, notested, noowner, trenchRows] = await Promise.all([
    db.prepare(`SELECT "Record Key" AS "recordKey", "Pipeline Section" AS section, "Register" AS register,
      "Chainage Start (m)" AS start, "Chainage End (m)" AS end FROM tblAsset
      WHERE "Chainage End (m)" IS NOT NULL AND "Chainage Start (m)" IS NOT NULL
      AND "Chainage End (m)" < "Chainage Start (m)"`).all(),
    db.prepare(`SELECT "Record Key" AS "recordKey", "Pipeline Section" AS section, "Register" AS register,
      "Asset Type" AS "assetType" FROM tblAsset WHERE "Chainage Start (m)" IS NULL`).all(),
    db.prepare(`SELECT "Record Key" AS "recordKey", "Pipeline Section" AS section, "Register" AS register,
      "Asset Type" AS "assetType", "Chainage Start (m)" AS chainage FROM tblAsset
      WHERE ("Completion Driver" IS NULL OR "Completion Driver"='')
      AND "Register" NOT IN ('Foreign Service','Trench Type','Pipe')`).all(),
    db.prepare(`SELECT "Record Key" AS "recordKey", "Pipeline Section" AS section, "Register" AS register,
      "Asset Type" AS "assetType", "Chainage Start (m)" AS chainage FROM tblAsset
      WHERE "Total Cost ($)" IS NULL AND "Register" NOT IN ('Trench Type','Pipe')`).all(),
    db.prepare(`SELECT "Record Key" AS "recordKey", "Pipeline Section" AS section, "Register" AS register,
      "Asset Type" AS "assetType" FROM tblAsset
      WHERE "Complete"='Yes' AND ("Completion Date" IS NULL OR "Completion Date"='')`).all(),
    db.prepare(`SELECT "Record Key" AS "recordKey", "Pipeline Section" AS section, "Register" AS register,
      "Asset Type" AS "assetType" FROM tblAsset
      WHERE "Installed"='Yes' AND ("Test Document No" IS NULL OR "Test Document No"='')`).all(),
    db.prepare(`SELECT "Record Key" AS "recordKey", "Pipeline Section" AS section,
      "Chainage Start (m)" AS chainage, "Utility Description" AS description FROM tblAsset
      WHERE "Register"='Foreign Service' AND ("Operator" IS NULL OR "Operator"='')`).all(),
    engine.trenchSections(),
  ]);

  add('backwards', 'Chainage runs backwards', 'End chainage is before start chainage, so the length is negative or nonsense.', backwards);
  add('nochainage', 'No chainage', 'Without a chainage the asset can never be picked up by a front, so it will never auto complete.', nochainage);
  add('nodriver', 'No completion driver', 'Nothing says whether the pipe or trench front governs this asset. Foreign services are excluded because they intentionally have no driver.', nodriver);
  add('unpriced', 'Not priced', 'No total cost is recorded, so the asset contributes nothing to budget until a rate is entered.', unpriced);
  add('nodate', 'Complete without a date', 'Marked complete but no completion date is available for day reporting.', nodate);
  add('notested', 'Installed, no test document', 'Recorded as installed but no test document number is recorded.', notested);
  add('noowner', 'Foreign service with no owner', 'A foreign service has no operator recorded for notification and planning.', noowner);
  add('unrated', 'Trench section with no rate', 'No rate exists for this section and trench type combination.',
    trenchRows.filter((t) => t.rate == null).map((t) => ({ recordKey: t.recordKey, section: t.section,
      trenchType: t.trenchType, start: t.chStart, end: t.chEnd, length: t.length })));

  const overlaps = [], gaps = [], bySection = {};
  for (const t of trenchRows) {
    if (t.chStart == null || t.chEnd == null) continue;
    (bySection[t.section] = bySection[t.section] || []).push(t);
  }
  for (const [sec, list] of Object.entries(bySection)) {
    list.sort((a, b) => a.chStart - b.chStart);
    for (let i = 1; i < list.length; i++) {
      if (list[i].chStart < list[i - 1].chEnd - 0.0005) overlaps.push({
        section: sec, a: list[i - 1].recordKey, b: list[i].recordKey,
        aRange: `${list[i - 1].chStart}–${list[i - 1].chEnd}`,
        bRange: `${list[i].chStart}–${list[i].chEnd}`,
        overlap: +(list[i - 1].chEnd - list[i].chStart).toFixed(3),
      });
      const gap = list[i].chStart - list[i - 1].chEnd;
      if (gap > 0.0005) gaps.push({ section: sec, after: list[i - 1].recordKey,
        before: list[i].recordKey, from: list[i - 1].chEnd, to: list[i].chStart, gap: +gap.toFixed(3) });
    }
  }
  add('overlap', 'Overlapping trench sections', 'Two trench sections cover the same chainage, so those metres may be counted twice.', overlaps);
  add('gap', 'Gaps between trench sections', 'The trench front stops at a gap because continuous progress from zero is broken.', gaps);
  return checks;
}

module.exports = { chainageStrip, dayReport, production, lookAhead, quantities,
  outstanding, completed, safetyAndPlant, drawings, dataQuality };
