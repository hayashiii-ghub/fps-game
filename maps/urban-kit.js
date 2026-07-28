(() => {
'use strict';

/* ============================================================
   URBAN KIT ― 都市型マップ共用アセット
   ------------------------------------------------------------
   リアルなオフィス街（丸の内・大手町系）を成立させるための
   専用素材集。Desert/Jungle のミリタリー系素材や、ネオン・
   提灯・自販機のような観光的な日本記号には頼らない。

   構成:
     テクスチャ … ガラスカーテンウォール / 御影石 / 打ち放し
                  コンクリート / 石畳 / アスファルト / 仮囲い
     建物       … towerGlass / towerStone / midGrid / pilotis
     街路家具   … 街路樹・花壇・生け垣・ベンチ・街灯・信号・
                  バス停・地下鉄入口・ボラード・自転車ラック
     車両       … タクシー・セダン・配送バン（実在色のみ）
     舗装       … 歩道・広場・横断歩道・黄色センターライン
     遠景       … 場外スカイライン＋スカイツリー／東京タワー

   固体の纪律（重要）:
     移動コライダは URBAN.solid() 1 関数（world.js box の葉登録）
     に集約し、worker/map-solids.js の slab() と 1 対 1 で対応。
     頭上の屋根・キャノピー・張り出しは deco()（移動・弾・視線
     すべて素通し）か shell()（弾だけ当たる）。街路樹は幹だけ
     移動を遮り、射線は markLosExempt で対象外。
   ============================================================ */

const HALF = Math.PI / 2;

/* ============================================================
   テクスチャ
   ============================================================ */

const texAsphalt = () => makeTex(256, (ctx, s) => {
  ctx.fillStyle = '#33353a'; ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 950, ['#2c2e32', '#3c3e43', '#282a2d', '#424449'], 0.5, 2.2);
  for (let i = 0; i < 10; i++) {          // 補修跡
    ctx.fillStyle = 'rgba(22,24,26,.25)';
    ctx.fillRect(rand(0, s), rand(0, s), rand(16, 52), rand(4, 12));
  }
});

/** 歩道の石畳（大判タイル。1枚ずつ濃淡が違う） */
const texPaver = () => makeTex(256, (ctx, s) => {
  ctx.fillStyle = '#84868c'; ctx.fillRect(0, 0, s, s);
  const n = 4;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const tone = 0.92 + Math.random() * 0.14;
      ctx.fillStyle = `rgba(${132 * tone | 0},${134 * tone | 0},${140 * tone | 0},1)`;
      ctx.fillRect(c * (s / n) + 2, r * (s / n) + 2, s / n - 4, s / n - 4);
    }
  }
  ctx.strokeStyle = 'rgba(48,51,56,.6)'; ctx.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    const p = (i / n) * s;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
  }
  speckle(ctx, s, 160, ['#76787e', '#92949a'], 0.6, 2);
});

/** 広場の御影石敷き（目地太め・やや暖色） */
const texPlaza = () => makeTex(256, (ctx, s) => {
  ctx.fillStyle = '#8e8a83'; ctx.fillRect(0, 0, s, s);
  const n = 2;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const tone = 0.94 + Math.random() * 0.1;
      ctx.fillStyle = `rgba(${142 * tone | 0},${138 * tone | 0},${131 * tone | 0},1)`;
      ctx.fillRect(c * (s / n) + 3, r * (s / n) + 3, s / n - 6, s / n - 6);
    }
  }
  ctx.strokeStyle = 'rgba(56,54,50,.65)'; ctx.lineWidth = 4;
  for (let i = 0; i <= n; i++) {
    const p = (i / n) * s;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
  }
  speckle(ctx, s, 200, ['#7e7a74', '#9a968e'], 0.5, 1.8);
});

/** ガラスカーテンウォール（フロアごとのガラス帯＋点灯窓） */
const texCurtain = (frame, glass, lit) => makeTex(128, (ctx, s) => {
  ctx.fillStyle = frame; ctx.fillRect(0, 0, s, s);
  const cols = 6, rows = 8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // ガラスは面ごとにわずかに色むら（空の反射）
      const v = 0.9 + Math.random() * 0.2;
      const on = Math.random() < 0.22;
      if (on) ctx.fillStyle = lit;
      else {
        const m = glass.match(/#(..)(..)(..)/);
        ctx.fillStyle = `rgb(${parseInt(m[1], 16) * v | 0},${parseInt(m[2], 16) * v | 0},${parseInt(m[3], 16) * v | 0})`;
      }
      ctx.fillRect(c * (s / cols) + 2, r * (s / rows) + 2, s / cols - 4, s / rows - 4);
    }
    // スラブ線
    ctx.fillStyle = 'rgba(16,20,26,.5)';
    ctx.fillRect(0, r * (s / rows), s, 2);
  }
});

/** 御影石ファサード（縦長の窓と石目） */
const texStone = (base, joint, win, lit) => makeTex(128, (ctx, s) => {
  ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 420, ['rgba(90,80,66,.5)', 'rgba(210,200,180,.4)', 'rgba(70,64,54,.4)'], 0.4, 1.6);
  // 縦長窓の列
  const cols = 5;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < 4; r++) {
      ctx.fillStyle = Math.random() < 0.18 ? lit : win;
      ctx.fillRect(c * (s / cols) + s / 14, r * (s / 4) + s / 12, s / 9, s / 6);
    }
  }
  // 目地
  ctx.strokeStyle = joint; ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * s;
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
  }
});

/** 打ち放しコンクリート＋ punched window（中層ビル） */
const texPunched = (base, win, lit) => makeTex(128, (ctx, s) => {
  ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 260, ['rgba(70,74,80,.4)', 'rgba(160,164,170,.35)'], 0.5, 2);
  const cols = 5, rows = 6;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = Math.random() < 0.16 ? lit : win;
      ctx.fillRect(c * (s / cols) + 4, r * (s / rows) + 4, s / cols - 8, s / rows - 8);
    }
  }
});

