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
  pickSupplyBundle,
  tryGrantLoot,
  buildSessionAttachment,
  sanitizeLoadout,
} from '../worker/gear.js';
import { sanitizeWeapon } from '../worker/pose.js';

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

const healed = applyHeal({ alive: true, hp: 40, medkits: 2, healStartedAt: now }, now + 2000);
assert.equal(healed.ok, true);
assert.equal(healed.hp, 90);
assert.equal(healed.medkits, 1);

const instant = applyHeal({ alive: true, hp: 40, medkits: 2, healStartedAt: 0 }, now);
assert.equal(instant.ok, false);

const full = applyHeal({ alive: true, hp: 100, medkits: 1, healStartedAt: now }, now + 2000);
assert.equal(full.ok, false);

assert.ok(['ammo', 'med', 'nade'].includes(pickDeathDrop(() => 0.1)));
assert.equal(pickDeathDrop(() => 0.5), 'med');
assert.equal(pickDeathDrop(() => 0.9), 'nade');

const inv = { grenades: 0, medkits: 0, armor: false, grenadeMax: 5, medkitMax: 3 };
assert.equal(tryGrantLoot(inv, 'nade').ok, true);
assert.equal(inv.grenades, 1);
assert.equal(tryGrantLoot(inv, 'armor').ok, true);
assert.equal(inv.armor, true);
assert.equal(tryGrantLoot(inv, 'extmag').ok, true);
assert.equal(inv.extMag, true);
assert.equal(tryGrantLoot(inv, 'extmag').ok, false);

const snInv = {
  main: 'assault', sub: 'smg',
  owned: { assault: true, smg: true, shotgun: false, sniper: true, sr_surv: false, sg_surv: false, pistol: true },
};
assert.equal(tryGrantLoot(snInv, 'sr_surv').ok, true);
assert.equal(snInv.owned.sr_surv, true);
assert.equal(snInv.owned.sniper, false);

const bareInv = {
  main: 'assault', sub: 'smg',
  owned: { assault: true, smg: true, shotgun: false, sniper: false, sr_surv: false, sg_surv: false, pistol: true },
};
assert.equal(tryGrantLoot(bareInv, 'sr_surv').granted.type, 'sniper');
assert.equal(bareInv.owned.sniper, true);

const jungleBundle = pickSupplyBundle(() => 0.99, 'jungle');
assert.ok(jungleBundle.includes('ammo'));
assert.ok(!jungleBundle.includes('armor'));
assert.ok(!jungleBundle.includes('extmag'));
assert.ok(!jungleBundle.includes('sg_surv'));
const alwaysBundle = pickSupplyBundle(() => 0.1, 'jungle');
assert.ok(alwaysBundle.includes('sg_surv'));
assert.ok(alwaysBundle.includes('extmag'));
assert.ok(alwaysBundle.includes('armor'));
const desertBundle = pickSupplyBundle(() => 0.1, 'desert');
assert.ok(desertBundle.includes('sr_surv'));

assert.equal(sanitizeWeapon('smg'), 'smg');
assert.equal(sanitizeWeapon('sr_surv'), 'sr_surv');
assert.equal(sanitizeWeapon('sg_surv'), 'sg_surv');

const lo = sanitizeLoadout('shotgun', 'sniper');
const att = buildSessionAttachment({
  id: 'p1', room: 'ABC', team: 'blue', token: 'tok12345678',
  role: 'active', name: 'P1', joinedAt: 1,
  hp: 42, alive: false, grenades: 1, medkits: 0, armor: true, extMag: true,
  weapon: 'shotgun', main: lo.main, sub: lo.sub, owned: lo.owned,
  spawnProtUntil: 9, lastRespawnAt: 3,
});
assert.equal(att.hp, 42);
assert.equal(att.alive, false);
assert.equal(att.main, 'shotgun');
assert.equal(att.sub, 'sniper');
assert.equal(att.owned.shotgun, true);
assert.equal(att.owned.sniper, true);
assert.equal(att.owned.assault, false);
assert.equal(att.extMag, true);

console.log('ok gear');
