'use strict';
/* ============================================================
   敵兵 / AI / ウェーブ / ドロップ / TDM チーム
   ============================================================ */

const enemies = [];
let hitMeshes = [];   // プレイヤーの射撃対象（敵の部位メッシュ）

function rebuildHitMeshes() {
  hitMeshes = [];
  for (const e of enemies) {
    // プレイヤーは敵チームのみ撃てる（味方撃ちなし）
    if (e.alive && e.team !== 'blue') hitMeshes.push(...e.parts);
  }
  if (game.online && typeof Online !== 'undefined') {
    const myTeam = (typeof Net !== 'undefined' && Net.getState().team)
      || Online.getMyTeam()
      || 'blue';
    for (const r of Online.getRemotes().values()) {
      if (!r.alive || r.team === myTeam) continue;
      hitMeshes.push(...r.parts);
    }
  }
}

/* ---------- 敵モデル ---------- */
function buildEnemyModel(kind = 'grunt', team = 'red') {
  const g = new THREE.Group();
  const parts = [];
  const reg = (mesh, part) => { mesh.userData.part = part; parts.push(mesh); return mesh; };
  const isSniper = kind === 'sniper';
  let bodyMat, darkMat;
  if (team === 'blue') {
    bodyMat = MAT.metalBlue; darkMat = MAT.metalGrey;
  } else if (kind === 'elite') {
    bodyMat = MAT.suitRedDark; darkMat = MAT.darkMetal;
  } else if (kind === 'rusher') {
    bodyMat = MAT.suitRedDark; darkMat = MAT.suitRed;
  } else {
    bodyMat = MAT.suitRed; darkMat = MAT.suitRedDark;
  }

  // 脚
  const legL = new THREE.Group(), legR = new THREE.Group();
  for (const [leg, sx] of [[legL, -0.11], [legR, 0.11]]) {
    const thigh = reg(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.16), darkMat), 'limb');
    thigh.position.y = -0.21;
    const shin = reg(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.14), darkMat), 'limb');
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

  const chest = reg(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.24), bodyMat), 'torso');
  chest.position.y = 0.28;
  torso.add(chest);
  const vest = reg(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.28), darkMat), 'torso');
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
  const helmet = reg(new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), darkMat), 'head');
  helmet.position.y = 0.075;
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.04), MAT.glass);
  goggles.position.set(0, 0.06, 0.12);
  headG.add(head); headG.add(helmet); headG.add(goggles);
  torso.add(headG);

  // 腕＋ライフル（胴体子）
  const armM = bodyMat;
  const armL = reg(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.34, 0.12), armM), 'limb');
  armL.position.set(-0.24, 0.3, 0.2);
  armL.rotation.x = -0.55; armL.rotation.z = 0.3;
  torso.add(armL);
  const armR = reg(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.34, 0.12), armM), 'limb');
  armR.position.set(0.25, 0.28, 0.18);
  armR.rotation.x = -0.5; armR.rotation.z = -0.25;
  torso.add(armR);

  const rifle = new THREE.Group();
  const rBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.09, isSniper ? 0.95 : 0.72), MAT.gunmetal);
  rifle.add(rBody);
  const rBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, isSniper ? 0.55 : 0.28, 6), MAT.darkMetal);
  rBarrel.rotation.x = Math.PI / 2;
  rBarrel.position.z = isSniper ? -0.72 : -0.48;
  rifle.add(rBarrel);
  if (isSniper) {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), MAT.darkMetal);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.08, -0.1);
    rifle.add(scope);
  }
  const rMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.08), MAT.darkMetal);
  rMag.position.set(0, -0.1, -0.08);
  rifle.add(rMag);
  rifle.position.set(0.14, 0.32, 0.34);
  torso.add(rifle);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, isSniper ? -0.95 : -0.64);
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
  constructor(x, z, kind = 'grunt', team = 'red') {
    this.kind = kind;
    this.team = team;
    const m = buildEnemyModel(kind, team);
    this.g = m.group;
    this.parts = m.parts;
    this.legL = m.legL; this.legR = m.legR;
    this.torso = m.torso; this.muzzle = m.muzzle; this.flash = m.flash;
    for (const p of this.parts) p.userData.enemy = this;

    const protMat = new THREE.MeshBasicMaterial({
      color: 0x8ad4ff, transparent: true, opacity: 0.2,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.protAura = new THREE.Mesh(new THREE.SphereGeometry(1.2, 18, 12), protMat);
    this.protAura.position.y = 1.05;
    this.protAura.visible = false;
    this.g.add(this.protAura);

    this.pos = new THREE.Vector3(x, 0, z);
    this.g.position.copy(this.pos);
    if (kind === 'elite') this.g.scale.setScalar(1.12);
    scene.add(this.g);

    this.hp = kind === 'elite' ? 220 : (kind === 'rusher' ? 90 : 100);
    this.alive = true;
    this.state = 'patrol';          // patrol | combat | search
    this.alertT = 0;
    this.lastKnown = new THREE.Vector3();
    this.moveTarget = new THREE.Vector3(x, 0, z);
    this.repathT = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = rand(1, 2.5);
    this.burstLeft = 0;
    this.shotT = 0;
    this.burstCd = kind === 'sniper' ? rand(1.8, 2.8)
      : kind === 'rusher' ? rand(0.6, 1.2)
      : kind === 'elite' ? rand(0.8, 1.4)
      : rand(0.8, 1.6);
    this.crouched = kind === 'sniper';
    this.walkPhase = rand(0, 6);
    this.speed = 0;
    this.deathT = 0;
    this.fallDir = Math.random() < 0.5 ? 1 : -1;
    this.removeT = 0;
    this.suppressT = 0;
    this.target = null;
    this.coverT = 0;
    this.nadeFleeT = 0;
    this.retreatT = 0;
    this.flankT = 0;
    this.reloadCueT = 0;
    this.respawnT = 0;
    this.pendingRespawn = false;
    this.spawnProtT = game.mode === 'tdm' ? 2 : 0;
    this.stuckT = 0;
  }

  /** 壁に貼り付いたら横＋後ろへ目標を付け替え、戦闘中は短く flank */
  onStuck(blockedX, blockedZ) {
    this.stuckT = 0;
    this.strafeDir *= -1;
    this.strafeT = rand(0.6, 1.4);
    const side = Math.random() < 0.5 ? 1 : -1;
    const d = AiSteer.stuckRepathDelta(blockedX, blockedZ, side, rand(2, 5), rand(5, 12));
    this.moveTarget.set(
      clamp(this.pos.x + d.x, -54, 54), 0,
      clamp(this.pos.z + d.z, -54, 54));
    this.repathT = rand(2, 4);
    if (this.state === 'combat') this.flankT = rand(0.9, 1.7);
    if (this.retreatT > 0) this.retreatT = Math.max(this.retreatT, 0.9);
  }

  /** 脅威から見て遮蔽の裏側へ退避点を選ぶ */
  pickRetreatPoint(threatPos) {
    const away = new THREE.Vector3().subVectors(this.pos, threatPos);
    away.y = 0;
    if (away.lengthSq() < 0.01) away.set(rand(-1, 1), 0, rand(-1, 1));
    away.normalize();

    let best = null;
    let bestScore = -1e9;
    if (typeof colliders !== 'undefined') {
      for (const c of colliders) {
        if (!c || c.hy < 0.55 || c.hx > 20 || c.hz > 20) continue;
        const dx = c.cx - this.pos.x, dz = c.cz - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 2.5 || d > 16) continue;
        const fromThreat = new THREE.Vector3(c.cx - threatPos.x, 0, c.cz - threatPos.z);
        if (fromThreat.lengthSq() < 0.01) continue;
        fromThreat.normalize();
        const hx = Math.max(c.hx, 0.6) + 1.35;
        const hz = Math.max(c.hz, 0.6) + 1.35;
        const px = clamp(c.cx + fromThreat.x * hx, -54, 54);
        const pz = clamp(c.cz + fromThreat.z * hz, -54, 54);
        const toThreat = Math.hypot(px - threatPos.x, pz - threatPos.z);
        const score = toThreat * 1.2 - d * 0.35 + c.hy * 0.8;
        if (score > bestScore) {
          bestScore = score;
          best = { x: px, z: pz };
        }
      }
    }
    if (best) return best;
    return {
      x: clamp(this.pos.x + away.x * rand(8, 13), -54, 54),
      z: clamp(this.pos.z + away.z * rand(8, 13), -54, 54),
    };
  }

  /** 被弾時: 自分は遮蔽へ、近くの味方は回り込み */
  onDamagedBy(killer) {
    const threat = (killer && killer.pos) ? killer.pos : player.pos;
    this.retreatT = this.kind === 'rusher' ? rand(0.7, 1.3) : rand(1.5, 2.6);
    const rp = this.pickRetreatPoint(threat);
    this.moveTarget.set(rp.x, 0, rp.z);
    this.flankT = 0;

    for (const e of enemies) {
      if (e === this || !e.alive || e.team !== this.team) continue;
      if (e.retreatT > 0 || e.flankT > 0 || e.nadeFleeT > 0) continue;
      if (e.pos.distanceTo(this.pos) > 24) continue;
      if (e.state !== 'combat' && Math.random() > 0.4) continue;
      if (Math.random() > 0.6) continue;
      e.flankT = rand(2.2, 3.8);
      const toThreat = new THREE.Vector3().subVectors(threat, e.pos);
      toThreat.y = 0;
      const len = toThreat.length() || 1;
      toThreat.multiplyScalar(1 / len);
      const side = Math.random() < 0.5 ? 1 : -1;
      const px = -toThreat.z * side * rand(9, 15);
      const pz = toThreat.x * side * rand(9, 15);
      const ax = toThreat.x * rand(3, 9);
      const az = toThreat.z * rand(3, 9);
      e.moveTarget.set(
        clamp(e.pos.x + px + ax, -54, 54), 0,
        clamp(e.pos.z + pz + az, -54, 54));
      e.state = 'combat';
      e.lastKnown.copy(threat);
    }
  }

  audioPanToPlayer() {
    const rel = new THREE.Vector3().subVectors(this.pos, player.pos);
    const len = rel.length();
    if (len < 0.01) return 0;
    rel.multiplyScalar(1 / len);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    return clamp(rel.dot(right), -1, 1) * 0.85;
  }

  eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + (this.crouched ? 1.25 : 1.58), this.pos.z);
  }

  foeTeam() {
    return this.team === 'blue' ? 'red' : 'blue';
  }

  /** 視線が通るか（目標ワールド座標） */
  canSeePoint(targetPos, eyeY = 1.4) {
    const eye = this.eyePos();
    const tp = new THREE.Vector3(targetPos.x, targetPos.y + eyeY, targetPos.z);
    const d = tp.clone().sub(eye);
    const dist = d.length();
    if (dist > 90) return false;
    d.normalize();
    const rc = new THREE.Raycaster(eye, d, 0.1, dist);
    const block = rc.intersectObjects(worldMeshes, false);
    return block.length === 0;
  }

  canSeePlayer() {
    if (!player.alive) return false;
    const myTeam = (game.online && typeof Online !== 'undefined' && Online.getMyTeam)
      ? Online.getMyTeam() : 'blue';
    if (this.team === myTeam) return false;
    return this.canSeePoint(player.pos, player.eyeH * 0.85);
  }

  pickTarget() {
    let best = null;
    let bestD = 1e9;
    const foe = this.foeTeam();
    const myTeam = (game.online && typeof Online !== 'undefined' && Online.getMyTeam)
      ? Online.getMyTeam() : 'blue';

    if (foe === myTeam && player.alive) {
      const d = this.pos.distanceTo(player.pos);
      if (d < bestD && (this.canSeePlayer() || d < 18)) {
        best = { type: 'player', pos: player.pos, d };
        bestD = d;
      }
    }

    for (const e of enemies) {
      if (!e.alive || e === this || e.team !== foe) continue;
      const d = this.pos.distanceTo(e.pos);
      if (d >= bestD) continue;
      if (this.canSeePoint(e.pos) || d < 18) {
        best = { type: 'ai', unit: e, pos: e.pos, d };
        bestD = d;
      }
    }

    // オンライン: 敵チームの人間（リモート）も狙う
    if (game.online && typeof Online !== 'undefined' && Online.getRemotes) {
      for (const [id, r] of Online.getRemotes()) {
        if (!r.alive || r.team !== foe) continue;
        const d = this.pos.distanceTo(r.pos);
        if (d >= bestD) continue;
        if (this.canSeePoint(r.pos) || d < 18) {
          best = { type: 'remote', id, pos: r.pos, d };
          bestD = d;
        }
      }
    }
    return best;
  }

  hearShot(fromPos) {
    if (!this.alive || this.state === 'combat') return;
    const dist = this.pos.distanceTo(fromPos);
    if (dist > 70) return;
    const err = dist * 0.18;
    this.state = 'search';
    this.lastKnown.set(
      clamp(fromPos.x + rand(-err, err), -55, 55), 0,
      clamp(fromPos.z + rand(-err, err), -55, 55));
    this.moveTarget.copy(this.lastKnown);
    this.repathT = 0;
  }

  /** 近くのグレネードから逃げる */
  fleeGrenades() {
    for (const g of grenades) {
      const d = this.pos.distanceTo(g.m.position);
      if (d < 11 && g.fuse < 1.6) {
        const away = this.pos.clone().sub(g.m.position);
        away.y = 0;
        if (away.lengthSq() < 0.01) away.set(rand(-1, 1), 0, rand(-1, 1));
        away.normalize();
        this.nadeFleeT = 1.2;
        this.moveTarget.set(
          clamp(this.pos.x + away.x * 10, -54, 54), 0,
          clamp(this.pos.z + away.z * 10, -54, 54));
        return true;
      }
    }
    return false;
  }

  update(dt) {
    if (this.pendingRespawn) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.doRespawn();
      return;
    }

    if (!this.alive) {
      this.deathT += dt;
      const k = Math.min(this.deathT / 0.45, 1);
      this.g.rotation.x = this.fallDir * (Math.PI / 2) * (k * k * (3 - 2 * k));
      this.removeT += dt;
      if (game.mode === 'tdm') {
        // TDM は死体を早めに消してリスポーン待ちへ
        if (this.removeT > 2.2) {
          this.g.visible = false;
          this.pendingRespawn = true;
          this.respawnT = 2.5;
        }
        return;
      }
      if (this.removeT > 6) {
        this.g.position.y = -(this.removeT - 6) * 0.35;
        if (this.removeT > 9) this.destroy();
      }
      return;
    }

    if (this.nadeFleeT > 0) this.nadeFleeT -= dt;
    if (this.retreatT > 0) this.retreatT -= dt;
    if (this.flankT > 0) this.flankT -= dt;
    if (this.reloadCueT > 0) this.reloadCueT -= dt;
    if (this.spawnProtT > 0) this.spawnProtT = Math.max(0, this.spawnProtT - dt);
    if (this.protAura) {
      const on = this.alive && this.spawnProtT > 0;
      this.protAura.visible = on;
      if (on) {
        this.protAura.material.opacity = 0.14 + 0.12 * (0.5 + 0.5 * Math.sin(game.time * 9));
        const s = 1 + 0.04 * Math.sin(game.time * 7);
        this.protAura.scale.set(s, 1.05 + 0.03 * Math.sin(game.time * 5), s);
      }
    }
    this.fleeGrenades();

    const tgt = this.pickTarget();
    this.target = tgt;
    const sees = !!(tgt && (tgt.type === 'player' ? this.canSeePlayer() : this.canSeePoint(tgt.pos)));
    const dist = tgt ? tgt.d : 999;

    if (sees && tgt) {
      this.lastKnown.copy(tgt.pos);
      if (this.state !== 'combat') {
        this.state = 'combat';
        // 狙撃は予兆のため遅め。Survival も全体的に反応を速く
        if (this.kind === 'sniper') this.alertT = rand(0.9, 1.6);
        else if (this.kind === 'rusher') this.alertT = rand(0.15, 0.35);
        else if (this.kind === 'elite') this.alertT = rand(0.2, 0.45);
        else this.alertT = game.mode === 'tdm' ? rand(0.25, 0.55) : rand(0.28, 0.6);
      }
      this.suppressT = 0;
    } else if (this.state === 'combat') {
      this.suppressT += dt;
      if (this.suppressT > 4.5) {
        this.state = 'search';
        this.moveTarget.copy(this.lastKnown);
        this.suppressT = 0;
      }
    }

    let moveX = 0, moveZ = 0;
    let wantSpeed = 0;

    if (this.nadeFleeT > 0) {
      const toT = new THREE.Vector3().subVectors(this.moveTarget, this.pos);
      const dT = toT.length() || 1;
      moveX = toT.x / dT; moveZ = toT.z / dT;
      wantSpeed = 6.2;
      this.faceTowards(this.moveTarget, dt, 8);
    } else if (this.retreatT > 0) {
      const toT = new THREE.Vector3().subVectors(this.moveTarget, this.pos);
      const dT = toT.length();
      const face = (tgt && tgt.pos) || this.lastKnown;
      if (dT > 1.15) {
        moveX = toT.x / dT; moveZ = toT.z / dT;
        wantSpeed = this.kind === 'rusher' ? 6.4 : 5.6;
        this.crouched = false;
      } else {
        this.crouched = this.kind !== 'rusher';
        wantSpeed = 0;
        if (this.alertT <= 0 && sees) this.updateFire(dt, dist, tgt);
      }
      this.faceTowards(face, dt, 7);
    } else if (this.flankT > 0) {
      const toT = new THREE.Vector3().subVectors(this.moveTarget, this.pos);
      const dT = toT.length();
      if (dT > 1.4) {
        moveX = toT.x / dT; moveZ = toT.z / dT;
        wantSpeed = this.kind === 'rusher' ? 6.2 : 4.8;
      } else {
        this.flankT = 0;
      }
      this.crouched = false;
      if (tgt) {
        this.faceTowards(tgt.pos, dt, 7);
        if (this.alertT <= 0 && sees) this.updateFire(dt, dist, tgt);
      } else {
        this.faceTowards(this.moveTarget, dt, 5);
      }
    } else if (this.state === 'combat' && tgt) {
      this.alertT -= dt;
      const toTgt = new THREE.Vector3().subVectors(tgt.pos, this.pos);
      const fwdX = toTgt.x / (dist || 1), fwdZ = toTgt.z / (dist || 1);
      let adv = 0;
      if (this.kind === 'sniper') {
        if (dist > 52) adv = 1; else if (dist < 28) adv = -1;
      } else if (this.kind === 'rusher') {
        if (dist > 14) adv = 1; else if (dist < 3.5) adv = -1;
      } else if (this.kind === 'elite') {
        if (dist > 28) adv = 1; else if (dist < 10) adv = -1;
      } else {
        if (dist > 32) adv = 1; else if (dist < 9) adv = -1;
      }

      // 遮蔽へ寄る：見通しが悪いときは前進、開いているときはストレイフ優先
      this.coverT -= dt;
      if (!sees && this.coverT <= 0 && this.kind !== 'rusher') {
        this.coverT = rand(1.2, 2.4);
        this.moveTarget.set(
          clamp(tgt.pos.x + rand(-8, 8), -54, 54), 0,
          clamp(tgt.pos.z + rand(-8, 8), -54, 54));
      }

      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeDir *= -1; this.strafeT = rand(0.8, 2.2); }
      const strafeAmt = this.kind === 'sniper' ? 0.25
        : this.kind === 'rusher' ? 0.35
        : (adv === 0 ? 1 : 0.45);
      moveX = fwdX * adv + -fwdZ * this.strafeDir * strafeAmt;
      moveZ = fwdZ * adv + fwdX * this.strafeDir * strafeAmt;
      if (this.kind === 'sniper') wantSpeed = adv !== 0 ? 2.4 : 1.2;
      else if (this.kind === 'rusher') wantSpeed = adv !== 0 ? 6.5 : 4.0;
      else if (this.kind === 'elite') wantSpeed = adv !== 0 ? 3.1 : 1.7;
      else wantSpeed = adv !== 0 ? (game.mode === 'tdm' ? 5.0 : 4.6) : 2.8;
      if (this.kind === 'sniper') {
        this.crouched = adv === 0;
      } else if (this.kind !== 'rusher') {
        this.crouched = adv === 0 && Math.random() < 0.003 ? !this.crouched : this.crouched;
      } else {
        this.crouched = false;
      }

      if (this.alertT <= 0 && sees) this.updateFire(dt, dist, tgt);
      this.faceTowards(tgt.pos, dt, 7);
    } else {
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

    const ml = Math.hypot(moveX, moveZ);
    if (ml > 0.01) {
      moveX /= ml; moveZ /= ml;
      this.speed = lerp(this.speed, wantSpeed, 1 - Math.exp(-8 * dt));
    } else {
      this.speed = lerp(this.speed, 0, 1 - Math.exp(-10 * dt));
    }
    const beforeX = this.pos.x, beforeZ = this.pos.z;
    const vel = { x: moveX * this.speed, z: moveZ * this.speed };
    this.pos.x += vel.x * dt;
    this.pos.z += vel.z * dt;
    // プレイヤー同様、壁法線への食い込み速度を切ってスライドさせる
    resolveCollision(this.pos, 0.34, 1.7, vel);
    const dx = this.pos.x - beforeX;
    const dz = this.pos.z - beforeZ;
    const intendedDist = Math.hypot(moveX * this.speed * dt, moveZ * this.speed * dt);
    const progressAlong = intendedDist > 1e-6
      ? (dx * moveX + dz * moveZ) / intendedDist
      : 1;
    this.stuckT = AiSteer.updateStuckTimer(this.stuckT, dt, {
      speed: this.speed,
      intendedDist,
      progressAlong,
    });
    if (AiSteer.shouldRepathFromStuck(this.stuckT) && ml > 0.01) {
      this.onStuck(moveX, moveZ);
    }
    this.g.position.copy(this.pos);

    if (this.speed > 0.3) {
      const prev = Math.sin(this.walkPhase);
      this.walkPhase += this.speed * dt * 2.4;
      const cur = Math.sin(this.walkPhase);
      const sw = cur * 0.55 * clamp(this.speed / 4, 0, 1);
      this.legL.rotation.x = sw;
      this.legR.rotation.x = -sw;
      // 敵足音（距離減衰・パン）
      if (prev >= 0 && cur < 0 && player.alive) {
        const d = this.pos.distanceTo(player.pos);
        if (d < 38) {
          AudioSys.enemyStep(d, this.audioPanToPlayer(), this.speed > 4.2);
        }
      }
    } else {
      this.legL.rotation.x = lerp(this.legL.rotation.x, 0, 1 - Math.exp(-10 * dt));
      this.legR.rotation.x = lerp(this.legR.rotation.x, 0, 1 - Math.exp(-10 * dt));
    }
    const targetY = this.crouched ? -0.32 : 0;
    this.torso.position.y = lerp(this.torso.position.y, 0.95 + targetY, 1 - Math.exp(-8 * dt));
    this.flash.material.opacity *= Math.exp(-25 * dt);
  }

  faceTowards(target, dt, rate) {
    const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    let diff = want - this.g.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.g.rotation.y += diff * (1 - Math.exp(-rate * dt));
  }

  updateFire(dt, dist, tgt) {
    this.shotT -= dt;
    if (this.kind === 'sniper') {
      this.burstCd -= dt;
      if (this.burstCd <= 0 && this.shotT <= 0) {
        this.fireOne(dist, tgt);
        this.burstCd = rand(2.4, 3.8);
        this.shotT = 0.15;
        this.cueEnemyReload(dist);
      }
      return;
    }
    if (this.burstLeft > 0) {
      if (this.shotT <= 0) {
        this.fireOne(dist, tgt);
        this.burstLeft--;
        this.shotT = 60 / 680;
        if (this.burstLeft <= 0) this.cueEnemyReload(dist);
      }
    } else {
      this.burstCd -= dt;
      if (this.burstCd <= 0) {
        this.burstLeft = this.kind === 'rusher' ? 4 + (Math.random() * 3 | 0)
          : this.kind === 'elite' ? 4 + (Math.random() * 2 | 0)
          : 3 + (Math.random() * 3 | 0);
        this.burstCd = game.mode === 'tdm' ? rand(1.1, 2.2)
          : this.kind === 'rusher' ? rand(0.9, 1.6)
          : rand(1.2, 2.4);
      }
    }
  }

  cueEnemyReload(dist) {
    if (!player.alive || this.reloadCueT > 0) return;
    const d = Number.isFinite(dist) ? dist : this.pos.distanceTo(player.pos);
    if (d > 32) return;
    this.reloadCueT = 1.6;
    AudioSys.enemyReload(d, this.audioPanToPlayer());
  }

  fireOne(dist, tgt) {
    this.flash.material.opacity = 0.9;
    this.flash.material.rotation = rand(0, 6.28);
    const mw = this.muzzle.getWorldPosition(new THREE.Vector3());

    const aimPos = tgt ? tgt.pos : player.pos;
    const rel = new THREE.Vector3().subVectors(this.pos, aimPos);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const pan = clamp(rel.normalize().dot(right), -1, 1) * 0.8;
    AudioSys.enemyShot(dist, pan);
    // オンライン bot: 他クライアントへ射撃 FX を配信（自分はローカルで出す）
    const onlineBot = !!(game.online && this.netId && typeof Online !== 'undefined');
    if (onlineBot) {
      Online.notifyBotFire(this.netId, this.kind === 'sniper' ? 'sniper' : 'assault');
    }

    const tdm = game.mode === 'tdm';
    let p;
    if (this.kind === 'sniper') {
      // 予兆を残すため初弾命中は抑えめ
      p = clamp(0.28 - dist * 0.002, 0.08, 0.32);
    } else if (tdm) {
      p = clamp(0.34 - dist * 0.0032, 0.08, 0.34);
    } else {
      // Survival: 以前より命中を上げる
      p = clamp(0.34 - dist * 0.0032, 0.07, 0.34);
    }
    if (this.kind === 'rusher') p *= dist < 16 ? 1.3 : 0.65;
    if (this.kind === 'elite') p *= 1.25;
    p *= (game.accMul || 1);
    if (tgt && tgt.type === 'player') {
      if (player.crouching) p *= 0.7;
      if (player.sprinting) p *= 0.6;
    }
    if (this.speed > 1) p *= this.kind === 'rusher' ? 0.85 : 0.65;
    const stillSees = tgt && (tgt.type === 'player' ? this.canSeePlayer() : this.canSeePoint(tgt.pos));
    if (!stillSees) p = 0;

    const chestY = tgt && tgt.type !== 'player' ? 1.35 : (player.eyeH * 0.8);
    const chest = new THREE.Vector3(aimPos.x, aimPos.y + chestY, aimPos.z);
    let aim;
    if (Math.random() < p) {
      aim = chest.clone().add(new THREE.Vector3(rand(-0.08, 0.08), rand(-0.08, 0.08), rand(-0.08, 0.08)));
      if (onlineBot) {
        // オンライン bot: ダメージはサーバー権威。命中した事実だけ送る
        const w = this.kind === 'sniper' ? 'sniper' : 'assault';
        let targetId = null;
        if (tgt && tgt.type === 'player') {
          targetId = (typeof Net !== 'undefined' && Net.getState().selfId) || null;
        } else if (tgt && tgt.type === 'remote') {
          targetId = tgt.id;
        } else if (tgt && tgt.type === 'ai' && tgt.unit && tgt.unit.netId) {
          targetId = tgt.unit.netId;
        }
        if (targetId) Online.claimBotHit(this.netId, targetId, 'torso', w);
      } else {
        let dmg;
        if (tdm) {
          // プレイヤーと同装備ダメージ（アサルト胴 / 砂胴95）
          dmg = this.kind === 'sniper' ? WEAPON_DEFS.sniper.dmg.torso : WEAPON_DEFS.assault.dmg.torso;
        } else if (this.kind === 'elite') {
          dmg = rand(14, 20) * (dist > 40 ? 0.8 : 1);
        } else if (this.kind === 'sniper') {
          dmg = rand(24, 34);
        } else {
          dmg = rand(9, 14) * (dist > 40 ? 0.75 : 1);
        }
        if (tgt && tgt.type === 'player') {
          damagePlayer(dmg, this.pos);
        } else if (tgt && tgt.type === 'ai' && tgt.unit.alive) {
          const dir = aim.clone().sub(mw).normalize();
          tgt.unit.hit(dmg, 'torso', aim, dir, this);
        }
      }
      spawnTracer(mw, aim, this.kind === 'sniper' ? 0xff8866 : 0xffc07a);
    } else {
      const missScale = this.kind === 'sniper' ? rand(0.35, 1.4) : rand(0.5, 2.2);
      const off = new THREE.Vector3(rand(-1, 1), rand(-0.4, 1), rand(-1, 1)).normalize().multiplyScalar(missScale);
      aim = chest.clone().add(off);
      const dir = aim.clone().sub(mw).normalize();
      const rc = new THREE.Raycaster(mw, dir, 0.1, 160);
      const hits = rc.intersectObjects(worldMeshes, false);
      const end = hits.length ? hits[0].point : mw.clone().addScaledVector(dir, 160);
      if (hits.length) impactFX(end);
      spawnTracer(mw, end, this.kind === 'sniper' ? 0xff8866 : 0xffc07a);
      if (tgt && tgt.type === 'player') {
        const head = new THREE.Vector3(player.pos.x, player.pos.y + player.eyeH, player.pos.z);
        if (distToSegment(head, mw, end) < 1.6) AudioSys.crack(pan);
      }
    }
  }

  hit(dmg, part, point, dir, killer, src) {
    if (!this.alive) return;
    if (this.spawnProtT > 0) return;
    this.hp -= dmg;
    bloodFX(point, dir);
    if (this.hp <= 0) {
      this.die(part === 'head', killer, src);
    } else {
      this.state = 'combat';
      if (killer && killer.pos) this.lastKnown.copy(killer.pos);
      else if (this.team !== 'blue') this.lastKnown.copy(player.pos);
      this.alertT = Math.min(this.alertT, 0.25);
      // 被弾で遮蔽退避＋近くの味方が回り込み
      if (this.team !== 'blue' || (killer && killer !== player)) {
        this.onDamagedBy(killer || player);
      }
    }
  }

  die(headshot, killer, src) {
    this.alive = false;
    this.hp = 0;
    this.deathT = 0;
    this.removeT = 0;
    this.g.visible = true;

    const killerIsPlayer = !killer || killer === player || killer.type === 'player';

    const recordPlayerKill = () => {
      game.kills++;
      if (headshot) game.headshots++;
      const kd = this.pos.distanceTo(player.pos);
      if (kd > (game.longestKill || 0)) game.longestKill = kd;
      if (src && src.grenade) game.grenadeKills = (game.grenadeKills || 0) + 1;
    };

    if (game.mode === 'tdm') {
      if (this.team === 'red') {
        game.tdm.blueKills++;
      } else {
        game.tdm.redKills++;
      }
      if (killerIsPlayer && this.team === 'red') {
        recordPlayerKill();
        const pts = headshot ? 150 : 100;
        game.score += pts;
        addKillfeed(headshot ? `ヘッドショット ＋${pts}` : `敵排除 ＋${pts}`, headshot, 'red');
        if (typeof showKillToast === 'function') showKillToast();
        spawnFloater(headshot ? `HEADSHOT +${pts}` : `+${pts}`, headshot);
        updateScoreHUD();
      } else {
        const label = this.team === 'red'
          ? (headshot ? '味方撃破 (HS)' : '味方撃破')
          : (headshot ? '味方戦死 (HS)' : '味方戦死');
        addKillfeed(label, headshot, this.team === 'red' ? 'red' : 'blue');
      }
      updateTdmHUD();
      // TDM: 撃破ドロップは常に弾/キット/グレ
      tdmDrop(this.pos);
      rebuildHitMeshes();
      return;
    }

    // サバイバル
    recordPlayerKill();
    const base = this.kind === 'elite' ? 250
      : this.kind === 'sniper' ? 180
      : this.kind === 'rusher' ? 120
      : 100;
    const pts = headshot ? base + 50 : base;
    game.score += pts;
    const name = this.kind === 'elite' ? '精鋭'
      : this.kind === 'sniper' ? '狙撃兵'
      : this.kind === 'rusher' ? '突撃兵'
      : '敵兵';
    const label = headshot ? `${name}ヘッド ＋${pts}` : `${name}排除 ＋${pts}`;
    addKillfeed(label, headshot, 'red');
    if (typeof showKillToast === 'function') showKillToast();
    spawnFloater(headshot ? `HEADSHOT +${pts}` : `+${pts}`, headshot);
    updateScoreHUD();
    rebuildHitMeshes();
    if (this.kind === 'sniper') spawnLoot(this.pos, 'sniper');
    else if (this.kind === 'elite' && !player.armor) spawnLoot(this.pos, 'armor');
    else maybeDrop(this.pos);
    checkWaveCleared();
  }

  doRespawn() {
    const sp = pickTdmSpawn(this.team);
    this.pos.set(sp[0], 0, sp[1]);
    this.g.position.copy(this.pos);
    this.g.rotation.set(0, Math.atan2(-sp[0], -sp[1]), 0);
    this.g.visible = true;
    this.hp = 100;
    this.alive = true;
    this.pendingRespawn = false;
    this.state = 'patrol';
    this.alertT = 0;
    this.deathT = 0;
    this.removeT = 0;
    this.burstLeft = 0;
    this.burstCd = rand(0.8, 1.6);
    this.moveTarget.copy(this.pos);
    this.spawnProtT = 2;
    rebuildHitMeshes();
    // オンライン bot はサーバーへ復活を通知（サーバーが alive を戻す）
    if (game.online && this.netId && typeof Online !== 'undefined') {
      Online.notifyBotRespawn(this.netId);
    }
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
  // オンラインの bot（netId 持ち）はサーバー権威で判定する
  if (game.online && enemy.netId && typeof Online !== 'undefined') {
    if (enemy.team === Online.getMyTeam()) return; // 味方撃ち無効
    if (enemy.spawnProtT > 0) return;
    Online.claimHit(enemy.netId, part);
    return;
  }
  if (enemy.team === 'blue') return; // 味方撃ち無効
  if (enemy.spawnProtT > 0) return;
  game.hits++;
  const def = activeDef();
  const base = (def.dmg && def.dmg[part]) || 30;
  const dist = point.distanceTo(camera.position);
  const dmg = Math.max(1, Math.round(base * weaponDamageMul(def, dist)));
  const willKill = enemy.hp - dmg <= 0;
  AudioSys.hitmark(willKill);
  if (part === 'head') AudioSys.headshot();
  showHitmarker(willKill);
  enemy.hit(dmg, part, point, dir, player);
}