/** アルミパネル（低層棟） */
const texPanel = (base) => makeTex(128, (ctx, s) => {
  ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(50,54,60,.4)'; ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * s;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
  }
  speckle(ctx, s, 120, ['rgba(255,255,255,.1)', 'rgba(0,0,0,.14)'], 0.8, 3);
});

/** 仮囲い（白い鋼板＋下端の黒） */
const texHoarding = () => makeTex(128, (ctx, s) => {
  ctx.fillStyle = '#a2a8ae'; ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(64,70,78,.5)'; ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const x = (i / 8) * s;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(36,40,46,.4)'; ctx.fillRect(0, s * 0.85, s, s * 0.15);
});

/** 夕暮れの空（西の夕日＋薄い雲帯） */
const texDuskSky = () => makeTex(512, (ctx, s) => {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#1a2544');
  g.addColorStop(0.4, '#463a5c');
  g.addColorStop(0.58, '#7e5468');
  g.addColorStop(0.72, '#c67e5e');
  g.addColorStop(0.85, '#e89e60');
  g.addColorStop(1, '#c08a52');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const sun = ctx.createRadialGradient(s * 0.68, s * 0.76, 2, s * 0.68, s * 0.76, s * 0.18);
  sun.addColorStop(0, 'rgba(255,216,150,.85)');
  sun.addColorStop(0.4, 'rgba(255,182,110,.4)');
  sun.addColorStop(1, 'rgba(255,170,100,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, s, s);
  // 薄い雲帯
  ctx.fillStyle = 'rgba(40,36,60,.22)';
  for (let i = 0; i < 7; i++) {
    const y = rand(s * 0.15, s * 0.55);
    ctx.fillRect(rand(-s * 0.2, s * 0.6), y, rand(s * 0.3, s * 0.7), rand(2, 6));
  }
});

/* ============================================================
   マテリアル
   ============================================================ */

let M = null;

function materials() {
  if (M) return M;
  // world.js buildMaterials と同じく sRGB→linear へ寄せる
  const L = (o) => {
    const m = new THREE.MeshLambertMaterial(o);
    if (o.color !== undefined) m.color.convertSRGBToLinear();
    return m;
  };
  M = {
    asphalt: L({ map: texAsphalt() }),
    paver: L({ map: texPaver() }),
    plaza: L({ map: texPlaza() }),
    hoarding: L({ map: texHoarding() }),
    curtainBlue: L({ map: texCurtain('#39434f', '#232d3a', '#ffd9a0') }),
    curtainGrey: L({ map: texCurtain('#454a52', '#28313c', '#ffcf92') }),
    stoneBeige: L({ map: texStone('#b3a691', 'rgba(120,108,90,.5)', '#333c46', '#ffd9a0') }),
    stoneGrey: L({ map: texStone('#9a968c', 'rgba(104,100,92,.5)', '#323a44', '#ffcf92') }),
    punched: L({ map: texPunched('#9aa0a6', '#2b323a', '#ffd9a0') }),
    panel: L({ map: texPanel('#8f959d') }),
    concrete: L({ color: 0x8a8d92 }),
    steel: L({ color: 0x565b62 }),
    darkSteel: L({ color: 0x32363c }),
    glassDark: L({ color: 0x232c36 }),
    stoneTrim: L({ color: 0x8b877e }),
    hedge: L({ color: 0x3f5233, flatShading: true }),
    leaf: L({ color: 0x536e37, flatShading: true }),
    leafDark: L({ color: 0x425a2c, flatShading: true }),
    bark: L({ color: 0x51402c }),
    soilTop: L({ color: 0x3d332a }),
    benchWood: L({ color: 0x6e5a42 }),
    taxiBlack: L({ color: 0x1f2227 }),
    sedanBlack: L({ color: 0x26292e }),
    sedanWhite: L({ color: 0xc4c7cb }),
    sedanGrey: L({ color: 0x686e76 }),
    vanWhite: L({ color: 0xc2c5c9 }),
    busBody: L({ color: 0xb8bcb6 }),
    busBand: L({ color: 0x4a6b58 }),
    tire: L({ color: 0x1a1a1c }),
    hubGrey: L({ color: 0x9aa0a6 }),
    bikeBlue: L({ color: 0x2c3e50 }),
    bikeRed: L({ color: 0x5c2e35 }),
    skyline: L({ color: 0x57516b }),
    lawnGreen: L({ color: 0x46582f }),
  };
  for (const key of Object.keys(M)) M[key].name = key;
  return M;
}

/* ---- 自己発光（天候 night で周囲が暗くなると、ここだけ残る） ---- */

const glowCache = new Map();
function glow(color) {
  if (!glowCache.has(color)) {
    glowCache.set(color, new THREE.MeshBasicMaterial({ color }));
  }
  return glowCache.get(color);
}

/* ============================================================
   プリミティブ
   ============================================================ */

/** 移動コライダを持つ唯一の形。worker/map-solids.js の slab() と同じ引数 */
function solid(x, z, w, h, d, yaw, mat, y0) {
  return box(w, h, d, mat, x, (y0 || 0) + h / 2, z, yaw || 0);
}

/** 見た目のみ（移動・弾・視線すべて素通し） */
function deco(mat, w, h, d, x, y, z, yaw) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (yaw) m.rotation.y = yaw;
  mapGroup.add(m);
  return m;
}

/** 路面のペイント（見た目のみ） */
function paint(mat, w, d, x, z, yaw) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = yaw || 0;
  m.position.set(x, 0.02, z);
  mapGroup.add(m);
  return m;
}

/** 弾は当たるが移動コライダを持たない塊（ピロティ上層・キャノピーなど） */
function shell(meshOrGroup) {
  return addObstacle(meshOrGroup, false);
}

/* ============================================================
   建物
   ============================================================ */

