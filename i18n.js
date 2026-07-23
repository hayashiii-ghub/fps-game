/* ============================================================
   i18n — JA / EN（localStorage + navigator.language）
   ============================================================ */
const I18N_STRINGS = {
  ja: {
    'weapon.assault': 'アサルト',
    'weapon.smg': 'SMG',
    'weapon.shotgun': 'ショットガン',
    'weapon.pistol': 'ハンドガン',
    'weapon.sniper': 'スナイパー',
    'weapon.sr_surv': '強襲スナイパー',
    'weapon.sg_surv': '強襲ショットガン',
    'weapon.blurb.assault': 'AUTO ― 汎用・中遠距離',
    'weapon.blurb.smg': 'AUTO ― 高連射・近中距離',
    'weapon.blurb.shotgun': 'PUMP ― 散弾・近距離決戦',
    'weapon.blurb.sniper': 'BOLT ― 一撃・遠距離',
    'lobby.sidearm': 'SIDEARM ― HANDGUN（全員常備・特殊枠）',
    'map.desert.desc': '砂漠の拠点。開けた射線とコンテナ群。<br>遠距離の撃ち合いが主体。',
    'map.jungle.desc': '密林。遺跡・港・採石場・岩窟。<br>茂みは弾を遮るが通り抜けられる。',
    'mode.survival.desc': '5ステージ防衛。各ステージにテーマあり。<br>狙撃銃は敵狙撃兵撃破でも入手。自動回復あり。',
    'mode.tdmLocal.desc': '5v5・5分・キル数勝負（AI）。装備固定。<br>グレ2・キット2。撃破ドロップあり。',
    'mode.tdmOnline.desc': 'ルームを建てて友達と対戦。足りない枠は AI が補充。<br>サーバー権威の5分タイマー。',
    'online.create': '部屋を建てる',
    'online.join': 'コードで入る',
    'online.namePh': '名前',
    'online.start': '試合開始',
    'online.startHost': '試合開始',
    'online.startWait': 'HOST が開始します',
    'online.leave': '退出',
    'online.idle': 'ルーム未接続',
    'online.you': '（あなた）',
    'online.waitingNext': ' ― 次試合待ち',
    'controls': 'WASD 移動　SHIFT ダッシュ　C しゃがみ　SPACE ジャンプ　左 射撃　右 照準<br>R リロード　G グレネード　F キット　Q/E 武器切替　ESC ポーズ',
    'note.audio': '※ 音が出ます　※ マウスポインタがロックされます',
    'pause.tag': '一 時 停 止',
    'pause.resume': '再 開',
    'pause.lobby': 'ロビーへ',
    'death.tag': '戦 死',
    'stat.wave': '到達ステージ',
    'stat.kills': 'キル数',
    'stat.hs': 'ヘッドショット',
    'stat.hsRate': 'HS率',
    'stat.acc': '命中率',
    'stat.long': '最長キル',
    'stat.nade': 'グレキル',
    'stat.score': 'スコア',
    'stat.yourKills': 'あなたのキル',
    'death.retry': '再出撃',
    'death.lobby': 'ロビーへ',
    'result.victory': '勝 利',
    'result.retry': 'もう一度',
    'result.lobby': 'ロビーへ',
    'result.draw': '同点 ― 引き分け',
    'result.survClear': 'STAGE 5 クリア ― 全ステージ突破',
    'hud.enemiesLeft': 'STAGE {n} ― 残敵 {m}',
    'stage.clear.sub': '{theme} ― 制圧完了　中央で補給せよ',
    'stage.clear.subPlain': '制圧完了　中央で補給せよ',
    'stage.1.title': 'STAGE 1 ― 接触',
    'stage.1.sub': '敵歩兵接近 ― 迎撃せよ',
    'stage.1.theme': '接触',
    'stage.2.title': 'STAGE 2 ― 狙撃線',
    'stage.2.sub': '狙撃兵確認 ― 遮蔽を使え',
    'stage.2.theme': '狙撃線',
    'stage.3.title': 'STAGE 3 ― 強襲',
    'stage.3.sub': '精鋭確認 ― 防具を確保せよ',
    'stage.3.theme': '強襲',
    'stage.4.title': 'STAGE 4 ― 砂嵐',
    'stage.4.sub': '視界不良 ― 音に頼れ',
    'stage.4.theme': '砂嵐',
    'stage.4.title.squall': 'STAGE 4 ― スコール',
    'stage.4.sub.squall': '雷雨 ― 視界不良。音に頼れ',
    'stage.4.theme.squall': 'スコール',
    'stage.4.title.hurricane': 'STAGE 4 ― ハリケーン',
    'stage.4.sub.hurricane': '砂嵐 ― 視界不良。音に頼れ',
    'stage.4.theme.hurricane': 'ハリケーン',
    'stage.5.title': 'STAGE 5 ― 最終防衛',
    'stage.5.sub': '最終山場 ― 精鋭・狙撃・突撃の混成',
    'stage.5.theme': '最終防衛',
    'weather.squall': 'スコール ― 視界不良。音に頼れ',
    'weather.hurricane': 'ハリケーン ― 視界不良。音に頼れ',
    'intermission': '補給タイム ― 次まで {n}',
    'tdm.sub': '5v5・5分 ― キル数で勝敗',
    'floater.healed': '応急処置 完了',
    'floater.sniperAmmo': '狙撃弾 +10',
    'floater.sniperAmmoMax': '狙撃弾 MAX',
    'floater.sniperGot': 'スナイパーライフル 取得',
    'floater.wepAmmo': '{name}弾 +8',
    'floater.wepAmmoMax': '{name}弾 MAX',
    'floater.wepUpgrade': '{name} に強化',
    'floater.wepGot': '{name} 取得',
    'floater.extMagOn': '拡張マガジン装備中',
    'floater.extMag': '拡張マガジン +20%',
    'floater.shotgunGot': 'ショットガン 取得',
    'floater.armorOn': '防具装備中',
    'floater.armorGot': '強化防具 取得',
    'floater.respawn': '再出撃',
    'floater.supplyCenter': '中央補給',
    'floater.supplyStage': 'ステージ補給',
    'floater.ammo45': '弾薬 +45',
    'floater.ammo90': '弾薬 +90',
    'floater.ammoMax': '弾薬 MAX',
    'floater.nade': 'グレネード +1',
    'floater.nadeMax': 'グレネード MAX',
    'floater.kit': '応急キット +1',
    'floater.kitMax': '応急キット MAX',
    'feed.youDied': 'あなたが撃破された',
    'feed.hs': 'ヘッドショット ＋{pts}',
    'feed.elim': '敵排除 ＋{pts}',
    'feed.tkHs': '味方撃破 (HS)',
    'feed.tk': '味方撃破',
    'feed.tdHs': '味方戦死 (HS)',
    'feed.td': '味方戦死',
    'feed.kind.elite': '精鋭',
    'feed.kind.sniper': '狙撃兵',
    'feed.kind.rusher': '突撃兵',
    'feed.kind.grunt': '敵兵',
    'feed.kindHs': '{name}ヘッド ＋{pts}',
    'feed.kindElim': '{name}排除 ＋{pts}',
    'net.connecting': '接続中… ROOM {room}',
    'net.reconnecting': '再接続中… ROOM {room} (#{n})',
    'net.open': '接続中 ROOM {room}',
    'net.closed': '切断 ― 自動再接続します',
    'net.fail': '接続失敗 ROOM {room}',
    'net.matchLive': '試合開始 MAP {map} ― LIVE',
    'net.matchEnd': '試合終了 {blue}–{red} ― 再戦可',
    'net.hostOnly': '開始権は HOST にあります',
    'net.deny': '開始不可: {reason}',
    'net.error': 'エラー: {msg}',
    'net.creating': '部屋を作成中…',
    'net.doCap': 'サーバー上限（Durable Objects 無料枠）― 時間をおくか有料プランが必要',
    'net.createFail': '作成失敗: {msg}',
    'net.needRoom': '先にルームへ接続してください',
    'net.sendFail': '送信失敗',
    'net.startReq': '試合開始要求… MAP {map}',
    'net.hint': '部屋を建てるか、CODE で参加',
    'net.unreachable': '接続できません（サーバーまたはネットワークを確認）',
    'net.matchDeny': '試合開始不可 ({reason})',
    'lang.aria': '言語',
  },
  en: {
    'weapon.assault': 'Assault',
    'weapon.smg': 'SMG',
    'weapon.shotgun': 'Shotgun',
    'weapon.pistol': 'Handgun',
    'weapon.sniper': 'Sniper',
    'weapon.sr_surv': 'Assault Sniper',
    'weapon.sg_surv': 'Assault Shotgun',
    'weapon.blurb.assault': 'AUTO ― versatile mid/long range',
    'weapon.blurb.smg': 'AUTO ― high RPM, close/mid',
    'weapon.blurb.shotgun': 'PUMP ― pellets, close quarters',
    'weapon.blurb.sniper': 'BOLT ― one-shot, long range',
    'lobby.sidearm': 'SIDEARM ― HANDGUN (always equipped)',
    'map.desert.desc': 'Desert outpost. Open sightlines and containers.<br>Long-range fights dominate.',
    'map.jungle.desc': 'Jungle. Ruins, port, quarry, caves.<br>Thickets block bullets but you can walk through.',
    'mode.survival.desc': '5-stage defense with themed waves.<br>Sniper drops from enemy snipers. Auto-heal on.',
    'mode.tdmLocal.desc': '5v5 · 5 min · most kills (AI). Fixed loadout.<br>2 nades · 2 kits. Kill drops.',
    'mode.tdmOnline.desc': 'Host a room and play with friends. AI fills empty slots.<br>Server-authoritative 5-min timer.',
    'online.create': 'Create room',
    'online.join': 'Join with code',
    'online.namePh': 'Name',
    'online.start': 'Start match',
    'online.startHost': 'Start match',
    'online.startWait': 'Waiting for HOST',
    'online.leave': 'Leave',
    'online.idle': 'Not connected',
    'online.you': ' (you)',
    'online.waitingNext': ' ― waiting next match',
    'controls': 'WASD move · SHIFT sprint · C crouch · SPACE jump · LMB fire · RMB aim<br>R reload · G grenade · F medkit · Q/E weapon · ESC pause',
    'note.audio': '※ Audio on · Pointer lock required',
    'pause.tag': 'P A U S E D',
    'pause.resume': 'RESUME',
    'pause.lobby': 'LOBBY',
    'death.tag': 'K . I . A .',
    'stat.wave': 'Stage reached',
    'stat.kills': 'Kills',
    'stat.hs': 'Headshots',
    'stat.hsRate': 'HS rate',
    'stat.acc': 'Accuracy',
    'stat.long': 'Longest kill',
    'stat.nade': 'Grenade kills',
    'stat.score': 'Score',
    'stat.yourKills': 'Your kills',
    'death.retry': 'RESPAWN',
    'death.lobby': 'LOBBY',
    'result.victory': 'V I C T O R Y',
    'result.retry': 'AGAIN',
    'result.lobby': 'LOBBY',
    'result.draw': 'Tie ― Draw',
    'result.survClear': 'STAGE 5 CLEAR ― All stages cleared',
    'hud.enemiesLeft': 'STAGE {n} ― {m} left',
    'stage.clear.sub': '{theme} ― Area secured. Resupply at center',
    'stage.clear.subPlain': 'Area secured. Resupply at center',
    'stage.1.title': 'STAGE 1 ― Contact',
    'stage.1.sub': 'Infantry inbound ― engage',
    'stage.1.theme': 'Contact',
    'stage.2.title': 'STAGE 2 ― Sniper line',
    'stage.2.sub': 'Snipers spotted ― use cover',
    'stage.2.theme': 'Sniper line',
    'stage.3.title': 'STAGE 3 ― Assault',
    'stage.3.sub': 'Elites inbound ― secure armor',
    'stage.3.theme': 'Assault',
    'stage.4.title': 'STAGE 4 ― Sandstorm',
    'stage.4.sub': 'Low visibility ― trust sound',
    'stage.4.theme': 'Sandstorm',
    'stage.4.title.squall': 'STAGE 4 ― Squall',
    'stage.4.sub.squall': 'Thunder ― low visibility. Trust sound',
    'stage.4.theme.squall': 'Squall',
    'stage.4.title.hurricane': 'STAGE 4 ― Hurricane',
    'stage.4.sub.hurricane': 'Sandstorm ― low visibility. Trust sound',
    'stage.4.theme.hurricane': 'Hurricane',
    'stage.5.title': 'STAGE 5 ― Last stand',
    'stage.5.sub': 'Final push ― elites, snipers, rushers',
    'stage.5.theme': 'Last stand',
    'weather.squall': 'Squall ― low visibility. Trust sound',
    'weather.hurricane': 'Hurricane ― low visibility. Trust sound',
    'intermission': 'Resupply ― next in {n}',
    'tdm.sub': '5v5 · 5 min ― most kills wins',
    'floater.healed': 'Medkit done',
    'floater.sniperAmmo': 'Sniper ammo +10',
    'floater.sniperAmmoMax': 'Sniper ammo MAX',
    'floater.sniperGot': 'Sniper rifle acquired',
    'floater.wepAmmo': '{name} ammo +8',
    'floater.wepAmmoMax': '{name} ammo MAX',
    'floater.wepUpgrade': 'Upgraded to {name}',
    'floater.wepGot': '{name} acquired',
    'floater.extMagOn': 'Ext. mag equipped',
    'floater.extMag': 'Ext. mag +20%',
    'floater.shotgunGot': 'Shotgun acquired',
    'floater.armorOn': 'Armor equipped',
    'floater.armorGot': 'Heavy armor acquired',
    'floater.respawn': 'Respawn',
    'floater.supplyCenter': 'Center supply',
    'floater.supplyStage': 'Stage supply',
    'floater.ammo45': 'Ammo +45',
    'floater.ammo90': 'Ammo +90',
    'floater.ammoMax': 'Ammo MAX',
    'floater.nade': 'Grenade +1',
    'floater.nadeMax': 'Grenades MAX',
    'floater.kit': 'Medkit +1',
    'floater.kitMax': 'Medkits MAX',
    'feed.youDied': 'You were eliminated',
    'feed.hs': 'Headshot +{pts}',
    'feed.elim': 'Eliminated +{pts}',
    'feed.tkHs': 'Team kill (HS)',
    'feed.tk': 'Team kill',
    'feed.tdHs': 'Teammate down (HS)',
    'feed.td': 'Teammate down',
    'feed.kind.elite': 'Elite',
    'feed.kind.sniper': 'Sniper',
    'feed.kind.rusher': 'Rusher',
    'feed.kind.grunt': 'Enemy',
    'feed.kindHs': '{name} headshot +{pts}',
    'feed.kindElim': '{name} down +{pts}',
    'net.connecting': 'Connecting… ROOM {room}',
    'net.reconnecting': 'Reconnecting… ROOM {room} (#{n})',
    'net.open': 'Connected ROOM {room}',
    'net.closed': 'Disconnected ― reconnecting',
    'net.fail': 'Connection failed ROOM {room}',
    'net.matchLive': 'Match start MAP {map} ― LIVE',
    'net.matchEnd': 'Match end {blue}–{red} ― rematch OK',
    'net.hostOnly': 'Only HOST can start',
    'net.deny': 'Cannot start: {reason}',
    'net.error': 'Error: {msg}',
    'net.creating': 'Creating room…',
    'net.doCap': 'Server limit (Durable Objects free tier) ― wait or upgrade',
    'net.createFail': 'Create failed: {msg}',
    'net.needRoom': 'Connect to a room first',
    'net.sendFail': 'Send failed',
    'net.startReq': 'Start requested… MAP {map}',
    'net.hint': 'Create a room or join with CODE',
    'net.unreachable': 'Cannot connect (check server or network)',
    'net.matchDeny': 'Cannot start ({reason})',
    'lang.aria': 'Language',
  },
};