/* ---------- ドロップ ---------- */
const loots = [];
let ammoMat, medMat, sniperMat, nadeLootMat, armorMat;

/** マップ中央の取り合い補給（TDM専用の箱＋定期湧き。Survivalはクリア時ドロップのみ） */
const SUPPLY_POS = { x: 0, z: 0 };
let supplyMesh = null;
let supplyNext = 99999;
const supplyColliders = [];

function ensureSupplyCrate() {
  if (supplyMesh || typeof scene === 'undefined') return;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.9, 1.55), MAT.metalGreen);
  body.position.y = 0.45;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.12, 1.62), MAT.metalGrey);
  lid.position.y = 0.96;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.16, 0.22), MAT.metalRed);
  stripe.position.set(0, 0.52, 0);
  markDecor(stripe);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.1, 6), MAT.darkMetal);
  pole.position.set(0.62, 1.45, 0.62);
  markDecor(pole);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.03), MAT.metalRed);
  flag.position.set(0.9, 2.25, 0.62);
  markDecor(flag);
  g.add(body); g.add(lid); g.add(stripe); g.add(pole); g.add(flag);
  g.position.set(SUPPLY_POS.x, 0, SUPPLY_POS.z);
  g.userData.isSupplyCrate = true;
  scene.add(g);
  g.updateMatrixWorld(true);
  g.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.userData.isSupplyCrate = true;
    worldMeshes.push(o);
    if (!o.userData.noCollide) {
      const before = colliders.length;
      pushMeshCollider(o);
      for (let i = before; i < colliders.length; i++) supplyColliders.push(colliders[i]);
    }
  });
  supplyMesh = g;
}

