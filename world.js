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

/** Survival ステージ演出用（砂嵐など） */
function setAtmosphere(opts = {}) {
  const density = opts.density !== undefined ? opts.density : BASE_FOG_DENSITY;
  const dim = !!opts.dim;
  if (scene && scene.fog) scene.fog.density = density;
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
    // 赤チーム服（青と同程度の明度。暖色マップで茶に寄らないようやや彩度高め）
    suitRed: L({ map: texMetal('#8b4048', '#552428') }),
    suitRedDark: L({ map: texMetal('#5c2a30', '#35161a') }),
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
const MAP_DEFS = {
  desert: {
    name: 'DESERT',
    build: buildDesertMap,
    fog: 0xbfb193, hemiSky: 0x9fa8b2, hemiGround: 0x6b5f48, sun: 0xfff0d8,
    fogDensity: BASE_FOG_DENSITY,
    dust: 0xd8c8a2, minimapBg: 'rgba(38, 32, 22, 0.98)',
  },
  jungle: {
    name: 'JUNGLE',
    build: buildJungleMap,
    fog: 0x8faa8a, hemiSky: 0x9bb89a, hemiGround: 0x3a4a32, sun: 0xe8e4c8,
    fogDensity: 0.0115,
    dust: 0x9cbc82, minimapBg: 'rgba(24, 34, 20, 0.98)',
  },
};

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
  currentMapId = id;
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

/* ---------- 砂漠マップ（既存レイアウト） ---------- */
function buildDesertMap() {
  addSky(texSky());
  addGround(MAT.sand);
  addBerms(MAT.sandbag);

  /* ---- 拠点レイアウト ---- */
  building(-30, -22, 14, 5, 9, 0.25);
  building(31, 17, 11, 4.5, 8, -0.45);
  building(-6, -44, 10, 4, 7, 0.1);

  container(8, -18, 0.35, MAT.metalRed);
  container(10.5, -24.5, 1.62, MAT.metalBlue);
  container(-16, 26, -0.2, MAT.metalGreen);
  container(-17, 32.5, 0.12, MAT.metalGrey);
  container(-16.5, 29.2, 0.05, MAT.metalRed, 2.6);
  container(40, -34, 1.1, MAT.metalBlue);
  container(-44, 8, 0.9, MAT.metalGreen);

  sandbags(0, -6, 0);
  sandbags(-9, 3, 1.35);
  sandbags(14, 8, -0.4);
  sandbags(-22, -8, 0.5);
  sandbags(26, -8, 2.2);
  sandbags(6, 30, 0.9);
  sandbags(-36, -34, 0);

  barrier(-4, 14, 0.2);
  barrier(20, -2, 1.6);
  barrier(-14, -30, -0.3);
  barrier(36, 6, 0.8);
  barrier(-40, 24, 1.2);
  barrier(12, 44, -0.15);

  watchtower(-38, -12);
  watchtower(42, 34);
  watchtower(18, -42);

  wreck(-10, 44, 0.4);
  wreck(46, -16, -0.7);
  wreck(-34, 40, 1.9);

  // 木箱クラスタ
  crate(3, 20, 1.05, 0.2); crate(4.3, 20.4, 1.05, -0.15); crate(3.6, 20.2, 1.0, 0.5, 1.05);
  crate(-26, 14, 1.1, 0.7); crate(-24.7, 14.6, 0.95, 0.1);
  crate(22, 26, 1.05, -0.4); crate(23.4, 25.5, 1.05, 0.3); crate(23, 26.2, 0.9, 0.8, 1.05);
  crate(-2, -26, 1.0, 0.9); crate(48, 12, 1.1, 0.2); crate(-50, -28, 1.05, 1.1);

  barrel(5.6, 21.4); barrel(6.3, 20.9, MAT.metalRed); barrel(-25.4, 13.2);
  barrel(21, 27.4); barrel(-45.5, 10.5, MAT.metalRed); barrel(-44.6, 11.6);

  pole(-20, -40); pole(24, 40); pole(52, 0); pole(-52, -20);

  /* ---- 中央帯・レーンの遮蔽（TDM 撃ち合いライン） ---- */
  container(-2, 2, 1.55, MAT.metalGrey);
  container(18, -14, 0.2, MAT.metalGreen);
  container(-30, 2, 1.62, MAT.metalBlue);
  container(24, 8, 1.2, MAT.metalRed);
  container(-22, -22, 0.4, MAT.metalGrey);
  container(6, -40, 0.9, MAT.metalGreen);
  container(-48, -8, 1.4, MAT.metalBlue);

  barrier(8, -8, 0.1);
  barrier(-18, 10, 1.5);
  barrier(28, 12, -0.6);
  barrier(-8, -14, 0.9);
  barrier(0, 24, 0.05);
  barrier(2, -34, 1.4);
  barrier(-26, 36, 0.7);
  barrier(32, -24, -0.9);
  barrier(10, 12, 1.1);
  barrier(-34, -6, 0.35);
  barrier(44, 4, 1.7);
  barrier(-6, 40, -0.5);

  sandbags(12, 18, 1.1);
  sandbags(-14, -18, -0.7);
  sandbags(38, 20, 0.3);
  sandbags(-38, -22, 1.8);
  sandbags(20, -28, 0.6);
  sandbags(-4, 8, 0.8);
  sandbags(16, -4, -1.2);
  sandbags(-28, 16, 0.25);
  sandbags(4, -20, 1.6);
  sandbags(30, 30, -0.3);
  sandbags(-42, 32, 1.0);
  sandbags(48, -40, 0.5);

  // L字・クロスの短い壁で角を作る
  box(4.2, 1.4, 0.35, MAT.concrete, -10, 0.7, 0, 0);
  box(0.35, 1.4, 3.6, MAT.concrete, -12, 0.7, 1.6, 0);
  box(3.8, 1.4, 0.35, MAT.concrete, 22, 0.7, -6, 0.4);
  box(0.35, 1.4, 3.2, MAT.concrete, 23.6, 0.7, -4.2, 0.4);
  box(5.0, 1.2, 0.4, MAT.concrete, -20, 0.6, -30, -0.2);
  box(0.4, 1.2, 4.0, MAT.concrete, 8, 0.6, 36, 0.15);

  crate(9, 4, 1.05, 0.4); crate(10.2, 4.5, 1.0, -0.2); crate(9.5, 4.2, 0.9, 0.6, 1.05);
  crate(-11, -4, 1.1, 0.8); crate(-12.2, -3.4, 0.95, 0.15);
  crate(30, -20, 1.05, 0.55); crate(31.2, -19.4, 0.95, -0.3);
  crate(-27, 20, 1.0, -0.35); crate(-28.2, 20.6, 1.05, 0.5);
  crate(0, -10, 1.1, 0.2); crate(1.3, -9.5, 1.0, -0.4); crate(0.5, -9.8, 0.95, 0.7, 1.05);
  crate(36, 40, 1.05, 0.9); crate(-48, -36, 1.1, -0.6);

  wreck(14, 34, 2.4);
  wreck(-20, -36, -1.2);
  wreck(28, -38, 0.9);
  wreck(-8, 28, -1.5);

  barrel(0.5, 5.2); barrel(-1.2, 4.6, MAT.metalRed);
  barrel(16.5, -12); barrel(-29, 4.4);
  barrel(9.8, 5.2); barrel(-12.5, -2.8, MAT.metalRed);
  barrel(25, 10); barrel(-5, 22); barrel(40, -8, MAT.metalRed);

  building(20, 42, 8, 3.8, 6, 0.6);
  building(-40, -40, 9, 4.2, 7, -0.3);

  decor();
}

/* ============================================================
   ジャングルマップ（PUBG Sanhok 参考）
   密林＋6エリア: 中央遺跡(CQC) / 東リゾート(狙撃) / 南港 /
   西採石場 / 北西訓練場 / 北東岩窟
   ============================================================ */

/* 熱帯樹 — 移動判定は幹だけ。葉は弾・視線を遮る（隠れ場所） */
function tree(x, z, s = 1) {
  const g = new THREE.Group();
  const h = rand(3.8, 5.4) * s;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * s, 0.24 * s, h, 7), MAT.bark);
  trunk.position.y = h / 2;
  g.add(trunk);
  const mats = [MAT.leaf, MAT.leafDark, MAT.leafLight];
  // 樹冠を厚く重ねる（幹同士は離しても葉は被る）
  const n = 3 + (Math.random() < 0.55 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const r = rand(1.25, 2.05) * s;
    const c = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 0), mats[(Math.random() * mats.length) | 0]);
    c.position.set(rand(-0.7, 0.7) * s, h - r * 0.5 + i * 0.55 * s, rand(-0.7, 0.7) * s);
    c.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    g.add(c);
  }
  g.position.set(x, 0, z);
  addObstacle(g, false);
  pushYawObb(x, h / 2, z, 0.24 * s, h / 2, 0.24 * s, 0);
  return g;
}

