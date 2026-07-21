import { DurableObject } from 'cloudflare:workers';
import { normalizeRoomCode, isValidRoomCode, randomRoomCode } from './room-code.js';
import { sanitizePose, sanitizeMap } from './pose.js';
import { validateHit, applyDamage } from './combat.js';
import {
  defaultLoadout,
  validateNadeThrow,
  validateNadeBoom,
  sanitizeNadeThrow,
  grenadeDmgAt,
  grenadePeerDmgAt,
  dist3,
  applyHeal,
  pickDeathDrop,
  pickSupplyBundle,
  tryGrantLoot,
} from './gear.js';

const SNAP_MS = 50;
const SUPPLY_FIRST_MS = 3000;
const SUPPLY_EVERY_MS = 42000;
const LOOT_PICK_R = 1.8;

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
 * 1 ルーム = 1 Durable Object（pose / ヒット / グレ / 回復 / ルート）
 */
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    /** @type {Map<WebSocket, object>} */
    this.sessions = new Map();
    /** @type {Map<string, object>} */
    this.loots = new Map();
    this.tick = 0;
    this.score = { blue: 0, red: 0 };
    this.map = 'desert';
    this.matchActive = false;
    this.supplyAcc = 0;
    this.supplyArmed = false;
    this.ctx.getWebSockets().forEach((ws) => {
      const attachment = ws.deserializeAttachment();
      if (attachment) {
        this.sessions.set(ws, {
          ...defaultLoadout(),
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

  invPayload(s) {
    return {
      grenades: s.grenades,
      medkits: s.medkits,
      armor: !!s.armor,
      hp: s.hp,
    };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const code = normalizeRoomCode(url.searchParams.get('room'));

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    const id = crypto.randomUUID().slice(0, 8);
    const team = this.pickTeam();
    const load = defaultLoadout();
    const session = {
      id, room: code, team, joinedAt: Date.now(),
      pose: null, hp: 100, alive: true, spawnProtUntil: 0, lastFireAt: 0,
      ...load,
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
      map: this.map || 'desert',
      match: !!this.matchActive,
      inv: this.invPayload(session),
      loots: [...this.loots.values()],
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
        weapon: s.weapon || (s.pose && s.pose.weapon) || 'assault',
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
    if (this.matchActive) {
      this.supplyAcc += SNAP_MS;
      const need = this.supplyArmed ? SUPPLY_EVERY_MS : SUPPLY_FIRST_MS;
      if (this.supplyAcc >= need) {
        this.supplyAcc = 0;
        this.supplyArmed = true;
        this.spawnSupply();
      }
    }
    if (this.sessions.size > 0) {
      await this.ctx.storage.setAlarm(Date.now() + SNAP_MS);
    }
  }

  clearLoots() {
    if (this.loots.size === 0) return;
    this.loots.clear();
    this.broadcastAll({ t: 'loot_clear' });
  }

  spawnLootAt(x, z, type) {
    const id = crypto.randomUUID().slice(0, 8);
    const loot = {
      id,
      type,
      x: Math.max(-58, Math.min(58, x + (Math.random() - 0.5))),
      z: Math.max(-58, Math.min(58, z + (Math.random() - 0.5))),
    };
    this.loots.set(id, loot);
    this.broadcastAll({ t: 'loot_spawn', loot });
    return loot;
  }

  spawnSupply() {
    for (const type of pickSupplyBundle()) {
      this.spawnLootAt(0, 0, type);
    }
    this.broadcastAll({ t: 'supply', at: { x: 0, z: 0 } });
  }

  spawnDeathDrop(victim) {
    if (!victim || !victim.pose) return;
    if (Math.random() >= 0.7) return;
    this.spawnLootAt(victim.pose.x, victim.pose.z, pickDeathDrop());
  }

  resetMatch(mapId) {
    this.map = sanitizeMap(mapId);
    this.score = { blue: 0, red: 0 };
    this.matchActive = true;
    this.supplyAcc = 0;
    this.supplyArmed = false;
    this.clearLoots();
    const now = Date.now();
    const load = defaultLoadout();
    for (const s of this.sessions.values()) {
      Object.assign(s, load);
      s.hp = 100;
      s.alive = true;
      s.spawnProtUntil = now + 2000;
      s.lastFireAt = 0;
    }
    this.broadcastAll({
      t: 'match_start',
      map: this.map,
      blue: 0,
      red: 0,
      match: true,
    });
    for (const [ws, s] of this.sessions) {
      try {
        ws.send(JSON.stringify({ t: 'inv', id: s.id, ...this.invPayload(s) }));
      } catch (_) { /* ignore */ }
    }
  }

  emitDmg(attacker, victim, part, weapon, applied, extra) {
    this.broadcastAll({
      t: 'dmg',
      attacker: attacker ? attacker.id : null,
      victim: victim.id,
      part,
      weapon,
      dmg: applied.dmg,
      hp: victim.hp,
      kill: applied.kill,
      score: { ...this.score },
      ...(extra || {}),
    });
  }

  applyHitResult(attacker, victim, part, weapon, rawDmg, extra) {
    const applied = applyDamage(victim, rawDmg);
    victim.hp = applied.hp;
    if (applied.kill) {
      victim.alive = false;
      if (victim.team === 'red') this.score.blue++;
      else this.score.red++;
      this.spawnDeathDrop(victim);
    }
    this.emitDmg(attacker, victim, part, weapon, applied, extra);
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
    this.applyHitResult(attacker, victim, part, weapon, result.dmg);
  }

  handleNadeThrow(session, msg, exceptWs) {
    const now = Date.now();
    const result = validateNadeThrow(session, now);
    if (!result.ok) return;
    session.grenades = result.grenades;
    session.pendingNade = true;
    session.lastNadeAt = now;
    const body = sanitizeNadeThrow(msg);
    this.broadcast(exceptWs, {
      t: 'nade_throw',
      id: session.id,
      ...body,
    });
    try {
      exceptWs.send(JSON.stringify({
        t: 'inv', id: session.id, ...this.invPayload(session),
      }));
    } catch (_) { /* ignore */ }
  }

  handleNadeBoom(attacker, msg) {
    const now = Date.now();
    const result = validateNadeBoom(attacker, msg, now);
    if (!result.ok) return;
    attacker.pendingNade = false;
    const pos = result.pos;
    this.broadcastAll({
      t: 'nade_boom',
      id: attacker.id,
      x: pos.x, y: pos.y, z: pos.z,
    });

    for (const victim of this.sessions.values()) {
      if (!victim.alive || victim.hp <= 0) continue;
      if (victim.spawnProtUntil && now < victim.spawnProtUntil) continue;
      const eyeY = victim.crouch ? 1.0 : 1.4;
      const vx = victim.pose ? victim.pose.x : 0;
      const vz = victim.pose ? victim.pose.z : 0;
      const d = dist3(pos.x, pos.y, pos.z, vx, eyeY, vz);
      let raw = 0;
      if (victim.id === attacker.id) raw = grenadeDmgAt(d);
      else if (victim.team !== attacker.team) raw = grenadePeerDmgAt(d);
      if (raw <= 0) continue;
      this.applyHitResult(attacker, victim, 'torso', 'grenade', raw, {
        x: pos.x, y: pos.y, z: pos.z,
      });
    }
  }

  handleHeal(session, ws) {
    const result = applyHeal(session);
    if (!result.ok) return;
    session.hp = result.hp;
    session.medkits = result.medkits;
    const payload = {
      t: 'healed',
      id: session.id,
      hp: session.hp,
      medkits: session.medkits,
    };
    this.broadcastAll(payload);
    try {
      ws.send(JSON.stringify({ t: 'inv', id: session.id, ...this.invPayload(session) }));
    } catch (_) { /* ignore */ }
  }

  handleLootPick(session, msg, ws) {
    const id = String(msg.lootId || '');
    const loot = this.loots.get(id);
    if (!loot || !session.alive || !session.pose) return;
    const d = Math.hypot(loot.x - session.pose.x, loot.z - session.pose.z);
    if (d > LOOT_PICK_R) return;
    const grant = tryGrantLoot(session, loot.type);
    if (!grant.ok) {
      try {
        ws.send(JSON.stringify({ t: 'loot_deny', lootId: id, reason: grant.reason }));
      } catch (_) { /* ignore */ }
      return;
    }
    this.loots.delete(id);
    this.broadcastAll({ t: 'loot_gone', lootId: id });
    try {
      ws.send(JSON.stringify({
        t: 'loot_grant',
        lootId: id,
        type: loot.type,
        ...grant.granted,
        inv: this.invPayload(session),
      }));
    } catch (_) { /* ignore */ }
  }

  handleRespawn(session) {
    session.hp = 100;
    session.alive = true;
    session.spawnProtUntil = Date.now() + 2000;
    session.pendingNade = false;
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
        map: this.map || 'desert',
        match: !!this.matchActive,
        inv: this.invPayload(session),
        loots: [...this.loots.values()],
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
      this.resetMatch(msg.map);
      return;
    }

    if (msg.t === 'input') {
      const pose = sanitizePose(msg);
      if (session.pose && pose.seq < session.pose.seq) return;
      session.pose = pose;
      session.weapon = pose.weapon;
      session.crouch = pose.crouch;
      await this.ensureAlarm();
      return;
    }

    if (msg.t === 'hit') {
      this.handleHit(session, msg);
      return;
    }

    if (msg.t === 'nade_throw') {
      this.handleNadeThrow(session, msg, ws);
      return;
    }

    if (msg.t === 'nade_boom') {
      this.handleNadeBoom(session, msg);
      return;
    }

    if (msg.t === 'heal') {
      this.handleHeal(session, ws);
      return;
    }

    if (msg.t === 'loot_pick') {
      this.handleLootPick(session, msg, ws);
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
