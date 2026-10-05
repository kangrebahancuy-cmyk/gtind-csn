import crypto from 'crypto';
import { loadEconomyState, saveEconomyState, createPersistentSession, getPersistentSession, deletePersistentSession, prunePersistentSessions } from './economy-store.js';
prunePersistentSessions();
const rateBuckets = new Map();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY_AMOUNT = 100000000;
function constantTimeEqual(a,b) { const aa=Buffer.from(String(a)); const bb=Buffer.from(String(b)); return aa.length===bb.length && crypto.timingSafeEqual(aa,bb); }
function rateLimit(key, limit=30, windowMs=60000) { const nowMs=Date.now(); const row=rateBuckets.get(key); if(!row || nowMs-row.start>=windowMs){rateBuckets.set(key,{start:nowMs,count:1});return true;} row.count++; return row.count<=limit; }
function clientIp(req) { return String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim(); }
function audit(db, actor, action, metadata={}) { db.auditLogs ||= []; db.auditLogs.push({id:id('audit'),actorUserId:actor?.id||null,actorUsername:actor?.username||null,action,metadata,createdAt:now()}); if(db.auditLogs.length>10000) db.auditLogs=db.auditLogs.slice(-10000); }
function verifyGtpsRequest(req, getGtpsSecret, body={}) { const secret=String(getGtpsSecret?.()||''); const legacy=String(body.secretKey||req.headers['x-gtps-secret']||''); if(secret && legacy && constantTimeEqual(secret,legacy)) return true; const ts=String(req.headers['x-gtps-timestamp']||''); const sig=String(req.headers['x-gtps-signature']||''); const n=Number(ts); if(!secret||!sig||!Number.isFinite(n)||Math.abs(Date.now()-n)>300000) return false; const raw=JSON.stringify(body); const expected=crypto.createHmac('sha256',secret).update(`${ts}.${raw}`).digest('hex'); return constantTimeEqual(expected,sig); }

