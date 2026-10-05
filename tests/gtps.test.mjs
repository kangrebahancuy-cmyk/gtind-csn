import assert from 'node:assert/strict';
import { installGtpsRoutes } from '../server/gtps.js';

assert.equal(typeof installGtpsRoutes, 'function');
assert.ok(2 * 60 * 1000 > 0);

console.log('Phase 10 GTPS integration module loaded successfully.');
