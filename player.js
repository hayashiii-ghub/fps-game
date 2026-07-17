'use strict';
/* ============================================================
   プレイヤー / 武器 / 入力
   ============================================================ */

const player = {
  pos: new THREE.Vector3(0, 0, 50),   // 足元
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  hp: 100, alive: true,
  crouching: false, sprinting: false, onGround: true,
  eyeH: 1.62, targetEyeH: 1.62,
  bobPhase: 0, stepSign: 1,
  lastDamage: -99, regenDelay: 6,
  radius: 0.36,
  recoilP: 0, recoilY: 0,          // リコイルによる視点オフセット
  lean: 0,
};

const weapon = {
  mag: 30, magSize: 30, reserve: 120,
  reloading: false, reloadT: 0, reloadDur: 2.1,
  lastShot: 0, fireInterval: 60 / 750,   // 750rpm
  bloom: 0,                             // 連射による拡散
  ads: false, adsT: 0,
  gun: null, muzzle: null, flash: null, flashLight: null,
  kickZ: 0, kickR: 0,
  swayX: 0, swayY: 0,
  gunPos: new THREE.Vector3(0.22, -0.2, -0.38),
};

const input = { keys: {}, lmb: false, rmb: false };

/* ---------- 銃ビューモデル ---------- */
function buildGun() {
  const g = new THREE.Group();
  const gm = MAT.gunmetal, dm = MAT.darkMetal;

  const recv = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.095, 0.46), gm);
  g.add(recv);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.24), dm);
  hand.position.set(0, -0.012, -0.33);
  g.add(hand);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.3, 8), gm);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.55);
  g.add(barrel);
  const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.06, 8), dm);
  muzzleBrake.rotation.x = Math.PI / 2;
  muzzleBrake.position.set(0, 0.012, -0.68);
  g.add(muzzleBrake);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.085, 0.24), dm);
  stock.position.set(0, -0.02, 0.32);
  g.add(stock);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.06), dm);
  grip.position.set(0, -0.1, 0.1);
  grip.rotation.x = 0.35;
  g.add(grip);
  const magM = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.15, 0.075), gm);
  magM.position.set(0, -0.115, -0.06);
  magM.rotation.x = 0.14;
  g.add(magM);
  // レッドドットサイト（リング＋ドット）
  const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.09), dm);
  sightBase.position.set(0, 0.062, -0.05);
  g.add(sightBase);
  const sightPost = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.024, 0.03), dm);
  sightPost.position.set(0, 0.082, -0.05);
  g.add(sightPost);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0032, 8, 20), dm);
  ring.position.set(0, 0.098, -0.05);
  g.add(ring);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2211, fog: false }));
  dot.position.set(0, 0.098, -0.05);
  g.add(dot);
  // フロントサイト
  const fs = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.01), dm);
  fs.position.set(0, 0.045, -0.44);
  g.add(fs);
  // グローブ（手）
  const gloveM = new THREE.MeshLambertMaterial({ color: 0x3d3a30 });
  gloveM.color.convertSRGBToLinear();
  const handR = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.09), gloveM);
  handR.position.set(0.005, -0.085, 0.1);
  g.add(handR);
  const handL = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.1), gloveM);
  handL.position.set(-0.005, -0.03, -0.32);
  g.add(handL);

  // マズル位置
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.012, -0.72);
  g.add(muzzle);

  // マズルフラッシュ
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getFlashTexture(), color: 0xffc36b, transparent: true, opacity: 0, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flash.scale.setScalar(0.22);
  muzzle.add(flash);

  const flashLight = new THREE.PointLight(0xffb36b, 0, 14);
  scene.add(flashLight);

  weapon.gun = g;
  weapon.muzzle = muzzle;
  weapon.flash = flash;
  weapon.flashLight = flashLight;
  camera.add(g);
  g.scale.setScalar(0.92);
  g.position.copy(weapon.gunPos);
}

/* ---------- 射撃 ---------- */
const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _muzzleW = new THREE.Vector3();

function currentSpread() {
  let s = weapon.ads ? 0.0045 : 0.017;
  const spd = Math.hypot(player.vel.x, player.vel.z);
  s += (spd / 7) * 0.02;
  if (!player.onGround) s += 0.03;
  if (player.crouching) s *= 0.72;
  return s + weapon.bloom;
}

