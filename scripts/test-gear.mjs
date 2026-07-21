/**
 * slice: グレ距離ダメージ・回復・死亡ドロップ・拾取付与が勝負ルールどおりになる
 */
import assert from 'node:assert/strict';
import {
  grenadeDmgAt,
  validateNadeThrow,
  validateNadeBoom,
  applyHeal,
  pickDeathDrop,
  tryGrantLoot,
  WEAPONS,
} from '../worker/gear.js';

assert.equal(grenadeDmgAt(0), 38);
assert.ok(grenadeDmgAt(5) < 38);
assert.equal(grenadeDmgAt(20), 0);

const thrower = {
  alive: true, hp: 100, team: 'blue',
  grenades: 2, lastNadeAt: 0, pendingNade: false,
  pose: { x: 0, z: 0 },
};
const now = 5000;
const thr = validateNadeThrow(thrower, now);
assert.equal(thr.ok, true);
thrower.grenades = thr.grenades;
thrower.pendingNade = true;
thrower.lastNadeAt = now;

const boom = validateNadeBoom(thrower, { x: 2, y: 0.1, z: 0 }, now + 2200);
assert.equal(boom.ok, true);

const deadThrow = validateNadeThrow({ ...thrower, grenades: 0, pendingNade: false }, now + 3000);
assert.equal(deadThrow.ok, false);

const healed = applyHeal({ alive: true, hp: 40, medkits: 2 });
assert.equal(healed.ok, true);
assert.equal(healed.hp, 90);
assert.equal(healed.medkits, 1);

const full = applyHeal({ alive: true, hp: 100, medkits: 1 });
assert.equal(full.ok, false);

assert.ok(['ammo', 'med', 'nade'].includes(pickDeathDrop(() => 0.1)));
assert.equal(pickDeathDrop(() => 0.5), 'med');
assert.equal(pickDeathDrop(() => 0.9), 'nade');

const inv = { grenades: 0, medkits: 0, armor: false, grenadeMax: 5, medkitMax: 3 };
assert.equal(tryGrantLoot(inv, 'nade').ok, true);
assert.equal(inv.grenades, 1);
assert.equal(tryGrantLoot(inv, 'armor').ok, true);
assert.equal(inv.armor, true);
assert.ok(WEAPONS.has('smg'));

console.log('ok gear');
