/**
 * オンライン勝負ギア（グレ・回復・ルート）の純ロジック
 */
import { clamp, sanitizeWeapon } from './pose.js';

export { sanitizeWeapon };

/** プレイヤー被弾半径（クライアント explodeGrenade と揃える） */
export const NADE_PLAYER_R = 9.6;
/** 敵/他プレイヤー被弾半径 */
export const NADE_AOE_R = 14;

const NADE_FUSE_MIN_MS = 1500;
const NADE_FUSE_MAX_MS = 4000;
const NADE_THROW_CD_MS = 400;
const NADE_BOOM_MAX_FROM_POSE = 90;

export function grenadeDmgAt(dist) {
  if (!(dist < NADE_PLAYER_R)) return 0;
  const t = clamp(dist / NADE_PLAYER_R, 0, 1);
  return Math.round(38 + (6 - 38) * (t * t));
}

/** 他プレイヤーへの AoE（味方軽減なし・オンラインは敵のみ） */
export const NADE_PEER_R = NADE_AOE_R;

export function grenadePeerDmgAt(dist) {
  if (!(dist < NADE_PEER_R)) return 0;
  const t = clamp(dist / NADE_PEER_R, 0, 1);
  return Math.round(110 + (28 - 110) * (t * t));
}

export function dist3(ax, ay, az, bx, by, bz) {
  return Math.hypot((ax || 0) - (bx || 0), (ay || 0) - (by || 0), (az || 0) - (bz || 0));
}

export function sanitizeNadeThrow(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    x: clamp(Number(src.x) || 0, -59, 59),
    y: clamp(Number(src.y) || 1.5, 0.05, 8),
    z: clamp(Number(src.z) || 0, -59, 59),
    vx: clamp(Number(src.vx) || 0, -40, 40),
    vy: clamp(Number(src.vy) || 0, -40, 40),
    vz: clamp(Number(src.vz) || 0, -40, 40),
  };
}

export function sanitizeBoomPos(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    x: clamp(Number(src.x) || 0, -59, 59),
    y: clamp(Number(src.y) || 0.1, 0, 12),
    z: clamp(Number(src.z) || 0, -59, 59),
  };
}

/**
 * @returns {{ ok:false, reason:string } | { ok:true, grenades:number }}
 */
export function validateNadeThrow(session, now) {
  if (!session || !session.alive || session.hp <= 0) {
    return { ok: false, reason: 'dead' };
  }
  if ((session.grenades || 0) <= 0) return { ok: false, reason: 'empty' };
  if (session.lastNadeAt && now - session.lastNadeAt < NADE_THROW_CD_MS) {
    return { ok: false, reason: 'cd' };
  }
  if (session.pendingNade) return { ok: false, reason: 'pending' };
  return { ok: true, grenades: (session.grenades || 0) - 1 };
}

/**
 * @returns {{ ok:false, reason:string } | { ok:true, pos:object }}
 */
export function validateNadeBoom(session, rawPos, now) {
  if (!session || !session.pendingNade) return { ok: false, reason: 'no_pending' };
  const elapsed = now - (session.lastNadeAt || 0);
  if (elapsed < NADE_FUSE_MIN_MS || elapsed > NADE_FUSE_MAX_MS) {
    return { ok: false, reason: 'fuse' };
  }
  const pos = sanitizeBoomPos(rawPos);
  if (session.pose) {
    const d = Math.hypot(pos.x - session.pose.x, pos.z - session.pose.z);
    if (d > NADE_BOOM_MAX_FROM_POSE) return { ok: false, reason: 'far' };
  }
  return { ok: true, pos };
}

/**
 * @returns {{ ok:false, reason:string } | { ok:true, healStartedAt:number }}
 */
export function beginHeal(session, now) {
  if (!session || !session.alive || session.hp <= 0) {
    return { ok: false, reason: 'dead' };
  }
  if ((session.medkits || 0) <= 0) return { ok: false, reason: 'empty' };
  if (session.hp >= 100) return { ok: false, reason: 'full' };
  if (session.healStartedAt) return { ok: false, reason: 'busy' };
  return { ok: true, healStartedAt: Number(now) || Date.now() };
}

export function cancelHealChannel(session) {
  if (session) session.healStartedAt = 0;
}

/** クライアント healDur=2s。ネット遅延を見て ±400ms、上限は+1.5s */
export const HEAL_CHANNEL_MS = 2000;
export const HEAL_EARLY_MS = 1600;
export const HEAL_LATE_MS = 3500;

/**
 * @returns {{ ok:false, reason:string } | { ok:true, hp:number, medkits:number }}
 */
export function applyHeal(session, now = Date.now()) {
  if (!session || !session.alive || session.hp <= 0) {
    return { ok: false, reason: 'dead' };
  }
  if ((session.medkits || 0) <= 0) return { ok: false, reason: 'empty' };
  if (session.hp >= 100) return { ok: false, reason: 'full' };
  if (!session.healStartedAt) return { ok: false, reason: 'no_channel' };
  const elapsed = (Number(now) || 0) - session.healStartedAt;
  if (elapsed < HEAL_EARLY_MS) return { ok: false, reason: 'early' };
  if (elapsed > HEAL_LATE_MS) return { ok: false, reason: 'late' };
  const hp = Math.min(100, session.hp + 50);
  session.healStartedAt = 0;
  return { ok: true, hp, medkits: session.medkits - 1 };
}

const LOADOUT_POOL = new Set(['assault', 'smg', 'shotgun', 'sniper']);

/**
 * メイン＋サブ（重複不可）＋常備ピストル
 */
