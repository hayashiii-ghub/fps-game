/**
 * オンライン試合フェーズ・タイマー・参加ロールの純ロジック
 */
import { sanitizeMap } from './pose.js';

/** TDM 試合時間（秒）— クライアント TDM_MATCH_SEC と揃える */
export const MATCH_SEC = 300;

/** 切断後も identity を保持する時間 */
export const RESERVE_TTL_MS = 10 * 60 * 1000;

export function createMatchState() {
  return {
    phase: 'lobby', // lobby | live | ended
    map: 'desert',
    score: { blue: 0, red: 0 },
    endsAt: 0,
    startedAt: 0,
    supplyAcc: 0,
    supplyArmed: false,
  };
}

export function canStartMatch(state) {
  if (!state) return { ok: false, reason: 'state' };
  if (state.phase === 'live') return { ok: false, reason: 'live' };
  return { ok: true };
}

/**
 * @returns {{ ok:false, reason:string } | { ok:true }}
 */
export function startMatch(state, mapId, now) {
  const gate = canStartMatch(state);
  if (!gate.ok) return gate;
  const t = Number(now) || Date.now();
  state.phase = 'live';
  state.map = sanitizeMap(mapId);
  state.score = { blue: 0, red: 0 };
  state.startedAt = t;
  state.endsAt = t + MATCH_SEC * 1000;
  state.supplyAcc = 0;
  state.supplyArmed = false;
  return { ok: true };
}

export function timeLeftSec(state, now) {
  if (!state || state.phase !== 'live') return 0;
  const left = Math.max(0, (state.endsAt || 0) - (Number(now) || 0));
  return Math.ceil(left / 1000);
}

/**
 * live 中に endsAt を過ぎたら ended にする。戻り値: 終了したか
 */
export function tickMatch(state, now) {
  if (!state || state.phase !== 'live') return false;
  if ((Number(now) || 0) < (state.endsAt || 0)) return false;
  state.phase = 'ended';
  return true;
}

/**
 * 50ms スナップ／試合タイマーの高速 tick が必要か。
 * lobby / ended はイベント駆動にして DO を hibernate 可能にする。
 */
export function shouldFastTick(state) {
  return !!(state && state.phase === 'live');
}

export function matchPublic(state, now) {
  const t = Number(now) || Date.now();
  return {
    phase: state.phase || 'lobby',
    map: state.map || 'desert',
    match: state.phase === 'live',
    timeLeft: timeLeftSec(state, t),
    endsAt: state.endsAt || 0,
    blue: state.score ? state.score.blue : 0,
    red: state.score ? state.score.red : 0,
  };
}

/**
 * 途中参加ロール。token 復帰は別経路 (resumeByToken)。
 * lobby / ended → active、live → waiting（次試合待ち）
 */
export function resolveJoin(state, reserved) {
  if (reserved) {
    return { role: 'active', resume: true };
  }
  const phase = state && state.phase ? state.phase : 'lobby';
  if (phase === 'live') return { role: 'waiting', resume: false };
  return { role: 'active', resume: false };
}

/**
 * @returns {{ ok:false } | { ok:true, player:object }}
 */
export function resumeByToken(byToken, token) {
  const key = String(token || '').trim();
  if (!key || !byToken) return { ok: false };
  const player = byToken[key];
  if (!player) return { ok: false };
  return { ok: true, player };
}

export function pruneReservations(byToken, now, ttlMs = RESERVE_TTL_MS) {
  if (!byToken) return;
  const t = Number(now) || Date.now();
  for (const [k, p] of Object.entries(byToken)) {
    if (!p || (p.reservedAt && t - p.reservedAt > ttlMs)) delete byToken[k];
  }
}

export function serializeMatch(state) {
  return {
    phase: state.phase || 'lobby',
    map: state.map || 'desert',
    score: {
      blue: state.score ? state.score.blue : 0,
      red: state.score ? state.score.red : 0,
    },
    endsAt: state.endsAt || 0,
    startedAt: state.startedAt || 0,
    supplyAcc: state.supplyAcc || 0,
    supplyArmed: !!state.supplyArmed,
  };
}

export function restoreMatch(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const state = createMatchState();
  const phase = String(src.phase || 'lobby');
  state.phase = phase === 'live' || phase === 'ended' ? phase : 'lobby';
  state.map = sanitizeMap(src.map);
  state.score = {
    blue: Number(src.score && src.score.blue) || 0,
    red: Number(src.score && src.score.red) || 0,
  };
  state.endsAt = Number(src.endsAt) || 0;
  state.startedAt = Number(src.startedAt) || 0;
  state.supplyAcc = Number(src.supplyAcc) || 0;
  state.supplyArmed = !!src.supplyArmed;
  return state;
}

export function sanitizeToken(raw) {
  const t = String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return t.length >= 8 ? t : '';
}
