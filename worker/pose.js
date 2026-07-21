/**
 * オンライン用ポーズの検証・正規化
 */
const WEAPONS = new Set(['assault', 'smg', 'shotgun', 'pistol', 'sniper']);

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function sanitizeWeapon(id) {
  const w = String(id || 'assault');
  return WEAPONS.has(w) ? w : 'assault';
}

export function sanitizePose(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    x: clamp(Number(src.x) || 0, -59, 59),
    z: clamp(Number(src.z) || 0, -59, 59),
    yaw: Number(src.yaw) || 0,
    pitch: clamp(Number(src.pitch) || 0, -1.4, 1.4),
    crouch: !!src.crouch,
    weapon: sanitizeWeapon(src.weapon),
    seq: (Number(src.seq) || 0) >>> 0,
  };
}

/** 最短回転で yaw を alpha 分だけ to へ寄せる */
export function lerpYaw(from, to, alpha) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * alpha;
}