export function sanitizeLoadout(mainId, subId) {
  let main = sanitizeWeapon(mainId);
  if (!LOADOUT_POOL.has(main)) main = 'assault';
  let sub = sanitizeWeapon(subId);
  if (!LOADOUT_POOL.has(sub)) sub = 'smg';
  if (sub === main) {
    sub = ['smg', 'assault', 'shotgun', 'sniper'].find((w) => w !== main) || 'smg';
  }
  const owned = {
    assault: false,
    smg: false,
    shotgun: false,
    sniper: false,
    sr_surv: false,
    sg_surv: false,
    pistol: true,
  };
  owned[main] = true;
  owned[sub] = true;
  return { main, sub, owned, weapon: main };
}

export function ownsWeapon(session, weaponId) {
  const w = sanitizeWeapon(weaponId);
  if (w === 'pistol') return true;
  if (!session || !session.owned) {
    // 未設定時はデフォルト（アサルト＋SMG）
    return w === 'assault' || w === 'smg';
  }
  return !!session.owned[w];
}

export function defaultLoadout() {
  const lo = sanitizeLoadout('assault', 'smg');
  return {
    grenades: 2,
    medkits: 2,
    grenadeMax: 5,
    medkitMax: 3,
    armor: false,
    extMag: false,
    weapon: lo.weapon,
    main: lo.main,
    sub: lo.sub,
    owned: lo.owned,
    pendingNade: false,
    lastNadeAt: 0,
    healStartedAt: 0,
    lastRespawnAt: 0,
  };
}

/**
 * hibernation 復帰用の WS attachment。戦闘状態（hp/owned 等）を含める。
 */
export function buildSessionAttachment(session) {
  if (!session) return null;
  const lo = sanitizeLoadout(session.main, session.sub);
  return {
    id: session.id,
    room: session.room,
    team: session.team,
    token: session.token || '',
    role: session.role || 'active',
    name: session.name,
    joinedAt: session.joinedAt,
    hp: Number.isFinite(session.hp) ? session.hp : 100,
    alive: session.alive !== false,
    grenades: session.grenades,
    medkits: session.medkits,
    armor: !!session.armor,
    extMag: !!session.extMag,
    weapon: session.weapon || lo.weapon,
    main: session.main || lo.main,
    sub: session.sub || lo.sub,
    owned: session.owned || lo.owned,
    spawnProtUntil: session.spawnProtUntil || 0,
    lastRespawnAt: session.lastRespawnAt || 0,
  };
}

/** tdmDrop と同じ分布（rng = [0,1)） */
export function pickDeathDrop(rng = Math.random) {
  const r = rng();
  if (r < 0.4) return 'ammo';
  if (r < 0.7) return 'med';
  return 'nade';
}

/** 中央補給バンドル（内容×2 + たまに防具／拡張マガ／マップ限定強武器） */
export function pickSupplyBundle(rng = Math.random, mapId = 'desert') {
  const types = ['ammo', 'ammo', 'med', 'med', 'nade', 'nade'];
  if (rng() < 0.22) types.push('armor');
  if (rng() < 0.28) types.push('extmag');
  if (rng() < 0.28) types.push(mapId === 'jungle' ? 'sg_surv' : 'sr_surv');
  return types;
}

function ensureOwned(inv) {
  if (!inv.owned || typeof inv.owned !== 'object') {
    inv.owned = sanitizeLoadout(inv.main, inv.sub).owned;
  }
  if (inv.owned.sr_surv === undefined) inv.owned.sr_surv = false;
  if (inv.owned.sg_surv === undefined) inv.owned.sg_surv = false;
  return inv.owned;
}

/**
 * @returns {{ ok:boolean, reason?:string, granted?:object }}
 */
export function tryGrantLoot(inv, type) {
  if (!inv) return { ok: false, reason: 'inv' };
  if (type === 'nade') {
    const max = inv.grenadeMax || 5;
    if ((inv.grenades || 0) >= max) return { ok: false, reason: 'max' };
    inv.grenades = (inv.grenades || 0) + 1;
    return { ok: true, granted: { grenades: inv.grenades } };
  }
  if (type === 'med') {
    const max = inv.medkitMax || 3;
    if ((inv.medkits || 0) >= max) return { ok: false, reason: 'max' };
    inv.medkits = (inv.medkits || 0) + 1;
    return { ok: true, granted: { medkits: inv.medkits } };
  }
  if (type === 'armor') {
    if (inv.armor) return { ok: false, reason: 'has' };
    inv.armor = true;
    return { ok: true, granted: { armor: true } };
  }
  if (type === 'extmag') {
    if (inv.extMag) return { ok: false, reason: 'has' };
    inv.extMag = true;
    return { ok: true, granted: { extMag: true } };
  }
  if (type === 'sr_surv') {
    const owned = ensureOwned(inv);
    if (owned.sr_surv) return { ok: true, granted: { type: 'sr_surv', ammo: true } };
    if (owned.sniper) {
      owned.sniper = false;
      owned.sr_surv = true;
      return { ok: true, granted: { type: 'sr_surv', upgraded: true } };
    }
    owned.sniper = true;
    return { ok: true, granted: { type: 'sniper' } };
  }
  if (type === 'sg_surv') {
    const owned = ensureOwned(inv);
    if (owned.sg_surv) return { ok: true, granted: { type: 'sg_surv', ammo: true } };
    if (owned.shotgun) {
      owned.shotgun = false;
      owned.sg_surv = true;
      return { ok: true, granted: { type: 'sg_surv', upgraded: true } };
    }
    owned.shotgun = true;
    return { ok: true, granted: { type: 'shotgun' } };
  }
  if (type === 'ammo') {
    return { ok: true, granted: { ammo: 45 } };
  }
  return { ok: false, reason: 'type' };
}
