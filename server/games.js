import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'game-rounds.json');
const rounds = new Map();
const SERVER_AUTH_GAMES = new Set(['coinflip','mines','towers','roulette','keno','dice','blackjack','cases','case-battles','crash']);

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
    if (!SERVER_AUTH_GAMES.has(gameId)) return res.status(409).json({ok:false,error:'game_not_server_authoritative'});
    if (!gameId || !Number.isFinite(betDls) || betDls<=0 || betDls>100000000) return res.status(400).json({ok:false,error:'invalid_bet'});
    const result=economy.debitForGame(user.id,betDls,gameId);
    if (!result.ok) return res.status(400).json({ok:false,error:result.error});
    const serverSeed=crypto.randomBytes(32).toString('hex');
    const clientSeed=String(req.body?.clientSeed||'').slice(0,128) || crypto.randomBytes(16).toString('hex');
    const nonce=Date.now().toString();
    const commitment=hash(serverSeed);
    const round={id:id(),userId:user.id,username:user.username,gameId,betDls,status:'ACTIVE',
      serverSeed,serverSeedHash:commitment,clientSeed,nonce,createdAt:new Date().toISOString(),balanceAfterBet:result.balance};
    if (gameId==='blackjack') { const initial=startBlackjack(round); round.initialResult=initial; }
    if (gameId==='mines') {
      const size=Math.max(2,Math.min(8,Number(req.body?.gridSize)||5)); const total=size*size; const mineCount=Math.max(1,Math.min(total-1,Number(req.body?.mines)||3));
      const rr=rng(serverSeed+':mines'); const mineSet=new Set(); while(mineSet.size<mineCount) mineSet.add(Math.floor(rr()*total));
      round.state={size,mineCount,revealed:[],mineMap:[...mineSet]};
    } else if (gameId==='towers') {
      const cols=Math.max(2,Math.min(4,Number(req.body?.columns)||4)); const traps=Math.max(1,Math.min(cols-1,Number(req.body?.traps)||1));
      const rr=rng(serverSeed+':towers'); round.state={floor:0,cols,traps,trapsMap:Array.from({length:8},()=>{const set=new Set();while(set.size<traps)set.add(Math.floor(rr()*cols));return [...set];}),traps:Array.from({length:8},()=>[])}; round.state.traps=round.state.trapsMap; delete round.state.trapsMap;
    }
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
    const result=round.gameId==='blackjack' ? resolveBlackjack(round,action) : ((round.gameId==='coinflip' && action.cashout===true) ? resolveCashout(round, action) : resolveGame(round.gameId,random,action,round.betDls,round.state));
    const payout=Number((result.payout||0).toFixed(2));
    if (payout < 0 || payout > round.betDls * 100000) return res.status(400).json({ok:false,error:'invalid_payout'});
    const shouldCredit=(round.gameId==='blackjack' ? result.outcome!=='continue' : (action.cashout===true || action.final===true || !['coinflip'].includes(round.gameId)));
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

function makeBlackjackDeck(seed) {
  const suits=['♠','♥','♦','♣'], ranks=[['A',11],['2',2],['3',3],['4',4],['5',5],['6',6],['7',7],['8',8],['9',9],['10',10],['J',10],['Q',10],['K',10]];
  const deck=[]; for(const suit of suits)for(const [rank,value] of ranks)deck.push({suit,rank,value});
  const rr=rng(seed); for(let i=deck.length-1;i>0;i--){const j=Math.floor(rr()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];} return deck;
}
function blackjackScore(cards){let total=cards.reduce((n,c)=>n+c.value,0), aces=cards.filter(c=>c.rank==='A').length;while(total>21&&aces-- >0)total-=10;return total;}
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
    if(st.phase!=='player'||st.player.length!==2||!Number.isFinite(st.bet*2))return {error:'invalid_action',payout:0};
    const extra=round.betDls;if(!economySafeDebit){} st.bet*=2; st.player.push(st.deck.pop()); const score=blackjackScore(st.player); st.phase='dealer'; if(score>21){st.phase='finished';return {outcome:'loss',player:st.player,dealer:st.dealer,payout:0,score};}
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
    const floor=Math.max(0,Number(round.state?.floor)||0);const multipliers=[1.28,1.65,2.15,2.8,3.65,4.8,6.3,8.3];const multiplier=floor?multipliers[Math.min(floor-1,7)]:1;return {outcome:'cashout',floor,multiplier,payout:round.betDls*multiplier,cashedOut:true};
  }
  const mults=[1.92,3.84,7.68,15.36,30.72,61.44,122.88,245.76,491.52];
  const step=Math.max(0,Math.min(mults.length,Number(action.step)||0));
  const multiplier=step>0?mults[step-1]:1;
  return {outcome:'cashout',step,multiplier,payout:round.betDls*multiplier,cashedOut:true};
}

function resolveGame(gameId,r,action,bet,state) {
  switch(gameId) {
    case 'mines': {
      const size=Math.max(2,Math.min(8,Number(state?.size)||Number(action.gridSize)||5)); const total=size*size; const mineCount=Math.max(1,Math.min(total-1,Number(state?.mineCount)||Number(action.mines)||3));
      const selected=Number(action.selected); const mineSet=new Set(Array.isArray(state?.mineMap)?state.mineMap.map(Number):[]);
      const revealed=Array.isArray(state?.revealed)?state.revealed.map(Number):[];
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
      const generated=Array.isArray(state?.traps)?state.traps:[]; if(!generated.length)return {outcome:'invalid',payout:0,error:'round_state_missing'};
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
    }
    default: {
      const win=r()>=0.5; return {outcome:win?'win':'loss',multiplier:win?1.9:0,payout:win?bet*1.9:0};
    }
  }
}
function payoutMul(win,m){return win?m:0;}
function isRed(n){return [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(n);}
function isBlack(n){return n!==0&&!isRed(n);}
