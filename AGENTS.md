## Learned User Preferences

- ゲームや操作の修正後は、ブラウザで動作確認してから次の作業に進むことを好む
- 武器切替は役割固定キーより、Q/E で所持武器を循環（向きだけ逆）する仕様を好む
- グレネードは G 即投げではなく、G で構え・軌道を見てクリック投擲する操作を好む。所有上限はグレ5・回復キット3
- 移動速度は武器ごとに差を付ける（ハンドガン速／アサルト基準／グレ構えはアサルト同等／スナイパー遅）
- ハンドガン／ショットガンの右クリックはスコープ覗きではなく、腰撃ち固定のまま減速しレティクルを小さくする仕様を好む
- スナイパーは射撃後のボルト（コッキング）中、スコープを覗けない仕様を好む
- 回復キットは拾い即回復ではなく、所持して任意タイミングで使用（約2秒）する仕様を好む
- ポーズは「ロビーに戻る」導線を好む。ロビーは従来の縦積みを維持し、画面高の約75%（`--lobby-h`）に収める（デスクトップ優先・モバイル非重視）。3レール等の見た目リデザインは却下（機能差分はレイアウトを崩さない範囲で採用）。タイトル下線は不要。操作説明や MAIN/MAP 等の二次テキストは視認しやすいコントラストを求める。モード選択はカードクリックのみで足り重複ボタンは不要とする
- 作業用のローカル HTTP サーバは用が済んだらポートを閉じるよう求める
- 移動・手触り系のバグが修正を重ねても直らないときは、パッチや padding/buffer の積み上げより「そもそも論」で俯瞰して単純な設計に見直すことを求める
- 当たり判定を全オブジェクト手置きで作り込む方式は却下（「元の方がよかった」）。葉メッシュ自動登録を基本に、問題のある物だけ見た目一致の明示 OBB を足す折衷を好む
- Survival の難易度は山場型より段階的強化を好み、stage3 は強い防具ドロップを想定。中央補給は不要（争点は TDM 側）。JUNGLE は密林感を強めたい（拠点外・レーン間の植生を厚く、東リゾート／南港など射線用は開けたまま）

## Learned Workspace Facts

