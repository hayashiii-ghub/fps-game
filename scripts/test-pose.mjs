/**
 * slice: sanitizePose は座標をマップ内に収め、sanitizeMap は desert/jungle のみ
 */
import assert from 'node:assert/strict';
import { sanitizePose, sanitizeMap, lerpYaw } from '../worker/pose.js';

const p = sanitizePose({ x: 999, z: -999, y: 99, yaw: 1.2, pitch: 9, crouch: 1, seq: 3, weapon: 'smg' });
assert.equal(p.x, 59);
assert.equal(p.z, -59);
assert.equal(p.y, 6);
assert.equal(p.pitch, 1.4);
assert.equal(p.crouch, true);
assert.equal(p.seq, 3);
assert.equal(p.weapon, 'smg');

assert.equal(sanitizeMap('jungle'), 'jungle');
assert.equal(sanitizeMap('DESERT'), 'desert');
assert.equal(sanitizeMap('void'), 'desert');

assert.ok(Math.abs(lerpYaw(0, 1, 0.5) - 0.5) < 1e-9);

function normYaw(y) {
  while (y > Math.PI) y -= Math.PI * 2;
  while (y < -Math.PI) y += Math.PI * 2;
  return y;
}
assert.ok(Math.abs(normYaw(lerpYaw(3.0, -3.0, 1)) - (-3.0)) < 1e-6);

console.log('ok pose');