/* 茂み — 見た目のみ（移動・弾・視線すべて素通し）。密林感用 */
function thicket(x, z, s = 1) {
  const g = new THREE.Group();
  const n = 2 + (Math.random() * 2 | 0);
  for (let i = 0; i < n; i++) {
    const r = rand(0.55, 0.95) * s;
    const b = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 0),
      Math.random() < 0.5 ? MAT.leafDark : MAT.leaf);
    b.position.set(rand(-0.5, 0.5) * s, r * 0.62, rand(-0.5, 0.5) * s);
    b.scale.y = 0.78;
    b.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    g.add(b);
  }
  g.position.set(x, 0, z);
  mapGroup.add(g);
  return g;
}

/* 草の束（見た目だけ。弾・移動・視線すべて素通し） */
function grassTuft(x, z, s = 1) {
  const g = new THREE.Group();
  const n = 3 + (Math.random() * 3 | 0);
  for (let i = 0; i < n; i++) {
    const h = rand(0.35, 0.7) * s;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.085 * s, h, 4), MAT.blade);
    c.position.set(rand(-0.4, 0.4) * s, h * 0.42, rand(-0.4, 0.4) * s);
    c.rotation.set(rand(-0.28, 0.28), rand(0, 3), rand(-0.28, 0.28));
    g.add(c);
  }
  g.position.set(x, 0, z);
  mapGroup.add(g);
  return g;
}

