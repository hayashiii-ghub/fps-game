/**
 * オンライン対戦クライアント（リモート表示 + pose + 被弾）
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
        if (data.score) applyScore(data.score);
        if (Array.isArray(data.peers)) {
          for (const p of data.peers) ensureRemote(p.id, p.team || 'red');
        }
        rebuildOnlineHits();
      } else if (ev === 'peer') {
        if (data.op === 'join') ensureRemote(data.id, data.team || 'red');
        else if (data.op === 'leave') removeRemote(data.id);
        rebuildOnlineHits();
      } else if (ev === 'snap') {
        applySnap(data);
        if (data.score) applyScore(data.score);
      } else if (ev === 'dmg') {
        onDmg(data);
      } else if (ev === 'score') {
        applyScore(data);
      } else if (ev === 'respawn') {
        onPeerRespawn(data);
      } else if (ev === 'status' && data.state === 'closed') {
        clearRemotes();
      }
    });
  }

  function applyScore(score) {
    if (!score || !game.online) return;
    if (Number.isFinite(score.blue)) game.tdm.blueKills = score.blue;
    if (Number.isFinite(score.red)) game.tdm.redKills = score.red;
    if (typeof updateTdmHUD === 'function') updateTdmHUD();
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
    for (const mesh of m.parts) {
      mesh.userData.remoteId = id;
      mesh.userData.enemy = null;
    }
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
      alive: true,
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

  function rebuildOnlineHits() {
    if (typeof rebuildHitMeshes === 'function') rebuildHitMeshes();
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
      r.alive = p.alive !== false;
      r.g.visible = r.alive;
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

  function claimHit(targetId, part) {
    if (!game.online || typeof Net === 'undefined') return;
    const weapon = typeof arsenal !== 'undefined' ? arsenal.activeId : 'assault';
    Net.sendHit(targetId, part || 'torso', weapon);
  }

  function onDmg(data) {
    if (!game.online || !data) return;
    applyScore(data.score);
    const selfId = Net.getState().selfId;

    if (data.attacker === selfId) {
      game.hits++;
      if (typeof AudioSys !== 'undefined') {
        AudioSys.hitmark(!!data.kill);
        if (data.part === 'head') AudioSys.headshot();
      }
      if (typeof showHitmarker === 'function') showHitmarker(!!data.kill);
      if (data.kill) {
        game.kills++;
        addKillfeed('撃破', true);
      }
    }

    if (data.victim === selfId) {
      applyServerDamage(data);
    }

    const r = remotes.get(data.victim);
    if (r) {
      r.alive = !data.kill && data.hp > 0;
      r.g.visible = r.alive;
    }
    rebuildOnlineHits();
  }

  function applyServerDamage(data) {
    if (!player.alive) return;
    // サーバー hp を正とする
    const from = new THREE.Vector3(player.pos.x, 0, player.pos.z);
    const atk = remotes.get(data.attacker);
    if (atk) from.copy(atk.pos);
    const prev = player.hp;
    player.hp = Math.max(0, Number(data.hp) || 0);
    if (player.hp < prev) {
      player.lastDamage = game.time;
      if (typeof AudioSys !== 'undefined') AudioSys.hurt();
      game.hurtFlash = 1;
      const d = new THREE.Vector3().subVectors(from, player.pos); d.y = 0;
      if (d.lengthSq() > 1e-6) {
        d.normalize();
        const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const ang = Math.atan2(d.dot(right), d.dot(new THREE.Vector3(fwd.x, 0, fwd.z).normalize()));
        const el = document.getElementById('dmgdir');
        if (el) {
          el.style.transform = `rotate(${ang}rad)`;
          el.style.transition = 'none'; el.style.opacity = 0.95;
          requestAnimationFrame(() => { el.style.transition = 'opacity 1.1s'; el.style.opacity = 0; });
        }
      }
    }
    if (data.kill || player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      if (game.mode === 'tdm') onPlayerKilled(from);
      else gameOver();
    }
    updateHealthHUD();
  }

  function onPeerRespawn(data) {
    const r = remotes.get(data.id);
    if (!r) return;
    r.alive = true;
    r.g.visible = true;
    rebuildOnlineHits();
  }

  function onMatchStart() {
    ensureHook();
    myTeam = (typeof Net !== 'undefined' && Net.getState().team) || myTeam || 'blue';
    if (typeof Net !== 'undefined') Net.sendMatchStart();
    const sp = typeof pickTdmSpawn === 'function'
      ? pickTdmSpawn(myTeam)
      : (myTeam === 'blue' ? [0, 52] : [0, -52]);
    player.pos.set(sp[0], 0, sp[1]);
    player.yaw = Math.atan2(-sp[0], -sp[1]);
    player.pitch = 0;
    player.hp = 100;
    player.alive = true;
    player.spawnProtT = 2;
    sendAcc = 0;
    if (typeof updateHealthHUD === 'function') updateHealthHUD();
    rebuildOnlineHits();
  }

  function update(dt) {
    if (!game.online) return;
    ensureHook();
    if (typeof Net === 'undefined' || !Net.getState().connected) return;
    if (game.state !== 'playing') return;

    if (player.alive) {
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
    }

    const alpha = 1 - Math.exp(-14 * dt);
    for (const r of remotes.values()) {
      if (!r.alive) continue;
      r.pos.x += (r.tx - r.pos.x) * alpha;
      r.pos.z += (r.tz - r.pos.z) * alpha;
      r.yaw = lerpYaw(r.yaw, r.tyaw, alpha);
      r.g.position.set(r.pos.x, 0, r.pos.z);
      r.g.rotation.y = r.yaw;
    }
  }

  function notifyRespawn() {
    if (game.online && typeof Net !== 'undefined') Net.sendRespawn();
  }

  function reset() {
    clearRemotes();
    sendAcc = 0;
  }

  function getRemotes() {
    return remotes;
  }

  function getMyTeam() {
    return myTeam;
  }

  return {
    onMatchStart, update, reset, getRemotes, getMyTeam,
    ensureHook, claimHit, notifyRespawn, rebuildOnlineHits,
  };
})();

function lerpYaw(from, to, alpha) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * alpha;
}
