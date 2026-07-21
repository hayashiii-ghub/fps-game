'use strict';
/* ============================================================
   ゲーム状態 / HUD / メニュー / メインループ
   ============================================================ */

const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
const FAST_STEPS = DEBUG ? parseInt(PARAMS.get('fast') || '0', 10) : 0;
const DEBUG_DRIVE = DEBUG && PARAMS.has('shoot');

const TDM_MATCH_SEC = 300;
const TDM_RESPAWN_SEC = 4.5;

const game = {
  state: 'menu',      // menu | playing | paused | dead | result
  mode: 'survival',   // survival | tdm
  online: false,      // ルーム同期 TDM
  map: 'desert',      // desert | jungle
  loadoutMain: 'assault',  // assault | smg | shotgun | sniper
  loadoutSub: 'smg',       // 同上（メインと重複不可）
  time: 0,
  wave: 0, score: 0, kills: 0, headshots: 0, shots: 0, hits: 0,
  longestKill: 0, grenadeKills: 0,
  spawnQueue: 0, spawnT: 0, intermission: 0, boomT: 8,
  spawnKinds: [], waveConcurrent: 5, accMul: 1,
  hurtFlash: 0, shotFired: false, deathCamT: 0,
  noLock: false,
  startGen: 0,
  deathUiGen: 0,
  tdm: {
    timeLeft: TDM_MATCH_SEC,
    blueKills: 0,
    redKills: 0,
    respawnT: 0,
    waitingRespawn: false,
  },
};

/* ---------- エラー表示 ---------- */
const errBox = document.getElementById('err');
addEventListener('error', e => {
  errBox.style.display = 'block';
  errBox.textContent += `${e.message}\n`;
});

/* ---------- HUD ---------- */
const $ = id => document.getElementById(id);

function updateAmmoHUD() {
  const el = $('ammo');
  el.innerHTML = `${weapon.mag}<span class="reserve"> / ${weapon.reserve}</span>`;
  el.classList.toggle('empty', weapon.mag === 0);
  const def = typeof activeDef === 'function' ? activeDef() : null;
  if (def) $('firemode').textContent = def.mode;
  updateGrenadeHUD();
}
function updateGrenadeHUD() {
  const el = $('nadecount');
  if (!el) return;
  el.textContent = String(player.grenades);
  el.classList.toggle('empty', player.grenades <= 0);
  const box = $('nadebox');
  if (box) box.classList.toggle('aiming', !!player.nadeAim);
}
function updateMedkitHUD() {
  const el = $('medcount');
  if (!el) return;
  el.textContent = String(player.medkits);
  el.classList.toggle('empty', player.medkits <= 0);
}
function updateArmorHUD() {
  const el = $('armorbadge');
  if (!el) return;
  el.style.display = player.armor ? 'block' : 'none';
}
function updateHealthHUD() {
  $('healthnum').innerHTML = `${Math.ceil(player.hp)}<small>HP</small>`;
  const f = $('healthfill');
  f.style.width = `${player.hp}%`;
  f.style.background = player.hp > 50 ? '#cfc48a' : player.hp > 25 ? '#d89050' : '#c0392b';
  $('lowhp').classList.toggle('on', player.hp <= 30 && player.alive);
  updateArmorHUD();
}
function updateScoreHUD() {
  const box = $('scorebox');
  if (game.mode === 'tdm') {
    if (box) box.style.display = 'none';
    return;
  }
  if (box) box.style.display = '';
  $('score').textContent = game.score;
}
function updateWaveHUD() {
  if (game.mode === 'tdm') return;
  const alive = enemies.filter(e => e.alive).length;
  $('waveinfo').textContent = `STAGE ${game.wave} ― 残敵 ${alive + game.spawnQueue}`;
}
function updateTdmHUD() {
  const timer = $('tdmtimer');
  const score = $('tdmscore');
  if (!timer || !score) return;
  const t = Math.max(0, game.tdm.timeLeft);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
  score.innerHTML = `<span class="blue">${game.tdm.blueKills}</span> — <span class="red">${game.tdm.redKills}</span>`;
}
function showHitmarker(kill) {
  const el = $('hitmarker');
  el.classList.remove('show', 'kill');
  void el.offsetWidth;
  if (kill) el.classList.add('kill');
  el.classList.add('show');
}
function addKillfeed(text, hs) {
  const kf = $('killfeed');
  const div = document.createElement('div');
  div.className = 'kf' + (hs ? ' hs' : '');
  div.textContent = text;
  kf.appendChild(div);
  while (kf.children.length > 5) kf.removeChild(kf.firstChild);
  setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 4200);
}
function spawnFloater(text, hs) {
  const div = document.createElement('div');
  div.className = 'floater' + (hs ? ' hs' : '');
  div.textContent = text;
  div.style.left = `${50 + rand(-4, 4)}%`;
  div.style.top = `${46 + rand(-3, 3)}%`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 900);
}
function showBanner(text, sub) {
  const b = $('banner');
  b.classList.remove('show', 'clear');
  b.innerHTML = `${text}<div class="sub">${sub || ''}</div>`;
  void b.offsetWidth;
  b.classList.add('show');
}

