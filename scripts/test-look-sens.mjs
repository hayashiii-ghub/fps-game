/**
 * slice: LookSens は 100%=従来係数で、クランプして localStorage に残る
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'player.js'), 'utf8');

function loadLookSens(store = {}) {
  const start = SRC.indexOf('const LOOK_SENS_KEY');
  const end = SRC.indexOf('\nconst player =');
  assert.ok(start >= 0, 'missing LOOK_SENS_KEY');
  assert.ok(end > start, 'missing player const after LookSens');
  const localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
  };
  const sandbox = { console, Math, Number, localStorage };
  vm.createContext(sandbox);
  new vm.Script(SRC.slice(start, end), { filename: 'look-sens.js' }).runInContext(sandbox);
  return {
    LookSens: vm.runInContext('LookSens', sandbox),
    LOOK_SENS_BASE: vm.runInContext('LOOK_SENS_BASE', sandbox),
    store,
  };
}

{
  const { LookSens, LOOK_SENS_BASE } = loadLookSens();
  assert.equal(LookSens.value, 1);
  assert.equal(LookSens.toPct(), 100);
  assert.equal(LookSens.scale(), LOOK_SENS_BASE);
}

{
  const { LookSens, store, LOOK_SENS_BASE } = loadLookSens();
  assert.equal(LookSens.set(0.4), 0.4);
  assert.equal(store.kgfps_look_sens, '0.4');
  assert.equal(LookSens.toPct(), 40);
  assert.equal(LookSens.scale(), LOOK_SENS_BASE * 0.4);
  LookSens.setPct(150);
  assert.equal(LookSens.value, 1.5);
  assert.equal(LookSens.toPct(), 150);
}

{
  const { LookSens } = loadLookSens();
  LookSens.set(9);
  assert.equal(LookSens.value, 3);
  LookSens.set(0);
  assert.equal(LookSens.value, 0.2);
  const prev = LookSens.value;
  LookSens.set(Number.NaN);
  assert.equal(LookSens.value, prev);
  LookSens.setPct('nope');
  assert.equal(LookSens.value, prev);
}

{
  const { LookSens } = loadLookSens({ kgfps_look_sens: '0.6' });
  LookSens.loadPrefs();
  assert.equal(LookSens.value, 0.6);
  assert.equal(LookSens.toPct(), 60);
}

{
  const { LookSens } = loadLookSens({ kgfps_look_sens: 'nope' });
  LookSens.loadPrefs();
  assert.equal(LookSens.value, 1);
}

assert.match(SRC, /LookSens\.scale\(\) \* \(weapon\.ads \? def\.adsSens : 1\)/);
assert.match(SRC, /LOOK_SWAY_BASE \* LookSens\.value/);

console.log('ok look-sens');
