/**
 * オンライン戦闘の純ロジック（ダメージ・ヒット検証）
 */
import { clamp } from './pose.js';
import { ownsWeapon } from './gear.js';
import { lineOfSightClear, poseEyeY } from './map-solids.js';

export const WEAPON_DMG = {
  assault: { head: 70, torso: 34, limb: 24 },
  smg: { head: 50, torso: 26, limb: 18 },
  // 近距離胴全弾 (15×8=120) で一撃。頭 20×8 / 肢 10×8
  shotgun: { head: 20, torso: 15, limb: 10 },
  pistol: { head: 55, torso: 28, limb: 18 },
  sniper: { head: 200, torso: 95, limb: 55 },
};

export const WEAPON_FALLOFF = {
  smg: { start: 18, end: 35, min: 0.65 },
  shotgun: { start: 12, end: 25, min: 0.5 },
  pistol: { start: 15, end: 30, min: 0.7 },
  assault: { start: 28, end: 50, min: 0.82 },
};

/** 連射間隔（ms）。サーバー側は少し甘めに見る */
export const WEAPON_FIRE_MS = {
  assault: 80,
  smg: 70,
  shotgun: 850,
  pistol: 180,
  sniper: 1400,
};

/** ショットガン1発あたりのペレット数（クライアント def.pellets と揃える） */
export const SHOTGUN_PELLETS = 8;
/** 同一ポンプ内のペレット到達猶予 */
export const SHOTGUN_PELLET_WINDOW_MS = 120;

const PARTS = new Set(['head', 'torso', 'limb']);
const MAX_RANGE = 120;

export function sanitizePart(part) {
  const p = String(part || 'torso');
  return PARTS.has(p) ? p : 'torso';
}

export function falloffMul(weapon, dist) {
  const f = WEAPON_FALLOFF[weapon];
  if (!f) return 1;
  if (dist <= f.start) return 1;
  if (dist >= f.end) return f.min;
  const t = (dist - f.start) / (f.end - f.start);
  return 1 + (f.min - 1) * t;
}

export function computeDamage(weapon, part, dist) {
  const table = WEAPON_DMG[weapon];
  const p = sanitizePart(part);
  if (!table) return 0;
  const base = table[p] || 0;
  return Math.max(1, Math.round(base * falloffMul(weapon, dist)));
}

export function poseDist(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
}

/**
 * 連射／ショットガンペレット窓の可否（副作用なし）
 * @returns {{ ok:false, reason:string } | { ok:true, newShot:boolean }}
 */
export function canFire(attacker, weapon, now) {
  const minMs = WEAPON_FIRE_MS[weapon] || 100;
  const last = attacker.lastFireAt || 0;
  const elapsed = last ? now - last : Infinity;

  if (weapon === 'shotgun') {
    if (!last || elapsed >= minMs * 0.75) {
      return { ok: true, newShot: true };
    }
    if (elapsed <= SHOTGUN_PELLET_WINDOW_MS
      && (attacker.shotgunPellets || 0) < SHOTGUN_PELLETS) {
      return { ok: true, newShot: false };
    }
    return { ok: false, reason: 'rate' };
  }

  if (last && elapsed < minMs * 0.75) {
    return { ok: false, reason: 'rate' };
  }
  return { ok: true, newShot: true };
}

/** validateHit 成功後に呼ぶ。lastFireAt / ペレット数を更新 */
export function markFired(attacker, weapon, now, fireInfo) {
  if (!attacker) return;
  if (weapon === 'shotgun') {
    if (fireInfo && fireInfo.newShot) {
      attacker.lastFireAt = now;
      attacker.shotgunPellets = 1;
    } else {
      attacker.shotgunPellets = (attacker.shotgunPellets || 0) + 1;
    }
    return;
  }
  attacker.lastFireAt = now;
}

/**
 * @returns {{ ok:false, reason:string } | { ok:true, dmg:number, dist:number, newShot:boolean, part:string }}
 */
export function validateHit({
  attacker,
  victim,
  part,
  weapon,
  now,
  map,
}) {
  if (!attacker || !victim) return { ok: false, reason: 'missing' };
  if (!attacker.alive || attacker.hp <= 0) return { ok: false, reason: 'attacker_dead' };
  if (!victim.alive || victim.hp <= 0) return { ok: false, reason: 'victim_dead' };
  if (attacker.team === victim.team) return { ok: false, reason: 'friendly' };
  if (victim.spawnProtUntil && now < victim.spawnProtUntil) {
    return { ok: false, reason: 'spawn_prot' };
  }
  if (!WEAPON_DMG[weapon]) return { ok: false, reason: 'weapon' };
  if (!ownsWeapon(attacker, weapon)) return { ok: false, reason: 'unowned' };
  const hitPart = sanitizePart(part);
  const dist = poseDist(attacker.pose, victim.pose);
  if (!(dist <= MAX_RANGE)) return { ok: false, reason: 'range' };

  if (attacker.pose && victim.pose) {
    const ay = poseEyeY(attacker.pose, attacker.crouch || attacker.pose.crouch);
    const by = poseEyeY(victim.pose, victim.crouch || victim.pose.crouch);
    if (!lineOfSightClear(
      map,
      attacker.pose.x, ay, attacker.pose.z,
      victim.pose.x, by, victim.pose.z,
    )) {
      return { ok: false, reason: 'los' };
    }
  }

  const fire = canFire(attacker, weapon, now);
  if (!fire.ok) return fire;

  const dmg = computeDamage(weapon, hitPart, dist);
  if (dmg <= 0) return { ok: false, reason: 'dmg' };
  return { ok: true, dmg, dist, newShot: fire.newShot, part: hitPart };
}

export function scaleByArmor(dmg, victim) {
  if (!victim || !victim.armor) return dmg;
  return Math.max(1, Math.round(dmg * 0.72));
}

export function applyDamage(victim, dmg) {
  const scaled = scaleByArmor(dmg, victim);
  const hp = Math.max(0, (victim.hp || 0) - scaled);
  const kill = hp <= 0;
  return { hp, kill, dmg: scaled };
}

/** 人間リスポーンの最短間隔（連打全快を防ぐ） */
export const RESPAWN_MIN_MS = 1500;
export const SPAWN_PROT_MS = 2000;

/**
 * 死亡済み・live 中のみ許可。生存中の t:'respawn' 連打による全快を拒む。
 * @returns {{ ok:true } | { ok:false, reason:string }}
 */
export function canRespawn(session, phase, now = Date.now(), minMs = RESPAWN_MIN_MS) {
  if (!session) return { ok: false, reason: 'session' };
  if (session.role === 'waiting') return { ok: false, reason: 'waiting' };
  if (phase !== 'live') return { ok: false, reason: 'phase' };
  if (session.alive !== false) return { ok: false, reason: 'alive' };
  const last = Number(session.lastRespawnAt) || 0;
  const t = Number(now) || 0;
  if (last && t - last < minMs) return { ok: false, reason: 'cooldown' };
  return { ok: true };
}

/** 全快＋スポーン無敵。canRespawn 通過後に呼ぶ。 */
export function applyRespawn(session, now = Date.now(), protMs = SPAWN_PROT_MS) {
  const t = Number(now) || Date.now();
  session.hp = 100;
  session.alive = true;
  session.spawnProtUntil = t + protMs;
  session.lastRespawnAt = t;
  session.pendingNade = false;
  return { hp: session.hp, spawnProtUntil: session.spawnProtUntil };
}
