/**
 * オンライン対戦クライアント（リモート表示 + pose + 被弾 + ギア）
 */
const Online = (() => {
  /** @type {Map<string, object>} */
  const remotes = new Map();
  /** @type {Map<string, object>} */
  const netLoots = new Map();
  let sendAcc = 0;
  let myTeam = 'blue';
  let myRole = 'active'; // active | waiting
  let unsub = null;
  /** 自分が投げたグレの boom FX を二重にしない */
  const localNadeFxSkip = new Set();

  function ensureHook() {
    if (unsub || typeof Net === 'undefined') return;
    unsub = Net.on((ev, data) => {
      if (ev === 'welcome') {
        myTeam = data.team || 'blue';
        myRole = data.role || 'active';
        // 試合中の再接続だけマップをサーバーに合わせる。
        // lobby 接続時は DO 既定 desert でローカル選択を潰さない。
        if (data.match && data.map && typeof applyMapSelection === 'function') {
          applyMapSelection(data.map);
        }
        if (data.score) applyScore(data.score);
        applyMatchClock(data);
        if (data.inv) applyInv(data.inv, true);
        if (Array.isArray(data.peers)) {
          for (const p of data.peers) ensureRemote(p.id, p.team || 'red');
        }
        if (Array.isArray(data.loots)) {
          for (const l of data.loots) spawnNetLoot(l);
        }
        rebuildOnlineHits();
        // 試合中に active で復帰したらローカル試合へ戻す（所持はサーバー inv を正）
        if (data.phase === 'live' && myRole === 'active' && game.state !== 'playing') {
          if (typeof deployAndStart === 'function') {
            deployAndStart('tdm', { online: true, resume: true });
            if (data.inv) applyInv(data.inv, true);
            applyMatchClock(data);
            if (Array.isArray(data.loots)) {
              clearNetLoots();
              for (const l of data.loots) spawnNetLoot(l);
            }
          }
        }
      } else if (ev === 'peer') {
        if (data.op === 'join') ensureRemote(data.id, data.team || 'red');
        else if (data.op === 'leave') removeRemote(data.id);
        rebuildOnlineHits();
      } else if (ev === 'snap') {
        applySnap(data);
        if (data.score) applyScore(data.score);
        applyMatchClock(data);
      } else if (ev === 'dmg') {
        onDmg(data);
      } else if (ev === 'score') {
        applyScore(data);
      } else if (ev === 'match_start') {
        onServerMatchStart(data);
      } else if (ev === 'match_end') {
        onServerMatchEnd(data);
      } else if (ev === 'match_deny') {
        if (typeof setOnlineStatus === 'function') {
          setOnlineStatus(`試合開始不可 (${data.reason || data.phase || 'denied'})`);
        }
      } else if (ev === 'respawn') {
        onPeerRespawn(data);
      } else if (ev === 'nade_throw') {
        onNadeThrow(data);
      } else if (ev === 'nade_boom') {
        onNadeBoom(data);
      } else if (ev === 'healed') {
        onHealed(data);
      } else if (ev === 'inv') {
        applyInv(data, data.id === Net.getState().selfId);
      } else if (ev === 'loot_spawn') {
        spawnNetLoot(data.loot);
      } else if (ev === 'loot_gone') {
        removeNetLoot(data.lootId);
      } else if (ev === 'loot_clear') {
        clearNetLoots();
      } else if (ev === 'loot_grant') {
        onLootGrant(data);
      } else if (ev === 'supply') {
        if (typeof spawnFloater === 'function') spawnFloater('中央補給', false);
      } else if (ev === 'status' && data.state === 'closed') {
        clearRemotes();
        clearNetLoots();
      }
    });
  }

  function applyMatchClock(data) {
    if (!data || !game.online) return;
    if (Number.isFinite(data.timeLeft)) {
      game.tdm.timeLeft = Math.max(0, data.timeLeft);
      if (typeof updateTdmHUD === 'function') updateTdmHUD();
    }
    if (Number.isFinite(data.blue) || Number.isFinite(data.red)) {
      applyScore({ blue: data.blue, red: data.red, ...data.score });
    }
  }

  function applyScore(score) {
    if (!score || !game.online) return;
    if (Number.isFinite(score.blue)) game.tdm.blueKills = score.blue;
    if (Number.isFinite(score.red)) game.tdm.redKills = score.red;
    if (typeof updateTdmHUD === 'function') updateTdmHUD();
  }

  function applyInv(inv, isSelf) {
    if (!isSelf || !inv || !game.online) return;
    if (Number.isFinite(inv.grenades)) {
      player.grenades = inv.grenades;
      if (typeof updateGrenadeHUD === 'function') updateGrenadeHUD();
    }
    if (Number.isFinite(inv.medkits)) {
      player.medkits = inv.medkits;
      if (typeof updateMedkitHUD === 'function') updateMedkitHUD();
    }
    if (typeof inv.armor === 'boolean') {
      player.armor = inv.armor;
      player.dmgMul = inv.armor ? 0.72 : 1;
      if (typeof updateArmorHUD === 'function') updateArmorHUD();
    }
    if (Number.isFinite(inv.hp) && player.alive) {
      player.hp = inv.hp;
      if (typeof updateHealthHUD === 'function') updateHealthHUD();
    }
  }

  function ensureRemote(id, team, weapon) {
    if (!id || (typeof Net !== 'undefined' && id === Net.getState().selfId)) return null;
    const kind = weapon === 'sniper' ? 'sniper' : 'grunt';
    let r = remotes.get(id);
    if (r) {
      if (team && r.team !== team) {
        removeRemote(id);
        r = null;
      } else if (r.weapon !== (weapon || r.weapon) && (weapon === 'sniper' || r.weapon === 'sniper')) {
        // スナイパー切替時だけモデル差し替え
        removeRemote(id);
        r = null;
      } else return r;
    }
    const m = buildEnemyModel(kind, team === 'blue' ? 'blue' : 'red');
    m.group.name = `remote:${id}`;
    for (const mesh of m.parts) {
      mesh.userData.remoteId = id;
      mesh.userData.enemy = null;
    }
    scene.add(m.group);
    r = {
      id,
      team: team === 'blue' ? 'blue' : 'red',
      weapon: weapon || 'assault',
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
      const r = ensureRemote(p.id, p.team, p.weapon);
      if (!r) continue;
      r.tx = p.x;
      r.tz = p.z;
      r.tyaw = p.yaw;
      r.crouch = !!p.crouch;
      r.weapon = p.weapon || r.weapon;
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

  function notifyNadeThrow(from, vel) {
    if (!game.online || typeof Net === 'undefined') return;
    Net.sendNadeThrow({
      x: from.x, y: from.y, z: from.z,
      vx: vel.x, vy: vel.y, vz: vel.z,
    });
  }

  function claimNadeBoom(pos) {
    if (!game.online || typeof Net === 'undefined') return;
    const key = `${pos.x.toFixed(2)},${pos.z.toFixed(2)}`;
    localNadeFxSkip.add(key);
    setTimeout(() => localNadeFxSkip.delete(key), 800);
    Net.sendNadeBoom(pos);
  }

  function onNadeThrow(data) {
    if (!game.online || !data) return;
    const selfId = Net.getState().selfId;
    if (data.id === selfId) return;
    if (typeof spawnRemoteGrenade === 'function') {
      spawnRemoteGrenade(
        new THREE.Vector3(data.x, data.y, data.z),
        new THREE.Vector3(data.vx, data.vy, data.vz),
      );
    }
  }

  function onNadeBoom(data) {
    if (!game.online || !data) return;
    const key = `${Number(data.x).toFixed(2)},${Number(data.z).toFixed(2)}`;
    if (localNadeFxSkip.has(key)) return;
    if (typeof explodeGrenadeFX === 'function') {
      explodeGrenadeFX(new THREE.Vector3(data.x, data.y, data.z));
    }
  }

  function claimHeal() {
    if (!game.online || typeof Net === 'undefined') return;
    Net.sendHeal();
  }

  function onHealed(data) {
    if (!game.online || !data) return;
    const selfId = Net.getState().selfId;
    if (data.id !== selfId) return;
    player.hp = Math.max(0, Number(data.hp) || player.hp);
    if (Number.isFinite(data.medkits)) player.medkits = data.medkits;
    if (typeof updateHealthHUD === 'function') updateHealthHUD();
    if (typeof updateMedkitHUD === 'function') updateMedkitHUD();
  }

  function spawnNetLoot(loot) {
    if (!loot || !loot.id || netLoots.has(loot.id)) return;
    if (typeof spawnLootAt === 'function') {
      const entry = spawnLootAt(
        new THREE.Vector3(loot.x, 0, loot.z),
        loot.type,
        { netId: loot.id, jitter: false },
      );
      if (entry) netLoots.set(loot.id, entry);
    }
  }

  function removeNetLoot(lootId) {
    const entry = netLoots.get(lootId);
    if (!entry) return;
    if (entry.m) scene.remove(entry.m);
    if (typeof loots !== 'undefined') {
      const i = loots.indexOf(entry);
      if (i >= 0) loots.splice(i, 1);
    }
    netLoots.delete(lootId);
  }

  function clearNetLoots() {
    for (const id of [...netLoots.keys()]) removeNetLoot(id);
  }

  function claimLoot(lootId) {
    if (!game.online || typeof Net === 'undefined') return;
    Net.sendLootPick(lootId);
  }

  function onLootGrant(data) {
    if (!game.online || !data) return;
    if (data.inv) applyInv(data.inv, true);
    if (data.type === 'ammo' && typeof addReserveAmmo === 'function') {
      addReserveAmmo(45);
      if (typeof spawnFloater === 'function') spawnFloater('弾薬 +45', false);
    } else if (data.type === 'nade' && typeof spawnFloater === 'function') {
      spawnFloater('グレネード +1', false);
    } else if (data.type === 'med' && typeof spawnFloater === 'function') {
      spawnFloater('応急キット +1', false);
    } else if (data.type === 'armor') {
      player.armor = true;
      player.dmgMul = 0.72;
      if (typeof updateArmorHUD === 'function') updateArmorHUD();
      if (typeof spawnFloater === 'function') spawnFloater('強化防具 取得', true);
    }
    if (typeof AudioSys !== 'undefined') AudioSys.pickup();
    if (typeof updateAmmoHUD === 'function') updateAmmoHUD();
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
        if (data.weapon === 'grenade') game.grenadeKills = (game.grenadeKills || 0) + 1;
        addKillfeed(data.weapon === 'grenade' ? 'グレネード撃破' : '撃破', true);
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
    if (player.healing && typeof cancelHeal === 'function') cancelHeal();
    const from = new THREE.Vector3(player.pos.x, 0, player.pos.z);
    if (data.weapon === 'grenade' && Number.isFinite(data.x)) {
      from.set(data.x, 0, data.z);
    } else {
      const atk = remotes.get(data.attacker);
      if (atk) from.copy(atk.pos);
    }
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

  /** サーバーが確定した試合開始（マップ含む）。全員がこれを見て出撃する */
  function onServerMatchStart(data) {
    ensureHook();
    myRole = 'active';
    if (data && data.map && typeof applyMapSelection === 'function') {
      applyMapSelection(data.map);
    }
    applyMatchClock(data);
    if (game.state === 'playing' && game.online) {
      applyScore(data);
      beginLocalMatch(data);
      return;
    }
    if (typeof deployAndStart === 'function') {
      deployAndStart('tdm', { online: true });
      applyScore(data);
      applyMatchClock(data);
    }
  }

  function onServerMatchEnd(data) {
    ensureHook();
    applyScore(data && data.score ? data.score : data);
    applyMatchClock({ timeLeft: 0, ...(data || {}) });
    if (game.online && game.state === 'playing' && typeof endTdmMatch === 'function') {
      endTdmMatch();
    }
  }

  /** ローカル側の試合リセット（match_start 送信はしない） */
  function beginLocalMatch(clock, opts) {
    const resume = !!(opts && opts.resume);
    myTeam = (typeof Net !== 'undefined' && Net.getState().team) || myTeam || 'blue';
    myRole = (typeof Net !== 'undefined' && Net.getState().role) || myRole || 'active';
    if (!resume) {
      const sp = typeof pickTdmSpawn === 'function'
        ? pickTdmSpawn(myTeam)
        : (myTeam === 'blue' ? [0, 52] : [0, -52]);
      player.pos.set(sp[0], 0, sp[1]);
      player.yaw = Math.atan2(-sp[0], -sp[1]);
      player.pitch = 0;
      player.hp = 100;
      player.alive = true;
      player.spawnProtT = 2;
      player.grenades = 2;
      player.medkits = 2;
      player.armor = false;
      player.dmgMul = 1;
      clearNetLoots();
    } else {
      player.spawnProtT = Math.max(player.spawnProtT || 0, 1.5);
    }
    sendAcc = 0;
    if (clock) applyMatchClock(clock);
    else if (!resume && (!Number.isFinite(game.tdm.timeLeft) || game.tdm.timeLeft <= 0)) {
      game.tdm.timeLeft = 300;
    }
    if (typeof updateHealthHUD === 'function') updateHealthHUD();
    if (typeof updateGrenadeHUD === 'function') updateGrenadeHUD();
    if (typeof updateMedkitHUD === 'function') updateMedkitHUD();
    if (typeof updateArmorHUD === 'function') updateArmorHUD();
    rebuildOnlineHits();
    const code = (typeof Net !== 'undefined' && Net.getState().room) || '';
    if (typeof showBanner === 'function') {
      showBanner('ONLINE TDM', `ROOM ${code} ― ${resume ? 'RESUME' : 'LIVE'}`);
    }
  }

  function onMatchStart(opts) {
    ensureHook();
    beginLocalMatch(null, opts);
  }

  /** ロビーから試合開始を要求（マップは開始者の選択が正） */
  function requestMatchStart() {
    ensureHook();
    if (typeof Net === 'undefined' || !Net.getState().connected) return false;
    const map = (typeof game !== 'undefined' && game.map) || 'desert';
    return Net.sendMatchStart(map);
  }

  function isWaiting() {
    return myRole === 'waiting';
  }

  function update(dt) {
    if (!game.online) return;
    ensureHook();
    if (typeof Net === 'undefined' || !Net.getState().connected) return;
    if (game.state !== 'playing') return;
    if (myRole === 'waiting') return;

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
          weapon: typeof arsenal !== 'undefined' ? arsenal.activeId : 'assault',
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
      // 敵モデル正面は +Z、プレイヤー yaw=0 はカメラ -Z → 表示は +π
      r.g.rotation.y = r.yaw + Math.PI;
    }
  }

  function notifyRespawn() {
    if (game.online && typeof Net !== 'undefined') Net.sendRespawn();
  }

  function reset() {
    clearRemotes();
    clearNetLoots();
    sendAcc = 0;
    localNadeFxSkip.clear();
  }

  function getRemotes() {
    return remotes;
  }

  function getMyTeam() {
    return myTeam;
  }

  return {
    onMatchStart, requestMatchStart, update, reset, getRemotes, getMyTeam,
    ensureHook, claimHit, notifyRespawn, rebuildOnlineHits,
    notifyNadeThrow, claimNadeBoom, claimHeal, claimLoot,
    isWaiting, applyMatchClock,
  };
})();

function lerpYaw(from, to, alpha) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * alpha;
}