let i18nLocale = 'ja';

function detectLocale() {
  try {
    const saved = localStorage.getItem('locale');
    if (saved === 'ja' || saved === 'en') return saved;
  } catch (_) { /* ignore */ }
  const nav = (typeof navigator !== 'undefined' && (navigator.language || '')).toLowerCase();
  if (nav.startsWith('en')) return 'en';
  return 'ja';
}

function getLocale() { return i18nLocale; }

function t(key, params) {
  const table = I18N_STRINGS[i18nLocale] || I18N_STRINGS.ja;
  let s = table[key];
  if (s == null) s = I18N_STRINGS.ja[key];
  if (s == null) {
    if (typeof console !== 'undefined') console.warn('[i18n] missing', key);
    return key;
  }
  if (params) {
    s = String(s).replace(/\{(\w+)\}/g, (_, k) => (
      params[k] != null ? String(params[k]) : ''
    ));
  }
  return s;
}

function weaponLabel(id) {
  return t(`weapon.${id}`);
}

function applyHtmlI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    if (el.hasAttribute('data-i18n-html')) el.innerHTML = t(key);
    else el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.setAttribute('placeholder', t(key));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) el.setAttribute('aria-label', t(key));
  });
  document.documentElement.lang = i18nLocale === 'en' ? 'en' : 'ja';
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('sel', btn.getAttribute('data-lang') === i18nLocale);
  });
}

function setLocale(lang) {
  if (lang !== 'ja' && lang !== 'en') return;
  i18nLocale = lang;
  try { localStorage.setItem('locale', lang); } catch (_) { /* ignore */ }
  applyHtmlI18n();
  if (typeof onLocaleChange === 'function') onLocaleChange(lang);
}

function initI18n() {
  i18nLocale = detectLocale();
  applyHtmlI18n();
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setLocale(btn.getAttribute('data-lang'));
    });
  });
}
