/**
 * T2W costing and progress engine.
 *
 * The cloud edition keeps the original calculation rules but uses the
 * Supabase Postgres database through the asynchronous db adapter.
 */
const db = require('./db');

function n(v) {
  if (v === null || v === undefined || v === '') return 0;
  const x = Number(v);
  return Number.isNaN(x) ? 0 : x;
}

function pipeTypeOf(descr) {
  if (!descr) return null;
  const s = String(descr).toUpperCase();
  if (s.includes('MSCL')) return 'MSCL';
  if (s.includes('DICL')) return 'DICL';
  return null;
}

async function trenchSections(section) {
  let sql = `
    SELECT a."Record Key" AS "recordKey", a."Pipeline Section" AS section,
           a."Chainage Start (m)" AS "chStart", a."Chainage End (m)" AS "chEnd",
           a."Length (m)" AS length, a."Trench Type" AS "trenchType",
           a."Drawing (Start)" AS drawing,
           rt."Rate" AS rate, rt."Cost Rate" AS "costRate",
           p."Trench Complete (m)" AS complete, p."As At Date" AS "asAt",
           p."Updated By" AS "updatedBy", p."Notes" AS notes
    FROM tblAsset a
    LEFT JOIN tblTrenchProgress p ON a."Record Key" = p."Record Key"
    LEFT JOIN tblRateTrench rt
      ON a."Pipeline Section" = rt."Pipeline Section" AND a."Trench Type" = rt."Trench Type"
    WHERE a."Register" = 'Trench Type'`;
  const params = [];
  if (section) { sql += ` AND a."Pipeline Section" = ?`; params.push(section); }
  sql += ` ORDER BY a."Pipeline Section", a."Chainage Start (m)"`;
  const rows = await db.prepare(sql).all(...params);
  return rows.map((r) => {
    const complete = n(r.complete);
    const length = n(r.length);
    const budget = r.length != null && r.rate != null ? length * n(r.rate) : null;
    const earned = r.rate != null ? complete * n(r.rate) : null;
    const cost = r.costRate != null ? complete * n(r.costRate) : null;
    const remaining = r.length != null && r.rate != null ? (length - complete) * n(r.rate) : null;
    return {
      ...r,
      chStart: r.chStart == null ? null : n(r.chStart),
      chEnd: r.chEnd == null ? null : n(r.chEnd),
      length: r.length == null ? null : length,
      complete,
      pct: length ? complete / length : 0,
      budget,
      earned,
      cost,
      remaining,
    };
  });
}

async function trenchFrontOf(section) {
  const rows = await trenchSections(section);
  let front = 0;
  for (const s of rows) {
    const len = n(s.length);
    const done = n(s.complete);
    if (len > 0 && done >= len - 0.0005) front = s.chEnd != null ? n(s.chEnd) : front;
    else { front = n(s.chStart) + done; break; }
  }
  return front;
}

