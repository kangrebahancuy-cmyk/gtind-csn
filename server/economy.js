import crypto from 'crypto';
import { getMongoDb, withMongoTransaction } from './mongo-store.js';
import { recordGameActivity, recordGameOutcome } from './progression.js';
const rateBuckets = new Map();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY_AMOUNT = 100000000;
function constantTimeEqual(a,b) { const aa=Buffer.from(String(a)); const bb=Buffer.from(String(b)); return aa.length===bb.length && crypto.timingSafeEqual(aa,bb); }
async function rateLimit(key, limit=30, windowMs=60000) {
  const nowMs=Date.now();
  const db=await getMongoDb();
  const c=db.collection('rateLimits');
  const current=await c.findOne({key});
  if(!current || current.expiresAt.getTime()<=nowMs){
    await c.updateOne({key},{$set:{key,count:1,windowMs,expiresAt:new Date(nowMs+windowMs),updatedAt:new Date()}},{upsert:true});
    return true;
  }
  if(current.count>=limit)return false;
  const updated=await c.findOneAndUpdate({key,count:current.count},{$inc:{count:1},$set:{updatedAt:new Date()}},{returnDocument:'after'});
  return Boolean(updated && updated.count<=limit);
}
function clientIp(req) { return String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim(); }
function audit(db, actor, action, metadata={}) { db.auditLogs ||= []; db.auditLogs.push({id:id('audit'),actorUserId:actor?.id||null,actorUsername:actor?.username||null,action,metadata,createdAt:now()}); if(db.auditLogs.length>10000) db.auditLogs=db.auditLogs.slice(-10000); }
function verifyGtpsRequest(req, getGtpsSecret, body={}) { const secret=String(getGtpsSecret?.()||''); const legacy=String(body.secretKey||req.headers['x-gtps-secret']||''); if(secret && legacy && constantTimeEqual(secret,legacy)) return true; const ts=String(req.headers['x-gtps-timestamp']||''); const sig=String(req.headers['x-gtps-signature']||''); const n=Number(ts); if(!secret||!sig||!Number.isFinite(n)||Math.abs(Date.now()-n)>300000) return false; const raw=JSON.stringify(body); const expected=crypto.createHmac('sha256',secret).update(`${ts}.${raw}`).digest('hex'); return constantTimeEqual(expected,sig); }

