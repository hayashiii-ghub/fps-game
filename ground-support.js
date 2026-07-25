'use strict';
/**
 * 足場の高さ（純ロジック）
 * - 移動コライダ（Y回転 OBB）の天面に立てるようにする
 * - STEP_UP 以下の段差は自動でよじ登る。これを超える段差は全員にとって壁
 *
 * プレイヤーと AI が同じ関数・同じ閾値を使うことで、登れる/登れないの
 * 差が両者に生まれないようにしている（AI に経路探索を入れずに済む理由）。
 */
(function exposeGroundSupport(root) {
  /** 自動でよじ登れる段差の上限（m）。膝上・腰下くらい */
  const STEP_UP = 0.6;
  /** 天面の判定ゆらぎ吸収 */
  const TOP_EPS = 0.02;

  /**
   * 足の中心が OBB の水平断面の内側にあるか。
   *
   * 「円が少しでも重なれば乗れる」にすると、遮蔽物のわずかな出っ張りが
   * 足場になってしまう（バリアは幅0.45の土台に幅0.15の壁が乗っており、
   * 両脇0.3の縁に AI が立って自分の遮蔽を越えて見てしまった）。
   * 中心判定なら、上の壁に押し出された時点で中心が土台から外れて落ちる。
   */
  function centerInsideBox(box, x, z) {
    const dx = x - box.cx;
    const dz = z - box.cz;
    // world → local（中心相対・逆 yaw）。sin の符号は pushYawObb と同じ規約
    const lx = dx * box.cos + dz * box.sin;
    const lz = -dx * box.sin + dz * box.cos;
    return Math.abs(lx) <= box.hx && Math.abs(lz) <= box.hz;
  }

  /**
   * (x,z) に立ったときの足場の高さ。足の中心が天面の上にある物だけを候補にする。
   * `maxTop` より高い天面は無視する（頭上の物には乗らない）。
   * 何も無ければ地面の 0。
   */
  function supportHeightAt(colliders, x, z, r, maxTop) {
    let best = 0;
    for (const box of colliders) {
      const top = box.cy + box.hy;
      if (top <= best) continue;
      if (top > maxTop + TOP_EPS) continue;
      if (!centerInsideBox(box, x, z)) continue;
      best = top;
    }
    return best;
  }

  /**
   * 接地中の足元 y を更新する。段差なら登り、縁を踏み外したらそのまま返す。
   * @returns {number} 新しい足元 y（呼び出し側が下回れば落下開始）
   */
  function stepUpTo(colliders, x, z, r, feetY) {
    const top = supportHeightAt(colliders, x, z, r, feetY + STEP_UP);
    return top > feetY ? top : feetY;
  }

  /**
   * 落下後の着地高さ。fromY（落下前の足元）以下の天面だけを候補にするので、
   * 頭上の床をすり抜けて登ってしまうことがない。
   */
  function landingHeight(colliders, x, z, r, fromY) {
    return supportHeightAt(colliders, x, z, r, fromY);
  }

  const api = { STEP_UP, TOP_EPS, centerInsideBox, supportHeightAt, stepUpTo, landingHeight };
  root.GroundSupport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
