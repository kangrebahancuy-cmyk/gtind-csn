import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

const isTest = process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT === 'child' || process.argv.includes('--test');
const dataDir = path.resolve(process.env.SQLITE_DATA_DIR || './data');
const configuredPath = process.env.SQLITE_DB_PATH || path.join(dataDir, 'gtind-csn.sqlite');
const dbPath = isTest ? ':memory:' : path.resolve(configuredPath);
if (!isTest) fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new DatabaseSync(dbPath);
sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const txStore = new AsyncLocalStorage();
let lock = Promise.resolve();

function serial(work) {
  const run = lock.then(work, work);
  lock = run.catch(() => {});
  return run;
}

function inTransaction() {
  return Boolean(txStore.getStore());
}

function runLocked(work) {
  return inTransaction() ? work() : serial(work);
}

const UNIQUE_FIELDS = {
  users: [['usernameNormalized'], ['linkCode'], ['growIdNormalized']],
  sessions: [['token']],
  wallets: [['userId']],
  ledger: [['id'], ['userId','type','referenceId']],
  deposits: [['transactionId']],
  withdrawals: [['id'], ['userId','idempotencyKey']],
  gameRounds: [['id']],
  caseCatalog: [['id']],
  leases: [['id']],
  caseBattles: [['id']],
  crashRounds: [['id']],
  crashPlayers: [['roundId','userId']],
  auditLogs: [['id']],
  rateLimits: [['key']],
  realtimeEvents: [['id']],
  profiles: [['userId']],
  playerStats: [['userId']],
  playerXp: [['userId']],
  xpEvents: [['id']],
  chatMessages: [['id']],
};

function tableName(name) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error('invalid_collection');
  return 'c_' + name;
}

function ensureTable(name) {
  const table = tableName(name);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS ${table} (k TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  return table;
}

function clone(value) {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function getPath(obj, pathName) {
  return String(pathName).split('.').reduce((v, key) => v == null ? undefined : v[key], obj);
}

function setPath(obj, pathName, value) {
  const parts = String(pathName).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = clone(value);
}

function unsetPath(obj, pathName) {
  const parts = String(pathName).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur?.[parts[i]]) return;
    cur = cur[parts[i]];
  }
  if (cur) delete cur[parts[parts.length - 1]];
}

function equal(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function compare(value, op, expected) {
  if (op === '$in') return Array.isArray(expected) && expected.some(x => equal(value, x));
  if (op === '$nin') return Array.isArray(expected) && !expected.some(x => equal(value, x));
  if (op === '$ne') return !equal(value, expected);
  if (op === '$exists') return expected ? value !== undefined : value === undefined;
  if (op === '$gt') return value !== undefined && value > expected;
  if (op === '$gte') return value !== undefined && value >= expected;
  if (op === '$lt') return value !== undefined && value < expected;
  if (op === '$lte') return value !== undefined && value <= expected;
  if (op === '$regex') {
    const re = expected instanceof RegExp ? expected : new RegExp(String(expected), 'i');
    return re.test(String(value ?? ''));
  }
  return false;
}

function matches(doc, filter = {}) {
  if (!filter || Object.keys(filter).length === 0) return true;
  for (const [key, expected] of Object.entries(filter)) {
    if (key === '$or') {
      if (!Array.isArray(expected) || !expected.some(f => matches(doc, f))) return false;
      continue;
    }
    if (key === '$and') {
      if (!Array.isArray(expected) || !expected.every(f => matches(doc, f))) return false;
      continue;
    }
    const value = getPath(doc, key);
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date) && !(expected instanceof RegExp)) {
      if (Object.prototype.hasOwnProperty.call(expected, '$options')) continue;
      for (const [op, wanted] of Object.entries(expected)) {
        if (op === '$options') continue;
        if (op === '$regex') {
          const flags = String(expected.$options || '');
          const re = new RegExp(String(wanted), flags);
          if (!re.test(String(value ?? ''))) return false;
        } else if (!compare(value, op, wanted)) return false;
      }
    } else if (expected instanceof RegExp) {
      if (!expected.test(String(value ?? ''))) return false;
    } else if (!equal(value, expected)) {
      return false;
    }
  }
  return true;
}

function project(doc, projection) {
  if (!projection) return clone(doc);
  const entries = Object.entries(projection);
  const include = entries.some(([,v]) => Boolean(v));
  if (include) {
    const out = {};
    for (const [key, value] of entries) {
      if (value) {
        const v = getPath(doc, key);
        if (v !== undefined) setPath(out, key, v);
      }
    }
    if (projection._id !== 0 && doc._id !== undefined) out._id = doc._id;
    return out;
  }
  const out = clone(doc);
  for (const [key, value] of entries) if (!value) unsetPath(out, key);
  return out;
}

