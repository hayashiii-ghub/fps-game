/**
 * オンライン戦闘の純ロジック（ダメージ・ヒット検証）
 */
import { clamp } from './pose.js';

export const WEAPON_DMG = {
  assault: { head: 110, torso: 34, limb: 24 },
  smg: { head: 78, torso: 26, limb: 18 },
  shotgun: { head: 14, torso: 10, limb: 7 },
  pistol: { head: 90, torso: 28, limb: 18 },
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

const PARTS = new Set(['head', 'torso', 'limb']);
const MAX_RANGE = 120;

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
  if (!table || !PARTS.has(part)) return 0;
  const base = table[part] || 0;
  return Math.max(1, Math.round(base * falloffMul(weapon, dist)));
}

export function poseDist(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
}

/**
 * @returns {{ ok:false, reason:string } | { ok:true, dmg:number, dist:number }}
 */
export function validateHit({
  attacker,
  victim,
  part,
  weapon,
  now,
}) {
  if (!attacker || !victim) return { ok: false, reason: 'missing' };
  if (!attacker.alive || attacker.hp <= 0) return { ok: false, reason: 'attacker_dead' };
  if (!victim.alive || victim.hp <= 0) return { ok: false, reason: 'victim_dead' };
  if (attacker.team === victim.team) return { ok: false, reason: 'friendly' };
  if (victim.spawnProtUntil && now < victim.spawnProtUntil) {
    return { ok: false, reason: 'spawn_prot' };
  }
  if (!PARTS.has(part)) return { ok: false, reason: 'part' };
  if (!WEAPON_DMG[weapon]) return { ok: false, reason: 'weapon' };
  const dist = poseDist(attacker.pose, victim.pose);
  if (!(dist <= MAX_RANGE)) return { ok: false, reason: 'range' };
  const minMs = WEAPON_FIRE_MS[weapon] || 100;
  if (attacker.lastFireAt && now - attacker.lastFireAt < minMs * 0.75) {
    return { ok: false, reason: 'rate' };
  }
  const dmg = computeDamage(weapon, part, dist);
  if (dmg <= 0) return { ok: false, reason: 'dmg' };
  return { ok: true, dmg, dist };
}

export function applyDamage(victim, dmg) {
  const hp = Math.max(0, (victim.hp || 0) - dmg);
  const kill = hp <= 0;
  return { hp, kill };
}

export { clamp };
