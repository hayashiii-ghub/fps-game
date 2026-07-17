'use strict';
/* ============================================================
   エフェクト：トレーサー / パーティクル / 薬莢 / フラッシュ
   ============================================================ */

/* マズルフラッシュ用の放射状グラデーションテクスチャ */
let _flashTex = null;
function getFlashTexture() {
  if (_flashTex) return _flashTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.25, 'rgba(255,210,130,0.9)');
  g.addColorStop(0.6, 'rgba(255,140,50,0.35)');
  g.addColorStop(1, 'rgba(255,100,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  // 火花の筋
  ctx.strokeStyle = 'rgba(255,220,150,0.8)';
  ctx.lineWidth = 2;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(32 + dx * 30, 32 + dy * 30);
    ctx.stroke();
  }
  _flashTex = new THREE.CanvasTexture(c);
  return _flashTex;
}

/* ---------- トレーサー ---------- */
const tracers = [];
function initTracers() {
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.03, 1),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, fog: false })
    );
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, active: false, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 0, len: 0 });
  }
}
const TRACER_SPEED = 260;
function spawnTracer(from, to, color) {
  const tr = tracers.find(t => !t.active);
  if (!tr) return;
  tr.from.copy(from); tr.to.copy(to);
  tr.len = from.distanceTo(to);
  tr.dur = tr.len / TRACER_SPEED;
  tr.t = 0;
  tr.active = true;
  tr.mesh.visible = true;
  tr.mesh.material.color.setHex(color || 0xffe0a0);
  tr.mesh.material.opacity = 0.9;
  tr.mesh.lookAt(to);
}
function updateTracers(dt) {
  const seg = 7; // トレーサーの視認長さ
  for (const tr of tracers) {
    if (!tr.active) continue;
    tr.t += dt;
    const p = tr.t / tr.dur;
    if (p >= 1) { tr.active = false; tr.mesh.visible = false; continue; }
    const head = Math.min(p * tr.len, tr.len);
    const tail = Math.max(head - seg, 0);
    const mid = (head + tail) / 2;
    tr.mesh.position.lerpVectors(tr.from, tr.to, mid / tr.len);
    tr.mesh.scale.z = Math.max(head - tail, 0.3);
    tr.mesh.material.opacity = 0.95 - p * 0.4;
  }
}

/* ---------- パーティクル（スプライトのプール） ---------- */
const particles = [];
function initParticles() {
  for (let i = 0; i < 90; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xffffff, transparent: true, opacity: 1, depthWrite: false,
    }));
    s.visible = false;
    scene.add(s);
    particles.push({ s, active: false, vel: new THREE.Vector3(), life: 0, maxLife: 0, grav: 0, size: 0.1 });
  }
}
function spawnBurst(pos, opt) {
  const n = opt.count || 8;
  for (let i = 0; i < n; i++) {
    const p = particles.find(p => !p.active);
    if (!p) return;
    p.active = true;
    p.s.visible = true;
    p.s.material.color.setHex(opt.color);
    p.s.material.opacity = opt.opacity !== undefined ? opt.opacity : 1;
    p.s.position.copy(pos);
    p.vel.set(
      (Math.random() - 0.5) * 2 * opt.spread + (opt.dir ? opt.dir.x * opt.speed : 0),
      Math.random() * opt.up + (opt.dir ? opt.dir.y * opt.speed : 0),
      (Math.random() - 0.5) * 2 * opt.spread + (opt.dir ? opt.dir.z * opt.speed : 0)
    );
    p.life = 0;
    p.maxLife = rand(opt.lifeMin || 0.2, opt.lifeMax || 0.55);
    p.grav = opt.grav !== undefined ? opt.grav : 9;
    p.size = rand(opt.sizeMin || 0.03, opt.sizeMax || 0.09);
    p.s.scale.setScalar(p.size);
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (!p.active) continue;
    p.life += dt;
    if (p.life >= p.maxLife) { p.active = false; p.s.visible = false; continue; }
    p.vel.y -= p.grav * dt;
    p.s.position.addScaledVector(p.vel, dt);
    const k = 1 - p.life / p.maxLife;
    p.s.material.opacity = k;
    p.s.scale.setScalar(p.size * (0.6 + k * 0.6));
    if (p.s.position.y < 0.02 && p.vel.y < 0) { p.s.position.y = 0.02; p.vel.set(0, 0, 0); }
  }
}

