// Opens a single shared connection to a Turso (hosted, SQLite-compatible)
// database. All queries go over the network now, so every call site uses
// async/await — unlike the previous local-file better-sqlite3 setup.
require('dotenv').config();
const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Thin async helpers mirroring better-sqlite3's .get/.all/.run shape, so
// route code reads the same way it did against the old local database.
async function get(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows[0];
}

async function all(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows;
}

async function run(sql, args = []) {
  const result = await client.execute({ sql, args });
  return {
    lastInsertRowid: Number(result.lastInsertRowid),
    changes: result.rowsAffected,
  };
}

module.exports = { client, get, all, run };
