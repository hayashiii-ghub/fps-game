import { DurableObject } from 'cloudflare:workers';
import { normalizeRoomCode, isValidRoomCode, randomRoomCode } from './room-code.js';
import { sanitizePose } from './pose.js';
import { validateHit, applyDamage } from './combat.js';

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
 * 1 ルーム = 1 Durable Object（pose snap + ヒット権威）
 */
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    /** @type {Map<WebSocket, object>} */
    this.sessions = new Map();
    this.tick = 0;
    this.score = { blue: 0, red: 0 };
    this.ctx.getWebSockets().forEach((ws) => {
      const attachment = ws.deserializeAttachment();
      if (attachment) {
        this.sessions.set(ws, {
          ...attachment,
          pose: null,
          hp: 100,
          alive: true,
          spawnProtUntil: 0,
          lastFireAt: 0,
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

  findById(id) {
    for (const [ws, s] of this.sessions) {
      if (s.id === id) return { ws, s };
    }
    return null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const code = normalizeRoomCode(url.searchParams.get('room'));

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    const id = crypto.randomUUID().slice(0, 8);
    const team = this.pickTeam();
    const session = {
      id, room: code, team, joinedAt: Date.now(),
      pose: null, hp: 100, alive: true, spawnProtUntil: 0, lastFireAt: 0,
    };
    server.serializeAttachment({ id, room: code, team, joinedAt: session.joinedAt });
    this.sessions.set(server, session);

    server.send(JSON.stringify({
      t: 'welcome',
      you: id,
      room: code,
      team,
      peers: this.peerList(server),
      score: this.score,
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

  broadcastAll(msg) {
    const raw = JSON.stringify(msg);
    for (const [ws] of this.sessions) {
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
        alive: !!s.alive,
        hp: s.hp,
        ...s.pose,
      });
    }
    return { t: 'snap', tick: this.tick, players, score: this.score };
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

  resetMatch() {
    this.score = { blue: 0, red: 0 };
    const now = Date.now();
    for (const s of this.sessions.values()) {
      s.hp = 100;
      s.alive = true;
      s.spawnProtUntil = now + 2000;
      s.lastFireAt = 0;
    }
    this.broadcastAll({ t: 'score', blue: 0, red: 0, match: true });
  }

  handleHit(attacker, msg) {
    const found = this.findById(String(msg.targetId || ''));
    if (!found) return;
    const victim = found.s;
    const now = Date.now();
    const part = String(msg.part || 'torso');
    const weapon = String(msg.weapon || 'assault');
    const result = validateHit({
      attacker, victim, part, weapon, now,
    });
    if (!result.ok) return;

    attacker.lastFireAt = now;
    const applied = applyDamage(victim, result.dmg);
    victim.hp = applied.hp;
    if (applied.kill) {
      victim.alive = false;
      if (victim.team === 'red') this.score.blue++;
      else this.score.red++;
    }

    this.broadcastAll({
      t: 'dmg',
      attacker: attacker.id,
      victim: victim.id,
      part,
      weapon,
      dmg: result.dmg,
      hp: victim.hp,
      kill: applied.kill,
      score: { ...this.score },
    });
  }

  handleRespawn(session) {
    session.hp = 100;
    session.alive = true;
    session.spawnProtUntil = Date.now() + 2000;
    this.broadcastAll({
      t: 'respawn',
      id: session.id,
      team: session.team,
    });
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
        score: this.score,
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

    if (msg.t === 'match_start') {
      this.resetMatch();
      return;
    }

    if (msg.t === 'input') {
      const pose = sanitizePose(msg);
      if (session.pose && pose.seq < session.pose.seq) return;
      session.pose = pose;
      await this.ensureAlarm();
      return;
    }

    if (msg.t === 'hit') {
      this.handleHit(session, msg);
      return;
    }

    if (msg.t === 'respawn') {
      this.handleRespawn(session);
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
