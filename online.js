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
  /** ホスト管理 bot（netId -> Enemy）。ホストのみ使用 */
  const hostBots = new Map();
  let hostId = null;
  let roster = [];
  let botAcc = 0;

  /** 試合ネット購読（ロビー UI は main.initOnlineLobby の Net.on） */
  function ensureHook() {
    if (unsub || typeof Net === 'undefined') return;
    unsub = Net.on((ev, data) => {
      if (ev === 'welcome') {
        myTeam = data.team || 'blue';
        myRole = data.role || 'active';
        hostId = data.host || null;
        roster = Array.isArray(data.roster) ? data.roster : [];
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
        syncLoadoutToServer();
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
      } else if (ev === 'roster') {
        hostId = data.host || null;
        roster = Array.isArray(data.players) ? data.players : [];
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
      } else if (ev === 'fire') {
        onRemoteFire(data);
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
      } else if (ev === 'loadout_lock') {
        applyLoadoutLock(data);
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
      torso: m.torso,
      legL: m.legL,
      legR: m.legR,
      muzzle: m.muzzle,
      flash: m.flash,
      pos: new THREE.Vector3(),
      tx: 0, ty: 0, tz: 0, tyaw: 0,
      yaw: 0,
      crouch: false,
      placed: false,
      alive: true,
      dying: false,
      dieT: 0,
      fallDir: 1,
      walkPhase: 0,
      prot: false,
      protT: 0,
      protAura: null,
      lastX: 0,
      lastZ: 0,
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
    let adopted = false;
    for (const p of snap.players) {
      if (!p || !p.id || p.id === selfId) continue;
      // ホスト管理 bot は Enemy として描画するので remote にはしない。
      // 試合中にホストを引き継いだ場合はここで Enemy へ変換する
      if (p.bot && isHost()) {
        if (!hostBots.has(p.id)) { adoptBot(p); adopted = true; }
        continue;
      }
      seen.add(p.id);
      const r = ensureRemote(p.id, p.team, p.weapon);
      if (!r) continue;
      r.tx = p.x;
      r.ty = Number.isFinite(p.y) ? p.y : 0;
      r.tz = p.z;
      r.tyaw = p.yaw;
      r.crouch = !!p.crouch;
      r.weapon = p.weapon || r.weapon;
      const wasAlive = r.alive;
      r.alive = p.alive !== false;
      r.prot = !!p.prot;
      if (r.prot) r.protT = Math.max(r.protT, 0.25);
      if (r.dying) {
        r.g.visible = true;
      } else if (!r.alive && wasAlive) {
        startRemoteDie(r);
      } else {
        r.g.visible = r.alive;
        if (r.alive) r.g.rotation.x = 0;
      }
      if (!r.placed) {
        r.pos.set(p.x, r.ty, p.z);
        r.yaw = p.yaw;
        r.lastX = p.x;
        r.lastZ = p.z;
        r.placed = true;
      }
    }
    for (const id of [...remotes.keys()]) {
      if (!seen.has(id)) removeRemote(id);
    }
    if (adopted) declareBots();
  }

  function claimHit(targetId, part) {
    if (!game.online || typeof Net === 'undefined') return;
    const weapon = typeof arsenal !== 'undefined' ? arsenal.activeId : 'assault';
    Net.sendHit(targetId, part || 'torso', weapon);
  }

  /* ---------- ホスト管理 bot ---------- */
  function isHost() {
    const selfId = typeof Net !== 'undefined' ? Net.getState().selfId : null;
    return !!selfId && selfId === hostId;
  }

  /** 現在の hostBots をサーバーへ宣言（同期の正はこちら） */
  function declareBots() {
    if (!isHost() || typeof Net === 'undefined' || !Net.getState().connected) return;
    const list = [];
    for (const [id, e] of hostBots) {
      list.push({ id, name: e.netName || 'BOT', team: e.team });
    }
    Net.sendBots(list);
  }

  function clearHostBots() {
    for (const [, e] of hostBots) e.destroy();
    hostBots.clear();
  }

  /** 試合開始時: 各チーム5人に満たない分を bot で補充（ホストのみ） */
  function spawnHostBots() {
    clearHostBots();
    if (!isHost() || typeof Enemy === 'undefined') return;
    const humans = { blue: 0, red: 0 };
    for (const p of roster) {
      if (p.role === 'waiting') continue;
      humans[p.team === 'blue' ? 'blue' : 'red']++;
    }
    const selfId = Net.getState().selfId;
    if (!roster.some(p => p.id === selfId)) {
      humans[myTeam === 'blue' ? 'blue' : 'red']++;
    }
    const taken = [];
    const pickSpawn = (team) => {
      const pool = (typeof TDM_SPAWNS !== 'undefined' ? TDM_SPAWNS[team] : [[0, 50]])
        .filter(([x, z]) => !taken.some(([tx, tz]) => Math.abs(tx - x) < 1.5 && Math.abs(tz - z) < 1.5));
      const list = pool.length ? pool : (typeof TDM_SPAWNS !== 'undefined' ? TDM_SPAWNS[team] : [[0, 50]]);
      return list[(Math.random() * list.length) | 0];
    };
    let n = 0;
    for (const team of ['blue', 'red']) {
      const need = Math.max(0, 5 - humans[team]);
      for (let i = 0; i < need; i++) {
        const sp = pickSpawn(team);
        taken.push(sp);
        const kind = i === need - 1 ? 'sniper' : 'grunt';
        const e = new Enemy(sp[0], sp[1], kind, team);
        e.netId = `bot${(++n)}-${Math.random().toString(36).slice(2, 6)}`;
        e.netName = `BOT-${team === 'blue' ? 'B' : 'R'}${i + 1}`;
        e.g.rotation.y = Math.atan2(-sp[0], -sp[1]);
        enemies.push(e);
        hostBots.set(e.netId, e);
      }
    }
    if (typeof rebuildHitMeshes === 'function') rebuildHitMeshes();
    declareBots();
  }

  /** ホスト引き継ぎ: snap 上の bot を Enemy に変換して管理を移す */
  function adoptBot(p) {
    if (typeof Enemy === 'undefined') return;
    removeRemote(p.id);
    const e = new Enemy(p.x, p.z, p.weapon === 'sniper' ? 'sniper' : 'grunt', p.team);
    e.netId = p.id;
    e.netName = 'BOT';
    e.pos.set(p.x, 0, p.z);
    e.g.position.copy(e.pos);
    if (p.alive === false) {
      e.alive = false;
      e.hp = 0;
      e.pendingRespawn = true;
      e.respawnT = 2.5;
      e.g.visible = false;
    } else {
      e.hp = Number.isFinite(p.hp) ? p.hp : 100;
    }
    enemies.push(e);
    hostBots.set(p.id, e);
    if (typeof rebuildHitMeshes === 'function') rebuildHitMeshes();
  }

  /** bot の射撃 FX を他クライアントへ配信 */
  function notifyBotFire(id, weapon) {
    if (!game.online || typeof Net === 'undefined' || !isHost()) return;
    Net.sendBotFire(id, weapon);
  }

  /** bot の命中をサーバー判定へ（ダメージはサーバーが計算） */
  function claimBotHit(botId, targetId, part, weapon) {
    if (!game.online || typeof Net === 'undefined' || !isHost()) return;
    Net.sendBotHit(botId, targetId, part || 'torso', weapon || 'assault');
  }

  /** bot のリスポーンをサーバーへ通知 */
  function notifyBotRespawn(id) {
    if (!game.online || typeof Net === 'undefined' || !isHost()) return;
    Net.sendBotRespawn(id);
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

  function notifyHealStart() {
    if (!game.online || typeof Net === 'undefined') return;
    Net.sendHealStart();
  }

  function notifyHealCancel() {
    if (!game.online || typeof Net === 'undefined') return;
    Net.sendHealCancel();
  }

  function syncLoadoutToServer() {
    if (typeof Net === 'undefined' || !Net.getState().connected) return;
    const main = (typeof game !== 'undefined' && game.loadoutMain) || 'assault';
    const sub = (typeof game !== 'undefined' && game.loadoutSub) || 'smg';
    Net.sendLoadout(main, sub);
  }

  function applyLoadoutLock(data) {
    if (!data || !game.online) return;
    if (data.main && typeof game !== 'undefined') game.loadoutMain = data.main;
    if (data.sub && typeof game !== 'undefined') game.loadoutSub = data.sub;
    if (typeof updateLoadoutUI === 'function') updateLoadoutUI();
    // 試合開始ロック時はローカル所持もサーバーに合わせる
    if (game.state === 'playing' && typeof resetArsenal === 'function') {
      resetArsenal();
    }
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
      // 被弾血しぶき
      const chest = r.pos.clone();
      chest.y += r.crouch ? 0.95 : 1.25;
      let dir = new THREE.Vector3(0, 0.2, 0);
      const atk = remotes.get(data.attacker);
      if (atk) dir.subVectors(r.pos, atk.pos).setY(0.15).normalize();
      else if (data.attacker === selfId) dir.subVectors(r.pos, player.pos).setY(0.15).normalize();
      if (typeof bloodFX === 'function') bloodFX(chest, dir);

      if (data.kill || !(data.hp > 0)) {
        startRemoteDie(r);
      } else {
        r.alive = true;
      }
    }

    // ホスト管理 bot への被弾（HP/生死はサーバーが正。die() は呼ばず演出のみ）
    const hb = hostBots.get(data.victim);
    if (hb) {
      const chest2 = hb.pos.clone();
      chest2.y += hb.crouched ? 0.95 : 1.25;
      let dir2 = new THREE.Vector3(0, 0.2, 0);
      const atk2 = remotes.get(data.attacker);
      if (atk2) dir2.subVectors(hb.pos, atk2.pos).setY(0.15).normalize();
      else if (data.attacker === selfId) dir2.subVectors(hb.pos, player.pos).setY(0.15).normalize();
      if (typeof bloodFX === 'function') bloodFX(chest2, dir2);
      if (data.kill || !(data.hp > 0)) {
        hb.alive = false;
        hb.hp = 0;
        hb.deathT = 0;
        hb.removeT = 0;
        hb.g.visible = true;
      } else {
        hb.hp = data.hp;
        hb.state = 'combat';
        if (atk2) hb.lastKnown.copy(atk2.pos);
        else if (data.attacker === selfId) hb.lastKnown.copy(player.pos);
      }
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
    finishRemoteDie(r);
    r.alive = true;
    r.dying = false;
    r.dieT = 0;
    r.g.rotation.x = 0;
    r.g.visible = true;
    r.prot = true;
    r.protT = 2;
    ensureProtAura(r);
    rebuildOnlineHits();
  }

  function startRemoteDie(r) {
    if (!r || r.dying) {
      if (r) { r.alive = false; r.g.visible = true; }
      return;
    }
    r.alive = false;
    r.dying = true;
    r.dieT = 0;
    r.fallDir = Math.random() < 0.5 ? 1 : -1;
    r.g.visible = true;
    r.prot = false;
    r.protT = 0;
    setProtAuraVisible(r, false);
    if (r.legL) r.legL.rotation.x = 0;
    if (r.legR) r.legR.rotation.x = 0;
  }

  function finishRemoteDie(r) {
    if (!r) return;
    r.dying = false;
    r.dieT = 0;
    r.g.rotation.x = 0;
  }

  function ensureProtAura(r) {
    if (!r || r.protAura) return;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8ad4ff,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.2, 18, 12), mat);
    mesh.position.y = 1.05;
    mesh.renderOrder = 6;
    mesh.visible = false;
    r.g.add(mesh);
    r.protAura = mesh;
  }

  function setProtAuraVisible(r, on) {
    if (!r) return;
    if (on) ensureProtAura(r);
    if (r.protAura) r.protAura.visible = !!on;
  }

  function notifyFire(weapon) {
    if (!game.online || typeof Net === 'undefined') return;
    Net.sendFire(weapon || 'assault');
  }

  function onRemoteFire(data) {
    if (!game.online || !data) return;
    const selfId = Net.getState().selfId;
    if (data.id === selfId) return;
    const r = remotes.get(data.id);
    if (!r || !r.alive || r.dying) return;
    playRemoteFire(r, data.weapon || r.weapon);
  }

  function playRemoteFire(r, weapon) {
    if (r.flash) {
      const scale = weapon === 'shotgun' ? 0.52
        : weapon === 'sniper' ? 0.44
        : weapon === 'pistol' ? 0.26
        : 0.36;
      r.flash.material.opacity = 0.95;
      r.flash.material.rotation = Math.random() * 6.28;
      r.flash.scale.setScalar(scale * (0.9 + Math.random() * 0.25));
    }

    const mw = r.muzzle
      ? r.muzzle.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(r.pos.x, r.pos.y + 1.35, r.pos.z);
    const dir = new THREE.Vector3(-Math.sin(r.yaw), 0.02, -Math.cos(r.yaw)).normalize();
    const end = mw.clone().addScaledVector(dir, weapon === 'shotgun' ? 28 : 70);
    if (typeof spawnTracer === 'function') {
      const col = weapon === 'sniper' ? 0xff8866 : 0xffc07a;
      spawnTracer(mw, end, col);
      if (weapon === 'shotgun') {
        for (let i = 0; i < 3; i++) {
          const spread = new THREE.Vector3(
            (Math.random() - 0.5) * 0.12,
            (Math.random() - 0.5) * 0.08,
            (Math.random() - 0.5) * 0.12,
          );
          spawnTracer(mw, end.clone().add(spread.multiplyScalar(28)), col);
        }
      }
    }

    if (typeof AudioSys !== 'undefined' && player.alive) {
      const d = r.pos.distanceTo(player.pos);
      if (d < 72) {
        const rel = new THREE.Vector3().subVectors(r.pos, player.pos);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const pan = Math.max(-1, Math.min(1, rel.normalize().dot(right))) * 0.85;
        AudioSys.enemyShot(d, pan);
      }
    }
  }

  function remoteAudioPan(r) {
    const rel = new THREE.Vector3().subVectors(r.pos, player.pos);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    return Math.max(-1, Math.min(1, rel.normalize().dot(right))) * 0.85;
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
    clearHostBots();
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
    // ホストは足りない枠を bot で補充（サーバーへ宣言まで行う）
    spawnHostBots();
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
          y: player.pos.y,
          z: player.pos.z,
          yaw: player.yaw,
          pitch: player.pitch,
          crouch: player.crouching,
          weapon: typeof arsenal !== 'undefined' ? arsenal.activeId : 'assault',
        });
      }
    }

    // ホスト管理 bot の位置をまとめて送信（モデル+Z正面 → remote 表示の yaw+π に合わせる）
    if (isHost() && hostBots.size) {
      botAcc += dt;
      if (botAcc >= 0.05) {
        botAcc = 0;
        const list = [];
        for (const [id, e] of hostBots) {
          if (!e.alive) continue;
          list.push({
            id,
            x: e.pos.x,
            y: e.pos.y || 0,
            z: e.pos.z,
            yaw: e.g.rotation.y - Math.PI,
            pitch: 0,
            crouch: !!e.crouched,
            weapon: e.kind === 'sniper' ? 'sniper' : 'assault',
          });
        }
        if (list.length) Net.sendBotPoses(list);
      }
    }

    const alpha = 1 - Math.exp(-14 * dt);
    for (const r of remotes.values()) {
      // 死亡倒れアニメ（位置は最後の補間を維持）
      if (r.dying) {
        r.dieT += dt;
        const k = Math.min(r.dieT / 0.45, 1);
        const s = k * k * (3 - 2 * k);
        r.g.rotation.x = r.fallDir * (Math.PI / 2) * s;
        r.g.position.set(r.pos.x, r.pos.y, r.pos.z);
        if (r.flash) r.flash.material.opacity *= Math.exp(-25 * dt);
        if (r.dieT > 2.4) {
          finishRemoteDie(r);
          r.g.visible = false;
        }
        continue;
      }

      if (!r.alive) continue;

      const prevX = r.pos.x;
      const prevZ = r.pos.z;
      r.pos.x += (r.tx - r.pos.x) * alpha;
      r.pos.y += ((r.ty || 0) - r.pos.y) * alpha;
      r.pos.z += (r.tz - r.pos.z) * alpha;
      r.yaw = lerpYaw(r.yaw, r.tyaw, alpha);
      r.g.position.set(r.pos.x, r.pos.y, r.pos.z);
      // 敵モデル正面は +Z、プレイヤー yaw=0 はカメラ -Z → 表示は +π
      r.g.rotation.y = r.yaw + Math.PI;
      r.g.rotation.x = 0;

      // AI と同じしゃがみ：胴を下げる（部位メッシュ＝ヒットボックスも追従）
      if (r.torso) {
        const targetTorsoY = r.crouch ? 0.63 : 0.95;
        r.torso.position.y += (targetTorsoY - r.torso.position.y) * (1 - Math.exp(-8 * dt));
      }

      // 足音＋脚振り（水平移動・接地付近）
      const dx = r.pos.x - prevX;
      const dz = r.pos.z - prevZ;
      const speed = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
      const grounded = (r.pos.y || 0) < 0.55;
      if (grounded && speed > 1.2 && r.legL && r.legR) {
        const prev = Math.sin(r.walkPhase);
        r.walkPhase += speed * dt * 2.35;
        const cur = Math.sin(r.walkPhase);
        const sw = cur * 0.55 * Math.min(speed / 4.5, 1);
        r.legL.rotation.x = sw;
        r.legR.rotation.x = -sw;
        if (prev >= 0 && cur < 0 && player.alive && typeof AudioSys !== 'undefined') {
          const d = r.pos.distanceTo(player.pos);
          if (d < 42) AudioSys.enemyStep(d, remoteAudioPan(r), speed > 4.5);
        }
      } else if (r.legL && r.legR) {
        const ease = 1 - Math.exp(-10 * dt);
        r.legL.rotation.x += (0 - r.legL.rotation.x) * ease;
        r.legR.rotation.x += (0 - r.legR.rotation.x) * ease;
      }

      if (r.flash) r.flash.material.opacity *= Math.exp(-25 * dt);

      // 無敵オーラ（snap.prot または リスポーン直後）
      if (r.protT > 0) r.protT = Math.max(0, r.protT - dt);
      const showProt = r.prot || r.protT > 0;
      setProtAuraVisible(r, showProt);
      if (showProt && r.protAura) {
        const pulse = 0.14 + 0.12 * (0.5 + 0.5 * Math.sin(game.time * 9));
        r.protAura.material.opacity = pulse;
        const s = 1 + 0.04 * Math.sin(game.time * 7);
        r.protAura.scale.set(s, 1.05 + 0.03 * Math.sin(game.time * 5), s);
      }
    }
  }

  function notifyRespawn() {
    if (game.online && typeof Net !== 'undefined') Net.sendRespawn();
  }

  function reset() {
    clearRemotes();
    clearNetLoots();
    clearHostBots();
    sendAcc = 0;
    botAcc = 0;
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
    ensureHook, claimHit, notifyRespawn, rebuildOnlineHits, notifyFire,
    notifyNadeThrow, claimNadeBoom, claimHeal, notifyHealStart, notifyHealCancel,
    claimLoot, syncLoadoutToServer,
    isWaiting, applyMatchClock,
    isHost, notifyBotFire, claimBotHit, notifyBotRespawn,
  };
})();

function lerpYaw(from, to, alpha) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * alpha;
}
