import { MongoClient } from 'mongodb';

const uri = String(process.env.MONGODB_URI || '').trim();
const dbName = String(process.env.MONGODB_DB || 'gtind_csn').trim();
let clientPromise = null;
function requireUri(){ if(!uri){const e=new Error('MONGODB_URI is not configured');e.code='MONGODB_URI_MISSING';throw e;} return uri; }
export function isMongoConfigured(){ return Boolean(uri); }
export async function getMongoClient(){
  if(!clientPromise){
    const client=new MongoClient(requireUri(),{maxPoolSize:Number(process.env.MONGODB_MAX_POOL_SIZE||50),minPoolSize:Number(process.env.MONGODB_MIN_POOL_SIZE||0),retryWrites:true,retryReads:true,serverSelectionTimeoutMS:Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS||5000),appName:'GTIND-CSN',ignoreUndefined:true});
    clientPromise=client.connect().catch(e=>{clientPromise=null;throw e;});
  }
  return clientPromise;
}
export async function getMongoDb(){ return (await getMongoClient()).db(dbName); }
export async function pingMongo(){ await (await getMongoDb()).command({ping:1}); return true; }
const INDEXES={
users:[[{usernameNormalized:1},{unique:true,name:'uniq_username_normalized'}],[{linkCode:1},{unique:true,name:'uniq_link_code'}],[{growIdNormalized:1},{unique:true,sparse:true,name:'uniq_growid_normalized'}]],
sessions:[[{token:1},{unique:true,name:'uniq_session_token'}],[{expiresAt:1},{expireAfterSeconds:0,name:'ttl_sessions'}]],
wallets:[[{userId:1},{unique:true,name:'uniq_wallet_user'}]],
ledger:[[{id:1},{unique:true,name:'uniq_ledger_id'}],[{userId:1,createdAt:-1},{name:'idx_ledger_user_created'}],[{userId:1,type:1,referenceId:1},{unique:true,name:'uniq_ledger_reference_v2',partialFilterExpression:{referenceId:{$type:'string'}}}]],
deposits:[[{transactionId:1},{unique:true,name:'uniq_deposit_transaction'}],[{userId:1,createdAt:-1},{name:'idx_deposit_user_created'}]],
withdrawals:[[{id:1},{unique:true,name:'uniq_withdrawal_id'}],[{userId:1,idempotencyKey:1},{unique:true,name:'uniq_withdrawal_idempotency_v2',partialFilterExpression:{idempotencyKey:{$type:'string'}}}],[{status:1,createdAt:1},{name:'idx_withdrawal_status_created'}]],
gameRounds:[[{id:1},{unique:true,name:'uniq_game_round_id'}],[{userId:1,createdAt:-1},{name:'idx_game_round_user_created'}]],
caseCatalog:[[{id:1},{unique:true,name:'uniq_case_id'}]],
caseBattles:[[{id:1},{unique:true,name:'uniq_case_battle_id'}],[{status:1,createdAt:-1},{name:'idx_case_battle_lobby'}]],
crashRounds:[[{id:1},{unique:true,name:'uniq_crash_round_id'}],[{phase:1},{name:'idx_crash_phase'}]],
crashPlayers:[[{roundId:1,userId:1},{unique:true,name:'uniq_crash_round_player'}]],
auditLogs:[[{id:1},{unique:true,name:'uniq_audit_id'}],[{actorUserId:1,createdAt:-1},{name:'idx_audit_actor_created'}]],
realtimeEvents:[[{id:1},{unique:true,name:'uniq_realtime_event_id'}],[{createdAt:-1},{name:'idx_realtime_created'}]]
};
export async function ensureMongoSchema(){
 const db=await getMongoDb();
 for(const [name,oldIndex] of [['ledger','uniq_ledger_reference'],['withdrawals','uniq_withdrawal_idempotency']]) { try { await db.collection(name).dropIndex(oldIndex); } catch {} }
 for(const [name,indexes] of Object.entries(INDEXES)) for(const [key,options] of indexes) await db.collection(name).createIndex(key,options);
 await db.collection('meta').updateOne({_id:'schema'},{$set:{version:3,updatedAt:new Date()}},{upsert:true});
 return db;
}
export async function withMongoTransaction(work){
 const client=await getMongoClient(); const session=client.startSession();
 try{return await session.withTransaction(()=>work(session,client.db(dbName)),{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});}
 finally{await session.endSession();}
}
export async function closeMongo(){if(!clientPromise)return;const c=await clientPromise.catch(()=>null);clientPromise=null;if(c)await c.close();}
