import assert from 'node:assert/strict';
import { levelFromXp, xpForNextLevel, tierForLevel, publicProgression, avatarCatalog } from '../server/progression.js';

assert.equal(xpForNextLevel(1),100);
assert.deepEqual(levelFromXp(0),{level:1,xpIntoLevel:0,xpToNextLevel:100});
assert.equal(levelFromXp(100).level,2);
assert.equal(tierForLevel(1).id,'bronze');
assert.equal(tierForLevel(10).id,'silver');
assert.equal(tierForLevel(25).id,'gold');
assert.equal(tierForLevel(50).id,'platinum');
assert.equal(tierForLevel(100).id,'diamond');
assert.equal(tierForLevel(200).id,'elite');
assert.ok(avatarCatalog().every(a=>a.unlockLevel>=1));
const p=publicProgression(null,null,{userId:'u1',username:'Tester',xp:0});
assert.equal(p.profile.username,'Tester');
assert.equal(p.progression.level,1);
assert.equal(p.progression.tier.id,'bronze');
assert.deepEqual(p.stats.totalGames,0);
console.log('Phase 6 progression tests passed.');
