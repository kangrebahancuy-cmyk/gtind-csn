import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'game-rounds.json');
const rounds = new Map();

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify([], null, 2));
}
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
function rng(seed) {
  let counter = 0;
  return () => {
    const h = crypto.createHmac('sha256', seed).update(String(counter++)).digest();
    return h.readUInt32BE(0) / 0x100000000;
  };
}
function requireUser(req, res) {
  const user = req.__economyUser;
  if (!user) { res.status(401).json({ ok:false,error:'not_authenticated' }); return null; }
  return user;
}

export function installGameRoutes(app, economy) {
  app.use('/api/games', (req, _res, next) => {
    const user = economy.sessionUser(req);
    req.__economyUser = user;
    next();
  });

  app.get('/api/games/fairness', (req,res) => {
    const user=requireUser(req,res); if(!user)return;
    res.json({ok:true,algorithm:'HMAC-SHA256',description:'Server seed is generated server-side and only its SHA-256 commitment is exposed before the result.'});
  });

  app.post('/api/games/start', (req,res) => {
    const user=requireUser(req,res); if(!user)return;
    const gameId=String(req.body?.gameId||'').trim().toLowerCase();
    const betDls=Number(req.body?.betDls);
    if (!gameId || !Number.isFinite(betDls) || betDls<=0 || betDls>100000000) return res.status(400).json({ok:false,error:'invalid_bet'});
    const result=economy.debitForGame(user.id,betDls,gameId);
    if (!result.ok) return res.status(400).json({ok:false,error:result.error});
    const serverSeed=crypto.randomBytes(32).toString('hex');
    const clientSeed=String(req.body?.clientSeed||'').slice(0,128) || crypto.randomBytes(16).toString('hex');
    const nonce=Date.now().toString();
    const commitment=hash(serverSeed);
    const round={id:id(),userId:user.id,username:user.username,gameId,betDls,status:'ACTIVE',
      serverSeed,serverSeedHash:commitment,clientSeed,nonce,createdAt:new Date().toISOString(),balanceAfterBet:result.balance};
    rounds.set(round.id,round); persist();
    res.json({ok:true,roundId:round.id,serverSeedHash:commitment,clientSeed,nonce,balanceDls:result.balance});
  });

  app.post('/api/games/resolve', (req,res) => {
    const user=requireUser(req,res); if(!user)return;
    const round=rounds.get(String(req.body?.roundId||''));
    if(!round || round.userId!==user.id) return res.status(404).json({ok:false,error:'round_not_found'});
    if(round.status!=='ACTIVE') return res.status(409).json({ok:false,error:'round_already_resolved'});
    const action=req.body?.action && typeof req.body.action==='object' ? req.body.action : {};
    const step=Number.isInteger(action.step)?Math.max(0,action.step):0;
    const random=rng(round.serverSeed + ':' + round.clientSeed + ':' + round.nonce + ':' + step);
    const result=(round.gameId==='coinflip' && action.cashout===true) ? resolveCashout(round, action) : resolveGame(round.gameId,random,action,round.betDls);
    const payout=Number((result.payout||0).toFixed(2));
    if (payout < 0 || payout > round.betDls * 100000) return res.status(400).json({ok:false,error:'invalid_payout'});
    const shouldCredit=action.cashout===true || action.final===true || !['coinflip'].includes(round.gameId);
    let credit={ok:true,balance:round.balanceAfterBet};
    if(shouldCredit){
      credit=economy.creditGameResult(user.id,payout,round);
      if(!credit.ok) return res.status(500).json({ok:false,error:'credit_failed'});
      round.status='RESOLVED'; round.payoutDls=payout; round.resolvedAt=new Date().toISOString();
    }
    if (['mines','towers'].includes(round.gameId) && result.continue) { round.state=result.state; }
    round.lastStep=step; round.result=result; persist();
    res.json({ok:true,roundId:round.id,result,payoutDls:payout,balanceDls:credit.balance,finished:shouldCredit,serverSeed:shouldCredit?round.serverSeed:undefined,serverSeedHash:round.serverSeedHash,clientSeed:round.clientSeed,nonce:round.nonce});
  });
}

