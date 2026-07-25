# FPS ARENA map authoring

FPS ARENAは、さまざまなAIモデルが制作したマップを追加して遊ぶブラウザFPSです。既存マップを変更せず、新しいマップを1つ追加してください。

## 守ること

- 戦場の内側はおおむね `x/z = -59..59`。外周の土手は `addBerms()`を使う
- Survival初期位置 `(0, 50)`、中央補給地点 `(0, 0)`を固体で塞がない
- `SPAWN_POINTS`と`TDM_SPAWNS`の周囲には安全な空間を残す
- マップ固有オブジェクトは必ず`mapGroup`配下へ置く
- 弾が当たるメッシュは`worldMeshes`へ登録する。既存ヘルパーは自動で処理する
- 移動判定は葉メッシュからの自動登録を基本にし、見た目と合わない物だけ明示OBBを使う
- 明示OBBのY回転は`pushYawObb()`を使い、独自のpaddingやbufferを足さない
- 装飾だけのメッシュは`markDecor()`を使う
- 茂みや草などを素通しにする場合は、移動・弾・視線の扱いをコメントで明記する
- Desert/Jungleおよびゲーム本体の武器・AI・操作は変更しない

## 追加手順

1. `maps/template.js`を複製して、マップ固有のbuild関数を実装する
2. `shared/map-manifest.js`へID、表示名、制作モデル、説明キー、天候、限定武器を追加する
3. `i18n.js`へ日本語・英語の説明文を追加する
4. 新しいマップスクリプトを`index.html`で`world.js`の後、`main.js`の前に読み込む
5. `worker/map-solids.js`へオンライン射線用の固体を追加する
6. 下記の検証をすべて行う

`scripts/prepare-cf-assets.sh`は`maps/`全体を配信するため、マップごとの追加作業は不要です。マップカードも`MAP_DEFS`から自動生成されるため、HTMLへ個別ボタンを追加してはいけません。

## 使用できる主なヘルパー

- `building(x, z, w, h, d, rotY)`
- `container(x, z, rotY, material, y)`
- `sandbags(x, z, rotY)`
- `barrier(x, z, rotY)`
- `watchtower(x, z)`
- `wreck(x, z, rotY)`
- `crate(x, z, size, rotY, y)`
- `barrel(x, z, material)`
- `pole(x, z)`
- `box(w, h, d, material, x, y, z, rotY)`
- `addObstacle(object, useBoxCollider)`
- `pushYawObb(cx, cy, cz, hx, hy, hz, yaw)`
- `markDecor(mesh)`

マテリアルは`MAT`、Three.jsは`THREE`から既存定義を再利用します。外部3Dアセットや新しい依存関係は、明示的に求められない限り追加しません。

## 動作確認

オフライン確認:

```text
http://127.0.0.1:8765/?debug=1&map=<id>
http://127.0.0.1:8765/?debug=1&mode=tdm&shoot=1&map=<id>
```

オンライン確認:

```text
./scripts/dev.sh
http://127.0.0.1:8787/?debug=1&mode=tdm&map=<id>
```

確認項目:

- ロビーにマップ名と`MAP BY <model>`が表示される
- カード選択で背景が即時に切り替わる
- SurvivalとTDM Localを開始できる
- 地形への埋まり、見えない壁、見た目をすり抜ける固体がない
- 全スポーン地点から移動できる
- 中央補給地点へ到達できる
- ONLINE TDMで同じマップIDが受理され、射線判定が一致する
- ブラウザコンソールに例外がない

検証後はローカルHTTPサーバーを停止してください。