/** Survival ステージクリア用（少し豪華） */
function showStageClearBanner(stage) {
  const def = typeof STAGE_DEFS !== 'undefined' ? STAGE_DEFS[stage] : null;
  const theme = def && def.title
    ? def.title.replace(/^STAGE\s*\d+\s*[―\-–]\s*/, '')
    : '';
  const b = $('banner');
  b.classList.remove('show', 'clear');
  b.innerHTML =
    `<div class="clear-rule"></div>` +
    `<div class="clear-label">AREA SECURED</div>` +
    `STAGE ${stage} CLEAR` +
    `<div class="sub">${theme ? theme + ' ― ' : ''}制圧完了　中央で補給せよ</div>` +
    `<div class="clear-rule"></div>`;
  void b.offsetWidth;
  b.classList.add('show', 'clear');
  if (AudioSys && typeof AudioSys.wave === 'function') AudioSys.wave();
}

function setHudMode() {
  const surv = game.mode === 'survival';
  const tdmHud = $('tdmhud');
  if (tdmHud) tdmHud.style.display = surv ? 'none' : 'block';
  const scorebox = $('scorebox');
  if (scorebox) scorebox.style.display = surv ? '' : 'none';
  if (surv) {
    $('waveinfo').style.display = '';
  } else {
    $('waveinfo').textContent = '';
    updateTdmHUD();
  }
}

/* ---------- ゲーム制御 ---------- */
function resetGame() {
  for (let i = enemies.length - 1; i >= 0; i--) enemies[i].destroy();
  for (let i = loots.length - 1; i >= 0; i--) { scene.remove(loots[i].m); loots.splice(i, 1); }
  rebuildHitMeshes();
  $('killfeed').innerHTML = '';

  Object.assign(game, {
    time: game.time, wave: 0, score: 0, kills: 0, headshots: 0, shots: 0, hits: 0,
    longestKill: 0, grenadeKills: 0,
    spawnQueue: 0, spawnT: 0, intermission: 0, boomT: rand(8, 20),
    spawnKinds: [], waveConcurrent: 5, accMul: 1,
    hurtFlash: 0, shotFired: false, deathCamT: 0,
  });
  if (typeof resetSupply === 'function') resetSupply();
  game.tdm = {
    timeLeft: TDM_MATCH_SEC,
    blueKills: 0,
    redKills: 0,
    respawnT: 0,
    waitingRespawn: false,
  };
  if (typeof setAtmosphere === 'function') setAtmosphere();

  const spawn = game.mode === 'tdm'
    ? TDM_SPAWNS.blue[(Math.random() * TDM_SPAWNS.blue.length) | 0]
    : [0, 50];
  player.pos.set(spawn[0], 0, spawn[1]);
  player.vel.set(0, 0, 0);
  player.yaw = game.mode === 'tdm' ? Math.atan2(-spawn[0], -spawn[1]) : 0;
  player.pitch = 0;
  player.hp = 100; player.alive = true;
  player.recoilP = player.recoilY = 0;
  player.eyeH = 1.62;

  resetArsenal();

  camera.fov = 75;
  camera.updateProjectionMatrix();
  camera.rotation.set(0, player.yaw, 0);

  setHudMode();
  updateAmmoHUD(); updateHealthHUD(); updateScoreHUD(); updateGrenadeHUD(); updateMedkitHUD();
  const rw = $('respawnwrap');
  if (rw) rw.style.display = 'none';
}