function sortDocs(docs, sort) {
  if (!sort) return docs;
  const fields = Object.entries(sort);
  return docs.sort((a,b) => {
    for (const [key, direction] of fields) {
      const av = getPath(a,key), bv = getPath(b,key);
      if (equal(av,bv)) continue;
      if (av === undefined) return direction < 0 ? 1 : -1;
      if (bv === undefined) return direction < 0 ? -1 : 1;
      return (av < bv ? -1 : 1) * (Number(direction) < 0 ? -1 : 1);
    }
    return 0;
  });
}

function storedRows(name) {
  const table = ensureTable(name);
  return sqlite.prepare(`SELECT k, data FROM ${table}`).all().map(row => {
    const doc = JSON.parse(row.data);
    return doc;
  });
}

function keyOf(doc) {
  return String(doc.id ?? doc._id ?? doc.token ?? doc.userId ?? cryptoRandomKey());
}

function cryptoRandomKey() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function assertUnique(name, doc, ignoreKey = null) {
  const rules = UNIQUE_FIELDS[name] || [];
  if (!rules.length) return;
  const rows = storedRows(name);
  for (const fields of rules) {
    const values = fields.map(f => getPath(doc,f));
    if (values.some(v => v === undefined || v === null || v === '')) continue;
    const conflict = rows.find(row => {
      const rowKey = keyOf(row);
      if (ignoreKey && rowKey === String(ignoreKey)) return false;
      return fields.every((field,i) => equal(getPath(row,field), values[i]));
    });
    if (conflict) {
      const err = new Error('duplicate_key');
      err.code = 'SQLITE_CONSTRAINT_UNIQUE';
      throw err;
    }
  }
}

function applyUpdate(original, update, isInsert = false) {
  const doc = clone(original) || {};
  if (update.$setOnInsert && isInsert) for (const [k,v] of Object.entries(update.$setOnInsert)) setPath(doc,k,v);
  if (update.$set) for (const [k,v] of Object.entries(update.$set)) setPath(doc,k,v);
  if (update.$unset) for (const k of Object.keys(update.$unset)) unsetPath(doc,k);
  if (update.$inc) for (const [k,v] of Object.entries(update.$inc)) setPath(doc,k,(Number(getPath(doc,k))||0)+(Number(v)||0));
  if (!Object.keys(update).some(k => k.startsWith('$'))) Object.assign(doc, clone(update));
  return doc;
}

function saveDoc(name, doc, oldKey = null) {
  const table = ensureTable(name);
  const key = keyOf(doc);
  assertUnique(name, doc, oldKey);
  sqlite.prepare(`INSERT OR REPLACE INTO ${table}(k,data) VALUES(?,?)`).run(key, JSON.stringify(doc));
  return doc;
}

class Cursor {
  constructor(name, filter, options = {}) {
    this.name = name; this.filter = filter; this.options = options;
    this._sort = null; this._skip = 0; this._limit = null;
  }
  sort(spec) { this._sort = spec; return this; }
  skip(n) { this._skip = Math.max(0, Number(n)||0); return this; }
  limit(n) { this._limit = Number(n); return this; }
  async toArray() {
    return runLocked(async () => {
      let rows = storedRows(this.name).filter(x => matches(x,this.filter));
      rows = sortDocs(rows,this._sort);
      if (this._skip) rows = rows.slice(this._skip);
      if (this._limit !== null && this._limit !== 0) rows = rows.slice(0, Math.max(0,this._limit));
      const projection = this.options?.projection;
      return rows.map(x => project(x,projection));
    });
  }
}