function tryFire(now) {
  if (!player.alive || weapon.reloading) return;
  if (now - weapon.lastShot < weapon.fireInterval) return;
  if (player.sprinting) return;
  if (weapon.mag <= 0) {
    AudioSys.dry();
    startReload();
    weapon.lastShot = now;
    return;
  }
  weapon.lastShot = now;
  weapon.mag--;
  game.shots++;
  game.shotFired = true;   // 敵が銃声を聞きつける

  // リコイル＆拡散
  const rec = weapon.ads ? 0.55 : 1;
  player.recoilP += rand(0.0055, 0.0085) * rec;
  player.recoilY += rand(-0.0035, 0.0035) * rec;
  weapon.bloom = Math.min(weapon.bloom + 0.0038, 0.03);
  weapon.kickZ += 0.045;
  weapon.kickR += 0.075;

  // 射線（スプレッド付き）
  camera.getWorldDirection(_dir);
  const sp = currentSpread();
  _dir.x += rand(-sp, sp); _dir.y += rand(-sp, sp); _dir.z += rand(-sp, sp);
  _dir.normalize();
  _from.copy(camera.getWorldPosition(new THREE.Vector3()));

  const rc = new THREE.Raycaster(_from, _dir, 0.05, 300);
  const targets = hitMeshes.concat(worldMeshes);
  const hits = rc.intersectObjects(targets, false);

  let end = null;
  if (hits.length) {
    const h = hits[0];
    end = h.point;
    if (h.object.userData.enemy && h.object.userData.enemy.alive) {
      hitEnemy(h.object.userData.enemy, h.object.userData.part, h.point, _dir);
    } else {
      impactFX(h.point);
    }
  } else {
    end = _from.clone().addScaledVector(_dir, 250);
  }

  // トレーサー（銃口から）
  weapon.muzzle.getWorldPosition(_muzzleW);
  spawnTracer(_muzzleW, end, 0xffe9b8);

  // マズルフラッシュ
  weapon.flash.material.opacity = 0.95;
  weapon.flash.material.rotation = rand(0, 6.28);
  weapon.flash.scale.setScalar(rand(0.16, 0.26));
  weapon.flashLight.position.copy(_muzzleW);
  weapon.flashLight.intensity = 2.4;

  // 薬莢
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  ejectShell(_muzzleW, _right, _up);

  AudioSys.shot();
  updateAmmoHUD();
}

function startReload() {
  if (weapon.reloading || weapon.mag === weapon.magSize || weapon.reserve <= 0) return;
  weapon.reloading = true;
  weapon.reloadT = 0;
  weapon.ads = false;
  document.getElementById('reloadwrap').style.display = 'block';
  AudioSys.reload();
}

/* ---------- プレイヤー被弾 ---------- */
function damagePlayer(dmg, fromPos) {
  if (!player.alive) return;
  player.hp -= dmg;
  player.lastDamage = game.time;
  AudioSys.hurt();

  // 方向インジケータ
  const d = new THREE.Vector3().subVectors(fromPos, player.pos); d.y = 0; d.normalize();
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const ang = Math.atan2(d.dot(right), d.dot(new THREE.Vector3(fwd.x, 0, fwd.z).normalize()));
  const el = document.getElementById('dmgdir');
  el.style.transform = `rotate(${ang}rad)`;
  el.style.transition = 'none'; el.style.opacity = 0.95;
  requestAnimationFrame(() => { el.style.transition = 'opacity 1.1s'; el.style.opacity = 0; });

  game.hurtFlash = 1;
  if (player.hp <= 0) {
    player.hp = 0;
    player.alive = false;
    gameOver();
  }
  updateHealthHUD();
}

/* ---------- 移動衝突（円 vs Box3） ---------- */
function resolveCollision(p, radius, height) {
  for (const b of colliders) {
    if (p.y + height < b.min.y || p.y + 0.25 > b.max.y) continue;
    const cx = clamp(p.x, b.min.x, b.max.x);
    const cz = clamp(p.z, b.min.z, b.max.z);
    let dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2), push = radius - d;
      p.x += dx / d * push; p.z += dz / d * push;
    } else {
      const px1 = p.x - b.min.x + radius, px2 = b.max.x - p.x + radius;
      const pz1 = p.z - b.min.z + radius, pz2 = b.max.z - p.z + radius;
      const m = Math.min(px1, px2, pz1, pz2);
      if (m === px1) p.x -= px1; else if (m === px2) p.x += px2;
      else if (m === pz1) p.z -= pz1; else p.z += pz2;
    }
  }
  p.x = clamp(p.x, -59, 59);
  p.z = clamp(p.z, -59, 59);
}

