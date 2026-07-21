import { DurableObject } from 'cloudflare:workers';
import { normalizeRoomCode, isValidRoomCode, randomRoomCode } from './room-code.js';
import { sanitizePose } from './pose.js';

const SNAP_MS = 50;

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

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};

/**
 * 1 ルーム = 1 Durable Object（WebSocket Hibernation + pose snap）
 */
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    /** @type {Map<WebSocket, object>} */
    this.sessions = new Map();
    this.tick = 0;
    this.ctx.getWebSockets().forEach((ws) => {
      const attachment = ws.deserializeAttachment();
      if (attachment) {
        this.sessions.set(ws, {
          ...attachment,
          pose: attachment.pose || null,
        });
      }
    });
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    );
  }

  countTeam(team) {
    let n = 0;
    for (const s of this.sessions.values()) if (s.team === team) n++;
    return n;
  }

  pickTeam() {
    return this.countTeam('blue') <= this.countTeam('red') ? 'blue' : 'red';
  }

  async fetch(request) {
    const url = new URL(request.url);
    const code = normalizeRoomCode(url.searchParams.get('room'));

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    const id = crypto.randomUUID().slice(0, 8);
    const team = this.pickTeam();
    const session = { id, room: code, team, joinedAt: Date.now(), pose: null };
    server.serializeAttachment({ id, room: code, team, joinedAt: session.joinedAt });
    this.sessions.set(server, session);

    server.send(JSON.stringify({
      t: 'welcome',
      you: id,
      room: code,
      team,
      peers: this.peerList(server),
    }));
    this.broadcast(server, { t: 'peer', op: 'join', id, team });
    await this.ensureAlarm();

    return new Response(null, { status: 101, webSocket: client });
  }

  peerList(except) {
    const peers = [];
    for (const [ws, s] of this.sessions) {
      if (ws !== except) peers.push({ id: s.id, team: s.team });
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

  buildSnap() {
    const players = [];
    for (const s of this.sessions.values()) {
      if (!s.pose) continue;
      players.push({
        id: s.id,
        team: s.team,
        ...s.pose,
      });
    }
    return { t: 'snap', tick: this.tick, players };
  }

  broadcastSnap() {
    this.tick++;
    const snap = this.buildSnap();
    if (snap.players.length === 0) return;
    const raw = JSON.stringify(snap);
    for (const [ws] of this.sessions) {
      try { ws.send(raw); } catch (_) { /* ignore */ }
    }
  }

  async ensureAlarm() {
    const next = await this.ctx.storage.getAlarm();
    if (next == null) {
      await this.ctx.storage.setAlarm(Date.now() + SNAP_MS);
    }
  }

  async alarm() {
    this.broadcastSnap();
    if (this.sessions.size > 0) {
      await this.ctx.storage.setAlarm(Date.now() + SNAP_MS);
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
        team: session.team,
        peers: this.peerList(ws),
      }));
      return;
    }

    if (msg.t === 'ping') {
      ws.send(JSON.stringify({
        t: 'pong',
        n: msg.n ?? 0,
        peers: this.sessions.size,
      }));
      return;
    }

    if (msg.t === 'input') {
      const pose = sanitizePose(msg);
      if (session.pose && pose.seq < session.pose.seq) return;
      session.pose = pose;
      await this.ensureAlarm();
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
