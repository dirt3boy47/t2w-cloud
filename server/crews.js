/**
 * Six crew progress model for the cloud edition.
 */
const db = require('./db');

const CREW_TYPES = ['special_crossing', 'trenchless', 'standard'];
const CREW_LABEL = {
  special_crossing: 'Special crossings',
  trenchless: 'Trenchless crossing',
  standard: 'Standard',
};
const TRACKS = ['trench', 'pipe'];

async function ensureTables() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tblCrewTrack (
      section TEXT NOT NULL, crew TEXT NOT NULL, track TEXT NOT NULL,
      active_from DOUBLE PRECISION, current_position DOUBLE PRECISION,
      PRIMARY KEY (section, crew, track)
    );
    CREATE TABLE IF NOT EXISTS tblCrewSegment (
      id BIGSERIAL PRIMARY KEY,
      section TEXT NOT NULL, crew TEXT NOT NULL, track TEXT NOT NULL,
      from_ch DOUBLE PRECISION NOT NULL, to_ch DOUBLE PRECISION NOT NULL, date_closed TEXT
    );
    CREATE TABLE IF NOT EXISTS tblCrewDay (
      id BIGSERIAL PRIMARY KEY,
      date TEXT NOT NULL, section TEXT NOT NULL, crew TEXT NOT NULL,
      track TEXT NOT NULL, from_ch DOUBLE PRECISION, to_ch DOUBLE PRECISION,
      metres DOUBLE PRECISION, kind TEXT, recorded_by TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_crewday_date ON tblCrewDay (date);
  `);
  const sections = await db.prepare(`SELECT "Pipeline Section" AS s FROM tblProgressControl`).all();
  const ins = db.prepare(`
    INSERT INTO tblCrewTrack (section, crew, track, active_from, current_position)
    VALUES (?,?,?,0,0) ON CONFLICT (section, crew, track) DO NOTHING
  `);
  for (const { s } of sections) {
    for (const c of CREW_TYPES) for (const t of TRACKS) await ins.run(s, c, t);
  }
}

function merge(list) {
  const ivs = list
    .filter((i) => i && Number(i[1]) > Number(i[0]) + 1e-9)
    .map((i) => [Math.min(Number(i[0]), Number(i[1])), Math.max(Number(i[0]), Number(i[1]))])
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of ivs) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], iv[1]);
    else out.push(iv);
  }
  return out;
}

function overlapLen(cov, from, to) {
  let total = 0;
  for (const [a, b] of cov) {
    const lo = Math.max(a, from), hi = Math.min(b, to);
    if (hi > lo) total += hi - lo;
  }
  return total;
}

function covers(cov, x) {
  return cov.some(([a, b]) => x >= a - 1e-9 && x <= b + 1e-9);
}

function continuousFront(cov) {
  let front = 0;
  for (const [a, b] of cov) {
    if (a <= front + 1e-9) front = Math.max(front, b);
    else break;
  }
  return front;
}

async function trackRow(section, crew, track) {
  return (await db.prepare(`SELECT * FROM tblCrewTrack WHERE section=? AND crew=? AND track=?`)
    .get(section, crew, track)) || { active_from: null, current_position: null };
}

async function segmentsOf(section, crew, track) {
  return db.prepare(`
    SELECT from_ch, to_ch, date_closed FROM tblCrewSegment
    WHERE section=? AND crew=? AND track=? ORDER BY id
  `).all(section, crew, track);
}

async function crewIntervals(section, crew, track) {
  const [t, segments, workedRows] = await Promise.all([
    trackRow(section, crew, track),
    segmentsOf(section, crew, track),
    db.prepare(`
      SELECT from_ch, to_ch FROM tblCrewDay
      WHERE section=? AND crew=? AND track=? AND kind='progress'
        AND from_ch IS NOT NULL AND to_ch IS NOT NULL
      ORDER BY id
    `).all(section, crew, track),
  ]);
  const closed = segments.map((s) => [s.from_ch, s.to_ch]);
  const worked = workedRows.map((r) => [r.from_ch, r.to_ch]);
  const cur = t.current_position != null && t.active_from != null
    && Math.abs(Number(t.current_position) - Number(t.active_from)) > 1e-9
    ? [[Number(t.active_from), Number(t.current_position)]] : [];
  return merge(closed.concat(worked, cur));
}

async function coverage(section, track) {
  await ensureTables();
  const all = [];
  const col = track === 'pipe' ? 'PIPE' : 'TRENCH';
  const row = await db.prepare(`SELECT "${col}" AS f FROM tblProgressControl WHERE "Pipeline Section"=?`).get(section);
  const f = row && row.f ? Number(row.f) : 0;
  if (f > 0) all.push([0, f]);
  for (const c of CREW_TYPES) all.push(...await crewIntervals(section, c, track));
  return merge(all);
}

async function crewState() {
  await ensureTables();
  const sections = await db.prepare(`
    SELECT "Pipeline Section" AS section, "Section extent (m)" AS extent FROM tblProgressControl
    ORDER BY "Pipeline Section"
  `).all();
  const output = [];
  for (const s of sections) {
    const crewRows = [];
    for (const c of CREW_TYPES) {
      const tracks = {};
      for (const t of TRACKS) {
        const [r, segs, ivs] = await Promise.all([
          trackRow(s.section, c, t), segmentsOf(s.section, c, t), crewIntervals(s.section, c, t),
        ]);
        tracks[t] = {
          activeFrom: r.active_from,
          position: r.current_position,
          segments: segs,
          intervals: ivs,
        };
      }
      crewRows.push({ crew: c, label: CREW_LABEL[c], tracks });
    }
    const [covT, covP] = await Promise.all([coverage(s.section, 'trench'), coverage(s.section, 'pipe')]);
    output.push({
      section: s.section,
      extent: s.extent,
      crews: crewRows,
      coverage: { trench: covT, pipe: covP },
      front: { trench: continuousFront(covT), pipe: continuousFront(covP) },
    });
  }
  return output;
}

async function setOpening(section, crew, track, chainage, dateISO) {
  await ensureTables();
  const t = await trackRow(section, crew, track);
  if (t.current_position != null && t.active_from != null
      && Math.abs(Number(t.current_position) - Number(t.active_from)) > 1e-9) {
    await db.prepare(`
      INSERT INTO tblCrewSegment (section, crew, track, from_ch, to_ch, date_closed)
      VALUES (?,?,?,?,?,?)
    `).run(section, crew, track, t.active_from, t.current_position, dateISO || null);
  }
  await db.prepare(`
    UPDATE tblCrewTrack SET active_from=?, current_position=? WHERE section=? AND crew=? AND track=?
  `).run(chainage, chainage, section, crew, track);
}

async function recordProgress(section, crew, track, chainage, dateISO, by) {
  await ensureTables();
  const t = await trackRow(section, crew, track);
  const from = t.current_position == null ? 0 : Number(t.current_position);
  await db.prepare(`
    UPDATE tblCrewTrack SET active_from=COALESCE(active_from,0), current_position=?
    WHERE section=? AND crew=? AND track=?
  `).run(chainage, section, crew, track);
  await db.prepare(`
    INSERT INTO tblCrewDay (date, section, crew, track, from_ch, to_ch, metres, kind, recorded_by)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(dateISO, section, crew, track, from, chainage, chainage - from, 'progress', by || 'web');
  return { from, to: chainage, metres: chainage - from, kind: 'progress' };
}