/* 倒木 — 低い遮蔽（長軸明示 OBB。tilt AABB に落とさない） */
function fallenLog(x, z, rotY) {
  const len = 4.0;
  const r = 0.33;
  const yaw = rotY || 0;
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, len, 8), MAT.bark);
  m.rotation.z = Math.PI / 2; // 長軸 → 親ローカル X
  m.position.y = r;
  g.add(m);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  addObstacle(g, false);
  pushYawObb(x, r, z, len * 0.5, r, r, yaw);
  return g;
}

/* 大岩（苔むした岩盤）— 見た目一致の明示 OBB（Dodeca 自動 AABB は外側に膨らむ） */
function bigRock(x, z, s, rotY) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), MAT.mossRock);
  m.scale.y = 0.7;
  const cy = s * 0.38;
  m.position.set(x, cy, z);
  const yaw = rotY || 0;
  m.rotation.y = yaw;
  addObstacle(m, false);
  // 塊の見た目に近い直方体（幾何 AABB よりタイト）
  pushYawObb(x, cy, z, s * 0.72, s * 0.7, s * 0.72, yaw);
  return m;
}

/* 遺跡の壁・柱 — 他の box 壁と同じ葉メッシュ自動登録 */
function ruinsWall(x, z, w, h, rotY) {
  return box(w, h, 0.55, MAT.stone, x, h / 2, z, rotY);
}
function pillar(x, z, h) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, h, 8), MAT.stone);
  m.position.set(x, h / 2, z);
  return addObstacle(m);
}

/* 岩窟 — building() 型: 壁2枚は明示 OBB、天井は頭上なので markDecor（移動素通し） */
function grotto(x, z, rotY) {
  const yaw = rotY || 0;
  const g = new THREE.Group();
  const wallL = new THREE.Mesh(new THREE.BoxGeometry(7.4, 3.6, 1.2), MAT.mossRock);
  wallL.position.set(0, 1.8, -2.9);
  const wallR = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.4, 5.6), MAT.mossRock);
  wallR.position.set(-3.4, 1.7, 0);
  const roof = markDecor(new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.9, 7.0), MAT.mossRock));
  roof.position.set(0, 3.45, -0.4);
  g.add(wallL); g.add(wallR); g.add(roof);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  addObstacle(g, false);
  // ローカルオフセットを yaw でワールドへ（Three.js Y 回転と同式）
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const toWorld = (lx, lz) => ({
    wx: x + lx * cos + lz * sin,
    wz: z - lx * sin + lz * cos,
  });
  const wL = toWorld(0, -2.9);
  pushYawObb(wL.wx, 1.8, wL.wz, 3.7, 1.8, 0.6, yaw);
  const wR = toWorld(-3.4, 0);
  pushYawObb(wR.wx, 1.7, wR.wz, 0.6, 1.7, 2.8, yaw);
  return g;
}

/* 南沖の海（境界の外。見た目だけ） */
function addSea() {
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(500, 190), MAT.water);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.35, -158);
  mapGroup.add(sea);
}

