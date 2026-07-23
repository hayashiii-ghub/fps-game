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
  jumpCd: 0, // 着地後の再ジャンプ抑制（ホッピング移動ナーフ）
  eyeH: 1.62, targetEyeH: 1.62,
  bobPhase: 0, stepSign: 1,
  lastDamage: -99, regenDelay: 6,
  radius: 0.36,
  recoilP: 0, recoilY: 0,          // リコイルによる視点オフセット
  lean: 0,
  grenades: 1,
  grenadeMax: 5,
  grenadeCd: 0,
  nadeAim: false,
  moveMul: 1,          // 武器切替時の移動倍率（滑らかに追従）
  medkits: 0,
  medkitMax: 3,
  armor: false,
  dmgMul: 1,
  healing: false,
  healT: 0,
  healDur: 2,
  healFrom: 100,
  healTo: 100,
  /** TDM リスポーン直後の無敵残り秒 */
  spawnProtT: 0,
};

/** @type {'assault'|'smg'|'shotgun'|'sniper'|'pistol'} */
const WEAPON_ORDER = ['assault', 'smg', 'shotgun', 'sniper', 'pistol'];
/** メイン/サブのロードアウト選択肢（ハンドガンは常備の特殊枠） */
const LOADOUT_POOL = ['assault', 'smg', 'shotgun', 'sniper'];

const WEAPON_DEFS = {
  assault: {
    id: 'assault', label: 'アサルト', mode: 'AUTO',
    magSize: 30, startReserve: 120, tdmReserve: 90, maxReserve: 360,
    fireInterval: 60 / 750, reloadDur: 2.1, auto: true,
    moveMul: 1.0,          // 基準速
    adsMoveMul: 0.55,
    spreadHip: 0.017, spreadAds: 0.0045,
    bloomAdd: 0.0038, bloomMax: 0.03, bloomDecay: 0.028,
    recoilP: [0.0055, 0.0085], recoilY: 0.0035,
    kickZ: 0.045, kickR: 0.075, adsRecoil: 0.55,
    adsFov: 46, adsSens: 0.62, scale: 0.92,
    hip: { x: 0.21, y: -0.19, z: -0.4, rx: 0, ry: 0.08 },
    ads: { x: 0, y: -0.09, z: -0.47, rx: 0, ry: 0 },
    dmg: { head: 70, torso: 34, limb: 24 },
    // 弱めの減衰：中距離まではフル、遠距離だけ少し落とす（近接武器より緩い）
    dmgFalloff: { start: 28, end: 50, min: 0.82 },
  },
  smg: {
    id: 'smg', label: 'SMG', mode: 'AUTO',
    magSize: 25, startReserve: 100, tdmReserve: 75, maxReserve: 300,
    fireInterval: 60 / 850, reloadDur: 1.7, auto: true,
    moveMul: 1.06,         // 軽快
    adsMoveMul: 0.6,
    spreadHip: 0.02, spreadAds: 0.009,
    bloomAdd: 0.0028, bloomMax: 0.034, bloomDecay: 0.032,
    recoilP: [0.0038, 0.0058], recoilY: 0.003,
    kickZ: 0.035, kickR: 0.06, adsRecoil: 0.6,
    adsFov: 50, adsSens: 0.68, scale: 0.84,
    hip: { x: 0.2, y: -0.18, z: -0.38, rx: 0, ry: 0.07 },
    // サイト(dot y=0.078)×scale がカメラ光軸に来るよう ads.y を合わせる
    ads: { x: 0, y: -0.066, z: -0.44, rx: 0, ry: 0 },
    dmg: { head: 50, torso: 26, limb: 18 },
    // start までフル、end で min、以降は min 維持
    dmgFalloff: { start: 18, end: 35, min: 0.65 },
  },
  shotgun: {
    id: 'shotgun', label: 'ショットガン', mode: 'PUMP',
    magSize: 6, startReserve: 24, tdmReserve: 18, maxReserve: 60,
    fireInterval: 0.9, reloadDur: 2.6, auto: false,
    moveMul: 0.97,
    adsMoveMul: 0.5,       // 腰撃ち固定の代償（減速）
    // 集弾をややタイトに＋距離威力減衰（拡散と二重で遠距離を抑える）
    spreadHip: 0.036, spreadAds: 0.022,
    bloomAdd: 0.004, bloomMax: 0.02, bloomDecay: 0.05,
    recoilP: [0.016, 0.022], recoilY: 0.006,
    kickZ: 0.085, kickR: 0.11, adsRecoil: 0.7,
    // 覗き込みではなく「腰撃ち固定」：FOV据え置き・銃は腰位置のまま
    adsFov: 75, adsSens: 0.88, scale: 0.98,
    hip: { x: 0.21, y: -0.19, z: -0.4, rx: 0, ry: 0.06 },
    ads: { x: 0.19, y: -0.18, z: -0.41, rx: 0.01, ry: 0.05 },
    pellets: 8,
    // 1ペレットあたり（近距離全弾命中で torso 120 / head 160）
    dmg: { head: 20, torso: 15, limb: 10 },
    dmgFalloff: { start: 12, end: 25, min: 0.5 },
    pump: true,
  },
  pistol: {
    id: 'pistol', label: 'ハンドガン', mode: 'SEMI',
    magSize: 12, startReserve: 60, tdmReserve: 36, maxReserve: 120,
    fireInterval: 60 / 320, reloadDur: 1.35, auto: false,
    moveMul: 1.12,         // 近接応戦・逃げ切り用に速い
    adsMoveMul: 0.45,      // 腰撃ち固定の代償
    spreadHip: 0.022, spreadAds: 0.007,
    bloomAdd: 0.002, bloomMax: 0.018, bloomDecay: 0.04,
    recoilP: [0.004, 0.006], recoilY: 0.0025,
    kickZ: 0.03, kickR: 0.05, adsRecoil: 0.7,
    // 覗き込みではなく「腰撃ち固定」：FOV据え置き・銃は腰位置のまま
    adsFov: 75, adsSens: 0.88, scale: 0.88,
    hip: { x: 0.2, y: -0.22, z: -0.36, rx: 0, ry: 0.06 },
    ads: { x: 0.18, y: -0.2, z: -0.37, rx: 0.02, ry: 0.05 },
    dmg: { head: 55, torso: 28, limb: 18 },
    dmgFalloff: { start: 15, end: 30, min: 0.7 },
  },
  sniper: {
    id: 'sniper', label: 'スナイパー', mode: 'BOLT',
    magSize: 5, startReserve: 15, tdmReserve: 10, maxReserve: 40,
    fireInterval: 1.2, reloadDur: 2.7, auto: false,
    moveMul: 0.9,          // 腰撃ちでも少し重い
    adsMoveMul: 0.4,
    spreadHip: 0.09, spreadAds: 0.0007,
    bloomAdd: 0.01, bloomMax: 0.02, bloomDecay: 0.05,
    recoilP: [0.02, 0.028], recoilY: 0.006,
    kickZ: 0.09, kickR: 0.12, adsRecoil: 0.45,
    adsFov: 22, adsSens: 0.38, scale: 1,
    hip: { x: 0.22, y: -0.2, z: -0.42, rx: 0.02, ry: 0.1 },
    ads: { x: 0, y: -0.1, z: -0.52, rx: 0, ry: 0 },
    // 頭は一撃、胴は95%（非一撃）、四肢は非致死
    dmg: { head: 200, torso: 95, limb: 55 },
  },
};

