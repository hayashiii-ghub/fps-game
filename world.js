'use strict';
/* ============================================================
   ワールド構築：レンダラー / シーン / テクスチャ / 障害物
   ============================================================ */

let renderer, scene, camera;
let worldHemi = null, worldSun = null;
const BASE_FOG_DENSITY = 0.0075;
/** 移動衝突: 全て Y 回転 OBB `{cx,cy,cz,hx,hy,hz,cos,sin}`（軸揃えは cos=1,sin=0） */
const colliders = [];
const worldMeshes = [];   // 弾丸レイキャスト用
/** マップ固有オブジェクトの親（切替時にまとめて破棄） */
let mapGroup = null;
let currentMapId = null;
/** ミニマップの地色（マップごとに変える） */
let MINIMAP_BG = 'rgba(38, 32, 22, 0.98)';

/** Survival ステージ演出用（砂嵐・スコールなど） */
function setAtmosphere(opts = {}) {
  const density = opts.density !== undefined ? opts.density : BASE_FOG_DENSITY;
  const dim = !!opts.dim;
  if (scene && scene.fog) {
    scene.fog.density = density;
    if (opts.fogColor !== undefined) {
      scene.fog.color.set(opts.fogColor);
    } else if (MAP_DEFS[currentMapId]) {
      // 指定なし＝マップ既定色へ戻す（Stage4+ 天候色のリーク防止）
      scene.fog.color.setHex(MAP_DEFS[currentMapId].fog);
    }
  }
  if (worldSun) worldSun.intensity = dim ? 0.5 : 1.05;
  if (worldHemi) worldHemi.intensity = dim ? 0.45 : 0.95;
}
const SPAWN_POINTS = [
  [0, -56], [34, -48], [-34, -48], [54, -14], [-54, -14],
  [54, 30], [-54, 30], [26, 54], [-26, 54],
];
// TDM 用チームスポーン（blue=北寄り / red=南寄り）— 広めにばらけさせる
const TDM_SPAWNS = {
  blue: [
    [0, 52], [-18, 50], [18, 50], [-36, 44], [36, 44],
    [-48, 28], [48, 28], [-28, 38], [28, 38], [-10, 44],
    [10, 44], [-42, 16], [42, 16], [0, 40], [-22, 30], [22, 30],
  ],
  red: [
    [0, -52], [-18, -50], [18, -50], [-36, -44], [36, -44],
    [-48, -28], [48, -28], [-28, -38], [28, -38], [-10, -44],
    [10, -44], [-42, -16], [42, -16], [0, -40], [-22, -30], [22, -30],
  ],
};

/** 敵から最も遠いスポーンを選ぶ（リスキル対策） */
function pickTdmSpawn(team) {
  const list = TDM_SPAWNS[team] || TDM_SPAWNS.red;
  const foes = [];
  if (team === 'blue') {
    for (const e of enemies) if (e.alive && e.team === 'red') foes.push(e.pos);
  } else {
    if (player.alive) foes.push(player.pos);
    for (const e of enemies) if (e.alive && e.team === 'blue') foes.push(e.pos);
  }
  if (foes.length === 0) return list[(Math.random() * list.length) | 0];

  // 上位候補からランダム（毎回同じ端に固まらない）
  const scored = list.map(sp => {
    let minD = Infinity;
    for (const f of foes) {
      const d = Math.hypot(sp[0] - f.x, sp[1] - f.z);
      if (d < minD) minD = d;
    }
    return { sp, minD };
  });
  scored.sort((a, b) => b.minD - a.minD);
  const top = scored.slice(0, Math.min(5, scored.length));
  // 近すぎる点は除外（最低距離をある程度確保）
  const safe = top.filter(t => t.minD >= 22);
  const pool = safe.length ? safe : top;
  return pool[(Math.random() * pool.length) | 0].sp;
}

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- キャンバステクスチャ生成 ---------- */
function makeTex(size, painter, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  painter(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function speckle(ctx, s, n, colors, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    ctx.globalAlpha = rand(0.08, 0.3);
    const r = rand(rMin, rMax);
    ctx.beginPath();
    ctx.arc(rand(0, s), rand(0, s), r, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const texSand = () => makeTex(256, (ctx, s) => {
  ctx.fillStyle = '#b09468'; ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 900, ['#c4ab7d', '#9c8154', '#8a7148', '#cbb486'], 0.5, 2.2);
  // 風紋
  ctx.strokeStyle = 'rgba(120,98,64,.18)';
  for (let i = 0; i < 22; i++) {
    ctx.lineWidth = rand(1, 3);
    ctx.beginPath();
    const y = rand(0, s);
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(s * .3, y + rand(-9, 9), s * .7, y + rand(-9, 9), s, y + rand(-5, 5));
    ctx.stroke();
  }
}, [60, 60]);

const texConcrete = () => makeTex(256, (ctx, s) => {
  ctx.fillStyle = '#99957f'.replace('f', 'a'); ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 700, ['#a8a496', '#8a8778', '#7d7a6c'], 0.6, 2.6);
  // 雨だれ・汚れ
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = 'rgba(60,58,48,.12)';
    const x = rand(0, s);
    ctx.fillRect(x, rand(0, s * .4), rand(2, 7), rand(20, 90));
  }
  // ひび
  ctx.strokeStyle = 'rgba(50,48,40,.35)'; ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    let x = rand(0, s), y = rand(0, s);
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) { x += rand(-24, 24); y += rand(-24, 24); ctx.lineTo(x, y); }
    ctx.stroke();
  }
});

