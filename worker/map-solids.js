/**
 * オンライン射線用のマップ固体 OBB（植生・thicket は載せない）。
 * 座標は world.js の明示 OBB / building・container・bigRock と対応。
 */
import { sanitizeMap } from './pose.js';

function snapYaw(yaw) {
  const q = Math.PI * 0.5;
  return Math.round((yaw || 0) / q) * q;
}

function solid(cx, cy, cz, hx, hy, hz, yaw = 0) {
  const y = yaw || 0;
  return {
    cx, cy, cz, hx, hy, hz,
    cos: Math.cos(y),
    sin: Math.sin(y),
  };
}

function building(x, z, w, h, d, rotY) {
  return solid(x, h * 0.5, z, w * 0.5, h * 0.5, d * 0.5, snapYaw(rotY));
}

function container(x, z, rotY, baseY = 0) {
  return solid(x, baseY + 1.3, z, 3.05, 1.3, 1.225, snapYaw(rotY));
}

/** world.js bigRock の明示 OBB と同式 */
function bigRock(x, z, s, rotY) {
  const cy = s * 0.38;
  return solid(x, cy, z, s * 0.72, s * 0.7, s * 0.72, rotY || 0);
}

function ruinsWall(x, z, w, h, rotY) {
  return solid(x, h / 2, z, w / 2, h / 2, 0.55 / 2, rotY || 0);
}

function berm(x, z, w, d) {
  return solid(x, 0.8, z, w * 0.5, 1.3, d * 0.5, 0);
}

/** 線分 vs Yaw-OBB（ローカル AABB スラブ法）。端点が箱内でもヒット扱い。 */
export function segmentHitsSolid(ax, ay, az, bx, by, bz, o) {
  if (!o) return false;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;

  // world → local（中心相対・逆 yaw）
  const rx0 = ax - o.cx;
  const rz0 = az - o.cz;
  const lx0 = rx0 * o.cos + rz0 * o.sin;
  const lz0 = -rx0 * o.sin + rz0 * o.cos;
  const ly0 = ay - o.cy;

  const rx1 = bx - o.cx;
  const rz1 = bz - o.cz;
  const lx1 = rx1 * o.cos + rz1 * o.sin;
  const lz1 = -rx1 * o.sin + rz1 * o.cos;
  const ly1 = by - o.cy;

  const dlx = lx1 - lx0;
  const dly = ly1 - ly0;
  const dlz = lz1 - lz0;

  let tMin = 0;
  let tMax = 1;

  const slabs = [
    [lx0, dlx, -o.hx, o.hx],
    [ly0, dly, -o.hy, o.hy],
    [lz0, dlz, -o.hz, o.hz],
  ];
  for (const [p, d, lo, hi] of slabs) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false;
      continue;
    }
    let t1 = (lo - p) / d;
    let t2 = (hi - p) / d;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return false;
  }
  return true;
}

const DESERT = [
  // buildings (world.js buildDesertMap)
  building(-30, -22, 14, 5, 9, 0.25),
  building(31, 17, 11, 4.5, 8, -0.45),
  building(-6, -44, 10, 4, 7, 0.1),
  building(20, 42, 8, 3.8, 6, 0.6),
  building(-40, -40, 9, 4.2, 7, -0.3),
  // containers
  container(8, -18, 0.35),
  container(10.5, -24.5, 1.62),
  container(-16, 26, -0.2),
  container(-17, 32.5, 0.12),
  container(-16.5, 29.2, 0.05, 2.6),
  container(40, -34, 1.1),
  container(-44, 8, 0.9),
  container(-2, 2, 1.55),
  container(18, -14, 0.2),
  container(-30, 2, 1.62),
  container(24, 8, 1.2),
  container(-22, -22, 0.4),
  container(6, -40, 0.9),
  container(-48, -8, 1.4),
  // berms (map edge)
  berm(0, -58, 120, 4),
  berm(0, 58, 120, 4),
  berm(-58, 0, 4, 120),
  berm(58, 0, 4, 120),
  // short walls
  solid(-10, 0.7, 0, 2.1, 0.7, 0.175, 0),
  solid(-12, 0.7, 1.6, 0.175, 0.7, 1.8, 0),
  solid(22, 0.7, -6, 1.9, 0.7, 0.175, 0.4),
  solid(23.6, 0.7, -4.2, 0.175, 0.7, 1.6, 0.4),
  solid(-20, 0.6, -30, 2.5, 0.6, 0.2, -0.2),
  solid(8, 0.6, 36, 0.2, 0.6, 2.0, 0.15),
];

const JUNGLE = [
  // temple hub — world.js pushYawObb(6, 1.7, -8, 3.5, 1.7, 2.6, 0)
  solid(6, 1.7, -8, 3.5, 1.7, 2.6, 0),
  ruinsWall(-7, 2, 6, 1.7, 0.12),
  ruinsWall(7, 4, 5, 1.4, -0.35),
  ruinsWall(-2, 8, 4.4, 1.25, 0.5),
  ruinsWall(-6, -6, 3.8, 2.1, 1.1),
  ruinsWall(2, -1, 2.8, 1.1, 0.2),
  // lane rocks
  bigRock(10, 6, 1.55, 0.4),
  bigRock(-18, 2, 1.7, 1.1),
  bigRock(6, -18, 1.45, 0.2),
  // quarry / grotto rocks
  bigRock(-36, -6, 2.7, 0.4),
  bigRock(-43, 1, 2.1, 1.2),
  bigRock(-31, -14, 1.9, 0.8),
  bigRock(-45, -15, 1.5, 0.2),
  bigRock(-28, 5, 1.6, 1.9),
  bigRock(24, 46, 1.7, 0.9),
  bigRock(37, 34, 1.4, 0.1),
  // buildings / containers
  building(38, 4, 10, 4.2, 7, -0.2),
  building(30, 16, 8, 3.6, 6, 0.35),
  building(-32, 34, 12, 4, 8, 0.15),
  building(-18, 42, 8, 3.6, 6, -0.3),
  container(-10, -44, 0.04),
  container(-3.6, -44, -0.03),
  container(2.8, -44, 0.06),
  container(-6.8, -43.9, 0.02, 2.6),
  container(-7, -37.5, 1.58),
  // grotto walls (approx local → world at 32,42 yaw ~0.4) — simplified cover boxes
  solid(32, 1.8, 39.1, 3.7, 1.8, 0.6, 0.4),
  solid(28.6, 1.7, 42, 0.6, 1.7, 2.8, 0.4),
  berm(0, -58, 120, 4),
  berm(0, 58, 120, 4),
  berm(-58, 0, 4, 120),
  berm(58, 0, 4, 120),
];

const BY_MAP = {
  desert: DESERT,
  jungle: JUNGLE,
};

export function solidsForMap(mapId) {
  return BY_MAP[sanitizeMap(mapId)] || DESERT;
}

/**
 * attacker→victim の線分が固体に遮られていなければ true。
 * @returns {boolean}
 */
export function lineOfSightClear(mapId, ax, ay, az, bx, by, bz) {
  const solids = solidsForMap(mapId);
  for (const o of solids) {
    if (segmentHitsSolid(ax, ay, az, bx, by, bz, o)) return false;
  }
  return true;
}

/** ポーズの射線高さ（足元 y + 目線） */
export function poseEyeY(pose, crouch) {
  const base = pose && Number.isFinite(pose.y) ? pose.y : 0;
  return base + (crouch ? 1.05 : 1.55);
}
