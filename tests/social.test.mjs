import assert from 'node:assert/strict';
import { CHAT_RETENTION_MS } from '../server/social.js';

assert.equal(CHAT_RETENTION_MS, 24 * 60 * 60 * 1000);
console.log('Phase 8 social retention test passed.');
