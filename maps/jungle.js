(() => {
'use strict';

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

registerMap({
  id: 'jungle',
  build: buildJungleMap,
  fog: 0x8faa8a,
  hemiSky: 0x9bb89a,
  hemiGround: 0x3a4a32,
  sun: 0xe8e4c8,
  fogDensity: 0.0115,
  dust: 0x9cbc82,
  minimapBg: 'rgba(24, 34, 20, 0.98)',
});

})();