async function pipeSegments(section) {
  let sql = `
    SELECT a."Record Key" AS "recordKey", a."Pipeline Section" AS section,
           a."Chainage Start (m)" AS "chStart", a."Chainage End (m)" AS "chEnd",
           a."Length (m)" AS length, a."Pipe Description" AS description,
           a."Drawing (Start)" AS drawing
    FROM tblAsset a WHERE a."Register" = 'Pipe'`;
  const params = [];
  if (section) { sql += ` AND a."Pipeline Section" = ?`; params.push(section); }
  const rows = await db.prepare(sql).all(...params);
  const crews = require('./crews');
  const covBySection = {};
  const sectionsSeen = [...new Set(rows.map((r) => r.section))];
  for (const sec of sectionsSeen) covBySection[sec] = await crews.coverage(sec, 'pipe');

  const rateStmt = db.prepare(
    `SELECT "Rate" AS rate, "Cost Rate" AS "costRate" FROM tblRatePipe
     WHERE "Pipeline Section" = ? AND "Pipe Type" = ?`
  );
  const out = [];
  for (const r of rows) {
    const pipeType = pipeTypeOf(r.description);
    const len = n(r.length);
    const cov = covBySection[r.section] || [];
    let laid = crews.overlapLen(cov, n(r.chStart), n(r.chEnd));
    if (laid < 0) laid = 0;
    if (r.length != null && laid > len) laid = len;
    const front = crews.continuousFront(cov);
    const rr = pipeType ? await rateStmt.get(r.section, pipeType) : null;
    const rate = rr ? rr.rate : null;
    const costRate = rr ? rr.costRate : null;
    const budget = r.length != null && rate != null ? len * n(rate) : null;
    const earned = rate != null ? laid * n(rate) : null;
    const cost = costRate != null ? laid * n(costRate) : null;
    const remaining = r.length != null && rate != null ? (len - laid) * n(rate) : null;
    out.push({
      ...r,
      chStart: r.chStart == null ? null : n(r.chStart),
      chEnd: r.chEnd == null ? null : n(r.chEnd),
      length: r.length == null ? null : len,
      pipeType,
      laid,
      pct: len ? laid / len : 0,
      rate,
      budget,
      earned,
      cost,
      remaining,
      front,
      complete: r.length != null && laid >= len,
    });
  }
  return out;
}

async function pointAssets(section) {
  const frontRows = await db.prepare(
    `SELECT "Pipeline Section" AS section, "PIPE" AS pipe, "TRENCH" AS trench FROM tblProgressControl`
  ).all();
  const fronts = Object.fromEntries(frontRows.map((r) => [r.section, r]));
  let sql = `SELECT * FROM tblAsset WHERE "Register" NOT IN ('Trench Type', 'Pipe')`;
  const params = [];
  if (section) { sql += ` AND "Pipeline Section" = ?`; params.push(section); }
  const rows = await db.prepare(sql).all(...params);
  return rows.map((r) => {
    const f = fronts[r['Pipeline Section']] || {};
    const driver = r['Completion Driver'] || null;
    const front = driver === 'PIPE' ? f.pipe : driver === 'TRENCH' ? f.trench : null;
    const chStart = r['Chainage Start (m)'] == null ? null : n(r['Chainage Start (m)']);
    const autoComplete = driver && chStart != null && front != null ? chStart <= n(front) : null;
    return {
      recordKey: r['Record Key'],
      assetId: r['Asset ID'],
      section: r['Pipeline Section'],
      register: r['Register'],
      assetType: r['Asset Type'],
      chainage: chStart,
      driver,
      feature: r['Feature Name'] || r['Utility Description'] || '',
      quantity: r['Quantity'],
      unit: r['Unit'],
      unitRate: r['Unit Rate ($)'],
      budget: r['Total Cost ($)'],
      complete: r['Complete'],
      autoComplete: autoComplete === null ? null : autoComplete ? 'YES' : 'NO',
      earnedTicked: r['Complete'] === 'Yes' ? r['Total Cost ($)'] : null,
      raw: r,
    };
  });
}

async function sectionEarned(section) {
  const [ts, ps, as] = await Promise.all([trenchSections(section), pipeSegments(section), pointAssets(section)]);
  return ts.reduce((s, r) => s + (r.earned || 0), 0)
    + ps.reduce((s, r) => s + (r.earned || 0), 0)
    + as.reduce((s, r) => s + (r.earnedTicked || 0), 0);
}

async function sectionCost(section) {
  const [ts, ps] = await Promise.all([trenchSections(section), pipeSegments(section)]);
  return ts.reduce((s, r) => s + (r.cost || 0), 0)
    + ps.reduce((s, r) => s + (r.cost || 0), 0);
}