function removeSupplyCrate() {
  if (!supplyMesh) return;
  scene.remove(supplyMesh);
  const meshSet = new Set();
  supplyMesh.traverse(o => { if (o.isMesh) meshSet.add(o); });
  for (let i = worldMeshes.length - 1; i >= 0; i--) {
    if (meshSet.has(worldMeshes[i])) worldMeshes.splice(i, 1);
  }
  for (const c of supplyColliders) {
    const idx = colliders.indexOf(c);
    if (idx >= 0) colliders.splice(idx, 1);
  }
  supplyColliders.length = 0;
  supplyMesh = null;
}

function dropSupplyBundle(announce) {
  // Survival クリア時は箱なしで中央に物資だけ。TDM は箱あり×2＋たまに防具
  if (game.mode === 'tdm') ensureSupplyCrate();
  const p = new THREE.Vector3(SUPPLY_POS.x, 0, SUPPLY_POS.z);
  const copies = game.mode === 'tdm' ? 2 : 1;
  for (let i = 0; i < copies; i++) {
    spawnLoot(p, 'ammo');
    spawnLoot(p, 'nade');
    if (Math.random() < 0.55) spawnLoot(p, 'med');
  }
  if (game.mode === 'tdm' && Math.random() < 0.22) {
    spawnLoot(p, 'armor');
  }
  if (announce !== false) {
    spawnFloater(game.mode === 'tdm' ? '中央補給' : 'ステージ補給', false);
  }
}

