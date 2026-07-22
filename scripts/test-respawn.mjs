/**
 * slice: live 中でも生存中の respawn は拒否し、死亡後だけ全快＋無敵を許可する
 */
import assert from 'node:assert/strict';
import { canRespawn, applyRespawn } from '../worker/combat.js';

const dead = { role: 'active', alive: false, hp: 0, lastRespawnAt: 0 };
assert.equal(canRespawn(dead, 'live', 10_000).ok, true);
assert.equal(canRespawn({ ...dead, alive: true, hp: 40 }, 'live', 10_000).ok, false);
assert.equal(canRespawn(dead, 'lobby', 10_000).ok, false);
assert.equal(canRespawn({ ...dead, role: 'waiting' }, 'live', 10_000).ok, false);

applyRespawn(dead, 10_000);
assert.equal(dead.alive, true);
assert.equal(dead.hp, 100);
assert.equal(dead.spawnProtUntil, 12_000);
assert.equal(dead.lastRespawnAt, 10_000);
assert.equal(canRespawn(dead, 'live', 10_500).ok, false); // 生存中
dead.alive = false;
dead.hp = 0;
assert.equal(canRespawn(dead, 'live', 10_500).ok, false); // クールダウン
assert.equal(canRespawn(dead, 'live', 12_000).ok, true);

console.log('ok respawn');
