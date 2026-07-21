/**
 * メッセージレート制限（単純な最小間隔）
 */
export function checkMsgRate(session, now, bucket = 'msg', minMs = 40) {
  if (!session) return { ok: false, reason: 'session' };
  if (!session._rates) session._rates = {};
  const last = session._rates[bucket] || 0;
  const t = Number(now) || 0;
  if (last && t - last < minMs) return { ok: false, reason: 'flood' };
  session._rates[bucket] = t;
  return { ok: true };
}
