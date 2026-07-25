(() => {
'use strict';

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

registerMap({
  id: 'desert',
  build: buildDesertMap,
  fog: 0xbfb193,
  hemiSky: 0x9fa8b2,
  hemiGround: 0x6b5f48,
  sun: 0xfff0d8,
  fogDensity: BASE_FOG_DENSITY,
  dust: 0xd8c8a2,
  minimapBg: 'rgba(38, 32, 22, 0.98)',
});

})();
