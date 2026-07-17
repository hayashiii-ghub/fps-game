'use strict';
/* ============================================================
   ゲーム状態 / HUD / メニュー / メインループ
   ============================================================ */

const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
const FAST_STEPS = DEBUG ? parseInt(PARAMS.get('fast') || '0', 10) : 0;
const DEBUG_DRIVE = DEBUG && PARAMS.has('shoot');

const game = {
  state: 'menu',      // menu | playing | paused | dead
  time: 0,
  wave: 0, score: 0, kills: 0, headshots: 0, shots: 0, hits: 0,
  spawnQueue: 0, spawnT: 0, intermission: 0, boomT: 8,
  hurtFlash: 0, shotFired: false, deathCamT: 0,
  noLock: false,
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
}
function updateHealthHUD() {
  $('healthnum').innerHTML = `${Math.ceil(player.hp)}<small>HP</small>`;
  const f = $('healthfill');
  f.style.width = `${player.hp}%`;
  f.style.background = player.hp > 50 ? '#cfc48a' : player.hp > 25 ? '#d89050' : '#c0392b';
  $('lowhp').classList.toggle('on', player.hp <= 30 && player.alive);
}
function updateScoreHUD() { $('score').textContent = game.score; }
function updateWaveHUD() {
  const alive = enemies.filter(e => e.alive).length;
  $('waveinfo').textContent = `WAVE ${game.wave} ― 残敵 ${alive + game.spawnQueue}`;
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
  b.innerHTML = `${text}<div class="sub">${sub || ''}</div>`;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}

/* ---------- ゲーム制御 ---------- */
function resetGame() {
  // 敵・ルートを全除去
  for (let i = enemies.length - 1; i >= 0; i--) enemies[i].destroy();
  for (let i = loots.length - 1; i >= 0; i--) { scene.remove(loots[i].m); loots.splice(i, 1); }
  rebuildHitMeshes();
  $('killfeed').innerHTML = '';

  Object.assign(game, {
    time: game.time, wave: 0, score: 0, kills: 0, headshots: 0, shots: 0, hits: 0,
    spawnQueue: 0, spawnT: 0, intermission: 0, boomT: rand(8, 20),
    hurtFlash: 0, shotFired: false, deathCamT: 0,
  });

  player.pos.set(0, 0, 50);
  player.vel.set(0, 0, 0);
  player.yaw = 0; player.pitch = 0;
  player.hp = 100; player.alive = true;
  player.recoilP = player.recoilY = 0;
  player.eyeH = 1.62;

  weapon.mag = weapon.magSize;
  weapon.reserve = 120;
  weapon.reloading = false;
  weapon.ads = false; weapon.adsT = 0;
  weapon.bloom = 0;
  $('reloadwrap').style.display = 'none';

  camera.fov = 75;
  camera.updateProjectionMatrix();
  camera.rotation.set(0, 0, 0);

  updateAmmoHUD(); updateHealthHUD(); updateScoreHUD();
}

function startGame(noLock) {
  AudioSys.init();
  resetGame();
  game.noLock = !!noLock;
  game.state = 'playing';
  $('menu').style.display = 'none';
  $('pause').style.display = 'none';
  $('death').style.display = 'none';
  $('hud').style.display = 'block';
  weapon.gun.visible = true;
  if (!noLock) document.body.requestPointerLock();
  setTimeout(() => { if (game.state === 'playing') startWave(1); }, 1200);
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

/* ---------- ポインタロック / メニュー配線 ---------- */
function initMenus() {
  $('startBtn').addEventListener('click', () => startGame(false));
  $('retryBtn').addEventListener('click', () => {
    $('death').style.display = 'none';
    startGame(false);
  });
  $('resumeBtn').addEventListener('click', () => document.body.requestPointerLock());

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement !== null;
    if (locked) {
      if (game.state === 'paused') {
        game.state = 'playing';
        $('pause').style.display = 'none';
      }
    } else if (game.state === 'playing' && !game.noLock) {
      game.state = 'paused';
      input.lmb = false;
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
    updatePlayer(dt);
    updateWeapon(dt);
    updateEnemies(dt);
    updateWaves(dt);
    updateLoot(dt);
    debugLogTick();
  } else if (game.state === 'menu') {
    // メニュー背景：拠点をゆっくり周回
    menuOrbitT += dt * 0.06;
    camera.position.set(Math.cos(menuOrbitT) * 42, 13, Math.sin(menuOrbitT) * 42);
    camera.lookAt(0, 2, 0);
    camera.fov = 60; camera.updateProjectionMatrix();
    weapon.gun.visible = false;
  } else if (game.state === 'dead') {
    // 死亡カメラ：地面に倒れ込む
    game.deathCamT += dt;
    const k = Math.min(game.deathCamT / 1.1, 1);
    const s = k * k * (3 - 2 * k);
    camera.position.set(player.pos.x, lerp(player.pos.y + player.eyeH, player.pos.y + 0.35, s), player.pos.z);
    camera.rotation.z = lerp(0, 0.55, s);
    updateEnemies(dt);
  } else if (game.state === 'paused') {
    // そのまま静止
  }

  // ヴィネット
  game.hurtFlash = Math.max(0, game.hurtFlash - dt * 1.4);
  $('vignette').style.opacity = clamp(game.hurtFlash * 0.95 + (player.hp < 40 && player.alive ? (40 - player.hp) / 100 : 0), 0, 1);

  updateTracers(dt);
  updateParticles(dt);
  updateShells(dt);
  updateDust(dt, camera.position);
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  game.frames = (game.frames || 0) + 1;
  // デバッグ高速シミュレーション：1フレームでNステップ進める
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
    hp: Math.round(player.hp), state: game.state, t: +game.time.toFixed(2),
    wave: game.wave, queue: game.spawnQueue,
    enemies: enemies.map(e => `${e.state}:${Math.round(e.hp)}`),
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
  // 生存敵がいれば3秒周期で0.6秒だけ撃つ
  const e = enemies.find(e => e.alive);
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
  weapon.gun.visible = false;
  loop();

  if (DEBUG) {
    setTimeout(() => {
      startGame(true);
      // モデル確認用に近距離へスポーン
      setTimeout(() => {
        enemies.push(new Enemy(5, 38));
        enemies.push(new Enemy(-7, 41));
        rebuildHitMeshes();
      }, 300);
      if (PARAMS.has('ads')) setTimeout(() => { weapon.ads = true; }, 600);
    }, 150);
  }
}

boot();