/** エントランス共通飾り（凹み・ガラスの灯り・キャノピー・銘板） */
function entrance(x, z, w, d, face, bw) {
  const [fx, fz] = face;
  const sx = x + fx * (w / 2), sz = z + fz * (d / 2);
  const yaw = fx ? (fx > 0 ? HALF : -HALF) : (fz > 0 ? 0 : Math.PI);
  deco(M.glassDark, fx ? 0.14 : bw, 2.6, fx ? bw : 0.14, sx, 1.3, sz, 0);
  deco(glow(0xffe9c4), fx ? 0.08 : bw * 0.8, 2.2, fx ? bw * 0.8 : 0.08,
    sx + fx * 0.05, 1.15, sz + fz * 0.05, 0);
  // キャノピー（頭上なので弾だけ当たる）
  const can = new THREE.Mesh(
    new THREE.BoxGeometry(fx ? 1.6 : bw + 1, 0.22, fx ? bw + 1 : 1.6), M.darkSteel);
  can.position.set(sx + fx * 0.8, 2.9, sz + fz * 0.8);
  shell(can);
  // 銘板
  deco(M.stoneTrim, fx ? 0.1 : 1.2, 0.5, fx ? 1.2 : 0.1,
    sx + fx * 0.1, 3.3, sz + fz * 0.1, yaw);
}

/** 屋上（パラペット＋設備） */
function rooftop(x, z, w, h, d) {
  deco(M.concrete, w + 0.26, 0.5, d + 0.26, x, h + 0.22, z, 0);
  deco(M.steel, 1.7, 1.0, 1.3, x + w * 0.22, h + 0.7, z - d * 0.2, 0);
  deco(M.steel, 1.1, 0.7, 0.9, x - w * 0.26, h + 0.55, z + d * 0.24, 0);
}

/** ガラスカーテンウォールのタワー（金融系）。固体は footprint×全高の1箱 */
function towerGlass(x, z, w, h, d, face) {
  solid(x, z, w, h, d, 0, Math.random() < 0.5 ? M.curtainBlue : M.curtainGrey);
  rooftop(x, z, w, h, d);
  entrance(x, z, w, d, face, Math.min(w, d) * 0.4);
  if (h >= 14) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), glow(0xff4444));
    l.position.set(x, h + 0.75, z);
    mapGroup.add(l);
  }
}

/** 御影石ファサードのタワー（官公庁・老舗系） */
function towerStone(x, z, w, h, d, face) {
  solid(x, z, w, h, d, 0, Math.random() < 0.5 ? M.stoneBeige : M.stoneGrey);
  rooftop(x, z, w, h, d);
  entrance(x, z, w, d, face, Math.min(w, d) * 0.36);
}

/** 中層の打ち放しコンクリートビル */
function midGrid(x, z, w, h, d, face) {
  solid(x, z, w, h, d, 0, M.punched);
  rooftop(x, z, w, h, d);
  entrance(x, z, w, d, face, Math.min(w, d) * 0.4);
}

/** 低層のアルミパネル棟 */
function lowPanel(x, z, w, h, d, face) {
  solid(x, z, w, h, d, 0, M.panel);
  deco(M.darkSteel, w + 0.2, 0.3, d + 0.2, x, h + 0.12, z, 0);
  entrance(x, z, w, d, face, Math.min(w, d) * 0.4);
}

/**
 * ピロティ型タワー（オフィス街の歩行者空間）。
 * 1階は柱とコアだけで歩き通せる。上層は shell（弾だけ当たる）。
 * 固体: 柱 0.7角 × 8 ＋ 中央コア 3.4角（全高）。worker/map-solids.js
 * の urbanPilotis() と同じ配置にすること。
 */
function pilotis(x, z, w, h, d, upperMat, face) {
  const y0 = 3.2;
  const g = 5.35;
  for (const [lx, lz] of [[-g, -g], [g, -g], [-g, g], [g, g],
                          [-g, 0], [g, 0], [0, -g], [0, g]]) {
    solid(x + lx, z + lz, 0.7, y0, 0.7, 0, M.concrete);
  }
  solid(x, z, 3.4, h, 3.4, 0, M.stoneTrim);   // エレベータコアは全高
  // 上層（ガラスか石材）。弾は当たるが移動コライダは持たない
  const upper = new THREE.Mesh(new THREE.BoxGeometry(w, h - y0, d), upperMat);
  upper.position.set(x, y0 + (h - y0) / 2, z);
  shell(upper);
  // ピロティ天井（コアまわりのロビーはガラスの灯り）
  deco(glow(0xffe9c4), 2.8, 2.2, 0.08, x, 1.15, z + 1.74, 0);
  rooftop(x, z, w, h, d);
  // キャノピー
  const [fx, fz] = face;
  const can = new THREE.Mesh(new THREE.BoxGeometry(fx ? 1.8 : 4, 0.22, fx ? 4 : 1.8), M.darkSteel);
  can.position.set(x + fx * (w / 2 + 0.9), 2.95, z + fz * (d / 2 + 0.9));
  shell(can);
}

/* ============================================================
   街路家具
   ============================================================ */

/** 街路樹（管理された樹形。幹だけ移動を遮り、射線は対象外・葉は弾が当たる） */
function streetTree(x, z, s = 1) {
  const g = new THREE.Group();
  const h = rand(3.0, 3.6) * s;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.2 * s, h, 7), M.bark);
  trunk.position.y = h / 2;
  g.add(trunk);
  // 剪定された樹冠（1〜2個の緊まった塊）
  const r = rand(1.0, 1.35) * s;
  const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), Math.random() < 0.5 ? M.leaf : M.leafDark);
  c1.position.set(rand(-0.2, 0.2) * s, h + r * 0.55, rand(-0.2, 0.2) * s);
  c1.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  g.add(c1);
  const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.62, 0), M.leaf);
  c2.position.set(rand(-0.4, 0.4) * s, h + r * 1.05, rand(-0.4, 0.4) * s);
  c2.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  g.add(c2);
  g.position.set(x, 0, z);
  addObstacle(g, false);
  markLosExempt(pushYawObb(x, h / 2, z, 0.2 * s, h / 2, 0.2 * s, 0));
  return g;
}

