/**
 * slice: TDM リスポーンで slots に無い activeId（拾いの sg_surv 等）は loadoutMain に戻る
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(root, '..', 'tdm-respawn.js'), 'utf8');
const ctx = {};
vm.runInNewContext(src, ctx);
const { resolveTdmRespawnWeapon } = ctx;

const loadoutSlots = {
  assault: { mag: 30, reserve: 90 },
  smg: { mag: 25, reserve: 75 },
  shotgun: { mag: 6, reserve: 24 },
  sniper: { mag: 5, reserve: 15 },
  pistol: { mag: 12, reserve: 36 },
};

assert.equal(
  resolveTdmRespawnWeapon('sg_surv', loadoutSlots, 'assault'),
  'assault',
);
assert.equal(
  resolveTdmRespawnWeapon('sr_surv', loadoutSlots, 'smg'),
  'smg',
);
assert.equal(
  resolveTdmRespawnWeapon('shotgun', loadoutSlots, 'assault'),
  'shotgun',
);

console.log('ok tdm-respawn-weapon');