const arsenal = {
  owned: { assault: true, smg: true, shotgun: false, sniper: false, pistol: true },
  slots: {
    assault: { mag: 30, reserve: 120 },
    smg: { mag: 25, reserve: 100 },
    shotgun: { mag: 6, reserve: 24 },
    sniper: { mag: 5, reserve: 15 },
    pistol: { mag: 12, reserve: 60 },
  },
  activeId: 'assault',
  models: {},   // id -> { group, muzzle, flash }
};

const weapon = {
  mag: 30, magSize: 30, reserve: 120,
  reloading: false, reloadT: 0, reloadDur: 2.1,
  lastShot: 0, fireInterval: 60 / 750,
  boltUntil: 0,            // スナイパーコッキング終了時刻
  bloom: 0,
  ads: false, adsT: 0,
  gun: null, muzzle: null, flash: null, flashLight: null,
  kickZ: 0, kickR: 0,
  swayX: 0, swayY: 0,
  gunPos: new THREE.Vector3(0.22, -0.2, -0.38),
  semiLocked: false,
  switchLock: 0,
};

const input = { keys: {}, lmb: false, rmb: false };

function activeDef() { return WEAPON_DEFS[arsenal.activeId]; }

/** 距離によるダメージ倍率。dmgFalloff が無い武器は常に 1。 */
function weaponDamageMul(def, dist) {
  const f = def && def.dmgFalloff;
  if (!f) return 1;
  if (dist <= f.start) return 1;
  if (dist >= f.end) return f.min;
  const t = (dist - f.start) / (f.end - f.start);
  return 1 + (f.min - 1) * t;
}

function ownedIds() {
  return WEAPON_ORDER.filter(id => arsenal.owned[id]);
}

function saveActiveAmmo() {
  const s = arsenal.slots[arsenal.activeId];
  if (!s) return;
  s.mag = weapon.mag;
  s.reserve = weapon.reserve;
}

function applyWeaponStats(id) {
  const def = WEAPON_DEFS[id];
  const slot = arsenal.slots[id];
  arsenal.activeId = id;
  weapon.mag = slot.mag;
  weapon.magSize = def.magSize;
  weapon.reserve = slot.reserve;
  weapon.fireInterval = def.fireInterval;
  weapon.reloadDur = def.reloadDur;
  weapon.bloom = 0;
  weapon.semiLocked = false;
  weapon.reloading = false;
  weapon.reloadT = 0;
  weapon.boltUntil = 0;
  weapon.ads = false;
  document.getElementById('reloadwrap').style.display = 'none';

  for (const wid of WEAPON_ORDER) {
    const m = arsenal.models[wid];
    if (m) m.group.visible = wid === id;
  }
  const model = arsenal.models[id];
  if (model) {
    weapon.gun = model.group;
    weapon.muzzle = model.muzzle;
    weapon.flash = model.flash;
    model.group.scale.setScalar(def.scale);
  }
  updateAmmoHUD();
}

function cycleWeapon(dir) {
  if (!player.alive || game.state !== 'playing') return;
  if (weapon.switchLock > 0) return;
  const ids = ownedIds();
  if (ids.length < 2) return;
  saveActiveAmmo();
  const i = ids.indexOf(arsenal.activeId);
  const next = ids[(i + dir + ids.length) % ids.length];
  if (next === arsenal.activeId) return;
  applyWeaponStats(next);
  // ハンドガンへの切替は速め（近接応戦用）
  weapon.switchLock = next === 'pistol' ? 0.14 : 0.28;
  spawnFloater(WEAPON_DEFS[next].label, false);
}

function makeTdmAmmoSlots() {
  const slots = {};
  for (const id of WEAPON_ORDER) {
    const def = WEAPON_DEFS[id];
    slots[id] = { mag: def.magSize, reserve: def.tdmReserve };
  }
  return slots;
}

/** ロードアウト（メイン＋サブ・重複不可）に基づく所持武器。ハンドガンは常備 */
function ownedFromLoadout() {
  const owned = { assault: false, smg: false, shotgun: false, sniper: false, pistol: true };
  const main = LOADOUT_POOL.includes(game.loadoutMain) ? game.loadoutMain : 'assault';
  const sub = LOADOUT_POOL.includes(game.loadoutSub) ? game.loadoutSub : 'smg';
  owned[main] = true;
  if (sub !== main) owned[sub] = true;
  return owned;
}

