import crypto from 'crypto';
import { getMongoDb, withMongoTransaction } from './mongo-store.js';
import { recordGameActivity, recordGameOutcome } from './progression.js';

export const CURRENCIES = Object.freeze(['WL','DL','BGL']);
export const WL_PER = Object.freeze({ WL:1, DL:100, BGL:10000 });

function id(prefix){ return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`; }
function normalizeCurrency(value){ const c=String(value||'DL').trim().toUpperCase(); return CURRENCIES.includes(c)?c:null; }
export function currencyAmountToWl(currency, amount){
  const c=normalizeCurrency(currency); const n=Number(amount);
  if(!c || !Number.isFinite(n) || n<=0) return null;
  const units=Math.round(n*WL_PER[c]);
  return units>0 ? units : null;
}
export function wlToCurrencyAmount(currency, units){ return Number(units||0)/WL_PER[currency]; }
function cleanBalances(value){
  const b=value&&typeof value==='object'?value:{};
  return {WL:Math.max(0,Math.trunc(Number(b.WL)||0)),DL:Math.max(0,Math.trunc(Number(b.DL)||0)),BGL:Math.max(0,Math.trunc(Number(b.BGL)||0))};
}
function publicWallet(doc){
  const balancesWl=cleanBalances(doc?.balancesWl);
  return {
    balances: {
      WL: wlToCurrencyAmount('WL',balancesWl.WL),
      DL: wlToCurrencyAmount('DL',balancesWl.DL),
      BGL: wlToCurrencyAmount('BGL',balancesWl.BGL),
    },
    balancesWl,
    updatedAt: doc?.updatedAt || null,
  };
}
async function ensureWallet(session,mongo,userId){
  const c=mongo.collection('wallets');
  let wallet=await c.findOne({userId},{session});
  if(wallet && wallet.balancesWl) return {...wallet,balancesWl:cleanBalances(wallet.balancesWl)};
  const legacy=Math.round(Number(wallet?.balanceDls||0)*100);
  const balancesWl=cleanBalances(wallet?.balancesWl||{});
  if(!balancesWl.DL && legacy>0) balancesWl.DL=legacy;
  await c.updateOne(
    {userId},
    {$set:{userId,balancesWl,balanceDls:balancesWl.DL/100,updatedAt:new Date()}},
    {upsert:true,session}
  );
  return {...wallet,userId,balancesWl};
}
function ledgerDoc({userId,username,type,currency,amount,amountWl,beforeWl,afterWl,referenceId,metadata={}}){
  return {id:id('txn'),userId,username,type,currency,amount,amountWl,amountDls:amountWl/100,balanceBefore:wlToCurrencyAmount(currency,beforeWl),balanceAfter:wlToCurrencyAmount(currency,afterWl),balanceBeforeWl:beforeWl,balanceAfterWl:afterWl,referenceId:referenceId||null,metadata,createdAt:new Date()};
}
async function mutateCurrency(session,mongo,{userId,username,type,currency,amountWl,referenceId,metadata}){
  const wallet=await ensureWallet(session,mongo,userId);
  const before=wallet.balancesWl[currency];
  const after=before+amountWl;
  if(after<0){ const e=new Error('insufficient_balance'); e.code='INSUFFICIENT_BALANCE'; throw e; }
  const next={...wallet.balancesWl,[currency]:after};
  const result=await mongo.collection('wallets').updateOne(
    {userId,balancesWl:wallet.balancesWl},
    {$set:{balancesWl:next,balanceDls:next.DL/100,updatedAt:new Date()}},
    {session}
  );
  if(result.modifiedCount!==1){ const e=new Error('WALLET_WRITE_CONFLICT'); e.code='WALLET_WRITE_CONFLICT'; throw e; }
  await mongo.collection('ledger').insertOne(ledgerDoc({userId,username,type,currency,amount:wlToCurrencyAmount(currency,amountWl),amountWl,beforeWl:before,afterWl:after,referenceId,metadata}),{session});
  return {beforeWl:before,afterWl:after,balancesWl:next};
}
export async function getWallet(userId){
  const mongo=await getMongoDb();
  return withMongoTransaction(async(session,db)=>{
    const user=await db.collection('users').findOne({id:userId},{session});
    if(!user) return null;
    const wallet=await ensureWallet(session,db,userId);
    return publicWallet(wallet);
  });
}
export async function debitForGame(userId,amountDls,gameId){
  const amountWl=currencyAmountToWl('DL',amountDls);
  if(!amountWl) return {ok:false,error:'invalid_amount'};
  const referenceId=id('bet');
  try{
    return await withMongoTransaction(async(session,mongo)=>{
      const user=await mongo.collection('users').findOne({id:userId},{session});
      if(!user) return {ok:false,error:'user_not_found'};
      const r=await mutateCurrency(session,mongo,{userId,username:user.username,type:'BET',currency:'DL',amountWl:-amountWl,referenceId,metadata:{gameId}});
      await recordGameActivity(session,mongo,{userId,username:user.username,gameId,betDls:amountWl/100,referenceId});
      return {ok:true,balance:r.balancesWl.DL/100,balanceWl:r.balancesWl.DL,balancesWl:r.balancesWl,referenceId};
    });
  }catch(error){
    if(error.code==='INSUFFICIENT_BALANCE') return {ok:false,error:'insufficient_balance'};
    if(error.code==='WALLET_WRITE_CONFLICT') return {ok:false,error:'wallet_write_conflict'};
    throw error;
  }
}
export async function creditGameResult(userId,amountDls,round){
  const amountWl=Math.max(0,Math.round(Number(amountDls||0)*100));
  return withMongoTransaction(async(session,mongo)=>{
    const user=await mongo.collection('users').findOne({id:userId},{session});
    if(!user) return {ok:false,error:'user_not_found'};
    const existing=await mongo.collection('ledger').findOne({userId,type:'GAME_PAYOUT',referenceId:round.id},{session});
    const wallet=await ensureWallet(session,mongo,userId);
    if(existing) return {ok:true,balance:wallet.balancesWl.DL/100,balancesWl:wallet.balancesWl,duplicate:true};
    const betDls=Number(round?.betDls||0);
    if(amountWl<=0){
      if(betDls>0) await recordGameOutcome(session,mongo,{userId,username:user.username,gameId:round.gameId,roundId:round.id,betDls,payoutDls:0});
      return {ok:true,balance:wallet.balancesWl.DL/100,balancesWl:wallet.balancesWl};
    }
    const r=await mutateCurrency(session,mongo,{userId,username:user.username,type:'GAME_PAYOUT',currency:'DL',amountWl,referenceId:round.id,metadata:{gameId:round.gameId,multiplier:round.result?.multiplier||0}});
    if(betDls>0) await recordGameOutcome(session,mongo,{userId,username:user.username,gameId:round.gameId,roundId:round.id,betDls,payoutDls:amountWl/100});
    return {ok:true,balance:r.balancesWl.DL/100,balancesWl:r.balancesWl};
  });
}
async function requireAuth(req,res,sessionUser){
  const user=await sessionUser(req);
  if(!user) {res.status(401).json({ok:false,error:'not_authenticated'});return null;}
  if(user.isBanned){res.status(403).json({ok:false,error:'account_banned'});return null;}
  return user;
}
function publicUser(user,wallet){
  return {id:user.id,username:user.username,growId:user.growId||undefined,gtpsLinked:Boolean(user.gtpsLinked&&user.growId),balanceDls:wallet.balances.DL,balances:wallet.balances,balancesWl:wallet.balancesWl,linkCode:user.linkCode,isBanned:Boolean(user.isBanned),isMuted:Boolean(user.isMuted),isAdmin:Boolean(user.isAdmin)};
}
export function installWalletRoutes(app,{sessionUser,getGtpsSecret,gtpsBridgeUrl,broadcast}){
  app.get('/api/economy/wallet',async(req,res)=>{
    const user=await requireAuth(req,res,sessionUser); if(!user)return;
    const wallet=await getWallet(user.id);
    res.json({ok:true,wallet,user:publicUser(user,wallet)});
  });

  app.get('/api/economy/transactions',async(req,res)=>{
    const user=await requireAuth(req,res,sessionUser); if(!user)return;
    const mongo=await getMongoDb();
    const transactions=await mongo.collection('ledger').find({userId:user.id}).sort({createdAt:-1}).limit(200).toArray();
    res.json({ok:true,transactions:transactions.map(({_id,...x})=>x)});
  });

  app.post('/api/economy/tip',async(req,res)=>{
    const sender=await requireAuth(req,res,sessionUser); if(!sender)return;
    const target=String(req.body?.targetUser||'').trim();
    const currency=normalizeCurrency(req.body?.currency||'DL');
    const amountWl=currencyAmountToWl(currency,req.body?.amount);
    const message=String(req.body?.message||'').slice(0,200);
    if(!target||!currency||!amountWl)return res.status(400).json({ok:false,error:'invalid_tip'});
    const mongo=await getMongoDb();
    try{
      const result=await withMongoTransaction(async(session,db)=>{
        const from=await db.collection('users').findOne({id:sender.id},{session});
        const to=await db.collection('users').findOne({usernameNormalized:String(target).trim().toLowerCase()},{session});
        if(!to)return {error:'recipient_not_found'};
        if(to.id===from.id)return {error:'self_tip'};
        const ref=id('tip');
        const a=await mutateCurrency(session,db,{userId:from.id,username:from.username,type:'TIP_SEND',currency,amountWl:-amountWl,referenceId:ref,metadata:{recipient:to.username,message}});
        await mutateCurrency(session,db,{userId:to.id,username:to.username,type:'TIP_RECEIVE',currency,amountWl,referenceId:ref,metadata:{sender:from.username,message}});
        return {from,to,balancesWl:a.balancesWl};
      });
      if(result.error==='recipient_not_found')return res.status(404).json({ok:false,error:result.error});
      if(result.error==='self_tip')return res.status(400).json({ok:false,error:result.error});
      const wallet=publicWallet({balancesWl:result.balancesWl});
      res.json({ok:true,user:publicUser(result.from,wallet),recipient:{username:result.to.username},currency,amount:wlToCurrencyAmount(currency,amountWl),wallet});
    }catch(error){
      if(error.code==='INSUFFICIENT_BALANCE')return res.status(400).json({ok:false,error:error.message});
      throw error;
    }
  });

  app.post('/api/admin/balance',async(req,res)=>{
    const admin=await requireAuth(req,res,sessionUser); if(!admin||!admin.isAdmin)return res.status(403).json({ok:false,error:'admin_required'});
    const username=String(req.body?.username||'').trim();
    const currency=normalizeCurrency(req.body?.currency||'DL');
    const amountWl=currencyAmountToWl(currency,req.body?.amount);
    const mode=req.body?.mode;
    if(!username||!currency||!amountWl||!['add','remove'].includes(mode))return res.status(400).json({ok:false,error:'invalid_request'});
    const mongo=await getMongoDb();
    try{
      const result=await withMongoTransaction(async(session,db)=>{
        const user=await db.collection('users').findOne({usernameNormalized:username.toLowerCase()},{session});
        if(!user)return {error:'user_not_found'};
        const r=await mutateCurrency(session,db,{userId:user.id,username:user.username,type:'ADMIN_ADJUSTMENT',currency,amountWl:mode==='add'?amountWl:-amountWl,referenceId:id('admin'),metadata:{admin:admin.username,mode}});
        return {user,r};
      });
      if(result.error)return res.status(404).json({ok:false,error:result.error});
      const wallet=publicWallet({balancesWl:result.r.balancesWl});
      res.json({ok:true,user:publicUser(result.user,wallet),wallet});
    }catch(error){
      if(error.code==='INSUFFICIENT_BALANCE')return res.status(400).json({ok:false,error:'insufficient_balance'});
      throw error;
    }
  });

  app.post('/api/gtps/deposit-webhook',async(req,res)=>{
    const secret=String(req.body?.secretKey||req.headers['x-gtps-secret']||'');
    if(!secret||secret!==getGtpsSecret())return res.status(403).json({ok:false,error:'invalid_secret_key'});
    const transactionId=String(req.body?.transactionId||'').trim();
    const growId=String(req.body?.growId||'').trim();
    const currency=normalizeCurrency(req.body?.currency||'DL');
    const amountWl=currencyAmountToWl(currency,req.body?.amount);
    if(!transactionId||!growId||!currency||!amountWl)return res.status(400).json({ok:false,error:'invalid_deposit'});
    try{
      const result=await withMongoTransaction(async(session,db)=>{
        const existing=await db.collection('deposits').findOne({transactionId},{session});
        if(existing)return {duplicate:true,deposit:existing};
        const user=await db.collection('users').findOne({growIdNormalized:growId.toLowerCase()},{session});
        if(!user)return {error:'growid_not_linked'};
        const r=await mutateCurrency(session,db,{userId:user.id,username:user.username,type:'DEPOSIT',currency,amountWl,referenceId:transactionId,metadata:{growId,currency,amount:Number(req.body.amount)}});
        const deposit={transactionId,growId,userId:user.id,username:user.username,currency,amount:wlToCurrencyAmount(currency,amountWl),amountWl,status:'COMPLETED',createdAt:new Date()};
        await db.collection('deposits').insertOne(deposit,{session});
        return {user,deposit,r};
      });
      if(result.duplicate)return res.json({ok:true,duplicate:true,deposit:result.deposit});
      if(result.error==='growid_not_linked')return res.status(404).json({ok:false,error:result.error});
      if(typeof broadcast==='function')broadcast({type:'GTPS_DEPOSIT',payload:{growId,currency,amount:wlToCurrencyAmount(currency,amountWl),transactionId,timestamp:Date.now()}});
      res.json({ok:true,duplicate:false,deposit:result.deposit,wallet:publicWallet({balancesWl:result.r.balancesWl})});
    }catch(error){res.status(500).json({ok:false,error:'deposit_failed'});}
  });

  app.post('/api/gtps/withdraw-request',async(req,res)=>{
    const user=await requireAuth(req,res,sessionUser); if(!user)return;
    const growId=String(user.growId||'').trim();
    const currency=normalizeCurrency(req.body?.currency||'DL');
    const amountWl=currencyAmountToWl(currency,req.body?.amount);
    if(!growId||!user.gtpsLinked)return res.status(400).json({ok:false,error:'growid_belum_link'});
    if(!currency||!amountWl)return res.status(400).json({ok:false,error:'invalid_amount'});
    const idempotencyKey=String(req.headers['idempotency-key']||'').trim().slice(0,128);
    const withdrawalId=id('wd');
    try{
      const reserved=await withMongoTransaction(async(session,db)=>{
        if(idempotencyKey){
          const prior=await db.collection('withdrawals').findOne({userId:user.id,idempotencyKey},{session});
          if(prior)return {duplicate:true,withdrawal:prior};
        }
        const fresh=await db.collection('users').findOne({id:user.id},{session});
        const r=await mutateCurrency(session,db,{userId:user.id,username:fresh.username,type:'WITHDRAW_PENDING',currency,amountWl:-amountWl,referenceId:withdrawalId,metadata:{growId,currency,amount:wlToCurrencyAmount(currency,amountWl)}});
        const withdrawal={id:withdrawalId,userId:user.id,username:fresh.username,growId,currency,amount:wlToCurrencyAmount(currency,amountWl),amountWl,status:'PENDING',idempotencyKey:idempotencyKey||null,createdAt:new Date()};
        await db.collection('withdrawals').insertOne(withdrawal,{session});
        return {withdrawal,r};
      });
      if(reserved.duplicate)return res.json({ok:true,duplicate:true,status:reserved.withdrawal.status,withdrawalId:reserved.withdrawal.id,wallet:await getWallet(user.id)});
      const bridgeRes=await fetch(`${gtpsBridgeUrl}/supreme/withdraw`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secretKey:getGtpsSecret(),withdrawalId,growId,currency,amount:wlToCurrencyAmount(currency,amountWl)})});
      const data=await bridgeRes.json().catch(()=>({ok:false,error:'bridge_invalid_response'}));
      if(!data.ok){
        await withMongoTransaction(async(session,db)=>{
          const w=await db.collection('withdrawals').findOne({id:withdrawalId},{session});
          if(!w||w.status!=='PENDING')return;
          const fresh=await db.collection('users').findOne({id:user.id},{session});
          await mutateCurrency(session,db,{userId:user.id,username:fresh.username,type:'WITHDRAW_REFUND',currency,amountWl,referenceId:withdrawalId,metadata:{reason:data.error||'bridge_rejected'}});
          await db.collection('withdrawals').updateOne({id:withdrawalId,status:'PENDING'},{$set:{status:'FAILED',error:data.error||'bridge_rejected',updatedAt:new Date()}},{session});
        });
        return res.status(bridgeRes.status||502).json({ok:false,error:data.error||'withdraw_failed'});
      }
      await getMongoDb().then(db=>db.collection('withdrawals').updateOne({id:withdrawalId,status:'PENDING'},{$set:{status:'COMPLETED',updatedAt:new Date()}}));
      res.json({ok:true,status:'COMPLETED',withdrawalId,wallet:await getWallet(user.id)});
    }catch(error){
      if(error.code==='INSUFFICIENT_BALANCE')return res.status(400).json({ok:false,error:'insufficient_balance'});
      if(error.code==='WALLET_WRITE_CONFLICT')return res.status(409).json({ok:false,error:'wallet_write_conflict'});
      res.status(500).json({ok:false,error:'withdrawal_failed'});
    }
  });

  app.get('/api/admin/reconciliation',async(req,res)=>{
    const admin=await requireAuth(req,res,sessionUser); if(!admin||!admin.isAdmin)return res.status(403).json({ok:false,error:'admin_required'});
    const mongo=await getMongoDb();
    const [wallets,ledger]=await Promise.all([
      mongo.collection('wallets').find({},{projection:{_id:0,userId:1,balancesWl:1}}).toArray(),
      mongo.collection('ledger').find({},{projection:{_id:0,userId:1,currency:1,amountWl:1}}).toArray()
    ]);
    const sums=new Map();
    for(const row of ledger){
      const key=String(row.userId); const current=sums.get(key)||{WL:0,DL:0,BGL:0};
      const currency=normalizeCurrency(row.currency||'DL'); if(currency) current[currency]+=Number(row.amountWl||0);
      sums.set(key,current);
    }
    const discrepancies=[];
    for(const wallet of wallets){
      const actual=cleanBalances(wallet.balancesWl); const expected=sums.get(String(wallet.userId))||{WL:0,DL:0,BGL:0};
      for(const currency of CURRENCIES){
        const delta=actual[currency]-expected[currency];
        if(delta!==0) discrepancies.push({userId:wallet.userId,currency,balance:wlToCurrencyAmount(currency,actual[currency]),ledgerBalance:wlToCurrencyAmount(currency,expected[currency]),delta:wlToCurrencyAmount(currency,delta),deltaWl:delta});
      }
    }
    res.json({ok:true,consistent:discrepancies.length===0,checkedWallets:wallets.length,discrepancies,checkedAt:new Date().toISOString(),baseUnit:'WL'});
  });

  app.get('/api/admin/withdrawals',async(req,res)=>{
    const admin=await requireAuth(req,res,sessionUser); if(!admin||!admin.isAdmin)return res.status(403).json({ok:false,error:'admin_required'});
    const mongo=await getMongoDb(); const withdrawals=await mongo.collection('withdrawals').find({}).sort({createdAt:-1}).limit(200).toArray();
    res.json({ok:true,withdrawals:withdrawals.map(({_id,...x})=>x)});
  });

  app.post('/api/admin/withdrawals/:id/reconcile',async(req,res)=>{
    const admin=await requireAuth(req,res,sessionUser); if(!admin||!admin.isAdmin)return res.status(403).json({ok:false,error:'admin_required'});
    const withdrawalId=String(req.params.id); const action=String(req.body?.action||'');
    if(!['complete','fail_refund'].includes(action))return res.status(400).json({ok:false,error:'invalid_reconcile_action'});
    try{
      const result=await withMongoTransaction(async(session,db)=>{
        const w=await db.collection('withdrawals').findOne({id:withdrawalId},{session});
        if(!w)return {error:'withdrawal_not_found'}; if(!['PENDING','UNKNOWN'].includes(w.status))return {error:'withdrawal_already_final',status:w.status};
        const user=await db.collection('users').findOne({id:w.userId},{session}); if(!user)return {error:'user_not_found'};
        const changed=await db.collection('withdrawals').updateOne({id:withdrawalId,status:{$in:['PENDING','UNKNOWN']}},{$set:{status:action==='complete'?'COMPLETED':'FAILED',reconciledBy:admin.username,reconciledAt:new Date()}},{session});
        if(changed.modifiedCount!==1)return {error:'withdrawal_already_final'};
        let wallet=null;
        if(action==='fail_refund'){
          const r=await mutateCurrency(session,db,{userId:user.id,username:user.username,type:'WITHDRAW_REFUND',currency:normalizeCurrency(w.currency)||'DL',amountWl:Math.max(0,Number(w.amountWl)||0),referenceId:withdrawalId,metadata:{reason:'admin_reconcile',admin:admin.username}});
          wallet=publicWallet({balancesWl:r.balancesWl});
        }
        return {status:action==='complete'?'COMPLETED':'FAILED',wallet};
      });
      if(result.error==='withdrawal_not_found')return res.status(404).json({ok:false,error:result.error});
      if(result.error)return res.status(409).json({ok:false,error:result.error,status:result.status});
      res.json({ok:true,status:result.status,wallet:result.wallet||await getWallet((await sessionUser(req)).id)});
    }catch(error){res.status(500).json({ok:false,error:'reconciliation_failed'});}
  });

  app.get('/api/economy/currencies',async(_req,res)=>{
    res.json({ok:true,currencies:CURRENCIES.map(code=>({code,wlPerUnit:WL_PER[code]})),baseUnit:'WL'});
  });
}