function startGame(mode, noLock) {
  AudioSys.init();
  game.mode = mode === 'tdm' ? 'tdm' : 'survival';
  ensureMapBuilt(game.map);
  resetGame();
  game.startGen++;
  game.deathUiGen++;
  const startGen = game.startGen;
  const startMode = game.mode;
  game.noLock = !!noLock;
  game.state = 'playing';
  $('menu').style.display = 'none';
  $('pause').style.display = 'none';
  $('death').style.display = 'none';
  const result = $('result');
  if (result) result.style.display = 'none';
  $('hud').style.display = 'block';
  const scopeEl = $('scopeoverlay');
  if (scopeEl) scopeEl.style.opacity = '0';
  if (weapon.gun) weapon.gun.visible = true;
  if (!noLock) document.body.requestPointerLock();

  if (game.mode === 'tdm') {
    setTimeout(() => {
      if (game.state === 'playing' && game.startGen === startGen && game.mode === startMode) startTdmMatch();
    }, 800);
  } else {
    setTimeout(() => {
      if (game.state === 'playing' && game.startGen === startGen && game.mode === startMode) startWave(1);
    }, 1200);
  }
}

function formatHsRate() {
  return game.kills ? `${Math.round(game.headshots / game.kills * 100)}%` : '0%';
}
function formatLongestKill() {
  const d = game.longestKill || 0;
  return d > 0 ? `${Math.round(d)}m` : '—';
}

function gameOver() {
  game.state = 'dead';
  if (DEBUG) console.log('[FPS] DEAD', JSON.stringify({ wave: game.wave, kills: game.kills, score: game.score }));
  game.deathCamT = 0;
  weapon.ads = false;
  input.lmb = false;
  $('lowhp').classList.remove('on');
  if (document.pointerLockElement) document.exitPointerLock();
  $('stWave').textContent = game.wave;
  $('stKills').textContent = game.kills;
  $('stHs').textContent = game.headshots;
  $('stHsRate').textContent = formatHsRate();
  $('stAcc').textContent = game.shots ? `${Math.round(game.hits / game.shots * 100)}%` : '0%';
  $('stLong').textContent = formatLongestKill();
  $('stNade').textContent = String(game.grenadeKills || 0);
  $('stScore').textContent = game.score;
  game.deathUiGen++;
  const deathUiGen = game.deathUiGen;
  setTimeout(() => {
    if (game.state === 'dead' && game.deathUiGen === deathUiGen) $('death').style.display = 'flex';
  }, 1400);
}

function survivalVictory() {
  if (game.state === 'result') return;
  game.state = 'result';
  weapon.ads = false;
  input.lmb = false;
  if (typeof cancelNadeAim === 'function') cancelNadeAim();
  if (typeof cancelHeal === 'function') cancelHeal();
  if (document.pointerLockElement) document.exitPointerLock();
  showResult('MISSION COMPLETE', 'STAGE 5 クリア ― 拠点死守成功', {
    '到達ステージ': String(game.wave),
    'キル数': String(game.kills),
    'ヘッドショット': String(game.headshots),
    'HS率': formatHsRate(),
    '最長キル': formatLongestKill(),
    'グレキル': String(game.grenadeKills || 0),
    'スコア': String(game.score),
  });
}

function onPlayerKilled(fromPos) {
  // TDM: オフラインは赤キル加算。オンラインはサーバー score が正
  if (!game.online) {
    game.tdm.redKills++;
    updateTdmHUD();
  }
  addKillfeed('あなたが撃破された', false);
  game.tdm.waitingRespawn = true;
  game.tdm.respawnT = TDM_RESPAWN_SEC;
  game.deathCamT = 0;
  weapon.ads = false;
  input.lmb = false;
  if (typeof cancelNadeAim === 'function') cancelNadeAim();
  if (typeof cancelHeal === 'function') cancelHeal();
  $('lowhp').classList.remove('on');
  const rw = $('respawnwrap');
  if (rw) {
    rw.style.display = 'block';
    $('respawntext').textContent = 'RESPAWN';
  }
  // 死体付近にドロップ（プレイヤー所持の一部）
  if (!game.online && Math.random() < 0.7) tdmDrop(player.pos);
}

