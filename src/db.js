const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'ildf-dar-batangas.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_slug TEXT NOT NULL,
    municipality_slug TEXT NOT NULL,
    title_number TEXT NOT NULL,
    sequence_number TEXT NOT NULL,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    total_area TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_folders_scope
    ON folders (cluster_slug, municipality_slug);

  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT,
    description TEXT,
    file_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_files_folder ON files (folder_id);
`);

// Migration: earlier deployments of this app created the users table
// without role/status columns. Add them if this is an existing database.
const existingColumns = db.prepare("PRAGMA table_info(users)").all().map(function (c) { return c.name; });
if (existingColumns.indexOf('role') === -1) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
}
if (existingColumns.indexOf('status') === -1) {
  db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
}
// Any user that existed before this migration (e.g. the originally seeded
// admin) should not be locked out — treat pre-existing accounts as approved
// admins rather than pending users.
if (existingColumns.indexOf('role') === -1 || existingColumns.indexOf('status') === -1) {
  db.exec("UPDATE users SET role = 'admin', status = 'approved'");
}

// Seed a default admin account on first boot so the portal is usable
// immediately after deploy. Change the password after first login.
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (userCount === 0) {
  const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, 'admin', 'approved')").run(username, hash);
  console.log('[db] Seeded default admin account "' + username + '". Please change the password after logging in.');
}

module.exports = { db, DATA_DIR, UPLOADS_DIR };