function resetArsenal() {
  const tdm = game.mode === 'tdm';
  arsenal.owned = ownedFromLoadout();
  if (tdm) {
    arsenal.slots = makeTdmAmmoSlots();
  } else {
    arsenal.slots = {};
    for (const id of WEAPON_ORDER) {
      const def = WEAPON_DEFS[id];
      arsenal.slots[id] = { mag: def.magSize, reserve: def.startReserve };
    }
  }
  arsenal.activeId = LOADOUT_POOL.includes(game.loadoutMain) ? game.loadoutMain : 'assault';
  weapon.kickZ = weapon.kickR = 0;
  weapon.swayX = weapon.swayY = 0;
  weapon.adsT = 0;
  player.grenades = tdm ? 2 : 1;
  player.grenadeMax = 5;
  player.grenadeCd = 0;
  player.nadeAim = false;
  player.moveMul = WEAPON_DEFS[arsenal.activeId].moveMul;
  player.medkits = tdm ? 2 : 0;
  player.medkitMax = 3;
  player.healing = false;
  player.healT = 0;
  player.armor = false;
  player.dmgMul = 1;
  player.spawnProtT = 0;
  clearGrenades();
  hideNadeArc();
  hideHealBar();
  applyWeaponStats(arsenal.activeId);
  updateGrenadeHUD();
  updateMedkitHUD();
  if (typeof updateArmorHUD === 'function') updateArmorHUD();
}

function addGrenades(n) {
  const before = player.grenades;
  player.grenades = Math.min(player.grenadeMax, player.grenades + n);
  updateGrenadeHUD();
  return player.grenades > before;
}

function addMedkits(n) {
  const before = player.medkits;
  player.medkits = Math.min(player.medkitMax, player.medkits + n);
  updateMedkitHUD();
  return player.medkits > before;
}

function toggleNadeAim() {
  if (!player.alive || game.state !== 'playing') return;
  if (player.nadeAim) {
    cancelNadeAim();
    return;
  }
  if (player.grenades <= 0) { AudioSys.dry(); return; }
  if (player.grenadeCd > 0 || player.healing) return;
  player.nadeAim = true;
  weapon.ads = false;
  input.rmb = false;
  showNadeArc();
  updateGrenadeHUD();
}

function cancelNadeAim() {
  player.nadeAim = false;
  hideNadeArc();
  updateGrenadeHUD();
}

function startHeal() {
  if (!player.alive || game.state !== 'playing') return;
  if (player.healing) return;
  if (player.medkits <= 0) { AudioSys.dry(); return; }
  if (player.hp >= 100) return;
  if (player.nadeAim) cancelNadeAim();
  // キットは完了時に消費（キャンセルで失わない／途中HPチート防止）
  player.healing = true;
  player.healT = 0;
  player.healFrom = player.hp;
  player.healTo = Math.min(100, player.hp + 50);
  player.sprinting = false;
  weapon.ads = false;
  showHealBar();
  AudioSys.pickup();
  if (game.online && typeof Online !== 'undefined') Online.notifyHealStart();
}

function cancelHeal() {
  if (!player.healing) return;
  player.healing = false;
  player.hp = player.healFrom;
  updateHealthHUD();
  hideHealBar();
  if (game.online && typeof Online !== 'undefined') Online.notifyHealCancel();
}

function updateHeal(dt) {
  if (!player.healing) return;
  player.healT += dt;
  const u = clamp(player.healT / player.healDur, 0, 1);
  if (!game.online) {
    player.hp = lerp(player.healFrom, player.healTo, u);
    updateHealthHUD();
  }
  const fill = document.getElementById('healfill');
  if (fill) fill.style.width = `${u * 100}%`;
  if (u >= 1) {
    player.healing = false;
    hideHealBar();
    if (game.online && typeof Online !== 'undefined') {
      // HP/キットはサーバー healed / inv が正
      Online.claimHeal();
      spawnFloater('応急処置 完了', false);
      return;
    }
    player.medkits = Math.max(0, player.medkits - 1);
    updateMedkitHUD();
    spawnFloater('応急処置 完了', false);
  }
}

function showHealBar() {
  const w = document.getElementById('healwrap');
  if (!w) return;
  w.style.display = 'block';
  document.getElementById('healfill').style.width = '0%';
}
function hideHealBar() {
  const w = document.getElementById('healwrap');
  if (w) w.style.display = 'none';
}

function grantSniper() {
  if (arsenal.owned.sniper) {
    saveActiveAmmo();
    const slot = arsenal.slots.sniper;
    const def = WEAPON_DEFS.sniper;
    const before = slot.reserve;
    slot.reserve = Math.min(slot.reserve + 10, def.maxReserve);
    if (arsenal.activeId === 'sniper') weapon.reserve = slot.reserve;
    spawnFloater(slot.reserve > before ? '狙撃弾 +10' : '狙撃弾 MAX', false);
    updateAmmoHUD();
    return false;
  }
  arsenal.owned.sniper = true;
  arsenal.slots.sniper = { mag: 5, reserve: 15 };
  saveActiveAmmo();
  applyWeaponStats('sniper');
  spawnFloater('スナイパーライフル 取得', true);
  return true;
}

/** Survival Stage 3 以降の防具：被ダメ約 28% 軽減（マッチ中永続） */
function grantArmor() {
  if (player.armor) {
    spawnFloater('防具装備中', false);
    return false;
  }
  player.armor = true;
  player.dmgMul = 0.72;
  spawnFloater('強化防具 取得', true);
  if (typeof updateArmorHUD === 'function') updateArmorHUD();
  return true;
}

function addReserveAmmo(amount) {
  saveActiveAmmo();
  // アクティブ武器優先。あふれた分は他の所持武器へ順に分配
  const order = [arsenal.activeId,
    ...WEAPON_ORDER.filter(id => id !== arsenal.activeId && arsenal.owned[id])];
  const totalOf = () => WEAPON_ORDER.reduce(
    (t, id) => t + (arsenal.owned[id] ? arsenal.slots[id].reserve : 0), 0);
  const before = totalOf();
  let left = amount;
  for (const id of order) {
    if (left <= 0) break;
    const slot = arsenal.slots[id];
    const room = WEAPON_DEFS[id].maxReserve - slot.reserve;
    const take = Math.min(room, left);
    slot.reserve += take;
    left -= take;
  }
  weapon.reserve = arsenal.slots[arsenal.activeId].reserve;
  updateAmmoHUD();
  return totalOf() > before;
}