const texMetal = (base, dark) => makeTex(256, (ctx, s) => {
  ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
  // 縦リブ
  for (let x = 0; x < s; x += 16) {
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x, 0, 3, s);
    ctx.fillStyle = 'rgba(255,255,255,.09)'; ctx.fillRect(x + 3, 0, 2, s);
  }
  speckle(ctx, s, 260, [dark, '#3a3128', '#241f18'], 1, 5);
  // サビ
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = 'rgba(96,52,28,.25)';
    ctx.beginPath(); ctx.arc(rand(0, s), rand(0, s), rand(4, 16), 0, 7); ctx.fill();
  }
});

const texWood = () => makeTex(256, (ctx, s) => {
  ctx.fillStyle = '#8a6f4a'; ctx.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 32) {
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(0, y, s, 3);
    ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(0, y + 3, s, 2);
  }
  speckle(ctx, s, 420, ['#775c3b', '#99805a', '#6b5233'], 0.6, 2.4);
  ctx.strokeStyle = 'rgba(70,52,30,.3)';
  for (let i = 0; i < 30; i++) {
    ctx.lineWidth = 1;
    const y = rand(0, s);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y + rand(-6, 6)); ctx.stroke();
  }
});

const texCamo = () => makeTex(128, (ctx, s) => {
  ctx.fillStyle = '#6b6248'; ctx.fillRect(0, 0, s, s);
  const cols = ['#57503a', '#7a7256', '#4a4433', '#837a5c'];
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = cols[(Math.random() * cols.length) | 0];
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(rand(0, s), rand(0, s), rand(6, 20), rand(4, 12), rand(0, 3), 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
});

const texBurnt = () => makeTex(256, (ctx, s) => {
  ctx.fillStyle = '#33302c'; ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 500, ['#221f1c', '#453f38', '#171514', '#574a3a'], 1.5, 7);
});

const texSky = () => makeTex(512, (ctx, s) => {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#7d8b96');
  g.addColorStop(0.45, '#a9a795');
  g.addColorStop(0.62, '#cfc2a0');
  g.addColorStop(0.75, '#d8c9a4');
  g.addColorStop(1, '#c9b992');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
});

/* ---------- ジャングル用テクスチャ ---------- */
const texJungleGround = () => makeTex(256, (ctx, s) => {
  ctx.fillStyle = '#4a5530'; ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 1000, ['#556236', '#3f4a28', '#5d6b3c', '#46523a', '#3a4526'], 0.6, 2.6);
  // 土の露出
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = 'rgba(96,80,52,.16)';
    ctx.beginPath();
    ctx.ellipse(rand(0, s), rand(0, s), rand(8, 26), rand(5, 14), rand(0, 3), 0, 7);
    ctx.fill();
  }
  // 草むらの暗部
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = 'rgba(34,44,20,.18)';
    ctx.beginPath();
    ctx.ellipse(rand(0, s), rand(0, s), rand(6, 18), rand(4, 10), rand(0, 3), 0, 7);
    ctx.fill();
  }
}, [46, 46]);

const texBark = () => makeTex(128, (ctx, s) => {
  ctx.fillStyle = '#5d4a33'; ctx.fillRect(0, 0, s, s);
  for (let x = 0; x < s; x += 7) {
    ctx.fillStyle = 'rgba(30,22,14,.35)';
    ctx.fillRect(x + rand(-2, 2), 0, rand(1.5, 3), s);
    ctx.fillStyle = 'rgba(150,124,88,.14)';
    ctx.fillRect(x + rand(1, 4), 0, rand(1, 2), s);
  }
  speckle(ctx, s, 160, ['#4a3a26', '#6e5a3e', '#3a2d1d'], 0.6, 2.2);
});

