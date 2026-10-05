import crypto from 'crypto';
import { getMongoDb, withMongoTransaction } from './mongo-store.js';

const CLAIM_TTL_MS = 2 * 60 * 1000;
const CURRENCIES = new Set(['WL','DL','BGL']);

function equalSecret(a,b){
  const aa=Buffer.from(String(a||'')); const bb=Buffer.from(String(b||''));
  return aa.length>0 && aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
function authorize(req,getSecret){
  const secret=String(req.query?.secretKey||req.body?.secretKey||req.headers['x-gtps-secret']||'');
  return equalSecret(secret,getSecret?.());
}
function normalizeGrowId(v){return String(v||'').trim().toLowerCase();}
function token(){return crypto.randomBytes(32).toString('hex');}

export function installGtpsRoutes(app,{getGtpsSecret}){
  app.get('/api/gtps/status',async(req,res)=>{
    if(!authorize(req,getGtpsSecret))return res.status(403).json({ok:false,error:'invalid_secret_key'});
    const db=await getMongoDb();
    const [pending,processing,linked]=await Promise.all([
      db.collection('withdrawals').countDocuments({status:'PENDING'}),
      db.collection('withdrawals').countDocuments({status:'PROCESSING'}),
      db.collection('users').countDocuments({gtpsLinked:true}),
    ]);
    res.json({ok:true,service:'gtps-integration',storage:'sqlite',pendingWithdrawals:pending,processingWithdrawals:processing,linkedPlayers:linked,timestamp:new Date().toISOString()});
  });

  app.get('/api/gtps/withdraw-pending',async(req,res)=>{
    if(!authorize(req,getGtpsSecret))return res.status(403).json({ok:false,error:'invalid_secret_key'});
    const growId=String(req.query?.growId||'').trim();
    if(!growId)return res.status(400).json({ok:false,error:'invalid_growid'});
    const db=await getMongoDb();
    try{
      const result=await withMongoTransaction(async(session,mongo)=>{
        const now=new Date();
        const user=await mongo.collection('users').findOne({growIdNormalized:normalizeGrowId(growId),gtpsLinked:true},{session});
        if(!user)return {error:'growid_not_linked'};
        await mongo.collection('withdrawals').updateMany({userId:user.id,status:'PROCESSING',claimExpiresAt:{$lte:now}},{$set:{status:'PENDING',claimToken:null,claimExpiresAt:null,updatedAt:now}},{session});
        const w=await mongo.collection('withdrawals').findOne({userId:user.id,status:'PENDING'},{sort:{createdAt:1},session});
        if(!w)return {pending:false};
        const claim=token(); const expires=new Date(Date.now()+CLAIM_TTL_MS);
        const changed=await mongo.collection('withdrawals').updateOne({id:w.id,status:'PENDING'},{$set:{status:'PROCESSING',claimToken:claim,claimExpiresAt:expires,updatedAt:now}},{session});
        if(changed.modifiedCount!==1)return {pending:false};
        return {pending:true,withdrawal:{id:w.id,growId:user.growId,currency:w.currency,amount:w.amount,amountWl:w.amountWl,claimToken:claim,claimExpiresAt:expires.toISOString()}};
      });
      if(result.error==='growid_not_linked')return res.status(404).json({ok:false,error:result.error});
      res.json(result.pending ? {ok:true,pending:true,withdrawalId:result.withdrawal.id,growId:result.withdrawal.growId,currency:result.withdrawal.currency,amount:result.withdrawal.amount,amountWl:result.withdrawal.amountWl,claimToken:result.withdrawal.claimToken,claimExpiresAt:result.withdrawal.claimExpiresAt} : {ok:true,pending:false});
    }catch(error){console.error('[gtps-withdraw-poll]',error);res.status(500).json({ok:false,error:'withdrawal_poll_failed'});}
  });

  app.post('/api/gtps/withdraw-confirm',async(req,res)=>{
    if(!authorize(req,getGtpsSecret))return res.status(403).json({ok:false,error:'invalid_secret_key'});
    const withdrawalId=String(req.body?.withdrawalId||'').trim();
    const claimToken=String(req.body?.claimToken||'').trim();
    const growId=String(req.body?.growId||'').trim();
    if(!withdrawalId||!claimToken||!growId)return res.status(400).json({ok:false,error:'invalid_confirmation'});
    const db=await getMongoDb();
    try{
      const result=await withMongoTransaction(async(session,mongo)=>{
        const w=await mongo.collection('withdrawals').findOne({id:withdrawalId},{session});
        if(!w)return {error:'withdrawal_not_found'};
        if(w.status==='COMPLETED')return {ok:true,duplicate:true,status:'COMPLETED'};
        if(w.status!=='PROCESSING'||w.claimToken!==claimToken)return {error:'invalid_claim'};
        if(new Date(w.claimExpiresAt||0).getTime()<Date.now())return {error:'claim_expired'};
        if(normalizeGrowId(w.growId)!==normalizeGrowId(growId))return {error:'growid_mismatch'};
        const changed=await mongo.collection('withdrawals').updateOne({id:withdrawalId,status:'PROCESSING',claimToken},{$set:{status:'COMPLETED',claimToken:null,claimExpiresAt:null,confirmedAt:new Date(),updatedAt:new Date()}},{session});
        if(changed.modifiedCount!==1)return {error:'withdrawal_already_final'};
        return {ok:true,status:'COMPLETED'};
      });
      if(result.error==='withdrawal_not_found')return res.status(404).json({ok:false,error:result.error});
      if(result.error)return res.status(409).json({ok:false,error:result.error});
      res.json(result);
    }catch(error){res.status(500).json({ok:false,error:'withdrawal_confirmation_failed'});}
  });

  app.post('/api/gtps/withdraw-fail',async(req,res)=>{
    if(!authorize(req,getGtpsSecret))return res.status(403).json({ok:false,error:'invalid_secret_key'});
    const withdrawalId=String(req.body?.withdrawalId||'').trim();
    const claimToken=String(req.body?.claimToken||'').trim();
    const reason=String(req.body?.reason||'gtps_item_delivery_failed').slice(0,200);
    if(!withdrawalId||!claimToken)return res.status(400).json({ok:false,error:'invalid_failure'});
    try{
      const result=await withMongoTransaction(async(session,mongo)=>{
        const w=await mongo.collection('withdrawals').findOne({id:withdrawalId},{session});
        if(!w)return {error:'withdrawal_not_found'};
        if(w.status==='FAILED')return {ok:true,duplicate:true,status:'FAILED'};
        if(w.status!=='PROCESSING'||w.claimToken!==claimToken)return {error:'invalid_claim'};
        const currency=CURRENCIES.has(String(w.currency).toUpperCase())?String(w.currency).toUpperCase():'DL';
        const amountWl=Math.max(0,Number(w.amountWl)||0);
        const user=await mongo.collection('users').findOne({id:w.userId},{session});
        const wallet=await mongo.collection('wallets').findOne({userId:w.userId},{session});
        const balances={WL:Number(wallet?.balancesWl?.WL||0),DL:Number(wallet?.balancesWl?.DL||0),BGL:Number(wallet?.balancesWl?.BGL||0)};
        balances[currency]+=amountWl;
        await mongo.collection('wallets').updateOne({userId:w.userId},{$set:{balancesWl:balances,balanceDls:balances.DL/100,updatedAt:new Date()}},{session});
        await mongo.collection('ledger').insertOne({id:'txn_'+crypto.randomUUID(),userId:w.userId,username:user.username,type:'WITHDRAW_REFUND',currency,amount:amountWl/({WL:1,DL:100,BGL:10000}[currency]),amountWl,balanceBeforeWl:balances[currency]-amountWl,balanceAfterWl:balances[currency],referenceId:w.id,metadata:{reason,source:'gtps'},createdAt:new Date()},{session});
        await mongo.collection('withdrawals').updateOne({id:withdrawalId,status:'PROCESSING',claimToken},{$set:{status:'FAILED',claimToken:null,claimExpiresAt:null,error:reason,updatedAt:new Date()}},{session});
        return {ok:true,status:'FAILED',refunded:true};
      });
      if(result.error==='withdrawal_not_found')return res.status(404).json({ok:false,error:result.error});
      if(result.error)return res.status(409).json({ok:false,error:result.error});
      res.json(result);
    }catch(error){res.status(500).json({ok:false,error:'withdrawal_failure_failed'});}
  });
}