function resolveCashout(round, action) {
  const mults=[1.92,3.84,7.68,15.36,30.72,61.44,122.88,245.76,491.52];
  const step=Math.max(0,Math.min(mults.length,Number(action.step)||0));
  const multiplier=step>0?mults[step-1]:1;
  return {outcome:'cashout',step,multiplier,payout:round.betDls*multiplier,cashedOut:true};
}

function resolveGame(gameId,r,action,bet) {
  switch(gameId) {
    case 'mines': {
      const size=Math.max(2,Math.min(8,Number(action.gridSize)||5)); const total=size*size; const mineCount=Math.max(1,Math.min(total-1,Number(action.mines)||3));
      const selected=Number(action.selected); const prior=Array.isArray(action.revealed)?action.revealed.map(Number):[];
      const key=hash('mines:'+size+':'+mineCount+':'+bet+':'+Math.floor(r()*0xffffffff));
      const rr=rng(key); const mineSet=new Set(); while(mineSet.size<mineCount) mineSet.add(Math.floor(rr()*total));
      const revealed=[...new Set(prior)].filter(n=>n>=0&&n<total);
      if(!Number.isInteger(selected)||selected<0||selected>=total||revealed.includes(selected)) return {outcome:'invalid',payout:0,error:'invalid_tile'};
      const isMine=mineSet.has(selected); const next=[...revealed,selected]; const safeCount=next.filter(n=>!mineSet.has(n)).length;
      const prob=Array.from({length:safeCount},(_,i)=>(total-mineCount-i)/(total-i)).reduce((a,b)=>a*b,1);
      const multiplier=safeCount?Math.max(1.01,Number((0.99/prob).toFixed(2))):1;
      if(isMine) return {outcome:'loss',explodedTile:selected,mineMap:[...mineSet],multiplier:0,payout:0,continue:false};
      if(safeCount===total-mineCount) return {outcome:'win',safeCount,mineMap:[...mineSet],multiplier,payout:bet*multiplier,continue:false};
      return {outcome:'safe',safeCount,mineMap:[],multiplier,payout:0,continue:true,state:{size,mineCount,revealed:next,mineMap:[...mineSet]}};
    }
    case 'towers': {
      const cols=Math.max(2,Math.min(4,Number(action.columns)||4)); const traps=Math.max(1,Math.min(cols-1,Number(action.traps)||1)); const floor=Math.max(0,Number(action.floor)||0);
      const rr=rng('tower:'+Math.floor(r()*0xffffffff)+':'+cols+':'+traps); const generated=Array.from({length:8},()=>{const set=new Set();while(set.size<traps)set.add(Math.floor(rr()*cols));return [...set];});
      const col=Number(action.col); if(!Number.isInteger(col)||col<0||col>=cols||floor>7)return {outcome:'invalid',payout:0,error:'invalid_tile'};
      const isTrap=generated[floor].includes(col); const multipliers=action.multipliers&&Array.isArray(action.multipliers)?action.multipliers.map(Number):[1.28,1.65,2.15,2.8,3.65,4.8,6.3,8.3];
      if(isTrap)return {outcome:'loss',floor,col,traps:generated,payout:0,continue:false};
      const nextFloor=floor+1; const multiplier=multipliers[Math.min(nextFloor-1,multipliers.length-1)]||1;
      if(nextFloor>=8)return {outcome:'win',floor:nextFloor,traps:generated,multiplier,payout:bet*multiplier,continue:false};
      return {outcome:'safe',floor:nextFloor,traps:[],multiplier,payout:0,continue:true,state:{floor:nextFloor,traps:generated}};
    }
    case 'coinflip': {
      const win=r()<0.5; const choice=action.choice||'heads'; const step=Math.max(0,Number(action.step)||0); const mults=[1.92,3.84,7.68,15.36,30.72,61.44,122.88,245.76,491.52]; const multiplier=mults[Math.min(step,mults.length-1)]||1.92; const cashout=action.cashout===true; const payout=action.final&&win?bet*multiplier:(cashout?bet*(step>0?mults[Math.min(step-1,mults.length-1)]:1):0); return { outcome:win?'win':'loss', choice, winningSide:win?choice:(choice==='heads'?'tails':'heads'), step, multiplier:win?multiplier:0, payout, cashedOut:cashout&&win };
    }
    case 'roulette': {
      const n=Math.floor(r()*37); const bets=action.bets && typeof action.bets==='object'?action.bets:{};
      let payout=0; const color=isRed(n)?'red':n===0?'green':'black';
      const add=(key,m)=>{const a=Number(bets[key]||0);if(Number.isFinite(a)&&a>0)payout+=a*m;};
      add(`num_${n}`,36);
      if(n>=1&&n<=12)add('1st_12',3); else if(n<=24&&n>=13)add('2nd_12',3); else if(n>=25)add('3rd_12',3);
      if(n>0){ if(n%3===1)add('col_1',3); if(n%3===2)add('col_2',3); if(n%3===0)add('col_3',3); }
      if(color==='red')add('red',2); if(color==='black')add('black',2);
      if(n>0&&n%2===0)add('even',2); if(n>0&&n%2===1)add('odd',2);
      if(n>=1&&n<=18)add('1_to_18',2); if(n>=19&&n<=36)add('19_to_36',2);
      return {winningNumber:n,color,outcome:payout>0?'win':'loss',payout,multiplier:bet?payout/bet:0};
    }
    case 'keno': {
      const pool=Array.from({length:40},(_,i)=>i+1); const drawn=[];
      while(drawn.length<10){ const i=Math.floor(r()*pool.length); drawn.push(pool.splice(i,1)[0]); }
      const picks=Array.isArray(action.picks)?action.picks.map(Number):[]; const hits=picks.filter(n=>drawn.includes(n)).length;
      const multipliers=[0,0,0,1.5,3,8,20,50,100,250,1000]; const m=multipliers[Math.min(hits,multipliers.length-1)]||0;
      return {drawn,hits,multiplier:m,payout:bet*m};
    }
    case 'dice': {
      const roll=Number((r()*100).toFixed(2)); const target=Number(action.target||50); const over=action.condition==='over';
      const win=over?roll>target:roll<target; const probability=over?100-target:target; const m=Math.max(1.01,Math.min(95,99/probability));
      return {roll,target,condition:over?'over':'under',outcome:win?'win':'loss',multiplier:win?m:0,payout:win?bet*m:0};
    }
    case 'cases': {
      return {outcome:'unsupported',payout:0,error:'case_catalog_must_be_server_owned'};
      /*
      const items=Array.isArray(action.items)?action.items:[]; if(!items.length) return {outcome:'loss',payout:0};
      const total=items.reduce((n,x)=>n+Math.max(0,Number(x.chance||0)),0); let x=r()*total, chosen=items[items.length-1];
      for(const item of items){x-=Math.max(0,Number(item.chance||0));if(x<=0){chosen=item;break;}}
      const value=Math.max(0,Number(chosen.valueDls||0)); return {itemId:chosen.id||null,itemValueDls:value,multiplier:bet?value/bet:0,payout:value};
    }
    default: {
      const win=r()>=0.5; return {outcome:win?'win':'loss',multiplier:win?1.9:0,payout:win?bet*1.9:0};
    }
  }
}
function payoutMul(win,m){return win?m:0;}
function isRed(n){return [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(n);}
function isBlack(n){return n!==0&&!isRed(n);}