async function syncProgress() {
  await ensureTables();
  const sections = await db.prepare(`SELECT "Pipeline Section" AS s FROM tblProgressControl`).all();
  const upsert = db.prepare(`
    INSERT INTO tblTrenchProgress ("Record Key", "Trench Complete (m)", "As At Date", "Updated By")
    VALUES (?,?,?,?)
    ON CONFLICT("Record Key") DO UPDATE SET
      "Trench Complete (m)"=excluded."Trench Complete (m)",
      "As At Date"=excluded."As At Date", "Updated By"=excluded."Updated By"
  `);
  const today = new Date().toISOString().slice(0, 10);
  for (const { s } of sections) {
    const [covT, covP] = await Promise.all([coverage(s, 'trench'), coverage(s, 'pipe')]);
    const trench = await db.prepare(`
      SELECT "Record Key" AS k, "Chainage Start (m)" AS a, "Chainage End (m)" AS b
      FROM tblAsset WHERE "Register"='Trench Type' AND "Pipeline Section"=?
    `).all(s);
    for (const t of trench) {
      if (t.a == null || t.b == null) continue;
      await upsert.run(t.k, overlapLen(covT, Number(t.a), Number(t.b)), today, 'crew sync');
    }
    await db.prepare(`
      UPDATE tblProgressControl SET "TRENCH"=?, "PIPE"=? WHERE "Pipeline Section"=?
    `).run(continuousFront(covT), continuousFront(covP), s);
  }
}

