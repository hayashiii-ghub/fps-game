/**
 * slice: 壁を挟むと validateHit が los で拒否し、開けた距離では通る
 */
import assert from 'node:assert/strict';
import { validateHit, markFired } from '../worker/combat.js';
import { lineOfSightClear, segmentHitsSolid, solidsForMap } from '../worker/map-solids.js';

// 中央遺跡 temple (6,1.7,-8) を東西に挟む線は遮断
assert.equal(
  lineOfSightClear('jungle', -5, 1.5, -8, 17, 1.5, -8),
  false,
  'temple blocks E-W',
);
// 開けた北南は通る（中央補給付近の空き）
assert.equal(
  lineOfSightClear('jungle', 0, 1.5, 20, 0, 1.5, 40),
  true,
  'open north lane',
);

const wall = {
  cx: 0, cy: 1, cz: 0, hx: 2, hy: 1, hz: 0.3,
  cos: 1, sin: 0,
};
assert.equal(segmentHitsSolid(-5, 1, 0, 5, 1, 0, wall), true);
assert.equal(segmentHitsSolid(-5, 1, 5, 5, 1, 5, wall), false);

// map-solids の yaw 符号が Three.js 揃え（sin = -sin(yaw)）であること
{
  const grottoWall = solidsForMap('jungle').find(o =>
    Math.abs(o.cx - 28.61) < 0.05 && Math.abs(o.cz - 37.455) < 0.05);
  assert.ok(grottoWall, 'grotto wallL solid exists');
  assert.ok(Math.abs(grottoWall.cos - Math.cos(0.5)) < 1e-6);
  assert.ok(Math.abs(grottoWall.sin - (-Math.sin(0.5))) < 1e-6, 'sin = -sin(yaw)');
}

const atk = {
  alive: true, hp: 100, team: 'blue', crouch: false,
  pose: { x: -5, y: 0, z: -8 }, lastFireAt: 0,
  owned: { assault: true, smg: false, shotgun: false, sniper: false, pistol: true },
};
const vicBlocked = {
  alive: true, hp: 100, team: 'red', crouch: false,
  pose: { x: 17, y: 0, z: -8 }, spawnProtUntil: 0,
};
const blocked = validateHit({
  attacker: atk, victim: vicBlocked, part: 'torso', weapon: 'assault', now: 9000, map: 'jungle',
});
assert.equal(blocked.ok, false);
assert.equal(blocked.reason, 'los');

const atkOpen = {
  alive: true, hp: 100, team: 'blue', crouch: false,
  pose: { x: 0, y: 0, z: 20 }, lastFireAt: 0,
  owned: { assault: true, smg: false, shotgun: false, sniper: false, pistol: true },
};
const vicOpen = {
  alive: true, hp: 100, team: 'red', crouch: false,
  pose: { x: 0, y: 0, z: 40 }, spawnProtUntil: 0,
};
const open = validateHit({
  attacker: atkOpen, victim: vicOpen, part: 'torso', weapon: 'assault', now: 9000, map: 'jungle',
});
assert.equal(open.ok, true);
markFired(atkOpen, 'assault', 9000, open);

console.log('ok los');
