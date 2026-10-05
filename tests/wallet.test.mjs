import assert from 'node:assert/strict';
import { CURRENCIES, WL_PER, currencyAmountToWl, wlToCurrencyAmount } from '../server/wallet.js';

assert.deepEqual(CURRENCIES, ['WL','DL','BGL']);
assert.deepEqual(WL_PER, {WL:1,DL:100,BGL:10000});
assert.equal(currencyAmountToWl('WL', 100), 100);
assert.equal(currencyAmountToWl('DL', 1), 100);
assert.equal(currencyAmountToWl('BGL', 1), 10000);
assert.equal(currencyAmountToWl('dl', 1.25), 125);
assert.equal(wlToCurrencyAmount('WL', 125), 125);
assert.equal(wlToCurrencyAmount('DL', 125), 1.25);
assert.equal(wlToCurrencyAmount('BGL', 10000), 1);
assert.equal(currencyAmountToWl('INVALID', 1), null);
assert.equal(currencyAmountToWl('DL', 0), null);
console.log('Phase 7 currency conversion tests passed.');
