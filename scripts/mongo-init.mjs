import { ensureMongoSchema, pingMongo, closeMongo } from '../server/mongo-store.js';
try {
  await pingMongo();
  await ensureMongoSchema();
  console.log('MongoDB Atlas connection OK and GTIND-CSN schema/indexes are ready.');
} catch (error) {
  console.error('MongoDB Atlas initialization failed:', error);
  process.exitCode = 1;
} finally {
  await closeMongo();
}
