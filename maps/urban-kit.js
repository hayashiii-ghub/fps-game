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

/* ---- ファサードのモジュール ----
 * テクスチャ1枚 = 2窓 × 2階（= MODULE_W × MODULE_H メートル）。
 * 建物ごとに scaleBoxUv() で実寸ぶんタイリングするので、どの大きさの棟でも
 * 窓と階高が同じ実寸で揃う。以前は建物1面につき1枚を引き伸ばしていたため、
 * 幅4mの棟にも幅16mの棟にも同じ6列が描かれ、階高0.8mのような絵になっていた。
 * 4窓のうち1つだけ点灯させる。残りのばらつきは litWindows() が足す。
 */
const BAY_W = 1.8;      // 窓1枚ぶんの間口
const FLOOR_H = 3.5;    // 階高
/**
 * ピロティの天井高。16m四方に対して 3.2m だと立体駐車場に見えたので上げた。
 * 柱の固体高でもあるため、worker/map-solids.js の uPilotis() と必ず揃える。
 */
const PILOTIS_H = 5.0;

/** ガラスカーテンウォール（方立・スラブ帯・点灯窓） */
const texCurtain = (frame, glass, lit) => makeTex(128, (ctx, s) => {
  ctx.fillStyle = frame; ctx.fillRect(0, 0, s, s);
  const h = s / 2;
  const m = glass.match(/#(..)(..)(..)/);
  const rgb = [1, 2, 3].map(i => parseInt(m[i], 16));
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const on = r === 0 && c === 1;                 // 4枚に1枚を点灯
      const v = 0.92 + ((r + c) % 2) * 0.12;         // ガラスの色むら（空の反射）
      ctx.fillStyle = on ? lit
        : `rgb(${rgb[0] * v | 0},${rgb[1] * v | 0},${rgb[2] * v | 0})`;
      ctx.fillRect(c * h + 5, r * h + 8, h - 10, h - 22);
      // 腰のスパンドレル（不透明部）
      ctx.fillStyle = 'rgba(20,25,32,.55)';
      ctx.fillRect(c * h + 5, r * h + h - 14, h - 10, 10);
    }
    ctx.fillStyle = 'rgba(14,18,24,.75)';            // スラブ線
    ctx.fillRect(0, r * h, s, 4);
  }
});

/** 御影石ファサード（縦長の窓と石目） */
const texStone = (base, joint, win, lit) => makeTex(128, (ctx, s) => {
  ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 420, ['rgba(90,80,66,.5)', 'rgba(210,200,180,.4)', 'rgba(70,64,54,.4)'], 0.4, 1.6);
  const h = s / 2;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      ctx.fillStyle = r === 1 && c === 0 ? lit : win;
      ctx.fillRect(c * h + h * 0.28, r * h + h * 0.2, h * 0.44, h * 0.52);
      ctx.fillStyle = 'rgba(255,255,255,.13)';       // 窓上の庇・見切り
      ctx.fillRect(c * h + h * 0.24, r * h + h * 0.14, h * 0.52, 3);
    }
  }
  ctx.strokeStyle = joint; ctx.lineWidth = 1;        // 石の目地
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * s;
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
  }
});