const texStone = () => makeTex(256, (ctx, s) => {
  ctx.fillStyle = '#7d7f70'; ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 700, ['#8b8d7c', '#6c6e60', '#757768', '#5f6154'], 0.6, 2.8);
  // 苔
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = 'rgba(72,96,44,.22)';
    ctx.beginPath();
    ctx.ellipse(rand(0, s), rand(0, s), rand(4, 16), rand(3, 9), rand(0, 3), 0, 7);
    ctx.fill();
  }
  // ひび
  ctx.strokeStyle = 'rgba(40,42,34,.4)'; ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    let x = rand(0, s), y = rand(0, s);
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) { x += rand(-22, 22); y += rand(-22, 22); ctx.lineTo(x, y); }
    ctx.stroke();
  }
});

const texJungleSky = () => makeTex(512, (ctx, s) => {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#6f96a8');
  g.addColorStop(0.45, '#9db8b0');
  g.addColorStop(0.65, '#c4d2b8');
  g.addColorStop(0.8, '#d4dcc2');
  g.addColorStop(1, '#c9d4b4');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  // 朝もやの帯
  ctx.fillStyle = 'rgba(226,234,214,.35)';
  ctx.fillRect(0, s * 0.62, s, s * 0.1);
});

/* ---------- マテリアル ---------- */
let MAT;
function buildMaterials() {
  // outputEncoding=sRGB 環境で単色が白浮きするのを防ぐため linear に変換
  const L = (o) => {
    const m = new THREE.MeshLambertMaterial(o);
    if (o.color !== undefined) m.color.convertSRGBToLinear();
    return m;
  };
  MAT = {
    sand: L({ map: texSand() }),
    concrete: L({ map: texConcrete() }),
    metalRed: L({ map: texMetal('#7d4033', '#4a241c') }),
    metalBlue: L({ map: texMetal('#33506b', '#1d2f42') }),
    // 青チーム服（マップの青コンテナと分けた、色褪せた青灰色）
    suitBlue: L({ map: texMetal('#455a68', '#293943') }),
    suitBlueDark: L({ map: texMetal('#354852', '#223039') }),
    // 赤チーム服（茶に寄せず、青と同程度にくすんだ赤灰色）
    suitRed: L({ map: texMetal('#80545a', '#4b3035') }),
    suitRedDark: L({ map: texMetal('#56383d', '#302125') }),
    // 現地識別テープも服と同じく彩度を抑える。
    accentBlue: L({ color: 0x718e9e, flatShading: true }),
    accentRed: L({ color: 0xa87378, flatShading: true }),
    metalGreen: L({ map: texMetal('#4c5a3e', '#2c3624') }),
    metalGrey: L({ map: texMetal('#6e6e66', '#41413c') }),
    wood: L({ map: texWood() }),
    camo: L({ map: texCamo() }),
    camoDark: L({ color: 0x4a4433 }),
    burnt: L({ map: texBurnt() }),
    darkMetal: L({ color: 0x2e3033 }),
    gunmetal: L({ color: 0x24262a }),
    tire: L({ color: 0x1b1b1b }),
    glass: L({ color: 0x0e1216 }),
    skin: L({ color: 0xc9a184 }),
    rock: L({ color: 0x8a7d68 }),
    bush: L({ color: 0x5c4f35 }),
    sandbag: L({ map: texSand() }),
    // ジャングル
    jungleGround: L({ map: texJungleGround() }),
    leaf: L({ color: 0x4a6b2a, flatShading: true }),
    leafDark: L({ color: 0x35511e, flatShading: true }),
    leafLight: L({ color: 0x5d7f33, flatShading: true }),
    bark: L({ map: texBark() }),
    stone: L({ map: texStone() }),
    mossRock: L({ color: 0x6a7058, flatShading: true }),
    blade: L({ color: 0x5a7a33 }),
    water: L({ color: 0x2e5a54 }),
  };
  MAT.sandbag.map = texSand();
}

/* ---------- 障害物追加ヘルパー ---------- */
/**
 * Group をそのまま worldMeshes / colliders に入れると:
 *  - 弾: intersectObjects(..., false) が子 Mesh に当たらず貫通する
 *  - 移動: setFromObject(Group) が空洞込みの巨大 AABB になる
 * ので、必ず葉 Mesh 単位で登録する。
 * 移動コライダは全て Y 回転 OBB（斜めを AABB にすると外側に見えない壁が出る）。
 */