/** 花壇（0.5m 段。上に立てる） */
function planter(x, z, w, d) {
  solid(x, z, w, 0.5, d, 0, M.stoneTrim);
  deco(M.soilTop, w - 0.3, 0.08, d - 0.3, x, 0.5, z, 0);
  for (let i = 0; i < 3; i++) {
    const r = rand(0.28, 0.5);
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), M.hedge);
    b.position.set(x + rand(-w * 0.26, w * 0.26), 0.56 + r * 0.5, z + rand(-d * 0.26, d * 0.26));
    mapGroup.add(b);
  }
}

/** 生け垣（0.55m。よじ登れる低い壁。剪定された直方体） */
function hedge(x, z, w, d) {
  solid(x, z, w, 0.55, d, 0, M.hedge);
  deco(M.leafDark, w - 0.08, 0.1, d - 0.08, x, 0.58, z, 0);
}

/** ベンチ（石脚＋木板） */
function bench(x, z, yaw) {
  solid(x, z, 1.8, 0.45, 0.5, yaw, M.benchWood);
  deco(M.darkSteel, 1.7, 0.42, 0.08, x - Math.sin(yaw) * 0.25, 0.72,
    z - Math.cos(yaw) * 0.25, yaw);
}

/** ボラードの列（見た目のみ。移動・弾・視線すべて素通し） */
function bollardRow(x, z, yaw, n) {
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 1.5;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.75, 8), M.steel);
    m.position.set(x + Math.cos(yaw) * off, 0.37, z - Math.sin(yaw) * off);
    mapGroup.add(m);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8), M.darkSteel);
    cap.position.set(x + Math.cos(yaw) * off, 0.76, z - Math.sin(yaw) * off);
    mapGroup.add(cap);
  }
}

/** 街灯（白 LED のモダン型。ポールだけ固体） */
function streetLight(x, z, yaw) {
  solid(x, z, 0.16, 5.2, 0.16, 0, M.steel);
  const ax = x + Math.cos(yaw) * 0.9;
  const az = z - Math.sin(yaw) * 0.9;
  deco(M.steel, 1.9, 0.08, 0.08, ax, 5.0, az, yaw);
  const hx = x + Math.cos(yaw) * 1.75;
  const hz = z - Math.sin(yaw) * 1.75;
  deco(M.darkSteel, 0.55, 0.1, 0.22, hx, 4.96, hz, yaw);
  deco(glow(0xeef2ff), 0.46, 0.05, 0.16, hx, 4.9, hz, yaw);
}

/** 信号機（柱が固体。灯器は頭上で見た目のみ。青灯だけ点灯） */
function trafficSignal(x, z, yaw) {
  solid(x, z, 0.2, 4.8, 0.2, 0, M.steel);
  const armLen = 3.2;
  const ax = x + Math.cos(yaw) * armLen / 2;
  const az = z - Math.sin(yaw) * armLen / 2;
  deco(M.steel, armLen, 0.13, 0.13, ax, 4.5, az, yaw);
  const hx = x + Math.cos(yaw) * armLen;
  const hz = z - Math.sin(yaw) * armLen;
  deco(M.darkSteel, 1.4, 0.4, 0.24, hx, 4.26, hz, yaw);
  // 青だけ点灯、赤黄は消灯
  deco(glow(0x3fae62), 0.26, 0.26, 0.06,
    hx - Math.cos(yaw) * 0.42 + Math.sin(yaw) * 0.14, 4.26,
    hz + Math.sin(yaw) * 0.42 + Math.cos(yaw) * 0.14, yaw);
  for (const off of [0, 0.42]) {
    deco(M.glassDark, 0.26, 0.26, 0.06,
      hx + Math.cos(yaw) * off + Math.sin(yaw) * 0.14, 4.26,
      hz - Math.sin(yaw) * off + Math.cos(yaw) * 0.14, yaw);
  }
}

/** バス停（ポールとベンチが固体。屋根・標識は見た目のみ） */
function busStop(x, z, yaw) {
  solid(x, z, 0.14, 2.8, 0.14, 0, M.steel);
  bench(x + Math.cos(yaw) * 1.5, z - Math.sin(yaw) * 1.5, yaw);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.3), M.darkSteel);
  roof.position.set(x + Math.cos(yaw) * 1.3, 2.6, z - Math.sin(yaw) * 1.3);
  roof.rotation.y = yaw;
  mapGroup.add(roof);
  deco(M.panel, 0.5, 0.7, 0.06, x, 2.25, z, yaw);
  deco(glow(0xdfe8f2), 0.34, 0.34, 0.05, x, 2.6, z, yaw);
}

/**
 * 地下鉄入口（オープン階段型）。石枠に囲まれた開口から階段が
 * 暗がりへ降りていく、丸の内系の地上出入口。欄干で中には入れない
 * ので、降り口の階段は見た目だけにしても齟齬が出ない。
 * 固体: 縁石3枚（0.45m）＋欄干（0.9m）＋標識柱。
 * 屋根は shell（弾だけ当たる）。階段・手すり・案内板は見た目のみ。
 * ※ ファサード用テクスチャ（窓つき）は小物には使わない。
 */
