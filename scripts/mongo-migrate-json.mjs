import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureMongoSchema, closeMongo, withMongoTransaction } from '../server/mongo-store.js';
const dataDir=path.join(process.cwd(),'data');
const readJson=async(name,fallback=[])=>{try{return JSON.parse(await fs.readFile(path.join(dataDir,name),'utf8'));}catch{return fallback;}};
try{
 const db=await ensureMongoSchema();
 const economy=await readJson('economy.json',{});
 const rounds=await readJson('game-rounds.json',[]);
 const cases=await readJson('cases.json',[]);
 const battles=await readJson('case-battles.json',[]);
 const crash=await readJson('crash-global.json',null);
 await withMongoTransaction(async(session,tx)=>{
  for(const u of Array.isArray(economy.users)?economy.users:[]){
   const id=String(u.id), grow=u.growId?String(u.growId).trim().toLowerCase():null;
   await tx.collection('users').updateOne({id},{$setOnInsert:{id,username:u.username,usernameNormalized:String(u.username||'').trim().toLowerCase(),passwordHash:u.passwordHash,...(u.growId?{growId:u.growId,growIdNormalized:grow}:{}),gtpsLinked:Boolean(u.gtpsLinked&&u.growId),linkCode:u.linkCode,isBanned:Boolean(u.isBanned),isMuted:Boolean(u.isMuted),isAdmin:Boolean(u.isAdmin),createdAt:new Date(u.createdAt||Date.now())}},{upsert:true,session});
   await tx.collection('wallets').updateOne({userId:id},{$setOnInsert:{userId:id,balanceDls:Number(u.balanceDls||0),updatedAt:new Date()}},{upsert:true,session});
  }
  const txns=Array.isArray(economy.transactions)?economy.transactions:[];
  if(txns.length) await tx.collection('ledger').bulkWrite(txns.map(t=>({updateOne:{filter:{id:String(t.id)},update:{$setOnInsert:{id:String(t.id),userId:String(t.userId),username:t.username||null,type:t.type,amountDls:Number(t.amountDls||0),balanceBefore:Number(t.balanceBefore||0),balanceAfter:Number(t.balanceAfter||0),referenceId:t.referenceId||null,metadata:t.metadata||{},createdAt:new Date(t.createdAt||Date.now())}},upsert:true}})),{session});
  const deposits=Array.isArray(economy.deposits)?economy.deposits:[];
  if(deposits.length) await tx.collection('deposits').bulkWrite(deposits.map(d=>({updateOne:{filter:{transactionId:String(d.transactionId)},update:{$setOnInsert:{...d,userId:String(d.userId),createdAt:new Date(d.createdAt||Date.now())}},upsert:true}})),{session});
  const withdrawals=Array.isArray(economy.withdrawals)?economy.withdrawals:[];
  if(withdrawals.length) await tx.collection('withdrawals').bulkWrite(withdrawals.map(w=>({updateOne:{filter:{id:String(w.id)},update:{$setOnInsert:{...w,userId:String(w.userId),createdAt:new Date(w.createdAt||Date.now())}},upsert:true}})),{session});
 });
 for(const [name,rows] of [['gameRounds',rounds],['caseCatalog',cases],['caseBattles',battles]]) if(Array.isArray(rows)&&rows.length) await db.collection(name).bulkWrite(rows.map(x=>({updateOne:{filter:{id:String(x.id)},update:{$setOnInsert:{...x,id:String(x.id),createdAt:new Date(x.createdAt||Date.now())}},upsert:true}})));
 if(crash?.roundId) await db.collection('crashRounds').updateOne({id:String(crash.roundId)},{$setOnInsert:{id:String(crash.roundId),...crash,createdAt:new Date()}},{upsert:true});
 console.log('MongoDB migration completed (idempotent).');
}catch(e){console.error('MongoDB migration failed:',e);process.exitCode=1;}finally{await closeMongo();}
