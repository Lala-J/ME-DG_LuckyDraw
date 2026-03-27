const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, 'luckydraw.db');

// Wrapper around sql.js to provide a better-sqlite3-like synchronous API
class DatabaseWrapper {
  constructor(sqlDb) {
    this._db = sqlDb;
  }

  _save() {
    const data = this._db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }

  exec(sql) {
    this._db.run(sql);
    this._save();
  }

  prepare(sql) {
    const db = this._db;
    const wrapper = this;

    return {
      run(...params) {
        const stmt = db.prepare(sql);
        if (params.length > 0) {
          stmt.bind(params);
        }
        stmt.step();
        stmt.free();
        wrapper._save();

        const changes = db.getRowsModified();
        return { changes };
      },

      get(...params) {
        const stmt = db.prepare(sql);
        if (params.length > 0) {
          stmt.bind(params);
        }
        const result = stmt.step() ? stmt.getAsObject() : undefined;
        stmt.free();
        return result;
      },

      all(...params) {
        const results = [];
        const stmt = db.prepare(sql);
        if (params.length > 0) {
          stmt.bind(params);
        }
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      }
    };
  }

  transaction(fn) {
    const wrapper = this;
    return function (...args) {
      wrapper._db.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        wrapper._db.run('COMMIT');
        wrapper._save();
        return result;
      } catch (err) {
        wrapper._db.run('ROLLBACK');
        throw err;
      }
    };
  }

  pragma(pragma) {
    this._db.run(`PRAGMA ${pragma}`);
  }
}

let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  db = new DatabaseWrapper(sqlDb);

  // Enable WAL mode and foreign keys
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY,
      username TEXT DEFAULT 'admin',
      password_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS validation_table (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      staff_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS registration_table (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      staff_id TEXT NOT NULL UNIQUE,
      prize_winner_mark TEXT DEFAULT '',
      registered_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lucky_draw_rounds (
      round_number INTEGER PRIMARY KEY,
      winner_count INTEGER NOT NULL DEFAULT 1,
      executed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS lucky_draw_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_number INTEGER NOT NULL,
      registration_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      staff_id TEXT NOT NULL
    );
  `);

  // Seed default admin if none exists
  const adminRow = db.prepare('SELECT COUNT(*) as cnt FROM admin').get();
  if (adminRow.cnt === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO admin (id, username, password_hash) VALUES (1, ?, ?)').run('admin', hash);
  }

  // Seed default config values
  const defaultConfig = {
    heading_text: 'Lucky Draw',
    subtitle_text: '',
    logo_filename: '',
    bg_color1: '#667eea',
    bg_color2: '#764ba2',
    bg_color3: '#f093fb',
    bg_animation_speed: '8',
    registration_open: '0',
    registration_end_time: '',
    copyright_visible: '1',
    lucky_draw_rounds: '0'
  };

  const insertConfig = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultConfig)) {
    insertConfig.run(key, value);
  }

  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

module.exports = { initDatabase, getDb };
