# FPS ARENA map authoring

FPS ARENAは、さまざまなAIモデルが制作したマップを追加して遊ぶブラウザFPSです。既存マップを変更せず、新しいマップを1つ追加してください。

## 高低差の扱い

固体の天面には立てます。ただし**自動でよじ登れるのは 0.6m（`GroundSupport.STEP_UP`）までの段差**で、これはプレイヤーと AI で同じ値です。0.6mを超える段差は両者にとって単なる壁になります。

- **起伏は作れる**: 0.6m以下の段を重ねた丘・堤防・河床・掘り込んだ塹壕・緩い階段
- **高台は作れない**: AI に経路探索が無いため、0.6mを超える一段で上がる高台を作ると、AI がそこへ行けず一方的に撃たれる場所になる
- ジャンプ到達は約0.78m。斜面（傾いた面）は表現できない。段はすべて水平な箱の積み重ねで作る
- コンテナ（天面2.6m）や木箱（1.05m）は今まで通り登れない遮蔽物

段で高さを変えるときは、**登り口を複数方向に用意**してください。1箇所しか登り口が無い高所は、AI が詰まりやすく撃ち合いも単調になります。

## 守ること

- 戦場の内側はおおむね `x/z = -59..59`。外周の土手は `addBerms()`を使う
- Survival初期位置 `(0, 50)`、中央補給地点 `(0, 0)`を固体で塞がない
- `SPAWN_POINTS`と`TDM_SPAWNS`の周囲には安全な空間を残す。これらは全マップ共通の座標なので、建物やコンテナを重ねると屋根の上に湧く。重なった点は`groundSpawns()`が自動で除外するが、除外されすぎると湧く場所が偏るため、そもそも重ねない
- 固体を積む（`container()`の第5引数など）ときは、真下に天面が一致する固体を必ず置く。支えの無い固体は宙に浮いて見える
- マップ固有オブジェクトは必ず`mapGroup`配下へ置く
- 弾が当たるメッシュは`worldMeshes`へ登録する。既存ヘルパーは自動で処理する
- 移動判定は葉メッシュからの自動登録を基本にし、見た目と合わない物だけ明示OBBを使う
- 明示OBBのY回転は`pushYawObb()`を使い、独自のpaddingやbufferを足さない
- 装飾だけのメッシュは`markDecor()`を使う
- 茂みや草などを素通しにする場合は、移動・弾・視線の扱いをコメントで明記する
- 既存マップ（Desert/Jungle/Tokyo）およびゲーム本体の武器・AI・操作は変更しない

## 追加手順

1. `maps/template.js`を複製して、マップ固有のbuild関数を実装する
2. `shared/map-manifest.js`へID、表示名、制作モデル、説明キー、天候、限定武器を追加する
   - 天候は`enemy.js`の`WEATHER_DEFS`にある種別から選ぶ（`squall` / `hurricane` / `neon` / `night`）。
     新設するときはテーブルへ1行足し、`weather.<kind>`と`stage.4.*.<kind>`の文言も日英で対にする。
     天候は霧の色・濃さと減光を変えるだけで、時間帯は変わらない
3. `i18n.js`へ日本語・英語の説明文を追加する
4. 新しいマップスクリプトを`index.html`で`world.js`の後、`main.js`の前に読み込む
5. `worker/map-solids.js`へオンライン射線用の固体を追加する
6. `node scripts/test-map-solids-parity.mjs`が通るまで5を直す
7. `node scripts/test-spawn-clearance.mjs`が通るまで配置を直す（スポーン点の被り・浮いた固体を検出する）
8. 下記の検証をすべて行う

`scripts/prepare-cf-assets.sh`は`maps/`全体を配信するため、マップごとの追加作業は不要です。マップカードも`MAP_DEFS`から自動生成されるため、HTMLへ個別ボタンを追加してはいけません。

## 使用できる主なヘルパー

すべて`world.js`にあり、どのマップからでも使えます。マップ固有の造形は自分のマップファイル内に閉じて定義してください（例: `maps/jungle.js`の`grotto()`）。

都市型マップの場合は、`maps/urban-kit.js`（`URBAN`グローバル）にオフィス街向けの素材（ビル・街路家具・車両・舗装）が揃っています。都市系マップは原則としてこのキットで組み、キットに無い造形を足すときはキット側に追加してください。

地形・遮蔽:

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

植生・自然物:

- `tree(x, z, scale)` — 移動判定は幹だけ。葉は弾・視線を遮る
- `thicket(x, z, scale)` — 見た目のみ。移動・弾・視線すべて素通し
- `grassTuft(x, z, scale)` — 見た目のみ
- `fallenLog(x, z, rotY)` — 低い遮蔽（長軸の明示OBB）
- `bigRock(x, z, size, rotY)` — 明示OBB付きの大岩
- `scatter(count, rMin, rMax, keepOut, place)` — `keepOut`（`[x, z, r]`の配列）を避けて散らす

基盤:

- `addSky(texture)` / `addGround(material)` / `addBerms(material)`
- `addObstacle(object, useBoxCollider)`
- `pushYawObb(cx, cy, cz, hx, hy, hz, yaw)`
- `markDecor(mesh)`

マテリアルは`MAT`、Three.jsは`THREE`から既存定義を再利用します。外部3Dアセットや新しい依存関係は、明示的に求められない限り追加しません。

## 動作確認

まずユニットテスト:

```bash
for f in scripts/test-*.mjs; do node "$f"; done
```

`scripts/test-map-solids-parity.mjs`は`world.js`と`maps/*.js`を実際に走らせて生成した移動コライダを、`worker/map-solids.js`の射線用OBBと1対1で突き合わせます。ここが赤いままだと、オンラインで「壁越しに撃たれる」「壁がないのに弾が止まる」が起きます。移動だけ遮って射線は通したい物（植生の幹など）は、`markLosExempt(pushYawObb(...))`で対象外にしてください。

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
