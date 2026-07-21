/**
 * slice: computeDamage は部位と減衰を反映し、validateHit は味方・射程外を拒否する
 */
import assert from 'node:assert/strict';
import { computeDamage, validateHit, applyDamage } from '../worker/combat.js';

assert.equal(computeDamage('assault', 'torso', 5), 34);
assert.ok(computeDamage('smg', 'torso', 40) < 26);

const atk = {
  alive: true, hp: 100, team: 'blue',
  pose: { x: 0, z: 0 }, lastFireAt: 0,
};
const vic = {
  alive: true, hp: 100, team: 'red',
  pose: { x: 10, z: 0 }, spawnProtUntil: 0,
};

const ok = validateHit({
  attacker: atk, victim: vic, part: 'torso', weapon: 'assault', now: 1000,
});
assert.equal(ok.ok, true);
assert.equal(ok.dmg, 34);

const ff = validateHit({
  attacker: atk,
  victim: { ...vic, team: 'blue' },
  part: 'torso', weapon: 'assault', now: 1000,
});
assert.equal(ff.ok, false);

const far = validateHit({
  attacker: atk,
  victim: { ...vic, pose: { x: 200, z: 0 } },
  part: 'torso', weapon: 'assault', now: 1000,
});
assert.equal(far.ok, false);

const applied = applyDamage({ hp: 34 }, 34);
assert.equal(applied.hp, 0);
assert.equal(applied.kill, true);

console.log('ok combat');
