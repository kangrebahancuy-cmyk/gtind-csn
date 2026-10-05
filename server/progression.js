import crypto from 'crypto';
import { getMongoDb } from './mongo-store.js';

const AVATARS = [
  { id:'default', name:'Starter', unlockLevel:1, rarity:'common', image:'/assets/set.png' },
  { id:'neon', name:'Neon', unlockLevel:5, rarity:'common', image:'/assets/set.png' },
  { id:'shadow', name:'Shadow', unlockLevel:10, rarity:'rare', image:'/assets/set.png' },
  { id:'gold', name:'Gold', unlockLevel:25, rarity:'epic', image:'/assets/set.png' },
  { id:'diamond', name:'Diamond', unlockLevel:50, rarity:'legendary', image:'/assets/set.png' },
  { id:'elite', name:'Elite', unlockLevel:100, rarity:'mythic', image:'/assets/set.png' },
];
const TIERS = [
  { id:'bronze', name:'Bronze', minLevel:1, color:'#cd7f32' },
  { id:'silver', name:'Silver', minLevel:10, color:'#c0c0c0' },
  { id:'gold', name:'Gold', minLevel:25, color:'#f5c542' },
  { id:'platinum', name:'Platinum', minLevel:50, color:'#67e8f9' },
  { id:'diamond', name:'Diamond', minLevel:100, color:'#60a5fa' },
  { id:'elite', name:'Elite', minLevel:200, color:'#c084fc' },
];
function id(prefix){ return prefix+'_'+Date.now()+'_'+crypto.randomBytes(6).toString('hex'); }
export function xpForNextLevel(level){ return Math.max(100, Math.floor(100 * Math.pow(Math.max(1,level),1.5))); }
export function levelFromXp(xp){
  let level=1, remaining=Math.max(0,Number(xp)||0);
  while(remaining>=xpForNextLevel(level) && level<10000){ remaining-=xpForNextLevel(level); level++; }
  return {level,xpIntoLevel:remaining,xpToNextLevel:xpForNextLevel(level)};
}
export function tierForLevel(level){ return [...TIERS].reverse().find(t=>level>=t.minLevel) || TIERS[0]; }
function defaultStats(userId){ return {userId,totalGames:0,wins:0,losses:0,wageredDls:0,payoutDls:0,netProfitDls:0,bestWinDls:0,biggestBetDls:0,currentWinStreak:0,bestWinStreak:0,gameCounts:{},gameWins:{},createdAt:new Date(),updatedAt:new Date()}; }
function defaultProfile(userId,username){ return {userId,username,displayName:username,bio:'',avatarId:'default',public:true,createdAt:new Date(),updatedAt:new Date()}; }
export function publicProgression(profile,stats,xp){
  const p=profile||defaultProfile(xp.userId,xp.username||'Player');
  const s=stats||defaultStats(xp.userId);
  const info=levelFromXp(xp.xp||0), tier=tierForLevel(info.level);
  return {profile:{userId:p.userId,username:p.username,displayName:p.displayName||p.username,bio:p.bio||'',avatarId:p.avatarId||'default',public:p.public!==false},progression:{xp:Number(xp.xp||0),level:info.level,xpIntoLevel:info.xpIntoLevel,xpToNextLevel:info.xpToNextLevel,tier},stats:{totalGames:s.totalGames||0,wins:s.wins||0,losses:s.losses||0,wageredDls:Number(s.wageredDls||0),payoutDls:Number(s.payoutDls||0),netProfitDls:Number(s.netProfitDls||0),bestWinDls:Number(s.bestWinDls||0),biggestBetDls:Number(s.biggestBetDls||0),currentWinStreak:s.currentWinStreak||0,bestWinStreak:s.bestWinStreak||0,gameCounts:s.gameCounts||{},gameWins:s.gameWins||{}},unlockedAvatars:AVATARS.filter(a=>a.unlockLevel<=info.level)};
}
async function ensurePlayerDocs(mongo,user){
  await mongo.collection('profiles').updateOne({userId:user.id},{$setOnInsert:defaultProfile(user.id,user.username),$set:{username:user.username,updatedAt:new Date()}},{upsert:true});
  await mongo.collection('playerStats').updateOne({userId:user.id},{$setOnInsert:defaultStats(user.id),$set:{updatedAt:new Date()}},{upsert:true});
  await mongo.collection('playerXp').updateOne({userId:user.id},{$setOnInsert:{userId:user.id,username:user.username,xp:0,createdAt:new Date()},$set:{username:user.username,updatedAt:new Date()}},{upsert:true});
}
export async function ensurePlayer(user){ const mongo=await getMongoDb(); await ensurePlayerDocs(mongo,user); return getProgression(user.id); }
export async function getProgression(userId){
  const mongo=await getMongoDb();
  const [profile,stats,xp]=await Promise.all([mongo.collection('profiles').findOne({userId}),mongo.collection('playerStats').findOne({userId}),mongo.collection('playerXp').findOne({userId})]);
  return publicProgression(profile,stats,xp||{userId,xp:0});
}
export async function recordGameActivity(session,mongo,{userId,username,gameId,betDls,referenceId}){
  const bet=Number(betDls||0); if(!Number.isFinite(bet)||bet<=0) return;
  const statsCol=mongo.collection('playerStats'), xpCol=mongo.collection('playerXp'), events=mongo.collection('xpEvents'), now=new Date();
  await statsCol.updateOne({userId},{$setOnInsert:defaultStats(userId),$set:{updatedAt:now},$inc:{totalGames:1,wageredDls:Number(bet.toFixed(2))}},{upsert:true,session});
  await statsCol.updateOne({userId,biggestBetDls:{$lt:bet}},{$set:{biggestBetDls:Number(bet.toFixed(2)),updatedAt:now}},{session});
  const gameKey=String(gameId||'unknown');
  await statsCol.updateOne({userId},{$inc:{['gameCounts.'+gameKey]:1},$set:{updatedAt:now}},{session});
  const xp=Math.min(1000,Math.max(1,Math.floor(bet/10)));
  const eventId='bet:'+referenceId;
  const inserted=await events.updateOne({id:eventId},{$setOnInsert:{id:eventId,userId,username,type:'game_bet',sourceId:referenceId,amountXp:xp,gameId:gameKey,createdAt:now}},{upsert:true,session});
  if(inserted.upsertedCount===1) await xpCol.updateOne({userId},{$setOnInsert:{userId,username,xp:0,createdAt:now},$inc:{xp},$set:{username,updatedAt:now}},{upsert:true,session});
}
export async function recordGameOutcome(session,mongo,{userId,username,gameId,roundId,betDls,payoutDls}){
  const bet=Number(betDls||0), payout=Number(payoutDls||0), win=payout>bet, statsCol=mongo.collection('playerStats');
  await statsCol.updateOne({userId},{$inc:{wins:win?1:0,losses:win?0:1,payoutDls:Number(payout.toFixed(2)),netProfitDls:Number((payout-bet).toFixed(2)),['gameWins.'+String(gameId||'unknown')]:win?1:0},$set:{updatedAt:new Date()}},{session});
  if(win) await statsCol.updateOne({userId,bestWinDls:{$lt:payout}},{$set:{bestWinDls:Number(payout.toFixed(2)),updatedAt:new Date()}},{session});
  const xp=Math.min(500,Math.max(0,Math.floor(Math.max(0,payout-bet)/20)));
  if(xp>0){
    const eventId='outcome:'+roundId;
    const inserted=await mongo.collection('xpEvents').updateOne({id:eventId},{$setOnInsert:{id:eventId,userId,username,type:'game_win',sourceId:roundId,amountXp:xp,gameId:String(gameId||'unknown'),createdAt:new Date()}},{upsert:true,session});
    if(inserted.upsertedCount===1) await mongo.collection('playerXp').updateOne({userId},{$inc:{xp},$set:{username,updatedAt:new Date()}},{upsert:true,session});
  }
}
export async function updateProfile(user,patch){
  const displayName=String(patch.displayName??user.username).trim().slice(0,32)||user.username;
  const bio=String(patch.bio??'').trim().slice(0,240), avatarId=String(patch.avatarId??'default'), publicValue=patch.public!==false;
  const current=await getProgression(user.id);
  if(!AVATARS.some(a=>a.id===avatarId&&a.unlockLevel<=current.progression.level)) return {ok:false,error:'avatar_locked'};
  const mongo=await getMongoDb();
  await mongo.collection('profiles').updateOne({userId:user.id},{$set:{userId:user.id,username:user.username,displayName,bio,avatarId,public:publicValue,updatedAt:new Date()},$setOnInsert:{createdAt:new Date()}},{upsert:true});
  return getProgression(user.id);
}
export function avatarCatalog(){ return AVATARS; }
export function tierCatalog(){ return TIERS; }