/* ---------- プレイヤー更新 ---------- */
function updatePlayer(dt) {
  if (!player.alive) return;

  const k = input.keys;
  let mx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
  let mz = (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0);

  player.crouching = !!k.KeyC;
  const wantSprint = !!k.ShiftLeft && mz < 0 && !weapon.ads && !weapon.reloading;
  player.sprinting = wantSprint && !player.crouching;

  player.targetEyeH = player.crouching ? 1.06 : 1.62;
  player.eyeH = lerp(player.eyeH, player.targetEyeH, 1 - Math.exp(-12 * dt));

  let speed = player.crouching ? 2.4 : (player.sprinting ? 7.2 : 4.6);
  if (weapon.ads) speed *= 0.55;

  // カメラ基準の移動
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  const wx = (mx * cos - mz * sin);
  const wz = (mx * sin + mz * cos);
  const wl = Math.hypot(wx, wz) || 1;
  const accel = player.onGround ? 14 : 4;
  player.vel.x = lerp(player.vel.x, wx / wl * speed * (mx || mz ? 1 : 0), 1 - Math.exp(-accel * dt));
  player.vel.z = lerp(player.vel.z, wz / wl * speed * (mx || mz ? 1 : 0), 1 - Math.exp(-accel * dt));

  // 重力・ジャンプ
  player.vel.y -= 13.5 * dt;
  if (k.Space && player.onGround) {
    player.vel.y = 4.6;
    player.onGround = false;
  }
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.y += player.vel.y * dt;
  if (player.pos.y <= 0) {
    if (!player.onGround && player.vel.y < -5) { AudioSys.land(); weapon.kickR += 0.05; }
    player.pos.y = 0; player.vel.y = 0; player.onGround = true;
  }

  resolveCollision(player.pos, player.radius, player.targetEyeH + 0.2);

  // リーン（移動時の僅かなロール）
  player.lean = lerp(player.lean, -mx * 0.014, 1 - Math.exp(-8 * dt));

  // 歩行ボブ＆足音
  const spd = Math.hypot(player.vel.x, player.vel.z);
  if (spd > 0.5 && player.onGround) {
    const prev = Math.sin(player.bobPhase);
    player.bobPhase += spd * dt * 1.85;
    const cur = Math.sin(player.bobPhase);
    if (prev >= 0 && cur < 0) AudioSys.step(player.sprinting);
  }

  // HP 自動回復
  if (player.hp < 100 && game.time - player.lastDamage > player.regenDelay) {
    player.hp = Math.min(100, player.hp + 11 * dt);
    updateHealthHUD();
  }

  // カメラ
  const bobY = Math.sin(player.bobPhase * 2) * 0.028 * clamp(spd / 5, 0, 1);
  const bobX = Math.cos(player.bobPhase) * 0.016 * clamp(spd / 5, 0, 1);
  camera.position.set(
    player.pos.x + bobX * cos,
    player.pos.y + player.eyeH + bobY,
    player.pos.z + bobX * sin
  );

  // リコイル回復
  player.recoilP = lerp(player.recoilP, 0, 1 - Math.exp(-7 * dt));
  player.recoilY = lerp(player.recoilY, 0, 1 - Math.exp(-7 * dt));

  camera.rotation.set(
    clamp(player.pitch + player.recoilP, -1.5, 1.5),
    player.yaw + player.recoilY,
    player.lean
  );

  // 射撃
  if (input.lmb) tryFire(game.time);
}

