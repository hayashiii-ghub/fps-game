(() => {
'use strict';

// このファイルを複製し、MAP_AUTHORING.mdの手順に沿って新しいマップを登録する。
// 読み込む場合は world.js より後、main.js より前に <script> を追加する。

function buildExampleMap() {
  addSky(texSky());
  addGround(MAT.sand);
  addBerms(MAT.sandbag);

  // Survival初期位置、TDMスポーン、中央補給地点を塞がないこと。
  building(-24, -18, 12, 4, 8, 0);
  container(18, 12, 0.4, MAT.metalBlue);
  sandbags(0, -10, 0);
}

registerMap({
  id: 'example',
  build: buildExampleMap,
  fog: 0xbfb193,
  fogDensity: BASE_FOG_DENSITY,
  hemiSky: 0x9fa8b2,
  hemiGround: 0x6b5f48,
  sun: 0xfff0d8,
  dust: 0xd8c8a2,
  minimapBg: 'rgba(38, 32, 22, 0.98)',
});

})();
