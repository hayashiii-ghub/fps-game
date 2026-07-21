/**
 * slice: normalizeRoomCode は英数字4–6桁に整え、isValidRoomCode が判定する
 */
import assert from 'node:assert/strict';
import { normalizeRoomCode, isValidRoomCode } from '../worker/room-code.js';

assert.equal(normalizeRoomCode('ab c12'), 'ABC12');
assert.equal(normalizeRoomCode('xx!!yy99zz'), 'XXYY99');
assert.equal(isValidRoomCode('ABCD'), true);
assert.equal(isValidRoomCode('ABC'), false);
assert.equal(isValidRoomCode(normalizeRoomCode('ab-c1')), true);

console.log('ok room-code');