/* ---------- 武器（見た目）更新 ---------- */
function updateWeapon(dt) {
  const g = weapon.gun;
  if (!g) return;

  // ADS 遷移
  weapon.adsT = clamp(weapon.adsT + (weapon.ads ? dt : -dt) * 7, 0, 1);
  const t = weapon.adsT * weapon.adsT * (3 - 2 * weapon.adsT);

  // FOV
  const targetFov = player.sprinting ? 80 : lerp(75, 46, t);
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-14 * dt));
    camera.updateProjectionMatrix();
  }

  // 銃の基本位置
  const hip = { x: 0.21, y: -0.19, z: -0.4, rx: 0, ry: 0.08 };
  const ads = { x: 0, y: -0.09, z: -0.47, rx: 0, ry: 0 };
  let px = lerp(hip.x, ads.x, t), py = lerp(hip.y, ads.y, t), pz = lerp(hip.z, ads.z, t);
  let rx = lerp(hip.rx, ads.rx, t), ry = lerp(hip.ry, ads.ry, t);

  // スプリント姿勢
  if (player.sprinting) {
    py -= 0.07; rx -= 0.5; ry += 0.35;
  }
  // リロード姿勢
  if (weapon.reloading) {
    const rp = Math.sin((weapon.reloadT / weapon.reloadDur) * Math.PI);
    py -= 0.13 * rp; rx -= 0.75 * rp; ry -= 0.25 * rp;
  }

  // ボブ＆呼吸＆マウススウェイ
  const spd = Math.hypot(player.vel.x, player.vel.z);
  const bobA = clamp(spd / 5, 0, 1) * (1 - t * 0.85);
  px += Math.cos(player.bobPhase) * 0.008 * bobA;
  py += Math.sin(player.bobPhase * 2) * 0.006 * bobA;
  py += Math.sin(game.time * 1.6) * 0.0016 * (t > 0.5 ? 1 : 0.3); // 呼吸
  weapon.swayX = lerp(weapon.swayX, 0, 1 - Math.exp(-8 * dt));
  weapon.swayY = lerp(weapon.swayY, 0, 1 - Math.exp(-8 * dt));
  px += weapon.swayX * (1 - t * 0.8);
  py += weapon.swayY * (1 - t * 0.8);

  // リコイルキック
  weapon.kickZ = lerp(weapon.kickZ, 0, 1 - Math.exp(-11 * dt));
  weapon.kickR = lerp(weapon.kickR, 0, 1 - Math.exp(-11 * dt));
  pz += weapon.kickZ;
  rx += weapon.kickR;

  g.position.set(px, py, pz);
  g.rotation.set(rx, ry, 0);

  // フラッシュ減衰
  weapon.flash.material.opacity *= Math.exp(-28 * dt);
  weapon.flashLight.intensity *= Math.exp(-30 * dt);

  // ブルーム（拡散）回復
  weapon.bloom = Math.max(0, weapon.bloom - 0.028 * dt);

  // リロード進行
  if (weapon.reloading) {
    weapon.reloadT += dt;
    document.getElementById('reloadfill').style.width = `${(weapon.reloadT / weapon.reloadDur) * 100}%`;
    if (weapon.reloadT >= weapon.reloadDur) {
      const need = weapon.magSize - weapon.mag;
      const take = Math.min(need, weapon.reserve);
      weapon.mag += take;
      weapon.reserve -= take;
      weapon.reloading = false;
      document.getElementById('reloadwrap').style.display = 'none';
      updateAmmoHUD();
    }
  }

  // クロスヘアの開き
  const gapPx = 8 + currentSpread() * 780;
  document.documentElement.style.setProperty('--gap', `${gapPx.toFixed(1)}px`);
  const chEl = document.getElementById('crosshair');
  chEl.style.opacity = (weapon.ads || player.sprinting) ? 0 : 1;
}

/* ---------- 入力 ---------- */
function initInput() {
  document.addEventListener('keydown', e => {
    input.keys[e.code] = true;
    if (e.code === 'KeyR') startReload();
    if (e.code === 'Space') e.preventDefault();
  });
  document.addEventListener('keyup', e => { input.keys[e.code] = false; });
  document.addEventListener('mousedown', e => {
    if (game.state !== 'playing') return;
    if (e.button === 0) input.lmb = true;
    if (e.button === 2 && !player.sprinting && !weapon.reloading) weapon.ads = true;
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 0) input.lmb = false;
    if (e.button === 2) { input.rmb = false; weapon.ads = false; }
  });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('mousemove', e => {
    if (game.state !== 'playing' || document.pointerLockElement === null) return;
    const sens = 0.0021 * (weapon.ads ? 0.62 : 1);
    player.yaw -= e.movementX * sens;
    player.pitch = clamp(player.pitch - e.movementY * sens, -1.45, 1.45);
    weapon.swayX = clamp(weapon.swayX - e.movementX * 0.00008, -0.03, 0.03);
    weapon.swayY = clamp(weapon.swayY + e.movementY * 0.00008, -0.03, 0.03);
  });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}
