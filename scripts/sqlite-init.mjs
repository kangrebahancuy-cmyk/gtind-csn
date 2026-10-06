import { ensureMongoSchema } from '../server/mongo-store.js';

await ensureMongoSchema();
console.log('GTIND-CSN SQLite database initialized.');
console.log('Database: ' + (process.env.SQLITE_DB_PATH || './data/gtind-csn.sqlite'));
