/**
 * slice: ブラウザ側の移動コライダと worker/map-solids.js の射線用 OBB が一致する
 *
 * world.js / maps/*.js を node:vm 上で実際に走らせて `colliders` を作り、
 * `solidsForMap(id)` と突き合わせる。手写しの写し漏れ・寸法ずれを検出する。
 * `markLosExempt()` が付いた OBB（植生の幹など）は対象外。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAP_IDS } from '../worker/map-config.js';
import { solidsForMap } from '../worker/map-solids.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
    // three.js のマテリアル警告はブラウザでも出る既知のノイズなので落とす
    console: { ...console, warn: () => {} },
    Math,
    JSON,
    Date,
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
  return sandbox;
}

function loadScripts(sandbox, files) {
  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    new vm.Script(src, { filename: file }).runInContext(sandbox);
  }
}

/**
 * index.html が実際に読み込んでいるマップスクリプトを拾う。
 * ここを決め打ちにすると `<script>` の追加漏れをテストが見逃すため、
 * 必ずブラウザと同じ経路（index.html の記述）から取る。
 */
function mapScriptsFromIndexHtml() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // `./maps/x.js?v=1` / `maps/x.js` / `/maps/x.js` のいずれの書き方でも拾う
  const re = /<script[^>]+src="\.?\/?(maps\/[A-Za-z0-9._-]+\.js)(?:\?[^"]*)?"/g;
  const files = [];
  for (let m = re.exec(html); m; m = re.exec(html)) files.push(m[1]);
  return files;
}

/** マップを1つ構築し、射線対象の移動コライダを取り出す */
function collidersFor(sandbox, mapId) {
  return vm.runInContext(
    `buildMap(${JSON.stringify(mapId)});
     colliders
       .filter(c => !c.losExempt)
       .map(c => ({ cx: c.cx, cy: c.cy, cz: c.cz, hx: c.hx, hy: c.hy, hz: c.hz, cos: c.cos, sin: c.sin }));`,
    sandbox,
  );
}

/* ---------- 突き合わせ ---------- */

const CENTER_TOL = 0.5;   // これを超えて近い相手がいなければ「対応なし」
const SIZE_TOL = 0.25;    // 対応は付いたが寸法・向きがずれている

const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy, a.cz - b.cz);

function sizeDelta(a, b) {
  return Math.max(
    Math.abs(a.hx - b.hx), Math.abs(a.hy - b.hy), Math.abs(a.hz - b.hz),
    Math.abs(a.cos - b.cos), Math.abs(a.sin - b.sin),
  );
}

const fmt = o => `(${o.cx.toFixed(2)}, ${o.cy.toFixed(2)}, ${o.cz.toFixed(2)}) ` +
  `half=${o.hx.toFixed(2)}/${o.hy.toFixed(2)}/${o.hz.toFixed(2)}`;

/** 中心が最も近いもの同士を貪欲に対応付ける */
function pair(solids, colliders) {
  const taken = new Set();
  const matched = [];
  const missing = [];   // map-solids にあるが移動コライダに無い

  for (const solid of solids) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < colliders.length; i++) {
      if (taken.has(i)) continue;
      const d = dist(solid, colliders[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0 || bestD > CENTER_TOL) missing.push(solid);
    else { taken.add(best); matched.push([solid, colliders[best], bestD]); }
  }

  const extra = colliders.filter((_, i) => !taken.has(i));  // 射線に載っていない固体
  return { matched, missing, extra };
}

/* ---------- 実行 ---------- */

const mapScripts = mapScriptsFromIndexHtml();
assert.ok(mapScripts.length > 0, 'index.html に maps/*.js の <script> が1つもない');

const sandbox = makeSandbox();
loadScripts(sandbox, [
  'three.min.js',
  'shared/map-manifest.js',
  'world.js',
  ...mapScripts,
]);

// index.html の読み込みだけで全マップが登録されるか（<script> 追加漏れの検出）
const registered = vm.runInContext('Object.keys(MAP_DEFS)', sandbox);
assert.deepEqual(
  [...registered].sort(), [...MAP_IDS].sort(),
  `index.html が読み込むマップ (${[...registered].sort().join(',')}) と ` +
  `shared/map-manifest.js の登録 (${[...MAP_IDS].sort().join(',')}) が一致しません。` +
  `index.html の <script src="./maps/....js"> を確認してください`,
);

vm.runInContext(`
  validateMapRegistry();
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xbfb193, BASE_FOG_DENSITY);
  worldHemi = new THREE.HemisphereLight(0x9fa8b2, 0x6b5f48, 0.95);
  worldSun = new THREE.DirectionalLight(0xfff0d8, 1.05);
  buildMaterials();
`, sandbox);

const problems = [];

for (const mapId of MAP_IDS) {
  const colliders = collidersFor(sandbox, mapId);
  const solids = solidsForMap(mapId);
  const { matched, missing, extra } = pair(solids, colliders);

  const skewed = matched.filter(([s, c]) => sizeDelta(s, c) > SIZE_TOL);

  for (const solid of missing) {
    problems.push(`[${mapId}] map-solids にあるが移動コライダに無い: ${fmt(solid)}`);
  }
  for (const collider of extra) {
    problems.push(`[${mapId}] 移動コライダにあるが map-solids に無い: ${fmt(collider)}`);
  }
  for (const [solid, collider, d] of skewed) {
    problems.push(
      `[${mapId}] 寸法/向きがずれている (中心差 ${d.toFixed(3)}, 最大差 ${sizeDelta(solid, collider).toFixed(3)}): ` +
      `solids ${fmt(solid)} / world ${fmt(collider)}`,
    );
  }

  console.log(`  ${mapId}: solids=${solids.length} colliders=${colliders.length} matched=${matched.length}`);
}

if (problems.length) {
  console.error(`\nmap-solids parity: ${problems.length} 件の不一致\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nworker/map-solids.js を world.js / maps/*.js の配置に合わせてください。');
  console.error('移動だけ遮り射線は通す物なら markLosExempt() を付けます。');
}

assert.equal(problems.length, 0, `map-solids parity mismatch: ${problems.length}`);
console.log('map solids parity tests: ok');