/* ---------- 銃ビューモデル ---------- */
function attachMuzzleFlash(g, muzzleLocal) {
  const muzzle = new THREE.Object3D();
  muzzle.position.copy(muzzleLocal);
  g.add(muzzle);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getFlashTexture(), color: 0xffc36b, transparent: true, opacity: 0, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flash.scale.setScalar(0.22);
  muzzle.add(flash);
  return { muzzle, flash };
}

/* ホロサイトのレティクル(サークルドット)テクスチャ */
let _holoTex = null;
function getHoloReticleTexture() {
  if (_holoTex) return _holoTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#ff2d1e';
  ctx.fillStyle = '#ff2d1e';
  ctx.shadowColor = '#ff2d1e';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(128, 128, 92, 0, Math.PI * 2);
  ctx.stroke();
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    ctx.beginPath();
    ctx.moveTo(128 + dx * 92, 128 + dy * 92);
    ctx.lineTo(128 + dx * 112, 128 + dy * 112);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(128, 128, 8, 0, Math.PI * 2);
  ctx.fill();
  _holoTex = new THREE.CanvasTexture(c);
  return _holoTex;
}

function buildAssaultModel() {
  const g = new THREE.Group();
  const gm = MAT.gunmetal, dm = MAT.darkMetal;

  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.095, 0.46), gm));
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
  const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.09), dm);
  sightBase.position.set(0, 0.062, -0.05);
  g.add(sightBase);
  // ホロサイト: 窓枠ハウジング + 自発光レティクルガラス。中心 y=0.098 が ADS 光軸
  const holo = new THREE.Group();
  holo.position.set(0, 0.098, -0.05);
  const wallGeo = new THREE.BoxGeometry(0.005, 0.054, 0.07);
  const wallL = new THREE.Mesh(wallGeo, dm);
  wallL.position.set(-0.0275, 0, 0);
  holo.add(wallL);
  const wallR = new THREE.Mesh(wallGeo, dm);
  wallR.position.set(0.0275, 0, 0);
  holo.add(wallR);
  const plateB = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.005, 0.07), dm);
  plateB.position.set(0, -0.025, 0);
  holo.add(plateB);
  const plateT = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.07), dm);
  plateT.position.set(0, 0.025, 0);
  holo.add(plateT);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05),
    new THREE.MeshBasicMaterial({
      map: getHoloReticleTexture(), transparent: true, fog: false,
      side: THREE.DoubleSide, depthWrite: false,
    }));
  holo.add(glass);
  g.add(holo);
  const gloveM = new THREE.MeshLambertMaterial({ color: 0x3d3a30 });
  gloveM.color.convertSRGBToLinear();
  const handR = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.09), gloveM);
  handR.position.set(0.005, -0.085, 0.1);
  g.add(handR);
  const handL = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.1), gloveM);
  handL.position.set(-0.005, -0.03, -0.32);
  g.add(handL);

  const { muzzle, flash } = attachMuzzleFlash(g, new THREE.Vector3(0, 0.012, -0.72));
  return { group: g, muzzle, flash };
}

function buildPistolModel() {
  const g = new THREE.Group();
  const gm = MAT.gunmetal, dm = MAT.darkMetal;
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.22), gm);
  g.add(slide);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.16), dm);
  frame.position.set(0, -0.035, 0.02);
  g.add(frame);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.11, 0.055), dm);
  grip.position.set(0, -0.09, 0.06);
  grip.rotation.x = 0.25;
  g.add(grip);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), gm);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.005, -0.15);
  g.add(barrel);
  const gloveM = new THREE.MeshLambertMaterial({ color: 0x3d3a30 });
  gloveM.color.convertSRGBToLinear();
  const handR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.07), gloveM);
  handR.position.set(0.01, -0.08, 0.05);
  g.add(handR);
  const { muzzle, flash } = attachMuzzleFlash(g, new THREE.Vector3(0, 0.005, -0.22));
  flash.scale.setScalar(0.14);
  return { group: g, muzzle, flash };
}

function buildSniperModel() {
  const g = new THREE.Group();
  const gm = MAT.gunmetal, dm = MAT.darkMetal;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.7), gm);
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.55, 8), dm);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.01, -0.6);
  g.add(barrel);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.09, 0.28), dm);
  stock.position.set(0, -0.01, 0.42);
  g.add(stock);
  const magM = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.06), gm);
  magM.position.set(0, -0.09, -0.05);
  g.add(magM);
  // スコープ（腰だめ時のみ表示。ADS時は2Dオーバーレイに切替）
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 10), dm);
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.08, -0.05);
  scope.userData.hideOnAds = true;
  g.add(scope);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.022, 12),
    new THREE.MeshBasicMaterial({ color: 0x6a8a9a, transparent: true, opacity: 0.35, fog: false, depthWrite: false }));
  lens.position.set(0, 0.08, 0.06);
  lens.userData.hideOnAds = true;
  g.add(lens);
  const gloveM = new THREE.MeshLambertMaterial({ color: 0x3d3a30 });
  gloveM.color.convertSRGBToLinear();
  const handR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.08), gloveM);
  handR.position.set(0.01, -0.08, 0.12);
  g.add(handR);
  const handL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.09), gloveM);
  handL.position.set(-0.01, -0.02, -0.35);
  g.add(handL);
  const { muzzle, flash } = attachMuzzleFlash(g, new THREE.Vector3(0, 0.01, -0.9));
  flash.scale.setScalar(0.28);
  return { group: g, muzzle, flash };
}

