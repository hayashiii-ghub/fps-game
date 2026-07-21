/**
 * オンライン対戦ネット層（ルーム + pose + hit + gear + match）
 * heartbeat + 切断時の同ルーム自動再接続 + playerToken
 */
const Net = (() => {
  let ws = null;
  let room = null;
  let selfId = null;
  let team = null;
  let role = 'active';
  let playerToken = null;
  let inputSeq = 0;
  let intentionalClose = false;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let reconnectAttempt = 0;
  const listeners = new Set();

  const HEARTBEAT_MS = 12000;
  const RECONNECT_BASE_MS = 700;
  const RECONNECT_MAX_MS = 8000;
  const TOKEN_KEY = 'kgfps_net_token';

  const DIRECT = new Set([
    'welcome', 'pong', 'peer', 'snap', 'dmg', 'score', 'respawn',
    'match_start', 'match_end', 'match_deny',
    'nade_throw', 'nade_boom', 'healed', 'inv',
    'loot_spawn', 'loot_gone', 'loot_clear', 'loot_grant', 'loot_deny', 'supply',
  ]);

  function emit(ev, data) {
    for (const fn of listeners) {
      try { fn(ev, data); } catch (e) { console.warn('[Net]', e); }
    }
  }

  function on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function send(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(obj));
    return true;
  }

  function tokenStorageKey(code) {
    return `${TOKEN_KEY}:${String(code || '').toUpperCase()}`;
  }

  function loadToken(code) {
    try {
      return sessionStorage.getItem(tokenStorageKey(code)) || '';
    } catch (_) {
      return '';
    }
  }

  function saveToken(code, token) {
    if (!code || !token) return;
    try {
      sessionStorage.setItem(tokenStorageKey(code), token);
    } catch (_) { /* ignore */ }
  }

  function clearToken(code) {
    if (!code) return;
    try {
      sessionStorage.removeItem(tokenStorageKey(code));
    } catch (_) { /* ignore */ }
  }

  function wsUrl(code, token) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let u = `${proto}//${location.host}/api/ws?room=${encodeURIComponent(code)}`;
    if (token) u += `&token=${encodeURIComponent(token)}`;
    return u;
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      // DO hibernation 用の生 ping（AutoResponse）
      try { ws.send('ping'); } catch (_) { /* ignore */ }
      send({ t: 'ping', n: Date.now() % 100000 });
    }, HEARTBEAT_MS);
  }

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect(code) {
    clearReconnect();
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * (2 ** Math.min(reconnectAttempt, 4)),
    );
    reconnectAttempt += 1;
    emit('status', { state: 'reconnecting', room: code, attempt: reconnectAttempt });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect(code, { fromReconnect: true });
    }, delay);
  }

  async function createRoom() {
    const res = await fetch('/api/room', { method: 'POST' });
    if (!res.ok) throw new Error(`create room failed: ${res.status}`);
    const data = await res.json();
    return data.code;
  }

  function connect(code, opts) {
    const fromReconnect = !!(opts && opts.fromReconnect);
    if (!fromReconnect) {
      intentionalClose = false;
      reconnectAttempt = 0;
      clearReconnect();
    }
    disconnectSocketOnly();
    room = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (room.length < 4) {
      emit('error', { message: 'invalid room code' });
      return;
    }
    playerToken = loadToken(room) || null;
    emit('status', {
      state: fromReconnect ? 'reconnecting' : 'connecting',
      room,
      attempt: reconnectAttempt,
    });
    const sock = new WebSocket(wsUrl(room, playerToken));
    ws = sock;
    sock.addEventListener('open', () => {
      if (ws !== sock) return;
      reconnectAttempt = 0;
      startHeartbeat();
      emit('status', { state: 'open', room });
    });
    sock.addEventListener('message', (ev) => {
      if (ws !== sock) return;
      if (ev.data === 'pong') return; // DO AutoResponse
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (msg.t === 'welcome') {
        selfId = msg.you;
        team = msg.team || 'blue';
        role = msg.role || 'active';
        if (msg.token) {
          playerToken = msg.token;
          saveToken(room, playerToken);
        }
        emit('welcome', msg);
      } else if (DIRECT.has(msg.t)) {
        emit(msg.t, msg);
      } else {
        emit('message', msg);
      }
    });
    sock.addEventListener('close', () => {
      if (ws !== sock) return; // 付け替え・明示 disconnect 済み
      stopHeartbeat();
      ws = null;
      const wasRoom = room;
      selfId = null;
      team = null;
      role = 'active';
      emit('status', { state: 'closed', room: wasRoom });
      if (!intentionalClose && wasRoom && wasRoom.length >= 4) {
        scheduleReconnect(wasRoom);
      }
    });
    sock.addEventListener('error', () => {
      if (ws !== sock) return;
      emit('error', { message: 'websocket error' });
    });
  }

  function ping(n = 0) {
    return send({ t: 'ping', n });
  }

  function sendInput(pose) {
    inputSeq = (inputSeq + 1) >>> 0;
    return send({
      t: 'input',
      seq: inputSeq,
      x: pose.x,
      z: pose.z,
      yaw: pose.yaw,
      pitch: pose.pitch,
      crouch: !!pose.crouch,
      weapon: pose.weapon || 'assault',
    });
  }

  function sendHit(targetId, part, weapon) {
    return send({ t: 'hit', targetId, part, weapon });
  }

  function sendNadeThrow(body) {
    return send({ t: 'nade_throw', ...body });
  }

  function sendNadeBoom(pos) {
    return send({ t: 'nade_boom', x: pos.x, y: pos.y, z: pos.z });
  }

  function sendHeal() {
    return send({ t: 'heal' });
  }

  function sendLootPick(lootId) {
    return send({ t: 'loot_pick', lootId });
  }

  function sendRespawn() {
    return send({ t: 'respawn' });
  }

  function sendMatchStart(map) {
    return send({ t: 'match_start', map: map || 'desert' });
  }

  /** ソケットだけ閉じる（再接続用・room / token は残す） */
  function disconnectSocketOnly() {
    stopHeartbeat();
    if (ws) {
      const prev = ws;
      ws = null;
      try { prev.close(); } catch (_) { /* ignore */ }
    }
    selfId = null;
    team = null;
    role = 'active';
  }

  function disconnect() {
    intentionalClose = true;
    clearReconnect();
    const wasRoom = room;
    disconnectSocketOnly();
    // 明示切断でも token は残す（同タブで再参加しやすく）。ルームだけクリア
    room = null;
    playerToken = wasRoom ? loadToken(wasRoom) : null;
  }

  function forgetIdentity() {
    if (room) clearToken(room);
    playerToken = null;
  }

  function getState() {
    return {
      room,
      selfId,
      team,
      role,
      token: playerToken,
      connected: !!(ws && ws.readyState === WebSocket.OPEN),
    };
  }

  return {
    createRoom, connect, disconnect, forgetIdentity, ping,
    sendInput, sendHit, sendNadeThrow, sendNadeBoom, sendHeal, sendLootPick,
    sendRespawn, sendMatchStart,
    on, getState,
  };
})();
