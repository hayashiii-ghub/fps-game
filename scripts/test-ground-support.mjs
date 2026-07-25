/**
 * slice: 足場の高さと段差登り
 * - 天面に立てる／頭上の床には乗らない
 * - STEP_UP 以下だけ自動で登る（プレイヤーと AI で同じ閾値）
 * - yaw 付き OBB の水平判定が pushYawObb / resolveCollision と同じ規約
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { STEP_UP, supportHeightAt, stepUpTo, landingHeight } = require('../ground-support.js');

/** world.js pushYawObb と同じ形の OBB を作る（sin 反転を含む） */
function obb(cx, cy, cz, hx, hy, hz, yaw = 0) {
  return {
    cx, cy, cz, hx, hy, hz,
    cos: Math.cos(yaw), sin: -Math.sin(yaw),
  };
}

const R = 0.36;          // player.radius
const HIGH = 6;          // 上限なしに近い maxTop

/* ---- 何も無ければ地面 ---- */
assert.equal(supportHeightAt([], 0, 0, R, HIGH), 0);

/* ---- 天面に立てる ---- */
// 中心(0,0.5,0) 半径方向 hx=hz=1 → 天面 1.0
const crate = obb(0, 0.5, 0, 1, 0.5, 1);
assert.equal(supportHeightAt([crate], 0, 0, R, HIGH), 1);
// 天面の縁ちょうどまでは乗れる
assert.equal(supportHeightAt([crate], 1, 0, R, HIGH), 1);
// 足の中心が天面から外れたら乗れない（遮蔽物の出っ張りを足場にしない）
assert.equal(supportHeightAt([crate], 1.2, 0, R, HIGH), 0);
assert.equal(supportHeightAt([crate], 3, 0, R, HIGH), 0);

// バリア相当: 幅0.45の土台の上に幅0.15の壁。壁に押し出された位置では立てない
const barrierFoot = obb(0, 0.25, 0, 1.8, 0.25, 0.45);
assert.equal(supportHeightAt([barrierFoot], 0, 0.3, R, HIGH), 0.5, '土台の真上なら立てる');
assert.equal(supportHeightAt([barrierFoot], 0, 0.51, R, HIGH), 0,
  '壁の半径分だけ押し出された位置では中心が土台の外なので落ちる');

/* ---- 頭上の床には乗らない ---- */
// 足元 0 から maxTop=0.6 までしか見なければ、天面 1.0 の箱は無視される
assert.equal(supportHeightAt([crate], 0, 0, R, 0.6), 0);

/* ---- 重なった段は高い方を選ぶ ---- */
const lowStep = obb(0, 0.25, 0, 2, 0.25, 2);   // 天面 0.5
assert.equal(supportHeightAt([lowStep, crate], 0, 0, R, HIGH), 1);
assert.equal(supportHeightAt([lowStep, crate], 0, 0, R, 0.6), 0.5);

/* ---- STEP_UP 以下だけ登る ---- */
const climbable = obb(0, STEP_UP / 2, 0, 2, STEP_UP / 2, 2);        // 天面 = STEP_UP
const tooTall = obb(0, (STEP_UP + 0.3) / 2, 0, 2, (STEP_UP + 0.3) / 2, 2);
assert.equal(stepUpTo([climbable], 0, 0, R, 0), STEP_UP);
assert.equal(stepUpTo([tooTall], 0, 0, R, 0), 0, 'STEP_UP を超える段差は登らない');
// 段の上に立っていれば、そこから更に STEP_UP まで登れる
assert.equal(stepUpTo([climbable, tooTall], 0, 0, R, STEP_UP), STEP_UP + 0.3);
// 足元より低い天面しか無ければ足元のまま（縁を踏み外しても登り直さない）
assert.equal(stepUpTo([lowStep], 0, 0, R, 2), 2);

/* ---- 落下は落下前の足元以下にしか着地しない ---- */
assert.equal(landingHeight([crate], 0, 0, R, 3), 1, '上から落ちれば天面に乗る');
assert.equal(landingHeight([crate], 0, 0, R, 0.5), 0, '天面より下から昇ってすり抜けない');

/* ---- yaw 付き OBB（長軸が X → Z へ回る） ---- */
const rotated = obb(0, 0.5, 0, 2, 0.5, 0.5, Math.PI / 2);
assert.equal(supportHeightAt([rotated], 0, 1.5, 0.05, HIGH), 1, '回転後の長軸方向は乗れる');
assert.equal(supportHeightAt([rotated], 1.5, 0, 0.05, HIGH), 0, '回転後の短軸方向は乗れない');
// 回転なしなら逆になる
const flat = obb(0, 0.5, 0, 2, 0.5, 0.5, 0);
assert.equal(supportHeightAt([flat], 1.5, 0, 0.05, HIGH), 1);
assert.equal(supportHeightAt([flat], 0, 1.5, 0.05, HIGH), 0);

/* ---- STEP_UP は既存の遮蔽物より低い（コンテナ等は壁のまま） ---- */
assert.ok(STEP_UP < 0.88, '土嚢の天面より低い');
assert.ok(STEP_UP < 1.05, '木箱の天面より低い');

console.log('ground support tests: ok');
