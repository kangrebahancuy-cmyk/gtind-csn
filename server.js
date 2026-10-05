import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

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

let gtpsConfig = {
  secretKey: 'supreme_gtps_secret_auth_token_25741',
  status: 'online',
  activeSyncCount: 0,
};

// GTPS API Endpoints
app.get('/api/gtps/status', (req, res) => {
  res.json({
    status: gtpsConfig.status,
    syncCount: gtpsConfig.activeSyncCount,
  });
});

app.post('/api/gtps/deposit-webhook', (req, res) => {
  const { growId, currency, amount, secretKey } = req.body;
  if (secretKey !== gtpsConfig.secretKey) {
    return res.status(403).json({ error: 'Invalid secret key' });
  }
  console.log(`[GTPS Deposit] Received ${amount} ${currency} from ${growId}`);
  gtpsConfig.activeSyncCount++;

  // Broadcast deposit notification to all connected clients
  broadcast({
    type: 'GTPS_DEPOSIT',
    payload: {
      growId: growId || 'Unknown',
      currency: currency || 'BGL',
      amount: Number(amount) || 0,
      timestamp: Date.now(),
    },
  });

  res.json({ success: true, growId, currency, amount });
});

app.post('/api/gtps/withdraw-webhook', (req, res) => {
  const { growId, currency, amount, secretKey } = req.body;
  if (secretKey !== gtpsConfig.secretKey) {
    return res.status(403).json({ error: 'Invalid secret key' });
  }
  console.log(`[GTPS Withdraw] Requested ${amount} ${currency} for ${growId}`);
  gtpsConfig.activeSyncCount++;

  res.json({ success: true, growId, currency, amount, status: 'dispatched' });
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

  // Forward to GTPS Server HTTP Router on port 25741 if available
  const payload = JSON.stringify({
    users: [{ username: username || 'User', code: cleanCode, linkedGrowId: growId || null }],
  });

  fetch(`http://127.0.0.1:${gtpsConfig.port}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  }).catch(() => {});

  res.json({ success: true, code: cleanCode, registered: true });
});

app.get('/api/gtps/check-link', async (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!code) return res.json({ linked: false });

  // 1. Check local cache
  if (linkedGrowIds.has(code)) {
    const growId = linkedGrowIds.get(code);
    return res.json({ linked: true, growId, code });
  }

  // 2. Poll GTPS Server on port 25741
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const gtpsRes = await fetch(`http://127.0.0.1:${gtpsConfig.port}/`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (gtpsRes.ok) {
      const data = await gtpsRes.json();
      if (Array.isArray(data.pendingLinks)) {
        for (const link of data.pendingLinks) {
          if (String(link.code).trim() === code && link.growId) {
            linkedGrowIds.set(code, link.growId);
            broadcast({
              type: 'GTPS_LINK',
              payload: { growId: link.growId, code, timestamp: Date.now() },
            });
            return res.json({ linked: true, growId: link.growId, code });
          }
        }
      }
      if (data.websiteUsers && data.websiteUsers[code] && data.websiteUsers[code].linkedGrowId) {
        const growId = data.websiteUsers[code].linkedGrowId;
        linkedGrowIds.set(code, growId);
        broadcast({
          type: 'GTPS_LINK',
          payload: { growId, code, timestamp: Date.now() },
        });
        return res.json({ linked: true, growId, code });
      }
    }
  } catch (err) {}

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

// Periodic sync: Push all website codes to GTPS Server every 3 seconds
setInterval(async () => {
  if (registeredLinkCodes.size === 0) return;
  const userList = [];
  for (const [code, item] of registeredLinkCodes.entries()) {
    userList.push({
      username: item.username,
      code: item.code,
      linkedGrowId: linkedGrowIds.get(code) || item.growId || null,
    });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`http://127.0.0.1:${gtpsConfig.port}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users: userList }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.pendingLinks)) {
        for (const link of data.pendingLinks) {
          const lCode = String(link.code).trim();
          if (lCode && link.growId && !linkedGrowIds.has(lCode)) {
            linkedGrowIds.set(lCode, link.growId);
            console.log(`[GTPS Poller] Detected in-game link: ${link.growId} with code ${lCode}`);
            broadcast({
              type: 'GTPS_LINK',
              payload: { growId: link.growId, code: lCode, timestamp: Date.now() },
            });
          }
        }
      }
    }
  } catch (e) {}
}, 3000);

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