function buildSmgModel() {
  const g = new THREE.Group();
  const gm = MAT.gunmetal, dm = MAT.darkMetal;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.34), gm);
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 8), dm);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.25);
  g.add(barrel);
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), gm);
  shroud.rotation.x = Math.PI / 2;
  shroud.position.set(0, 0.012, -0.2);
  g.add(shroud);
  // 折り畳みストック
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.05, 0.2), dm);
  stock.position.set(0.024, -0.01, 0.2);
  g.add(stock);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.05), dm);
  grip.position.set(0, -0.085, 0.08);
  grip.rotation.x = 0.3;
  g.add(grip);
  // カーブマガジン
  const magM = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.055), gm);
  magM.position.set(0, -0.12, -0.03);
  magM.rotation.x = 0.22;
  g.add(magM);
  const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.018, 0.07), dm);
  sightBase.position.set(0, 0.052, -0.02);
  g.add(sightBase);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.003, 8, 18), dm);
  ring.position.set(0, 0.078, -0.02);
  g.add(ring);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.003, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2211, fog: false }));
  dot.position.set(0, 0.078, -0.02);
  g.add(dot);
  const gloveM = new THREE.MeshLambertMaterial({ color: 0x3d3a30 });
  gloveM.color.convertSRGBToLinear();
  const handR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.08), gloveM);
  handR.position.set(0.005, -0.08, 0.08);
  g.add(handR);
  const handL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.09), gloveM);
  handL.position.set(-0.005, -0.045, -0.16);
  g.add(handL);
  const { muzzle, flash } = attachMuzzleFlash(g, new THREE.Vector3(0, 0.012, -0.34));
  flash.scale.setScalar(0.18);
  return { group: g, muzzle, flash };
}

function buildShotgunModel() {
  const g = new THREE.Group();
  const gm = MAT.gunmetal, dm = MAT.darkMetal;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.085, 0.3), gm);
  g.add(receiver);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.52, 10), gm);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.018, -0.4);
  g.add(barrel);
  // マガジンチューブ
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.46, 8), dm);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, -0.022, -0.38);
  g.add(tube);
  // ポンプ（前床）
  const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.14, 8), dm);
  pump.rotation.x = Math.PI / 2;
  pump.position.set(0, -0.022, -0.3);
  g.add(pump);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.24), dm);
  stock.position.set(0, -0.025, 0.3);
  g.add(stock);
  const gripCap = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 0.06), dm);
  gripCap.position.set(0, -0.09, 0.14);
  gripCap.rotation.x = 0.4;
  g.add(gripCap);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 6), dm);
  bead.position.set(0, 0.045, -0.64);
  g.add(bead);
  const gloveM = new THREE.MeshLambertMaterial({ color: 0x3d3a30 });
  gloveM.color.convertSRGBToLinear();
  const handR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.08), gloveM);
  handR.position.set(0.005, -0.085, 0.13);
  g.add(handR);
  const handL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.1), gloveM);
  handL.position.set(-0.005, -0.05, -0.3);
  g.add(handL);
  const { muzzle, flash } = attachMuzzleFlash(g, new THREE.Vector3(0, 0.018, -0.67));
  flash.scale.setScalar(0.3);
  return { group: g, muzzle, flash };
}

function buildGun() {
  const flashLight = new THREE.PointLight(0xffb36b, 0, 14);
  scene.add(flashLight);
  weapon.flashLight = flashLight;

  arsenal.models.assault = buildAssaultModel();
  arsenal.models.smg = buildSmgModel();
  arsenal.models.shotgun = buildShotgunModel();
  arsenal.models.pistol = buildPistolModel();
  arsenal.models.sniper = buildSniperModel();
  for (const id of WEAPON_ORDER) {
    const m = arsenal.models[id];
    camera.add(m.group);
    m.group.visible = false;
    m.group.position.copy(weapon.gunPos);
  }
  applyWeaponStats('assault');
}

/* ---------- 射撃 ---------- */
const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _camUp = new THREE.Vector3();
const _muzzleW = new THREE.Vector3();

function isSniperBolting() {
  return arsenal.activeId === 'sniper' && game.time < weapon.boltUntil;
}

function currentSpread() {
  const def = activeDef();
  let s = weapon.ads ? def.spreadAds : def.spreadHip;
  const spd = Math.hypot(player.vel.x, player.vel.z);
  // ADS 中は移動ブレを抑える（特にスナイパーのスコープずれ防止）
  s += (spd / 7) * 0.02 * (weapon.ads ? 0.2 : 1);
  if (!player.onGround) s += weapon.ads ? 0.008 : 0.03;
  if (player.crouching) s *= 0.72;
  return s + weapon.bloom * (weapon.ads && arsenal.activeId === 'sniper' ? 0.35 : 1);
}