/** 打ち放しコンクリート＋ punched window（中層ビル） */
const texPunched = (base, win, lit) => makeTex(128, (ctx, s) => {
  ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 260, ['rgba(70,74,80,.4)', 'rgba(160,164,170,.35)'], 0.5, 2);
  const h = s / 2;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      ctx.fillStyle = 'rgba(0,0,0,.35)';             // 窓の落ち込み（見切り）
      ctx.fillRect(c * h + h * 0.16, r * h + h * 0.2, h * 0.68, h * 0.5);
      ctx.fillStyle = r === 0 && c === 0 ? lit : win;
      ctx.fillRect(c * h + h * 0.2, r * h + h * 0.24, h * 0.6, h * 0.42);
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

/**
 * 看板用の発光。`glow()` は色を linear 直指定なので彩度の高い色が破綻する。
 * こちらは sRGB→linear 変換を通すので、見た目どおりの色で書ける。
 */
const signCache = new Map();
function sign(color) {
  if (!signCache.has(color)) {
    const m = new THREE.MeshBasicMaterial({ color });
    m.color.convertSRGBToLinear();
    signCache.set(color, m);
  }
  return signCache.get(color);
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

/**
 * 敷地から決まる 0..1 の疑似乱数。
 * `Math.random()` だと zPair の南北で違う結果になり、TDM の青/赤で見た目が
 * 揃わない。`|z|` を使うことで南北が必ず鏡像になる。
 */
function siteRand(x, z, salt) {
  const s = Math.sin(x * 12.9898 + Math.abs(z) * 78.233 + (salt || 0) * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * 面の実寸ぶんだけ UV を伸ばし、窓と階高をどの棟でも同じ実寸で揃える。
 * テクスチャは共有のまま（clone しない）ので、描画コストは増えない。
 * BoxGeometry の頂点は面ごとに4点、順は [+x, -x, +y, -y, +z, -z]。
 */
function scaleBoxUv(geo, w, h, d) {
  const uv = geo.attributes.uv;
  if (!uv) return;
  // テクスチャ1枚 = 2窓 × 2階なので、タイル数は「枚数 ÷ 2」の 0.5 刻み。
  // 半端はモジュールのちょうど中央で切れるため、窓や階の途中で切れない。
  const bays = v => Math.max(1, Math.round(v / BAY_W)) / 2;
  const floors = Math.max(1, Math.round(h / FLOOR_H)) / 2;
  const perFace = [
    [bays(d), floors], [bays(d), floors],   // ±x（側面）は奥行き × 高さ
    [bays(w), bays(d)], [bays(w), bays(d)], // ±y（天地）は幅 × 奥行き
    [bays(w), floors], [bays(w), floors],   // ±z（正背面）は幅 × 高さ
  ];
  for (let f = 0; f < 6; f++) {
    const [ru, rv] = perFace[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * ru, uv.getY(k) * rv);
    }
  }
  uv.needsUpdate = true;
}

/** 実寸タイリングを効かせた建物本体。固体としては solid() と同じ1箱 */
function facadeSolid(x, z, w, h, d, yaw, mat, y0) {
  const m = solid(x, z, w, h, d, yaw, mat, y0);
  scaleBoxUv(m.geometry, w, h, d);
  return m;
}

/**
 * ファサードの凹凸（床スラブの帯と角の柱型）。
 * 平らな面は近づくと壁紙に見えるので、わずかな出っ張りで自己影を作る。
 * すべて deco なので当たり判定は増えない。
 */
function facadeRelief(x, z, w, h, d, y0) {
  const base = y0 || 0;
  const floors = Math.max(1, Math.round(h / FLOOR_H));        // テクスチャの階割りに合わせる
  for (let i = 1; i < floors; i++) {
    deco(M.concrete, w + 0.14, 0.14, d + 0.14, x, base + (h * i) / floors, z, 0);
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    deco(M.concrete, 0.32, h, 0.32, x + sx * (w / 2), base + h / 2, z + sz * (d / 2), 0);
  }
}

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

/**
 * 屋上（パラペット＋設備）。
 * 台数・寸法・塔屋・水槽/アンテナを敷地ごとに変えて、遠景のスカイラインが
 * コピペに見えないようにする。すべて deco なので当たりには影響しない。
 */
function rooftop(x, z, w, h, d) {
  const r = n => siteRand(x, z, n);
  deco(M.concrete, w + 0.26, 0.5, d + 0.26, x, h + 0.22, z, 0);

  // 空調室外機 1〜3 台
  const units = 1 + Math.floor(r(1) * 3);
  for (let i = 0; i < units; i++) {
    const uw = 0.9 + r(10 + i) * 1.1;
    const ud = 0.7 + r(20 + i) * 0.8;
    const uh = 0.5 + r(30 + i) * 0.6;
    deco(M.steel, uw, uh, ud,
      x + (r(40 + i) - 0.5) * (w - uw - 0.8),
      h + 0.45 + uh / 2,
      z + (r(50 + i) - 0.5) * (d - ud - 0.8), 0);
  }

  // 塔屋（階段室）。小さすぎる屋上には載せない
  if (w > 6 && d > 6 && r(2) < 0.6) {
    const pw = Math.min(w * 0.32, 3.6), pd = Math.min(d * 0.32, 3.2);
    deco(M.concrete, pw, 2.3, pd, x - w * 0.2, h + 1.6, z + d * 0.18, 0);
  }

  // 高置水槽（脚付き）かアンテナ柱のどちらか
  if (r(3) < 0.5) {
    const tx = x + w * 0.24, tz = z - d * 0.26;
    for (const [lx, lz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      deco(M.steel, 0.14, 1.1, 0.14, tx + lx, h + 1.0, tz + lz, 0);
    }
    deco(M.panel, 1.7, 0.9, 1.4, tx, h + 2.0, tz, 0);
  } else {
    const mx = x - w * 0.28, mz = z - d * 0.22;
    deco(M.steel, 0.12, 2.6 + r(4) * 1.8, 0.12, mx, h + 1.75 + r(4) * 0.9, mz, 0);
    deco(M.steel, 1.0, 0.08, 0.08, mx, h + 2.4, mz, 0);
  }
}

/** ガラスカーテンウォールのタワー（金融系）。固体は footprint×全高の1箱 */
function towerGlass(x, z, w, h, d, face) {
  facadeSolid(x, z, w, h, d, 0, siteRand(x, z, 7) < 0.5 ? M.curtainBlue : M.curtainGrey);
  facadeRelief(x, z, w, h, d);
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
  facadeSolid(x, z, w, h, d, 0, siteRand(x, z, 8) < 0.5 ? M.stoneBeige : M.stoneGrey);
  facadeRelief(x, z, w, h, d);
  rooftop(x, z, w, h, d);
  entrance(x, z, w, d, face, Math.min(w, d) * 0.36);
}

/** 中層の打ち放しコンクリートビル */
function midGrid(x, z, w, h, d, face) {
  facadeSolid(x, z, w, h, d, 0, M.punched);
  facadeRelief(x, z, w, h, d);
  rooftop(x, z, w, h, d);
  entrance(x, z, w, d, face, Math.min(w, d) * 0.4);
}

/**
 * 1階のテナント（コンビニ／カフェ／オフィスロビー／閉店シャッター）。
 *
 * `band` はサインバンドの発光色、`inner` は店内の光。
 * ネオン管・提灯・文字ロゴは使わず、光る帯と店内の明かりだけで業種を分ける
 * （原色の看板を足すと観光地の記号になり、オフィス街に見えなくなる）。
 */
/*
 * `bands` はサインバンドの帯色（上から順）。実在チェーンの配色を思わせる
 * 組み合わせにして業態を色で読ませるが、**社名・ロゴ・書体は一切入れない**。
 * 色と帯の本数だけで「コンビニ」「バーガー」「珈琲」と分かることを狙う。
 * 色は sign() を通すので、見た目どおりの sRGB 値で書いてよい。
 */
const SHOP_KINDS = {
  // ---- コンビニ（帯3本／2本で系統を分ける） ----
  conveniA: { bands: [0xef7d1a, 0x1f8a4c, 0xcf3b32], inner: 0xa8b8c6, frame: 'panel' },
  conveniB: { bands: [0x1f7a4d, 0xe8ecef, 0x2f5fa0], inner: 0xa8b8c6, frame: 'panel' },
  conveniC: { bands: [0x1c4f9c, 0xe8ecef], inner: 0xa8b8c6, frame: 'panel' },
  // ---- 飲食 ----
  burger: { bands: [0xc0201c, 0xe8b21c], inner: 0xd8b070, frame: 'darkSteel', blade: true },
  coffee: { bands: [0x14563c], inner: 0xb08a5e, frame: 'benchWood' },
  gyudon: { bands: [0xdd7a18, 0x1c1c1e], inner: 0xd0a060, frame: 'darkSteel', blade: true },
  ramen: { bands: [0xb02620, 0x141414], inner: 0xc89050, frame: 'darkSteel', blade: true },
  soba: { bands: [0x1d3557, 0xe8ecef], inner: 0xa89060, frame: 'benchWood' },
  curry: { bands: [0xd8a01c, 0x6b3b18], inner: 0xd0a058, frame: 'benchWood' },
  bakery: { bands: [0x8a5a2c, 0xe8d8b0], inner: 0xd8b884, frame: 'benchWood' },
  izakaya: { bands: [0x8f1f1f, 0x2a1a14], inner: 0xc07840, frame: 'benchWood', blade: true },
  // ---- 物販・サービス ----
  drug: { bands: [0xe8c81c, 0x1c4f9c], inner: 0xbcc8d0, frame: 'panel', blade: true },
  mobile: { bands: [0xcf2020, 0xe8ecef], inner: 0xc0ccd4, frame: 'panel' },
  books: { bands: [0xd06818, 0x3a2a18], inner: 0xc0a878, frame: 'benchWood' },
  bank: { bands: [0x14406b], inner: 0xb8bcc0, frame: 'stoneTrim' },
  clinic: { bands: [0x4fa8c8, 0xe8ecef], inner: 0xc8d4dc, frame: 'panel', blade: true },
  salon: { bands: [0x1c1c1e, 0xc8b48c], inner: 0xc0a880, frame: 'darkSteel' },
  gym: { bands: [0x1c1c1e, 0xd8d81c], inner: 0x9098a0, frame: 'darkSteel', blade: true },
  realty: { bands: [0x1f7a3e, 0xe8ecef], inner: 0xb8c0b8, frame: 'panel' },
  // ---- 非店舗 ----
  lobby: { bands: [0x8f9aa6], inner: 0xbfae8e, frame: 'stoneTrim' },
  shutter: { bands: null, inner: null, frame: 'darkSteel' },          // テナント募集中
};

/**
 * 建物の通り側の壁を1階テナントに見せる。
 *
 * 壁そのものが既に固体なので、ここでは移動コライダを増やさない（庇だけ
 * shell＝弾のみ）。`face` は法線 [x, z]、`span` は間口が壁幅に占める割合。
 */
function shopfront(x, z, w, d, face, kind, span) {
  const k = SHOP_KINDS[kind] || SHOP_KINDS.lobby;
  const [fx, fz] = face;
  const len = (fx ? d : w) * (span || 0.82);   // 通りに平行な間口
  const frame = M[k.frame];
  const px = x + fx * (w / 2), pz = z + fz * (d / 2);
  // out=壁からの手前方向、off=通りに平行な方向のずらし
  const at = (mat, thick, hgt, wide, y, out, off) => deco(
    mat, fx ? thick : wide, hgt, fx ? wide : thick,
    px + fx * out + (fx ? 0 : off || 0), y,
    pz + fz * out + (fx ? off || 0 : 0), 0);

  if (kind === 'shutter') {
    at(M.darkSteel, 0.1, 2.6, len, 1.3, 0.06, 0);
    for (let i = 0; i < 6; i++) at(frame, 0.06, 0.05, len * 0.98, 0.35 + i * 0.44, 0.12, 0);
  } else {
    at(M.glassDark, 0.1, 2.5, len, 1.35, 0.06, 0);
    // 店内の光。腰壁ぶん床から浮かせて、ガラスの下端が暗く締まるようにする
    at(sign(k.inner), 0.06, 1.85, len * 0.93, 1.5, 0.12, 0);
    // 棚・カウンターの影（一様な光の面を横に割る）
    at(M.glassDark, 0.04, 0.14, len * 0.93, 1.12, 0.16, 0);
    at(M.glassDark, 0.04, 0.1, len * 0.93, 2.02, 0.16, 0);
    // 方立（ガラスを間仕切る縦桟）
    const bays = Math.max(2, Math.round(len / 2.4));
    for (let i = 1; i < bays; i++) {
      at(frame, 0.14, 2.5, 0.14, 1.35, 0.18, -len / 2 + (len * i) / bays);
    }
  }
  // サインバンド。帯の色と本数だけで業態を出す（文字・ロゴは入れない）
  at(frame, 0.16, 0.52, len + 0.3, 3.02, 0.08, 0);
  if (k.bands) {
    const sh = 0.36 / k.bands.length;
    k.bands.forEach((c, i) => {
      at(sign(c), 0.08, sh, len + 0.1, 3.02 + 0.18 - sh * (i + 0.5), 0.18, 0);
    });
  }
  // 庇（頭上なので弾だけ当たる）
  const can = new THREE.Mesh(
    new THREE.BoxGeometry(fx ? 1.2 : len + 0.6, 0.16, fx ? len + 0.6 : 1.2), M.darkSteel);
  can.position.set(px + fx * 0.6, 2.7, pz + fz * 0.6);
  shell(can);

  // 袖看板（壁から直角に張り出す縦看板）。通りを見通したときの縦のリズムを作る。
  // 上端 4.85m は間口の最低棟高（h*0.72）より低いので屋根を突き抜けない。
  if (k.blade && k.bands) {
    const off = len * 0.42;
    const bx = px + fx * 0.6 + (fx ? 0 : off);
    const bz = pz + fz * 0.6 + (fx ? off : 0);
    deco(frame, fx ? 1.15 : 0.14, 1.4, fx ? 0.14 : 1.15, bx, 4.15, bz, 0);
    // 板より少し厚くして、通りの左右どちらから見ても色面が出るようにする
    deco(sign(k.bands[0]), fx ? 0.98 : 0.19, 1.2, fx ? 0.19 : 0.98, bx, 4.15, bz, 0);
  }
}

/**
 * 街路壁の間口割り。通りに平行な `span` を幅 4〜9m の間口へ分ける。
 * 分割は siteRand で決まるので、worker/map-solids.js の uTerrace() と一致する
 * （ここを変えたら必ず両方直すこと。test-map-solids-parity が落ちる）。
 */
function terraceBays(x, z, span, salt) {
  const out = [];
  let used = 0;
  for (let i = 0; i < 8 && span - used > 3.2; i++) {
    let bw = 4 + siteRand(x + used * 3.1, z, salt + i) * 5;
    if (span - used - bw < 3.2) bw = span - used;   // 端数は最後の棟へ寄せる
    out.push({ off: used + bw / 2 - span / 2, w: bw });
    used += bw;
  }
  return out;
}

/**
 * 街路壁（連続した街並み）。
 *
 * 大きな箱を1つ置くと、目線の高さでは「のっぺりした壁」1枚にしかならない。
 * 間口を割って棟ごとに高さと素材を変えることで、通りに面が反復して街に見える。
 * `mats` は素材キーの配列、`shops` は1階テナントの種別配列（空なら店を出さない）。
 */
function streetTerrace(x, z, w, h, d, face, mats, shops) {
  const [fx, fz] = face;
  const span = fx ? d : w;      // 通りに平行な辺
  const dep = fx ? w : d;       // 奥行き
  for (const b of terraceBays(x, z, span, 60)) {
    const bx = x + (fx ? 0 : b.off);
    const bz = z + (fx ? b.off : 0);
    const bh = h * (0.72 + siteRand(bx, bz, 70) * 0.56);
    const bw = fx ? dep : b.w;
    const bd = fx ? b.w : dep;
    facadeSolid(bx, bz, bw, bh, bd, 0, M[mats[Math.floor(siteRand(bx, bz, 80) * mats.length) % mats.length]]);
    facadeRelief(bx, bz, bw, bh, bd);
    rooftop(bx, bz, bw, bh, bd);
    if (shops && shops.length) {
      shopfront(bx, bz, bw, bd, face, shops[Math.floor(siteRand(bx, bz, 90) * shops.length) % shops.length]);
    } else {
      entrance(bx, bz, bw, bd, face, Math.min(bw, bd) * 0.36);
    }
  }
}

/* ---- 裏側（バックヤード）の設え ----
 * 表通りの磨かれた顔と対比させるための雑然とした面。
 * 固体は solid() 1箱ずつに抑え、残りは deco で済ませる（裏路地は
 * 回り込み経路なので、塞がずに遮蔽だけ足すのが狙い）。
 * ローカル X を壁と平行な向きとして組み、yaw で世界へ回す。
 */

/** ローカル (lx, lz) を yaw 回転して世界座標へ（three.js の Y 回転と同じ規約） */
function localTo(x, z, yaw, lx, lz) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

/** 室外機の集合。1.2m なので登れず、純粋な遮蔽になる */
function acBank(x, z, yaw) {
  solid(x, z, 2.6, 1.2, 1.0, yaw, M.steel);
  for (const lx of [-0.8, 0, 0.8]) {
    const [fx2, fz2] = localTo(x, z, yaw, lx, -0.52);
    deco(M.darkSteel, 0.62, 0.62, 0.06, fx2, 0.72, fz2, yaw);   // ファンの枠
  }
  const [tx, tz] = localTo(x, z, yaw, 0, 0);
  deco(M.darkSteel, 2.66, 0.08, 1.06, tx, 1.24, tz, yaw);       // 天板
}

/** ゴミ集積の囲い */
function dumpsterPen(x, z, yaw) {
  solid(x, z, 2.2, 1.25, 1.1, yaw, M.darkSteel);
  const [lx, lz] = localTo(x, z, yaw, 0, -0.2);
  deco(M.panel, 2.26, 0.1, 0.8, lx, 1.32, lz, yaw);             // 半開きの蓋
  for (const o of [-0.9, 0.9]) {
    const [px, pz] = localTo(x, z, yaw, o, 0.6);
    deco(M.steel, 0.1, 1.4, 0.1, px, 0.7, pz, yaw);             // 支柱
  }
}

/** 荷捌きの平台。0.55m なので乗れる（プレイヤーと AI で同じ足場判定） */
function loadDock(x, z, yaw) {
  solid(x, z, 3.4, 0.55, 1.8, yaw, M.concrete);
  const [ex, ez] = localTo(x, z, yaw, 0, -0.86);
  deco(M.darkSteel, 3.44, 0.12, 0.14, ex, 0.5, ez, yaw);        // 縁の当て板
}

/** 非常階段（見た目のみ。壁に沿って折り返す） */
function fireStairs(x, z, yaw, h) {
  const steps = Math.max(2, Math.round(h / 1.6));
  for (let i = 0; i < steps; i++) {
    const side = i % 2 ? 0.85 : -0.85;
    const [px, pz] = localTo(x, z, yaw, side, 0);
    deco(M.steel, 1.9, 0.09, 1.05, px, 1.7 + i * 1.55, pz, yaw);        // 踊り場
    deco(M.darkSteel, 1.9, 0.5, 0.06, px, 2.1 + i * 1.55, pz - 0, yaw); // 手すり
  }
  for (const o of [-1.7, 1.7]) {
    const [px, pz] = localTo(x, z, yaw, o, 0);
    deco(M.steel, 0.12, h, 0.12, px, h / 2, pz, yaw);            // 柱
  }
}

/** ダクト（見た目のみ。壁から少し浮かせて横引き） */
function ductRun(x, z, yaw, len, y) {
  deco(M.panel, len, 0.55, 0.55, x, y, z, yaw);
  const n = Math.max(2, Math.round(len / 2.2));
  for (let i = 0; i <= n; i++) {
    const [bx, bz] = localTo(x, z, yaw, -len / 2 + (len * i) / n, 0);
    deco(M.darkSteel, 0.08, 0.62, 0.62, bx, y, bz, yaw);         // 継ぎ手のリブ
  }
}

/** 立ち上がりの配管（見た目のみ） */
function wallPipes(x, z, yaw, h) {
  for (const [o, r] of [[-0.3, 0.11], [0, 0.08], [0.34, 0.13]]) {
    const [px, pz] = localTo(x, z, yaw, o, 0);
    deco(M.steel, r * 2, h, r * 2, px, h / 2, pz, yaw);
  }
}

/** 低層のアルミパネル棟 */
function lowPanel(x, z, w, h, d, face) {
  facadeSolid(x, z, w, h, d, 0, M.panel);
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
  const y0 = PILOTIS_H;
  const g = 5.35;
  const cols = [[-g, -g], [g, -g], [-g, g], [g, g], [-g, 0], [g, 0], [0, -g], [0, g]];
  for (const [lx, lz] of cols) {
    solid(x + lx, z + lz, 0.7, y0, 0.7, 0, M.concrete);
    deco(M.stoneTrim, 0.98, 0.26, 0.98, x + lx, 0.13, z + lz, 0);        // 柱脚
    deco(M.stoneTrim, 0.9, 0.22, 0.9, x + lx, y0 - 0.62, z + lz, 0);     // 柱頭
  }
  solid(x, z, 3.4, h, 3.4, 0, M.stoneTrim);   // エレベータコアは全高
  // 上層（ガラスか石材）。弾は当たるが移動コライダは持たない
  const upperGeo = new THREE.BoxGeometry(w, h - y0, d);
  scaleBoxUv(upperGeo, w, h - y0, d);
  const upper = new THREE.Mesh(upperGeo, upperMat);
  upper.position.set(x, y0 + (h - y0) / 2, z);
  shell(upper);
  facadeRelief(x, z, w, h - y0, d, y0);

  // 足元の石張り（素のアスファルトのままだと駐車場に見える）
  paint(M.plaza, w - 0.6, d - 0.6, x, z, 0);

  // 軒天の仕上げ ＋ 格子梁 ＋ ダウンライト
  deco(M.concrete, w - 0.5, 0.22, d - 0.5, x, y0 - 0.13, z, 0);
  for (const o of [-4.2, 0, 4.2]) {
    deco(M.stoneTrim, w - 0.5, 0.28, 0.32, x, y0 - 0.38, z + o, 0);
    deco(M.stoneTrim, 0.32, 0.28, d - 0.5, x + o, y0 - 0.38, z, 0);
  }
  for (const lx of [-6.2, -2.1, 2.1, 6.2]) {
    for (const lz of [-6.2, -2.1, 2.1, 6.2]) {
      deco(sign(0xffe4bc), 0.46, 0.05, 0.46, x + lx, y0 - 0.55, z + lz, 0);
    }
  }

  // コアの足元をエントランスロビーに見せる（店舗と同じ作り）
  shopfront(x, z, 3.4, 3.4, face, 'lobby', 0.9);
  rooftop(x, z, w, h, d);
  // 車寄せのキャノピー（建物の外、歩道の上）
  const [fx, fz] = face;
  const can = new THREE.Mesh(new THREE.BoxGeometry(fx ? 1.8 : 4, 0.22, fx ? 4 : 1.8), M.darkSteel);
  can.position.set(x + fx * (w / 2 + 0.9), 3.3, z + fz * (d / 2 + 0.9));
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
  const along = (t) => [x + Math.cos(yaw) * t, z - Math.sin(yaw) * t];
  // 支柱と腕の付け根（テーパーの効いた根巻き）
  deco(M.darkSteel, 0.3, 0.5, 0.3, x, 0.25, z, 0);
  const [ax, az] = along(0.9);
  deco(M.steel, 1.9, 0.09, 0.09, ax, 5.0, az, yaw);
  const [bx, bz] = along(0.34);
  deco(M.steel, 0.7, 0.09, 0.09, bx, 4.72, bz, yaw + 0.35);   // 斜めの控え
  // 灯具（船形のハウジング＋下向きの発光面）
  const [hx, hz] = along(1.75);
  deco(M.darkSteel, 0.78, 0.16, 0.3, hx, 4.98, hz, yaw);
  deco(M.steel, 0.62, 0.09, 0.24, hx, 4.86, hz, yaw);
  deco(sign(0xf2f0e2), 0.5, 0.04, 0.18, hx, 4.79, hz, yaw);
}

/**
 * 信号機（車両用の横型3灯）。柱が固体で、灯器は頭上なので見た目のみ。
 * 実物は庇（フード）付きの3灯が背面板に載る。青だけ点灯。
 */
function trafficSignal(x, z, yaw) {
  solid(x, z, 0.2, 4.8, 0.2, 0, M.steel);
  const armLen = 3.2;
  const along = (t) => [x + Math.cos(yaw) * t, z - Math.sin(yaw) * t];
  deco(M.darkSteel, 0.34, 0.55, 0.34, x, 0.28, z, 0);          // 根巻き
  const [ax, az] = along(armLen / 2);
  deco(M.steel, armLen, 0.14, 0.14, ax, 4.5, az, yaw);
  const [sx2, sz2] = along(0.5);
  deco(M.steel, 1.0, 0.1, 0.1, sx2, 4.16, sz2, yaw + 0.42);    // 斜めの控え
  const [hx, hz] = along(armLen);

  // 背面板 → 灯器本体 → 3灯 → 庇 の順に前へ重ねる
  const face = (t, lat, out, w, h, dd, mat) => {
    const px = hx + Math.cos(yaw) * t + Math.sin(yaw) * out;
    const pz = hz - Math.sin(yaw) * t + Math.cos(yaw) * out;
    deco(mat, w, h, dd, px, 4.26 + lat, pz, yaw);
  };
  face(0, 0.04, 0, 1.58, 0.52, 0.1, M.steel);                  // 背面板
  face(0, 0, 0.07, 1.42, 0.42, 0.16, M.darkSteel);             // 灯器本体
  const LAMPS = [[-0.44, sign(0x2fa85e)], [0, M.glassDark], [0.44, M.glassDark]];
  for (const [t, mat] of LAMPS) {
    face(t, 0, 0.16, 0.3, 0.3, 0.05, mat);
    face(t, 0.16, 0.2, 0.34, 0.06, 0.14, M.darkSteel);         // 庇
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
 * 固体: 三方の腰壁（1.05m）＋入口脇の返し＋標識柱。正面は開けて階段口を見せる
 * （以前は四方すべて壁で囲われていて、ただの黒い穴に見えていた）。
 * 地面は y=0 の一枚板なので掘れない。降りていく感じは「開口 → 段を刻んだ床 →
 * 奥から漏れる光」で作る。屋根は shell（弾だけ当たる）。階段・手すりは見た目のみ。
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
  const at = (lx, ly, lz, mat, w, h, dd) => {
    const p = toWorld(lx, lz);
    deco(mat, w, h, dd, p.wx, ly, p.wz, yaw);
  };
  const RAIL = 1.05;   // 腰壁の高さ（実物どおり胸高）

  // 腰壁：奥・左右の三方。正面（-z）は入口なので開ける
  put(0, 1.475, 3.2, RAIL, 0.25, M.stoneTrim);
  put(-1.475, 0, 0.25, RAIL, 2.7, M.stoneTrim);
  put(1.475, 0, 0.25, RAIL, 2.7, M.stoneTrim);
  // 入口脇の返し（中央 1.6m を開口として残す）
  put(-1.075, -1.35, 0.55, RAIL, 0.25, M.stoneTrim);
  put(1.075, -1.35, 0.55, RAIL, 0.25, M.stoneTrim);
  // 標識柱
  put(1.9, -1.2, 0.14, 2.6, 0.14, M.steel);

  // 腰壁の笠木（ステンレスの手すり）
  at(0, RAIL + 0.05, 1.475, M.steel, 3.3, 0.1, 0.32);
  at(-1.475, RAIL + 0.05, 0, M.steel, 0.32, 0.1, 2.8);
  at(1.475, RAIL + 0.05, 0, M.steel, 0.32, 0.1, 2.8);
  at(-1.075, RAIL + 0.05, -1.35, M.steel, 0.62, 0.1, 0.32);
  at(1.075, RAIL + 0.05, -1.35, M.steel, 0.62, 0.1, 0.32);

  // 内壁（暗いタイル）と、段を刻んだ床
  for (const sx of [-1.3, 1.3]) at(sx, 0.5, 0.05, M.glassDark, 0.1, 1.0, 2.6);
  at(0, 0.5, 1.3, M.glassDark, 2.6, 1.0, 0.1);
  for (let i = 0; i < 4; i++) {
    const top = 0.34 - i * 0.09;
    at(0, top / 2, -0.95 + i * 0.34, M.concrete, 2.5, top, 0.34);
  }
  at(0, 0.02, 0.75, M.glassDark, 2.5, 0.04, 1.1);          // 踊り場（暗がり）

  // 奥から漏れる光。ここが「下に駅がある」と読ませる一番の手がかり
  at(0, 0.34, 1.24, sign(0xd8c49a), 2.3, 0.62, 0.06);
  at(0, 0.06, 0.75, sign(0x8a7a5c), 2.2, 0.04, 1.0);

  // 階段の手すり（開口から内へ下る）
  for (const sx of [-0.85, 0.85]) {
    const p = toWorld(sx, -0.5);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.9), M.steel);
    rail.position.set(p.wx, 0.86, p.wz);
    rail.rotation.set(-0.2, yaw, 0, 'YXZ');
    mapGroup.add(rail);
    at(sx, 0.5, -1.25, M.steel, 0.06, 1.0, 0.06);
  }

  // 屋根（開口の上だけを覆う軽い庇）＋駅名帯＋地下鉄マーク
  const cg = new THREE.Group();
  for (const sx of [-1.45, 1.45]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.6, 0.09), M.steel);
    post.position.set(sx, 1.3, -1.62);
    cg.add(post);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.07, 2.2), M.glassDark);
  roof.position.set(0, 2.66, -0.75);
  cg.add(roof);
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.34, 0.1), M.darkSteel);
  fascia.position.set(0, 2.48, -1.82);
  cg.add(fascia);
  const band = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.2, 0.06), sign(0x2f5fa0));
  band.position.set(0, 2.48, -1.88);
  cg.add(band);
  cg.position.set(x, 0, z);
  cg.rotation.y = yaw;
  shell(cg);

  // 標識柱の照明サイン（地下鉄マーク相当。文字やロゴは入れない）
  at(1.9, 2.2, -1.2, M.darkSteel, 0.52, 0.52, 0.06);
  at(1.9, 2.2, -1.26, sign(0x2f5fa0), 0.42, 0.42, 0.05);
  at(1.9, 2.2, -1.29, sign(0xe8ecef), 0.18, 0.18, 0.04);
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
/** 先細りの塔身を積む（w1→w2 へ n 段で絞る） */
function taperStack(mat, x, z, y0, y1, w1, w2, n) {
  const step = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const w = w1 + (w2 - w1) * t;
    landmarkBox(mat, w, step * 1.02, w, x, y0 + step * (i + 0.5), z);
  }
}