/** 大きな固体は 0/90° に揃えて見た目と当たりを一致させる */
function snapYawOrtho(yaw) {
  const q = Math.PI * 0.5;
  return Math.round((yaw || 0) / q) * q;
}

/** 移動用 Y 回転 OBB を明示登録（建物・コンテナなど固体用） */
function pushYawObb(cx, cy, cz, hx, hy, hz, yaw) {
  if (![cx, cy, cz, hx, hy, hz].every(Number.isFinite)) return;
  if (hx < 1e-4 && hz < 1e-4) return;
  const y = yaw || 0;
  // sin を反転: resolveCollision の local 変換を Three.js Y 回転（x'=c x+s z, z'=-s x+c z）に合わせる
  colliders.push({
    cx, cy, cz, hx, hy, hz,
    cos: Math.cos(y), sin: -Math.sin(y),
  });
}

/** ワールド AABB を OBB 形式（yaw=0）で登録 */
function pushAabbOf(mesh) {
  const world = new THREE.Box3().setFromObject(mesh);
  const c = new THREE.Vector3();
  const s = new THREE.Vector3();
  world.getCenter(c);
  world.getSize(s);
  pushYawObb(c.x, c.y, c.z, s.x * 0.5, s.y * 0.5, s.z * 0.5, 0);
}

function pushMeshCollider(mesh) {
  mesh.updateMatrixWorld(true);
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bb.getSize(size);
  bb.getCenter(center);

  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  mesh.matrixWorld.decompose(pos, quat, scale);
  const hx = Math.abs(size.x * scale.x) * 0.5;
  const hy = Math.abs(size.y * scale.y) * 0.5;
  const hz = Math.abs(size.z * scale.z) * 0.5;
  if (![hx, hy, hz].every(Number.isFinite)) return;
  if (hx < 1e-4 && hz < 1e-4) return;

  const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
  // 大きく傾いたメッシュはワールド AABB 相当（車輪は noCollide 想定）
  if (Math.abs(euler.x) > 0.35 || Math.abs(euler.z) > 0.35) {
    pushAabbOf(mesh);
    return;
  }
  center.applyMatrix4(mesh.matrixWorld);
  if (![center.x, center.y, center.z].every(Number.isFinite)) return;
  pushYawObb(center.x, center.y, center.z, hx, hy, hz, euler.y);
}

function addObstacle(root, useBoxCollider = true) {
  (mapGroup || scene).add(root);
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    worldMeshes.push(o);
    if (useBoxCollider && !o.userData.noCollide) {
      pushMeshCollider(o);
    }
  });
  return root;
}

function markDecor(mesh) {
  mesh.userData.noCollide = true; // 見た目用。弾は当たるが移動はすり抜け
  return mesh;
}

function box(w, h, d, mat, x, y, z, rotY) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rotY) m.rotation.y = rotY;
  return addObstacle(m);
}

/* 建物（窓・扉は貼り付け）— 移動当たりは本体寸法どおり1箱 */
function building(x, z, w, h, d, rotY) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.concrete);
  body.position.y = h / 2;
  g.add(body);
  const winM = MAT.glass;
  const nw = Math.max(2, (w / 3) | 0);
  for (let i = 0; i < nw; i++) {
    const win = markDecor(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), winM));
    win.position.set(-w / 2 + 1.5 + i * ((w - 3) / Math.max(nw - 1, 1)), h * 0.62, d / 2 + 0.02);
    g.add(win);
    const win2 = markDecor(win.clone()); win2.rotation.y = Math.PI; win2.position.z = -d / 2 - 0.02;
    g.add(win2);
  }
  const door = markDecor(new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.3), MAT.darkMetal));
  door.position.set(w * 0.25, 1.15, d / 2 + 0.02);
  g.add(door);
  const par = markDecor(new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.5, d + 0.3), MAT.concrete));
  par.position.y = h + 0.2;
  g.add(par);
  const yaw = snapYawOrtho(rotY);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  addObstacle(g, false);
  pushYawObb(x, h * 0.5, z, w * 0.5, h * 0.5, d * 0.5, yaw);
  return g;
}

