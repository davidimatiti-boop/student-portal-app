// Opens a single shared SQLite connection used throughout the app.
const path = require('path');
const Database = require('better-sqlite3');

// DATABASE_PATH lets a host point this at a persistent disk/volume
// (e.g. Render's mounted Disk) instead of the app's own directory, which
// is wiped on every redeploy on most platforms.
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'db', 'student_portal.sqlite');
const db = new Database(dbPath);

// Enforce foreign key constraints (off by default in SQLite).
db.pragma('foreign_keys = ON');

module.exports = db;
