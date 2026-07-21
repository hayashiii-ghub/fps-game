/**
 * オンライン対戦ネット層（ルーム + pose + hit）
 */
const Net = (() => {
  let ws = null;
  let room = null;
  let selfId = null;
  let team = null;
  let inputSeq = 0;
  const listeners = new Set();

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

  function wsUrl(code) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/api/ws?room=${encodeURIComponent(code)}`;
  }

  async function createRoom() {
    const res = await fetch('/api/room', { method: 'POST' });
    if (!res.ok) throw new Error(`create room failed: ${res.status}`);
    const data = await res.json();
    return data.code;
  }

  function connect(code) {
    disconnect();
    room = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (room.length < 4) {
      emit('error', { message: 'invalid room code' });
      return;
    }
    emit('status', { state: 'connecting', room });
    ws = new WebSocket(wsUrl(room));
    ws.addEventListener('open', () => {
      emit('status', { state: 'open', room });
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (msg.t === 'welcome') {
        selfId = msg.you;
        team = msg.team || 'blue';
        emit('welcome', msg);
      } else if (msg.t === 'pong') {
        emit('pong', msg);
      } else if (msg.t === 'peer') {
        emit('peer', msg);
      } else if (msg.t === 'snap') {
        emit('snap', msg);
      } else if (msg.t === 'dmg' || msg.t === 'score' || msg.t === 'respawn') {
        emit(msg.t, msg);
      } else {
        emit('message', msg);
      }
    });
    ws.addEventListener('close', () => {
      emit('status', { state: 'closed', room });
      ws = null;
      selfId = null;
      team = null;
    });
    ws.addEventListener('error', () => {
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
    });
  }

  function sendHit(targetId, part, weapon) {
    return send({ t: 'hit', targetId, part, weapon });
  }

  function sendRespawn() {
    return send({ t: 'respawn' });
  }

  function sendMatchStart() {
    return send({ t: 'match_start' });
  }

  function disconnect() {
    if (ws) {
      try { ws.close(); } catch (_) { /* ignore */ }
      ws = null;
    }
    selfId = null;
    team = null;
  }

  function getState() {
    return {
      room,
      selfId,
      team,
      connected: !!(ws && ws.readyState === WebSocket.OPEN),
    };
  }

  return {
    createRoom, connect, disconnect, ping,
    sendInput, sendHit, sendRespawn, sendMatchStart,
    on, getState,
  };
})();