async function projectTotals() {
  const sectionRows = await db.prepare(`
    SELECT DISTINCT "Pipeline Section" AS s FROM tblAsset WHERE "Pipeline Section" IS NOT NULL
  `).all();
  let trenchBudget = 0, trenchEarned = 0, trenchRemaining = 0;
  let pipeBudget = 0, pipeEarned = 0, pipeRemaining = 0;
  let pointBudget = 0, pointEarned = 0;
  for (const { s } of sectionRows) {
    const [ts, ps, as] = await Promise.all([trenchSections(s), pipeSegments(s), pointAssets(s)]);
    for (const r of ts) {
      trenchBudget += r.budget || 0; trenchEarned += r.earned || 0; trenchRemaining += r.remaining || 0;
    }
    for (const r of ps) {
      pipeBudget += r.budget || 0; pipeEarned += r.earned || 0; pipeRemaining += r.remaining || 0;
    }
    for (const r of as) { pointBudget += r.budget || 0; pointEarned += r.earnedTicked || 0; }
  }
  return {
    trench: { budget: trenchBudget, earned: trenchEarned, remaining: trenchRemaining },
    pipe: { budget: pipeBudget, earned: pipeEarned, remaining: pipeRemaining },
    point: { budget: pointBudget, earned: pointEarned, remaining: pointBudget - pointEarned },
    total: {
      budget: trenchBudget + pipeBudget + pointBudget,
      earned: trenchEarned + pipeEarned + pointEarned,
      remaining: trenchRemaining + pipeRemaining + (pointBudget - pointEarned),
    },
  };
}

async function costByTrenchType() {
  const rows = await trenchSections();
  const by = {};
  for (const r of rows) {
    const k = `${r.section}|${r.trenchType}`;
    if (!by[k]) by[k] = { section: r.section, trenchType: r.trenchType, sections: 0, length: 0,
      rate: r.rate, budget: 0, complete: 0, earned: 0, remaining: 0 };
    const b = by[k];
    b.sections++; b.length += r.length || 0; b.complete += r.complete || 0;
    b.budget += r.budget || 0; b.earned += r.earned || 0; b.remaining += r.remaining || 0;
  }
  return Object.values(by);
}

async function costByPipeType() {
  const rows = await pipeSegments();
  const by = {};
  for (const r of rows) {
    const k = `${r.section}|${r.pipeType}`;
    if (!by[k]) by[k] = { section: r.section, pipeType: r.pipeType, segments: 0, length: 0,
      rate: r.rate, budget: 0, laid: 0, earned: 0, remaining: 0 };
    const b = by[k];
    b.segments++; b.length += r.length || 0; b.laid += r.laid || 0;
    b.budget += r.budget || 0; b.earned += r.earned || 0; b.remaining += r.remaining || 0;
  }
  return Object.values(by);
}

async function costByPointAsset() {
  const rows = await pointAssets();
  const by = {};
  for (const r of rows) {
    const k = `${r.section}|${r.register}|${r.assetType}`;
    if (!by[k]) by[k] = { section: r.section, register: r.register, assetType: r.assetType,
      records: 0, budget: 0, earned: 0 };
    const b = by[k];
    b.records++; b.budget += r.budget || 0; b.earned += r.earnedTicked || 0;
  }
  return Object.values(by).map((b) => ({ ...b, remaining: b.budget - b.earned }));
}

async function assetsPassed(section, fromCh, toCh) {
  if (toCh <= fromCh) return 0;
  const rows = await pointAssets(section);
  return rows.filter((a) => a.chainage != null && a.chainage > fromCh && a.chainage <= toCh).length;
}

async function allocateTrenchTo(section, chainage, asAt, by) {
  const sections = await trenchSections(section);
  const upsert = db.prepare(`
    INSERT INTO tblTrenchProgress ("Record Key", "Trench Complete (m)", "As At Date", "Updated By")
    VALUES (?, ?, ?, ?)
    ON CONFLICT("Record Key") DO UPDATE SET
      "Trench Complete (m)" = excluded."Trench Complete (m)",
      "As At Date" = excluded."As At Date", "Updated By" = excluded."Updated By"
  `);
  for (const s of sections) {
    let done = n(chainage) - n(s.chStart);
    if (done < 0) done = 0;
    if (s.length != null && done > n(s.length)) done = n(s.length);
    if (done > 0) await upsert.run(s.recordKey, done, asAt, by);
  }
}

