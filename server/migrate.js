const fs = require('fs');
const path = require('path');
const db = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

async function migrate() {
  await db.ready();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS app_schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    const already = await db.prepare(
      `SELECT 1 AS ok FROM app_schema_migrations WHERE filename=?`
    ).get(filename);
    if (already) {
      console.log(`skip  ${filename}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
    console.log(`apply ${filename}`);
    await db.transaction(async () => {
      await db.exec(sql);
      await db.prepare(
        `INSERT INTO app_schema_migrations (filename) VALUES (?)`
      ).run(filename);
    });
  }

  console.log('Database migrations are up to date.');
}

if (require.main === module) {
  migrate()
    .then(() => db.close())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('Migration failed:', err.message || err);
      try { await db.close(); } catch (_) {}
      process.exit(1);
    });
}

module.exports = { migrate };
