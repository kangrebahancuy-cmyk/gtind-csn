import assert from 'node:assert/strict';
import { createPersistentSession, getPersistentSession, deletePersistentSession } from '../server/economy-store.js';
import {
  rng,
  makeBlackjackDeck,
  blackjackScore,
  resolveGame,
  resolveCrash,
  minesMultiplier,
  crashPointFromSeed,
} from '../server/games.js';

const r1 = rng('phase2-test-seed');
assert.equal(crashPointFromSeed('crash-seed'), crashPointFromSeed('crash-seed'));
assert.ok(crashPointFromSeed('crash-seed') >= 1 && crashPointFromSeed('crash-seed') <= 10000);

const r2 = rng('phase2-test-seed');
assert.equal(r1(), r2(), 'HMAC RNG must be deterministic for the same seed');

const deck = makeBlackjackDeck('blackjack-test');
assert.equal(deck.length, 52);
assert.equal(new Set(deck.map(c => c.suit + c.rank)).size, 52);
assert.equal(blackjackScore([{rank:'A',value:11},{rank:'K',value:10}]), 21);
assert.equal(blackjackScore([{rank:'A',value:11},{rank:'9',value:9},{rank:'5',value:5}]), 15);

const state = { size:5, mineCount:3, revealed:[], mineMap:[24,23,22] };
const safe = resolveGame('mines', rng('mines-test'), {selected:0}, 100, state);
assert.equal(safe.outcome, 'safe');
assert.deepEqual(state.revealed, [0]);
assert.ok(minesMultiplier(5,3,1) > 1);

const towersState = {difficulty:'Hard', floor:0, cols:2, traps:1, trapsMap:[[1],[0],[1],[0],[1],[0],[1],[0]], multipliers:[1.95,3.85,7.6,15,29.5,58,114,225]};
const towerSafe = resolveGame('towers', () => 0, {floor:0,col:0}, 100, towersState);
assert.equal(towerSafe.outcome, 'safe');
assert.equal(towerSafe.multiplier, 1.95);

const roulette = resolveGame('roulette', () => 0, {bets:{num_0:10}}, 10, {});
assert.equal(roulette.number, 0);
assert.equal(roulette.payout, 360);
const invalidRoulette = resolveGame('roulette', () => 0, {bets:{num_0:10,cheat:1}}, 11, {});
assert.equal(invalidRoulette.error, 'invalid_bet_key');

const caseSnapshot = { id:'case-test', price:10, items:[
  {id:'low',name:'Low',price:2,chance:90},
  {id:'high',name:'High',price:82,chance:10}
]};
const caseResult = resolveGame('cases', rng('case-test'), {final:true}, 10, {caseSnapshot,count:1});
assert.equal(caseResult.winners.length, 1);
assert.ok(caseResult.payout >= 0);

const keno = resolveGame('keno', rng('keno-test'), {picks:[1,2,3],risk:'Medium'}, 10, {});
assert.equal(keno.picks.length, 3);
assert.equal(keno.drawn.length, 10);

const crash = { gameId:'crash', betDls:100, state:{startedAt:Date.now()-1,crashPoint:100} };
const active = resolveCrash(crash,{type:'cashout'});
assert.equal(active.outcome,'win');
assert.ok(active.payout >= 100);

console.log('Phase 2 game authority tests passed.');


const session = createPersistentSession('phase3-user', 60_000);
assert.equal(getPersistentSession(session.token)?.userId, 'phase3-user');
deletePersistentSession(session.token);
assert.equal(getPersistentSession(session.token), null);
console.log('Phase 3 persistent session storage tests passed.');
