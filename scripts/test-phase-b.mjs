/**
 * slice: 回復はチャネル開始後〜2秒前後だけ成功し、即時 heal は拒否
 */
import assert from 'node:assert/strict';
import {
  beginHeal,
  applyHeal,
  cancelHealChannel,
  sanitizeLoadout,
  ownsWeapon,
} from '../worker/gear.js';
import { checkMsgRate } from '../worker/rate.js';
import { validateHit, markFired } from '../worker/combat.js';

const now = 10_000;
const s = {
  alive: true, hp: 40, medkits: 2, team: 'blue',
  healStartedAt: 0,
  owned: { assault: true, smg: true, pistol: true, shotgun: false, sniper: false },
  pose: { x: 0, z: 0 }, lastFireAt: 0,
};

assert.equal(applyHeal(s, now).ok, false); // チャネルなし

const start = beginHeal(s, now);
assert.equal(start.ok, true);
s.healStartedAt = start.healStartedAt;

assert.equal(applyHeal(s, now + 500).ok, false); // 早すぎ
const done = applyHeal(s, now + 2000);
assert.equal(done.ok, true);
assert.equal(done.hp, 90);
assert.equal(done.medkits, 1);
assert.equal(s.healStartedAt, 0);

cancelHealChannel(s);
s.healStartedAt = now + 5000;
cancelHealChannel(s);
assert.equal(s.healStartedAt, 0);

const lo = sanitizeLoadout('shotgun', 'shotgun');
assert.equal(lo.main, 'shotgun');
assert.notEqual(lo.sub, 'shotgun');
assert.equal(lo.owned.pistol, true);
assert.equal(lo.owned.shotgun, true);

assert.equal(ownsWeapon({ owned: lo.owned }, 'shotgun'), true);
assert.equal(ownsWeapon({ owned: lo.owned }, 'sniper'), false);
assert.equal(ownsWeapon({ owned: lo.owned }, 'pistol'), true);

const atk = {
  alive: true, hp: 100, team: 'blue',
  pose: { x: 0, z: 0 }, lastFireAt: 0,
  owned: { assault: true, pistol: true, smg: false, shotgun: false, sniper: false },
};
const vic = {
  alive: true, hp: 100, team: 'red',
  pose: { x: 5, z: 0 }, spawnProtUntil: 0,
};
assert.equal(validateHit({
  attacker: atk, victim: vic, part: 'torso', weapon: 'smg', now: 1000,
}).ok, false);
const okHit = validateHit({
  attacker: atk, victim: vic, part: 'nose', weapon: 'assault', now: 1000,
});
assert.equal(okHit.ok, true); // 未知部位は torso 扱い
assert.equal(okHit.part, 'torso');
markFired(atk, 'assault', 1000, okHit);

const rates = { _rates: {} };
assert.equal(checkMsgRate(rates, 100, 'hit', 50).ok, true);
assert.equal(checkMsgRate(rates, 120, 'hit', 50).ok, false);
assert.equal(checkMsgRate(rates, 160, 'hit', 50).ok, true);

console.log('ok phase-b');