function respawnPlayer() {
  const team = game.online
    ? ((typeof Net !== 'undefined' && Net.getState().team) || 'blue')
    : 'blue';
  const sp = pickTdmSpawn(team);
  player.pos.set(sp[0], 0, sp[1]);
  player.vel.set(0, 0, 0);
  // マップ中央方向を向く
  player.yaw = Math.atan2(-sp[0], -sp[1]);
  player.pitch = 0;
  player.hp = 100;
  player.alive = true;
  player.recoilP = player.recoilY = 0;
  player.eyeH = 1.62;
  // TDM: 弾は死亡で初期ロードアウトにリセット（グレ/キットは持ち越し）
  arsenal.slots = makeTdmAmmoSlots();
  applyWeaponStats(arsenal.activeId);
  game.tdm.waitingRespawn = false;
  game.tdm.respawnT = 0;
  const rw = $('respawnwrap');
  if (rw) rw.style.display = 'none';
  camera.rotation.z = 0;
  updateHealthHUD();
  updateGrenadeHUD();
  updateMedkitHUD();
  updateAmmoHUD();
  player.spawnProtT = 2;
  spawnFloater('再出撃', false);
  if (game.online && typeof Online !== 'undefined') Online.notifyRespawn();
}

function endTdmMatch() {
  if (game.state === 'result') return;
  game.state = 'result';
  weapon.ads = false;
  input.lmb = false;
  game.tdm.waitingRespawn = false;
  if (typeof cancelNadeAim === 'function') cancelNadeAim();
  if (typeof cancelHeal === 'function') cancelHeal();
  if (document.pointerLockElement) document.exitPointerLock();
  const b = game.tdm.blueKills, r = game.tdm.redKills;
  let title, sub;
  if (b > r) { title = 'VICTORY'; sub = 'BLUE TEAM WINS'; }
  else if (b < r) { title = 'DEFEAT'; sub = 'RED TEAM WINS'; }
  else { title = 'DRAW'; sub = '同点 ― 引き分け'; }
  showResult(title, sub, {
    'BLUE': String(b),
    'RED': String(r),
    'あなたのキル': String(game.kills),
    'ヘッドショット': String(game.headshots),
    'HS率': formatHsRate(),
    '最長キル': formatLongestKill(),
    'グレキル': String(game.grenadeKills || 0),
  });
}

/** 戦死／TDM リスポーン待ち共通のデスカム */
function updateDeathCam(dt) {
  game.deathCamT += dt;
  const k = Math.min(game.deathCamT / 1.1, 1);
  const s = k * k * (3 - 2 * k);
  camera.position.set(player.pos.x, lerp(player.pos.y + player.eyeH, player.pos.y + 0.35, s), player.pos.z);
  camera.rotation.z = lerp(0, 0.55, s);
}

function showResult(title, sub, stats) {
  const el = $('result');
  if (!el) return;
  $('resultTitle').textContent = title;
  $('resultSub').textContent = sub;
  const box = $('resultStats');
  box.innerHTML = '';
  for (const [k, v] of Object.entries(stats)) {
    const s = document.createElement('span');
    s.textContent = k;
    const b = document.createElement('b');
    b.textContent = v;
    box.appendChild(s);
    box.appendChild(b);
  }
  el.style.display = 'flex';
  $('hud').style.display = 'none';
}

