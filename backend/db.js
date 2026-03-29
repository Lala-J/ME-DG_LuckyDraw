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
    this._inTransaction = false;
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
        const changes = db.getRowsModified();
        if (!wrapper._inTransaction) {
          wrapper._save();
        }

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
      wrapper._inTransaction = true;
      wrapper._db.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        wrapper._db.run('COMMIT');
        wrapper._inTransaction = false;
        wrapper._save();
        return result;
      } catch (err) {
        wrapper._inTransaction = false;
        try { wrapper._db.run('ROLLBACK'); } catch (_) {}
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
      staff_id TEXT NOT NULL,
      phone_number TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS registration_table (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      staff_id TEXT NOT NULL UNIQUE,
      phone_number TEXT NOT NULL DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS prizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prize_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      picture_filename TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS lucky_draw_round_prizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_number INTEGER NOT NULL,
      prize_id TEXT NOT NULL,
      UNIQUE(prize_id)
    );
  `);

  // Seed default admin if none exists
  const adminRow = db.prepare('SELECT COUNT(*) as cnt FROM admin').get();
  if (adminRow.cnt === 0) {
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD;
    if (!defaultPassword) throw new Error('DEFAULT_ADMIN_PASSWORD environment variable is required');
    const hash = bcrypt.hashSync(defaultPassword, 10);
    db.prepare('INSERT INTO admin (id, username, password_hash) VALUES (1, ?, ?)').run('admin', hash);
  }

  // Seed default config values
  const defaultConfig = {
    heading_text: 'Lucky Draw',
    subtitle_text: '',
    logo_filename: '',
    logo_size: '120',
    bg_color1: '#000000',
    bg_color2: '#350160',
    bg_color3: '#4d0f41',
    bg_animation_speed: '8',
    registration_open: '0',
    registration_end_time: '',
    copyright_visible: '1',
    lucky_draw_rounds: '0',
    organisation: ''
  };

  const insertConfig = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultConfig)) {
    insertConfig.run(key, value);
  }

  // Migrations: add phone_number column to existing tables if absent
  const validationCols = db.prepare('PRAGMA table_info(validation_table)').all();
  if (!validationCols.find(c => c.name === 'phone_number')) {
    db.exec("ALTER TABLE validation_table ADD COLUMN phone_number TEXT NOT NULL DEFAULT ''");
  }
  const registrationCols = db.prepare('PRAGMA table_info(registration_table)').all();
  if (!registrationCols.find(c => c.name === 'phone_number')) {
    db.exec("ALTER TABLE registration_table ADD COLUMN phone_number TEXT NOT NULL DEFAULT ''");
  }

  // Migrations: add custom_name to lucky_draw_rounds
  const roundCols = db.prepare('PRAGMA table_info(lucky_draw_rounds)').all();
  if (!roundCols.find(c => c.name === 'custom_name')) {
    db.exec("ALTER TABLE lucky_draw_rounds ADD COLUMN custom_name TEXT DEFAULT ''");
  }

  // Migrations: add prize_id to lucky_draw_results
  const resultCols = db.prepare('PRAGMA table_info(lucky_draw_results)').all();
  if (!resultCols.find(c => c.name === 'prize_id')) {
    db.exec("ALTER TABLE lucky_draw_results ADD COLUMN prize_id TEXT DEFAULT ''");
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