function subwayEntrance(x, z, yaw) {
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const toWorld = (lx, lz) => ({
    wx: x + lx * cos + lz * sin,
    wz: z - lx * sin + lz * cos,
  });
  const put = (lx, lz, w, h, d, mat) => {
    const p = toWorld(lx, lz);
    solid(p.wx, p.wz, w, h, d, yaw, mat);
  };
  // 縁石（高さ 0.45m の石枠）: 奥・左右の3面
  put(0, 1.475, 3.2, 0.45, 0.25, M.stoneTrim);
  put(-1.475, 0, 0.25, 0.45, 2.7, M.stoneTrim);
  put(1.475, 0, 0.25, 0.45, 2.7, M.stoneTrim);
  // 欄干（0.9m。中は見えるが入れない）
  put(0, -1.35, 2.7, 0.9, 0.12, M.darkSteel);
  // 標識柱＋案内灯
  put(1.9, -1.2, 0.14, 1.9, 0.14, M.steel);
  const tp = toWorld(1.9, -1.2);
  deco(M.darkSteel, 0.46, 0.4, 0.05, tp.wx, 1.62, tp.wz, yaw);
  deco(glow(0xe8f0f8), 0.4, 0.32, 0.06, tp.wx, 1.62, tp.wz, yaw);

  // 階段・内壁・手すり（見た目のみ。暗がりへ降りていく形）
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const hh = 0.36 - i * 0.09;
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, hh, 0.3), M.concrete);
    step.position.set(0, hh / 2, -1.05 + i * 0.3);
    g.add(step);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.04, 1.5), M.glassDark);
  floor.position.set(0, 0.02, 0.6);
  g.add(floor);
  for (const sx of [-1.36, 1.36]) {           // 内壁（暗がり）
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 2.7), M.glassDark);
    wall.position.set(sx, 0.25, 0);
    g.add(wall);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.5, 0.04), M.glassDark);
  back.position.set(0, 0.25, 1.36);
  g.add(back);
  for (const sx of [-0.8, 0.8]) {             // 手すり（階段に沿って斜め）
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.35), M.steel);
    rail.position.set(sx, 0.75, -0.6);
    rail.rotation.x = -0.32;
    g.add(rail);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), M.steel);
    post.position.set(sx, 0.45, -1.2);
    g.add(post);
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  mapGroup.add(g);

  // 屋根（ポスト2本＋ガラス板と縁。頭上なので弾だけ当たる）
  const cg = new THREE.Group();
  for (const sx of [-1.2, 1.2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, 0.1), M.steel);
    post.position.set(sx, 1.15, -1.6);
    cg.add(post);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.06, 2.0), M.glassDark);
  roof.position.set(0, 2.35, -0.7);
  cg.add(roof);
  for (const ez of [-1.68, 0.28]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 0.12), M.darkSteel);
    edge.position.set(0, 2.33, ez);
    cg.add(edge);
  }
  cg.position.set(x, 0, z);
  cg.rotation.y = yaw;
  shell(cg);
}

/** 自転車1台（フレーム・ハンドル・サドル・前カゴつき。見た目のみ） */
function bicycleFrame(px, pz, yaw, lean, mat) {
  const g = new THREE.Group();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // a→b に円柱を張る（フレームの管材）
  const tube = (a, b, r, m2) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), m2 || mat);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.add(mesh);
  };
  // ホイール（リム＋ハブ＋スポーク2本）
  for (const wz of [-0.55, 0.55]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 16), M.darkSteel);
    rim.rotation.y = HALF;
    rim.position.set(0, 0.3, wz);
    g.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 6), M.hubGrey);
    hub.rotation.x = HALF;
    hub.position.set(0, 0.3, wz);
    g.add(hub);
    for (const [sw, sh, sd] of [[0.012, 0.56, 0.012], [0.012, 0.012, 0.56]]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), M.hubGrey);
      sp.position.set(0, 0.3, wz);
      g.add(sp);
    }
  }
  const bb = V(0, 0.32, 0.05);         // ボトムブラケット
  const head = V(0, 0.78, -0.42);      // ヘッドチューブ上端
  const seatTop = V(0, 0.74, 0.28);    // シート上端
  tube(bb, head, 0.022);               // ダウンチューブ
  tube(head, seatTop, 0.022);          // トップチューブ
  tube(seatTop, bb, 0.022);            // シートチューブ
  tube(head, V(0, 0.3, -0.55), 0.02);  // フォーク
  tube(bb, V(0, 0.3, 0.55), 0.018);    // チェーンステー
  tube(seatTop, V(0, 0.3, 0.55), 0.018); // シートステー
  // ハンドル（ステム＋バー）
  tube(head, V(0, 0.98, -0.45), 0.02, M.darkSteel);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 6), M.darkSteel);
  bar.rotation.z = HALF;
  bar.position.set(0, 0.98, -0.45);
  g.add(bar);
  // サドル・ペダル
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.24), M.darkSteel);
  saddle.position.set(0, 0.8, 0.3);
  g.add(saddle);
  const crank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.05), M.darkSteel);
  crank.position.set(0, 0.32, 0.05);
  g.add(crank);
  // 前カゴ（底＋4面の薄板）
  const bw = 0.3, bh = 0.2, bd = 0.24;
  const mk = (w, h, d, ox, oy, oz) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.darkSteel);
    p.position.set(ox, 0.78 + oy, -0.68 + oz);
    g.add(p);
  };
  mk(bw, 0.02, bd, 0, -bh / 2, 0);
  mk(bw, bh, 0.02, 0, 0, -bd / 2);
  mk(bw, bh, 0.02, 0, 0, bd / 2);
  mk(0.02, bh, bd, -bw / 2, 0, 0);
  mk(0.02, bh, bd, bw / 2, 0, 0);
  // スタンド
  tube(V(0.06, 0.3, 0.45), V(0.16, 0.01, 0.55), 0.014, M.darkSteel);
  g.position.set(px, 0, pz);
  g.rotation.y = yaw;
  g.rotation.z = lean;
  mapGroup.add(g);
}

/** 自転車ラック（見た目のみ） */
function bikeRack(x, z, yaw, n) {
  deco(M.steel, n * 0.62, 0.06, 0.06, x, 0.28, z, yaw);
  const mats = [M.bikeBlue, M.hubGrey, M.darkSteel, M.bikeRed];
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 0.62;
    const bx = x + Math.cos(yaw) * off, bz = z - Math.sin(yaw) * off;
    bicycleFrame(bx, bz, yaw + rand(-0.05, 0.05),
      rand(0.05, 0.12) * (Math.random() < 0.5 ? 1 : -1), mats[i % mats.length]);
  }
}

/** マンホール（見た目のみ） */
function manhole(x, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 12), M.darkSteel);
  m.position.set(x, 0.03, z);
  mapGroup.add(m);
}

/* ============================================================
   車両
   固体はボディ＋キャビンの2箱（セダン・タクシー）または1箱（バン）で、
   見た目と当たりが一致する。worker/map-solids.js の uCar() と同じ寸法。
   窓・灯火・ホイールは見た目のみ。
   ============================================================ */

