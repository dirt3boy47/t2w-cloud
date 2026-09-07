const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const db = require('./db');

const DATA_DIR = path.join(__dirname, 'data');
const schema = require('./schema.json');
const args = new Set(process.argv.slice(2));
const cliForce = args.has('--force');
const cliFreshStart = args.has('--fresh-start');

function tableSqlName(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Unsafe table name: ${name}`);
  return name;
}

function qid(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function normalize(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

async function loadCsv(table) {
  const file = path.join(DATA_DIR, `${table}.csv`);
  if (!fs.existsSync(file)) {
    console.log(`skip  ${table}: no CSV`);
    return 0;
  }

  const rows = parse(fs.readFileSync(file), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  });
  if (!rows.length) {
    console.log(`load  ${table}: 0 rows`);
    return 0;
  }

  const columns = Object.keys(rows[0]);
  const batchSize = 40;
  let loaded = 0;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values = [];
    const tuples = [];
    for (const row of batch) {
      const placeholders = [];
      for (const column of columns) {
        values.push(normalize(row[column]));
        placeholders.push(`$${values.length}`);
      }
      tuples.push(`(${placeholders.join(',')})`);
    }
    const sql = `INSERT INTO ${tableSqlName(table)} (${columns.map(qid).join(',')}) VALUES ${tuples.join(',')}`;
    await db.query(sql, values);
    loaded += batch.length;
  }
  console.log(`load  ${table}: ${loaded} rows`);
  return loaded;
}

async function clearRuntimeProgress() {
  await db.exec(`
    TRUNCATE TABLE
      tblDailyProgress,
      tblDailyPlantLabour,
      tblDailySafety,
      tblDailyHoldPoint,
      tblDailyProfit,
      tblCrewDay,
      tblCrewSegment
    RESTART IDENTITY;
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
    UPDATE tblProgressControl
       SET "TRENCH"=0, "PIPE"=0
  `);
  await db.exec(`
    UPDATE tblTrenchProgress
       SET "Trench Complete (m)"=0,
           "Pipe Laid (m)"=0,
           "As At Date"=NULL,
           "Updated By"=NULL,
           "Notes"=NULL
  `);
}

async function captureBaseline() {
  await db.exec(`TRUNCATE TABLE app_baseline_asset_progress`);
  await db.exec(`
    INSERT INTO app_baseline_asset_progress
      ("Record Key", "Complete", "Completion Date", "Progress Notes", "Installed",
       "Install Date", "Installed By", "Auto Complete", "Auto Complete As At")
    SELECT "Record Key", "Complete", "Completion Date", "Progress Notes", "Installed",
           "Install Date", "Installed By", "Auto Complete", "Auto Complete As At"
    FROM tblAsset
  `);

  await db.exec(`TRUNCATE TABLE app_baseline_progress_control`);
  await db.exec(`INSERT INTO app_baseline_progress_control SELECT * FROM tblProgressControl`);

  await db.exec(`TRUNCATE TABLE app_baseline_trench_progress`);
  await db.exec(`INSERT INTO app_baseline_trench_progress SELECT * FROM tblTrenchProgress`);

  await db.exec(`TRUNCATE TABLE app_baseline_edit_log RESTART IDENTITY`);
  const cols = await db.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='tbleditlog'
     ORDER BY ordinal_position
  `);
  const sourceCols = cols.rows.map((r) => r.column_name).filter((c) => c !== '_id');
  if (sourceCols.length) {
    const names = sourceCols.map(qid).join(',');
    await db.exec(`INSERT INTO app_baseline_edit_log (${names}) SELECT ${names} FROM tblEditLog`);
  }
}

async function seed(options = {}) {
  const force = options.force !== undefined ? !!options.force : cliForce;
  const freshStart = options.freshStart !== undefined ? !!options.freshStart : cliFreshStart;
  await db.ready();
  const exists = await db.prepare(`SELECT to_regclass('public.tblasset') AS name`).get();
  if (!exists || !exists.name) {
    throw new Error('Database schema is missing. Run npm run db:migrate first.');
  }

  const count = await db.prepare(`SELECT COUNT(*)::int AS n FROM tblAsset`).get();
  if (Number(count.n) > 0 && !force) {
    throw new Error('T2W data already exists. Add --force to deliberately reload the source CSV files.');
  }

  await db.transaction(async () => {
    const sourceTables = schema.map((item) => tableSqlName(item.table));
    if (sourceTables.length) {
      await db.exec(`TRUNCATE TABLE ${sourceTables.join(', ')} RESTART IDENTITY`);
    }
    await db.exec(`TRUNCATE TABLE tblCrewDay, tblCrewSegment RESTART IDENTITY`);
    await db.exec(`DELETE FROM tblCrewTrack`);

    for (const item of schema) await loadCsv(item.table);

    if (freshStart) {
      await clearRuntimeProgress();
      console.log('fresh Project progress, daily records, plant/labour, safety and hold points cleared.');
    }

    await captureBaseline();
    await db.prepare(`
      INSERT INTO app_admin_audit (username, action, details)
      VALUES (?, ?, ?::jsonb)
    `).run('system', freshStart ? 'seed_fresh_start' : 'seed_source_baseline', JSON.stringify({ force, freshStart }));
  });

  const summary = await db.prepare(`
    SELECT
      (SELECT COUNT(*)::int FROM tblAsset) AS assets,
      (SELECT COUNT(*)::int FROM tblTrenchProgress) AS trench_rows,
      (SELECT COUNT(*)::int FROM tblRatePlantLabour) AS plant_labour_rates,
      (SELECT COUNT(*)::int FROM tblAsset WHERE upper(coalesce("Complete",''))='YES') AS completed_assets
  `).get();
  console.log('Seed complete:', summary);
}

if (require.main === module) {
  seed()
    .then(() => db.close())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('Seed failed:', err.message || err);
      try { await db.close(); } catch (_) {}
      process.exit(1);
    });
}

module.exports = { seed, clearRuntimeProgress, captureBaseline };
