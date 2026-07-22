/**
 * slice: クライアント WEAPON_DEFS とサーバー WEAPON_DMG / FALLOFF / pellets が一致する
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  WEAPON_DMG,
  WEAPON_FALLOFF,
  SHOTGUN_PELLETS,
} from '../worker/combat.js';

function extractObjectLiteral(src, marker) {
  const i = src.indexOf(marker);
  assert.ok(i >= 0, `missing ${marker}`);
  const start = src.indexOf('{', i);
  assert.ok(start >= 0);
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        // eslint-disable-next-line no-new-func
        return Function(`"use strict"; return (${src.slice(start, j + 1)});`)();
      }
    }
  }
  assert.fail(`unclosed object after ${marker}`);
}

const root = dirname(fileURLToPath(import.meta.url));
const playerSrc = readFileSync(join(root, '..', 'player.js'), 'utf8');
const defs = extractObjectLiteral(playerSrc, 'const WEAPON_DEFS =');

for (const id of Object.keys(WEAPON_DMG)) {
  assert.ok(defs[id], `client missing weapon ${id}`);
  assert.deepEqual(defs[id].dmg, WEAPON_DMG[id], `${id}.dmg`);
  if (WEAPON_FALLOFF[id]) {
    assert.deepEqual(defs[id].dmgFalloff, WEAPON_FALLOFF[id], `${id}.dmgFalloff`);
  } else {
    assert.equal(defs[id].dmgFalloff, undefined, `${id} should have no falloff`);
  }
}
assert.equal(defs.shotgun.pellets, SHOTGUN_PELLETS);

console.log('ok weapon-parity');