/** 車の寸法。worker/map-solids.js の U_CAR_SIZE と一致させること */
const CAR_DIMS = {
  taxi: { body: [4.4, 0.72, 1.85], bodyY0: 0.28, cab: [2.1, 0.55, 1.66], cabX: -0.1 },
  sedan: { body: [4.5, 0.72, 1.8], bodyY0: 0.28, cab: [2.2, 0.55, 1.62], cabX: -0.15 },
  van: { body: [4.8, 1.9, 1.9], bodyY0: 0.3 },
  bus: { body: [9.0, 2.7, 2.3], bodyY0: 0.3 },
};

/** 2トーンホイール（タイヤ＋小さなハブキャップ） */
function wheel(g, wx, wy, wz, r) {
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.18, 14), M.tire);
  tire.rotation.x = HALF;
  tire.position.set(wx, wy, wz);
  g.add(tire);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.19, 10), M.hubGrey);
  hub.rotation.x = HALF;
  hub.position.set(wx, wy, wz);
  g.add(hub);
}

/** フラットな窓を面に貼る（傾斜させない。はみ出し三角の防止） */
function flatGlass(g, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.glassDark);
  m.position.set(x, y, z);
  g.add(m);
}

function carBody(x, z, yaw, kind, mat) {
  const K = CAR_DIMS[kind];
  const [bw, bh, bd] = K.body;
  const y0 = K.bodyY0 || 0;
  solid(x, z, bw, bh, bd, yaw, mat, y0);
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const top = y0 + bh;
  const g = new THREE.Group();

  if (K.cab) {
    const [cw, ch, cd] = K.cab;
    // キャビンも固体（y0 = ボディ天面）
    solid(x + K.cabX * cos, z - K.cabX * sin, cw, ch, cd, yaw, mat, top);
    // フロント／リア／サイドの窓（キャビンの面にフラットに貼る）
    flatGlass(g, 0.03, ch * 0.55, cd * 0.78, K.cabX + cw / 2 + 0.006, top + ch * 0.6, 0);
    flatGlass(g, 0.03, ch * 0.5, cd * 0.72, K.cabX - cw / 2 - 0.006, top + ch * 0.58, 0);
    for (const sz of [-1, 1]) {
      flatGlass(g, cw * 0.7, ch * 0.45, 0.02, K.cabX, top + ch * 0.58, sz * (cd / 2 + 0.006));
    }
    // サイドミラー
    for (const sz of [-1, 1]) {
      const mr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.12), M.darkSteel);
      mr.position.set(K.cabX + cw / 2 + 0.05, top + 0.12, sz * (bd / 2 + 0.05));
      g.add(mr);
    }
  }

  // シャーシの影（車体下の暗がり。ホイール間を埋める）
  const under = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.82, 0.16, bd * 0.72), M.darkSteel);
  under.position.set(0, Math.max(y0 - 0.1, 0.1), 0);
  g.add(under);

  // バンパー・グリル
  for (const sx of [-1, 1]) {
    const bp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, bd * 0.96), M.darkSteel);
    bp.position.set(sx * (bw / 2 - 0.07), y0 + 0.14, 0);
    g.add(bp);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, bd * 0.4), M.darkSteel);
  grille.position.set(bw / 2 + 0.005, y0 + 0.24, 0);
  g.add(grille);

  // ヘッド／テールライト（控えめに）
  for (const sz of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.22), glow(0xf5e6c0));
    hl.position.set(bw / 2 + 0.01, y0 + 0.26, sz * bd * 0.3);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.2), glow(0x6a1f1c));
    tl.position.set(-bw / 2 - 0.01, y0 + 0.26, sz * bd * 0.3);
    g.add(tl);
  }

  // フェンダー縁＋ホイール（ボディ面に納まる位置。黒いリムが見える）
  for (const dx of [-bw * 0.33, bw * 0.33]) {
    for (const sz of [-1, 1]) {
      const arch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.03), M.darkSteel);
      arch.position.set(dx, y0 + bh - 0.26, sz * (bd / 2 + 0.002));
      g.add(arch);
      wheel(g, dx, 0.34, sz * (bd / 2 - 0.03), 0.34);
    }
  }

  g.position.set(x, 0, z);
  g.rotation.y = yaw || 0;
  mapGroup.add(g);
  return g;
}

/** 黒塗りタクシー（琥珀色の行灯） */
function taxi(x, z, yaw) {
  const g = carBody(x, z, yaw, 'taxi', M.taxiBlack);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.28), glow(0xffc76a));
  sign.position.set(CAR_DIMS.taxi.cabX, 1.66, 0);
  g.add(sign);
}

/** 一般セダン（白・黒・灰の実在色） */
function sedan(x, z, yaw, mat) {
  carBody(x, z, yaw, 'sedan', mat);
}

/** 配送バン（白箱。キャブと荷室が一体の1箱） */
function van(x, z, yaw) {
  const K = CAR_DIMS.van;
  const [bw, bh, bd] = K.body;
  solid(x, z, bw, bh, bd, yaw, M.vanWhite, K.bodyY0);
  const g = new THREE.Group();
  // フロントガラスとサイドウィンドウ（面にフラットに）
  flatGlass(g, 0.03, 0.5, bd * 0.72, bw / 2 + 0.006, 1.58, 0);
  for (const sz of [-1, 1]) {
    flatGlass(g, 1.0, 0.34, 0.02, 1.85, 1.62, sz * (bd / 2 + 0.006));
  }
  // 荷室のパネルシーム（細く控えめに）
  for (const px of [-0.4, -1.7]) {
    for (const sz of [-1, 1]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.3, 0.012), M.hubGrey);
      seam.position.set(px, 1.2, sz * (bd / 2 + 0.004));
      g.add(seam);
    }
  }
  // シャーシの影
  const under = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.82, 0.18, bd * 0.72), M.darkSteel);
  under.position.set(0, 0.2, 0);
  g.add(under);
  // バンパー・ライト・ミラー
  const bp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.3, bd * 0.96), M.darkSteel);
  bp.position.set(bw / 2 - 0.09, 0.45, 0);
  g.add(bp);
  for (const sz of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.24), glow(0xf5e6c0));
    hl.position.set(bw / 2 + 0.01, 0.62, sz * 0.58);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.16), glow(0x6a1f1c));
    tl.position.set(-bw / 2 - 0.01, 0.75, sz * 0.72);
    g.add(tl);
    const mr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.14), M.darkSteel);
    mr.position.set(2.3, 1.5, sz * (bd / 2 + 0.06));
    g.add(mr);
  }
  for (const dx of [-1.6, 1.6]) {
    for (const sz of [-1, 1]) {
      const arch = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.24, 0.03), M.darkSteel);
      arch.position.set(dx, 0.72, sz * (bd / 2 + 0.002));
      g.add(arch);
      wheel(g, dx, 0.36, sz * (bd / 2 - 0.03), 0.36);
    }
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw || 0;
  mapGroup.add(g);
}