function resetSupply() {
  if (game.mode === 'tdm') {
    ensureSupplyCrate();
    supplyNext = 3;
  } else {
    removeSupplyCrate();
    supplyNext = 99999;
  }
}

function updateSupply(dt) {
  if (game.state !== 'playing' || game.mode !== 'tdm') return;
  if (game.online) return; // オンラインは Room DO が補給を権威化
  ensureSupplyCrate();
  supplyNext -= dt;
  if (supplyNext > 0) return;
  dropSupplyBundle(true);
  supplyNext = 42;
}

function initLoot() {
  ammoMat = new THREE.MeshLambertMaterial({ color: 0x4a5b2e });
  ammoMat.color.convertSRGBToLinear();
  const mc = document.createElement('canvas');
  mc.width = mc.height = 64;
  const c2 = mc.getContext('2d');
  c2.fillStyle = '#ddd'; c2.fillRect(0, 0, 64, 64);
  c2.fillStyle = '#c22'; c2.fillRect(26, 10, 12, 44); c2.fillRect(10, 26, 44, 12);
  medMat = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(mc) });
  sniperMat = new THREE.MeshLambertMaterial({ color: 0x2a3a4a });
  sniperMat.color.convertSRGBToLinear();
  nadeLootMat = new THREE.MeshLambertMaterial({ color: 0x3d4f28 });
  nadeLootMat.color.convertSRGBToLinear();
  armorMat = new THREE.MeshLambertMaterial({ color: 0x4a6a7a });
  armorMat.color.convertSRGBToLinear();
}
function maybeDrop(pos) {
  const r = Math.random();
  if (r < 0.42) spawnLoot(pos, 'ammo');
  else if (r < 0.62) spawnLoot(pos, 'med');
  else if (r < 0.82) spawnLoot(pos, 'nade');
}
function tdmDrop(pos) {
  if (game.online) return; // 死亡ドロップはサーバー
  const r = Math.random();
  if (r < 0.4) spawnLoot(pos, 'ammo');
  else if (r < 0.7) spawnLoot(pos, 'med');
  else spawnLoot(pos, 'nade');
}
function spawnLootAt(pos, type, opts) {
  let geo, mat, y = 0.12;
  if (type === 'sniper') {
    geo = new THREE.BoxGeometry(0.7, 0.12, 0.16);
    mat = sniperMat;
    y = 0.18;
  } else if (type === 'armor') {
    geo = new THREE.BoxGeometry(0.42, 0.28, 0.36);
    mat = armorMat;
    y = 0.2;
  } else if (type === 'ammo') {
    geo = new THREE.BoxGeometry(0.32, 0.2, 0.32);
    mat = ammoMat;
  } else if (type === 'nade') {
    geo = new THREE.SphereGeometry(0.14, 8, 6);
    mat = nadeLootMat;
    y = 0.16;
  } else {
    geo = new THREE.BoxGeometry(0.32, 0.2, 0.32);
    mat = medMat;
  }
  const m = new THREE.Mesh(geo, mat);
  const jitter = !(opts && opts.jitter === false);
  m.position.set(
    pos.x + (jitter ? rand(-0.5, 0.5) : 0),
    y,
    pos.z + (jitter ? rand(-0.5, 0.5) : 0),
  );
  m.castShadow = true;
  scene.add(m);
  const entry = {
    m, type, t: 0, baseY: y, maxSaid: false,
    netId: opts && opts.netId ? opts.netId : null,
  };
  loots.push(entry);
  return entry;
}
function spawnLoot(pos, type) {
  return spawnLootAt(pos, type, null);
}
function updateLoot(dt) {
  for (let i = loots.length - 1; i >= 0; i--) {
    const l = loots[i];
    l.t += dt;
    l.m.rotation.y += dt * 1.5;
    l.m.position.y = l.baseY + Math.sin(l.t * 3) * 0.03;
    if (!l.netId && l.t > 25) {
      l.m.visible = Math.sin(l.t * 10) > 0;
      if (l.t > 30) { scene.remove(l.m); loots.splice(i, 1); continue; }
    }
    const d = l.m.position.distanceTo(player.pos);
    if (d < 1.3 && player.alive) {
      if (l.netId && game.online && typeof Online !== 'undefined') {
        if (!l.claiming) {
          l.claiming = true;
          Online.claimLoot(l.netId);
          setTimeout(() => { l.claiming = false; }, 450);
        }
        continue;
      }
      let picked = false;
      if (l.type === 'ammo') {
        const amount = game.mode === 'tdm' ? 45 : 90;
        if (addReserveAmmo(amount)) {
          picked = true;
          spawnFloater(game.mode === 'tdm' ? '弾薬 +45' : '弾薬 +90', false);
        } else if (!l.maxSaid) {
          l.maxSaid = true;
          spawnFloater('弾薬 MAX', false);
        }
      } else if (l.type === 'sniper') {
        grantSniper();
        picked = true;
      } else if (l.type === 'armor') {
        grantArmor();
        picked = true;
      } else if (l.type === 'nade') {
        if (addGrenades(1)) {
          picked = true;
          spawnFloater('グレネード +1', false);
        } else if (!l.maxSaid) {
          l.maxSaid = true;
          spawnFloater('グレネード MAX', false);
        }
      } else if (l.type === 'med') {
        if (addMedkits(1)) {
          picked = true;
          spawnFloater('応急キット +1', false);
        } else if (!l.maxSaid) {
          l.maxSaid = true;
          spawnFloater('応急キット MAX', false);
        }
      }
      if (picked) {
        AudioSys.pickup();
        scene.remove(l.m);
        loots.splice(i, 1);
        updateAmmoHUD();
      }
    } else if (d >= 1.8) {
      // 離れたら MAX 表示を再度出せるようにする（キット使用後など）
      l.maxSaid = false;
    }
  }
}