function tryFire(now) {
  if (!player.alive || weapon.reloading) return;
  if (player.nadeAim || player.healing) return;
  if (now - weapon.lastShot < weapon.fireInterval) return;
  if (player.sprinting) return;
  const def = activeDef();
  if (!def.auto && weapon.semiLocked) return;
  if (weapon.mag <= 0) {
    AudioSys.dry();
    startReload();
    weapon.lastShot = now;
    if (!def.auto) weapon.semiLocked = true;
    return;
  }
  weapon.lastShot = now;
  weapon.mag--;
  if (!def.auto) weapon.semiLocked = true;
  game.shots++;
  game.shotFired = true;

  // 弾道・リコイルは撃った瞬間の ADS で計算してから、スナイパーだけスコープ解除する
  const rec = weapon.ads ? def.adsRecoil : 1;
  player.recoilP += rand(def.recoilP[0], def.recoilP[1]) * rec;
  player.recoilY += rand(-def.recoilY, def.recoilY) * rec;
  weapon.bloom = Math.min(weapon.bloom + def.bloomAdd, def.bloomMax);
  weapon.kickZ += def.kickZ;
  weapon.kickR += def.kickR;

  // 照準は常にカメラ視線（画面中央＝スコープ中央）。散弾はカメラローカル軸で振る
  camera.getWorldDirection(_dir);
  _from.copy(camera.getWorldPosition(new THREE.Vector3()));
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const sp = currentSpread();
  const pellets = def.pellets || 1;
  const targets = hitMeshes.concat(worldMeshes);
  const tracerEnds = [];

  for (let p = 0; p < pellets; p++) {
    const pdir = _dir.clone();
    pdir.addScaledVector(_right, rand(-sp, sp));
    pdir.addScaledVector(_camUp, rand(-sp, sp));
    pdir.normalize();
    const rc = new THREE.Raycaster(_from, pdir, 0.05, 300);
    const hits = rc.intersectObjects(targets, false);
    let end = null;
    if (hits.length) {
      const h = hits[0];
      end = h.point;
      if (h.object.userData.remoteId && game.online && typeof Online !== 'undefined') {
        Online.claimHit(h.object.userData.remoteId, h.object.userData.part);
      } else if (h.object.userData.enemy && h.object.userData.enemy.alive) {
        hitEnemy(h.object.userData.enemy, h.object.userData.part, h.point, pdir);
      } else {
        impactFX(h.point);
      }
    } else {
      end = _from.clone().addScaledVector(pdir, 250);
    }
    // トレーサーは散弾全てだとうるさいので代表的な数本だけ
    if (p === 0 || (pellets > 1 && p < 4)) tracerEnds.push(end);
  }

  weapon.muzzle.getWorldPosition(_muzzleW);
  // スナイパーADS時は銃口オフセットのトレーサーだとスコープと見た目がズレるので視線起点にする
  const scopeTracer = arsenal.activeId === 'sniper' && weapon.adsT > 0.45;
  const tracerFrom = scopeTracer
    ? _from.clone().addScaledVector(_dir, 0.4)
    : _muzzleW;
  for (const end of tracerEnds) spawnTracer(tracerFrom, end, 0xffe9b8);

  weapon.flash.material.opacity = scopeTracer ? 0 : 0.95;
  weapon.flash.material.rotation = rand(0, 6.28);
  weapon.flash.scale.setScalar(rand(0.16, 0.26) * (pellets > 1 ? 1.5 : 1));
  weapon.flashLight.position.copy(scopeTracer ? tracerFrom : _muzzleW);
  weapon.flashLight.intensity = arsenal.activeId === 'sniper' ? 3.2 : 2.4;

  if (!scopeTracer) ejectShell(_muzzleW, _right, _up);

  // 弾道確定後にボルト開始。先に ads=false すると腰撃ち散布（0.09）が乗る
  if (arsenal.activeId === 'sniper') {
    weapon.boltUntil = now + weapon.fireInterval;
    weapon.ads = false;
    AudioSys.bolt();
  }
  if (def.pump && AudioSys.pump) AudioSys.pump();

  AudioSys.shot(arsenal.activeId);
  updateAmmoHUD();
  if (game.online && typeof Online !== 'undefined') Online.notifyFire(arsenal.activeId);
}

function startReload() {
  if (weapon.reloading || weapon.mag === weapon.magSize || weapon.reserve <= 0) return;
  weapon.reloading = true;
  weapon.reloadT = 0;
  weapon.ads = false;
  document.getElementById('reloadwrap').style.display = 'block';
  AudioSys.reload(weapon.reloadDur);
}

/* ---------- プレイヤー被弾 ---------- */
function damagePlayer(dmg, fromPos) {
  if (!player.alive) return;
  if (player.spawnProtT > 0) return;
  if (player.healing) cancelHeal();
  const scaled = dmg * (Number.isFinite(player.dmgMul) ? player.dmgMul : 1);
  player.hp -= scaled;
  player.lastDamage = game.time;
  AudioSys.hurt();

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
    if (game.mode === 'tdm') onPlayerKilled(fromPos);
    else gameOver();
  }
  updateHealthHUD();
}

/* ---------- 移動衝突（水平円 vs 見た目どおりの Y回転 OBB） ---------- */
/** 接触〜めり込み時の押し出しと法線。完全に外側なら null */
function probeCircleVsBox(px, pz, radius, minX, maxX, minZ, maxZ) {
  const cx = clamp(px, minX, maxX);
  const cz = clamp(pz, minZ, maxZ);
  let dx = px - cx, dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > radius * radius) return null;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    const push = radius - d;
    const nx = dx / d, nz = dz / d;
    return { ox: nx * push, oz: nz * push, pen: push, nx, nz };
  }
  // 中心が箱内 → 最も近い面へ半径ぶん外へ
  const px1 = px - minX + radius, px2 = maxX - px + radius;
  const pz1 = pz - minZ + radius, pz2 = maxZ - pz + radius;
  const m = Math.min(px1, px2, pz1, pz2);
  let ox = 0, oz = 0;
  if (m === px1) ox = -px1;
  else if (m === px2) ox = px2;
  else if (m === pz1) oz = -pz1;
  else oz = pz2;
  const len = Math.hypot(ox, oz) || 1;
  return { ox, oz, pen: Math.abs(m), nx: ox / len, nz: oz / len };
}

/** 中心がどれかの固体の内側か */
function insideAnySolid(p, height) {
  const yLow = p.y + 0.25;
  const yHigh = p.y + height;
  for (const b of colliders) {
    if (yHigh < b.cy - b.hy || yLow > b.cy + b.hy) continue;
    const dx = p.x - b.cx;
    const dz = p.z - b.cz;
    const lx = dx * b.cos + dz * b.sin;
    const lz = -dx * b.sin + dz * b.cos;
    if (Math.abs(lx) < b.hx && Math.abs(lz) < b.hz) return true;
  }
  return false;
}

/**
 * 最も深い1ヒットを外へ押し、壁へ食い込む速度だけ消す（スライド）。
 */
function resolveCollision(p, radius, height, vel) {
  if (![p.x, p.y, p.z].every(Number.isFinite)) p.set(0, 0, 0);
  for (let pass = 0; pass < 3; pass++) {
    let best = null;
    for (const b of colliders) {
      if (p.y + height < b.cy - b.hy || p.y + 0.25 > b.cy + b.hy) continue;
      const dx = p.x - b.cx;
      const dz = p.z - b.cz;
      const lx = dx * b.cos + dz * b.sin;
      const lz = -dx * b.sin + dz * b.cos;
      const local = probeCircleVsBox(lx, lz, radius, -b.hx, b.hx, -b.hz, b.hz);
      if (!local) continue;
      const hit = {
        ox: local.ox * b.cos - local.oz * b.sin,
        oz: local.ox * b.sin + local.oz * b.cos,
        pen: local.pen,
        nx: local.nx * b.cos - local.nz * b.sin,
        nz: local.nx * b.sin + local.nz * b.cos,
      };
      if (!best || hit.pen > best.pen) best = hit;
    }
    if (!best || best.pen < 1e-6) break;
    p.x += best.ox;
    p.z += best.oz;
    if (vel) {
      const vn = vel.x * best.nx + vel.z * best.nz;
      if (vn < 0) {
        vel.x -= best.nx * vn;
        vel.z -= best.nz * vn;
      }
    }
  }
  if (![p.x, p.z].every(Number.isFinite)) p.set(0, 0, 0);
  p.x = clamp(p.x, -59, 59);
  p.z = clamp(p.z, -59, 59);
}