/** 路線バス（バス停に停車中の市バス。固体は1箱） */
function bus(x, z, yaw) {
  const K = CAR_DIMS.bus;
  const [bw, bh, bd] = K.body;
  solid(x, z, bw, bh, bd, yaw, M.busBody, K.bodyY0);
  const g = new THREE.Group();
  for (const sz of [-1, 1]) {
    // 側面のカラーバンド
    const band = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.96, 0.32, 0.02), M.busBand);
    band.position.set(0, 1.02, sz * (bd / 2 + 0.006));
    g.add(band);
    // 連続窓（6枚）
    for (let i = 0; i < 6; i++) {
      flatGlass(g, 1.05, 0.72, 0.02, -bw / 2 + 1.2 + i * 1.32, 2.2, sz * (bd / 2 + 0.006));
    }
    // 乗降ドア（前・中）
    for (const dx of [bw * 0.32, -bw * 0.06]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.75, 0.02), M.glassDark);
      door.position.set(dx, 1.25, sz * (bd / 2 + 0.006));
      g.add(door);
    }
  }
  // フロントガラス・行先表示・リアガラス
  flatGlass(g, 0.03, 0.9, bd * 0.78, bw / 2 + 0.006, 2.05, 0);
  const dest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.85), glow(0xdfe8c8));
  dest.position.set(bw / 2 + 0.012, 2.72, 0);
  g.add(dest);
  flatGlass(g, 0.03, 0.65, bd * 0.68, -bw / 2 - 0.006, 2.1, 0);
  // シャーシの影
  const under = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.85, 0.2, bd * 0.7), M.darkSteel);
  under.position.set(0, 0.2, 0);
  g.add(under);
  // バンパー・ライト・ミラー
  const bp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.32, bd * 0.94), M.darkSteel);
  bp.position.set(bw / 2 - 0.1, 0.48, 0);
  g.add(bp);
  for (const sz of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.26), glow(0xf5e6c0));
    hl.position.set(bw / 2 + 0.01, 0.6, sz * bd * 0.32);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.2), glow(0x6a1f1c));
    tl.position.set(-bw / 2 - 0.01, 0.8, sz * bd * 0.36);
    g.add(tl);
    const mr = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.2), M.darkSteel);
    mr.position.set(bw / 2 + 0.05, 1.95, sz * (bd / 2 + 0.09));
    g.add(mr);
  }
  // ホイール（前・後の2軸）
  for (const dx of [bw * 0.32, -bw * 0.28]) {
    for (const sz of [-1, 1]) {
      const arch = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.03), M.darkSteel);
      arch.position.set(dx, 0.78, sz * (bd / 2 + 0.002));
      g.add(arch);
      wheel(g, dx, 0.42, sz * (bd / 2 - 0.03), 0.42);
    }
  }
  // 屋上の冷房装置
  const ac = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.36, 0.18, bd * 0.5), M.hubGrey);
  ac.position.set(-bw * 0.04, 3.1, 0);
  g.add(ac);
  g.position.set(x, 0, z);
  g.rotation.y = yaw || 0;
  mapGroup.add(g);
}

/* ============================================================
   舗装
   ============================================================ */

/** 歩道（石畳。見た目のみで移動はフラットのまま） */
function sidewalk(x, z, w, d) {
  deco(M.paver, w, 0.12, d, x, 0.06, z, 0);
}

/** 広場（御影石敷き） */
function plazaFloor(x, z, w, d) {
  deco(M.plaza, w, 0.1, d, x, 0.05, z, 0);
}

const whitePaint = () => glow(0xd6dade);
const yellowPaint = () => glow(0xd8b84a);

/** 横断歩道（5本縞） */
function crosswalk(x, z, yaw) {
  for (let i = -2; i <= 2; i++) {
    paint(whitePaint(), 0.55, 3.0, x + Math.cos(yaw) * i * 1.2, z - Math.sin(yaw) * i * 1.2, yaw);
  }
}

/** 中央線（実在通り黄色の破線） */
function centerDashes(x0, z0, x1, z1, step) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(-(z1 - z0), x1 - x0);
  const n = Math.floor(len / step);
  for (let i = 0; i <= n; i++) {
    const t = i / Math.max(n, 1);
    paint(yellowPaint(), 2.2, 0.16, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, yaw);
  }
}

/* ============================================================
   遠景
   ============================================================ */

/** 夕霧を抜けてシルエットが残る遠景用マテリアル */
const landmarkMatCache = new Map();
function landmarkMat(hex, opts) {
  const noFog = !!(opts && opts.fog === false);
  const key = `${hex}:${noFog ? 'nf' : 'f'}`;
  if (!landmarkMatCache.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color: hex, fog: !noFog });
    m.color.convertSRGBToLinear();
    landmarkMatCache.set(key, m);
  }
  return landmarkMatCache.get(key);
}

/** 見た目のみの箱を mapGroup に置く（ランドマーク用。solid にしない） */
function landmarkBox(mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  mapGroup.add(m);
  return m;
}

