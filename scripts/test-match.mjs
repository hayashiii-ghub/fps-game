/**
 * slice: live 中に残り時間が尽きると ended になり、lobby/ended 以外からの match_start は拒否
 */
import assert from 'node:assert/strict';
import {
  MATCH_SEC,
  createMatchState,
  canStartMatch,
  startMatch,
  tickMatch,
  matchPublic,
  resolveJoin,
  resumeByToken,
  serializeMatch,
  restoreMatch,
  shouldFastTick,
} from '../worker/match.js';

assert.equal(MATCH_SEC, 300);

let m = createMatchState();
assert.equal(m.phase, 'lobby');
assert.equal(canStartMatch(m).ok, true);
assert.equal(shouldFastTick(m), false);

const started = startMatch(m, 'jungle', 10_000);
assert.equal(started.ok, true);
assert.equal(m.phase, 'live');
assert.equal(shouldFastTick(m), true);
assert.equal(m.map, 'jungle');
assert.equal(m.endsAt, 10_000 + MATCH_SEC * 1000);
assert.equal(canStartMatch(m).ok, false);

tickMatch(m, 10_000 + 60_000);
assert.equal(m.phase, 'live');
assert.equal(shouldFastTick(m), true);
const pub = matchPublic(m, 10_000 + 60_000);
assert.equal(pub.phase, 'live');
assert.equal(pub.timeLeft, 240);

tickMatch(m, 10_000 + MATCH_SEC * 1000);
assert.equal(m.phase, 'ended');
assert.equal(shouldFastTick(m), false);
assert.equal(matchPublic(m, 10_000 + MATCH_SEC * 1000).timeLeft, 0);
assert.equal(canStartMatch(m).ok, true);
assert.equal(shouldFastTick(null), false);

const again = startMatch(m, 'desert', 400_000);
assert.equal(again.ok, true);
assert.equal(m.phase, 'live');
assert.equal(m.map, 'desert');

// 途中参加: live 中の新規は waiting、トークン復帰は active
const mid = resolveJoin({ phase: 'live' }, null);
assert.equal(mid.role, 'waiting');
assert.equal(mid.resume, false);

const reserved = {
  id: 'abc',
  team: 'red',
  token: 'tok1',
  hp: 42,
  alive: true,
  grenades: 1,
  medkits: 0,
  armor: true,
};
const resumed = resumeByToken({ tok1: reserved }, 'tok1');
assert.equal(resumed.ok, true);
assert.equal(resumed.player.id, 'abc');
assert.equal(resumed.player.team, 'red');
assert.equal(resumed.player.hp, 42);

const miss = resumeByToken({ tok1: reserved }, 'other');
assert.equal(miss.ok, false);

const lobbyJoin = resolveJoin({ phase: 'lobby' }, null);
assert.equal(lobbyJoin.role, 'active');

// 永続ラウンドトリップ
m.score = { blue: 3, red: 1 };
m.supplyAcc = 1200;
m.supplyArmed = true;
const blob = serializeMatch(m);
const restored = restoreMatch(blob);
assert.equal(restored.phase, 'live');
assert.equal(restored.map, 'desert');
assert.equal(restored.score.blue, 3);
assert.equal(restored.endsAt, m.endsAt);

console.log('ok match');