/**
 * 東京スカイツリー風シルエット（錦糸町視点の北〜北西）。当たり判定なし。
 *
 * 遠景ビル群が最大58なので、ランドマークはその2倍以上ないと埋もれる。
 * 総高 118。fog は切って距離感は色で作る（霧に任せると 8割方消えて、
 * 遠景の箱と見分けが付かなくなる）。
 */
function skyTree(x, z) {
  const base = landmarkMat(0x6f6b82, { fog: false });     // 脚元（濃い）
  const shaft = landmarkMat(0x837e96, { fog: false });
  const deck = landmarkMat(0xa9a4bb, { fog: false });
  const lit = landmarkMat(0x7fa8d8, { fog: false });      // 夜間照明の帯
  const tip = landmarkMat(0xff5555, { fog: false });

  // 脚元から第1展望台まで、大きく絞る（この張り出しが一番の特徴）
  taperStack(base, x, z, 0, 22, 15.5, 7.4, 6);
  taperStack(shaft, x, z, 22, 66, 7.4, 4.2, 8);
  // 第1展望台（天望デッキ）
  landmarkBox(deck, 8.6, 3.4, 8.6, x, 67.9, z);
  landmarkBox(lit, 8.0, 1.0, 8.0, x, 69.9, z);
  // 中間の塔身
  taperStack(shaft, x, z, 70.5, 88, 3.6, 3.0, 4);
  // 第2展望台（天望回廊）
  landmarkBox(deck, 6.2, 2.6, 6.2, x, 89.4, z);
  landmarkBox(lit, 5.7, 0.8, 5.7, x, 90.9, z);
  // ゲイン塔（アンテナ）
  taperStack(shaft, x, z, 91, 108, 2.4, 1.1, 4);
  taperStack(shaft, x, z, 108, 117, 0.9, 0.4, 3);
  landmarkBox(tip, 0.9, 0.9, 0.9, x, 117.6, z);
}