function updateTdm(dt) {
  if (game.mode !== 'tdm' || game.state !== 'playing') return;
  game.tdm.timeLeft -= dt;
  updateTdmHUD();
  if (game.tdm.timeLeft <= 0) {
    game.tdm.timeLeft = 0;
    endTdmMatch();
    return;
  }
  if (game.tdm.waitingRespawn) {
    game.tdm.respawnT -= dt;
    updateDeathCam(dt);
    const fill = $('respawnfill');
    if (fill) fill.style.width = `${(1 - game.tdm.respawnT / TDM_RESPAWN_SEC) * 100}%`;
    const txt = $('respawntext');
    if (txt) txt.textContent = `RESPAWN ${Math.ceil(Math.max(0, game.tdm.respawnT))}`;
    if (game.tdm.respawnT <= 0) respawnPlayer();
  }
}

/* ---------- ポインタロック / メニュー配線 ---------- */
/** ロビーのマップ選択。選ぶと背景のマップも即切り替わる */
function applyMapSelection(id) {
  game.map = (typeof MAP_DEFS !== 'undefined' && MAP_DEFS[id]) ? id : 'desert';
  const d = $('mapDesertBtn'), j = $('mapJungleBtn');
  if (d) d.classList.toggle('sel', game.map === 'desert');
  if (j) j.classList.toggle('sel', game.map === 'jungle');
  ensureMapBuilt(game.map);
}

/** ロビーの武器選択（メイン/サブ・重複不可） */
function applyLoadoutSelection(slot, id) {
  if (typeof LOADOUT_POOL === 'undefined' || !LOADOUT_POOL.includes(id)) return;
  if (slot === 'main') {
    game.loadoutMain = id;
    if (game.loadoutSub === id) game.loadoutSub = LOADOUT_POOL.find(w => w !== id);
  } else {
    game.loadoutSub = id;
    if (game.loadoutMain === id) game.loadoutMain = LOADOUT_POOL.find(w => w !== id);
  }
  updateLoadoutUI();
}

function updateLoadoutUI() {
  document.querySelectorAll('#mainWeaponRow .wchip').forEach(b =>
    b.classList.toggle('sel', b.dataset.w === game.loadoutMain));
  document.querySelectorAll('#subWeaponRow .wchip').forEach(b =>
    b.classList.toggle('sel', b.dataset.w === game.loadoutSub));
}

/** メニュー操作の短いクリック音 */
function uiBlip() {
  AudioSys.init();
  if (AudioSys.ok) AudioSys._clickAt(0, 1900, 0.06);
}

/** 出撃フェードを挟んで開始（ポインタロックはジェスチャ内で即要求） */
function deployAndStart(mode, opts) {
  game.online = !!(opts && opts.online);
  if (typeof Online !== 'undefined' && !game.online) Online.reset();
  startGame(mode, false);
  const d = $('deploy');
  if (!d) return;
  d.classList.add('on');
  setTimeout(() => d.classList.remove('on'), 650);
}

function setOnlineStatus(text) {
  const el = $('onlineStatus');
  if (el) el.textContent = text;
}

function initOnlineLobby() {
  if (typeof Net === 'undefined') return;
  Net.on((ev, data) => {
    if (ev === 'status') {
      if (data.state === 'connecting') setOnlineStatus(`接続中… ROOM ${data.room}`);
      else if (data.state === 'open') setOnlineStatus(`接続中 ROOM ${data.room}`);
      else if (data.state === 'closed') setOnlineStatus('切断');
    } else if (ev === 'welcome') {
      const peerN = Array.isArray(data.peers) ? data.peers.length : 0;
      setOnlineStatus(`ROOM ${data.room}  YOU ${data.you}  TEAM ${data.team || '?'}  PEERS ${peerN}`);
      const input = $('onlineCodeInput');
      if (input) input.value = data.room;
    } else if (ev === 'peer') {
      const st = Net.getState();
      setOnlineStatus(`ROOM ${st.room}  YOU ${st.selfId}  TEAM ${st.team || '?'}  (${data.op} ${data.id})`);
    } else if (ev === 'pong') {
      setOnlineStatus(`PONG n=${data.n} peers=${data.peers}`);
    } else if (ev === 'error') {
      setOnlineStatus(`エラー: ${data.message || 'unknown'}`);
    }
  });
  const createBtn = $('onlineCreateBtn');
  const joinBtn = $('onlineJoinBtn');
  const pingBtn = $('onlinePingBtn');
  const startBtn = $('onlineStartBtn');
  const input = $('onlineCodeInput');
  if (createBtn) createBtn.addEventListener('click', async () => {
    uiBlip();
    try {
      setOnlineStatus('ルーム作成中…');
      const code = await Net.createRoom();
      if (input) input.value = code;
      Net.connect(code);
    } catch (e) {
      setOnlineStatus(`作成失敗: ${e.message || e}`);
    }
  });
  if (joinBtn) joinBtn.addEventListener('click', () => {
    uiBlip();
    Net.connect(input ? input.value : '');
  });
  if (pingBtn) pingBtn.addEventListener('click', () => {
    uiBlip();
    if (!Net.ping(Date.now() % 1000)) setOnlineStatus('未接続');
  });
  if (startBtn) startBtn.addEventListener('click', () => {
    uiBlip();
    if (!Net.getState().connected) {
      setOnlineStatus('先にルームへ接続してください');
      return;
    }
    deployAndStart('tdm', { online: true });
  });
}

