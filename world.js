'use strict';
/* ============================================================
   ワールド構築：レンダラー / シーン / テクスチャ / 障害物
   ============================================================ */

let renderer, scene, camera;
const colliders = [];     // THREE.Box3（移動衝突用）
const worldMeshes = [];   // 弾丸レイキャスト用
const SPAWN_POINTS = [
  [0, -56], [34, -48], [-34, -48], [54, -14], [-54, -14],
  [54, 30], [-54, 30], [26, 54], [-26, 54],
];

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
  };
  MAT.sandbag.map = texSand();
}

/* ---------- 障害物追加ヘルパー ---------- */
function addObstacle(mesh, useBoxCollider = true) {
  scene.add(mesh);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  worldMeshes.push(mesh);
  if (useBoxCollider) {
    mesh.updateMatrixWorld(true);
    colliders.push(new THREE.Box3().setFromObject(mesh));
  }
  return mesh;
}

function box(w, h, d, mat, x, y, z, rotY) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rotY) m.rotation.y = rotY;
  return addObstacle(m);
}

/* 建物（窓・扉は貼り付け） */
function building(x, z, w, h, d, rotY) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.concrete);
  body.position.y = h / 2;
  g.add(body);
  const winM = MAT.glass;
  const nw = Math.max(2, (w / 3) | 0);
  for (let i = 0; i < nw; i++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), winM);
    win.position.set(-w / 2 + 1.5 + i * ((w - 3) / Math.max(nw - 1, 1)), h * 0.62, d / 2 + 0.02);
    g.add(win);
    const win2 = win.clone(); win2.rotation.y = Math.PI; win2.position.z = -d / 2 - 0.02;
    g.add(win2);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.3), MAT.darkMetal);
  door.position.set(w * 0.25, 1.15, d / 2 + 0.02);
  g.add(door);
  // 屋上パラペット
  const par = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.5, d + 0.3), MAT.concrete);
  par.position.y = h + 0.2;
  g.add(par);
  g.position.set(x, 0, z);
  g.rotation.y = rotY || 0;
  return addObstacle(g);
}

/* コンテナ */
function container(x, z, rotY, mat, y) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(6.1, 2.6, 2.45), mat);
  m.position.set(x, (y || 0) + 1.3, z);
  m.rotation.y = rotY;
  return addObstacle(m);
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
      g.add(b);
    }
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY || 0;
  return addObstacle(g);
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
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.6), MAT.glass);
  win.position.set(-0.5, 1.75, 0.92);
  g.add(win);
  const winG = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.6), MAT.glass);
  winG.rotation.y = Math.PI; winG.position.set(-0.5, 1.75, -0.92);
  g.add(winG);
  for (const [dx, dz] of [[1.45, 1.0], [1.45, -1.0], [-1.45, 1.0], [-1.45, -1.0]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 12), MAT.tire);
    w.rotation.x = Math.PI / 2;
    w.position.set(dx, 0.46, dz);
    g.add(w);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  g.rotation.z = rand(-0.05, 0.05);
  return addObstacle(g);
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
    scene.add(r);
  }
  for (let i = 0; i < 18; i++) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(rand(0.2, 0.45), rand(0.4, 0.9), 5), MAT.bush);
    const a = rand(0, Math.PI * 2), d = rand(30, 72);
    b.position.set(Math.cos(a) * d, 0.2, Math.sin(a) * d);
    b.castShadow = true;
    scene.add(b);
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
  scene.fog = new THREE.FogExp2(0xbfb193, 0.0075);

  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 600);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  // 空
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(480, 20, 12),
    new THREE.MeshBasicMaterial({ map: texSky(), side: THREE.BackSide, fog: false })
  );
  scene.add(sky);

  // 光
  const hemi = new THREE.HemisphereLight(0x9fa8b2, 0x6b5f48, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.05);
  sun.position.set(70, 95, 35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -85; sun.shadow.camera.right = 85;
  sun.shadow.camera.top = 85; sun.shadow.camera.bottom = -85;
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  buildMaterials();

  // 地面
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), MAT.sand);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  worldMeshes.push(ground);

  // 境界の土手
  const bermM = MAT.sandbag;
  for (const [x, z, w, d] of [
    [0, -62, 128, 6], [0, 62, 128, 6], [-62, 0, 6, 128], [62, 0, 6, 128],
  ]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, d), bermM);
    b.position.set(x, 0.8, z);
    scene.add(b); b.receiveShadow = true;
    worldMeshes.push(b);
    colliders.push(new THREE.Box3().setFromObject(b));
  }

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

  decor();
}