/* ---------- ウェーブ管理（SURVIVAL・5ステージ） ---------- */
const SURVIVAL_MAX = 5;
const STAGE_DEFS = {
  1: {
    title: 'STAGE 1 ― 接触',
    sub: '敵歩兵接近 ― 迎撃せよ',
    concurrent: 4,
    queue: ['grunt', 'grunt', 'grunt', 'grunt', 'grunt'],
    fog: BASE_FOG_DENSITY, dim: false, accMul: 1.05,
  },
  2: {
    title: 'STAGE 2 ― 狙撃線',
    sub: '狙撃兵確認 ― 遮蔽を使え',
    concurrent: 5,
    queue: ['grunt', 'grunt', 'sniper', 'grunt', 'grunt', 'sniper', 'grunt'],
    fog: BASE_FOG_DENSITY, dim: false, accMul: 1.15,
  },
  3: {
    title: 'STAGE 3 ― 強襲',
    sub: '精鋭確認 ― 防具を確保せよ',
    concurrent: 5,
    queue: [
      'rusher', 'grunt', 'rusher', 'elite', 'grunt',
      'rusher', 'grunt', 'rusher', 'sniper',
    ],
    fog: BASE_FOG_DENSITY, dim: false, accMul: 1.2,
  },
  4: {
    title: 'STAGE 4 ― 砂嵐',
    sub: '視界不良 ― 音に頼れ',
    concurrent: 6,
    queue: [
      'grunt', 'rusher', 'sniper', 'grunt', 'rusher',
      'grunt', 'rusher', 'sniper', 'rusher', 'grunt',
    ],
    fog: 0.018, dim: true, accMul: 1.3,
  },
  5: {
    title: 'STAGE 5 ― 最終防衛',
    sub: '最終山場 ― 精鋭・狙撃・突撃の混成',
    concurrent: 7,
    queue: [
      'elite', 'rusher', 'grunt', 'sniper', 'elite',
      'rusher', 'grunt', 'elite', 'rusher', 'sniper',
      'elite', 'rusher',
    ],
    fog: 0.009, dim: false, accMul: 1.4, peak: true,
  },
};

