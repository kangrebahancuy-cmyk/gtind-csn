import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { installEconomyRoutes, unlinkGrowId } from './server/economy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Enable JSON body parsing
app.use(express.json());

// Health check endpoint for Render.com
app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    server: 'Supreme Casino',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
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
});

// In-memory registered link codes from website accounts (code -> { username, code, growId, timestamp })
const registeredLinkCodes = new Map();
const linkedGrowIds = new Map(); // code -> growId

app.post('/api/gtps/register-code', (req, res) => {
  const { username, code, growId } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  const cleanCode = String(code).trim();
  registeredLinkCodes.set(cleanCode, {
    username: username || 'User',
    code: cleanCode,
    growId: growId || null,
    timestamp: Date.now(),
  });

  res.json({ success: true, code: cleanCode, registered: true });
});

// Lua menanyakan status kode saat player /link <kode>.
// registered:true + username dipakai Lua untuk menamai akun casino di sisi game.
app.get('/api/gtps/check-link', (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!code) return res.json({ linked: false });

  // 1. Sudah pernah link (webhook dari Lua pernah masuk)
  if (linkedGrowIds.has(code)) {
    const growId = linkedGrowIds.get(code);
    return res.json({ linked: true, growId, code });
  }

  // 2. Kode terdaftar dari akun web -> kirim username-nya ke Lua
  const reg = registeredLinkCodes.get(code);
  if (reg) {
    return res.json({ linked: false, registered: true, username: reg.username, code });
  }

  res.json({ linked: false, code });
});

app.post('/api/gtps/link-growid', (req, res) => {
  const { growid, code } = req.body;
  const cleanCode = String(code || '').trim();
  const cleanGrowId = String(growid || '').trim();
  console.log(`[GTPS Link] GrowID ${cleanGrowId} linked with code ${cleanCode}`);

  if (cleanCode && cleanGrowId) {
    linkedGrowIds.set(cleanCode, cleanGrowId);
  }

  broadcast({
    type: 'GTPS_LINK',
    payload: { growId: cleanGrowId, code: cleanCode, timestamp: Date.now() },
  });

  res.json({ success: true, growId: cleanGrowId, code: cleanCode });
});

app.get('/api/gtps/balance/:growid', (req, res) => {
  res.json({ success: true, growId: req.params.growid, status: 'active' });
});

// Player /unlink di game -> lepas link di sisi web juga
app.post('/api/gtps/unlink', (req, res) => {
  const { growid, secretKey } = req.body;
  if (secretKey !== gtpsConfig.secretKey) {
    return res.status(403).json({ error: 'Invalid secret key' });
  }
  const cleanGrowId = String(growid || '').trim();
  if (!cleanGrowId) return res.status(400).json({ error: 'growid required' });

  for (const [code, gid] of Array.from(linkedGrowIds.entries())) {
    if (String(gid).toLowerCase() === cleanGrowId.toLowerCase()) {
      linkedGrowIds.delete(code);
    }
  }

  broadcast({ type: 'GTPS_UNLINK', payload: { growId: cleanGrowId, timestamp: Date.now() } });
  console.log(`[GTPS Unlink] ${cleanGrowId} unlinked from in-game`);
  res.json({ success: true, growId: cleanGrowId });
});

// Tombol Unlink di wallet web -> lepas link web + bridge ke Lua
// Validasi: kode link harus terdaftar (kode di-re-register tiap wallet dibuka),
// jadi unlink tetap jalan meski cache link di memori hilang setelah restart.
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
      } else if (message.type === 'LIVE_BET') {
        const betItem = message.payload;
        liveBetsHistory.unshift(betItem);
        if (liveBetsHistory.length > MAX_HISTORY) liveBetsHistory.pop();
        broadcast({ type: 'LIVE_BET', payload: betItem });
      } else if (message.type === 'BATTLE_CREATE') {
        const battle = message.payload;
        activeBattles.unshift(battle);
        broadcast({ type: 'BATTLE_CREATED', payload: battle });
      } else if (message.type === 'BATTLE_UPDATE') {
        const updated = message.payload;
        const idx = activeBattles.findIndex((b) => b.id === updated.id);
        if (idx !== -1) {
          activeBattles[idx] = updated;
        } else {
          activeBattles.unshift(updated);
        }
        broadcast({ type: 'BATTLE_UPDATED', payload: updated });
      }
    } catch (err) {
      console.error('WS parse error:', err);
    }
  });
});

// SPA fallback: send index.html for any client-side routes
app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`[Supreme Casino] Server running on port ${PORT}`);
  console.log(`[Supreme Casino] Healthcheck: http://localhost:${PORT}/healthz`);
});
