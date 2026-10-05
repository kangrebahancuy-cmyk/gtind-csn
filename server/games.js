import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'game-rounds.json');
const rounds = new Map();
const caseCatalog = new Map();
const caseBattles = new Map();
const CASE_FILE = path.join(DATA_DIR, 'cases.json');
const CASE_BATTLE_FILE = path.join(DATA_DIR, 'case-battles.json');
const CRASH_FILE = path.join(DATA_DIR, 'crash-global.json');
const crashGlobal = { roundId:null, phase:'betting', countdown:5, multiplier:1, crashPoint:1, serverSeed:null, serverSeedHash:null, startedAt:0, bettingStartedAt:Date.now(), history:[], players:new Map(), nextRoundAt:0 };
const SERVER_AUTH_GAMES = new Set(['coinflip','mines','towers','roulette','keno','dice','blackjack','cases','case-battles','crash']);
const TOWERS_CONFIGS = { Easy:{columns:4,traps:1,multipliers:[1.28,1.65,2.15,2.8,3.65,4.8,6.3,8.3]}, Medium:{columns:3,traps:1,multipliers:[1.45,2.15,3.2,4.75,7.05,10.5,15.6,23.2]}, Hard:{columns:2,traps:1,multipliers:[1.95,3.85,7.6,15,29.5,58,114,225]}, Extreme:{columns:3,traps:2,multipliers:[2.9,8.5,25,74,218,645,1900,5600]} };
const KENO_PAYTABLES = { Classic:{1:{0:0,1:3.8},2:{0:0,1:1.7,2:5.2},3:{0:0,1:1,2:2.7,3:26},4:{0:0,1:0,2:1.8,3:8,4:80},5:{0:0,1:0,2:1.4,3:4,4:25,5:300},6:{0:0,1:0,2:0,3:3,4:12,5:90,6:800},7:{0:0,1:0,2:0,3:1.8,4:6,5:30,6:250,7:2000},8:{0:0,1:0,2:0,3:0,4:4,5:18,6:100,7:600,8:3000},9:{0:0,1:0,2:0,3:0,4:2.5,5:10,6:45,7:250,8:1200,9:4500},10:{0:0,1:0,2:0,3:0,4:1.6,5:4.5,6:18,7:80,8:400,9:2000,10:7500}}, Low:{1:{0:0,1:1.95},2:{0:0,1:1.95,2:3.9},3:{0:0,1:1.1,2:2.2,3:13.5},4:{0:0,1:.5,2:1.6,3:4.2,4:24.5},5:{0:0,1:.5,2:1.2,3:2.5,4:12,5:120},6:{0:0,1:0,2:1,3:2,4:6,5:30,6:350},7:{0:0,1:0,2:.8,3:1.5,4:3.5,5:14,6:90,7:700},8:{0:0,1:0,2:.5,3:1.2,4:2.5,5:8,6:45,7:250,8:1200},9:{0:0,1:0,2:0,3:1,4:2,5:5,6:22,7:100,8:500,9:2500},10:{0:0,1:0,2:0,3:.8,4:1.5,5:3.5,6:12,7:45,8:200,9:1000,10:4000}}, Medium:{1:{0:0,1:3.8},2:{0:0,1:1.75,2:4.95},3:{0:0,1:1,2:2.8,3:28},4:{0:0,1:0,2:1.75,3:8.5,4:85},5:{0:0,1:0,2:1.4,3:4,4:27,5:350},6:{0:0,1:0,2:0,3:3,4:12.5,5:95,6:900},7:{0:0,1:0,2:0,3:1.8,4:6.5,5:32,6:275,7:2200},8:{0:0,1:0,2:0,3:0,4:4.2,5:19,6:110,7:650,8:3500},9:{0:0,1:0,2:0,3:0,4:2.5,5:11,6:48,7:280,8:1350,9:5000},10:{0:0,1:0,2:0,3:0,4:1.7,5:4.8,6:19.5,7:85,8:450,9:2200,10:8500}}, High:{1:{0:0,1:3.96},2:{0:0,1:0,2:9.9},3:{0:0,1:0,2:3.5,3:52},4:{0:0,1:0,2:2,3:14,4:170},5:{0:0,1:0,2:0,3:5.5,4:55,5:750},6:{0:0,1:0,2:0,3:0,4:20,5:180,6:2000},7:{0:0,1:0,2:0,3:0,4:9,5:65,6:600,7:5000},8:{0:0,1:0,2:0,3:0,4:0,5:35,6:250,7:1500,8:9000},9:{0:0,1:0,2:0,3:0,4:0,5:18,6:100,7:650,8:3200,9:15000},10:{0:0,1:0,2:0,3:0,4:0,5:8.5,6:40,7:200,8:1100,9:5500,10:25000}} };

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify([], null, 2));
  if (!fs.existsSync(CASE_FILE)) fs.writeFileSync(CASE_FILE, JSON.stringify([], null, 2));
  if (!fs.existsSync(CASE_BATTLE_FILE)) fs.writeFileSync(CASE_BATTLE_FILE, JSON.stringify([], null, 2));
}
function persistCases(){ensure();fs.writeFileSync(CASE_FILE+'.tmp',JSON.stringify([...caseCatalog.values()],null,2));fs.renameSync(CASE_FILE+'.tmp',CASE_FILE);}
function loadCases(){ensure();try{const rows=JSON.parse(fs.readFileSync(CASE_FILE,'utf8'));if(Array.isArray(rows))rows.forEach(c=>caseCatalog.set(String(c.id),c));}catch{}}
function persistCaseBattles(){ensure();fs.writeFileSync(CASE_BATTLE_FILE+'.tmp',JSON.stringify([...caseBattles.values()].slice(-2000),null,2));fs.renameSync(CASE_BATTLE_FILE+'.tmp',CASE_BATTLE_FILE);}
function loadCaseBattles(){ensure();try{const rows=JSON.parse(fs.readFileSync(CASE_BATTLE_FILE,'utf8'));if(Array.isArray(rows))rows.forEach(b=>caseBattles.set(b.id,b));}catch{}}
loadCases();
loadCaseBattles();
function persist() {
  ensure();
  fs.writeFileSync(FILE + '.tmp', JSON.stringify([...rounds.values()].slice(-5000), null, 2));
  fs.renameSync(FILE + '.tmp', FILE);
}
function load() {
  ensure();
  try {
    const rows = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (Array.isArray(rows)) rows.forEach(r => rounds.set(r.id, r));
  } catch {}
}
load();