/**
 * 東京タワー風シルエット（錦糸町視点の西〜西南西）。当たり判定なし。
 * 総高 84。4本の脚を外へ振って、あの末広がりのシルエットを作る。
 */
function tokyoTower(x, z) {
  const red = landmarkMat(0xa8553f, { fog: false });
  const white = landmarkMat(0xbdb8c6, { fog: false });
  const steel = landmarkMat(0x6f6b82, { fog: false });
  const tip = landmarkMat(0xff4444, { fog: false });

  // 4本脚（下ほど外へ開く）。段ごとに内へ寄せて末広がりを作る
  const LEGS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const legSteps = 7;
  for (const [sx, sz] of LEGS) {
    for (let i = 0; i < legSteps; i++) {
      const t0 = i / legSteps, t1 = (i + 1) / legSteps;
      const y = 38 * (t0 + t1) / 2;
      // 上へ行くほど中心へ。指数を効かせて展望台の直下だけくびれさせる
      const off = 2.75 + 4.25 * Math.pow(1 - (t0 + t1) / 2, 1.15);
      const w = 2.6 - 1.2 * ((t0 + t1) / 2);
      landmarkBox(i % 2 ? white : red, w, 38 / legSteps * 1.02, w,
        x + sx * off, y, z + sz * off);
    }
  }
  // 脚をつなぐ水平材（下から見上げたときのトラス感）
  for (const [yy, ww] of [[9, 11.8], [20, 9.2], [30, 7.0]]) {
    landmarkBox(steel, ww, 0.5, 0.9, x, yy, z);
    landmarkBox(steel, 0.9, 0.5, ww, x, yy, z);
  }
  // 大展望台
  landmarkBox(white, 9.6, 3.2, 9.6, x, 39.6, z);
  landmarkBox(red, 8.8, 1.0, 8.8, x, 41.7, z);
  // 上部の塔身（赤白の交互帯）
  const bands = [
    [red, 5.4, 5.0, 44.7], [white, 4.6, 4.6, 49.5],
    [red, 3.9, 4.2, 53.9], [white, 3.3, 3.8, 57.9],
  ];
  for (const [mat, w, h, cy] of bands) landmarkBox(mat, w, h, w, x, cy, z);
  // 特別展望台
  landmarkBox(white, 5.0, 2.2, 5.0, x, 61.0, z);
  landmarkBox(red, 4.4, 0.8, 4.4, x, 62.4, z);
  // アンテナ
  taperStack(steel, x, z, 63, 78, 1.5, 0.7, 4);
  taperStack(steel, x, z, 78, 83, 0.5, 0.25, 2);
  landmarkBox(tip, 0.8, 0.8, 0.8, x, 83.6, z);
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

  // 背を高くしたぶん距離も伸ばす（見込み角がおおよそ 30°/17° になる位置）
  skyTree(Math.cos(SKYTREE_A) * 215, Math.sin(SKYTREE_A) * 215);
  tokyoTower(Math.cos(TOWER_A) * 265, Math.sin(TOWER_A) * 265);
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
  towerGlass, towerStone, midGrid, lowPanel, pilotis, shopfront, streetTerrace, siteRand,
  acBank, dumpsterPen, loadDock, fireStairs, ductRun, wallPipes,
  streetTree, planter, hedge, bench, bollardRow, streetLight, trafficSignal,
  busStop, subwayEntrance, bikeRack, manhole,
  taxi, sedan, van, bus,
  sidewalk, plazaFloor, crosswalk, centerDashes,
  skyline, skyTree, tokyoTower,
  HALF,
};

})();
