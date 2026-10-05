import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'economy.sqlite');
const LEGACY_FILE = path.join(DATA_DIR, 'economy.json');

const EMPTY_STATE = { users: [], transactions: [], deposits: [], withdrawals: [] };

function openDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_FILE, { timeout: 5000 });
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS economy_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const row = db.prepare('SELECT version, payload FROM economy_state WHERE id = 1').get();
  if (!row) {
    let state = EMPTY_STATE;
    if (fs.existsSync(LEGACY_FILE)) {
      try {
        const legacy = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8'));
        state = { ...EMPTY_STATE, ...legacy };
      } catch {
        state = EMPTY_STATE;
      }
    }
    db.prepare('INSERT INTO economy_state (id, version, payload, updated_at) VALUES (1, 1, ?, ?)')
      .run(JSON.stringify(state), new Date().toISOString());
  }
  return db;
}

export function loadEconomyState() {
  const db = openDb();
  try {
    const row = db.prepare('SELECT version, payload FROM economy_state WHERE id = 1').get();
    const state = { ...EMPTY_STATE, ...JSON.parse(row.payload) };
    Object.defineProperty(state, '__version', { value: Number(row.version), enumerable: false, writable: true });
    return state;
  } finally {
    db.close();
  }
}

export function saveEconomyState(state) {
  const expectedVersion = Number(state.__version || 0);
  if (!expectedVersion) throw new Error('economy_version_missing');

  const db = openDb();
  try {
    db.exec('BEGIN IMMEDIATE');
    const result = db.prepare(
      'UPDATE economy_state SET version = version + 1, payload = ?, updated_at = ? WHERE id = 1 AND version = ?'
    ).run(JSON.stringify({
      users: state.users || [],
      transactions: state.transactions || [],
      deposits: state.deposits || [],
      withdrawals: state.withdrawals || [],
    }), new Date().toISOString(), expectedVersion);

    if (Number(result.changes) !== 1) {
      db.exec('ROLLBACK');
      const error = new Error('economy_write_conflict');
      error.code = 'ECONOMY_WRITE_CONFLICT';
      throw error;
    }
    db.exec('COMMIT');
  } catch (error) {
    try { if (db.isTransaction) db.exec('ROLLBACK'); } catch {}
    throw error;
  } finally {
    db.close();
  }
}