const DRIVER_OF_TRACK = { trench: 'TRENCH', pipe: 'PIPE' };

async function assetsInRange(section, track, from, to) {
  const lo = Math.min(from, to), hi = Math.max(from, to);
  if (hi - lo < 1e-9) return [];
  return db.prepare(`
    SELECT "Record Key" AS "recordKey", "Chainage Start (m)" AS chainage,
      "Completion Driver" AS driver, "Register" AS register, "Asset Type" AS "assetType",
      "Feature Name" AS feature, "Utility Description" AS utility,
      "Thrust Block Item" AS "tbItem", "Type of Bend" AS "bendType", "Valve Type" AS "valveType",
      "Total Cost ($)" AS cost, "Complete" AS complete
    FROM tblAsset
    WHERE "Pipeline Section"=? AND "Completion Driver"=?
      AND "Chainage Start (m)" >= ? AND "Chainage Start (m)" <= ?
      AND COALESCE("Complete",'') <> 'Yes'
    ORDER BY "Chainage Start (m)"
  `).all(section, DRIVER_OF_TRACK[track], lo, hi);
}

async function catchingUp(section) {
  const [covT, covP, rows] = await Promise.all([
    coverage(section, 'trench'),
    coverage(section, 'pipe'),
    db.prepare(`
      SELECT "Record Key" AS "recordKey", "Chainage Start (m)" AS chainage,
        "Completion Driver" AS driver, "Register" AS register, "Asset Type" AS "assetType",
        "Feature Name" AS feature, "Utility Description" AS utility,
        "Thrust Block Item" AS "tbItem", "Type of Bend" AS "bendType", "Valve Type" AS "valveType",
        "Total Cost ($)" AS cost
      FROM tblAsset
      WHERE "Pipeline Section"=? AND COALESCE("Complete",'') <> 'Yes'
        AND "Chainage Start (m)" IS NOT NULL AND "Completion Driver" IS NOT NULL
      ORDER BY "Chainage Start (m)"
    `).all(section),
  ]);
  return rows.filter((r) => covers(r.driver === 'PIPE' ? covP : covT, Number(r.chainage)));
}