function now() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`; }

function load() {
  const db = loadEconomyState();
  const adminUsername = String(process.env.ADMIN_USERNAME || '').trim();
  const adminPassword = String(process.env.ADMIN_PASSWORD || '');
  if (adminUsername && adminPassword && !db.users.some(u => normalizeUsername(u.username) === normalizeUsername(adminUsername))) {
    db.users.push({
      id:id('usr'), username:adminUsername, passwordHash:hashPassword(adminPassword),
      balanceDls:0, linkCode:uniqueLinkCode(db), isBanned:false, isMuted:false,
      isAdmin:true, createdAt:now()
    });
    save(db);
  }
  return db;
}
function save(db) {
  saveEconomyState(db);
}
function normalizeUsername(v) { return String(v || '').trim().toLowerCase(); }
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, growId: u.growId || undefined,
    gtpsLinked: Boolean(u.gtpsLinked && u.growId),
    balanceDls: Number(u.balanceDls || 0),
    linkCode: u.linkCode, isBanned: Boolean(u.isBanned),
    isMuted: Boolean(u.isMuted), isAdmin: Boolean(u.isAdmin),
  };
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
function uniqueLinkCode(db) {
  let code;
  do code = String(crypto.randomInt(100000, 1000000)); while (db.users.some(u => u.linkCode === code));
  return code;
}
function findUser(db, username) {
  const key = normalizeUsername(username);
  return db.users.find(u => normalizeUsername(u.username) === key);
}
function createTransaction(db, user, type, amount, before, after, referenceId, metadata = {}) {
  db.transactions.push({
    id: id('txn'), userId: user.id, username: user.username, type,
    amountDls: Number(amount.toFixed(2)), balanceBefore: Number(before.toFixed(2)),
    balanceAfter: Number(after.toFixed(2)), referenceId: referenceId || null,
    metadata, createdAt: now()
  });
}
function mutateBalance(db, user, delta, type, referenceId, metadata = {}) {
  const before = Number(user.balanceDls || 0);
  const after = Number((before + delta).toFixed(2));
  if (after < 0) throw new Error('insufficient_balance');
  user.balanceDls = after;
  createTransaction(db, user, type, delta, before, after, referenceId, metadata);
  return after;
}
export function sessionUser(req) {
  const token = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('gtind_session='));
  const value = token ? decodeURIComponent(token.slice('gtind_session='.length)) : '';
  if (!value) return null;
  const session = getPersistentSession(value);
  if (!session) return null;
  const userId = session.userId;
  const db = load();
  return db.users.find(u => u.id === userId) || null;
}
function createSession(_db,user) { return createPersistentSession(user.id,SESSION_TTL_MS).token; }
function sessionCookie(req, token, maxAge=SESSION_TTL_MS/1000) { const secure=String(req.headers['x-forwarded-proto']||'').includes('https') ? '; Secure' : ''; return `gtind_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge)}${secure}`; }
function destroySession(req) { const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('gtind_session=')); if(raw) deletePersistentSession(decodeURIComponent(raw.slice('gtind_session='.length))); }
function requireAuth(req, res) {
  const user = sessionUser(req);
  if (!user) { res.status(401).json({ ok: false, error: 'not_authenticated' }); return null; }
  if (user.isBanned) { res.status(403).json({ ok: false, error: 'account_banned' }); return null; }
  return user;
}
function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!user.isAdmin) { res.status(403).json({ ok: false, error: 'admin_required' }); return null; }
  return user;
}

export function linkGrowIdByCode(code, growId) {
  const cleanCode = String(code || '').trim();
  const cleanGrowId = String(growId || '').trim();
  if (!cleanCode || !cleanGrowId) return null;
  const db = load();
  const user = db.users.find(u => u.linkCode === cleanCode);
  if (!user) return null;
  user.growId = cleanGrowId;
  user.gtpsLinked = true;
  save(db);
  return publicUser(user);
}

export function unlinkGrowId(growId) {
  const clean = String(growId || '').trim().toLowerCase();
  if (!clean) return null;
  const db = load();
  const user = db.users.find(u => String(u.growId || '').toLowerCase() === clean);
  if (!user) return null;
  user.growId = undefined;
  user.gtpsLinked = false;
  save(db);
  return publicUser(user);
}

export function debitForGame(userId, amount, gameId) {
  const db=load(); const user=db.users.find(u=>u.id===userId);
  if(!user) return {ok:false,error:'user_not_found'};
  const n=Number(amount);
  if(!Number.isFinite(n)||n<=0||user.balanceDls<n) return {ok:false,error:'insufficient_balance'};
  const ref=id('bet');
  mutateBalance(db,user,-n,'BET',ref,{gameId});
  save(db);
  return {ok:true,balance:user.balanceDls,referenceId:ref};
}
export function creditGameResult(userId, amount, round) {
  const db=load(); const user=db.users.find(u=>u.id===userId);
  if(!user) return {ok:false};
  const n=Number(amount||0);
  const existing=db.transactions.find(t=>t.userId===userId && t.type==='GAME_PAYOUT' && t.referenceId===round.id);
  if(existing) return {ok:true,balance:user.balanceDls,duplicate:true};
  if(n>0) mutateBalance(db,user,n,'GAME_PAYOUT',round.id,{gameId:round.gameId,multiplier:round.result?.multiplier||0});
  save(db);
  return {ok:true,balance:user.balanceDls};
}

export function installEconomyRoutes(app, { gtpsBridgeUrl, getGtpsSecret, broadcast }) {
  app.get('/api/auth/me', (req, res) => {
    const user = sessionUser(req);
    res.json({ ok: true, authenticated: Boolean(user), user: publicUser(user) });
  });

  app.post('/api/auth/register', (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const growId = String(req.body?.growId || '').trim();
    if (!rateLimit(`register:${clientIp(req)}`,5,3600000)) return res.status(429).json({ok:false,error:'rate_limited'});
    if (username.length < 4 || username.length > 24) return res.status(400).json({ ok:false, error:'invalid_username' });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ ok:false, error:'invalid_password' });
    const db = load();
    if (findUser(db, username)) return res.status(409).json({ ok:false, error:'username_taken' });
    const user = {
      id: id('usr'), username, passwordHash: hashPassword(password),
      growId: growId || undefined, gtpsLinked: false, balanceDls: 0,
      linkCode: uniqueLinkCode(db), isBanned: false, isMuted: false,
      isAdmin: false, createdAt: now()
    };
    db.users.push(user);
    save(db);
    const token = createSession(db,user);
    res.setHeader('Set-Cookie', sessionCookie(req,token));
    res.json({ ok:true, user:publicUser(user) });
  });

  app.post('/api/auth/login', (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!rateLimit(`login:${clientIp(req)}`,10,60000)) return res.status(429).json({ok:false,error:'rate_limited'});
    const db = load();
    const user = findUser(db, username);
    if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ ok:false, error:'invalid_credentials' });
    if (user.isBanned) return res.status(403).json({ ok:false, error:'account_banned' });
    const token = createSession(db,user);
    res.setHeader('Set-Cookie', sessionCookie(req, token));
    res.json({ ok:true, user:publicUser(user) });
  });

  app.post('/api/auth/logout', (req, res) => {
    destroySession(req);
    res.setHeader('Set-Cookie', 'gtind_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ ok:true });
  });

  // One-time migration path for accounts that existed only in the old localStorage economy.
  app.post('/api/auth/migrate', (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const growId = String(req.body?.growId || '').trim();
    const legacyBalance = Number(req.body?.balanceDls || 0);
    if (username.length < 4 || password.length < 8) return res.status(400).json({ok:false,error:'invalid_credentials'});
    const db = load();
    if (findUser(db, username)) return res.status(409).json({ok:false,error:'already_migrated'});
    const user = {
      id:id('usr'), username, passwordHash:hashPassword(password), growId:growId || undefined,
      gtpsLinked:Boolean(growId), balanceDls:0, linkCode:uniqueLinkCode(db),
      isBanned:false,isMuted:false,isAdmin:false,createdAt:now()
    };
    db.users.push(user);
    if (legacyBalance > 0) {
      // Legacy browser balances are NOT trusted as real deposits.
      createTransaction(db,user,'LEGACY_BALANCE_IGNORED',0,0,0,null,{ legacyBalance });
    }
    save(db);
    const token=createSession(db,user);
    res.setHeader('Set-Cookie',sessionCookie(req,token));
    res.json({ok:true,user:publicUser(user),legacyBalanceIgnored:legacyBalance});
  });

  app.post('/api/account/unlink-growid', (req,res) => {
    const user=requireAuth(req,res); if(!user)return;
    const db=load(); const fresh=db.users.find(u=>u.id===user.id);
    if(!fresh?.growId) return res.status(400).json({ok:false,error:'not_linked'});
    fresh.growId=undefined; fresh.gtpsLinked=false; save(db);
    res.json({ok:true,user:publicUser(fresh)});
  });

  app.post('/api/account/growid', (req,res) => {
    const user=requireAuth(req,res); if(!user)return;
    const growId=String(req.body?.growId||'').trim();
    if(!growId) return res.status(400).json({ok:false,error:'invalid_growid'});
    const db=load(); const fresh=db.users.find(u=>u.id===user.id);
    const collision=db.users.find(u=>u.id!==fresh.id && String(u.growId||'').toLowerCase()===growId.toLowerCase());
    if(collision) return res.status(409).json({ok:false,error:'growid_already_linked'});
    fresh.growId=growId; fresh.gtpsLinked=true; save(db);
    res.json({ok:true,user:publicUser(fresh)});
  });

  app.post('/api/gtps/register-code', (req,res) => {
    const username=String(req.body?.username||'').trim();
    const code=String(req.body?.code||'').trim();
    if(!username || !code) return res.status(400).json({ok:false,error:'invalid_link_code'});
    const db=load(); const user=findUser(db,username);
    if(!user || user.linkCode!==code) return res.status(403).json({ok:false,error:'invalid_link_code'});
    res.json({ok:true,code,registered:true,username:user.username,growId:user.growId||null});
  });

  app.get('/api/gtps/check-link', (req,res) => {
    const code=String(req.query.code||'').trim();
    const db=load(); const user=db.users.find(u=>u.linkCode===code);
    if(!user) return res.json({linked:false,code});
    res.json({linked:Boolean(user.gtpsLinked&&user.growId),growId:user.growId||null,registered:true,username:user.username,code});
  });

  app.post('/api/gtps/link-growid', (req,res) => {
    const secret=String(req.body?.secretKey||req.headers['x-gtps-secret']||'');
    if(!constantTimeEqual(secret,getGtpsSecret())) return res.status(403).json({ok:false,error:'invalid_secret_key'});
    if(!rateLimit(`gtps-link:${clientIp(req)}`,30,60000)) return res.status(429).json({ok:false,error:'rate_limited'});
    const code=String(req.body?.code||'').trim(); const growId=String(req.body?.growid||'').trim();
    if(!code || !growId) return res.status(400).json({ok:false,error:'invalid_link'});
    const db=load(); const user=db.users.find(u=>u.linkCode===code);
    if(!user) return res.status(404).json({ok:false,error:'invalid_link_code'});
    const collision=db.users.find(u=>u.id!==user.id && String(u.growId||'').toLowerCase()===growId.toLowerCase());
    if(collision) return res.status(409).json({ok:false,error:'growid_already_linked'});
    user.growId=growId; user.gtpsLinked=true; save(db);
    res.json({ok:true,success:true,growId,code,user:publicUser(user)});
  });

  app.post('/api/gtps/unlink', (req,res) => {
    const secret=String(req.body?.secretKey||req.headers['x-gtps-secret']||'');
    if(!secret || secret!==getGtpsSecret()) return res.status(403).json({ok:false,error:'invalid_secret_key'});
    const result=unlinkGrowId(req.body?.growid);
    res.json({ok:true,success:true,growId:req.body?.growid,found:Boolean(result)});
  });

  app.get('/api/economy/wallet', (req,res) => {
    const user=requireAuth(req,res); if(!user)return;
    res.json({ok:true,user:publicUser(user)});
  });

  app.post('/api/economy/tip', (req,res) => {
    const user=requireAuth(req,res); if(!user)return;
    const target=String(req.body?.targetUser || '').trim();
    const amount=Number(req.body?.amountDls);
    const message=String(req.body?.message || '').slice(0,200);
    if(!target || !Number.isFinite(amount) || amount<=0) return res.status(400).json({ok:false,error:'invalid_tip'});
    const db=load(); const sender=findUser(db,user.username); const recipient=findUser(db,target);
    if(!recipient) return res.status(404).json({ok:false,error:'recipient_not_found'});
    if(sender.id===recipient.id) return res.status(400).json({ok:false,error:'self_tip'});
    if(sender.balanceDls < amount) return res.status(400).json({ok:false,error:'insufficient_balance'});
    const ref=id('tip');
    mutateBalance(db,sender,-amount,'TIP_SEND',ref,{recipient:recipient.username,message});
    mutateBalance(db,recipient,amount,'TIP_RECEIVE',ref,{sender:sender.username,message});
    save(db);
    res.json({ok:true,user:publicUser(sender),recipient:publicUser(recipient),amountDls:amount});
  });

  app.post('/api/admin/balance', (req,res) => {
    const admin=requireAdmin(req,res); if(!admin)return;
    const username=String(req.body?.username||'').trim(); const amount=Number(req.body?.amountDls); const mode=req.body?.mode;
    if(!username || !Number.isFinite(amount) || amount<=0 || !['add','remove'].includes(mode)) return res.status(400).json({ok:false,error:'invalid_request'});
    const db=load(); const user=findUser(db,username); if(!user)return res.status(404).json({ok:false,error:'user_not_found'});
    const delta=mode==='add'?amount:-amount;
    if(delta<0 && user.balanceDls<amount)return res.status(400).json({ok:false,error:'insufficient_balance'});
    mutateBalance(db,user,delta,'ADMIN_ADJUSTMENT',id('admin'),{admin:admin.username,mode});
    save(db);
    res.json({ok:true,user:publicUser(user)});
  });

  app.post('/api/admin/status', (req,res) => {
    const admin=requireAdmin(req,res); if(!admin)return;
    const username=String(req.body?.username||'').trim(); const field=req.body?.field;
    if(!username || !['isBanned','isMuted'].includes(field)) return res.status(400).json({ok:false,error:'invalid_request'});
    const db=load(); const user=findUser(db,username); if(!user)return res.status(404).json({ok:false,error:'user_not_found'});
    user[field]=!Boolean(user[field]); save(db);
    res.json({ok:true,user:publicUser(user)});
  });

  app.get('/api/admin/users', (req,res) => {
    const admin=requireAdmin(req,res); if(!admin)return;
    const db=load();
    res.json({ok:true,users:db.users.map(publicUser)});
  });

  app.post('/api/gtps/deposit-webhook', (req,res) => {
    const secret=String(req.body?.secretKey || req.headers['x-gtps-secret'] || '');
    if(!secret || secret!==getGtpsSecret()) return res.status(403).json({ok:false,error:'invalid_secret_key'});
    const transactionId=String(req.body?.transactionId || '').trim();
    const growId=String(req.body?.growId || '').trim();
    const currency=String(req.body?.currency || 'DL').toUpperCase();
    const amount=Number(req.body?.amount);
    if(!transactionId || !growId || !Number.isFinite(amount) || amount<=0 || amount>MAX_BODY_AMOUNT) return res.status(400).json({ok:false,error:'invalid_deposit'});
    const db=load();
    const existing=db.deposits.find(d=>d.transactionId===transactionId);
    if(existing) return res.json({ok:true,duplicate:true,deposit:existing});
    const user=db.users.find(u=>String(u.growId||'').toLowerCase()===growId.toLowerCase());
    if(!user) return res.status(404).json({ok:false,error:'growid_not_linked'});
    if(!['DL','WL','BGL'].includes(currency)) return res.status(400).json({ok:false,error:'invalid_currency'});
    const dls=currency==='BGL'?amount*100:currency==='WL'?amount/100:amount;
    if(dls<=0) return res.status(400).json({ok:false,error:'invalid_amount'});
    const ref=transactionId;
    const before=user.balanceDls;
    mutateBalance(db,user,dls,'DEPOSIT',ref,{growId,currency,amount});
    const deposit={transactionId,growId,userId:user.id,username:user.username,currency,amount,amountDls:dls,status:'COMPLETED',createdAt:now()};
    db.deposits.push(deposit); save(db);
    if (typeof broadcast === 'function') {
      broadcast({ type:'GTPS_DEPOSIT', payload:{ growId, currency, amount, transactionId, timestamp:Date.now() } });
    }
    res.json({ok:true,duplicate:false,deposit,user:publicUser(user)});
  });

  app.post('/api/gtps/withdraw-request', async (req,res) => {
    const user=requireAuth(req,res); if(!user)return;
    const growId=String(user.growId||'').trim();
    const currency=String(req.body?.currency||'DL').toUpperCase();
    const amount=Number(req.body?.amount);
    if(!growId || !user.gtpsLinked) return res.status(400).json({ok:false,error:'growid_belum_link'});
    if(!Number.isInteger(amount) || amount<=0) return res.status(400).json({ok:false,error:'invalid_amount'});
    const dls=currency==='BGL'?amount*100:currency==='WL'?amount/100:amount;
    const db=load(); const fresh=db.users.find(u=>u.id===user.id);
    if(!fresh || fresh.balanceDls<dls) return res.status(400).json({ok:false,error:'insufficient_balance'});
    const withdrawalId=id('wd');
    mutateBalance(db,fresh,-dls,'WITHDRAW_PENDING',withdrawalId,{growId,currency,amount});
    const withdrawal={id:withdrawalId,userId:fresh.id,username:fresh.username,growId,currency,amount,amountDls:dls,status:'PENDING',createdAt:now()};
    db.withdrawals.push(withdrawal); save(db);
    try {
      const bridgeRes=await fetch(`${gtpsBridgeUrl}/supreme/withdraw`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({secretKey:getGtpsSecret(),growId,currency,amount})
      });
      const data=await bridgeRes.json().catch(()=>({ok:false,error:'bridge_invalid_response'}));
      const latest=load(); const w=latest.withdrawals.find(x=>x.id===withdrawalId); const u=latest.users.find(x=>x.id===fresh.id);
      if(!data.ok) {
        if(u){ mutateBalance(latest,u,dls,'WITHDRAW_REFUND',withdrawalId,{reason:data.error||'bridge_rejected'}); }
        if(w) w.status='FAILED';
        save(latest);
        return res.status(bridgeRes.status||502).json({ok:false,error:data.error||'withdraw_failed'});
      }
      if(w) w.status='COMPLETED'; save(latest);
      res.json({ok:true,status:'COMPLETED',withdrawalId,user:publicUser(u)});
    } catch {
      const latest=load(); const w=latest.withdrawals.find(x=>x.id===withdrawalId); const u=latest.users.find(x=>x.id===fresh.id);
      if(u) mutateBalance(latest,u,dls,'WITHDRAW_REFUND',withdrawalId,{reason:'bridge_unreachable'});
      if(w) w.status='FAILED'; save(latest);
      res.status(502).json({ok:false,error:'bridge_unreachable'});
    }
  });

  app.get('/api/economy/transactions', (req,res) => {
    const user=requireAuth(req,res); if(!user)return;
    const db=load();
    res.json({ok:true,transactions:db.transactions.filter(t=>t.userId===user.id).slice(-100).reverse()});
  });
}
