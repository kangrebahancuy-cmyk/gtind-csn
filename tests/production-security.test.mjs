import assert from 'node:assert/strict';
import { authorizeGtpsRequest } from '../server/gtps.js';
import { getMongoDb, ensureMongoSchema, withMongoTransaction } from '../server/mongo-store.js';
import { debitForGame } from '../server/wallet.js';

await ensureMongoSchema();

const secret = 'phase11-test-secret';
assert.equal(authorizeGtpsRequest({headers:{'x-gtps-secret':secret},query:{},body:{}},()=>secret),true);
assert.equal(authorizeGtpsRequest({headers:{},query:{secretKey:secret},body:{}},()=>secret),false);
assert.equal(authorizeGtpsRequest({headers:{},query:{},body:{secretKey:secret}},()=>secret),false);

const db=await getMongoDb();
const userId='qa_'+Date.now();
await db.collection('users').insertOne({id:userId,username:'qa_'+Date.now(),usernameNormalized:'qa_'+Date.now(),isBanned:false,isMuted:false,isAdmin:false});
await db.collection('wallets').insertOne({userId,balancesWl:{WL:0,DL:500,BGL:0},balanceDls:5,updatedAt:new Date()});

const results=await Promise.all(Array.from({length:10},()=>debitForGame(userId,1,'qa-race')));
assert.equal(results.filter(x=>x.ok).length,5);
assert.equal(results.filter(x=>!x.ok && x.error==='insufficient_balance').length,5);
const wallet=await db.collection('wallets').findOne({userId});
assert.equal(wallet.balancesWl.DL,0);
const bets=await db.collection('ledger').countDocuments({userId,type:'BET'});
assert.equal(bets,5);

await withMongoTransaction(async(_session,mongo)=>{
  await mongo.collection('users').deleteOne({id:userId});
  await mongo.collection('wallets').deleteOne({userId});
  await mongo.collection('ledger').deleteMany({userId});
});

console.log('Phase 11 production security tests passed.');