/* ---------- プレイヤー更新 ---------- */
function updatePlayer(dt) {
  if (!player.alive) return;

  if (player.spawnProtT > 0) player.spawnProtT = Math.max(0, player.spawnProtT - dt);
  if (weapon.switchLock > 0) weapon.switchLock = Math.max(0, weapon.switchLock - dt);
  if (player.grenadeCd > 0) player.grenadeCd = Math.max(0, player.grenadeCd - dt);

  const k = input.keys;
  let mx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
  let mz = (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0);

  player.crouching = !!k.KeyC;
  const shiftHeld = !!(k.ShiftLeft || k.ShiftRight);
  // しゃがみ中の Shift はスプリントではなくスコープ（C+Shift）
  const bolting = isSniperBolting();
  player.sprinting = !player.healing && !player.nadeAim &&
    shiftHeld && mz < 0 && !player.crouching && !weapon.reloading && !input.rmb;
  // ボルトコッキング中はスコープ不可（撃てないのに覗ける違和感を防ぐ）
  const wantAds = !player.nadeAim && !player.healing && !bolting &&
    (input.rmb || (player.crouching && shiftHeld)) && !weapon.reloading && !player.sprinting;
  weapon.ads = wantAds;

  player.targetEyeH = player.crouching ? 1.06 : 1.62;
  player.eyeH = lerp(player.eyeH, player.targetEyeH, 1 - Math.exp(-12 * dt));

  // 空中はスプリント速度を出さない（ホッピング移動のナーフ）
  const canSprint = player.sprinting && player.onGround;
  let speed = player.crouching ? 2.4 : (canSprint ? 7.2 : 4.6);
  // 武器ごとの移動差（グレ構えはアサルト基準）。切替直後は滑らかに追従
  const wantMoveMul = player.nadeAim
    ? WEAPON_DEFS.assault.moveMul
    : (activeDef().moveMul || 1);
  player.moveMul = lerp(player.moveMul, wantMoveMul, 1 - Math.exp(-6 * dt));
  speed *= player.moveMul;
  if (weapon.ads && !player.nadeAim) speed *= activeDef().adsMoveMul || 0.55;
  if (player.healing) speed *= 0.35;

  updateHeal(dt);
  if (player.nadeAim) updateNadeArc();

  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  const wx = (mx * cos + mz * sin);
  const wz = (-mx * sin + mz * cos);
  const wl = Math.hypot(wx, wz) || 1;
  const accel = player.onGround ? 14 : 4;
  player.vel.x = lerp(player.vel.x, wx / wl * speed * (mx || mz ? 1 : 0), 1 - Math.exp(-accel * dt));
  player.vel.z = lerp(player.vel.z, wz / wl * speed * (mx || mz ? 1 : 0), 1 - Math.exp(-accel * dt));

  player.vel.y -= 13.5 * dt;
  if (player.jumpCd > 0) player.jumpCd = Math.max(0, player.jumpCd - dt);
  // 着地直後は再ジャンプ不可（1回目のジャンプは強くてよい／連続ホッピングだけ抑える）
  if (k.Space && player.onGround && player.jumpCd <= 0) {
    player.vel.y = 4.6;
    player.onGround = false;
  }
  const colH = player.targetEyeH + 0.2;
  if (!insideAnySolid(player.pos, colH)) {
    player.safeX = player.pos.x;
    player.safeZ = player.pos.z;
  }
  const steps = 4;
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    player.pos.x += player.vel.x * sdt;
    player.pos.z += player.vel.z * sdt;
    resolveCollision(player.pos, player.radius, colH, player.vel);
  }
  player.pos.y += player.vel.y * dt;
  if (player.pos.y <= 0) {
    if (!player.onGround) {
      if (player.vel.y < -5) { AudioSys.land(); weapon.kickR += 0.05; }
      player.jumpCd = 0.28;
    }
    player.pos.y = 0; player.vel.y = 0; player.onGround = true;
  }
  resolveCollision(player.pos, player.radius, colH, player.vel);
  // 中心が固体の中に残ったら、そのフレームの移動を破棄
  if (insideAnySolid(player.pos, colH) && player.safeX !== undefined) {
    player.pos.x = player.safeX;
    player.pos.z = player.safeZ;
    player.vel.x = 0;
    player.vel.z = 0;
  }

  player.lean = lerp(player.lean, -mx * 0.014, 1 - Math.exp(-8 * dt));

  const spd = Math.hypot(player.vel.x, player.vel.z);
  if (spd > 0.5 && player.onGround) {
    const prev = Math.sin(player.bobPhase);
    player.bobPhase += spd * dt * 1.85;
    const cur = Math.sin(player.bobPhase);
    if (prev >= 0 && cur < 0) AudioSys.step(player.sprinting);
  }

  // TDM は自動回復なし（キット運用を強制）
  if (game.mode !== 'tdm' && player.hp < 100 && game.time - player.lastDamage > player.regenDelay) {
    player.hp = Math.min(100, player.hp + 11 * dt);
    updateHealthHUD();
  }

  const bobY = Math.sin(player.bobPhase * 2) * 0.028 * clamp(spd / 5, 0, 1);
  const bobX = Math.cos(player.bobPhase) * 0.016 * clamp(spd / 5, 0, 1);
  camera.position.set(
    player.pos.x + bobX * cos,
    player.pos.y + player.eyeH + bobY,
    player.pos.z - bobX * sin
  );

  player.recoilP = lerp(player.recoilP, 0, 1 - Math.exp(-7 * dt));
  player.recoilY = lerp(player.recoilY, 0, 1 - Math.exp(-7 * dt));

  camera.rotation.set(
    clamp(player.pitch + player.recoilP, -1.5, 1.5),
    player.yaw + player.recoilY,
    player.lean
  );

  if (input.lmb && !player.nadeAim) tryFire(game.time);
}

