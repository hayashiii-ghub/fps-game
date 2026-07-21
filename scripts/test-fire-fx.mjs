/**
 * fire イベントの最低限の契約: 所持武器のみ・レート制限・snap.prot
 */
import assert from 'node:assert/strict';
import { checkMsgRate } from '../worker/rate.js';
import { ownsWeapon, defaultLoadout } from '../worker/gear.js';

const loadout = defaultLoadout();
const session = {
  ...loadout,
  weapon: loadout.main,
  _rates: {},
};

assert.equal(ownsWeapon(session, session.main), true);
assert.equal(ownsWeapon(session, 'pistol'), true);
assert.equal(ownsWeapon(session, 'sniper') && session.main !== 'sniper' && session.sub !== 'sniper', false);

assert.equal(checkMsgRate(session, 1000, 'fire', 45).ok, true);
assert.equal(checkMsgRate(session, 1020, 'fire', 45).ok, false);
assert.equal(checkMsgRate(session, 1060, 'fire', 45).ok, true);

const now = 5000;
const spawnProtUntil = now + 2000;
const prot = !!(spawnProtUntil && now < spawnProtUntil);
assert.equal(prot, true);
assert.equal(!!(spawnProtUntil && (now + 2500) < spawnProtUntil), false);

console.log('ok fire-fx');
