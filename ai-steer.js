/**
 * bot 壁貼り付き回避（純ロジック）
 * - 意図した移動に対して進捗が低い時間が続くと stuck
 * - repath オフセットは「壁に向かう方向の真後ろ＋横」
 */
(function (root) {
  const STUCK_SEC = 0.45;

  function updateStuckTimer(stuckT, dt, sample) {
    const speed = sample.speed || 0;
    const intendedDist = sample.intendedDist || 0;
    const progressAlong = sample.progressAlong;
    if (speed > 0.8 && intendedDist > 0.01 && progressAlong < 0.25) {
      return stuckT + dt;
    }
    return Math.max(0, stuckT - dt * 2);
  }

  function shouldRepathFromStuck(stuckT) {
    return stuckT > STUCK_SEC;
  }

  /** blocked 方向 (正規化前可) に対し、横 sideDist・後ろ back の平面オフセット */
  function stuckRepathDelta(blockedX, blockedZ, side, back, sideDist) {
    const len = Math.hypot(blockedX, blockedZ) || 1;
    const bx = blockedX / len;
    const bz = blockedZ / len;
    const px = -bz * side;
    const pz = bx * side;
    return {
      x: px * sideDist - bx * back,
      z: pz * sideDist - bz * back,
    };
  }

  const api = { STUCK_SEC, updateStuckTimer, shouldRepathFromStuck, stuckRepathDelta };
  root.AiSteer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