class Collection {
  constructor(name) { this.name = name; ensureTable(name); }
  find(filter = {}, options = {}) { return new Cursor(this.name,filter,options); }
  async findOne(filter = {}, options = {}) {
    return runLocked(async () => {
      let rows = storedRows(this.name).filter(x => matches(x,filter));
      rows = sortDocs(rows, options.sort);
      const doc = rows[0];
      return doc ? project(doc,options.projection) : null;
    });
  }
  async countDocuments(filter = {}) { return runLocked(async () => storedRows(this.name).filter(x => matches(x,filter)).length); }
  async insertOne(doc) {
    return runLocked(async () => {
      const next = clone(doc);
      if (next._id === undefined && next.id === undefined) next._id = cryptoRandomKey();
      saveDoc(this.name,next);
      return { acknowledged:true, insertedId:next._id ?? next.id };
    });
  }
  async deleteOne(filter = {}) {
    return runLocked(async () => {
      const table=ensureTable(this.name);
      const row=storedRows(this.name).find(x=>matches(x,filter));
      if(!row) return {acknowledged:true,deletedCount:0};
      sqlite.prepare(`DELETE FROM ${table} WHERE k=?`).run(keyOf(row));
      return {acknowledged:true,deletedCount:1};
    });
  }
  async deleteMany(filter = {}) {
    return runLocked(async () => {
      const table=ensureTable(this.name);
      const rows=storedRows(this.name).filter(x=>matches(x,filter));
      const stmt=sqlite.prepare(`DELETE FROM ${table} WHERE k=?`);
      for(const row of rows) stmt.run(keyOf(row));
      return {acknowledged:true,deletedCount:rows.length};
    });
  }
  async updateOne(filter, update, options = {}) {
    return runLocked(async () => {
      const rows=storedRows(this.name);
      const existing=rows.find(x=>matches(x,filter));
      if(existing){
        const next=applyUpdate(existing,update,false);
        saveDoc(this.name,next,keyOf(existing));
        return {acknowledged:true,matchedCount:1,modifiedCount:equal(existing,next)?0:1,upsertedCount:0};
      }
      if(!options.upsert) return {acknowledged:true,matchedCount:0,modifiedCount:0,upsertedCount:0};
      const seed={};
      for(const [k,v] of Object.entries(filter)) if(!k.startsWith('$') && !(v && typeof v==='object' && Object.keys(v).some(x=>x.startsWith('$')))) setPath(seed,k,v);
      const next=applyUpdate(seed,update,true);
      saveDoc(this.name,next);
      return {acknowledged:true,matchedCount:0,modifiedCount:0,upsertedCount:1,upsertedId:keyOf(next)};
    });
  }
  async updateMany(filter, update, options = {}) {
    return runLocked(async () => {
      const rows=storedRows(this.name).filter(x=>matches(x,filter));
      let modified=0;
      for(const row of rows){const next=applyUpdate(row,update,false);saveDoc(this.name,next,keyOf(row));if(!equal(row,next))modified++;}
      if(!rows.length && options.upsert){const seed={};for(const [k,v] of Object.entries(filter))if(!k.startsWith('$')&&!(v&&typeof v==='object'&&Object.keys(v).some(x=>x.startsWith('$'))))setPath(seed,k,v);saveDoc(this.name,applyUpdate(seed,update,true));return {acknowledged:true,matchedCount:0,modifiedCount:0,upsertedCount:1};}
      return {acknowledged:true,matchedCount:rows.length,modifiedCount:modified,upsertedCount:0};
    });
  }
  async findOneAndUpdate(filter, update, options = {}) {
    return runLocked(async () => {
      const rows=storedRows(this.name);
      const existing=rows.find(x=>matches(x,filter));
      if(!existing){
        if(!options.upsert) return null;
        const seed={};
        for(const [k,v] of Object.entries(filter)) if(!k.startsWith('$') && !(v && typeof v==='object' && Object.keys(v).some(x=>x.startsWith('$')))) setPath(seed,k,v);
        const next=applyUpdate(seed,update,true); saveDoc(this.name,next);
        return options.returnDocument==='after' ? clone(next) : null;
      }
      const next=applyUpdate(existing,update,false); saveDoc(this.name,next,keyOf(existing));
      return options.returnDocument==='before' ? clone(existing) : clone(next);
    });
  }
  async replaceOne(filter, replacement, options = {}) {
    return runLocked(async () => {
      const existing=storedRows(this.name).find(x=>matches(x,filter));
      const next=clone(replacement);
      if(existing && next._id === undefined && existing._id !== undefined) next._id=existing._id;
      if(existing){saveDoc(this.name,next,keyOf(existing));return {acknowledged:true,matchedCount:1,modifiedCount:1,upsertedCount:0};}
      if(options.upsert){saveDoc(this.name,next);return {acknowledged:true,matchedCount:0,modifiedCount:0,upsertedCount:1};}
      return {acknowledged:true,matchedCount:0,modifiedCount:0,upsertedCount:0};
    });
  }
}

class DatabaseAdapter {
  collection(name) { return new Collection(name); }
  async command(command) { if(command?.ping) return {ok:1}; return {ok:1}; }
}

const db = new DatabaseAdapter();

export function isSqliteConfigured() { return true; }
export async function getMongoClient() { return { close: async () => {} }; }
export async function getMongoDb() { return db; }
export async function pingMongo() { return true; }

export async function ensureMongoSchema() {
  for (const name of Object.keys(UNIQUE_FIELDS)) ensureTable(name);
  ensureTable('meta');
  const meta = db.collection('meta');
  await meta.updateOne({_id:'schema'},{$set:{version:8,storage:'sqlite',updatedAt:new Date().toISOString()}},{upsert:true});
  await db.collection('sessions').deleteMany({expiresAt:{$lte:new Date()}});
  await db.collection('rateLimits').deleteMany({expiresAt:{$lte:new Date()}});
  await db.collection('chatMessages').deleteMany({expiresAt:{$lte:new Date()}});
  return db;
}

export async function withMongoTransaction(work) {
  return serial(async () => {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      return await txStore.run({ active:true }, async () => {
        try {
          const result = await work(null,db);
          sqlite.exec('COMMIT');
          return result;
        } catch (error) {
          try { sqlite.exec('ROLLBACK'); } catch {}
          throw error;
        }
      });
    } catch (error) {
      try { if (sqlite.inTransaction) sqlite.exec('ROLLBACK'); } catch {}
      throw error;
    }
  });
}

export async function closeMongo() {
  try { sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch {}
  try { sqlite.close(); } catch {}
}

export const getSqliteDb = getMongoDb;
