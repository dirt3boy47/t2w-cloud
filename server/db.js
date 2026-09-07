const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required. Use the Supabase Session pooler connection string.');
}

const sslEnabled = process.env.DATABASE_SSL !== 'false';
const pool = new Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX || 8),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 15000),
  ssl: sslEnabled ? { rejectUnauthorized: false } : false,
});

const txStorage = new AsyncLocalStorage();

function qmarksToPg(sql) {
  let out = '';
  let n = 1;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "'" && !inDouble) {
      out += ch;
      if (inSingle && next === "'") {
        out += next;
        i++;
      } else {
        inSingle = !inSingle;
      }
      continue;
    }
    if (ch === '"' && !inSingle) {
      out += ch;
      if (inDouble && next === '"') {
        out += next;
        i++;
      } else {
        inDouble = !inDouble;
      }
      continue;
    }
    if (ch === '?' && !inSingle && !inDouble) out += '$' + n++;
    else out += ch;
  }
  return out;
}

function executor() {
  return txStorage.getStore() || pool;
}

async function query(sql, params = []) {
  return executor().query(qmarksToPg(sql), params);
}

function prepare(sql) {
  return {
    async all(...params) {
      if (params.length === 1 && Array.isArray(params[0])) params = params[0];
      const result = await query(sql, params);
      return result.rows;
    },
    async get(...params) {
      if (params.length === 1 && Array.isArray(params[0])) params = params[0];
      const result = await query(sql, params);
      return result.rows[0];
    },
    async run(...params) {
      if (params.length === 1 && Array.isArray(params[0])) params = params[0];
      const result = await query(sql, params);
      return { changes: result.rowCount, rowCount: result.rowCount, rows: result.rows };
    },
  };
}

async function exec(sql) {
  return executor().query(sql);
}

async function transaction(fn) {
  const existing = txStorage.getStore();
  if (existing) return fn();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await txStorage.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function ready() {
  await pool.query('SELECT 1');
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, prepare, exec, transaction, ready, close, qmarksToPg };