/* ---------- 薬莢 ---------- */
const shells = [];
function initShells() {
  const geo = new THREE.BoxGeometry(0.012, 0.012, 0.03);
  const mat = new THREE.MeshLambertMaterial({ color: 0xc8a044 });
  for (let i = 0; i < 22; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    scene.add(m);
    shells.push({ m, active: false, vel: new THREE.Vector3(), rot: new THREE.Vector3(), life: 0, bounced: false });
  }
}
function ejectShell(pos, right, up) {
  const sh = shells.find(s => !s.active);
  if (!sh) return;
  sh.active = true; sh.m.visible = true;
  sh.m.position.copy(pos);
  sh.vel.copy(right).multiplyScalar(rand(1.4, 2.2))
    .addScaledVector(up, rand(1.6, 2.4))
    .add(new THREE.Vector3(rand(-0.3, 0.3), 0, rand(-0.3, 0.3)));
  sh.rot.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
  sh.life = 0; sh.bounced = false;
}
function updateShells(dt) {
  for (const sh of shells) {
    if (!sh.active) continue;
    sh.life += dt;
    if (sh.life > 1.4) { sh.active = false; sh.m.visible = false; continue; }
    sh.vel.y -= 12 * dt;
    sh.m.position.addScaledVector(sh.vel, dt);
    sh.m.rotation.x += sh.rot.x * dt;
    sh.m.rotation.y += sh.rot.y * dt;
    sh.m.rotation.z += sh.rot.z * dt;
    if (sh.m.position.y < 0.02 && !sh.bounced) {
      sh.m.position.y = 0.02;
      sh.vel.y = Math.abs(sh.vel.y) * 0.3;
      sh.vel.x *= 0.5; sh.vel.z *= 0.5;
      sh.bounced = true;
    } else if (sh.m.position.y < 0.02) {
      sh.m.position.y = 0.02; sh.vel.set(0, 0, 0); sh.rot.set(0, 0, 0);
    }
  }
}

/* ---------- 着弾エフェクト ---------- */
function impactFX(pos, surfaceColor) {
  spawnBurst(pos, { color: surfaceColor || 0xbfae88, count: 7, speed: 0, spread: 1.6, up: 2.2, grav: 10, sizeMin: 0.02, sizeMax: 0.06, lifeMin: 0.15, lifeMax: 0.4 });
  spawnBurst(pos, { color: 0xffd9a0, count: 2, speed: 0, spread: 3.5, up: 1.5, grav: 14, sizeMin: 0.012, sizeMax: 0.03, lifeMin: 0.05, lifeMax: 0.15 });
}
function bloodFX(pos, dir) {
  spawnBurst(pos, { color: 0x7e1210, count: 9, dir, speed: 1.8, spread: 1.4, up: 1.2, grav: 11, sizeMin: 0.03, sizeMax: 0.085, lifeMin: 0.2, lifeMax: 0.5 });
}

/* ---------- 漂う砂塵 ---------- */
let dust = null;
function initDust() {
  const N = 220;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = rand(-40, 40);
    pos[i * 3 + 1] = rand(0.1, 9);
    pos[i * 3 + 2] = rand(-40, 40);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xd8c8a2, size: 0.055, transparent: true, opacity: 0.45, depthWrite: false,
  }));
  scene.add(dust);
}
function updateDust(dt, center) {
  const a = dust.geometry.attributes.position.array;
  for (let i = 0; i < a.length; i += 3) {
    a[i] += 0.9 * dt;
    a[i + 2] += 0.35 * dt;
    a[i + 1] += Math.sin((a[i] + i) * 0.4) * 0.06 * dt;
    // プレイヤー周辺にラップ
    if (a[i] - center.x > 40) a[i] -= 80;
    if (a[i] - center.x < -40) a[i] += 80;
    if (a[i + 2] - center.z > 40) a[i + 2] -= 80;
    if (a[i + 2] - center.z < -40) a[i + 2] += 80;
  }
  dust.geometry.attributes.position.needsUpdate = true;
}
