/**
 * slice: ショットガンは同一射撃で最大8ペレット通り、近距離胴で早期キルできる
 */
import assert from 'node:assert/strict';
import {
  computeDamage,
  validateHit,
  applyDamage,
  markFired,
  SHOTGUN_PELLETS,
} from '../worker/combat.js';

assert.equal(computeDamage('shotgun', 'torso', 5), 15);
assert.equal(computeDamage('shotgun', 'head', 5), 20);
assert.equal(computeDamage('shotgun', 'limb', 5), 10);
assert.equal(SHOTGUN_PELLETS, 8);

const atk = {
  alive: true, hp: 100, team: 'blue',
  pose: { x: 0, z: 0 }, lastFireAt: 0, shotgunPellets: 0,
};
const vic = {
  alive: true, hp: 100, team: 'red',
  pose: { x: 4, z: 0 }, spawnProtUntil: 0,
};

let hp = 100;
const now = 5000;
let landed = 0;
for (let i = 0; i < 8; i++) {
  const hit = validateHit({
    attacker: atk,
    victim: { ...vic, hp: Math.max(hp, 1), alive: true },
    part: 'torso',
    weapon: 'shotgun',
    now: now + i,
  });
  assert.equal(hit.ok, true, `pellet ${i + 1} should land`);
  markFired(atk, 'shotgun', now + i, hit);
  if (hp > 0) {
    const applied = applyDamage({ hp }, hit.dmg);
    hp = applied.hp;
  }
  landed++;
}
assert.equal(landed, 8);
assert.equal(hp, 0);
assert.equal(atk.shotgunPellets, 8);

// 9発目は同一ポンプ内なら拒否
const ninth = validateHit({
  attacker: atk, victim: { ...vic, hp: 100 }, part: 'torso', weapon: 'shotgun', now: now + 20,
});
assert.equal(ninth.ok, false);

// ポンプ間隔後はまた撃てる
const next = validateHit({
  attacker: atk, victim: { ...vic, hp: 100 }, part: 'torso', weapon: 'shotgun', now: now + 900,
});
assert.equal(next.ok, true);

console.log('ok combat');
