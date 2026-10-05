import crypto from 'crypto';
import { getMongoDb } from './mongo-store.js';

export const CHAT_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 500;
const MAX_FETCH = 100;

function normalizeMessage(value) {
  return String(value || '').trim().slice(0, MAX_MESSAGE_LENGTH);
}

function publicChatMessage(doc) {
  return {
    id: doc.id,
    userId: doc.userId,
    username: doc.username,
    message: doc.message,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
  };
}

export async function saveChatMessage({ userId, username, message }) {
  const text = normalizeMessage(message);
  if (!text) {
    const error = new Error('message_required');
    error.code = 'MESSAGE_REQUIRED';
    throw error;
  }

  const now = new Date();
  const doc = {
    id: crypto.randomUUID(),
    userId,
    username: String(username || '').slice(0, 32),
    message: text,
    createdAt: now,
    expiresAt: new Date(now.getTime() + CHAT_RETENTION_MS),
  };

  const db = await getMongoDb();
  await db.collection('chatMessages').insertOne(doc);
  return publicChatMessage(doc);
}

export async function getRecentChat(limit = 50) {
  const db = await getMongoDb();
  const safeLimit = Math.min(MAX_FETCH, Math.max(1, Number(limit) || 50));
  const now = new Date();
  const docs = await db.collection('chatMessages')
    .find({ expiresAt: { $gt: now } })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .toArray();

  return docs.reverse().map(publicChatMessage);
}

export async function deleteExpiredChat() {
  const db = await getMongoDb();
  const result = await db.collection('chatMessages').deleteMany({ expiresAt: { $lte: new Date() } });
  return result.deletedCount || 0;
}


export async function getLiveBets(limit = 50) {
  const db = await getMongoDb();
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const rows = await db.collection('ledger')
    .find({ type: 'BET', currency: 'DL', amountWl: { $lt: 0 } })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .toArray();
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    username: row.username,
    gameId: row.metadata?.gameId || 'unknown',
    amountDls: Math.abs(Number(row.amountDls ?? row.amountWl / 100)),
    createdAt: row.createdAt,
  }));
}

export async function getHighRollers(limit = 20) {
  const bets = await getLiveBets(100);
  return bets
    .filter((bet) => bet.amountDls >= 100)
    .sort((a, b) => b.amountDls - a.amountDls)
    .slice(0, Math.min(20, Math.max(1, Number(limit) || 20)));
}

export function installChatRoutes(app, { sessionUser, broadcast }) {
  app.get('/api/social/chat', async (req, res) => {
    const user = await sessionUser(req).catch(() => null);
    if (!user) return res.status(401).json({ ok: false, error: 'not_authenticated' });
    if (user.isBanned) return res.status(403).json({ ok: false, error: 'account_banned' });

    try {
      res.json({ ok: true, retentionHours: 24, messages: await getRecentChat(req.query.limit) });
    } catch {
      res.status(500).json({ ok: false, error: 'chat_unavailable' });
    }
  });

  app.get('/api/social/live-bets', async (req, res) => {
    const user = await sessionUser(req).catch(() => null);
    if (!user) return res.status(401).json({ ok: false, error: 'not_authenticated' });
    try { res.json({ ok: true, bets: await getLiveBets(req.query.limit) }); }
    catch { res.status(500).json({ ok: false, error: 'live_bets_unavailable' }); }
  });

  app.get('/api/social/high-rollers', async (req, res) => {
    const user = await sessionUser(req).catch(() => null);
    if (!user) return res.status(401).json({ ok: false, error: 'not_authenticated' });
    try { res.json({ ok: true, players: await getHighRollers(req.query.limit) }); }
    catch { res.status(500).json({ ok: false, error: 'high_rollers_unavailable' }); }
  });

  app.post('/api/social/chat', async (req, res) => {
    const user = await sessionUser(req).catch(() => null);
    if (!user) return res.status(401).json({ ok: false, error: 'not_authenticated' });
    if (user.isBanned || user.isMuted) return res.status(403).json({ ok: false, error: user.isMuted ? 'account_muted' : 'account_banned' });

    try {
      const item = await saveChatMessage({ userId: user.id, username: user.username, message: req.body?.message });
      if (typeof broadcast === 'function') broadcast({ type: 'CHAT_MESSAGE', payload: item });
      res.status(201).json({ ok: true, message: item });
    } catch (error) {
      if (error.code === 'MESSAGE_REQUIRED') return res.status(400).json({ ok: false, error: error.code });
      res.status(500).json({ ok: false, error: 'chat_unavailable' });
    }
  });
}

export function startChatRetentionWorker({ intervalMs = 60 * 60 * 1000 } = {}) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await deleteExpiredChat(); } catch (error) { console.error('[Social] chat cleanup failed:', error); }
    finally { running = false; }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
