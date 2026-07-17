'use strict';
/* ============================================================
   敵兵 / AI / ウェーブ / ドロップ
   ============================================================ */

const enemies = [];
let hitMeshes = [];   // プレイヤーの射撃対象（敵の部位メッシュ）

function rebuildHitMeshes() {
  hitMeshes = [];
  for (const e of enemies) {
    if (e.alive) hitMeshes.push(...e.parts);
  }
}

/* ---------- 敵モデル ---------- */
function buildEnemyModel() {
  const g = new THREE.Group();
  const parts = [];
  const reg = (mesh, part) => { mesh.userData.part = part; parts.push(mesh); return mesh; };

  // 脚
  const legL = new THREE.Group(), legR = new THREE.Group();
  for (const [leg, sx] of [[legL, -0.11], [legR, 0.11]]) {
    const thigh = reg(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.16), MAT.camoDark), 'limb');
    thigh.position.y = -0.21;
    const shin = reg(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.14), MAT.camoDark), 'limb');
    shin.position.y = -0.62;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.24), MAT.darkMetal);
    boot.position.set(0, -0.86, 0.04);
    leg.add(thigh); leg.add(shin); leg.add(boot);
    leg.position.set(sx, 0.92, 0);
    g.add(leg);
  }

  // 胴体グループ（エイム用に回転させる）
  const torso = new THREE.Group();
  torso.position.y = 0.95;
  g.add(torso);

  const chest = reg(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.24), MAT.camo), 'torso');
  chest.position.y = 0.28;
  torso.add(chest);
  const vest = reg(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.28), MAT.camoDark), 'torso');
  vest.position.y = 0.3;
  torso.add(vest);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.25), MAT.darkMetal);
  belt.position.y = 0.02;
  torso.add(belt);

  // 頭
  const headG = new THREE.Group();
  headG.position.y = 0.62;
  const head = reg(new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 10), MAT.skin), 'head');
  head.position.y = 0.05;
  const helmet = reg(new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), MAT.camoDark), 'head');
  helmet.position.y = 0.075;
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.04), MAT.glass);
  goggles.position.set(0, 0.06, 0.12);
  headG.add(head); headG.add(helmet); headG.add(goggles);
  torso.add(headG);

  // 腕＋ライフル（胴体子）
  const armM = MAT.camo;
  const armL = reg(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.34, 0.12), armM), 'limb');
  armL.position.set(-0.24, 0.3, 0.2);
  armL.rotation.x = -0.55; armL.rotation.z = 0.3;
  torso.add(armL);
  const armR = reg(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.34, 0.12), armM), 'limb');
  armR.position.set(0.25, 0.28, 0.18);
  armR.rotation.x = -0.5; armR.rotation.z = -0.25;
  torso.add(armR);

  const rifle = new THREE.Group();
  const rBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.72), MAT.gunmetal);
  rifle.add(rBody);
  const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 6), MAT.darkMetal);
  rBarrel.rotation.x = Math.PI / 2;
  rBarrel.position.z = -0.48;
  rifle.add(rBarrel);
  const rMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.08), MAT.darkMetal);
  rMag.position.set(0, -0.1, -0.08);
  rifle.add(rMag);
  rifle.position.set(0.14, 0.32, 0.34);
  torso.add(rifle);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.64);
  rifle.add(muzzle);

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getFlashTexture(), color: 0xffc36b, transparent: true, opacity: 0, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flash.scale.setScalar(0.34);
  muzzle.add(flash);

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });

  return { group: g, parts, legL, legR, torso, headG, muzzle, flash };
}