async function setPipeFront(section, chainage, asAt, by) {
  await db.prepare(`
    UPDATE tblProgressControl SET "PIPE" = ?, "As At Date" = ?, "Updated By" = ?
    WHERE "Pipeline Section" = ?
  `).run(chainage, asAt, by, section);
}

async function recalcTrenchFront(section) {
  const front = await trenchFrontOf(section);
  await db.prepare(`UPDATE tblProgressControl SET "TRENCH" = ? WHERE "Pipeline Section" = ?`).run(front, section);
  return front;
}

async function recalcAllTrenchFronts() {
  const sections = await db.prepare(`SELECT "Pipeline Section" AS s FROM tblProgressControl`).all();
  for (const { s } of sections) await recalcTrenchFront(s);
}

async function logEdit(recordKey, field, oldV, newV, by) {
  await db.prepare(`
    INSERT INTO tblEditLog ("Timestamp", "Edited by", "Record Key", "Field",
      "Previous value", "New value", "Sheet cell")
    VALUES (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Melbourne','YYYY-MM-DD HH24:MI'), ?, ?, ?, ?, ?, 'web')
  `).run(by, recordKey, field, String(oldV ?? ''), String(newV ?? ''));
}

async function updateAsset(recordKey, changes, by) {
  return db.transaction(async () => {
    const current = await db.prepare(`SELECT * FROM tblAsset WHERE "Record Key" = ?`).get(recordKey);
    if (!current) throw new Error('Unknown asset: ' + recordKey);
    const sets = [];
    const params = [];
    for (const [field, newV] of Object.entries(changes)) {
      const oldV = current[field];
      if (String(oldV ?? '') !== String(newV ?? '')) {
        sets.push(`"${field.replace(/"/g, '""')}" = ?`);
        params.push(newV === '' ? null : newV);
        await logEdit(recordKey, field, oldV, newV, by);
      }
    }
    if (!sets.length) return 0;
    params.push(recordKey);
    const result = await db.prepare(`UPDATE tblAsset SET ${sets.join(', ')} WHERE "Record Key" = ?`).run(...params);
    return result.rowCount;
  });
}

async function tickPassedAssets(by) {
  const rows = (await pointAssets()).filter((a) => a.autoComplete === 'YES' && a.complete !== 'Yes');
  const today = new Date().toISOString().slice(0, 10);
  for (const r of rows) await updateAsset(r.recordKey, { Complete: 'Yes', 'Completion Date': today }, by);
  return rows.length;
}

