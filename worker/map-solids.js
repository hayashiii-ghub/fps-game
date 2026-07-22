/**
 * オンライン射線用のマップ固体 OBB（植生・thicket は載せない）。
 * 座標は world.js の移動コライダ（明示 OBB / 葉登録の見た目寸法）と対応。
 */
import { sanitizeMap } from './pose.js';

function snapYaw(yaw) {
  const q = Math.PI * 0.5;
  return Math.round((yaw || 0) / q) * q;
}

function solid(cx, cy, cz, hx, hy, hz, yaw = 0) {
  const y = yaw || 0;
  // sin 反転で Three.js Y 回転と world.js pushYawObb / resolveCollision に揃える
  return {
    cx, cy, cz, hx, hy, hz,
    cos: Math.cos(y),
    sin: -Math.sin(y),
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

/** world.js grotto — 壁2枚のみ（天井は decor） */
function grotto(x, z, rotY) {
  const yaw = rotY || 0;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const toWorld = (lx, lz) => ({
    cx: x + lx * cos + lz * sin,
    cz: z - lx * sin + lz * cos,
  });
  const wL = toWorld(0, -2.9);
  const wR = toWorld(-3.4, 0);
  return [
    solid(wL.cx, 1.8, wL.cz, 3.7, 1.8, 0.6, yaw),
    solid(wR.cx, 1.7, wR.cz, 0.6, 1.7, 2.8, yaw),
  ];
}

/** world.js addBerms([0,±62,128,6] / [±62,0,6,128]) */
function berm(x, z, w, d) {
  return solid(x, 0.8, z, w * 0.5, 1.3, d * 0.5, 0);
}

function sandbags(x, z, rotY) {
  return solid(x, 0.44, z, 2.05, 0.44, 0.55, rotY || 0);
}

/** world.js barrier — 壁＋足の葉メッシュと同寸 */
function barrier(x, z, rotY) {
  const yaw = rotY || 0;
  return [
    solid(x, 0.85, z, 1.8, 0.625, 0.15, yaw),
    solid(x, 0.25, z, 1.8, 0.25, 0.45, yaw),
  ];
}

function wreck(x, z, rotY) {
  return solid(x, 1.2, z, 2.2, 0.95, 1.42, rotY || 0);
}

function crate(x, z, s, rotY, y = 0) {
  const cy = (y || 0) + s * 0.5;
  return solid(x, cy, z, s * 0.5, s * 0.5, s * 0.5, rotY || 0);
}

/** world.js fallenLog — 長さ4・半径0.33・長軸=ローカルX */
function fallenLog(x, z, rotY) {
  return solid(x, 0.33, z, 2.0, 0.33, 0.33, rotY || 0);
}

function barrel(x, z) {
  return solid(x, 0.48, z, 0.32, 0.475, 0.32, 0);
}

function watchtower(x, z) {
  return [
    solid(x, 2.2, z, 1.05, 2.2, 1.05, 0),
    solid(x, 5.1, z, 1.3, 0.75, 1.3, 0),
  ];
}

function pillar(x, z, h) {
  return solid(x, h / 2, z, 0.4, h / 2, 0.4, 0);
}

const BERMS = [
  berm(0, -62, 128, 6),
  berm(0, 62, 128, 6),
  berm(-62, 0, 6, 128),
  berm(62, 0, 6, 128),
];

const DESERT = [
  // buildings
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
  ...BERMS,
  // short walls
  solid(-10, 0.7, 0, 2.1, 0.7, 0.175, 0),
  solid(-12, 0.7, 1.6, 0.175, 0.7, 1.8, 0),
  solid(22, 0.7, -6, 1.9, 0.7, 0.175, 0.4),
  solid(23.6, 0.7, -4.2, 0.175, 0.7, 1.6, 0.4),
  solid(-20, 0.6, -30, 2.5, 0.6, 0.2, -0.2),
  solid(8, 0.6, 36, 0.2, 0.6, 2.0, 0.15),
  // sandbags
  sandbags(0, -6, 0),
  sandbags(-9, 3, 1.35),
  sandbags(14, 8, -0.4),
  sandbags(-22, -8, 0.5),
  sandbags(26, -8, 2.2),
  sandbags(6, 30, 0.9),
  sandbags(-36, -34, 0),
  sandbags(12, 18, 1.1),
  sandbags(-14, -18, -0.7),
  sandbags(38, 20, 0.3),
  sandbags(-38, -22, 1.8),
  sandbags(20, -28, 0.6),
  sandbags(-4, 8, 0.8),
  sandbags(16, -4, -1.2),
  sandbags(-28, 16, 0.25),
  sandbags(4, -20, 1.6),
  sandbags(30, 30, -0.3),
  sandbags(-42, 32, 1.0),
  sandbags(48, -40, 0.5),
  // barriers
  ...barrier(-4, 14, 0.2),
  ...barrier(20, -2, 1.6),
  ...barrier(-14, -30, -0.3),
  ...barrier(36, 6, 0.8),
  ...barrier(-40, 24, 1.2),
  ...barrier(12, 44, -0.15),
  ...barrier(8, -8, 0.1),
  ...barrier(-18, 10, 1.5),
  ...barrier(28, 12, -0.6),
  ...barrier(-8, -14, 0.9),
  ...barrier(0, 24, 0.05),
  ...barrier(2, -34, 1.4),
  ...barrier(-26, 36, 0.7),
  ...barrier(32, -24, -0.9),
  ...barrier(10, 12, 1.1),
  ...barrier(-34, -6, 0.35),
  ...barrier(44, 4, 1.7),
  ...barrier(-6, 40, -0.5),
  // wrecks
  wreck(-10, 44, 0.4),
  wreck(46, -16, -0.7),
  wreck(-34, 40, 1.9),
  wreck(14, 34, 2.4),
  wreck(-20, -36, -1.2),
  wreck(28, -38, 0.9),
  wreck(-8, 28, -1.5),
  // crates
  crate(3, 20, 1.05, 0.2), crate(4.3, 20.4, 1.05, -0.15), crate(3.6, 20.2, 1.0, 0.5, 1.05),
  crate(-26, 14, 1.1, 0.7), crate(-24.7, 14.6, 0.95, 0.1),
  crate(22, 26, 1.05, -0.4), crate(23.4, 25.5, 1.05, 0.3), crate(23, 26.2, 0.9, 0.8, 1.05),
  crate(-2, -26, 1.0, 0.9), crate(48, 12, 1.1, 0.2), crate(-50, -28, 1.05, 1.1),
  crate(9, 4, 1.05, 0.4), crate(10.2, 4.5, 1.0, -0.2), crate(9.5, 4.2, 0.9, 0.6, 1.05),
  crate(-11, -4, 1.1, 0.8), crate(-12.2, -3.4, 0.95, 0.15),
  crate(30, -20, 1.05, 0.55), crate(31.2, -19.4, 0.95, -0.3),
  crate(-27, 20, 1.0, -0.35), crate(-28.2, 20.6, 1.05, 0.5),
  crate(0, -10, 1.1, 0.2), crate(1.3, -9.5, 1.0, -0.4), crate(0.5, -9.8, 0.95, 0.7, 1.05),
  crate(36, 40, 1.05, 0.9), crate(-48, -36, 1.1, -0.6),
  // barrels / watchtowers
  barrel(5.6, 21.4), barrel(6.3, 20.9), barrel(-25.4, 13.2),
  barrel(21, 27.4), barrel(-45.5, 10.5), barrel(-44.6, 11.6),
  barrel(0.5, 5.2), barrel(-1.2, 4.6),
  barrel(16.5, -12), barrel(-29, 4.4),
  barrel(9.8, 5.2), barrel(-12.5, -2.8),
  barrel(25, 10), barrel(-5, 22), barrel(40, -8),
  ...watchtower(-38, -12),
  ...watchtower(42, 34),
  ...watchtower(18, -42),
];

const JUNGLE = [
  // temple hub — 屋根外形まで
  solid(6, 2.0, -8, 4.0, 2.0, 3.1, 0),
  ruinsWall(-7, 2, 6, 1.7, 0.12),
  ruinsWall(7, 4, 5, 1.4, -0.35),
  ruinsWall(-2, 8, 4.4, 1.25, 0.5),
  ruinsWall(-6, -6, 3.8, 2.1, 1.1),
  ruinsWall(2, -1, 2.8, 1.1, 0.2),
  pillar(-3.5, -3.5, 2.5),
  pillar(3.6, 6.4, 2.2),
  pillar(-8.5, -1.5, 1.4),
  pillar(8.6, -3.4, 2.6),
  pillar(-1.2, 3.4, 1.1),
  // rocks
  bigRock(10, 6, 1.55, 0.4),
  bigRock(-18, 2, 1.7, 1.1),
  bigRock(6, -18, 1.45, 0.2),
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
  ...grotto(30, 40, 0.5),
  ...BERMS,
  // cover props
  ...watchtower(44, -6),
  sandbags(33, -2, 0.3),
  sandbags(-38, 8, 1.2),
  sandbags(14, 14, 1.0),
  sandbags(-16, -16, 0.6),
  sandbags(18, -22, -0.5),
  sandbags(-24, 12, 1.7),
  ...barrier(-26, 26, 0.2),
  ...barrier(-36, 22, 1.35),
  ...barrier(-20, 30, -0.4),
  ...barrier(0, 22, 0.15),
  ...barrier(-2, -24, 1.5),
  fallenLog(10, 26, 0.9),
  fallenLog(-14, 24, -0.4),
  fallenLog(22, -12, 1.8),
  fallenLog(-20, -30, 0.3),
  wreck(24, 22, 1.2),
  wreck(-34, -30, -0.6),
  crate(41, 10, 1.05, 0.2), crate(42.2, 10.5, 0.95, -0.3),
  crate(4.5, -37, 1.05, 0.3), crate(5.8, -36.5, 1.0, -0.2), crate(5.1, -36.8, 0.95, 0.6, 1.05),
  crate(-33, -1, 1.05, 0.5), crate(-31.8, -0.4, 0.95, 0.1),
  crate(-40, 30, 1.05, 0.4), crate(-38.7, 30.5, 0.95, -0.25),
  crate(16, 32, 1.05, 0.7), crate(-10, -34, 1.0, 0.2),
  barrel(0.5, -36.2), barrel(1.4, -35.6), barrel(-27, -9),
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

/** ポーズの射線高さ（足元 y + 目線） */
export function poseEyeY(pose, crouch) {
  const base = pose && Number.isFinite(pose.y) ? pose.y : 0;
  return base + (crouch ? 1.05 : 1.55);
}
