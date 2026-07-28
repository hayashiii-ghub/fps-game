(() => {
'use strict';

/* ============================================================
   TOKYO ― 夕暮れのオフィス街（Stage 4 で夜に沈む）
   ------------------------------------------------------------
   錦糸町あたりの臨海副都心オフィス街をテーマにした
   都市型マップ。アセットはすべて maps/urban-kit.js 製。
   場外遠景にスカイツリー（北〜北西）と東京タワー（南西）。

   街路の骨格（世界座標 m、北=+z / 南=-z）:
     中央大通り  |x| <= 8（南北） / |z| <= 8（東西）
     環状通り    x,z = ±28 は [24,32]、±48 は [44,52]
     街区        内側 (±16,±16) 16x16 / 中環 (±35.5,±16)
                 環内 (±16,±38) / 角 (±38,±37) / 外れ x,z = 52..59
   東 = ガラスの金融タワー、西 = 御影石の官公庁系タワー。
   北と南は zPair で鏡像にして TDM の青/赤を公平にする。
   内側4街区はピロティ型タワーで、1階の柱列を歩き通せる。

   固体の纪律: すべて URBAN.solid()（= worker/map-solids.js の
   slab()）経由。街路樹の幹は markLosExempt。詳細は urban-kit.js
   の冒頭コメントを参照。
   ============================================================ */

const { solid, deco, shell, glow } = URBAN;
const HALF = URBAN.HALF;

/** z 対称に2つ置く（TDM の青=北 / 赤=南 を公平にする） */
function zPair(fn, x, z, ...rest) {
  fn(x, z, ...rest);
  fn(x, -z, ...rest);
}

/** 東西通りの路肩（左側通行）: +z（北）はその yaw、−z（南）は対向なので +π */
function zPairLhtEw(fn, x, z, yaw, ...rest) {
  const nz = Math.abs(z);
  fn(x, nz, yaw, ...rest);
  fn(x, -nz, yaw + Math.PI, ...rest);
}

/* ============================================================
   建物
   ============================================================ */

function buildings() {
  const M = URBAN.M;
  // 内側4街区: ピロティ型タワー（1階は柱列で歩き通せる）
  zPair(URBAN.pilotis, 16, 16, 16, 15, 16, M.curtainBlue, [-1, 0]);
  zPair(URBAN.pilotis, -16, 16, 16, 13, 16, M.stoneBeige, [1, 0]);
  // 中環: 中層ビル（スポーンを避けて通り側に寄せる）
  zPair(URBAN.midGrid, 35.5, 16, 7, 9, 8, [-1, 0]);
  zPair(URBAN.midGrid, -35.5, 16, 7, 9, 8, [1, 0]);
  // 環内: 西は御影石タワー、東はポケットパーク（buildings ではなく parks()）
  zPair(URBAN.towerStone, -16, 38, 14, 10, 8, [0, -1]);
  // 角: 中層ビル
  zPair(URBAN.midGrid, 38, 37, 11, 8, 8, [-1, 0]);
  zPair(URBAN.midGrid, -38, 37, 11, 8, 8, [1, 0]);
  // 外れ: 低層パネル棟（スポーン帯の隙間ポケットにだけ）
  zPair(URBAN.lowPanel, 56, 38.5, 6, 6.5, 8, [-1, 0]);
  zPair(URBAN.lowPanel, -56, 38.5, 6, 6, 8, [1, 0]);
  zPair(URBAN.midGrid, 55.5, 55.5, 6.5, 7, 6.5, [-1, 0]);
  zPair(URBAN.midGrid, -55.5, 55.5, 6.5, 6.5, 6.5, [1, 0]);
}

/* ============================================================
   中央広場（交差点 |x|,|z| <= 8 とその縁）
   ============================================================ */

function plaza() {
  URBAN.plazaFloor(0, 0, 17, 17);
  // 四隅の花壇（0.5m 段。登って撃てる）
  for (const px of [-10.5, 10.5]) for (const pz of [-10.5, 10.5]) URBAN.planter(px, pz, 2.6, 2.6);
  // 中央のベンチ（補給地点は塞がない）
  URBAN.bench(4.5, 4.5, Math.PI * 0.75);
  URBAN.bench(4.5, -4.5, Math.PI * 0.25);
  URBAN.bench(-4.5, 4.5, -Math.PI * 0.25);
  URBAN.bench(-4.5, -4.5, -Math.PI * 0.75);
  // 信号・街灯・地下鉄入口
  for (const [sx, sz, yaw] of [[9.4, 9.4, -HALF], [-9.4, 9.4, HALF],
                               [9.4, -9.4, -HALF], [-9.4, -9.4, HALF]]) {
    URBAN.trafficSignal(sx, sz, yaw);
  }
  zPair(URBAN.streetLight, 9.2, 2.8, Math.PI);
  zPair(URBAN.streetLight, -9.2, 2.8, 0);
  zPair(URBAN.subwayEntrance, 13.6, 9.7, 0);
  zPair(URBAN.subwayEntrance, -13.6, 9.7, 0);
  // ボラード（見た目のみ）
  URBAN.bollardRow(8.6, 8.6, -Math.PI / 4, 3);
  URBAN.bollardRow(-8.6, 8.6, Math.PI / 4, 3);
  URBAN.bollardRow(8.6, -8.6, Math.PI / 4, 3);
  URBAN.bollardRow(-8.6, -8.6, -Math.PI / 4, 3);
  // 自転車ラック（地下鉄入口の脇。見た目のみ）
  zPair(URBAN.bikeRack, 14.8, 12.5, 0, 4);
  zPair(URBAN.bikeRack, -14.8, 12.5, 0, 4);
}

/* ============================================================
   大通り（中央分離帯・駐車車両・街路樹）
   ============================================================ */

function avenues() {
  // 中央分離帯（南北大通り。0.5m の植え込み帯で射線を切る）
  zPair(URBAN.planter, 0, 13, 2.2, 6);
  zPair(URBAN.planter, 0, 20, 2.2, 6);
  zPair(URBAN.planter, 0, 34, 2.2, 6);

  // タクシー／市バス・路側駐車（左側通行）
  // ヘッドライト基準で対向路肩を逆向きにする（東/北の基準 yaw に対し西/南は +π）
  zPairLhtEw(URBAN.taxi, 14, 4.9, Math.PI);
  zPairLhtEw(URBAN.bus, 27.5, 4.9, Math.PI);

  zPair(URBAN.sedan, 4.9, 16, -HALF, URBAN.M.sedanWhite);
  zPair(URBAN.sedan, -4.9, 20, HALF, URBAN.M.sedanBlack);
  zPair(URBAN.sedan, 4.9, 36, -HALF, URBAN.M.sedanGrey);
  zPair(URBAN.sedan, -4.9, 40, HALF, URBAN.M.sedanWhite);
  zPairLhtEw(URBAN.sedan, 30, 4.9, Math.PI, URBAN.M.sedanGrey);
  zPairLhtEw(URBAN.sedan, 36, 4.9, Math.PI, URBAN.M.sedanBlack);
  zPairLhtEw(URBAN.sedan, -30, 4.9, Math.PI, URBAN.M.sedanWhite);
  zPairLhtEw(URBAN.sedan, -36, 4.9, Math.PI, URBAN.M.sedanGrey);

  zPair(URBAN.van, 28, 20, -HALF);
  zPair(URBAN.van, -28, 20, HALF);

  // 街灯
  zPair(URBAN.streetLight, 7.6, 17, -HALF);
  zPair(URBAN.streetLight, -7.6, 17, HALF);
  zPair(URBAN.streetLight, 7.6, 47, -HALF);
  zPair(URBAN.streetLight, -7.6, 47, HALF);
  zPair(URBAN.streetLight, 17, 7.6, Math.PI);
  zPair(URBAN.streetLight, -17, 7.6, 0);
  zPair(URBAN.streetLight, 47, 7.6, Math.PI);
  zPair(URBAN.streetLight, -47, 7.6, 0);

  // 街路樹（幹だけ移動を遮る。射線は葉のメッシュ判定）
  zPair(URBAN.streetTree, 6.6, 13, 0.95);
  zPair(URBAN.streetTree, -6.6, 13, 0.95);
  zPair(URBAN.streetTree, 6.6, 36, 0.9);
  zPair(URBAN.streetTree, -6.6, 36, 0.9);
  zPair(URBAN.streetTree, 6.6, 44, 0.95);
  zPair(URBAN.streetTree, -6.6, 44, 0.95);
  zPair(URBAN.streetTree, 13, 6.6, 0.95);
  zPair(URBAN.streetTree, 36, 6.6, 0.9);
  zPair(URBAN.streetTree, 44, 6.6, 0.95);
  zPair(URBAN.streetTree, 13, -6.6, 0.95);
  zPair(URBAN.streetTree, 36, -6.6, 0.9);
  zPair(URBAN.streetTree, 44, -6.6, 0.95);

  // バス停
  zPair(URBAN.busStop, 30, 6.6, Math.PI);
  zPair(URBAN.busStop, -30, 6.6, Math.PI);

  // マンホール（見た目のみ）
  URBAN.manhole(0, 18); URBAN.manhole(0, -18);
  URBAN.manhole(18, 0); URBAN.manhole(-18, 0);
  URBAN.manhole(2, -42); URBAN.manhole(-42, 2);
}

/* ============================================================
   東の環内街区: ポケットパーク
   ============================================================ */

function parks() {
  // 生け垣（出入り口を空けた周囲の低い壁。0.55m でよじ登れる）
  zPair(URBAN.hedge, 11.5, 32.8, 5, 0.5);
  zPair(URBAN.hedge, 20.5, 32.8, 5, 0.5);
  zPair(URBAN.hedge, 11.5, 43.2, 5, 0.5);
  zPair(URBAN.hedge, 20.5, 43.2, 5, 0.5);
  zPair(URBAN.hedge, 8.3, 35.5, 0.5, 3.5);
  zPair(URBAN.hedge, 8.3, 41, 0.5, 3.5);
  zPair(URBAN.hedge, 23.7, 35.5, 0.5, 3.5);
  zPair(URBAN.hedge, 23.7, 41, 0.5, 3.5);
  // 植栽・ベンチ・街灯
  zPair(URBAN.planter, 12, 38.5, 2.4, 2.4);
  zPair(URBAN.planter, 20, 38.5, 2.4, 2.4);
  zPair(URBAN.bench, 14.5, 38.5, 0);
  zPair(URBAN.bench, 18.5, 38.5, Math.PI);
  zPair(URBAN.streetLight, 16, 35, 0);
  zPair(URBAN.streetTree, 13, 36, 0.95);
  zPair(URBAN.streetTree, 19, 41.5, 0.9);
  zPair(URBAN.streetTree, 16.5, 42.5, 1.0);
  // 芝生と園路（見た目のみ）
  zPair((x, z) => deco(URBAN.M.lawnGreen, 14, 0.08, 9.6, x, 0.04, z, 0), 16, 38);
  zPair((x, z) => deco(URBAN.M.paver, 2.2, 0.1, 10.4, x, 0.06, z, 0), 16, 38);
}

/* ============================================================
   舗装
   ============================================================ */

function pavement() {
  // 歩道（中央大通りと環状通りの両側）
  for (const sx of [-6.75, 6.75]) {
    URBAN.sidewalk(sx, 33.5, 2.5, 51); URBAN.sidewalk(sx, -33.5, 2.5, 51);
  }
  for (const sz of [-6.75, 6.75]) {
    URBAN.sidewalk(33.5, sz, 51, 2.5); URBAN.sidewalk(-33.5, sz, 51, 2.5);
  }
  for (const cx of [-6.75, 6.75]) for (const cz of [-6.75, 6.75]) URBAN.sidewalk(cx, cz, 2.5, 2.5);
  // 横断歩道
  URBAN.crosswalk(0, 9.5, 0);
  URBAN.crosswalk(0, -9.5, 0);
  URBAN.crosswalk(9.5, 0, HALF);
  URBAN.crosswalk(-9.5, 0, HALF);
  // 中央線（黄色の破線）
  URBAN.centerDashes(0, 10, 0, 58, 4);
  URBAN.centerDashes(0, -10, 0, -58, 4);
  URBAN.centerDashes(10, 0, 58, 0, 4);
  URBAN.centerDashes(-10, 0, -58, 0, 4);
}

function buildTokyoMap() {
  const M = URBAN.materials();
  addSky(URBAN.texDuskSky());
  addGround(M.asphalt);
  addBerms(M.hoarding);
  URBAN.skyline();
  pavement();
  buildings();
  plaza();
  avenues();
  parks();
}

registerMap({
  id: 'tokyo',
  build: buildTokyoMap,
  fog: 0x8a7580,
  hemiSky: 0xb59aae,
  hemiGround: 0x3d3a40,
  sun: 0xffb87d,
  fogDensity: 0.0088,
  dust: 0xc2a4a4,
  minimapBg: 'rgba(22, 20, 28, 0.98)',
});

})();
