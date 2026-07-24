import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../grenade-physics.js', import.meta.url), 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(source, context);

const { advanceGrenadeLaunch } = context.globalThis.GrenadePhysics;
const wall = { cx: 0.25, cy: 1, cz: 0, hx: 0.04, hy: 1, hz: 2, cos: 1, sin: 0 };
const state = {
  pos: { x: 0, y: 1, z: 0 },
  vel: { x: 32, y: 0, z: 0 },
};

const result = advanceGrenadeLaunch(state, [wall], 0.55);

assert.equal(result.hit, true);
assert.ok(state.pos.x <= 0.12, `grenade crossed nearby wall: x=${state.pos.x}`);
assert.ok(state.vel.x < 0, `grenade did not reflect: vx=${state.vel.x}`);
assert.ok(Math.abs(state.vel.x) < 32, `grenade did not lose energy: vx=${state.vel.x}`);
console.log('ok grenade-physics');
