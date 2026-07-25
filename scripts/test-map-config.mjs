import assert from 'node:assert/strict';
import { getMapConfig, MAP_IDS, sanitizeMapId } from '../worker/map-config.js';
import { pickSupplyBundle } from '../worker/gear.js';
import { MAP_SOLID_IDS } from '../worker/map-solids.js';

assert.ok(MAP_IDS.includes('desert'));
assert.ok(MAP_IDS.includes('jungle'));
assert.equal(sanitizeMapId('JUNGLE'), 'jungle');
assert.equal(sanitizeMapId('unknown'), 'desert');
assert.equal(getMapConfig('desert').author, 'Kimi K3');
assert.equal(getMapConfig('jungle').weather, 'squall');
assert.equal(getMapConfig('jungle').survivalWeapon, 'sg_surv');
assert.deepEqual([...MAP_SOLID_IDS].sort(), [...MAP_IDS].sort());

const desertSupply = pickSupplyBundle(() => 0, 'desert');
const jungleSupply = pickSupplyBundle(() => 0, 'jungle');
assert.ok(desertSupply.includes('sr_surv'));
assert.ok(jungleSupply.includes('sg_surv'));

console.log('map config tests: ok');