function initMenus() {
  $('startSurvivalBtn').addEventListener('click', () => deployAndStart('survival'));
  $('startTdmBtn').addEventListener('click', () => deployAndStart('tdm'));
  initOnlineLobby();
  const mapD = $('mapDesertBtn'), mapJ = $('mapJungleBtn');
  if (mapD) mapD.addEventListener('click', () => { applyMapSelection('desert'); uiBlip(); });
  if (mapJ) mapJ.addEventListener('click', () => { applyMapSelection('jungle'); uiBlip(); });
  document.querySelectorAll('#mainWeaponRow .wchip').forEach(b =>
    b.addEventListener('click', () => { applyLoadoutSelection('main', b.dataset.w); uiBlip(); }));
  document.querySelectorAll('#subWeaponRow .wchip').forEach(b =>
    b.addEventListener('click', () => { applyLoadoutSelection('sub', b.dataset.w); uiBlip(); }));
  updateLoadoutUI();
  $('retryBtn').addEventListener('click', () => {
    $('death').style.display = 'none';
    startGame(game.mode, false);
  });
  function goToLobby() {
    $('death').style.display = 'none';
    const result = $('result');
    if (result) result.style.display = 'none';
    $('pause').style.display = 'none';
    $('hud').style.display = 'none';
    const rw = $('respawnwrap');
    if (rw) rw.style.display = 'none';
    if (typeof cancelNadeAim === 'function') cancelNadeAim();
    if (typeof cancelHeal === 'function') cancelHeal();
    // 進行中の敵・ドロップ・補給箱を掃除
    for (let i = enemies.length - 1; i >= 0; i--) enemies[i].destroy();
    for (let i = loots.length - 1; i >= 0; i--) { scene.remove(loots[i].m); loots.splice(i, 1); }
    if (typeof clearGrenades === 'function') clearGrenades();
    if (typeof removeSupplyCrate === 'function') removeSupplyCrate();
    rebuildHitMeshes();
    game.deathUiGen++;
    game.state = 'menu';
    game.tdm.waitingRespawn = false;
    game.online = false;
    if (typeof Net !== 'undefined') Net.disconnect();
    if (typeof Online !== 'undefined') Online.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    $('menu').style.display = 'flex';
  }
  const lobbyBtn = $('lobbyBtn');
  if (lobbyBtn) lobbyBtn.addEventListener('click', goToLobby);
  const resultLobby = $('resultLobbyBtn');
  if (resultLobby) resultLobby.addEventListener('click', goToLobby);
  const resultRetry = $('resultRetryBtn');
  if (resultRetry) resultRetry.addEventListener('click', () => {
    $('result').style.display = 'none';
    startGame(game.mode, false);
  });
  $('resumeBtn').addEventListener('click', () => document.body.requestPointerLock());
  $('restartBtn').addEventListener('click', goToLobby);

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement !== null;
    if (locked) {
      if (game.state === 'paused') {
        game.state = 'playing';
        $('pause').style.display = 'none';
      }
    } else if (game.state === 'playing' && !game.noLock) {
      // リスポーン待ち中はポーズにしない
      if (game.mode === 'tdm' && game.tdm.waitingRespawn) return;
      game.state = 'paused';
      input.lmb = false;
      if (typeof cancelNadeAim === 'function') cancelNadeAim();
      if (typeof cancelHeal === 'function') cancelHeal();
      $('pause').style.display = 'flex';
    }
  });
}

