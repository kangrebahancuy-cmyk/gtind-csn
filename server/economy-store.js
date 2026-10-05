import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

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
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
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


export function createPersistentSession(userId, ttlMs) {
  const db = openDb();
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + ttlMs;
    db.prepare('INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES(?,?,?,?)')
      .run(token, String(userId), expiresAt, new Date().toISOString());
    return { token, expiresAt };
  } finally { db.close(); }
}

export function getPersistentSession(token) {
  const db = openDb();
  try {
    const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token=?').get(String(token));
    if (!row) return null;
    if (Number(row.expires_at) < Date.now()) {
      db.prepare('DELETE FROM sessions WHERE token=?').run(String(token));
      return null;
    }
    return { userId: String(row.user_id), expiresAt: Number(row.expires_at) };
  } finally { db.close(); }
}

export function deletePersistentSession(token) {
  const db = openDb();
  try { db.prepare('DELETE FROM sessions WHERE token=?').run(String(token)); }
  finally { db.close(); }
}

export function prunePersistentSessions() {
  const db = openDb();
  try { db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()); }
  finally { db.close(); }
}
