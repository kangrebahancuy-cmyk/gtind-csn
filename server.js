import express from 'express';
import http from 'http';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { installEconomyRoutes, sessionUser, debitForGame, creditGameResult } from './server/economy.js';
import { ensureMongoSchema, pingMongo, closeMongo } from './server/mongo-store.js';
import { installGameRoutes } from './server/games.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Enable JSON body parsing
app.use(express.json({ limit: '64kb' }));
app.disable('x-powered-by');
app.use((req,res,next)=>{
  const requestId=String(req.headers['x-request-id']||'').slice(0,128) || crypto.randomUUID();
  res.setHeader('X-Request-Id',requestId);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  if(req.secure || String(req.headers['x-forwarded-proto']||'').includes('https')) res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  next();
});

// Health check endpoint for Render.com
app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    server: 'Supreme Casino',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/readyz', async (req,res) => {
  try {
    await pingMongo();
    res.json({status:'ready',storage:'mongodb_atlas',timestamp:new Date().toISOString()});
  } catch (error) {
    res.status(503).json({status:'not_ready',error:'persistent_store_unavailable'});
  }
});

// Serve Vite production build from dist/
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// In-memory real-time state for live chat & bets & GTPS
const MAX_HISTORY = 100;
const liveChatHistory = [];
const liveBetsHistory = [];
const activeBattles = [];

const gtpsConfig = {
  secretKey: process.env.GTPS_WEBHOOK_SECRET || '',
  status: 'online',
  activeSyncCount: 0,
};

// Bridge ke Lua onHTTPRequest di server GTPS gtps.cloud.
// Ganti lewat env GTPS_PORT kalau port server berubah.
const GTPS_BRIDGE_PORT = process.env.GTPS_PORT || 18876;
const GTPS_BRIDGE_URL = `https://api.gtps.cloud/g-api/${GTPS_BRIDGE_PORT}`;

// GTPS API Endpoints
app.get('/api/gtps/status', (req, res) => {
  res.json({
    status: gtpsConfig.status,
    syncCount: gtpsConfig.activeSyncCount,
  });
});

installEconomyRoutes(app, {
  gtpsBridgeUrl: GTPS_BRIDGE_URL,
  getGtpsSecret: () => gtpsConfig.secretKey,
  broadcast,
});

installGameRoutes(app, { sessionUser, debitForGame, creditGameResult }, { broadcast });

// Real-Time WebSocket Server
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(data, excludeWs = null) {
  const payload = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  // Send initial real state upon connecting
  ws.send(
    JSON.stringify({
      type: 'INIT_STATE',
      payload: {
        chatHistory: liveChatHistory.slice(-50),
        liveBets: liveBetsHistory.slice(0, 30),
        activeBattles: activeBattles.filter((b) => b.status === 'open'),
      },
    })
  );

  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());

      if (message.type === 'CHAT_MESSAGE') {
        const chatItem = message.payload;
        liveChatHistory.push(chatItem);
        if (liveChatHistory.length > MAX_HISTORY) liveChatHistory.shift();
        broadcast({ type: 'CHAT_MESSAGE', payload: chatItem });
      } else if (message.type === 'LIVE_BET' || message.type === 'BATTLE_CREATE' || message.type === 'BATTLE_UPDATE') {
        // Server-authoritative realtime feeds cannot be injected by clients.
        ws.send(JSON.stringify({ type:'ERROR', payload:{ error:'server_authoritative_event' } }));
    } catch (err) {
      console.error('WS parse error:', err);
    }
  });
});

// SPA fallback: send index.html for any client-side routes
app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const shutdown = (signal) => { console.log(`[Supreme Casino] ${signal} received; shutting down`); server.close(async () => { await closeMongo().catch(()=>{}); process.exit(0); }); setTimeout(() => process.exit(1), 10000).unref(); };
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

(async () => {
  try {
    await ensureMongoSchema();
    server.listen(PORT, () => {
      console.log(`[Supreme Casino] Server running on port ${PORT}`);
      console.log(`[Supreme Casino] Healthcheck: http://localhost:${PORT}/healthz`);
    });
  } catch (error) {
    console.error('[Supreme Casino] MongoDB Atlas initialization failed:', error);
    process.exitCode = 1;
  }
})();
