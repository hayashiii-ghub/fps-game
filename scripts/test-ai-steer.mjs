/**
 * bot 壁貼り付き回避の純ロジック
 * slice: 進路がほぼ塞がれた時間が閾値を超えると repath が必要になり、
 *         stuckRepathDelta は「横へ＋少し後ろ」のオフセットを返す
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  updateStuckTimer,
  shouldRepathFromStuck,
  stuckRepathDelta,
  STUCK_SEC,
} = require('../ai-steer.js');

let t = 0;
t = updateStuckTimer(t, 0.2, { speed: 3, intendedDist: 0.05, progressAlong: 0.05 });
t = updateStuckTimer(t, 0.2, { speed: 3, intendedDist: 0.05, progressAlong: 0.05 });
assert.equal(shouldRepathFromStuck(t), false, 'まだ閾値未満');

t = updateStuckTimer(t, 0.2, { speed: 3, intendedDist: 0.05, progressAlong: 0.05 });
assert.equal(shouldRepathFromStuck(t), true, `stuck ${t} > ${STUCK_SEC}`);

const d = stuckRepathDelta(1, 0, 1, 3, 8);
assert.ok(Math.abs(d.x - (-3)) < 1e-9, `back component x=${d.x}`);
assert.ok(Math.abs(d.z - 8) < 1e-9, `side component z=${d.z}`);

console.log('ok ai-steer');