/* ---------- メインループ ---------- */
const clock = new THREE.Clock();
let menuOrbitT = 0;

/* ---------- ミニマップ（北上固定・障害物＋自機＋味方。敵は非表示） ---------- */
const MINIMAP_HALF = 60;

function updateMinimap() {
  const canvas = document.getElementById('minimap');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = (typeof MINIMAP_BG !== 'undefined') ? MINIMAP_BG : 'rgba(38, 32, 22, 0.98)';
  ctx.fillRect(0, 0, W, H);

  const toX = x => ((x + MINIMAP_HALF) / (MINIMAP_HALF * 2)) * W;
  const toY = z => ((z + MINIMAP_HALF) / (MINIMAP_HALF * 2)) * H;

  ctx.fillStyle = 'rgba(88, 78, 58, 0.9)';
  for (const b of colliders) {
    if (b.hx < 0.25 || b.hz < 0.25 || b.hy < 0.25) continue;
    if (b.hx > 40 || b.hz > 40) continue; // 境界土手は描かない
    const rw = (b.hx * 2) / (MINIMAP_HALF * 2) * W;
    const rh = (b.hz * 2) / (MINIMAP_HALF * 2) * H;
    ctx.save();
    ctx.translate(toX(b.cx), toY(b.cz));
    ctx.rotate(Math.atan2(b.sin, b.cos));
    ctx.fillRect(-rw * 0.5, -rh * 0.5, rw, rh);
    ctx.restore();
  }

  // 味方のみ表示（TDM の blue）。敵 red は出さない
  if (typeof enemies !== 'undefined') {
    for (const e of enemies) {
      if (!e.alive || e.team !== 'blue') continue;
      ctx.beginPath();
      ctx.fillStyle = '#6eb0e0';
      ctx.arc(toX(e.pos.x), toY(e.pos.z), 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 中央補給箱（TDM のみ）
  if (game.mode === 'tdm' && typeof SUPPLY_POS !== 'undefined' && supplyMesh) {
    ctx.beginPath();
    ctx.fillStyle = '#c9a24a';
    ctx.arc(toX(SUPPLY_POS.x), toY(SUPPLY_POS.z), 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,16,10,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (typeof player !== 'undefined' && player) {
    const px = toX(player.pos.x);
    const py = toY(player.pos.z);
    ctx.save();
    ctx.translate(px, py);
    // yaw=0 で -Z（マップ上向き）。canvas は y 下向きなので -yaw
    ctx.rotate(-player.yaw);
    ctx.fillStyle = player.alive ? '#efe6c4' : '#888';
    ctx.beginPath();
    ctx.moveTo(0, -5.5);
    ctx.lineTo(3.8, 4.5);
    ctx.lineTo(0, 2.2);
    ctx.lineTo(-3.8, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.strokeStyle = 'rgba(232, 226, 208, 0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
}

function tick(dt) {
  game.time += dt;

  if (game.state === 'playing') {
    if (DEBUG_DRIVE) debugDrive();
    if (!(game.mode === 'tdm' && game.tdm.waitingRespawn)) {
      updatePlayer(dt);
      updateWeapon(dt);
    }
    updateEnemies(dt);
    if (typeof Online !== 'undefined') Online.update(dt);
    if (game.mode === 'survival') updateWaves(dt);
    else updateTdm(dt);
    updateLoot(dt);
    if (typeof updateSupply === 'function') updateSupply(dt);
    updateMinimap();
    debugLogTick();
  } else if (game.state === 'menu') {
    // ロビー背景：低空をゆっくり滑るシネマティックドリー
    menuOrbitT += dt * 0.055;
    const mr = 35 + Math.sin(menuOrbitT * 0.7) * 4;
    const mh = 6.8 + Math.sin(menuOrbitT * 0.43) * 2.2;
    camera.position.set(Math.cos(menuOrbitT) * mr, mh, Math.sin(menuOrbitT) * mr);
    camera.lookAt(Math.cos(menuOrbitT + 2.7) * 9, 1.7, Math.sin(menuOrbitT + 2.7) * 9);
    camera.fov = 55; camera.updateProjectionMatrix();
    for (const id of WEAPON_ORDER) {
      if (arsenal.models[id]) arsenal.models[id].group.visible = false;
    }
  } else if (game.state === 'dead') {
    updateDeathCam(dt);
    updateEnemies(dt);
    updateMinimap();
  } else if (game.state === 'result') {
    // 静止
  } else if (game.state === 'paused') {
    updateMinimap();
  }

  game.hurtFlash = Math.max(0, game.hurtFlash - dt * 1.4);
  $('vignette').style.opacity = clamp(game.hurtFlash * 0.95 + (player.hp < 40 && player.alive ? (40 - player.hp) / 100 : 0), 0, 1);

  updateTracers(dt);
  updateParticles(dt);
  updateShells(dt);
  if (game.state === 'playing') updateGrenades(dt);
  updateDust(dt, camera.position);
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  game.frames = (game.frames || 0) + 1;
  if (FAST_STEPS > 1) {
    for (let i = 0; i < FAST_STEPS; i++) tick(1 / 60);
  } else {
    tick(dt);
  }
  renderer.render(scene, camera);
}

/* ---------- デバッグ用ドライバ ---------- */
let _lastDebugLog = -10;
function debugLogTick() {
  if (!DEBUG) return;
  if (game.time - _lastDebugLog < 2) return;
  _lastDebugLog = game.time;
  console.log('[FPS]', JSON.stringify({
    hp: Math.round(player.hp), state: game.state, mode: game.mode, t: +game.time.toFixed(2),
    wave: game.wave, queue: game.spawnQueue,
    tdm: game.mode === 'tdm' ? { left: +game.tdm.timeLeft.toFixed(1), b: game.tdm.blueKills, r: game.tdm.redKills } : null,
    enemies: enemies.map(e => `${e.team}:${e.state}:${Math.round(e.hp)}`),
    shots: game.shots, hits: game.hits, kills: game.kills, score: game.score,
  }));
}
function debugAimAt(e) {
  if (!e || !e.alive) return false;
  const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
  player.yaw = Math.atan2(-dx, -dz);
  const d = Math.hypot(dx, dz);
  player.pitch = Math.atan2(1.25 - (player.pos.y + player.eyeH), d);
  return true;
}
function debugDrive() {
  const e = enemies.find(e => e.alive && e.team !== 'blue');
  if (e && (game.time % 3) < 0.6) {
    if (debugAimAt(e)) { input.lmb = true; return; }
  }
  input.lmb = false;
}

/* ---------- 起動 ---------- */
function boot() {
  initWorld();
  buildGun();
  initTracers();
  initParticles();
  initShells();
  initDust();
  initLoot();
  initInput();
  initMenus();
  updateAmmoHUD();
  updateHealthHUD();
  updateScoreHUD();
  $('waveinfo').textContent = '';
  for (const id of WEAPON_ORDER) {
    if (arsenal.models[id]) arsenal.models[id].group.visible = false;
  }
  loop();

  if (DEBUG) {
    setTimeout(() => {
      if (PARAMS.has('map')) applyMapSelection(PARAMS.get('map'));
      if (PARAMS.has('main')) game.loadoutMain = PARAMS.get('main');
      if (PARAMS.has('sub')) game.loadoutSub = PARAMS.get('sub');
      const mode = PARAMS.get('mode') === 'tdm' ? 'tdm' : 'survival';
      startGame(mode, true);
      if (mode === 'survival') {
        setTimeout(() => {
          enemies.push(new Enemy(5, 38, 'grunt', 'red'));
          enemies.push(new Enemy(-7, 41, 'sniper', 'red'));
          rebuildHitMeshes();
        }, 300);
      }
      if (PARAMS.has('ads')) setTimeout(() => { weapon.ads = true; }, 600);
    }, 150);
  }
}

boot();
