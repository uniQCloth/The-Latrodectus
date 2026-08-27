const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

// Falls back gracefully — in-memory mode if DATABASE_URL not set
let pool = null;
let dbEnabled = false;

async function runSchema(client) {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await client.query(sql);
  console.log('[DB] Schema applied');
}

async function init() {
  if (!process.env.DATABASE_URL) {
    console.warn('[DB] DATABASE_URL not set — running in-memory mode (no persistence)');
    return;
  }

  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });

    dbEnabled = true;
    console.log('[DB] PostgreSQL connected');

    // Apply schema before returning — guarantees tables exist before server accepts traffic
    const client = await pool.connect();
    try {
      await runSchema(client);
    } catch (err) {
      console.error('[DB] Schema error:', err.message);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[DB] Failed to init pool:', err.message);
  }
}

async function query(text, params) {
  if (!dbEnabled || !pool) return null;
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (err) {
    console.error('[DB] Query error:', err.message, '|', text.slice(0, 80));
    return null;
  }
}

async function isReady() {
  if (!dbEnabled || !pool) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

function isEnabled() { return dbEnabled; }

module.exports = { init, query, isReady, isEnabled };