/**
 * 東京スカイツリー風シルエット（錦糸町視点の北〜北西）。
 * 当たり判定なし。地理寄りスケール＋遠景用の軽い誇張。
 */
function skyTree(x, z) {
  const steel = landmarkMat(0x6a6578);
  const shaft = landmarkMat(0x7e788c);
  const deck = landmarkMat(0xb8b4c2);
  const blue = landmarkMat(0x4a8fb0, { fog: false });
  const tip = landmarkMat(0xff5555, { fog: false });
  // 第1展望台より下: 下へ向かって段々太くなる円錐（直下の最細=4）
  const cone = [
    [7.0, 4.5, 2.25],
    [6.2, 4.5, 6.75],
    [5.5, 4.5, 11.25],
    [4.9, 4.5, 15.75],
    [4.4, 4.5, 20.25],
    [4.0, 4.0, 24.5],
  ];
  for (const [w, h, cy] of cone) landmarkBox(steel, w, h, w, x, cy, z);
  // 第1展望台
  landmarkBox(deck, 7.2, 2.2, 7.2, x, 27.6, z);
  landmarkBox(blue, 6.6, 1.1, 6.6, x, 29.25, z);
  landmarkBox(steel, 5.2, 3.5, 5.2, x, 31.55, z);
  landmarkBox(deck, 6.0, 1.6, 6.0, x, 34.1, z);
  // 中間〜第2展望台〜アンテナ（総高 ~74）
  landmarkBox(shaft, 2.1, 15, 2.1, x, 42.4, z);
  landmarkBox(deck, 4.4, 1.8, 4.4, x, 51.3, z);
  landmarkBox(blue, 4.0, 0.9, 4.0, x, 52.65, z);
  landmarkBox(shaft, 1.2, 11, 1.2, x, 59.1, z);
  landmarkBox(shaft, 0.6, 9, 0.6, x, 69.1, z);
  landmarkBox(tip, 1.1, 1.1, 1.1, x, 74.1, z);
}

/**
 * 東京タワー風シルエット（錦糸町視点の南西〜西南西・遠景）。
 * 当たり判定なし。小さく遠く、尖端だけ霧抜け。
 */
function tokyoTower(x, z) {
  const red = landmarkMat(0x9a4040);
  const white = landmarkMat(0xb8b4c2);
  const steel = landmarkMat(0x6a6578);
  const tip = landmarkMat(0xff4444, { fog: false });
  const tipBand = landmarkMat(0xc05050, { fog: false });
  // 総高 ~48。通り軸から頭出しできる程度
  landmarkBox(red, 7.0, 1.1, 1.5, x, 0.55, z);
  landmarkBox(red, 1.5, 1.1, 7.0, x, 0.55, z);
  landmarkBox(red, 5.2, 4.8, 1.3, x, 3.5, z);
  landmarkBox(red, 1.3, 4.8, 5.2, x, 3.5, z);
  const bands = [
    [red, 4.3, 4.2, 8.6],
    [white, 3.6, 3.6, 12.5],
    [red, 3.0, 3.6, 16.1],
    [white, 2.55, 3.2, 19.5],
    [red, 2.15, 3.0, 22.6],
    [white, 1.8, 2.8, 25.5],
    [tipBand, 1.5, 2.6, 28.2],
  ];
  for (const [mat, w, h, cy] of bands) landmarkBox(mat, w, h, w, x, cy, z);
  landmarkBox(white, 3.2, 2.0, 3.2, x, 30.5, z);
  landmarkBox(tipBand, 2.2, 1.4, 2.2, x, 32.2, z);
  landmarkBox(steel, 0.85, 6.5, 0.85, x, 36.15, z);
  landmarkBox(steel, 0.45, 5.5, 0.45, x, 42.15, z);
  landmarkBox(tip, 0.95, 0.95, 0.95, x, 45.4, z);
}

/** 場外のオフィス群（夕靄に沈むシルエット。当たり判定なし） */
function skyline() {
  // 錦糸町視点: スカイツリー=北〜北西、東京タワー=西〜西南西（東西通りの先）
  const SKYTREE_A = Math.PI * 0.58;
  // 真西に近いほど中央東西通りの見通しに乗る（南に振りすぎると街区に隠れる）
  const TOWER_A = Math.PI * 1.04;
  const angDist = (a, b) => {
    let d = Math.abs(a - b) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    return d;
  };
  const put = (x, z, hBias) => {
    const h = hBias || rand(15, 58);
    const w = rand(9, 20);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, rand(9, 20)), materials().skyline);
    m.position.set(x, h / 2, z);
    mapGroup.add(m);
    if (h > 34) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), glow(0xff4444));
      l.position.set(x, h + 0.55, z);
      mapGroup.add(l);
    }
  };
  // 間引き気味の遠景リング（密すぎるとランドマークが埋もれる）
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand(-0.05, 0.05);
    if (angDist(a, SKYTREE_A) < 0.18) continue;
    if (angDist(a, TOWER_A) < 0.30) continue;
    const r = rand(90, 160);
    put(Math.cos(a) * r, Math.sin(a) * r);
  }
  // 方角ごとの軽いアクセント（少数）
  put(30, -110); put(10, -118);
  put(42, 135, 34); put(-48, 138, 30);
  put(-135, 35, 26); put(-130, -48, 24);

  skyTree(Math.cos(SKYTREE_A) * 148, Math.sin(SKYTREE_A) * 148);
  tokyoTower(Math.cos(TOWER_A) * 180, Math.sin(TOWER_A) * 180);
}

/* ============================================================
   公開
   ============================================================ */

globalThis.URBAN = {
  get M() { return materials(); },
  materials,
  texDuskSky,
  glow,
  solid, deco, paint, shell,
  towerGlass, towerStone, midGrid, lowPanel, pilotis,
  streetTree, planter, hedge, bench, bollardRow, streetLight, trafficSignal,
  busStop, subwayEntrance, bikeRack, manhole,
  taxi, sedan, van, bus,
  sidewalk, plazaFloor, crosswalk, centerDashes,
  skyline, skyTree, tokyoTower,
  HALF,
};

})();