function id() { return 'rnd_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex'); }
function hash(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
export function rng(seed) {
  let counter = 0;
  return () => {
    const h = crypto.createHmac('sha256', seed).update(String(counter++)).digest();
    return h.readUInt32BE(0) / 0x100000000;
  };
}
export function crashPointFromSeed(seed) {
  const digest=crypto.createHmac('sha256',String(seed)).update('crash-point').digest();
  const u=digest.readUInt32BE(0)/0x100000000;
  return Math.min(10000,Math.max(1,Number((0.99/(1-u)).toFixed(2))));
}
async function requireUser(req, res) {
  const user = await economy.sessionUser(req);
  if (!user) { res.status(401).json({ ok:false,error:'not_authenticated' }); return null; }
  return user;
}

async function mongoUpsertState(collectionName, id, doc) {
  const db=await getMongoDb();
  await db.collection(collectionName).replaceOne({id},{...doc,id},{upsert:true});
}
async function mongoGetState(collectionName,id){ return (await getMongoDb()).collection(collectionName).findOne({id}); }
async function mongoClaimLease(name, owner, ttlMs){
  const db=await getMongoDb(); const now=new Date(), until=new Date(Date.now()+ttlMs);
  const r=await db.collection('leases').findOneAndUpdate(
    {$or:[{_id:name,owner},{_id:name,expiresAt:{$lte:now}}]},
    {$set:{_id:name,owner,expiresAt:until,updatedAt:now}},
    {upsert:true,returnDocument:'after'}
  );
  return r?.owner===owner;
}

export function installGameRoutes(app, economy, options = {}) {
  const broadcast = typeof options.broadcast === 'function' ? options.broadcast : () => {};
  const instanceId = crypto.randomUUID();
  const persistCrash = () => {
    ensure();
    const safe={...crashGlobal,players:[...crashGlobal.players.values()]};
    fs.writeFileSync(CRASH_FILE+'.tmp',JSON.stringify(safe,null,2));
    fs.renameSync(CRASH_FILE+'.tmp',CRASH_FILE);
    void (async()=>{try{
      const db=await getMongoDb();
      await db.collection('crashRounds').replaceOne({id:crashGlobal.roundId},{id:crashGlobal.roundId,phase:crashGlobal.phase,countdown:crashGlobal.countdown,multiplier:crashGlobal.multiplier,crashPoint:crashGlobal.crashPoint,serverSeed:crashGlobal.serverSeed,serverSeedHash:crashGlobal.serverSeedHash,startedAt:crashGlobal.startedAt,bettingStartedAt:crashGlobal.bettingStartedAt,history:crashGlobal.history,nextRoundAt:crashGlobal.nextRoundAt,updatedAt:Date.now()},{upsert:true});
      const players=db.collection('crashPlayers');
      for(const p of crashGlobal.players.values()) await players.replaceOne({roundId:p.roundId,userId:p.userId},{...p,roundId:p.roundId,updatedAt:Date.now()},{upsert:true});
    }catch{} })();
  };
  const loadCrash = () => {
    ensure();
    try {
      const saved=JSON.parse(fs.readFileSync(CRASH_FILE,'utf8'));
      if(!saved?.roundId)return false;
      Object.assign(crashGlobal,saved); crashGlobal.players=new Map((saved.players||[]).map(p=>[p.userId,p]));
      return true;
    } catch { return false; }
  };
  const startCrashRound = () => {
    crashGlobal.roundId='crash_'+Date.now()+'_'+crypto.randomBytes(5).toString('hex');
    crashGlobal.phase='betting'; crashGlobal.countdown=5; crashGlobal.multiplier=1; crashGlobal.startedAt=0; crashGlobal.nextRoundAt=0;
    crashGlobal.bettingStartedAt=Date.now();
    crashGlobal.serverSeed=crypto.randomBytes(32).toString('hex');
    crashGlobal.serverSeedHash=hash(crashGlobal.serverSeed);
    crashGlobal.crashPoint=generateCrashPoint(crashGlobal.serverSeed);
    crashGlobal.players=new Map();
    persistCrash();
    broadcast({type:'CRASH_STATE',payload:publicCrashState()});
  };
  const crashTick = async () => {
    if(!(await mongoClaimLease('crash-global-leader',instanceId,1500))) return;
    const now=Date.now();
    try { const db=await getMongoDb(); const ps=await db.collection('crashPlayers').find({roundId:crashGlobal.roundId}).toArray(); crashGlobal.players=new Map(ps.map(({_id,...p})=>[p.userId,p])); } catch {}
    if(crashGlobal.phase==='betting'){
      const remaining=Math.max(0,5-(now-crashGlobal.bettingStartedAt)/1000);
      crashGlobal.countdown=Number(remaining.toFixed(1));
      if(remaining<=0){crashGlobal.phase='flying';crashGlobal.startedAt=now;crashGlobal.multiplier=1;persistCrash();}
    } else if(crashGlobal.phase==='flying'){
      crashGlobal.multiplier=Number(Math.max(1,Math.exp(0.065*((now-crashGlobal.startedAt)/1000)*1.5)).toFixed(2));
      for(const p of crashGlobal.players.values()){
        if(p.status==='active' && p.autoCashout>1.01 && crashGlobal.multiplier>=p.autoCashout) void settleCrashPlayer(p,true);
      }
      if(crashGlobal.multiplier>=crashGlobal.crashPoint){
        crashGlobal.multiplier=crashGlobal.crashPoint; crashGlobal.phase='crashed';
        crashGlobal.history=[crashGlobal.crashPoint,...crashGlobal.history].slice(0,20); crashGlobal.nextRoundAt=now+3500; persistCrash();
        for(const p of crashGlobal.players.values()) if(p.status==='active') p.status='busted';
        broadcast({type:'CRASH_CRASHED',payload:{roundId:crashGlobal.roundId,crashPoint:crashGlobal.crashPoint}});
        setTimeout(()=>{ if(crashGlobal.phase==='crashed' && Date.now()>=crashGlobal.nextRoundAt) startCrashRound(); },3500);
      }
    }
    broadcast({type:'CRASH_STATE',payload:publicCrashState()});
  };
  const timer=setInterval(()=>{void crashTick();},100);
  if(typeof timer.unref==='function')timer.unref();
  if(!loadCrash()) startCrashRound();
  if(crashGlobal.phase==='crashed' && crashGlobal.nextRoundAt<=Date.now()) startCrashRound();
  function generateCrashPoint(seed){ return crashPointFromSeed(seed); }
  if(crashGlobal.phase==='flying' && Date.now()-crashGlobal.startedAt>0){
    crashGlobal.multiplier=Number(Math.max(1,Math.exp(0.065*((Date.now()-crashGlobal.startedAt)/1000)*1.5)).toFixed(2));
    if(crashGlobal.multiplier>=crashGlobal.crashPoint){crashGlobal.multiplier=crashGlobal.crashPoint;crashGlobal.phase='crashed';crashGlobal.history=[crashGlobal.crashPoint,...crashGlobal.history].slice(0,20);crashGlobal.nextRoundAt=Date.now()+3500;for(const p of crashGlobal.players.values())if(p.status==='active')p.status='busted';persistCrash();}
  }
  if(crashGlobal.phase==='crashed' && crashGlobal.nextRoundAt>Date.now()) setTimeout(()=>{if(crashGlobal.phase==='crashed')startCrashRound();}, Math.max(0,crashGlobal.nextRoundAt-Date.now()));
  function publicCrashState(){
    return {roundId:crashGlobal.roundId,phase:crashGlobal.phase,countdown:crashGlobal.countdown,currentMultiplier:crashGlobal.multiplier,crashPoint:crashGlobal.phase==='crashed'?crashGlobal.crashPoint:null,serverSeedHash:crashGlobal.serverSeedHash,serverSeed:crashGlobal.phase==='crashed'?crashGlobal.serverSeed:null,history:crashGlobal.history,players:[...crashGlobal.players.values()].map(p=>({username:p.username,status:p.status,amountDls:p.amountDls,autoCashout:p.autoCashout}))};
  }
  async function settleCrashPlayer(p,auto=false){
    if(p.status!=='active')return null;
    p.status='settling';
    const multiplier=auto?Math.max(1,crashGlobal.multiplier):Math.max(1,crashGlobal.multiplier);
    const result=await economy.creditGameResult(p.userId,p.amountDls*multiplier,{id:p.roundId,gameId:'crash-global',result:{outcome:'win',current:multiplier,multiplier}});
    if(!result.ok){p.status='active'; try{await (await getMongoDb()).collection('crashPlayers').updateOne({roundId:p.roundId,userId:p.userId,status:'settling'},{$set:{status:'active',updatedAt:Date.now()}});}catch{} return null;}
    p.status='cashed';p.cashedAt=multiplier;p.payoutDls=Number((p.amountDls*multiplier).toFixed(2)); try{await (await getMongoDb()).collection('crashPlayers').updateOne({roundId:p.roundId,userId:p.userId,status:'settling'},{$set:{status:p.status,cashedAt:p.cashedAt,payoutDls:p.payoutDls,updatedAt:Date.now()}});}catch{} persistCrash();
    return result;
  }

  app.get('/api/crash/state', async (req,res) =>{
    const user=await economy.sessionUser(req);
    let state=publicCrashState(), own=user?[...crashGlobal.players.values()].find(p=>p.userId===user.id):null;
    try {
      const db=await getMongoDb();
      const round=await db.collection('crashRounds').findOne({id:crashGlobal.roundId});
      if(round){ Object.assign(crashGlobal,round); state=publicCrashState(); }
      if(user) own=await db.collection('crashPlayers').findOne({roundId:crashGlobal.roundId,userId:user.id});
    } catch {}
    res.json({ok:true,state,userBet:own?{roundId:own.roundId,amountDls:own.amountDls,autoCashout:own.autoCashout,status:own.status,cashedAt:own.cashedAt||null,payoutDls:own.payoutDls||0}:null});
  });
  app.post('/api/crash/join', async (req,res) =>{
    const user=await requireUser(req,res);if(!user)return;
    const db=await getMongoDb(); const round=await db.collection('crashRounds').findOne({id:crashGlobal.roundId}); if(!round||round.phase!=='betting')return res.status(409).json({ok:false,error:'betting_closed'});
    if(await db.collection('crashPlayers').findOne({roundId:round.id,userId:user.id}))return res.status(409).json({ok:false,error:'already_joined'});
    const amount=Number(req.body?.betDls),auto=Number(req.body?.autoCashout||0);
    if(!Number.isFinite(amount)||amount<=0||amount>100000000)return res.status(400).json({ok:false,error:'invalid_bet'});
    if(auto && (auto<1.01||auto>10000))return res.status(400).json({ok:false,error:'invalid_auto_cashout'});
    const debit=await economy.debitForGame(user.id,amount,'crash-global');
    if(!debit.ok)return res.status(400).json({ok:false,error:debit.error});
    const p={userId:user.id,username:user.username,amountDls:amount,autoCashout:auto||0,status:'active',roundId:round.id};
    try { await db.collection('crashPlayers').insertOne({...p,createdAt:Date.now(),updatedAt:Date.now()}); } catch(e) { await economy.creditGameResult(user.id,amount,{id:round.id,gameId:'crash-global-join-refund',result:{outcome:'join_conflict'}}); return res.status(409).json({ok:false,error:'already_joined'}); } crashGlobal.players.set(user.id,p); persistCrash(); broadcast({type:'CRASH_PLAYER_JOINED',payload:{roundId:crashGlobal.roundId,username:user.username}});
    res.json({ok:true,state:publicCrashState(),userBet:{roundId:p.roundId,amountDls:amount,autoCashout:p.autoCashout,status:'active'},balanceDls:debit.balance});
  });
  app.post('/api/crash/cashout', async (req,res) =>{
    const user=await requireUser(req,res);if(!user)return;
    const db=await getMongoDb(); const p=await db.collection('crashPlayers').findOneAndUpdate({roundId:crashGlobal.roundId,userId:user.id,status:'active'},{$set:{status:'settling',updatedAt:Date.now()}},{returnDocument:'after'});
    if(!p||p.roundId!==crashGlobal.roundId)return res.status(404).json({ok:false,error:'no_active_bet'});
    if(crashGlobal.phase!=='flying'||p.status!=='active')return res.status(409).json({ok:false,error:'cashout_unavailable'});
    p.status='active'; crashGlobal.players.set(user.id,p); const result=await settleCrashPlayer(p,false);
    if(!result)return res.status(500).json({ok:false,error:'settlement_failed'});
    res.json({ok:true,result:{outcome:'win',current:p.cashedAt,multiplier:p.cashedAt,payout:p.payoutDls},balanceDls:result.balance,state:publicCrashState()});
  });
  app.post('/api/crash/cancel', async (req,res) =>{
    const user=await requireUser(req,res);if(!user)return;
    const db=await getMongoDb(); const p=await db.collection('crashPlayers').findOne({roundId:crashGlobal.roundId,userId:user.id});
    if(!p||p.roundId!==crashGlobal.roundId)return res.status(404).json({ok:false,error:'no_active_bet'});
    if(crashGlobal.phase!=='betting'||p.status!=='active')return res.status(409).json({ok:false,error:'cancel_unavailable'});
    const result=await economy.creditGameResult(user.id,p.amountDls,{id:p.roundId,gameId:'crash-global-cancel',result:{outcome:'cancelled',multiplier:1}});
    if(!result.ok)return res.status(500).json({ok:false,error:'refund_failed'});
    p.status='cancelled'; await db.collection('crashPlayers').updateOne({roundId:p.roundId,userId:p.userId,status:'active'},{$set:{status:'cancelled',updatedAt:Date.now()}}); crashGlobal.players.set(user.id,p); persistCrash();
    res.json({ok:true,balanceDls:result.balance,state:publicCrashState()});
  });

  app.use('/api/games', async (req, _res, next) => {
    const user = await economy.sessionUser(req);
    req.__economyUser = user;
    next();
  });

  app.get('/api/games/cases/catalog', async (req,res) => {
    const docs=await (await getMongoDb()).collection('caseCatalog').find({}).sort({name:1}).toArray();
    res.json({ok:true,cases:docs.map(({_id,...c})=>c)});
  });
  app.post('/api/games/cases/catalog', async (req,res) =>{
    const user=await requireUser(req,res);if(!user)return;
    if(!user.isAdmin)return res.status(403).json({ok:false,error:'admin_required'});
    const c=req.body?.case;
    if(!c||!c.id||!c.name||!Array.isArray(c.items)||!c.items.length)return res.status(400).json({ok:false,error:'invalid_case'});
    const items=c.items.map(x=>({id:String(x.id),name:String(x.name),image:String(x.image||''),price:Number(x.price)||0,chance:Number(x.chance)||0,rarity:String(x.rarity||'common'),color:String(x.color||'')}));
    const total=items.reduce((n,x)=>n+Math.max(0,x.chance),0);if(total<=0)return res.status(400).json({ok:false,error:'invalid_chances'});
    const normalized=items.map(x=>({...x,chance:Number((x.chance/total*100).toFixed(6))}));
    const price=Number(c.price)||Number(normalized.reduce((n,x)=>n+x.price*x.chance/100,0).toFixed(6));
    const safe={id:String(c.id),name:String(c.name),image:String(c.image||''),color:String(c.color||''),price,volatility:String(c.volatility||'Medium'),creator:String(c.creator||user.username),openedTimes:Number(c.openedTimes)||0,items:normalized};
    await (await getMongoDb()).collection('caseCatalog').replaceOne({id:safe.id},safe,{upsert:true}); caseCatalog.set(safe.id,safe); res.json({ok:true,case:safe});
  });
  app.delete('/api/games/cases/catalog/:id', async (req,res) =>{const user=await requireUser(req,res);if(!user)return;if(!user.isAdmin)return res.status(403).json({ok:false,error:'admin_required'});await (await getMongoDb()).collection('caseCatalog').deleteOne({id:String(req.params.id)}); caseCatalog.delete(String(req.params.id)); res.json({ok:true});});
  app.get('/api/games/case-battles/lobby', async (req,res) => {
    const battleDocs=await (await getMongoDb()).collection('caseBattles').find({status:'open',createdAt:{$gt:Date.now()-10*60*1000}}).sort({createdAt:-1}).limit(100).toArray();
    const battles=battleDocs.map(({_id,...b})=>publicCaseBattle(b,true));
    res.json({ok:true,battles});
  });

  app.post('/api/games/case-battles/create', async (req,res) => {
    const user=await requireUser(req,res);if(!user)return;
    const config=String(req.body?.playerConfig||'1v1');
    if(config!=='1v1')return res.status(400).json({ok:false,error:'only_1v1_is_currently_supported'});
    const ids=Array.isArray(req.body?.caseIds)?req.body.caseIds.map(String):[];
    if(!ids.length||ids.length>20)return res.status(400).json({ok:false,error:'invalid_cases'});
    const caseDocs=await (await getMongoDb()).collection('caseCatalog').find({id:{$in:ids}}).toArray(); const caseMap=new Map(caseDocs.map(c=>[String(c.id),c])); const cases=ids.map(x=>caseMap.get(x));
    if(cases.some(x=>!x))return res.status(400).json({ok:false,error:'case_not_found'});
    const betDls=Number(cases.reduce((n,x)=>n+Number(x.price||0),0).toFixed(2));
    if(!Number.isFinite(betDls)||betDls<=0)return res.status(400).json({ok:false,error:'invalid_battle_value'});
    const debit=await economy.debitForGame(user.id,betDls,'case-battle-pvp');
    if(!debit.ok)return res.status(400).json({ok:false,error:debit.error});
    const battleId='cb_'+Date.now()+'_'+crypto.randomBytes(6).toString('hex');
    const serverSeed=crypto.randomBytes(32).toString('hex');
    const battle={
      id:battleId,mode:String(req.body?.mode||'normal'),playerConfig:config,caseIds:ids,
      totalCostPerPlayer:betDls,totalPot:betDls,status:'open',createdAt:Date.now(),
      creator:{userId:user.id,username:user.username,betDls},
      players:[{userId:user.id,username:user.username,betDls}],
      serverSeed,serverSeedHash:hash(serverSeed)
    };
    await (await getMongoDb()).collection('caseBattles').insertOne(battle);
    caseBattles.set(battle.id,battle);
    res.json({ok:true,battle:publicCaseBattle(battle),balanceDls:debit.balance});
  });

  app.post('/api/games/case-battles/join', async (req,res) => {
    const user=await requireUser(req,res);if(!user)return;
    const battle=await mongoGetState('caseBattles',String(req.body?.battleId||''));
    if(!battle)return res.status(404).json({ok:false,error:'battle_not_found'});
    if(battle.status!=='open')return res.status(409).json({ok:false,error:'battle_not_open'});
    if(battle.players.some(p=>p.userId===user.id))return res.status(409).json({ok:false,error:'already_in_battle'});
    const debit=await economy.debitForGame(user.id,battle.totalCostPerPlayer,'case-battle-pvp');
    if(!debit.ok)return res.status(400).json({ok:false,error:debit.error});
    const claim=await (await getMongoDb()).collection('caseBattles').findOneAndUpdate(
      {id:battle.id,status:'open','players.0.userId':{$ne:user.id}},
      {$set:{status:'finished',updatedAt:Date.now()},$push:{players:{userId:user.id,username:user.username,betDls:battle.totalCostPerPlayer}}},
      {returnDocument:'after'}
    );
    if(!claim){ await economy.creditGameResult(user.id,battle.totalCostPerPlayer,{id:battle.id,gameId:'case-battle-join-refund',result:{outcome:'atomic_join_lost'}}); return res.status(409).json({ok:false,error:'battle_already_joined'}); }
    battle.players=claim.players;
    battle.totalPot=Number((battle.totalCostPerPlayer*2).toFixed(2));
    battle.status='finished';
    const result=resolvePvPCaseBattle(battle);
    battle.result=result;
    const payout=Number(result.payout||0);
    const settlementRound={id:battle.id,gameId:'case-battle-pvp',result};
    if(result.outcome==='draw'){
      for(const player of battle.players){
        const refund=await economy.creditGameResult(player.userId,battle.totalCostPerPlayer,settlementRound);
        if(!refund.ok){battle.status='settlement_failed';persistCaseBattles();return res.status(500).json({ok:false,error:'settlement_failed'});}
      }
      battle.payoutDls=battle.totalCostPerPlayer*2;
    } else if(payout>0){
      const credit=await economy.creditGameResult(result.winnerUserId,payout,settlementRound);
      if(!credit.ok){battle.status='settlement_failed';persistCaseBattles();return res.status(500).json({ok:false,error:'settlement_failed'});}
      battle.payoutDls=payout;
    }
    battle.resolvedAt=new Date().toISOString();
    persistCaseBattles();
    res.json({ok:true,battle:publicCaseBattle(battle,true),result,balanceDls:debit.balance});
  });

  app.post('/api/games/case-battles/cancel', async (req,res) => {
    const user=await requireUser(req,res);if(!user)return;
    const battle=caseBattles.get(String(req.body?.battleId||''));
    if(!battle)return res.status(404).json({ok:false,error:'battle_not_found'});
    if(battle.status!=='open')return res.status(409).json({ok:false,error:'battle_not_open'});
    if(battle.creator.userId!==user.id)return res.status(403).json({ok:false,error:'creator_required'});
    const refund=await economy.creditGameResult(user.id,battle.totalCostPerPlayer,{id:battle.id,gameId:'case-battle-cancel',result:{multiplier:1}});
    if(!refund.ok)return res.status(500).json({ok:false,error:'refund_failed'});
    await (await getMongoDb()).collection('caseBattles').updateOne({id:battle.id,status:'open', 'creator.userId':user.id},{$set:{status:'cancelled',resolvedAt:new Date().toISOString()}}); battle.status='cancelled';battle.resolvedAt=new Date().toISOString();
    res.json({ok:true,balanceDls:refund.balance});
  });

  app.get('/api/games/fairness', async (req,res) => {
    const user=await requireUser(req,res); if(!user)return;
    res.json({ok:true,algorithm:'HMAC-SHA256',description:'Server seed is generated server-side and only its SHA-256 commitment is exposed before the result.'});
  });

  app.post('/api/games/start', async (req,res) => {
    const user=await requireUser(req,res); if(!user)return;
    const gameId=String(req.body?.gameId||'').trim().toLowerCase();
    const betDls=Number(req.body?.betDls);
    if (!SERVER_AUTH_GAMES.has(gameId)) return res.status(409).json({ok:false,error:'game_not_server_authoritative'});
    if (gameId==='case-battles') return res.status(410).json({ok:false,error:'use_case_battles_pvp_endpoint'});
    if (!gameId || !Number.isFinite(betDls) || betDls<=0 || betDls>100000000) return res.status(400).json({ok:false,error:'invalid_bet'});
    let caseMap = new Map();
    if (gameId === 'cases') {
      const caseId = String(req.body?.caseId || '');
      const docs = await (await getMongoDb()).collection('caseCatalog').find({id:caseId}).toArray();
      caseMap = new Map(docs.map(c => [String(c.id), c]));
      const c = caseMap.get(caseId);
      const count = Math.max(1, Math.min(4, Number(req.body?.count) || 1));
      if (!c) return res.status(400).json({ok:false,error:'case_not_found'});
      if (Math.abs(c.price * count - betDls) > 0.01) return res.status(400).json({ok:false,error:'case_price_mismatch'});
    }
    if(gameId==='crash')return res.status(410).json({ok:false,error:'use_global_crash_endpoint'});
    const result=await economy.debitForGame(user.id,betDls,gameId);
    if (!result.ok) return res.status(400).json({ok:false,error:result.error});
    const serverSeed=crypto.randomBytes(32).toString('hex');
    const clientSeed=String(req.body?.clientSeed||'').slice(0,128) || crypto.randomBytes(16).toString('hex');
    const nonce=Date.now().toString();
    const commitment=hash(serverSeed);
    const round={id:id(),userId:user.id,username:user.username,gameId,betDls,status:'ACTIVE',
      serverSeed,serverSeedHash:commitment,clientSeed,nonce,createdAt:new Date().toISOString(),balanceAfterBet:result.balance};
    if (gameId==='blackjack') { const initial=startBlackjack(round); round.initialResult=initial; }
    if (gameId==='crash') { const rr=rng(serverSeed+':crash'); const x=rr(); round.state={startedAt:Date.now()+5000,crashPoint:x<0.01?1:Number(Math.max(1,0.99/(1-x)).toFixed(2))}; }
    if (gameId==='cases') { const c=caseMap.get(String(req.body?.caseId||'')); const count=Math.max(1,Math.min(4,Number(req.body?.count)||1)); if(!c)return res.status(400).json({ok:false,error:'case_not_found'}); const total=c.price*count; if(Math.abs(total-betDls)>0.01)return res.status(400).json({ok:false,error:'case_price_mismatch'}); round.state={caseId:c.id,count,caseSnapshot:c}; }
    if (gameId==='mines') {
      const size=Math.max(5,Math.min(8,Number(req.body?.gridSize)||5)); const total=size*size; const mineCount=Math.max(1,Math.min(total-1,Number(req.body?.mines)||3));
      const rr=rng(serverSeed+':mines'); const mineSet=new Set(); while(mineSet.size<mineCount) mineSet.add(Math.floor(rr()*total));
      round.state={size,mineCount,revealed:[],mineMap:[...mineSet]};
    } else if (gameId==='towers') {
      const difficulty=String(req.body?.difficulty||'Easy'); const cfg=TOWERS_CONFIGS[difficulty]||TOWERS_CONFIGS.Easy; const cols=cfg.columns; const traps=cfg.traps;
      const rr=rng(serverSeed+':towers'); round.state={floor:0,difficulty,cols,traps,trapsMap:Array.from({length:8},()=>{const set=new Set();while(set.size<traps)set.add(Math.floor(rr()*cols));return [...set];}),traps:[],multipliers:cfg.multipliers};
    }
    rounds.set(round.id,round); await (await getMongoDb()).collection('gameRounds').insertOne(round); persist();
    res.json({ok:true,roundId:round.id,serverSeedHash:commitment,clientSeed,nonce,balanceDls:result.balance,initialResult:round.initialResult||undefined});
  });

  app.post('/api/games/resolve', async (req,res) => {
    const user=await requireUser(req,res); if(!user)return;
    const round=(await (async()=>{const rr=String(req.body?.roundId||''); const db=await getMongoDb(); return await db.collection('gameRounds').findOne({id:rr,userId:user.id});})()) || rounds.get(String(req.body?.roundId||''));
    if(!round || round.userId!==user.id) return res.status(404).json({ok:false,error:'round_not_found'});
    if(round.status!=='ACTIVE') return res.status(409).json({ok:false,error:'round_already_resolved'});
    const action=req.body?.action && typeof req.body.action==='object' ? req.body.action : {};
    const step=Number.isInteger(action.step)?Math.max(0,action.step):0;
    const random=rng(round.serverSeed + ':' + round.clientSeed + ':' + round.nonce + ':' + step);
    if(round.gameId==='blackjack' && action.type==='double' && !round.state?.doubled){ const extra=await economy.debitForGame(user.id,round.betDls,'blackjack-double'); if(!extra.ok)return res.status(400).json({ok:false,error:extra.error}); round.state.doubled=true; round.totalBetDls=round.betDls*2; }
    let result;
    if (round.gameId === 'blackjack') {
      result = action.type === 'initial'
        ? (() => {
            const p = round.state.player, d = round.state.dealer;
            const ps = blackjackScore(p), ds = blackjackScore(d);
            if (ps === 21) {
              round.state.phase = 'finished';
              return { outcome: ds === 21 ? 'push' : 'win', player: p, dealer: d, payout: ds === 21 ? round.betDls : round.betDls * 2.5, score: ps, dealerScore: ds };
            }
            return { outcome: 'continue', player: p, dealer: [d[0]], payout: 0, score: ps, dealerScore: blackjackScore([d[0]]) };
          })()
        : resolveBlackjack(round, action);
    } else if (round.gameId === 'crash') {
      result = resolveCrash(round, action);
    } else if (round.gameId === 'case-battles') {
      result = resolveCaseBattle(round, random, action);
    } else if (round.gameId === 'coinflip' && action.cashout === true) {
      result = resolveCashout(round, action);
    } else {
      result = resolveGame(round.gameId, random, action, round.betDls, round.state);
    }
    if(result?.error)return res.status(400).json({ok:false,error:result.error});
    round.result=result;
    const payout=Number((result.payout||0).toFixed(2));
    if (payout < 0 || payout > round.betDls * 100000) return res.status(400).json({ok:false,error:'invalid_payout'});
    const shouldCredit=(round.gameId==='blackjack' ? result.outcome!=='continue' : (round.gameId==='crash' ? action.type==='cashout' || action.type==='cancel' || result.outcome==='loss' : (round.gameId==='coinflip' ? result.outcome==='loss' || action.cashout===true || action.final===true : (action.cashout===true || action.final===true || !['coinflip'].includes(round.gameId)))));
    let credit={ok:true,balance:round.balanceAfterBet};
    if(shouldCredit){
      credit=await economy.creditGameResult(user.id,payout,round);
      if(!credit.ok) return res.status(500).json({ok:false,error:'credit_failed'});
      round.status='RESOLVED'; round.payoutDls=payout; round.resolvedAt=new Date().toISOString();
    }
    if (['mines','towers'].includes(round.gameId) && result.continue) { round.state=result.state; }
    round.lastStep=step; persist();
    res.json({ok:true,roundId:round.id,result,payoutDls:payout,balanceDls:credit.balance,finished:shouldCredit,serverSeed:shouldCredit?round.serverSeed:undefined,serverSeedHash:round.serverSeedHash,clientSeed:round.clientSeed,nonce:round.nonce});
  });
}

export function makeBlackjackDeck(seed) {
  const suits=['♠','♥','♦','♣'], ranks=[['A',11],['2',2],['3',3],['4',4],['5',5],['6',6],['7',7],['8',8],['9',9],['10',10],['J',10],['Q',10],['K',10]];
  const deck=[]; for(const suit of suits)for(const [rank,value] of ranks)deck.push({suit,rank,value});
  const rr=rng(seed); for(let i=deck.length-1;i>0;i--){const j=Math.floor(rr()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];} return deck;
}
export function blackjackScore(cards){let total=cards.reduce((n,c)=>n+c.value,0), aces=cards.filter(c=>c.rank==='A').length;while(total>21&&aces-- >0)total-=10;return total;}
function startBlackjack(round){
  const deck=makeBlackjackDeck(round.serverSeed+':blackjack'); const player=[deck.pop(),deck.pop()],dealer=[deck.pop(),deck.pop()];
  round.state={deck,player,dealer,bet:round.betDls,phase:'player'}; return {player,dealer:[dealer[0]],phase:'player',playerScore:blackjackScore(player),dealerScore:blackjackScore([dealer[0]])};
}
function resolveBlackjack(round,action){
  const st=round.state;if(!st||!Array.isArray(st.player)||!Array.isArray(st.dealer)||!Array.isArray(st.deck))return {error:'round_state_missing',payout:0};
  if(action.type==='hit'){
    if(st.phase!=='player'||!st.deck.length)return {error:'invalid_action',payout:0}; st.player.push(st.deck.pop()); const score=blackjackScore(st.player);
    if(score>21){st.phase='finished';return {outcome:'loss',player:st.player,dealer:st.dealer,payout:0,score,dealerScore:blackjackScore(st.dealer)};}
    return {outcome:'continue',player:st.player,dealer:[st.dealer[0]],payout:0,score,dealerScore:blackjackScore([st.dealer[0]])};
  }
  if(action.type==='double'){
    if(st.phase!=='player'||st.player.length!==2||!round.state?.doubled)return {error:'invalid_action',payout:0};
    st.bet*=2; st.player.push(st.deck.pop()); const score=blackjackScore(st.player); st.phase='dealer'; if(score>21){st.phase='finished';return {outcome:'loss',player:st.player,dealer:st.dealer,payout:0,score};}
  } else if(action.type==='stand'){if(st.phase!=='player')return {error:'invalid_action',payout:0};st.phase='dealer';} else return {error:'invalid_action',payout:0};
  while(blackjackScore(st.dealer)<17&&st.deck.length)st.dealer.push(st.deck.pop());
  st.phase='finished'; const ps=blackjackScore(st.player),ds=blackjackScore(st.dealer); let payout=0,outcome='loss';
  if(ds>21||ps>ds){payout=st.bet*2;outcome='win';} else if(ps===ds){payout=st.bet;outcome='push';}
  return {outcome,player:st.player,dealer:st.dealer,payout,score:ps,dealerScore:ds};
}
function resolveCashout(round, action) {
  if(round.gameId==='mines'){
    const size=Number(round.state?.size)||5,total=size*size,mineCount=Number(round.state?.mineCount)||3,revealed=Array.isArray(round.state?.revealed)?round.state.revealed.length:0;
    if(revealed<=0)return {outcome:'cashout',multiplier:1,payout:0,cashedOut:true};
    let prob=1;for(let i=0;i<revealed;i++)prob*=(total-mineCount-i)/(total-i);
    const multiplier=Math.max(1.01,Number((0.99/prob).toFixed(2)));return {outcome:'cashout',multiplier,payout:round.betDls*multiplier,cashedOut:true};
  }
  if(round.gameId==='towers'){
    const floor=Math.max(0,Number(round.state?.floor)||0);const multipliers=TOWERS_CONFIGS[String(round.state?.difficulty)]?.multipliers||TOWERS_CONFIGS.Easy.multipliers;const multiplier=floor?multipliers[Math.min(floor-1,multipliers.length-1)]:1;return {outcome:'cashout',floor,multiplier,payout:round.betDls*multiplier,cashedOut:true};
  }
  const mults=[1.92,3.84,7.68,15.36,30.72,61.44,122.88,245.76,491.52];
  const step=Math.max(0,Math.min(mults.length,Number(action.step)||0));
  const multiplier=step>0?mults[step-1]:1;
  return {outcome:'cashout',step,multiplier,payout:round.betDls*multiplier,cashedOut:true};
}

export function resolveCrash(round,action){
  if(action.type==='cancel')return {outcome:'cancelled',current:1,multiplier:1,payout:round.betDls};
  const elapsed=Math.max(0,(Date.now()-Number(round.state?.startedAt||Date.now()))/1000);
  const current=Number(Math.max(1,Math.exp(0.065*elapsed*1.5)).toFixed(2));
  const crashPoint=Number(round.state?.crashPoint||1);
  if(action.type==='cashout'){if(current>=crashPoint)return {outcome:'loss',crashPoint,current,payout:0};const multiplier=Math.max(1,current);return {outcome:'win',current,multiplier,payout:round.betDls*multiplier};}
  if(current>=crashPoint)return {outcome:'loss',crashPoint,current,payout:0};
  return {outcome:'active',current,payout:0,continue:true};
}
export function resolveGame(gameId, random, action, betDls, state) {
  if (gameId === 'coinflip') {
    const choice = action.choice === 'tails' ? 'tails' : action.choice === 'heads' ? 'heads' : null;
    if (!choice) return { outcome:'invalid', payout:0, error:'invalid_choice' };
    const step = Math.max(0, Math.min(9, Number(action.step)||0));
    state.path = Array.isArray(state.path) ? state.path : [];
    if (state.path[step]) return state.path[step];
    const winningSide = random() < 0.5 ? 'heads' : 'tails';
    const win = winningSide === choice;
    const multiplier = step > 0 ? [1.92,3.84,7.68,15.36,30.72,61.44,122.88,245.76,491.52][step-1] : 1.92;
    const result = { outcome: win?'win':'loss', winningSide, choice, step, multiplier, payout: win ? (action.final ? betDls*multiplier : 0) : 0 };
    state.path[step] = result;
    return {...result, continue:win && !action.final};
  }
  if (gameId === 'mines') {
    const index = Number(action.selected);
    const size=Number(state?.size)||5, total=size*size;
    const mines=Array.isArray(state?.mineMap)?state.mineMap:[];
    const revealed=Array.isArray(state?.revealed)?state.revealed:[];
    if (!Number.isInteger(index)||index<0||index>=total||revealed.includes(index)) return {outcome:'invalid',payout:0,error:'invalid_tile'};
    if (mines.includes(index)) return {outcome:'loss',mineMap:mines,payout:0};
    state.revealed=[...revealed,index];
    if(state.revealed.length>=total-mines.length) {
      const multiplier=minesMultiplier(size,mines.length,state.revealed.length);
      return {outcome:'win',mineMap:mines,revealed:state.revealed,multiplier,payout:betDls*multiplier};
    }
    return {outcome:'safe',revealed:state.revealed,multiplier:minesMultiplier(size,mines.length,state.revealed.length),payout:0,continue:true};
  }
  if (gameId === 'towers') {
    const floor=Number(action.floor), col=Number(action.col);
    const cols=Number(state?.cols)||4, traps=Number(state?.traps)||1;
    if(!Number.isInteger(floor)||floor!==Number(state.floor)||!Number.isInteger(col)||col<0||col>=cols)return {outcome:'invalid',payout:0,error:'invalid_tile'};
    const row=Array.isArray(state.trapsMap?.[floor])?state.trapsMap[floor]:[];
    if(row.includes(col)) return {outcome:'loss',traps:state.trapsMap,payout:0,floor};
    state.floor=floor+1;
    const cfg=Object.values(TOWERS_CONFIGS).find(x=>x.columns===cols&&x.traps===traps);
    const multipliers=cfg?.multipliers||TOWERS_CONFIGS.Easy.multipliers;
    if(state.floor>=8)return {outcome:'win',floor:state.floor,multiplier:multipliers[7],payout:betDls*multipliers[7],traps:state.trapsMap};
    return {outcome:'safe',floor:state.floor,multiplier:multipliers[state.floor-1],payout:0,continue:true};
  }
  if(gameId==='dice'){
    const target=Math.max(1,Math.min(99,Number(action.target)||50)), condition=action.condition==='over'?'over':'under';
    const roll=Number((random()*100).toFixed(2));
    const win=condition==='under'?roll<target:roll>target;
    const probability=condition==='under'?target/100:(100-target)/100;
    const multiplier=probability>0?Number((0.98/probability).toFixed(2)):0;
    return {outcome:win?'win':'loss',roll,target,condition,multiplier,payout:win?betDls*multiplier:0};
  }
  if(gameId==='keno'){
    const picks=Array.isArray(action.picks)?[...new Set(action.picks.map(Number))].filter(n=>Number.isInteger(n)&&n>=1&&n<=40):[];
    const risk=KENO_PAYTABLES[action.risk]?action.risk:'Medium';
    if(picks.length<1||picks.length>10)return {outcome:'invalid',payout:0,error:'invalid_picks'};
    const pool=Array.from({length:40},(_,i)=>i+1);
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    const drawn=pool.slice(0,10),hits=drawn.filter(n=>picks.includes(n)).length;
    const multiplier=Number(KENO_PAYTABLES[risk]?.[picks.length]?.[hits]||0);
    return {outcome:multiplier>0?'win':'loss',drawn,hits,picks,risk,multiplier,payout:betDls*multiplier};
  }
  if(gameId==='roulette'){
    const bets=action.bets&&typeof action.bets==='object'?action.bets:{};
    const allowedBets=new Set(['num_0',...Array.from({length:36},(_,i)=>'num_'+(i+1)),'red','black','even','odd','1_to_18','19_to_36','col_1','col_2','col_3','1st_12','2nd_12','3rd_12']);
    if(Object.keys(bets).some(key=>!allowedBets.has(key)))return {outcome:'invalid',payout:0,error:'invalid_bet_key'};
    const factor=action.currency==='BGLS'?100:1;
    const number=Math.floor(random()*37);
    const totalBet=Object.values(bets).reduce((s,v)=>s+(Number(v)||0)*factor,0);
    if(Math.abs(totalBet-betDls)>0.01)return {outcome:'invalid',payout:0,error:'bet_mismatch'};
    if(totalBet<=0)return {outcome:'invalid',payout:0,error:'no_bets'};
    const validBet=(key,amount)=>{const a=Number(amount);if(!Number.isFinite(a)||a<=0)return 0;return Math.min(a,100000000);};
    let payout=0;
    for(const [key,raw] of Object.entries(bets)){
      const amount=validBet(key,raw)*factor; if(!amount)continue;
      let win=false,mult=0;
      if(key==='num_0'||/^num_\d+$/.test(key)){const n=Number(key.slice(4));win=n===number;mult=35;}
      else if(key==='red'||key==='black'){win=number!==0&&(key==='red')===[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(number);mult=1;}
      else if(key==='even'||key==='odd'){win=number!==0&&(key==='even'?number%2===0:number%2===1);mult=1;}
      else if(key==='1_to_18'||key==='19_to_36'){win=number!==0&&(key==='1_to_18'?number<=18:number>=19);mult=1;}
      else if(/^col_[123]$/.test(key)){const col=Number(key.slice(4));win=number!==0&&((number-1)%3+1)===col;mult=2;}
      else if(key==='1st_12'||key==='2nd_12'||key==='3rd_12'){const d=key==='1st_12'?1:key==='2nd_12'?2:3;win=number>=((d-1)*12+1)&&number<=d*12;mult=2;}
      payout+=win?amount*(mult+1):0;
    }
    return {outcome:payout>0?'win':'loss',number,payout,totalBet};
  }
  return {outcome:'invalid',payout:0,error:'unsupported_game'};
}
export function minesMultiplier(size,mineCount,revealed) {
  if(revealed<=0)return 1;
  const total=size*size; let prob=1;
  for(let i=0;i<revealed;i++)prob*=(total-mineCount-i)/(total-i);
  return Math.max(1.01,Number((0.99/prob).toFixed(2)));
}
function publicCaseBattle(battle,includeResult=false){
  const out={id:battle.id,mode:battle.mode,playerConfig:battle.playerConfig,caseIds:battle.caseIds,totalCostPerPlayer:battle.totalCostPerPlayer,totalPot:battle.totalPot,status:battle.status,createdAt:battle.createdAt,players:battle.players.map(p=>({username:p.username,betDls:p.betDls}))};
  if(battle.result)out.result=includeResult?battle.result:{outcome:battle.result.outcome};
  if(battle.status==='finished'||battle.status==='cancelled')out.serverSeed=battle.serverSeed;
  out.serverSeedHash=battle.serverSeedHash;
  return out;
}
function resolvePvPCaseBattle(battle){
  const totals=new Map(),itemsByPlayer={};
  for(const p of battle.players){
    let total=0;const items=[];
    for(const caseId of battle.caseIds){
      const c=(battle.caseSnapshots||[]).find(x=>String(x.id)===String(caseId));if(!c)throw new Error('case_not_found');
      const rr=rng(battle.serverSeed+':pvp:'+p.userId+':'+caseId+':'+items.length);
      let x=rr()*100,chosen=c.items[c.items.length-1];
      for(const item of c.items){x-=Math.max(0,Number(item.chance)||0);if(x<=0){chosen=item;break;}}
      items.push(chosen);total+=Number(chosen.price||0);
    }
    totals.set(p.userId,Number(total.toFixed(2)));itemsByPlayer[p.userId]=items;
  }
  const a=battle.players[0],b=battle.players[1],at=totals.get(a.userId)||0,bt=totals.get(b.userId)||0;
  if(at===bt)return {outcome:'draw',winnerUserId:null,payout:0,refundEach:true,players:battle.players.map(p=>({username:p.username,userId:p.userId,totalValue:totals.get(p.userId),items:itemsByPlayer[p.userId]}))};
  const winner=at>bt?a:b;
  return {outcome:'win',winnerUserId:winner.userId,winnerUsername:winner.username,payout:Number((battle.totalCostPerPlayer*2).toFixed(2)),players:battle.players.map(p=>({username:p.username,userId:p.userId,totalValue:totals.get(p.userId),items:itemsByPlayer[p.userId]}))};
}

function resolveCaseBattle(round,r,action){
  const ids=Array.isArray(round.state?.caseIds)?round.state.caseIds:[];if(!ids.length)return {outcome:'invalid',payout:0,error:'case_not_found'};
  let userTotal=0,houseTotal=0;const userItems=[],houseItems=[];
  for(const id of ids){const c=(round.state?.caseSnapshots||[]).find(x=>String(x.id)===String(id));if(!c)return {outcome:'invalid',payout:0,error:'case_not_found'};const pick=()=>{let x=r()*100,w=c.items[c.items.length-1];for(const it of c.items){x-=Math.max(0,Number(it.chance)||0);if(x<=0){w=it;break;}}return w;};const u=pick(),h=pick();userItems.push(u);houseItems.push(h);userTotal+=Number(u.price||0);houseTotal+=Number(h.price||0);}
  const win=userTotal>=houseTotal;return {outcome:win?'win':'loss',userItems,houseItems,userTotal,houseTotal,payout:win?round.betDls*2:0,multiplier:win?2:0};
}