function now() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`; }

async function load() {
  const mongo = await getMongoDb();
  const [users, wallets, transactions, deposits, withdrawals, auditLogs] = await Promise.all([
    mongo.collection('users').find({}).toArray(),
    mongo.collection('wallets').find({}).toArray(),
    mongo.collection('ledger').find({}).sort({createdAt:1}).toArray(),
    mongo.collection('deposits').find({}).sort({createdAt:1}).toArray(),
    mongo.collection('withdrawals').find({}).sort({createdAt:1}).toArray(),
    mongo.collection('auditLogs').find({}).sort({createdAt:1}).limit(10000).toArray(),
  ]);
  const walletByUser = new Map(wallets.map(w => [String(w.userId), Number(w.balanceDls ?? ((Number(w?.balancesWl?.DL)||0) / 100))]));
  const db = {
    users: users.map(u => ({...u, balanceDls: walletByUser.get(String(u.id)) ?? 0})),
    transactions: transactions.map(({_id,...t})=>t),
    deposits: deposits.map(({_id,...d})=>d),
    withdrawals: withdrawals.map(({_id,...w})=>w),
    auditLogs: auditLogs.map(({_id,...a})=>a),
  };
  const adminUsername = String(process.env.ADMIN_USERNAME || '').trim();
  const adminPassword = String(process.env.ADMIN_PASSWORD || '');
  if (adminUsername && adminPassword && !db.users.some(u => normalizeUsername(u.username) === normalizeUsername(adminUsername))) {
    const admin = { id:id('usr'), username:adminUsername, passwordHash:hashPassword(adminPassword), balanceDls:0, linkCode:uniqueLinkCode(db), isBanned:false, isMuted:false, isAdmin:true, createdAt:now() };
    await mongo.collection('users').insertOne({...admin, usernameNormalized:normalizeUsername(admin.username)});
    await mongo.collection('wallets').insertOne({userId:admin.id,balanceDls:0,balancesWl:{WL:0,DL:0,BGL:0},updatedAt:new Date()});
    db.users.push(admin);
  }
  const meta = await mongo.collection('meta').findOne({_id:'economy'});
  Object.defineProperty(db,'__version',{value:Number(meta?.version||0),enumerable:false,writable:true});
  return db;
}
async function save(db) {
  const expectedVersion = Number(db.__version || 0);
  await withMongoTransaction(async (session, mongo) => {
    const meta = mongo.collection('meta');
    const current = await meta.findOne({_id:'economy'},{session});
    const currentVersion = Number(current?.version || 0);
    if (currentVersion !== expectedVersion) {
      const e = new Error('ECONOMY_WRITE_CONFLICT'); e.code='ECONOMY_WRITE_CONFLICT'; throw e;
    }
    const users = mongo.collection('users');
    const wallets = mongo.collection('wallets');
    const userDocs = db.users.map(u => {
      const {balanceDls,...rest}=u;
      return {...rest,usernameNormalized:normalizeUsername(u.username),growIdNormalized:u.growId?String(u.growId).trim().toLowerCase():undefined};
    });
    for (const u of userDocs) await users.replaceOne({id:u.id},u,{upsert:true,session});
    for (const u of db.users) { const existing=await wallets.findOne({userId:u.id},{session}); const balancesWl=existing?.balancesWl || {WL:0,DL:Math.round(Number(u.balanceDls||0)*100),BGL:0}; await wallets.replaceOne({userId:u.id},{...(existing||{}),userId:u.id,balancesWl,balanceDls:Number(u.balanceDls||0),updatedAt:new Date()},{upsert:true,session}); }
    const ledger=mongo.collection('ledger');
    for (const t of db.transactions||[]) await ledger.replaceOne({id:t.id},{...t,createdAt:new Date(t.createdAt||Date.now())},{upsert:true,session});
    const deps=mongo.collection('deposits');
    for (const d of db.deposits||[]) await deps.replaceOne({transactionId:d.transactionId},{...d,createdAt:new Date(d.createdAt||Date.now())},{upsert:true,session});
    const wds=mongo.collection('withdrawals');
    for (const w of db.withdrawals||[]) await wds.replaceOne({id:w.id},{...w,createdAt:new Date(w.createdAt||Date.now())},{upsert:true,session});
    const audits=mongo.collection('auditLogs');
    for (const a of db.auditLogs||[]) await audits.replaceOne({id:a.id},{...a,createdAt:new Date(a.createdAt||Date.now())},{upsert:true,session});
    await meta.updateOne({_id:'economy',version:expectedVersion},{$set:{version:expectedVersion+1,updatedAt:new Date()}},{upsert:expectedVersion===0,session});
  });
  db.__version = expectedVersion + 1;
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
export async function sessionUser(req) {
  const token = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('gtind_session='));
  const value = token ? decodeURIComponent(token.slice('gtind_session='.length)) : '';
  if (!value) return null;
  const mongo = await getMongoDb();
  const session = await mongo.collection('sessions').findOne({token:value,expiresAt:{$gt:new Date()}});
  if (!session) return null;
  const userId = session.userId;
  const db = await load();
  return db.users.find(u => u.id === userId) || null;
}
async function createSession(_db,user) {
  const token=crypto.randomBytes(32).toString('hex');
  const mongo=await getMongoDb();
  await mongo.collection('sessions').insertOne({token,userId:user.id,createdAt:new Date(),expiresAt:new Date(Date.now()+SESSION_TTL_MS)});
  return token;
}
function sessionCookie(req, token, maxAge=SESSION_TTL_MS/1000) { const secure=String(req.headers['x-forwarded-proto']||'').includes('https') ? '; Secure' : ''; return `gtind_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge)}${secure}`; }
async function destroySession(req) { const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('gtind_session=')); if(raw){const token=decodeURIComponent(raw.slice('gtind_session='.length)); const mongo=await getMongoDb(); await mongo.collection('sessions').deleteOne({token});} }
async function requireAuth(req, res) {
  const user = await sessionUser(req);
  if (!user) { res.status(401).json({ ok: false, error: 'not_authenticated' }); return null; }
  if (user.isBanned) { res.status(403).json({ ok: false, error: 'account_banned' }); return null; }
  return user;
}
async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (!user.isAdmin) { res.status(403).json({ ok: false, error: 'admin_required' }); return null; }
  return user;
}

export async function linkGrowIdByCode(code, growId) {
  const cleanCode = String(code || '').trim();
  const cleanGrowId = String(growId || '').trim();
  if (!cleanCode || !cleanGrowId) return null;
  const db = await load();
  const user = db.users.find(u => u.linkCode === cleanCode);
  if (!user) return null;
  user.growId = cleanGrowId;
  user.gtpsLinked = true;
  await save(db);
  return publicUser(user);
}

export async function unlinkGrowId(growId) {
  const clean = String(growId || '').trim().toLowerCase();
  if (!clean) return null;
  const db = await load();
  const user = db.users.find(u => String(u.growId || '').toLowerCase() === clean);
  if (!user) return null;
  user.growId = undefined;
  user.gtpsLinked = false;
  await save(db);
  return publicUser(user);
}

export async function debitForGame(userId, amount, gameId) {
  const n=Number(amount);
  if(!Number.isFinite(n)||n<=0) return {ok:false,error:'invalid_amount'};
  const ref=id('bet');
  try {
    return await withMongoTransaction(async (session,mongo)=>{
      const user=await mongo.collection('users').findOne({id:userId},{session});
      if(!user) return {ok:false,error:'user_not_found'};
      const wallet=await mongo.collection('wallets').findOne({userId},{session});
      const before=Number(wallet?.balanceDls||0);
      if(before<n) return {ok:false,error:'insufficient_balance'};
      const after=Number((before-n).toFixed(2));
      await mongo.collection('wallets').updateOne({userId,balanceDls:before},{$set:{balanceDls:after,updatedAt:new Date()}},{session});
      await mongo.collection('ledger').insertOne({id:id('txn'),userId,username:user.username,type:'BET',amountDls:-n,balanceBefore:before,balanceAfter:after,referenceId:ref,metadata:{gameId},createdAt:new Date()},{session});
      await recordGameActivity(session,mongo,{userId,username:user.username,gameId,betDls:n,referenceId:ref});
      return {ok:true,balance:after,referenceId:ref};
    });
  } catch(error) { if(error.code==='ECONOMY_WRITE_CONFLICT') return {ok:false,error:'economy_write_conflict'}; throw error; }
}
export async function creditGameResult(userId, amount, round) {
  const n=Number(amount||0);
  return await withMongoTransaction(async (session,mongo)=>{
    const user=await mongo.collection('users').findOne({id:userId},{session});
    if(!user) return {ok:false,error:'user_not_found'};
    const existing=await mongo.collection('ledger').findOne({userId,type:'GAME_PAYOUT',referenceId:round.id},{session});
    const wallet=await mongo.collection('wallets').findOne({userId},{session});
    const before=Number(wallet?.balanceDls||0);
    if(existing) return {ok:true,balance:before,duplicate:true};
    if(n<=0){ if(Number(round?.betDls||0)>0) await recordGameOutcome(session,mongo,{userId,username:user.username,gameId:round.gameId,roundId:round.id,betDls:Number(round.betDls),payoutDls:0}); return {ok:true,balance:before}; }
    const after=Number((before+n).toFixed(2));
    await mongo.collection('wallets').updateOne({userId,balanceDls:before},{$set:{balanceDls:after,updatedAt:new Date()}},{session});
    await mongo.collection('ledger').insertOne({id:id('txn'),userId,username:user.username,type:'GAME_PAYOUT',amountDls:n,balanceBefore:before,balanceAfter:after,referenceId:round.id,metadata:{gameId:round.gameId,multiplier:round.result?.multiplier||0},createdAt:new Date()},{session});
    if(Number(round?.betDls||0)>0) await recordGameOutcome(session,mongo,{userId,username:user.username,gameId:round.gameId,roundId:round.id,betDls:Number(round.betDls),payoutDls:n});
    return {ok:true,balance:after};
  });
}

export function installEconomyRoutes(app, { gtpsBridgeUrl, getGtpsSecret, broadcast }) {
  app.get('/api/auth/me', async (req, res) => {
    const user = await sessionUser(req);
    res.json({ ok: true, authenticated: Boolean(user), user: publicUser(user) });
  });

  app.post('/api/auth/register', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const growId = String(req.body?.growId || '').trim();
    if (!(await rateLimit(`register:${clientIp(req)}`,5,3600000))) return res.status(429).json({ok:false,error:'rate_limited'});
    if (username.length < 4 || username.length > 24) return res.status(400).json({ ok:false, error:'invalid_username' });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ ok:false, error:'invalid_password' });
    const db = await load();
    if (findUser(db, username)) return res.status(409).json({ ok:false, error:'username_taken' });
    const user = {
      id: id('usr'), username, passwordHash: hashPassword(password),
      growId: growId || undefined, gtpsLinked: false, balanceDls: 0,
      linkCode: uniqueLinkCode(db), isBanned: false, isMuted: false,
      isAdmin: false, createdAt: now()
    };
    db.users.push(user);
    await save(db);
    const token = await createSession(db,user);
    res.setHeader('Set-Cookie', sessionCookie(req,token));
    res.json({ ok:true, user:publicUser(user) });
  });

  app.post('/api/auth/login', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!(await rateLimit(`login:${clientIp(req)}`,10,60000))) return res.status(429).json({ok:false,error:'rate_limited'});
    const db = await load();
    const user = findUser(db, username);
    if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ ok:false, error:'invalid_credentials' });
    if (user.isBanned) return res.status(403).json({ ok:false, error:'account_banned' });
    const token = await createSession(db,user);
    res.setHeader('Set-Cookie', sessionCookie(req, token));
    res.json({ ok:true, user:publicUser(user) });
  });

  app.post('/api/auth/logout', async (req, res) => {
    await destroySession(req);
    res.setHeader('Set-Cookie', 'gtind_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ ok:true });
  });

  // One-time migration path for accounts that existed only in the old localStorage economy.
  app.post('/api/auth/migrate', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const growId = String(req.body?.growId || '').trim();
    const legacyBalance = Number(req.body?.balanceDls || 0);
    if (username.length < 4 || password.length < 8) return res.status(400).json({ok:false,error:'invalid_credentials'});
    const db = await load();
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
    await save(db);
    const token=await createSession(db,user);
    res.setHeader('Set-Cookie',sessionCookie(req,token));
    res.json({ok:true,user:publicUser(user),legacyBalanceIgnored:legacyBalance});
  });

  app.post('/api/account/unlink-growid', async (req,res) => {
    const user=await requireAuth(req,res); if(!user)return;
    const db=await load(); const fresh=db.users.find(u=>u.id===user.id);
    if(!fresh?.growId) return res.status(400).json({ok:false,error:'not_linked'});
    fresh.growId=undefined; fresh.gtpsLinked=false; await save(db);
    res.json({ok:true,user:publicUser(fresh)});
  });

  app.post('/api/account/growid', async (req,res) => {
    const user=await requireAuth(req,res); if(!user)return;
    const growId=String(req.body?.growId||'').trim();
    if(!growId) return res.status(400).json({ok:false,error:'invalid_growid'});
    const db=await load(); const fresh=db.users.find(u=>u.id===user.id);
    const collision=db.users.find(u=>u.id!==fresh.id && String(u.growId||'').toLowerCase()===growId.toLowerCase());
    if(collision) return res.status(409).json({ok:false,error:'growid_already_linked'});
    fresh.growId=growId; fresh.gtpsLinked=true; await save(db);
    res.json({ok:true,user:publicUser(fresh)});
  });

  app.post('/api/gtps/register-code', async (req,res) => {
    const username=String(req.body?.username||'').trim();
    const code=String(req.body?.code||'').trim();
    if(!username || !code) return res.status(400).json({ok:false,error:'invalid_link_code'});
    const db=await load(); const user=findUser(db,username);
    if(!user || user.linkCode!==code) return res.status(403).json({ok:false,error:'invalid_link_code'});
    res.json({ok:true,code,registered:true,username:user.username,growId:user.growId||null});
  });

  app.get('/api/gtps/check-link', async (req,res) => {
    const code=String(req.query.code||'').trim();
    const db=await load(); const user=db.users.find(u=>u.linkCode===code);
    if(!user) return res.json({linked:false,code});
    res.json({linked:Boolean(user.gtpsLinked&&user.growId),growId:user.growId||null,registered:true,username:user.username,code});
  });

  app.post('/api/gtps/link-growid', async (req,res) => {
    const secret=String(req.body?.secretKey||req.headers['x-gtps-secret']||'');
    if(!constantTimeEqual(secret,getGtpsSecret())) return res.status(403).json({ok:false,error:'invalid_secret_key'});
    if(!(await rateLimit(`gtps-link:${clientIp(req)}`,30,60000))) return res.status(429).json({ok:false,error:'rate_limited'});
    const code=String(req.body?.code||'').trim(); const growId=String(req.body?.growid||'').trim();
    if(!code || !growId) return res.status(400).json({ok:false,error:'invalid_link'});
    const db=await load(); const user=db.users.find(u=>u.linkCode===code);
    if(!user) return res.status(404).json({ok:false,error:'invalid_link_code'});
    const collision=db.users.find(u=>u.id!==user.id && String(u.growId||'').toLowerCase()===growId.toLowerCase());
    if(collision) return res.status(409).json({ok:false,error:'growid_already_linked'});
    user.growId=growId; user.gtpsLinked=true; await save(db);
    res.json({ok:true,success:true,growId,code,user:publicUser(user)});
  });

  app.post('/api/gtps/unlink', async (req,res) => {
    const secret=String(req.body?.secretKey||req.headers['x-gtps-secret']||'');
    if(!secret || secret!==getGtpsSecret()) return res.status(403).json({ok:false,error:'invalid_secret_key'});
    const result=unlinkGrowId(req.body?.growid);
    res.json({ok:true,success:true,growId:req.body?.growid,found:Boolean(result)});
  });

  app.get('/api/economy/wallet', async (req,res) => {
    const user=await requireAuth(req,res); if(!user)return;
    res.json({ok:true,user:publicUser(user)});
  });

  app.post('/api/economy/tip', async (req,res) => {
    const user=await requireAuth(req,res); if(!user)return;
    const target=String(req.body?.targetUser || '').trim();
    const amount=Number(req.body?.amountDls);
    const message=String(req.body?.message || '').slice(0,200);
    if(!target || !Number.isFinite(amount) || amount<=0) return res.status(400).json({ok:false,error:'invalid_tip'});
    const db=await load(); const sender=findUser(db,user.username); const recipient=findUser(db,target);
    if(!recipient) return res.status(404).json({ok:false,error:'recipient_not_found'});
    if(sender.id===recipient.id) return res.status(400).json({ok:false,error:'self_tip'});
    if(sender.balanceDls < amount) return res.status(400).json({ok:false,error:'insufficient_balance'});
    const ref=id('tip');
    mutateBalance(db,sender,-amount,'TIP_SEND',ref,{recipient:recipient.username,message});
    mutateBalance(db,recipient,amount,'TIP_RECEIVE',ref,{sender:sender.username,message});
    await save(db);
    res.json({ok:true,user:publicUser(sender),recipient:publicUser(recipient),amountDls:amount});
  });

  app.post('/api/admin/balance', async (req,res) => {
    const admin=await requireAdmin(req,res); if(!admin)return;
    const username=String(req.body?.username||'').trim(); const amount=Number(req.body?.amountDls); const mode=req.body?.mode;
    if(!username || !Number.isFinite(amount) || amount<=0 || !['add','remove'].includes(mode)) return res.status(400).json({ok:false,error:'invalid_request'});
    const db=await load(); const user=findUser(db,username); if(!user)return res.status(404).json({ok:false,error:'user_not_found'});
    const delta=mode==='add'?amount:-amount;
    if(delta<0 && user.balanceDls<amount)return res.status(400).json({ok:false,error:'insufficient_balance'});
    mutateBalance(db,user,delta,'ADMIN_ADJUSTMENT',id('admin'),{admin:admin.username,mode});
    await save(db);
    res.json({ok:true,user:publicUser(user)});
  });

  app.post('/api/admin/status', async (req,res) => {
    const admin=await requireAdmin(req,res); if(!admin)return;
    const username=String(req.body?.username||'').trim(); const field=req.body?.field;
    if(!username || !['isBanned','isMuted'].includes(field)) return res.status(400).json({ok:false,error:'invalid_request'});
    const db=await load(); const user=findUser(db,username); if(!user)return res.status(404).json({ok:false,error:'user_not_found'});
    user[field]=!Boolean(user[field]); await save(db);
    res.json({ok:true,user:publicUser(user)});
  });

  app.get('/api/admin/metrics', async (req,res) => {
    const admin=await requireAdmin(req,res); if(!admin)return;
    const mongo=await getMongoDb();
    const [users,wallets,ledger,withdrawals,deposits,rounds,crashPlayers,caseBattles,sessions] = await Promise.all([
      mongo.collection('users').countDocuments({}),
      mongo.collection('wallets').countDocuments({}),
      mongo.collection('ledger').countDocuments({}),
      mongo.collection('withdrawals').countDocuments({status:{$in:['PENDING','UNKNOWN']}}),
      mongo.collection('deposits').countDocuments({status:{$in:['PENDING','UNKNOWN']}}),
      mongo.collection('gameRounds').countDocuments({status:'ACTIVE'}),
      mongo.collection('crashPlayers').countDocuments({status:'active'}),
      mongo.collection('caseBattles').countDocuments({status:'open'}),
      mongo.collection('sessions').countDocuments({expiresAt:{$gt:new Date()}})
    ]);
    res.json({ok:true,metrics:{users,wallets,ledgerEntries:ledger,pendingWithdrawals:withdrawals,pendingDeposits:deposits,activeGameRounds:rounds,activeCrashPlayers:crashPlayers,openCaseBattles:caseBattles,activeSessions:sessions},timestamp:new Date().toISOString()});
  });

  app.get('/api/admin/reconciliation', async (req,res) => {
    const admin=await requireAdmin(req,res); if(!admin)return;
    const mongo=await getMongoDb();
    const [wallets,ledger] = await Promise.all([
      mongo.collection('wallets').find({},{projection:{_id:0,userId:1,balanceDls:1}}).toArray(),
      mongo.collection('ledger').find({},{projection:{_id:0,userId:1,amountDls:1}}).toArray()
    ]);
    const sums=new Map();
    for(const row of ledger) sums.set(String(row.userId),(sums.get(String(row.userId))||0)+Number(row.amountDls||0));
    const discrepancies=[];
    for(const wallet of wallets){
      const actual=Number(wallet.balanceDls||0);
      const expected=Number((sums.get(String(wallet.userId))||0).toFixed(2));
      const delta=Number((actual-expected).toFixed(2));
      if(Math.abs(delta)>0.01) discrepancies.push({userId:wallet.userId,balanceDls:actual,ledgerBalanceDls:expected,deltaDls:delta});
    }
    res.json({ok:true,consistent:discrepancies.length===0,checkedWallets:wallets.length,discrepancies,checkedAt:new Date().toISOString()});
  });

  app.get('/api/admin/users', async (req,res) => {
    const admin=await requireAdmin(req,res); if(!admin)return;
    const db=await load();
    res.json({ok:true,users:db.users.map(publicUser)});
  });

  app.get('/api/admin/withdrawals', async (req,res) => {
    const admin=await requireAdmin(req,res); if(!admin)return;
    const db=await load();
    res.json({ok:true,withdrawals:(db.withdrawals||[]).slice(-200).reverse()});
  });

  app.post('/api/admin/withdrawals/:id/reconcile', async (req,res) => {
    const admin=await requireAdmin(req,res); if(!admin)return;
    const action=String(req.body?.action||'');
    if(!['complete','fail_refund'].includes(action)) return res.status(400).json({ok:false,error:'invalid_reconcile_action'});
    const withdrawalId=String(req.params.id);
    try {
      const result=await withMongoTransaction(async (session,mongo)=>{
        const w=await mongo.collection('withdrawals').findOne({id:withdrawalId},{session});
        if(!w)return {error:'withdrawal_not_found'};
        if(!['PENDING','UNKNOWN'].includes(w.status))return {error:'withdrawal_already_final',status:w.status};
        const user=await mongo.collection('users').findOne({id:w.userId},{session});
        if(!user)return {error:'user_not_found'};

        const changed=await mongo.collection('withdrawals').updateOne(
          {id:withdrawalId,status:{$in:['PENDING','UNKNOWN']}},
          {$set:{status:action==='complete'?'COMPLETED':'FAILED',reconciledBy:admin.username,reconciledAt:new Date()}},
          {session}
        );
        if(changed.modifiedCount!==1)return {error:'withdrawal_already_final'};

        if(action==='fail_refund'){
          const wallet=await mongo.collection('wallets').findOne({userId:w.userId},{session});
          const before=Number(wallet?.balanceDls||0);
          const amount=Number(w.amountDls||0);
          const after=Number((before+amount).toFixed(2));
          await mongo.collection('wallets').updateOne({userId:w.userId},{$set:{balanceDls:after,updatedAt:new Date()}},{session});
          await mongo.collection('ledger').insertOne({
            id:id('txn'),userId:w.userId,username:user.username,type:'WITHDRAW_REFUND',
            amountDls:amount,balanceBefore:before,balanceAfter:after,referenceId:w.id,
            metadata:{reason:'admin_reconciliation',admin:admin.username},createdAt:new Date()
          },{session});
          return {ok:true,status:'FAILED',balance:after};
        }
        return {ok:true,status:'COMPLETED'};
      });
      if(result.error==='withdrawal_not_found')return res.status(404).json({ok:false,error:result.error});
      if(result.error)return res.status(409).json({ok:false,error:result.error,status:result.status});
      const db=await load();
      const w=(db.withdrawals||[]).find(x=>x.id===withdrawalId);
      const user=db.users.find(x=>x.id===w?.userId);
      res.json({ok:true,status:result.status,withdrawal:w,user:user?publicUser(user):undefined,balance:result.balance});
    } catch(error) {
      console.error('[withdrawal-reconcile]',error);
      res.status(500).json({ok:false,error:'reconciliation_failed'});
    }
  });

  app.post('/api/gtps/deposit-webhook', async (req,res) => {
    const secret=String(req.body?.secretKey || req.headers['x-gtps-secret'] || '');
    if(!secret || secret!==getGtpsSecret()) return res.status(403).json({ok:false,error:'invalid_secret_key'});
    const transactionId=String(req.body?.transactionId || '').trim();
    const growId=String(req.body?.growId || '').trim();
    const currency=String(req.body?.currency || 'DL').toUpperCase();
    const amount=Number(req.body?.amount);
    if(!transactionId || !growId || !Number.isFinite(amount) || amount<=0 || amount>MAX_BODY_AMOUNT) return res.status(400).json({ok:false,error:'invalid_deposit'});
    const db=await load();
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
    db.deposits.push(deposit); await save(db);
    if (typeof broadcast === 'function') {
      broadcast({ type:'GTPS_DEPOSIT', payload:{ growId, currency, amount, transactionId, timestamp:Date.now() } });
    }
    res.json({ok:true,duplicate:false,deposit,user:publicUser(user)});
  });

  app.post('/api/gtps/withdraw-request', async (req,res) => {
    const user=await requireAuth(req,res); if(!user)return;
    const growId=String(user.growId||'').trim();
    const currency=String(req.body?.currency||'DL').toUpperCase();
    const amount=Number(req.body?.amount);
    if(!growId || !user.gtpsLinked) return res.status(400).json({ok:false,error:'growid_belum_link'});
    if(!Number.isInteger(amount) || amount<=0) return res.status(400).json({ok:false,error:'invalid_amount'});
    const dls=currency==='BGL'?amount*100:currency==='WL'?amount/100:amount;
    const db=await load(); const fresh=db.users.find(u=>u.id===user.id);
    if(!fresh || fresh.balanceDls<dls) return res.status(400).json({ok:false,error:'insufficient_balance'});
    if(!(await rateLimit(`withdraw:${user.id}`,5,60000))) return res.status(429).json({ok:false,error:'rate_limited'});
    const idempotencyKey=String(req.headers['idempotency-key']||'').trim().slice(0,128);
    const preflight=await load();
    if(idempotencyKey){ const prior=preflight.withdrawals.find(x=>x.userId===user.id&&x.idempotencyKey===idempotencyKey); if(prior) return res.json({ok:true,status:prior.status,withdrawalId:prior.id,user:publicUser(preflight.users.find(x=>x.id===user.id)),duplicate:true}); }
    const withdrawalId=id('wd');
    mutateBalance(db,fresh,-dls,'WITHDRAW_PENDING',withdrawalId,{growId,currency,amount});
    const withdrawal={id:withdrawalId,userId:fresh.id,username:fresh.username,growId,currency,amount,amountDls:dls,status:'PENDING',idempotencyKey:idempotencyKey||null,createdAt:now()};
    db.withdrawals.push(withdrawal); await save(db);
    try {
      const bridgeRes=await fetch(`${gtpsBridgeUrl}/supreme/withdraw`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({secretKey:getGtpsSecret(),withdrawalId,growId,currency,amount})
      });
      const data=await bridgeRes.json().catch(()=>({ok:false,error:'bridge_invalid_response'}));
      const latest=await load(); const w=latest.withdrawals.find(x=>x.id===withdrawalId); const u=latest.users.find(x=>x.id===fresh.id);
      if(!data.ok) {
        if(u){ mutateBalance(latest,u,dls,'WITHDRAW_REFUND',withdrawalId,{reason:data.error||'bridge_rejected'}); }
        if(w) w.status='FAILED';
        await save(latest);
        return res.status(bridgeRes.status||502).json({ok:false,error:data.error||'withdraw_failed'});
      }
      if(w) w.status='COMPLETED'; await save(latest);
      res.json({ok:true,status:'COMPLETED',withdrawalId,user:publicUser(u)});
    } catch {
      const latest=await load(); const w=latest.withdrawals.find(x=>x.id===withdrawalId);
      if(w) { w.status='UNKNOWN'; w.error='bridge_response_unavailable'; w.lastCheckedAt=now(); }
      await save(latest);
      res.status(202).json({ok:false,status:'UNKNOWN',withdrawalId,error:'withdrawal_requires_reconciliation'});
    }
  });

  app.get('/api/economy/transactions', async (req,res) => {
    const user=await requireAuth(req,res); if(!user)return;
    const db=await load();
    res.json({ok:true,transactions:db.transactions.filter(t=>t.userId===user.id).slice(-100).reverse()});
  });
}