async function endOfDay({ date, by, shift, weather, downtime, notes, fronts, completeKeys }) {
  return db.transaction(async () => {
    const sections = Object.keys(fronts || {});
    const before = {};
    const pipeFrontRows = await db.prepare(`SELECT "Pipeline Section" AS s, "PIPE" AS p FROM tblProgressControl`).all();
    const pipeFront = Object.fromEntries(pipeFrontRows.map((r) => [r.s, r.p]));

    for (const section of sections) {
      before[section] = {
        trench: n(await trenchFrontOf(section)),
        pipe: n(pipeFront[section]),
        earned: await sectionEarned(section),
        cost: await sectionCost(section),
      };
    }

    for (const section of sections) {
      const f = fronts[section] || {};
      const b = before[section];
      let tTo = f.trenchTo != null ? Number(f.trenchTo) : b.trench;
      let pTo = f.pipeTo != null ? Number(f.pipeTo) : b.pipe;
      if (tTo < b.trench) tTo = b.trench;
      if (pTo < b.pipe) pTo = b.pipe;
      if (tTo > b.trench) { await allocateTrenchTo(section, tTo, date, by); await recalcTrenchFront(section); }
      if (pTo !== b.pipe) await setPipeFront(section, pTo, date, by);
      b.trenchTo = tTo;
      b.pipeTo = pTo;
    }

    const tickedBySection = Object.fromEntries(sections.map((s) => [s, 0]));
    let ticked = 0;
    for (const key of completeKeys || []) {
      const row = await db.prepare(`SELECT "Complete" AS c, "Pipeline Section" AS section FROM tblAsset WHERE "Record Key"=?`).get(key);
      if (row && row.c !== 'Yes') {
        await updateAsset(key, { Complete: 'Yes', 'Completion Date': date }, by);
        ticked++;
        if (row.section in tickedBySection) tickedBySection[row.section]++;
      }
    }

    const insertDay = db.prepare(`
      INSERT INTO tblDailyProgress ("Date","Recorded By","Shift","Pipeline Section",
        "Trench From Ch (m)","Trench To Ch (m)","Trench m Today",
        "Pipe From Ch (m)","Pipe To Ch (m)","Pipe m Today",
        "Point Assets Complete","Earned Today ($)","Our Cost Today ($)",
        "Gross Margin Today ($)","Weather","Downtime (hrs)","Notes")
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    let totalEarn = 0, totalCost = 0;
    const clean = (v) => Math.abs(v) < 0.000001 ? 0 : v;
    for (const section of sections) {
      const b = before[section];
      const earnAfter = await sectionEarned(section);
      const costAfter = await sectionCost(section);
      const earnedToday = clean(earnAfter - b.earned);
      const costToday = clean(costAfter - b.cost);
      const trenchM = Math.max(0, b.trenchTo - b.trench);
      const pipeM = Math.max(0, b.pipeTo - b.pipe);
      if (trenchM || pipeM || tickedBySection[section] || notes) {
        await insertDay.run(date, by, shift, section,
          b.trench, b.trenchTo, trenchM, b.pipe, b.pipeTo, pipeM,
          tickedBySection[section] || 0, earnedToday, costToday, earnedToday - costToday,
          weather, downtime || 0, notes || '');
        totalEarn += earnedToday;
        totalCost += costToday;
      }
    }

    const pl = await db.prepare(`
      SELECT COALESCE(SUM(COALESCE(d."Number",1) * COALESCE(d."Hours",0)
        * COALESCE(r."Cost Rate ($/h)",0)),0) AS c,
        COALESCE(SUM(d."Hours"),0) AS h
      FROM tblDailyPlantLabour d
      LEFT JOIN tblRatePlantLabour r ON d."Description" = r."Description"
      WHERE d."Date" = ?
    `).get(date);
    const plCost = n(pl && pl.c);
    const crewHours = n(pl && pl.h);

    await db.prepare(`DELETE FROM tblDailyProfit WHERE "Date" = ?`).run(date);
    await db.prepare(`
      INSERT INTO tblDailyProfit ("Date","Recorded By","Shift","Earned ($)","Direct Cost ($)",
        "Plant and Labour ($)","Total Cost ($)","Profit ($)","Margin %","Crew Hours","Notes")
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(date, by, shift, totalEarn, totalCost, plCost, totalCost + plCost,
      totalEarn - totalCost - plCost,
      totalEarn ? (totalEarn - totalCost - plCost) / totalEarn : 0,
      crewHours, notes || '');

    return { earned: totalEarn, cost: totalCost, plantAndLabour: plCost,
      profit: totalEarn - totalCost - plCost, ticked };
  });
}

module.exports = {
  pipeTypeOf, trenchSections, trenchFrontOf, pipeSegments, pointAssets,
  sectionEarned, sectionCost, projectTotals, costByTrenchType, costByPipeType,
  costByPointAsset, assetsPassed, allocateTrenchTo, setPipeFront, logEdit,
  updateAsset, tickPassedAssets, endOfDay, recalcTrenchFront, recalcAllTrenchFronts,
};
