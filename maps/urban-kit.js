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
    tire: L({ color: 0x1a1a1c }),
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
 * 地下鉄入口（階段 kiosk。固体は 1 箱。内部の暗がり・手すり・
 * 案内灯は見た目のみ。オフィス街の象徴的な小さな構造物）
 */
function subwayEntrance(x, z, yaw) {
  solid(x, z, 2.6, 2.2, 2.0, yaw, M.stoneGrey);
  // 開口部の暗がり（前面）
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  deco(M.glassDark, 1.8, 1.7, 0.1, x + fx * 1.02, 0.85, z + fz * 1.02, yaw);
  deco(glow(0xdfe8f2), 1.6, 0.28, 0.06, x + fx * 1.04, 1.92, z + fz * 1.04, yaw);
  // 手すり
  deco(M.steel, 0.06, 0.9, 1.6, x + fx * 1.3 + Math.cos(yaw) * 0.5, 0.45,
    z + fz * 1.3 - Math.sin(yaw) * 0.5, yaw);
  deco(M.steel, 0.06, 0.9, 1.6, x + fx * 1.3 - Math.cos(yaw) * 0.5, 0.45,
    z + fz * 1.3 + Math.sin(yaw) * 0.5, yaw);
}

/** 自転車ラック（見た目のみ） */
function bikeRack(x, z, yaw, n) {
  deco(M.steel, n * 0.62, 0.06, 0.06, x, 0.28, z, yaw);
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 0.62;
    const bx = x + Math.cos(yaw) * off, bz = z - Math.sin(yaw) * off;
    for (const dz of [-0.5, 0.5]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 4, 10), M.darkSteel);
      wheel.position.set(bx + Math.sin(yaw) * dz, 0.31, bz + Math.cos(yaw) * dz);
      wheel.rotation.y = yaw + HALF;
      mapGroup.add(wheel);
    }
    deco(M.steel, 0.06, 0.5, 1.0, bx, 0.6, bz, yaw);
  }
}

/** マンホール（見た目のみ） */
function manhole(x, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 12), M.darkSteel);
  m.position.set(x, 0.03, z);
  mapGroup.add(m);
}

/* ============================================================
   車両（1台＝固体1つ。窓・タイヤ・灯火は見た目のみ）
   ============================================================ */

function carBody(x, z, yaw, w, h, d, mat, cabMat) {
  solid(x, z, w, h, d, yaw, mat);
  const g = new THREE.Group();
  const cab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.46, 0.48, d * 0.88), cabMat || mat);
  cab.position.set(-w * 0.05, h + 0.22, 0);
  g.add(cab);
  const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 0.32, d * 0.92), M.glassDark);
  win.position.set(-w * 0.05, h + 0.24, 0);
  g.add(win);
  for (const [dx, dz] of [[w * 0.32, d * 0.5], [w * 0.32, -d * 0.5],
                          [-w * 0.32, d * 0.5], [-w * 0.32, -d * 0.5]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10), M.tire);
    t.rotation.x = HALF;
    t.position.set(dx, 0.32, dz);
    g.add(t);
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw || 0;
  mapGroup.add(g);
  return g;
}

/** 黒塗りタクシー（琥珀色の行灯） */
function taxi(x, z, yaw) {
  const g = carBody(x, z, yaw, 4.4, 1.45, 1.85, M.taxiBlack);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.3), glow(0xffc76a));
  sign.position.set(-0.2, 1.45 + 0.58, 0);
  g.add(sign);
  const lampM = glow(0xfff0cc);
  for (const dz of [0.55, -0.55]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.26), lampM);
    l.position.set(2.22, 0.75, dz);
    g.add(l);
  }
}

/** 一般セダン（白・黒・灰の実在色） */
function sedan(x, z, yaw, mat) {
  carBody(x, z, yaw, 4.5, 1.4, 1.8, mat);
}

/** 配送バン（白箱） */
function van(x, z, yaw) {
  solid(x, z, 4.8, 2.2, 1.9, yaw, M.vanWhite);
  const g = new THREE.Group();
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.7), M.glassDark);
  win.position.set(1.85, 1.55, 0);
  g.add(win);
  for (const [dx, dz] of [[1.55, 0.95], [1.55, -0.95], [-1.55, 0.95], [-1.55, -0.95]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10), M.tire);
    t.rotation.x = HALF;
    t.position.set(dx, 0.34, dz);
    g.add(t);
  }
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

/** 場外のオフィス群（夕靄に沈むシルエット。当たり判定なし） */
function skyline() {
  const put = (x, z) => {
    const h = rand(15, 58);
    const w = rand(9, 20);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, rand(9, 20)), M.skyline);
    m.position.set(x, h / 2, z);
    mapGroup.add(m);
    if (h > 34) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), glow(0xff4444));
      l.position.set(x, h + 0.55, z);
      mapGroup.add(l);
    }
  };
  for (let i = 0; i < 42; i++) {
    const a = (i / 42) * Math.PI * 2 + rand(-0.04, 0.04);
    const r = rand(80, 155);
    put(Math.cos(a) * r, Math.sin(a) * r);
  }
  // 北の高層クラスタ
  put(30, -105); put(48, -96); put(10, -112);
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
  taxi, sedan, van,
  sidewalk, plazaFloor, crosswalk, centerDashes,
  skyline,
  HALF,
};

})();