async function saveCrewDay({ date, by, shift, weather, downtime, notes, moves, completeKeys }) {
  const engine = require('./engine');
  return db.transaction(async () => {
    await ensureTables();
    const sectionRows = await db.prepare(`SELECT "Pipeline Section" AS s FROM tblProgressControl`).all();
    const sections = sectionRows.map((r) => r.s);

    const before = {};
    for (const s of sections) {
      const [covT, covP, earned, cost] = await Promise.all([
        coverage(s, 'trench'), coverage(s, 'pipe'), engine.sectionEarned(s), engine.sectionCost(s),
      ]);
      before[s] = {
        trench: continuousFront(covT), pipe: continuousFront(covP), earned, cost,
      };
    }

    const applied = [];
    for (const mv of moves || []) {
      if (mv.reachedCh == null || mv.reachedCh === '') continue;
      const movement = await recordProgress(mv.section, mv.crew, mv.track, Number(mv.reachedCh), date, by);
      applied.push({ ...mv, ...movement });
    }

    await syncProgress();

    let tickedCount = 0;
    const tickedBySection = Object.fromEntries(sections.map((s) => [s, 0]));
    for (const key of completeKeys || []) {
      const row = await db.prepare(`
        SELECT "Complete" AS c, "Pipeline Section" AS section FROM tblAsset WHERE "Record Key"=?
      `).get(key);
      if (row && row.c !== 'Yes') {
        await engine.updateAsset(key, { Complete: 'Yes', 'Completion Date': date }, by);
        tickedCount++;
        if (row.section in tickedBySection) tickedBySection[row.section]++;
      }
    }

    let totalEarn = 0, totalCost = 0;
    const insertDay = db.prepare(`
      INSERT INTO tblDailyProgress ("Date","Recorded By","Shift","Pipeline Section",
        "Trench From Ch (m)","Trench To Ch (m)","Trench m Today",
        "Pipe From Ch (m)","Pipe To Ch (m)","Pipe m Today",
        "Point Assets Complete","Earned Today ($)","Our Cost Today ($)",
        "Gross Margin Today ($)","Weather","Downtime (hrs)","Notes")
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const clean = (v) => Math.abs(v) < 0.000001 ? 0 : v;

    for (const s of sections) {
      const b = before[s];
      const [covT, covP, earnNow, costNow] = await Promise.all([
        coverage(s, 'trench'), coverage(s, 'pipe'), engine.sectionEarned(s), engine.sectionCost(s),
      ]);
      const tNow = continuousFront(covT), pNow = continuousFront(covP);
      const trenchM = applied.filter((m) => m.section === s && m.track === 'trench')
        .reduce((a, m) => a + Math.abs(m.metres || 0), 0);
      const pipeM = applied.filter((m) => m.section === s && m.track === 'pipe')
        .reduce((a, m) => a + Math.abs(m.metres || 0), 0);
      const ticked = tickedBySection[s] || 0;
      const earnedToday = clean(earnNow - b.earned);
      const costToday = clean(costNow - b.cost);
      if (trenchM || pipeM || ticked || (notes && notes.length)) {
        await insertDay.run(date, by, shift, s, b.trench, tNow, trenchM, b.pipe, pNow, pipeM,
          ticked, earnedToday, costToday, earnedToday - costToday,
          weather, downtime || 0, notes || '');
        totalEarn += earnedToday;
        totalCost += costToday;
      }
    }

    const pl = await db.prepare(`
      SELECT COALESCE(SUM(COALESCE(d."Number",1) * COALESCE(d."Hours",0)
        * COALESCE(r."Cost Rate ($/h)",0)),0) AS c,
        COALESCE(SUM("Hours"),0) AS h
      FROM tblDailyPlantLabour d
      LEFT JOIN tblRatePlantLabour r ON d."Description"=r."Description"
      WHERE d."Date"=?
    `).get(date);
    const plCost = Number(pl && pl.c || 0);
    const crewHours = Number(pl && pl.h || 0);
    await db.prepare(`DELETE FROM tblDailyProfit WHERE "Date"=?`).run(date);
    await db.prepare(`
      INSERT INTO tblDailyProfit ("Date","Recorded By","Shift","Earned ($)","Direct Cost ($)",
        "Plant and Labour ($)","Total Cost ($)","Profit ($)","Margin %","Crew Hours","Notes")
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(date, by, shift, totalEarn, totalCost, plCost, totalCost + plCost,
      totalEarn - totalCost - plCost,
      totalEarn ? (totalEarn - totalCost - plCost) / totalEarn : 0,
      crewHours, notes || '');

    return {
      earned: totalEarn, cost: totalCost, plantAndLabour: plCost,
      profit: totalEarn - totalCost - plCost, ticked: tickedCount, moves: applied,
    };
  });
}

module.exports = {
  CREW_TYPES, CREW_LABEL, TRACKS,
  ensureTables, merge, overlapLen, covers, continuousFront,
  coverage, crewIntervals, crewState, setOpening, recordProgress,
  syncProgress, assetsInRange, catchingUp, saveCrewDay,
};
