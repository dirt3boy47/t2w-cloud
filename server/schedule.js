const db = require('./db');

function isoDate(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return new Date(v).toISOString().slice(0, 10);
}

function dayNumber(v) {
  if (!v) return null;
  return Math.floor(new Date(`${isoDate(v)}T00:00:00Z`).getTime() / 86400000);
}

function daysBetween(a, b) {
  const aa = dayNumber(a), bb = dayNumber(b);
  if (aa == null || bb == null) return null;
  return bb - aa;
}

function addDays(v, days) {
  if (!v) return null;
  const d = new Date(`${isoDate(v)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Number(v || 0)));
}

function mergeIntervals(intervals, lo = -Infinity, hi = Infinity) {
  const sorted = (intervals || [])
    .map(([a, b]) => [Math.max(lo, Math.min(Number(a), Number(b))), Math.min(hi, Math.max(Number(a), Number(b)))])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a + 1e-9)
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], iv[1]);
    else out.push(iv.slice());
  }
  return out;
}

function intervalLength(intervals) {
  return (intervals || []).reduce((sum, [a, b]) => sum + Math.max(0, Number(b) - Number(a)), 0);
}

function plannedPercent(activity, asOf) {
  const start = isoDate(activity.planned_start);
  const finish = isoDate(activity.planned_finish);
  if (!start && !finish) return 0;
  if (activity.activity_type === 'Milestone' || !finish || start === finish) {
    return dayNumber(asOf) >= dayNumber(finish || start) ? 100 : 0;
  }
  if (dayNumber(asOf) <= dayNumber(start)) return 0;
  if (dayNumber(asOf) >= dayNumber(finish)) return 100;
  const total = Math.max(1, daysBetween(start, finish));
  return clamp((daysBetween(start, asOf) / total) * 100, 0, 100);
}

function statusFrom(activity, percent, plannedPct, forecastFinish, asOf) {
  if (percent >= 99.999) return 'Complete';
  const start = isoDate(activity.planned_start);
  const finish = isoDate(activity.planned_finish);
  if (!start || dayNumber(asOf) < dayNumber(start)) return 'Not started';
  if (percent <= 0 && finish && dayNumber(asOf) > dayNumber(finish)) return 'Delayed';
  if (forecastFinish && finish) {
    const variance = daysBetween(finish, forecastFinish);
    if (variance > 5) return 'Delayed';
    if (variance > 1) return 'At risk';
    if (variance < -1) return 'Ahead';
  }
  const pctGap = plannedPct - percent;
  if (pctGap > 20) return 'Delayed';
  if (pctGap > 8) return 'At risk';
  if (percent > plannedPct + 8) return 'Ahead';
  return 'On track';
}

function groupBy(rows, key) {
  const out = new Map();
  for (const row of rows || []) {
    const k = row[key];
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(row);
  }
  return out;
}

async function liveProgress(asOfInput) {
  const asOf = isoDate(asOfInput) || new Date().toISOString().slice(0, 10);
  const [activities, eodRows, assetRows, manualRows] = await Promise.all([
    db.prepare(`
      SELECT activity_id, area, work_package, activity_name, pipeline_section, crew_type,
        progress_method, progress_track, planned_quantity, chainage_from_m, chainage_to_m,
        chainage_display, planned_start, planned_finish, remaining_duration_days,
        physical_percent_complete, total_float_days, activity_type, cost_code, asset_link_enabled
      FROM app_schedule_activity
      ORDER BY planned_start NULLS LAST, activity_id
    `).all(),
    db.prepare(`
      SELECT id, activity_id, work_date, pipeline_section, crew_type, progress_track,
        from_ch_m, to_ch_m, metres_today, recorded_by
      FROM app_eod_activity
      ORDER BY work_date, id
    `).all(),
    db.prepare(`
      SELECT l.activity_id, l.record_key, l.weight,
        a."Complete" AS complete, a."Completion Date" AS completion_date,
        a."Installed" AS installed, a."Install Date" AS install_date,
        a."Asset Type" AS asset_type, a."Register" AS register,
        a."Chainage Start (m)" AS chainage
      FROM app_schedule_activity_asset l
      LEFT JOIN tblAsset a ON a."Record Key"=l.record_key
    `).all(),
    db.prepare(`SELECT * FROM app_schedule_manual_progress`).all(),
  ]);

  const eodByActivity = groupBy(eodRows, 'activity_id');
  const assetsByActivity = groupBy(assetRows, 'activity_id');
  const manualByActivity = new Map((manualRows || []).map((r) => [r.activity_id, r]));

  const items = activities.map((a) => {
    const method = a.progress_method || 'MANUAL';
    const eods = eodByActivity.get(a.activity_id) || [];
    const assets = assetsByActivity.get(a.activity_id) || [];
    const manual = manualByActivity.get(a.activity_id) || null;
    const planPct = plannedPercent(a, asOf);

    let completedQty = 0;
    let totalQty = null;
    let percent = 0;
    let actualStart = null;
    let actualFinish = null;
    let ratePerDay = null;
    let remainingQty = null;
    let forecastDaysRemaining = null;
    let forecastFinish = null;
    let evidenceDates = [];

    if (method === 'METRES') {
      const lo = Number(a.chainage_from_m);
      const hi = Number(a.chainage_to_m);
      totalQty = Number(a.planned_quantity || (hi - lo));
      const intervals = mergeIntervals(
        eods.filter((r) => r.from_ch_m != null && r.to_ch_m != null)
          .map((r) => [Number(r.from_ch_m), Number(r.to_ch_m)]),
        lo, hi
      );
      completedQty = intervalLength(intervals);
      percent = totalQty > 0 ? clamp((completedQty / totalQty) * 100, 0, 100) : 0;
      evidenceDates = [...new Set(eods.filter((r) => Math.abs(Number(r.metres_today || 0)) > 1e-9)
        .map((r) => isoDate(r.work_date)).filter(Boolean))].sort();
      actualStart = evidenceDates[0] || null;
      actualFinish = percent >= 99.999 ? (evidenceDates[evidenceDates.length - 1] || null) : null;
      if (evidenceDates.length && completedQty > 0) ratePerDay = completedQty / evidenceDates.length;
    } else if (method === 'ASSETS') {
      totalQty = assets.reduce((s, r) => s + Number(r.weight || 1), 0);
      const completedAssets = assets.filter((r) => String(r.complete || '').toLowerCase() === 'yes');
      completedQty = completedAssets.reduce((s, r) => s + Number(r.weight || 1), 0);
      percent = totalQty > 0 ? clamp((completedQty / totalQty) * 100, 0, 100) : 0;
      evidenceDates = [...new Set(completedAssets.map((r) => isoDate(r.completion_date || r.install_date)).filter(Boolean))].sort();
      actualStart = evidenceDates[0] || null;
      actualFinish = percent >= 99.999 ? (evidenceDates[evidenceDates.length - 1] || null) : null;
      if (evidenceDates.length && completedQty > 0) ratePerDay = completedQty / evidenceDates.length;
    } else {
      percent = clamp(manual ? manual.percent_complete : 0, 0, 100);
      totalQty = 100;
      completedQty = percent;
      actualStart = manual ? isoDate(manual.actual_start) : null;
      actualFinish = manual ? isoDate(manual.actual_finish) : null;
      if (!actualStart && eods.length) actualStart = isoDate(eods[0].work_date);
      if (percent >= 99.999 && !actualFinish && eods.length) actualFinish = isoDate(eods[eods.length - 1].work_date);
    }

    remainingQty = totalQty == null ? null : Math.max(0, totalQty - completedQty);
    const plannedStart = isoDate(a.planned_start);
    const plannedFinish = isoDate(a.planned_finish);
    const latestEvidence = evidenceDates[evidenceDates.length - 1] || actualStart || null;

    if (percent >= 99.999) {
      forecastFinish = actualFinish || latestEvidence || plannedFinish;
      forecastDaysRemaining = 0;
    } else if (ratePerDay && ratePerDay > 0 && remainingQty != null) {
      forecastDaysRemaining = Math.max(0, Math.ceil(remainingQty / ratePerDay));
      forecastFinish = addDays(latestEvidence || asOf, forecastDaysRemaining);
    } else if (plannedStart && dayNumber(asOf) > dayNumber(plannedStart)) {
      const slip = Math.max(0, daysBetween(plannedStart, asOf));
      forecastFinish = plannedFinish ? addDays(plannedFinish, slip) : null;
    } else {
      forecastFinish = plannedFinish;
    }

    const varianceDays = plannedFinish && forecastFinish ? daysBetween(plannedFinish, forecastFinish) : null;
    const assetTotal = assets.length;
    const assetComplete = assets.filter((r) => String(r.complete || '').toLowerCase() === 'yes').length;
    const status = statusFrom(a, percent, planPct, forecastFinish, asOf);

    return {
      activityId: a.activity_id,
      area: a.area,
      workPackage: a.work_package,
      activityName: a.activity_name,
      section: a.pipeline_section,
      crewType: a.crew_type,
      method,
      progressTrack: a.progress_track,
      chainageFromM: a.chainage_from_m,
      chainageToM: a.chainage_to_m,
      chainageDisplay: a.chainage_display,
      plannedStart,
      plannedFinish,
      plannedQuantity: totalQty,
      completedQuantity: completedQty,
      remainingQuantity: remainingQty,
      percentComplete: percent,
      plannedPercent: planPct,
      actualStart,
      actualFinish,
      ratePerDay,
      forecastDaysRemaining,
      forecastFinish,
      varianceDays,
      status,
      assetCount: assetTotal,
      assetComplete,
      costCode: a.cost_code,
      totalFloatDays: a.total_float_days,
      activityType: a.activity_type,
      manualNote: manual ? manual.status_note : null,
    };
  });

  const dated = items.filter((i) => i.plannedStart || i.plannedFinish);
  const projectStart = dated.map((i) => i.plannedStart).filter(Boolean).sort()[0] || null;
  const projectFinish = dated.map((i) => i.plannedFinish).filter(Boolean).sort().slice(-1)[0] || null;
  const summary = {
    total: items.length,
    complete: items.filter((i) => i.status === 'Complete').length,
    delayed: items.filter((i) => i.status === 'Delayed').length,
    atRisk: items.filter((i) => i.status === 'At risk').length,
    ahead: items.filter((i) => i.status === 'Ahead').length,
    onTrack: items.filter((i) => i.status === 'On track').length,
    notStarted: items.filter((i) => i.status === 'Not started').length,
  };

  return { asOf, projectStart, projectFinish, summary, items };
}

function candidateScore(a, { crew, date, chainage }) {
  let score = 0;
  const ch = chainage == null || chainage === '' ? null : Number(chainage);
  if (crew && a.crewType === crew) score += 45;
  if (ch != null && a.chainageFromM != null && a.chainageToM != null) {
    if (ch >= Number(a.chainageFromM) - 0.5 && ch <= Number(a.chainageToM) + 0.5) score += 100;
    else {
      const d = Math.min(Math.abs(ch - Number(a.chainageFromM)), Math.abs(ch - Number(a.chainageToM)));
      if (d <= 100) score += 35;
      else if (d <= 500) score += 12;
    }
  }
  const d = isoDate(date);
  if (d && a.plannedStart && a.plannedFinish) {
    if (dayNumber(d) >= dayNumber(a.plannedStart) && dayNumber(d) <= dayNumber(a.plannedFinish)) score += 50;
    else {
      const near = Math.min(Math.abs(daysBetween(d, a.plannedStart)), Math.abs(daysBetween(d, a.plannedFinish)));
      if (near <= 14) score += 20;
      else if (near <= 60) score += 5;
    }
  }
  if (a.method === 'METRES') score += 8;
  if (a.activityType === 'Milestone') score -= 50;
  return score;
}

async function activityCandidates({ section, crew, date, chainage }) {
  const live = await liveProgress(date);
  let rows = live.items.filter((a) => !section || a.section === section);
  rows = rows.filter((a) => a.activityType !== 'Milestone');
  const scored = rows.map((a) => ({ ...a, score: candidateScore(a, { crew, date, chainage }) }))
    .sort((a, b) => b.score - a.score || String(a.plannedStart || '').localeCompare(String(b.plannedStart || '')))
    .slice(0, 20);
  return scored;
}

async function linkEod({ date, by, selections, moves, assetLinks, notes }) {
  const cleanDate = isoDate(date);
  if (!cleanDate) throw new Error('A work date is required');
  const selectionsList = Array.isArray(selections) ? selections : [];
  const moveList = Array.isArray(moves) ? moves : [];
  const assetList = Array.isArray(assetLinks) ? assetLinks : [];
  const linked = [];

  await db.transaction(async () => {
    for (const sel of selectionsList) {
      if (!sel || !sel.activityId) continue;
      const activity = await db.prepare(`
        SELECT activity_id, pipeline_section, crew_type, progress_method, progress_track,
          chainage_from_m, chainage_to_m
        FROM app_schedule_activity WHERE activity_id=?
      `).get(sel.activityId);
      if (!activity) continue;

      const matchingMoves = moveList.filter((m) => m.section === sel.section && m.crew === sel.crew);
      const preferred = matchingMoves.find((m) => m.track === (activity.progress_track || sel.track))
        || matchingMoves.find((m) => m.track === 'pipe')
        || matchingMoves[0]
        || {};

      let fromCh = preferred.from == null ? null : Number(preferred.from);
      let toCh = preferred.to == null ? (preferred.reachedCh == null ? null : Number(preferred.reachedCh)) : Number(preferred.to);
      let metres = preferred.metres == null ? null : Math.abs(Number(preferred.metres));
      if (activity.progress_method === 'METRES' && fromCh != null && toCh != null
          && activity.chainage_from_m != null && activity.chainage_to_m != null) {
        const lo = Number(activity.chainage_from_m), hi = Number(activity.chainage_to_m);
        const a = Math.max(lo, Math.min(fromCh, toCh));
        const b = Math.min(hi, Math.max(fromCh, toCh));
        fromCh = a;
        toCh = b;
        metres = Math.max(0, b - a);
      }

      const inserted = await db.prepare(`
        INSERT INTO app_eod_activity (work_date, pipeline_section, crew_type, activity_id,
          progress_method, progress_track, from_ch_m, to_ch_m, metres_today, recorded_by, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id
      `).get(cleanDate, sel.section || activity.pipeline_section, sel.crew || activity.crew_type,
        activity.activity_id, activity.progress_method, activity.progress_track,
        fromCh, toCh, metres, by || 'web', notes || '');

      const links = assetList.filter((x) => x.activityId === activity.activity_id && x.recordKey);
      for (const x of links) {
        await db.prepare(`
          INSERT INTO app_schedule_activity_asset(activity_id, record_key, link_source)
          VALUES (?,?,'EOD') ON CONFLICT(activity_id, record_key) DO NOTHING
        `).run(activity.activity_id, x.recordKey);
        await db.prepare(`
          INSERT INTO app_eod_activity_asset(eod_activity_id, activity_id, record_key, completion_date, recorded_by)
          VALUES (?,?,?,?,?) ON CONFLICT(activity_id, record_key) DO UPDATE SET
            eod_activity_id=excluded.eod_activity_id,
            completion_date=COALESCE(excluded.completion_date, app_eod_activity_asset.completion_date),
            recorded_by=excluded.recorded_by
        `).run(inserted.id, activity.activity_id, x.recordKey, cleanDate, by || 'web');
      }

      linked.push({ activityId: activity.activity_id, eodActivityId: inserted.id, metresToday: metres, assets: links.length });
    }
  });

  return { ok: true, linked, live: await liveProgress(cleanDate) };
}

async function updateManual(activityId, fields, by) {
  const activity = await db.prepare(`SELECT activity_id, progress_method FROM app_schedule_activity WHERE activity_id=?`).get(activityId);
  if (!activity) throw new Error('Schedule activity not found');
  const percent = clamp(fields.percentComplete == null ? 0 : fields.percentComplete, 0, 100);
  const actualStart = isoDate(fields.actualStart);
  const actualFinish = isoDate(fields.actualFinish);
  await db.prepare(`
    INSERT INTO app_schedule_manual_progress(activity_id, percent_complete, actual_start, actual_finish,
      status_note, updated_by, updated_at)
    VALUES (?,?,?,?,?,?,now())
    ON CONFLICT(activity_id) DO UPDATE SET
      percent_complete=excluded.percent_complete,
      actual_start=excluded.actual_start,
      actual_finish=excluded.actual_finish,
      status_note=excluded.status_note,
      updated_by=excluded.updated_by,
      updated_at=now()
  `).run(activityId, percent, actualStart, actualFinish, fields.note || '', by || 'web');
  return { ok: true };
}

module.exports = {
  isoDate, daysBetween, addDays, mergeIntervals, intervalLength,
  liveProgress, activityCandidates, linkEod, updateManual,
};