function startWave(n) {
  const def = STAGE_DEFS[n] || STAGE_DEFS[1];
  game.wave = n;
  game.spawnKinds = def.queue.slice();
  game.spawnQueue = game.spawnKinds.length;
  game.waveTotal = game.spawnQueue;
  game.spawnT = 0.5;
  game.waveConcurrent = def.concurrent;
  game.accMul = def.accMul;
  if (typeof setAtmosphere === 'function') setAtmosphere({ density: def.fog, dim: def.dim });
  showBanner(def.title, def.sub);
  AudioSys.wave();
  updateWaveHUD();
}

function updateWaves(dt) {
  if (game.state !== 'playing' || game.mode !== 'survival') return;

  if (game.spawnQueue > 0) {
    game.spawnT -= dt;
    if (game.spawnT <= 0) {
      const concurrent = enemies.filter(e => e.alive).length;
      const cap = game.waveConcurrent || 5;
      if (concurrent < cap) {
        const sp = pickSpawnPoint();
        const kind = (game.spawnKinds && game.spawnKinds.shift()) || 'grunt';
        enemies.push(new Enemy(sp[0], sp[1], kind, 'red'));
        rebuildHitMeshes();
        game.spawnQueue = game.spawnKinds ? game.spawnKinds.length : 0;
        game.spawnT = rand(0.25, 0.75);
        updateWaveHUD();
      } else {
        game.spawnT = 0.4;
      }
    }
  }

  if (game.intermission > 0) {
    game.intermission -= dt;
    document.getElementById('waveinfo').textContent =
      `補給タイム ― 次まで ${Math.ceil(game.intermission)}`;
    if (game.intermission <= 0) {
      if (game.wave >= SURVIVAL_MAX) survivalVictory();
      else startWave(game.wave + 1);
    }
  }

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
  if (game.mode !== 'survival') return;
  updateWaveHUD();
  const alive = enemies.filter(e => e.alive).length;
  if (alive === 0 && game.spawnQueue === 0 && game.intermission <= 0) {
    if (game.wave >= SURVIVAL_MAX) {
      game.score += 500;
      spawnFloater('STAGE 5 CLEAR +500', false);
      updateScoreHUD();
      survivalVictory();
      return;
    }
    const def = STAGE_DEFS[game.wave];
    const peak = def && def.peak;
    // Stage 5 のみ長め補給。通常は段階クリア後の短い補給
    game.intermission = peak ? 14 : 10;
    game.score += peak ? 350 : 250;
    dropSupplyBundle(true);
    // Stage 3 クリア時、防具未取得なら中央に保証ドロップ
    if (game.wave === 3 && !player.armor) {
      spawnLoot(new THREE.Vector3(SUPPLY_POS.x, 0, SUPPLY_POS.z), 'armor');
    }
    showStageClearBanner(game.wave);
    spawnFloater(peak ? 'FINAL CLEAR +350' : 'STAGE BONUS +250', false);
    updateScoreHUD();
  }
}

