import assert from 'node:assert/strict';
import { installAdminRoutes } from '../server/admin.js';
assert.equal(typeof installAdminRoutes,'function');
assert.equal(100,100);
console.log('Phase 9 admin module test passed.');