const db = require('./db');
const crews = require('./crews');

function qid(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function restoreTableFromBaseline(target, baseline, omit = []) {
  const result = await db.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position
  `, [target.toLowerCase()]);
  const columns = result.rows.map((r) => r.column_name).filter((c) => !omit.includes(c));
  if (!columns.length) return;
  const names = columns.map(qid).join(',');
  await db.exec(`INSERT INTO ${target} (${names}) SELECT ${names} FROM ${baseline}`);
}

async function resetProjectProgress(username) {
  return db.transaction(async () => {
    const baseline = await db.prepare(`SELECT COUNT(*)::int AS n FROM app_baseline_progress_control`).get();
    if (!baseline || Number(baseline.n) === 0) {
      throw new Error('No project baseline exists. Run the database seed before using reset.');
    }

    await db.exec(`
      TRUNCATE TABLE
        tblDailyProgress,
        tblDailyPlantLabour,
        tblDailySafety,
        tblDailyHoldPoint,
        tblDailyProfit,
        tblCrewDay,
        tblCrewSegment
      RESTART IDENTITY
    `);
    await db.exec(`DELETE FROM tblCrewTrack`);

    await db.exec(`
      UPDATE tblAsset SET
        "Complete"=NULL,
        "Completion Date"=NULL,
        "Progress Notes"=NULL,
        "Installed"=NULL,
        "Install Date"=NULL,
        "Installed By"=NULL,
        "Auto Complete"=NULL,
        "Auto Complete As At"=NULL
    `);
    await db.exec(`
      UPDATE tblAsset a SET
        "Complete"=b."Complete",
        "Completion Date"=b."Completion Date",
        "Progress Notes"=b."Progress Notes",
        "Installed"=b."Installed",
        "Install Date"=b."Install Date",
        "Installed By"=b."Installed By",
        "Auto Complete"=b."Auto Complete",
        "Auto Complete As At"=b."Auto Complete As At"
      FROM app_baseline_asset_progress b
      WHERE a."Record Key"=b."Record Key"
    `);

    await db.exec(`TRUNCATE TABLE tblProgressControl`);
    await restoreTableFromBaseline('tblProgressControl', 'app_baseline_progress_control');

    await db.exec(`TRUNCATE TABLE tblTrenchProgress`);
    await restoreTableFromBaseline('tblTrenchProgress', 'app_baseline_trench_progress');

    await db.exec(`TRUNCATE TABLE tblEditLog RESTART IDENTITY`);
    await restoreTableFromBaseline('tblEditLog', 'app_baseline_edit_log', ['_id']);

    await crews.ensureTables();
    await db.prepare(`
      INSERT INTO app_admin_audit (username, action, details)
      VALUES (?, 'reset_project_progress', ?::jsonb)
    `).run(username || 'admin', JSON.stringify({ resetToSeedBaseline: true }));

    return projectStatus();
  });
}

async function projectStatus() {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*)::int FROM tblAsset) AS assets,
      (SELECT COUNT(*)::int FROM tblAsset WHERE upper(coalesce("Complete",''))='YES') AS "completedAssets",
      (SELECT COUNT(*)::int FROM tblDailyProgress) AS "dailyProgressRows",
      (SELECT COUNT(*)::int FROM tblDailyPlantLabour) AS "plantLabourRows",
      (SELECT COUNT(*)::int FROM tblDailySafety) AS "safetyRows",
      (SELECT COUNT(*)::int FROM tblDailyHoldPoint) AS "holdPointRows",
      (SELECT COUNT(*)::int FROM tblDailyProfit) AS "profitRows",
      (SELECT COUNT(*)::int FROM app_baseline_progress_control) AS "baselineSections"
  `).get();
}

async function audit(limit = 50) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  return db.query(`
    SELECT id, happened_at AS "happenedAt", username, action, details
      FROM app_admin_audit
     ORDER BY id DESC
     LIMIT $1
  `, [safeLimit]).then((r) => r.rows);
}

async function recordAdminAction(username, action, details = {}) {
  return db.prepare(`
    INSERT INTO app_admin_audit (username, action, details)
    VALUES (?, ?, ?::jsonb)
  `).run(username || 'admin', action, JSON.stringify(details));
}

module.exports = { resetProjectProgress, projectStatus, audit, recordAdminAction };