/* ---------- TDM ---------- */
/** LOCAL TDM のみ。ONLINE は Online.onMatchStart / onServerMatchStart が担当 */
function startTdmMatch() {
  if (game.online) return;
  // 5v5: 青はプレイヤー＋味方AI4 / 赤は敵5（うち1は狙撃）
  const takeDistinct = (team, n) => {
    const pool = TDM_SPAWNS[team].slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, n);
  };
  const blueSp = takeDistinct('blue', 5);
  const redSp = takeDistinct('red', 5);
  for (let i = 1; i < 5; i++) {
    enemies.push(new Enemy(blueSp[i][0], blueSp[i][1], 'grunt', 'blue'));
  }
  for (let i = 0; i < 4; i++) {
    enemies.push(new Enemy(redSp[i][0], redSp[i][1], 'grunt', 'red'));
  }
  enemies.push(new Enemy(redSp[4][0], redSp[4][1], 'sniper', 'red'));
  for (const e of enemies) {
    e.g.rotation.y = Math.atan2(-e.pos.x, -e.pos.z);
  }
  rebuildHitMeshes();
  player.spawnProtT = 2;
  showBanner('TEAM DEATHMATCH', '5v5・5分 ― キル数で勝敗');
  updateTdmHUD();
}

function updateEnemies(dt) {
  for (const e of enemies) e.update(dt);
  if (game.shotFired) {
    const from = player.pos.clone();
    for (const e of enemies) e.hearShot(from);
    game.shotFired = false;
  }
}