/* ---------- 敵クラス ---------- */
class Enemy {
  constructor(x, z) {
    const m = buildEnemyModel();
    this.g = m.group;
    this.parts = m.parts;
    this.legL = m.legL; this.legR = m.legR;
    this.torso = m.torso; this.muzzle = m.muzzle; this.flash = m.flash;
    for (const p of this.parts) p.userData.enemy = this;

    this.pos = new THREE.Vector3(x, 0, z);
    this.g.position.copy(this.pos);
    scene.add(this.g);

    this.hp = 100;
    this.alive = true;
    this.state = 'patrol';          // patrol | combat | search
    this.alertT = 0;                // 視認→初弾までの反応時間
    this.lastKnown = new THREE.Vector3();
    this.moveTarget = new THREE.Vector3(x, 0, z);
    this.repathT = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = rand(1, 2.5);
    this.burstLeft = 0;
    this.shotT = 0;
    this.burstCd = rand(1, 2);
    this.crouched = false;
    this.walkPhase = rand(0, 6);
    this.speed = 0;
    this.deathT = 0;
    this.fallDir = Math.random() < 0.5 ? 1 : -1;
    this.removeT = 0;
    this.suppressT = 0;
  }

  eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + (this.crouched ? 1.25 : 1.58), this.pos.z);
  }

  canSeePlayer() {
    if (!player.alive) return false;
    const eye = this.eyePos();
    const tp = new THREE.Vector3(player.pos.x, player.pos.y + player.eyeH * 0.85, player.pos.z);
    const d = tp.clone().sub(eye);
    const dist = d.length();
    if (dist > 90) return false;
    d.normalize();
    const rc = new THREE.Raycaster(eye, d, 0.1, dist);
    const block = rc.intersectObjects(worldMeshes, false);
    return block.length === 0;
  }

  hearShot() {
    if (!this.alive || this.state === 'combat') return;
    // 銃声は拠点全域に響く：距離に応じた誤差つきで発砲位置を推定して索敵
    const dist = this.pos.distanceTo(player.pos);
    const err = dist * 0.18;
    this.state = 'search';
    this.lastKnown.set(
      clamp(player.pos.x + rand(-err, err), -55, 55), 0,
      clamp(player.pos.z + rand(-err, err), -55, 55));
    this.moveTarget.copy(this.lastKnown);
    this.repathT = 0;
  }

  update(dt) {
    if (!this.alive) {
      // 死亡アニメ：倒れて徐々に沈む
      this.deathT += dt;
      const k = Math.min(this.deathT / 0.45, 1);
      this.g.rotation.x = this.fallDir * (Math.PI / 2) * (k * k * (3 - 2 * k));
      this.removeT += dt;
      if (this.removeT > 6) {
        this.g.position.y = -(this.removeT - 6) * 0.35;
        if (this.removeT > 9) this.destroy();
      }
      return;
    }

    const toPlayer = new THREE.Vector3().subVectors(player.pos, this.pos);
    const dist = toPlayer.length();
    const sees = this.canSeePlayer();

    // 状態遷移
    if (sees) {
      this.lastKnown.copy(player.pos);
      if (this.state !== 'combat') {
        this.state = 'combat';
        this.alertT = rand(0.45, 1.0);   // 反応遅延
      }
    } else if (this.state === 'combat') {
      this.suppressT += dt;
      if (this.suppressT > 4.5) { this.state = 'search'; this.moveTarget.copy(this.lastKnown); this.suppressT = 0; }
    }

    let moveX = 0, moveZ = 0;
    let wantSpeed = 0;

    if (this.state === 'combat') {
      this.alertT -= dt;
      // 間合い管理：遠ければ詰め、近ければ下がる
      const ideal = 20;
      const fwdX = toPlayer.x / dist, fwdZ = toPlayer.z / dist;
      let adv = 0;
      if (dist > 34) adv = 1; else if (dist < 9) adv = -1;
      // 左右にストレイフ
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeDir *= -1; this.strafeT = rand(0.8, 2.2); }
      moveX = fwdX * adv + -fwdZ * this.strafeDir * (adv === 0 ? 1 : 0.45);
      moveZ = fwdZ * adv + fwdX * this.strafeDir * (adv === 0 ? 1 : 0.45);
      wantSpeed = adv !== 0 ? 4.3 : 2.6;
      this.crouched = adv === 0 && Math.random() < 0.003 ? !this.crouched : this.crouched;

      // 射撃
      if (this.alertT <= 0) this.updateFire(dt, dist);

      // 顔向き：プレイヤーへ
      this.faceTowards(player.pos, dt, 7);
    } else {
      // patrol / search：目標地点へ
      const toT = new THREE.Vector3().subVectors(this.moveTarget, this.pos);
      const dT = toT.length();
      if (dT < 1.5) {
        if (this.state === 'search') { this.state = 'patrol'; }
        if (this.repathT <= 0) {
          const a = rand(0, Math.PI * 2), r = rand(6, 26);
          this.moveTarget.set(
            clamp(this.pos.x + Math.cos(a) * r, -54, 54), 0,
            clamp(this.pos.z + Math.sin(a) * r, -54, 54));
          this.repathT = rand(3, 7);
        } else this.repathT -= dt;
      } else {
        moveX = toT.x / dT; moveZ = toT.z / dT;
        wantSpeed = this.state === 'search' ? 4.5 : 2.2;
        this.faceTowards(this.moveTarget, dt, 4);
      }
    }

    // 移動
    const ml = Math.hypot(moveX, moveZ);
    if (ml > 0.01) {
      moveX /= ml; moveZ /= ml;
      this.speed = lerp(this.speed, wantSpeed, 1 - Math.exp(-8 * dt));
    } else {
      this.speed = lerp(this.speed, 0, 1 - Math.exp(-10 * dt));
    }
    this.pos.x += moveX * this.speed * dt;
    this.pos.z += moveZ * this.speed * dt;
    resolveCollision(this.pos, 0.34, 1.7);
    this.g.position.copy(this.pos);

    // 歩行アニメ
    if (this.speed > 0.3) {
      this.walkPhase += this.speed * dt * 2.4;
      const sw = Math.sin(this.walkPhase) * 0.55 * clamp(this.speed / 4, 0, 1);
      this.legL.rotation.x = sw;
      this.legR.rotation.x = -sw;
    } else {
      this.legL.rotation.x = lerp(this.legL.rotation.x, 0, 1 - Math.exp(-10 * dt));
      this.legR.rotation.x = lerp(this.legR.rotation.x, 0, 1 - Math.exp(-10 * dt));
    }
    // しゃがみ
    const targetY = this.crouched ? -0.32 : 0;
    this.torso.position.y = lerp(this.torso.position.y, 0.95 + targetY, 1 - Math.exp(-8 * dt));

    // フラッシュ減衰
    this.flash.material.opacity *= Math.exp(-25 * dt);
  }

  faceTowards(target, dt, rate) {
    const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    let diff = want - this.g.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.g.rotation.y += diff * (1 - Math.exp(-rate * dt));
  }

  updateFire(dt, dist) {
    this.shotT -= dt;
    if (this.burstLeft > 0) {
      if (this.shotT <= 0) {
        this.fireOne(dist);
        this.burstLeft--;
        this.shotT = 60 / 680;   // バースト内射速
      }
    } else {
      this.burstCd -= dt;
      if (this.burstCd <= 0) {
        this.burstLeft = 3 + (Math.random() * 3 | 0);
        this.burstCd = rand(1.6, 3.0);
      }
    }
  }

  fireOne(dist) {
    // マズルフラッシュ
    this.flash.material.opacity = 0.9;
    this.flash.material.rotation = rand(0, 6.28);
    const mw = this.muzzle.getWorldPosition(new THREE.Vector3());

    // プレイヤーへのパン
    const rel = new THREE.Vector3().subVectors(this.pos, player.pos);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const pan = clamp(rel.normalize().dot(right), -1, 1) * 0.8;
    AudioSys.enemyShot(dist, pan);

    // 命中判定：距離・状況で確率
    let p = clamp(0.26 - dist * 0.0035, 0.04, 0.26);
    if (player.crouching) p *= 0.7;
    if (player.sprinting) p *= 0.6;
    if (this.speed > 1) p *= 0.65;
    if (!this.canSeePlayer()) p = 0;   // 遮蔽越しは当たらない（制圧射撃）

    const chest = new THREE.Vector3(player.pos.x, player.pos.y + player.eyeH * 0.8, player.pos.z);
    let aim;
    if (Math.random() < p) {
      // 命中
      aim = chest.clone().add(new THREE.Vector3(rand(-0.08, 0.08), rand(-0.08, 0.08), rand(-0.08, 0.08)));
      damagePlayer(rand(7, 12) * (dist > 40 ? 0.75 : 1), this.pos);
      spawnTracer(mw, aim, 0xffc07a);
    } else {
      // 外れ：プレイヤー近くを通過 → 着弾 or 空へ
      const off = new THREE.Vector3(rand(-1, 1), rand(-0.4, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.5, 2.2));
      aim = chest.clone().add(off);
      const dir = aim.clone().sub(mw).normalize();
      const rc = new THREE.Raycaster(mw, dir, 0.1, 120);
      const hits = rc.intersectObjects(worldMeshes, false);
      const end = hits.length ? hits[0].point : mw.clone().addScaledVector(dir, 120);
      if (hits.length) impactFX(end);
      spawnTracer(mw, end, 0xffc07a);
      // 頭に近い通過ならクラック音
      const head = new THREE.Vector3(player.pos.x, player.pos.y + player.eyeH, player.pos.z);
      if (distToSegment(head, mw, end) < 1.6) AudioSys.crack(pan);
    }
  }

  hit(dmg, part, point, dir) {
    if (!this.alive) return;
    this.hp -= dmg;
    bloodFX(point, dir);
    if (this.hp <= 0) {
      this.die(part === 'head');
    } else {
      // 被弾で戦闘状態へ
      this.state = 'combat';
      this.lastKnown.copy(player.pos);
      this.alertT = Math.min(this.alertT, 0.25);
    }
  }

  die(headshot) {
    this.alive = false;
    this.hp = 0;
    game.kills++;
    if (headshot) game.headshots++;
    const pts = headshot ? 150 : 100;
    game.score += pts;
    addKillfeed(headshot ? `ヘッドショット ＋${pts}` : `敵兵排除 ＋${pts}`, headshot);
    spawnFloater(headshot ? `HEADSHOT +${pts}` : `+${pts}`, headshot);
    updateScoreHUD();
    rebuildHitMeshes();
    maybeDrop(this.pos);
    checkWaveCleared();
  }

  destroy() {
    scene.remove(this.g);
    const i = enemies.indexOf(this);
    if (i >= 0) enemies.splice(i, 1);
  }
}