/* ---------- 武器（見た目）更新 ---------- */
function updateWeapon(dt) {
  const g = weapon.gun;
  if (!g) return;
  const def = activeDef();

  weapon.adsT = clamp(weapon.adsT + (weapon.ads ? dt : -dt) * 7, 0, 1);
  const t = weapon.adsT * weapon.adsT * (3 - 2 * weapon.adsT);

  const targetFov = player.sprinting ? 80 : lerp(75, def.adsFov, t);
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-14 * dt));
    camera.updateProjectionMatrix();
  }

  const hip = def.hip, ads = def.ads;
  let px = lerp(hip.x, ads.x, t), py = lerp(hip.y, ads.y, t), pz = lerp(hip.z, ads.z, t);
  let rx = lerp(hip.rx, ads.rx, t), ry = lerp(hip.ry, ads.ry, t);

  if (player.sprinting) {
    py -= 0.07; rx -= 0.5; ry += 0.35;
  }
  if (weapon.reloading) {
    const rp = Math.sin((weapon.reloadT / weapon.reloadDur) * Math.PI);
    py -= 0.13 * rp; rx -= 0.75 * rp; ry -= 0.25 * rp;
  }

  const spd = Math.hypot(player.vel.x, player.vel.z);
  const bobA = clamp(spd / 5, 0, 1) * (1 - t * 0.85);
  px += Math.cos(player.bobPhase) * 0.008 * bobA;
  py += Math.sin(player.bobPhase * 2) * 0.006 * bobA;
  py += Math.sin(game.time * 1.6) * 0.0016 * (t > 0.5 ? 1 : 0.3);
  weapon.swayX = lerp(weapon.swayX, 0, 1 - Math.exp(-8 * dt));
  weapon.swayY = lerp(weapon.swayY, 0, 1 - Math.exp(-8 * dt));
  px += weapon.swayX * (1 - t * 0.8);
  py += weapon.swayY * (1 - t * 0.8);

  weapon.kickZ = lerp(weapon.kickZ, 0, 1 - Math.exp(-11 * dt));
  weapon.kickR = lerp(weapon.kickR, 0, 1 - Math.exp(-11 * dt));
  pz += weapon.kickZ;
  rx += weapon.kickR;

  g.position.set(px, py, pz);
  g.rotation.set(rx, ry, 0);

  weapon.flash.material.opacity *= Math.exp(-28 * dt);
  weapon.flashLight.intensity *= Math.exp(-30 * dt);

  weapon.bloom = Math.max(0, weapon.bloom - def.bloomDecay * dt);

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
      saveActiveAmmo();
      updateAmmoHUD();
    }
  }

  const gapPx = 8 + currentSpread() * 780;
  document.documentElement.style.setProperty('--gap', `${gapPx.toFixed(1)}px`);
  const chEl = document.getElementById('crosshair');
  const scopeEl = document.getElementById('scopeoverlay');
  const sniperAds = arsenal.activeId === 'sniper' && t > 0.05 && !player.nadeAim;
  if (player.nadeAim) {
    g.visible = false;
    if (scopeEl) scopeEl.style.opacity = '0';
    chEl.style.opacity = 1;
  } else if (arsenal.activeId === 'sniper') {
    // 覗き込みが進んだら不透明な3D銃身を隠し、視界を2Dスコープに渡す
    g.traverse(o => {
      if (o.userData && o.userData.hideOnAds) o.visible = t < 0.35;
    });
    g.visible = t < 0.72;
    if (scopeEl) scopeEl.style.opacity = String(clamp((t - 0.25) / 0.55, 0, 1));
    // 腰撃ち時は通常レティクル。ADS／スプリント中のみ消す
    chEl.style.opacity = (t > 0.05 || player.sprinting) ? 0 : 1;
  } else if (arsenal.activeId === 'pistol' || arsenal.activeId === 'shotgun') {
    // ハンドガン／ショットガンADS＝腰撃ち固定。レティクルは残し、広がりだけ絞る
    g.visible = true;
    if (scopeEl) scopeEl.style.opacity = '0';
    chEl.style.opacity = player.sprinting ? 0 : 1;
  } else {
    g.visible = true;
    if (scopeEl) scopeEl.style.opacity = '0';
    chEl.style.opacity = (weapon.ads || player.sprinting) ? 0 : 1;
  }
  if (!sniperAds && scopeEl && arsenal.activeId !== 'sniper' && !player.nadeAim) scopeEl.style.opacity = '0';
}

/* ---------- 入力 ---------- */
function initInput() {
  document.addEventListener('keydown', e => {
    input.keys[e.code] = true;
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyQ') { if (!player.nadeAim) cycleWeapon(1); }
    if (e.code === 'KeyE') { if (!player.nadeAim) cycleWeapon(-1); }
    if (e.code === 'KeyG') toggleNadeAim();
    if (e.code === 'KeyF') startHeal();
    if (e.code === 'Space') e.preventDefault();
  });
  document.addEventListener('keyup', e => { input.keys[e.code] = false; });
  document.addEventListener('mousedown', e => {
    if (game.state !== 'playing') return;
    // ESC 後やリスポーン待ちでロックが外れたとき、クリックで復帰
    if (!game.noLock && !document.pointerLockElement) ensurePointerLock();
    if (e.button === 0) {
      if (player.nadeAim) {
        throwGrenade();
        return;
      }
      if (player.healing) cancelHeal();
      input.lmb = true;
    }
    if (e.button === 2) input.rmb = true;
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 0) { input.lmb = false; weapon.semiLocked = false; }
    if (e.button === 2) input.rmb = false;
  });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('mousemove', e => {
    if (game.state !== 'playing' || document.pointerLockElement === null) return;
    const def = activeDef();
    const sens = 0.0021 * (weapon.ads ? def.adsSens : 1);
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
