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
  time: 0,
  wave: 0, score: 0, kills: 0, headshots: 0, shots: 0, hits: 0,
  spawnQueue: 0, spawnT: 0, intermission: 0, boomT: 8,
  spawnKinds: [], waveConcurrent: 5, accMul: 1,
  hurtFlash: 0, shotFired: false, deathCamT: 0,
  noLock: false,
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
function updateHealthHUD() {
  $('healthnum').innerHTML = `${Math.ceil(player.hp)}<small>HP</small>`;
  const f = $('healthfill');
  f.style.width = `${player.hp}%`;
  f.style.background = player.hp > 50 ? '#cfc48a' : player.hp > 25 ? '#d89050' : '#c0392b';
  $('lowhp').classList.toggle('on', player.hp <= 30 && player.alive);
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
    `<div class="sub">${theme ? theme + ' ― ' : ''}制圧完了　BONUS +250</div>` +
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
    spawnQueue: 0, spawnT: 0, intermission: 0, boomT: rand(8, 20),
    spawnKinds: [], waveConcurrent: 5, accMul: 1,
    hurtFlash: 0, shotFired: false, deathCamT: 0,
  });
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
  resetGame();
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
    setTimeout(() => { if (game.state === 'playing') startTdmMatch(); }, 800);
  } else {
    setTimeout(() => { if (game.state === 'playing') startWave(1); }, 1200);
  }
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
  $('stAcc').textContent = game.shots ? `${Math.round(game.hits / game.shots * 100)}%` : '0%';
  $('stScore').textContent = game.score;
  setTimeout(() => { $('death').style.display = 'flex'; }, 1400);
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
    'スコア': String(game.score),
  });
}

function onPlayerKilled(fromPos) {
  // TDM: 敵チームキル加算＋リスポーン待ち
  game.tdm.redKills++;
  updateTdmHUD();
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
  if (Math.random() < 0.7) tdmDrop(player.pos);
}

function respawnPlayer() {
  const sp = pickTdmSpawn('blue');
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
  arsenal.slots = {
    assault: { mag: 30, reserve: 90 },
    pistol: { mag: 12, reserve: 36 },
    sniper: { mag: 5, reserve: 10 },
  };
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
  spawnFloater('再出撃', false);
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
  });
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
    game.deathCamT += dt;
    const k = Math.min(game.deathCamT / 1.1, 1);
    const s = k * k * (3 - 2 * k);
    camera.position.set(player.pos.x, lerp(player.pos.y + player.eyeH, player.pos.y + 0.35, s), player.pos.z);
    camera.rotation.z = lerp(0, 0.55, s);
    const fill = $('respawnfill');
    if (fill) fill.style.width = `${(1 - game.tdm.respawnT / TDM_RESPAWN_SEC) * 100}%`;
    const txt = $('respawntext');
    if (txt) txt.textContent = `RESPAWN ${Math.ceil(Math.max(0, game.tdm.respawnT))}`;
    if (game.tdm.respawnT <= 0) respawnPlayer();
  }
}

/* ---------- ポインタロック / メニュー配線 ---------- */
function initMenus() {
  $('startSurvivalBtn').addEventListener('click', () => startGame('survival', false));
  $('startTdmBtn').addEventListener('click', () => startGame('tdm', false));
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
    // 進行中の敵・ドロップを掃除
    for (let i = enemies.length - 1; i >= 0; i--) enemies[i].destroy();
    for (let i = loots.length - 1; i >= 0; i--) { scene.remove(loots[i].m); loots.splice(i, 1); }
    rebuildHitMeshes();
    game.state = 'menu';
    game.tdm.waitingRespawn = false;
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

function tick(dt) {
  game.time += dt;

  if (game.state === 'playing') {
    if (DEBUG_DRIVE) debugDrive();
    if (!(game.mode === 'tdm' && game.tdm.waitingRespawn)) {
      updatePlayer(dt);
      updateWeapon(dt);
    }
    updateEnemies(dt);
    if (game.mode === 'survival') updateWaves(dt);
    else updateTdm(dt);
    updateLoot(dt);
    debugLogTick();
  } else if (game.state === 'menu') {
    menuOrbitT += dt * 0.06;
    camera.position.set(Math.cos(menuOrbitT) * 42, 13, Math.sin(menuOrbitT) * 42);
    camera.lookAt(0, 2, 0);
    camera.fov = 60; camera.updateProjectionMatrix();
    for (const id of WEAPON_ORDER) {
      if (arsenal.models[id]) arsenal.models[id].group.visible = false;
    }
  } else if (game.state === 'dead') {
    game.deathCamT += dt;
    const k = Math.min(game.deathCamT / 1.1, 1);
    const s = k * k * (3 - 2 * k);
    camera.position.set(player.pos.x, lerp(player.pos.y + player.eyeH, player.pos.y + 0.35, s), player.pos.z);
    camera.rotation.z = lerp(0, 0.55, s);
    updateEnemies(dt);
  } else if (game.state === 'result') {
    // 静止
  } else if (game.state === 'paused') {
    // そのまま静止
  }

  game.hurtFlash = Math.max(0, game.hurtFlash - dt * 1.4);
  $('vignette').style.opacity = clamp(game.hurtFlash * 0.95 + (player.hp < 40 && player.alive ? (40 - player.hp) / 100 : 0), 0, 1);

  updateTracers(dt);
  updateParticles(dt);
  updateShells(dt);
  updateGrenades(dt);
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