function distToSegment(p, a, b) {
  const ab = b.clone().sub(a);
  const t = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

function hitEnemy(enemy, part, point, dir) {
  game.hits++;
  const dmgMap = { head: 110, torso: 34, limb: 24 };
  const dmg = dmgMap[part] || 30;
  const willKill = enemy.hp - dmg <= 0;
  AudioSys.hitmark(willKill);
  if (part === 'head') AudioSys.headshot();
  showHitmarker(willKill);
  enemy.hit(dmg, part, point, dir);
}

/* ---------- ドロップ ---------- */
const loots = [];
let ammoMat, medMat;
function initLoot() {
  ammoMat = new THREE.MeshLambertMaterial({ color: 0x4a5b2e });
  ammoMat.color.convertSRGBToLinear();
  const mc = document.createElement('canvas');
  mc.width = mc.height = 64;
  const c2 = mc.getContext('2d');
  c2.fillStyle = '#ddd'; c2.fillRect(0, 0, 64, 64);
  c2.fillStyle = '#c22'; c2.fillRect(26, 10, 12, 44); c2.fillRect(10, 26, 44, 12);
  medMat = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(mc) });
}
function maybeDrop(pos) {
  const r = Math.random();
  if (r < 0.5) spawnLoot(pos, 'ammo');
  else if (r < 0.72) spawnLoot(pos, 'med');
}
function spawnLoot(pos, type) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.2, 0.32),
    type === 'ammo' ? ammoMat : medMat
  );
  m.position.set(pos.x + rand(-0.5, 0.5), 0.12, pos.z + rand(-0.5, 0.5));
  m.castShadow = true;
  scene.add(m);
  loots.push({ m, type, t: 0 });
}
function updateLoot(dt) {
  for (let i = loots.length - 1; i >= 0; i--) {
    const l = loots[i];
    l.t += dt;
    l.m.rotation.y += dt * 1.5;
    l.m.position.y = 0.12 + Math.sin(l.t * 3) * 0.03;
    if (l.t > 25) {
      l.m.visible = Math.sin(l.t * 10) > 0;   // 点滅
      if (l.t > 30) { scene.remove(l.m); loots.splice(i, 1); continue; }
    }
    const d = l.m.position.distanceTo(player.pos);
    if (d < 1.3 && player.alive) {
      if (l.type === 'ammo') {
        weapon.reserve = Math.min(weapon.reserve + 90, 360);
        spawnFloater('弾薬 +90', false);
      } else {
        player.hp = Math.min(100, player.hp + 50);
        updateHealthHUD();
        spawnFloater('応急キット +50', false);
      }
      AudioSys.pickup();
      scene.remove(l.m);
      loots.splice(i, 1);
      updateAmmoHUD();
    }
  }
}

