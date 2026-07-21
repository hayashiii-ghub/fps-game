/**
 * オンライン対戦ネット層（ルーム作成・WebSocket）
 * 現状 Step1: 入退室・ping/pong まで
 */
const Net = (() => {
  let ws = null;
  let room = null;
  let selfId = null;
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
        emit('welcome', msg);
      } else if (msg.t === 'pong') {
        emit('pong', msg);
      } else if (msg.t === 'peer') {
        emit('peer', msg);
      } else {
        emit('message', msg);
      }
    });
    ws.addEventListener('close', () => {
      emit('status', { state: 'closed', room });
      ws = null;
    });
    ws.addEventListener('error', () => {
      emit('error', { message: 'websocket error' });
    });
  }

  function ping(n = 0) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ t: 'ping', n }));
    return true;
  }

  function disconnect() {
    if (ws) {
      try { ws.close(); } catch (_) { /* ignore */ }
      ws = null;
    }
    selfId = null;
  }

  function getState() {
    return {
      room,
      selfId,
      connected: !!(ws && ws.readyState === WebSocket.OPEN),
    };
  }

  return { createRoom, connect, disconnect, ping, on, getState };
})();
