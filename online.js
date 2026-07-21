/**
 * オンライン対戦クライアント（リモート表示 + pose 送信）
 * Step2: 位置・視線の同期まで（ヒット権威は未）
 */
const Online = (() => {
  /** @type {Map<string, object>} */
  const remotes = new Map();
  let sendAcc = 0;
  let myTeam = 'blue';
  let unsub = null;

  function ensureHook() {
    if (unsub || typeof Net === 'undefined') return;
    unsub = Net.on((ev, data) => {
      if (ev === 'welcome') {
        myTeam = data.team || 'blue';
        if (Array.isArray(data.peers)) {
          for (const p of data.peers) ensureRemote(p.id, p.team || 'red');
        }
      } else if (ev === 'peer') {
        if (data.op === 'join') ensureRemote(data.id, data.team || 'red');
        else if (data.op === 'leave') removeRemote(data.id);
      } else if (ev === 'snap') {
        applySnap(data);
      } else if (ev === 'status' && data.state === 'closed') {
        clearRemotes();
      }
    });
  }

  function ensureRemote(id, team) {
    if (!id || (typeof Net !== 'undefined' && id === Net.getState().selfId)) return null;
    let r = remotes.get(id);
    if (r) {
      if (team && r.team !== team) {
        removeRemote(id);
        r = null;
      } else return r;
    }
    const m = buildEnemyModel('grunt', team === 'blue' ? 'blue' : 'red');
    m.group.name = `remote:${id}`;
    scene.add(m.group);
    r = {
      id,
      team: team === 'blue' ? 'blue' : 'red',
      g: m.group,
      parts: m.parts,
      pos: new THREE.Vector3(),
      tx: 0, tz: 0, tyaw: 0,
      yaw: 0,
      crouch: false,
      placed: false,
    };
    remotes.set(id, r);
    return r;
  }

  function removeRemote(id) {
    const r = remotes.get(id);
    if (!r) return;
    scene.remove(r.g);
    remotes.delete(id);
  }

  function clearRemotes() {
    for (const id of [...remotes.keys()]) removeRemote(id);
  }

  function applySnap(snap) {
    if (!snap || !Array.isArray(snap.players)) return;
    const seen = new Set();
    const selfId = typeof Net !== 'undefined' ? Net.getState().selfId : null;
    for (const p of snap.players) {
      if (!p || !p.id || p.id === selfId) continue;
      seen.add(p.id);
      const r = ensureRemote(p.id, p.team);
      if (!r) continue;
      r.tx = p.x;
      r.tz = p.z;
      r.tyaw = p.yaw;
      r.crouch = !!p.crouch;
      if (!r.placed) {
        r.pos.set(p.x, 0, p.z);
        r.yaw = p.yaw;
        r.placed = true;
      }
    }
    for (const id of [...remotes.keys()]) {
      if (!seen.has(id)) removeRemote(id);
    }
  }

  function onMatchStart() {
    ensureHook();
    myTeam = (typeof Net !== 'undefined' && Net.getState().team) || myTeam || 'blue';
    const sp = typeof pickTdmSpawn === 'function'
      ? pickTdmSpawn(myTeam)
      : (myTeam === 'blue' ? [0, 52] : [0, -52]);
    player.pos.set(sp[0], 0, sp[1]);
    player.yaw = Math.atan2(-sp[0], -sp[1]);
    player.pitch = 0;
    player.spawnProtT = 2;
    sendAcc = 0;
  }

  function update(dt) {
    if (!game.online) return;
    ensureHook();
    if (typeof Net === 'undefined' || !Net.getState().connected) return;
    if (game.state !== 'playing' || !player.alive) return;

    sendAcc += dt;
    if (sendAcc >= 0.05) {
      sendAcc = 0;
      Net.sendInput({
        x: player.pos.x,
        z: player.pos.z,
        yaw: player.yaw,
        pitch: player.pitch,
        crouch: player.crouching,
      });
    }

    const alpha = 1 - Math.exp(-14 * dt);
    for (const r of remotes.values()) {
      r.pos.x += (r.tx - r.pos.x) * alpha;
      r.pos.z += (r.tz - r.pos.z) * alpha;
      r.yaw = lerpYaw(r.yaw, r.tyaw, alpha);
      r.g.position.set(r.pos.x, 0, r.pos.z);
      r.g.rotation.y = r.yaw;
    }
  }

  function reset() {
    clearRemotes();
    sendAcc = 0;
  }

  function getRemotes() {
    return remotes;
  }

  return { onMatchStart, update, reset, getRemotes, ensureHook };
})();

// ブラウザでも worker/pose の lerpYaw を使えるよう薄いコピー
function lerpYaw(from, to, alpha) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * alpha;
}