/* ---------- ウェーブ管理 ---------- */
function waveSize(n) { return Math.min(3 + n * 2, 12); }

function startWave(n) {
  game.wave = n;
  const total = waveSize(n);
  game.spawnQueue = total;
  game.waveTotal = total;
  game.spawnT = 0.5;
  showBanner(`WAVE ${n}`, '敵部隊接近 ― 迎撃せよ');
  AudioSys.wave();
  updateWaveHUD();
}

function updateWaves(dt) {
  if (game.state !== 'playing') return;

  // スポーン処理
  if (game.spawnQueue > 0) {
    game.spawnT -= dt;
    if (game.spawnT <= 0) {
      const concurrent = enemies.filter(e => e.alive).length;
      if (concurrent < Math.min(4 + game.wave, 8)) {
        const sp = pickSpawnPoint();
        enemies.push(new Enemy(sp[0], sp[1]));
        rebuildHitMeshes();
        game.spawnQueue--;
        game.spawnT = rand(0.3, 0.9);
        updateWaveHUD();
      } else {
        game.spawnT = 0.5;
      }
    }
  }

  // インターミッション
  if (game.intermission > 0) {
    game.intermission -= dt;
    document.getElementById('waveinfo').textContent =
      `WAVE ${game.wave} CLEAR ― 次の波まで ${Math.ceil(game.intermission)}`;
    if (game.intermission <= 0) startWave(game.wave + 1);
  }

  // ランダムな遠雷・爆発音
  game.boomT -= dt;
  if (game.boomT <= 0) {
    AudioSys.boom();
    game.boomT = rand(14, 38);
  }
}

function pickSpawnPoint() {
  const far = SPAWN_POINTS.filter(([x, z]) =>
    Math.hypot(x - player.pos.x, z - player.pos.z) > 28);
  const list = far.length ? far : SPAWN_POINTS;
  return list[(Math.random() * list.length) | 0];
}

function checkWaveCleared() {
  updateWaveHUD();
  const alive = enemies.filter(e => e.alive).length;
  if (alive === 0 && game.spawnQueue === 0 && game.intermission <= 0) {
    game.intermission = 4;
    game.score += 250;
    spawnFloater('WAVE BONUS +250', false);
    updateScoreHUD();
  }
}

function updateEnemies(dt) {
  for (const e of enemies) e.update(dt);
  // 銃声を聞きつける
  if (game.shotFired) {
    for (const e of enemies) e.hearShot();
    game.shotFired = false;
  }
}