/* コンテナ — 見た目寸法どおり1箱（回転は 0/90°） */
function container(x, z, rotY, mat, y) {
  const baseY = y || 0;
  const yaw = snapYawOrtho(rotY);
  const m = new THREE.Mesh(new THREE.BoxGeometry(6.1, 2.6, 2.45), mat);
  m.position.set(x, baseY + 1.3, z);
  m.rotation.y = yaw;
  addObstacle(m, false);
  pushYawObb(x, baseY + 1.3, z, 3.05, 1.3, 1.225, yaw);
  return m;
}

/* 土嚢壁 */
function sandbags(x, z, rotY) {
  const g = new THREE.Group();
  for (let row = 0; row < 3; row++) {
    const n = 5 - (row > 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.3, 0.5), MAT.sandbag);
      b.position.set((i - (n - 1) / 2) * 0.7 + (row % 2 ? 0.18 : 0), 0.16 + row * 0.28, rand(-0.04, 0.04));
      b.rotation.y = rand(-0.08, 0.08);
      // 弾は袋ごと。移動は下で1 OBB にまとめる（袋ごとの押し出し加算で飛ばないように）
      b.userData.noCollide = true;
      g.add(b);
    }
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY || 0;
  addObstacle(g, false);
  // 見た目の Rough 高さ（最上段上面 ≈ 0.87）に合わせた 1 OBB
  pushYawObb(x, 0.44, z, 2.05, 0.44, 0.55, rotY || 0);
  return g;
}

/* コンクリートT型バリア */
function barrier(x, z, rotY) {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.25, 0.3), MAT.concrete);
  wall.position.y = 0.85;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.9), MAT.concrete);
  foot.position.y = 0.25;
  g.add(wall); g.add(foot);
  g.position.set(x, 0, z);
  g.rotation.y = rotY || 0;
  return addObstacle(g);
}

/* 見張り塔 */
function watchtower(x, z) {
  const g = new THREE.Group();
  const legM = MAT.darkMetal;
  for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.4, 0.18), legM);
    leg.position.set(dx, 2.2, dz);
    g.add(leg);
  }
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 2.6), MAT.metalGreen);
  cab.position.y = 5.1;
  g.add(cab);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.14, 3.1), MAT.darkMetal);
  roof.position.y = 5.95;
  g.add(roof);
  const plat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 2.4), MAT.darkMetal);
  plat.position.y = 4.32;
  g.add(plat);
  g.position.set(x, 0, z);
  return addObstacle(g);
}

/* 車両残骸 */
function wreck(x, z, rotY) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.3, 1.05, 1.9), MAT.burnt);
  body.position.y = 0.85;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 1.8), MAT.burnt);
  cabin.position.set(-0.5, 1.75, 0);
  g.add(cabin);
  const win = markDecor(new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.6), MAT.glass));
  win.position.set(-0.5, 1.75, 0.92);
  g.add(win);
  const winG = markDecor(new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.6), MAT.glass));
  winG.rotation.y = Math.PI; winG.position.set(-0.5, 1.75, -0.92);
  g.add(winG);
  for (const [dx, dz] of [[1.45, 1.0], [1.45, -1.0], [-1.45, 1.0], [-1.45, -1.0]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 12), MAT.tire);
    w.rotation.x = Math.PI / 2;
    w.position.set(dx, 0.46, dz);
    w.userData.noCollide = true;
    g.add(w);
  }
  const yaw = rotY || 0;
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  g.rotation.z = rand(-0.05, 0.05);
  addObstacle(g, false);
  // ボディ＋キャビン＋横のタイヤまで覆う 1 箱（自動2箱だとタイヤがはみ出す）
  // ローカル: x∈[-2.15,2.15] z∈[-1.46,1.46] y∈[0.3,2.18]
  pushYawObb(x, 1.2, z, 2.2, 0.95, 1.42, yaw);
  return g;
}

/* 木箱 */
function crate(x, z, s, rotY, y) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), MAT.wood);
  m.position.set(x, (y || 0) + s / 2, z);
  m.rotation.y = rotY || 0;
  return addObstacle(m);
}

/* ドラム缶 */
function barrel(x, z, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.95, 12), mat || MAT.metalGrey);
  m.position.set(x, 0.48, z);
  return addObstacle(m);
}

/* 電柱 */
function pole(x, z) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 7.2, 8), MAT.wood);
  p.position.y = 3.6;
  g.add(p);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), MAT.wood);
  cross.position.y = 6.6;
  g.add(cross);
  g.position.set(x, 0, z);
  return addObstacle(g);
}

