/**
 * slice: スポーン点が固体の上に来ない / 大きな固体が宙に浮かない
 *
 * スポーン点（`SPAWN_POINTS` / `TDM_SPAWNS`）は全マップ共通なので、
 * マップ側が同じ座標へ建物やコンテナを置くと屋根の上に湧いてしまう。
 * `groundSpawns()` の除外が効いているか、除外後も十分な数が残るかを見る。
 *
 * あわせて「真下に支えの無い大きな固体」を検出する（浮いたコンテナの再発防止）。
 * world.js / maps/*.js を node:vm 上で実際に走らせて `colliders` を作る。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAP_IDS } from '../worker/map-config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 除外後に残っていてほしいスポーン数（これを割るマップは配置を見直す） */
const MIN_TDM_SPAWNS = 8;
const MIN_SURVIVAL_SPAWNS = 5;
/** 浮き検査の対象にする固体の厚み。薄い物見櫓の床・電柱の腕木は除く */
const FLOAT_MIN_HALF_H = 0.5;
/** これ以下の底面は接地・段差とみなす */
const GROUNDED_BOTTOM = 0.65;

/* ---------- ブラウザ最小スタブ（テクスチャ生成に必要な分だけ） ---------- */

function canvas2dStub() {
  const noop = () => {};
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: noop });
      }
      if (prop in target) return target[prop];
      return noop;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function makeSandbox() {
  const sandbox = {
    console: { ...console, warn: () => {} },
    Math, JSON, Date,
    document: {
      createElement(tag) {
        if (tag !== 'canvas') throw new Error(`unexpected createElement: ${tag}`);
        return { width: 0, height: 0, getContext: () => canvas2dStub() };
      },
    },
  };
  vm.createContext(sandbox);
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

/** index.html が実際に読み込むマップスクリプト（<script> 追加漏れも一緒に踏む） */
function mapScriptsFromIndexHtml() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const re = /<script[^>]+src="\.?\/?(maps\/[A-Za-z0-9._-]+\.js)(?:\?[^"]*)?"/g;
  const files = [];
  for (let m = re.exec(html); m; m = re.exec(html)) files.push(m[1]);
  return files;
}

const sandbox = makeSandbox();
for (const file of [
  'three.min.js', 'shared/map-manifest.js', 'ground-support.js',
  'world.js', ...mapScriptsFromIndexHtml(),
]) {
  new vm.Script(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file }).runInContext(sandbox);
}

vm.runInContext(`
  validateMapRegistry();
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xbfb193, BASE_FOG_DENSITY);
  worldHemi = new THREE.HemisphereLight(0x9fa8b2, 0x6b5f48, 0.95);
  worldSun = new THREE.DirectionalLight(0xfff0d8, 1.05);
  buildMaterials();
`, sandbox);

const GS = sandbox.GroundSupport;

/** OBB 天面のうち、支えを探すためにサンプルする点（中心＋縁の内側） */
function samplePoints(b) {
  const pts = [];
  for (const sx of [-1, 0, 1]) {
    for (const sz of [-1, 0, 1]) {
      const lx = sx * b.hx * 0.85;
      const lz = sz * b.hz * 0.85;
      pts.push([b.cx + lx * b.cos - lz * b.sin, b.cz + lx * b.sin + lz * b.cos]);
    }
  }
  return pts;
}

const problems = [];

for (const mapId of MAP_IDS) {
  const colliders = vm.runInContext(
    `buildMap(${JSON.stringify(mapId)});
     colliders.map(c => ({cx:c.cx, cy:c.cy, cz:c.cz, hx:c.hx, hy:c.hy, hz:c.hz, cos:c.cos, sin:c.sin}))`,
    sandbox,
  );

  /* --- 1. 除外後のスポーン点がすべて素の地面か --- */
  const usable = expr => vm.runInContext(`groundSpawns(${expr})`, sandbox);
  const total = expr => vm.runInContext(`${expr}.length`, sandbox);
  const kinds = [
    ['TDM blue', usable('TDM_SPAWNS.blue'), MIN_TDM_SPAWNS, total('TDM_SPAWNS.blue')],
    ['TDM red', usable('TDM_SPAWNS.red'), MIN_TDM_SPAWNS, total('TDM_SPAWNS.red')],
    ['Survival', usable('SPAWN_POINTS'), MIN_SURVIVAL_SPAWNS, total('SPAWN_POINTS')],
  ];
  for (const [label, list, min, total] of kinds) {
    for (const [x, z] of list) {
      const top = GS.supportHeightAt(colliders, x, z, 0.35, Infinity);
      if (top > 0.01) {
        problems.push(
          `[${mapId}] ${label} のスポーン (${x}, ${z}) が固体の上（足元 y=${top.toFixed(2)}）。` +
          `groundSpawns() の除外が効いていません`,
        );
      }
    }
    if (list.length < min) {
      problems.push(
        `[${mapId}] ${label} の使えるスポーンが ${list.length}/${total} 点しかありません（下限 ${min}）。` +
        `マップの建物がスポーン座標と重なっています`,
      );
    }
  }

  /* --- 2. 真下に支えの無い大きな固体（浮いたコンテナ） --- */
  for (const b of colliders) {
    const bottom = b.cy - b.hy;
    if (bottom <= GROUNDED_BOTTOM || b.hy < FLOAT_MIN_HALF_H) continue;
    const supported = samplePoints(b).some(([x, z]) => colliders.some(
      o => o !== b && Math.abs((o.cy + o.hy) - bottom) < 0.12 && GS.centerInsideBox(o, x, z),
    ));
    if (!supported) {
      problems.push(
        `[${mapId}] 宙に浮いた固体: 中心 (${b.cx.toFixed(1)}, ${b.cy.toFixed(2)}, ${b.cz.toFixed(1)}) ` +
        `底面 y=${bottom.toFixed(2)} half=${b.hx.toFixed(2)}/${b.hy.toFixed(2)}/${b.hz.toFixed(2)}。` +
        `真下に天面が一致する固体を置くか、地面へ下ろしてください`,
      );
    }
  }

  console.log(`  ${mapId}: colliders=${colliders.length} ` +
    `spawns blue/red/survival=${kinds.map(k => k[1].length).join('/')}`);
}

if (problems.length) {
  console.error(`\nspawn clearance: ${problems.length} 件\n`);
  for (const p of problems) console.error(`  - ${p}`);
}

assert.equal(problems.length, 0, `spawn clearance: ${problems.length} 件`);
console.log('spawn clearance tests: ok');