/* 散らばり配置ユーティリティ（固定障害物・スポーンを避ける） */
function scatter(count, rMin, rMax, keepOut, place) {
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 40) {
    tries++;
    const x = rand(-rMax, rMax), z = rand(-rMax, rMax);
    if (Math.abs(x) < rMin && Math.abs(z) < rMin) continue;
    let ok = true;
    for (const k of keepOut) {
      if (Math.hypot(x - k[0], z - k[1]) < k[2]) { ok = false; break; }
    }
    if (!ok) continue;
    place(x, z);
    placed++;
  }
}

function buildJungleMap() {
  addSky(texJungleSky());
  addGround(MAT.jungleGround);
  addBerms(MAT.jungleGround);
  addSea();

  /* 固定障害物・スポーンのキープアウト円 [x, z, r] */
  const ko = [];
  const keep = (x, z, r) => ko.push([x, z, r]);
  for (const [x, z] of SPAWN_POINTS) keep(x, z, 3.6);
  for (const team of ['blue', 'red']) for (const [x, z] of TDM_SPAWNS[team]) keep(x, z, 2.6);
  keep(0, 50, 4);            // Survival 初期位置
  keep(0, 0, 5);             // 中央補給ポイント

  /* ---- 中央: 遺跡（Ruins。CQC のhub） ---- */
  keep(6, -8, 6);
  const temple = new THREE.Group();
  const tBody = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 5.2), MAT.stone);
  tBody.position.y = 1.7;
  temple.add(tBody);
  const tRoof = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 6.2), MAT.stone);
  tRoof.position.y = 3.7;
  temple.add(tRoof);
  const tDoor = markDecor(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.4), MAT.darkMetal));
  tDoor.position.set(0, 1.2, 2.62);
  temple.add(tDoor);
  temple.position.set(6, 0, -8);
  addObstacle(temple, false);
  // 屋根外形まで固体（本体だけの OBB だと軒下をすり抜けて見た目と食い違う）
  pushYawObb(6, 2.0, -8, 4.0, 2.0, 3.1, 0);

  ruinsWall(-7, 2, 6, 1.7, 0.12);   keep(-7, 2, 4.5);
  ruinsWall(7, 4, 5, 1.4, -0.35);   keep(7, 4, 4);
  ruinsWall(-2, 8, 4.4, 1.25, 0.5); keep(-2, 8, 3.6);
  ruinsWall(-6, -6, 3.8, 2.1, 1.1); keep(-6, -6, 3.4);
  ruinsWall(2, -1, 2.8, 1.1, 0.2);  keep(2, -1, 2.6);
  pillar(-3.5, -3.5, 2.5); pillar(3.6, 6.4, 2.2); pillar(-8.5, -1.5, 1.4);
  pillar(8.6, -3.4, 2.6); pillar(-1.2, 3.4, 1.1);
  keep(-3.5, -3.5, 1.4); keep(3.6, 6.4, 1.4); keep(-8.5, -1.5, 1.4);
  keep(8.6, -3.4, 1.4); keep(-1.2, 3.4, 1.4);
  // 瓦礫
  box(1.1, 0.6, 0.9, MAT.stone, -4.6, 0.3, 5.4, 0.7);
  box(0.8, 0.45, 0.7, MAT.stone, 4.2, 0.22, -3.6, 0.3);

  /* ---- 東: リゾート（狙撃ラインが通る開けたエリア） ---- */
  keep(38, 4, 11); keep(30, 16, 9); keep(44, -6, 5);
  keep(36, 10, 7); // 射線ポケットを森から守る
  building(38, 4, 10, 4.2, 7, -0.2);
  building(30, 16, 8, 3.6, 6, 0.35);
  watchtower(44, -6);
  sandbags(33, -2, 0.3);
  crate(41, 10, 1.05, 0.2); crate(42.2, 10.5, 0.95, -0.3);

  /* ---- 南: 港（コンテナ埠頭） ---- */
  keep(-6, -43, 12); keep(3, -37, 8);
  keep(0, -40, 9); // 埠頭レーンを開けたまま
  container(-10, -44, 0.04, MAT.metalGreen);
  container(-3.6, -44, -0.03, MAT.metalGrey);
  container(2.8, -44, 0.06, MAT.metalGreen);
  container(-6.8, -43.9, 0.02, MAT.metalGrey, 2.6);
  container(-7, -37.5, 1.58, MAT.metalGreen);
  crate(4.5, -37, 1.05, 0.3); crate(5.8, -36.5, 1.0, -0.2); crate(5.1, -36.8, 0.95, 0.6, 1.05);
  barrel(0.5, -36.2); barrel(1.4, -35.6, MAT.metalRed);
  pole(12, -46);

  /* ---- 西: 採石場（岩盤と土砂） ---- */
  keep(-37, -6, 11); keep(-30, 6, 5);
  bigRock(-36, -6, 2.7, 0.4);
  bigRock(-43, 1, 2.1, 1.2);
  bigRock(-31, -14, 1.9, 0.8);
  bigRock(-45, -15, 1.5, 0.2);
  bigRock(-28, 5, 1.6, 1.9);
  crate(-33, -1, 1.05, 0.5); crate(-31.8, -0.4, 0.95, 0.1);
  sandbags(-38, 8, 1.2);
  barrel(-27, -9, MAT.metalRed);

  /* ---- 北西: 訓練場（兵舎＋障害物コース） ---- */
  keep(-32, 34, 8); keep(-18, 42, 6);
  building(-32, 34, 12, 4, 8, 0.15);
  building(-18, 42, 8, 3.6, 6, -0.3);
  barrier(-26, 26, 0.2);
  barrier(-36, 22, 1.35);
  barrier(-20, 30, -0.4);
  crate(-40, 30, 1.05, 0.4); crate(-38.7, 30.5, 0.95, -0.25);
  pole(-12, 36);

  /* ---- 北東: 岩窟（グロット） ---- */
  keep(30, 40, 8);
  grotto(30, 40, 0.5);
  bigRock(24, 46, 1.7, 0.9);
  bigRock(37, 34, 1.4, 0.1);

  /* ---- レーン用の散在遮蔽（TDM 中央の撃ち合い） ---- */
  sandbags(14, 14, 1.0);   keep(14, 14, 3);
  sandbags(-16, -16, 0.6); keep(-16, -16, 3);
  sandbags(18, -22, -0.5); keep(18, -22, 3);
  sandbags(-24, 12, 1.7);  keep(-24, 12, 3);
  fallenLog(10, 26, 0.9);  keep(10, 26, 3.4);
  fallenLog(-14, 24, -0.4); keep(-14, 24, 3.4);
  fallenLog(22, -12, 1.8); keep(22, -12, 3.4);
  fallenLog(-20, -30, 0.3); keep(-20, -30, 3.4);
  barrier(0, 22, 0.15);    keep(0, 22, 3.4);
  barrier(-2, -24, 1.5);   keep(-2, -24, 3.4);
  crate(16, 32, 1.05, 0.7); crate(-10, -34, 1.0, 0.2);
  keep(16, 32, 2.2); keep(-10, -34, 2.2);
  wreck(24, 22, 1.2);      keep(24, 22, 4);
  wreck(-34, -30, -0.6);   keep(-34, -30, 4);

  /* ---- レーン間の岩遮蔽（固体カバー） ---- */
  bigRock(10, 6, 1.55, 0.4);   keep(10, 6, 2.8);   // 中央遺跡〜東リゾートの中間
  bigRock(-18, 2, 1.7, 1.1);   keep(-18, 2, 3.0);   // 中央〜西採石場のアプローチ
  bigRock(6, -18, 1.45, 0.2);  keep(6, -18, 2.6);   // 中央〜南港手前（埠頭は開けたまま）
  bigRock(16, -8, 1.5, 0.7);   keep(16, -8, 2.7);   // 中央→東リゾート南寄り
  bigRock(-8, 16, 1.6, 1.3);   keep(-8, 16, 2.8);   // 中央→北西訓練場
  bigRock(20, 28, 1.45, 0.5);  keep(20, 28, 2.6);   // 中央→北東岩窟の中間
  bigRock(-22, -20, 1.55, 0.9); keep(-22, -20, 2.7); // 西採石→南港の抜け道
  bigRock(8, 32, 1.4, 0.2);    keep(8, 32, 2.5);    // 北レーン
  /* ---- 密林（熱帯樹＋茂み＋草）— 拠点外・レーン間を厚く、樹冠は重ねる ---- */
  scatter(70, 8, 56, ko, (x, z) => {
    tree(x, z, rand(0.9, 1.4));
    ko.push([x, z, 1.45]); // 幹は離しつつ葉は被せる
  });
  scatter(68, 4, 56, ko, (x, z) => thicket(x, z, rand(0.85, 1.55)));
  scatter(95, 0, 56, ko, (x, z) => grassTuft(x, z, rand(0.85, 1.45)));
}