/* 岩・枯れ木（装飾・衝突なし小物） */
function decor() {
  for (let i = 0; i < 40; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.15, 0.55), 0), MAT.rock);
    const a = rand(0, Math.PI * 2), d = rand(52, 78);
    r.position.set(Math.cos(a) * d, rand(0, 0.15), Math.sin(a) * d);
    r.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    r.castShadow = true;
    mapGroup.add(r);
  }
  for (let i = 0; i < 18; i++) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(rand(0.2, 0.45), rand(0.4, 0.9), 5), MAT.bush);
    const a = rand(0, Math.PI * 2), d = rand(30, 72);
    b.position.set(Math.cos(a) * d, 0.2, Math.sin(a) * d);
    b.castShadow = true;
    mapGroup.add(b);
  }
}

/* ---------- シーン初期化 ---------- */
function initWorld() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xbfb193, BASE_FOG_DENSITY);

  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 600);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  // 光（色はマップごとに buildMap が設定）
  worldHemi = new THREE.HemisphereLight(0x9fa8b2, 0x6b5f48, 0.95);
  scene.add(worldHemi);
  worldSun = new THREE.DirectionalLight(0xfff0d8, 1.05);
  worldSun.position.set(70, 95, 35);
  worldSun.castShadow = true;
  worldSun.shadow.mapSize.set(2048, 2048);
  worldSun.shadow.camera.left = -85; worldSun.shadow.camera.right = 85;
  worldSun.shadow.camera.top = 85; worldSun.shadow.camera.bottom = -85;
  worldSun.shadow.camera.near = 20; worldSun.shadow.camera.far = 260;
  worldSun.shadow.bias = -0.0006;
  scene.add(worldSun);

  buildMaterials();

  // デフォルトマップを構築（ロビー背景にも使われる）
  buildMap('desert');
}

/* ============================================================
   マップ定義・切替
   ============================================================ */
const MAP_DEFS = Object.create(null);

/** 共有マニフェストのメタデータと、ブラウザ側の描画定義を結合する。 */
function registerMap(def) {
  const meta = def && FPS_ARENA_MAPS[def.id];
  if (!meta) throw new Error(`Unknown map id: ${def && def.id}`);
  if (typeof def.build !== 'function') throw new Error(`Map build function missing: ${def.id}`);
  if (MAP_DEFS[def.id]) throw new Error(`Duplicate map id: ${def.id}`);
  MAP_DEFS[def.id] = Object.freeze({ ...meta, ...def });
}

function validateMapRegistry() {
  const missing = Object.keys(FPS_ARENA_MAPS).filter(id => !MAP_DEFS[id]);
  if (missing.length) throw new Error(`Map build not registered: ${missing.join(', ')}`);
}

/** マップを構築し直す（敵・ドロップ・補給箱は呼び出し側で掃除済みのこと） */
function buildMap(id) {
  const def = MAP_DEFS[id] || MAP_DEFS.desert;
  if (typeof removeSupplyCrate === 'function') removeSupplyCrate();
  if (mapGroup) scene.remove(mapGroup);
  mapGroup = new THREE.Group();
  scene.add(mapGroup);
  colliders.length = 0;
  worldMeshes.length = 0;

  scene.fog.color.setHex(def.fog);
  scene.fog.density = def.fogDensity !== undefined ? def.fogDensity : BASE_FOG_DENSITY;
  worldHemi.color.setHex(def.hemiSky);
  worldHemi.groundColor.setHex(def.hemiGround);
  worldSun.color.setHex(def.sun);
  if (typeof dust !== 'undefined' && dust) dust.material.color.setHex(def.dust);
  MINIMAP_BG = def.minimapBg;

  def.build();
  currentMapId = def.id;
}

/** 同じマップなら何もしない */
function ensureMapBuilt(id) {
  if (currentMapId !== id) buildMap(id);
}

/** 空ドーム（マップごとのテクスチャ） */
function addSky(tex) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(480, 20, 12),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
  );
  mapGroup.add(sky);
}

/** 地面＋弾判定登録 */
function addGround(mat) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  mapGroup.add(ground);
  worldMeshes.push(ground);
}

/** 境界の土手（砂漠は砂、ジャングルは土の崖） */
function addBerms(mat) {
  for (const [x, z, w, d] of [
    [0, -62, 128, 6], [0, 62, 128, 6], [-62, 0, 6, 128], [62, 0, 6, 128],
  ]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, d), mat);
    b.position.set(x, 0.8, z);
    mapGroup.add(b); b.receiveShadow = true;
    worldMeshes.push(b);
    pushYawObb(x, 0.8, z, w * 0.5, 1.3, d * 0.5, 0);
  }
}
