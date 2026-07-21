import { DurableObject } from 'cloudflare:workers';
import { normalizeRoomCode, isValidRoomCode, randomRoomCode } from './room-code.js';

/**
 * エントリ Worker: /api/* を処理し、それ以外は Static Assets へ。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/room' && request.method === 'POST') {
      const code = randomRoomCode();
      return Response.json({ code });
    }

    if (url.pathname === '/api/ws') {
      const upgrade = request.headers.get('Upgrade');
      if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }
      if (request.method !== 'GET') {
        return new Response('Expected GET', { status: 400 });
      }
      const code = normalizeRoomCode(url.searchParams.get('room'));
      if (!isValidRoomCode(code)) {
        return new Response('Invalid room code', { status: 400 });
      }
      const stub = env.ROOM.getByName(code);
      return stub.fetch(request);
    }

    if (url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 });
    }

    // assets は run_worker_first 対象外なので通常ここには来ないが、保険
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};

/**
 * 1 ルーム = 1 Durable Object（WebSocket Hibernation）
 */
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sessions = new Map();
    this.ctx.getWebSockets().forEach((ws) => {
      const attachment = ws.deserializeAttachment();
      if (attachment) this.sessions.set(ws, { ...attachment });
    });
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    );
  }

  async fetch(request) {
    const url = new URL(request.url);
    const code = normalizeRoomCode(url.searchParams.get('room'));

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    const id = crypto.randomUUID().slice(0, 8);
    const session = { id, room: code, joinedAt: Date.now() };
    server.serializeAttachment(session);
    this.sessions.set(server, session);

    server.send(JSON.stringify({
      t: 'welcome',
      you: id,
      room: code,
      peers: this.peerList(server),
    }));
    this.broadcast(server, { t: 'peer', op: 'join', id });

    return new Response(null, { status: 101, webSocket: client });
  }

  peerList(except) {
    const peers = [];
    for (const [ws, s] of this.sessions) {
      if (ws !== except) peers.push(s.id);
    }
    return peers;
  }

  broadcast(except, msg) {
    const raw = JSON.stringify(msg);
    for (const [ws] of this.sessions) {
      if (ws === except) continue;
      try { ws.send(raw); } catch (_) { /* ignore */ }
    }
  }

  async webSocketMessage(ws, message) {
    const session = this.sessions.get(ws);
    if (!session) return;
    let msg;
    try {
      msg = typeof message === 'string' ? JSON.parse(message) : null;
    } catch (_) {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'hello') {
      ws.send(JSON.stringify({
        t: 'welcome',
        you: session.id,
        room: session.room,
        peers: this.peerList(ws),
      }));
      return;
    }

    if (msg.t === 'ping') {
      ws.send(JSON.stringify({
        t: 'pong',
        n: msg.n ?? 0,
        peers: this.peerList(ws).length + 1,
      }));
    }
  }

  async webSocketClose(ws, code, reason) {
    const session = this.sessions.get(ws);
    this.sessions.delete(ws);
    if (session) this.broadcast(null, { t: 'peer', op: 'leave', id: session.id });
    try { ws.close(code, reason); } catch (_) { /* ignore */ }
  }

  async webSocketError(ws) {
    const session = this.sessions.get(ws);
    this.sessions.delete(ws);
    if (session) this.broadcast(null, { t: 'peer', op: 'leave', id: session.id });
  }
}