- 継続開発の本体はローカル `/Users/hayashi/work/projects/karakin`。Git 正本 remote は `origin` → `hayashiii-ghub/fps-game`。公開は Cloudflare Workers Static Assets（プロジェクト名 `kimi-grok-fps`、URL は `https://kimi-grok-fps.hayashigoto.workers.dev`。Pages ではなく公式推奨の Workers 側）。GitHub Pages は停止済み。オンライン TDM は Room DO で位置同期＋ヒット/キル/スコア＋グレ/回復/ルート/補給に加え、試合フェーズ（lobby/live/ended）・タイマー権威・`playerToken` 再接続 identity・DO 永続・途中参加は waiting。リモート気配として射撃 FX 配信・足音・死亡倒れ・スポーン無敵の見た目あり。Phase B として回復2秒チャネル検証・所持武器照合・メッセージレート制限・試合開始時ロードアウト固定あり。`t:'respawn'` は死亡＋間隔ゲート必須。hibernation 用 attachment は hp/alive/装備を継続更新する（接続時スナップショットのみだと復帰で全快しうる）。ラグ補償・ヒット射線の本格化は進行中。Durable Objects 無料枠枯渇時は `/api/room` が通っても本番 WS 再接続が詰まることがある（health で枠状況を出す）。旧 `hayashiii-ghub/karakin` は Archive 済み、`karakin-demo` も凍結。push は `origin`（fps-game）一本でよい
- オンラインは**ホスト制**: 最古参 active がホスト（退出時に次の最古参へ引き継ぎ）。`match_start` はホストのみ受理（非ホストは `match_deny reason=not_host`）。名簿（`roster` イベント・welcome 同梱）は名前つき参加者リストで、`t:'name'`（12文字まで）で変更・localStorage 保存・再接続（reservations）でも保持。重要: DO は hibernation 復帰で `hostId` を失うため、ホスト判定が要るメッセージハンドラ（match_start / bots / bot_poses / bot_fire / bot_hit / bot_respawn）は必ず先頭で `ensureHost()` を呼ぶ（これを忘れて not_host 全否になるバグがあった）
- オンライン TDM の **bot 埋め**（案A・ホストシミュレート）: 各チーム5人に満たない分をホストのクライアントが `Enemy`（ローカル TDM と同じ AI・enemies 配列）でシミュレート。位置はホスト権威（`bot_poses` 20Hz・まとめ送り）、HP/生死はサーバー権威（`bot_hit` で `validateHit`→`applyHitResult` を人間と共有、`bot_respawn` で復活）。bot の武器は `owned` オブジェクト形式（`{assault:true,...}`。配列で渡して unowned 全否になるバグがあった）。他クライアントには snap の `bot:true` プレイヤーとして通常の remote 描画。ホスト側で bot は Enemy として描画するため applySnap で bot は remote 化をスキップ。ホスト自身が bot を撃つ経路は `hitEnemy` 先頭で `claimHit` に変換。Enemy の `pickTarget` はリモート人間（`type:'remote'`）も狙う。試合中にホストが退出すると、新ホストが snap の bot フラグから `adoptBot` で Enemy に変換して引き継ぐ。bot → 人間の射撃 FX は `bot_fire`（ホスト以外に broadcast）
- ゲームは three.js 製ブラウザ FPS「KIMI GROK FPS」（ビルド不要・ローカル同梱 three.js）。マップは DESERT / JUNGLE（追加予定あり）。ロビーの MAP カードで選択（背景も即切替）。モードは Survival（5ステージ・テーマ付き）と TDM（5v5・5分・キル数勝負）。TDM はロビーで LOCAL（AI）と ONLINE（ルーム）に分岐。オンラインパネルは接続前（部屋を建てる/コードで入る）⇔接続後（名簿・名前入力・開始ボタン）を `setOnlinePanelJoined` で切替。`.orow[hidden]` の CSS 上書きに注意（author スタイルが UA の hidden を打ち消す）
- マップ切替は `world.js` の `MAP_DEFS` + `buildMap(id)`。マップ固有物は `mapGroup` 配下、切替時に `colliders`/`worldMeshes` をクリアして再構築。スポーン点・中央補給位置・マップサイズは両マップ共通。JUNGLE は PUBG Sanhok 参考: 中央遺跡(CQC) / 東リゾート(狙撃) / 南港 / 西採石場 / 北西訓練場 / 北東岩窟 + 密林。茂み(thicket)は見た目のみ（弾・視線・移動すべて素通し）。木は幹のみ移動 OBB（葉は collider なし・弾は当たる）。草・海は見た目のみ。密林感は拠点外・レーン間の植生と緑寄りフォグで稼ぎ、東リゾート／南港は射線用に薄い森。中央遺跡・隣接岩など見た目と食い違う固体は明示 OBB で合わせる
- Survival の開始ロードアウトはロビー選択のメイン＋サブ＋ハンドガン。スナイパーはロードアウトで選ぶか、ウェーブ2以降の敵スナイパー撃破ドロップでも解放（所持済みなら狙撃弾に変換）。stage3 で強い防具。中央補給なし。TDM はロビーのロードアウトがそのまま適用（グレ2・回復2）、撃破から回復/弾/グレを奪える。死亡時は弾薬など物資リセット。敵ダメージはプレイヤーのアサルト同等。リスポーン地点は分散。再出撃・試合開始・AI リスポーン後およそ2秒の無敵（プレイヤー／AI 共通）。中央物資は内容×2でたまに強い防具もドロップ。AI 約9体＋`canSee` レイキャストが重い主因になりやすい
- ロードアウト: メイン＋サブを `LOADOUT_POOL`（assault/smg/shotgun/sniper）から重複不可で選択、ハンドガンは常備の特殊枠。`game.loadoutMain/loadoutSub` が正で、`resetArsenal()` が `ownedFromLoadout()` で所持武器を決める。SMG は 850rpm・軽量・遠距離苦手。ショットガンは8ペレット（`def.pellets` で tryFire が複数レイ化）・ポンプ音は `AudioSys.pump()`・ペレット dmg は head20/torso15/limb10（近距離胴全弾120）。弾薬ドロップの `addReserveAmmo` はアクティブ武器優先・あふれは所持武器へ順分配。武器音は `AudioSys.SHOT_DEFS` の4層合成（クラック/ブラスト/低音/反響尾）。アサルトはホロサイト（レティクル中心 y=0.098 が ADS 光軸）。SMG はリング照準
- ロビーはシネマティック仕様（低空ドリーカメラ・レターボックス・コーナーブラケット・スキャンライン・出撃フェード `#deploy`）。縦積み＋`--lobby-h: 75vh` が正。タイトル `h1::after` 下線は無し。MODE/MAP/LOADOUT の3レール化やマップ俯瞰サムネ自動生成は採用しない。フルスクリーンのグレイン/ノイズ画像オーバーレイはヘッドレスGPU環境でレンダラをクラッシュさせるため使わない（検証済み）
- スナイパーは頭一撃・胴は非一撃（95）。ADS は 2D オーバーレイ（C+Shift でも可、そのとき Shift はスプリントにしない）。ボルト中は ADS 不可。SMG 弾倉 25。SMG／ハンドガン／ショットガンは `dmgFalloff`（距離減衰）。アサルトは弱め（28–50m→0.82）。スナイパーは減衰なし。ショットガンは集弾＋減衰の二重で遠距離を抑える。カメラは YXZ・前方はローカル -Z。WASD の yaw 変換は水平視線と一致させる必要がある
- 移動コライダは全て Y 回転 OBB `{cx,cy,cz,hx,hy,hz,cos,sin}` に統一（弾判定は葉 Mesh 単位のまま別系統）。解決は最深1ヒットの押し出し＋速度の法線成分カット（壁スライド・跳ね返しなし）＋水平4サブステップ。フレーム末に中心が固体内なら直前の安全位置に戻す。登録は葉メッシュ自動が基本。家・コンテナ・土嚢は見た目一致の明示 OBB（yaw 0/90°、padding/buffer なし）。家は「入れない固体ブロック」で、窓・扉は壁面装飾メッシュ（`markDecor`、穴なし・移動判定なし）。ローカル静的確認は `http://127.0.0.1:8765/`、オンライン API／WS は wrangler `http://127.0.0.1:8787/` を使うことが多い

