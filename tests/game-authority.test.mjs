import assert from 'node:assert/strict';
import {
  rng,
  makeBlackjackDeck,
  blackjackScore,
  resolveGame,
  resolveCrash,
  minesMultiplier,
} from '../server/games.js';

const r1 = rng('phase2-test-seed');
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

const roulette = resolveGame('roulette', () => 0, {bets:{num_0:10}}, 10, {});
assert.equal(roulette.number, 0);
assert.equal(roulette.payout, 360);

const keno = resolveGame('keno', rng('keno-test'), {picks:[1,2,3],risk:'Medium'}, 10, {});
assert.equal(keno.picks.length, 3);
assert.equal(keno.drawn.length, 10);

const crash = { gameId:'crash', betDls:100, state:{startedAt:Date.now()-1,crashPoint:100} };
const active = resolveCrash(crash,{type:'cashout'});
assert.equal(active.outcome,'win');
assert.ok(active.payout >= 100);

console.log('Phase 2 game authority tests passed.');