## Cursor Cloud specific instructions

- ビルド不要・`package.json` なし。Node と Python3 は VM に同梱済み。依存の実体は `npx wrangler@4`（初回のみ取得）だけ。
- ユニットテスト: `for f in scripts/test-*.mjs; do node "$f"; done`（各ファイル単体でも可）。サーバ不要で Worker ロジックを検証。
- フル E2E（Survival / TDM Local / ONLINE TDM の API・WS 込み）: `./scripts/dev.sh` → `http://127.0.0.1:8787/`。`dev.sh` が `prepare-cf-assets.sh` を先に実行する。
- オフライン専用（Survival / TDM Local のみ）: `python3 -m http.server 8765` → `http://127.0.0.1:8765/`。ONLINE は `/api/*` が無く失敗する。
- 落とし穴: wrangler dev はクライアント JS/HTML を `.cf-assets/` から配信する。クライアント側ファイルを編集したら `./scripts/prepare-cf-assets.sh` を再実行（または `dev.sh` を再起動）しないと反映されない。`worker/` 配下は `main` から直接バンドルされるため wrangler の再読込のみでよい。
- ヘッドレスでの動作確認は debug URL フラグが有効: `?debug=1`（ポインタロック不要で即開始）、`&mode=tdm`、`&map=jungle|desert`、`&shoot=1`（自動照準・射撃ボット）、`&main=smg&sub=shotgun`（ロードアウト指定）。例: `http://127.0.0.1:8787/?debug=1&mode=tdm&shoot=1&map=desert`。
- API 疎通確認: `GET /api/health` → `{"ok":true,"phase":"lobby"}`、`POST /api/room` → `{"code":"XXXXXX"}`。
- `wrangler dev` はローカルモード（Durable Object もローカル）で動くため Cloudflare ログイン不要。デプロイ時のみ認証が要る。
