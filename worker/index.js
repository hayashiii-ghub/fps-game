import { DurableObject } from 'cloudflare:workers';
import { normalizeRoomCode, isValidRoomCode, randomRoomCode } from './room-code.js';
import { sanitizePose } from './pose.js';
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
import {
  createMatchState,
  canStartMatch,
  startMatch,
  tickMatch,
  matchPublic,
  resolveJoin,
  resumeByToken,
  pruneReservations,
  serializeMatch,
  restoreMatch,
  sanitizeToken,
  MATCH_SEC,
} from './match.js';

const SNAP_MS = 50;
const SUPPLY_FIRST_MS = 3000;
const SUPPLY_EVERY_MS = 42000;
const LOOT_PICK_R = 1.8;
const PERSIST_EVERY_MS = 2000;
const STORAGE_MATCH = 'match';
const STORAGE_RESERVE = 'reserve';
const STORAGE_LOOTS = 'loots';

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
 * 1 ルーム = 1 Durable Object（試合フェーズ / pose / ヒット / ギア）
 */
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    /** @type {Map<WebSocket, object>} */
    this.sessions = new Map();
    /** @type {Map<string, object>} */
    this.loots = new Map();
    /** @type {Record<string, object>} */
    this.reservations = {};
    this.tick = 0;
    this.match = createMatchState();
    this.persistAcc = 0;
    this._hydrated = false;

    this.ctx.getWebSockets().forEach((ws) => {
      const attachment = ws.deserializeAttachment();
      if (attachment) {
        this.sessions.set(ws, {
          ...defaultLoadout(),
          role: 'active',
          token: '',
          pose: null,
          hp: 100,
          alive: true,
          spawnProtUntil: 0,
          lastFireAt: 0,
          ...attachment,
        });
      }
    });
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    );
  }

  get score() {
    return this.match.score;
  }

  get map() {
    return this.match.map;
  }

  get matchActive() {
    return this.match.phase === 'live';
  }

  async hydrate() {
    if (this._hydrated) return;
    this._hydrated = true;
    const stored = await this.ctx.storage.get([
      STORAGE_MATCH, STORAGE_RESERVE, STORAGE_LOOTS,
    ]);
    if (stored.get(STORAGE_MATCH)) {
      this.match = restoreMatch(stored.get(STORAGE_MATCH));
      tickMatch(this.match, Date.now());
    }
    const res = stored.get(STORAGE_RESERVE);
    if (res && typeof res === 'object') {
      this.reservations = res;
      pruneReservations(this.reservations, Date.now());
    }
    const loots = stored.get(STORAGE_LOOTS);
    if (Array.isArray(loots)) {
      this.loots.clear();
      for (const l of loots) {
        if (l && l.id) this.loots.set(l.id, l);
      }
    }
  }

  async persist(force) {
    this.persistAcc += SNAP_MS;
    if (!force && this.persistAcc < PERSIST_EVERY_MS) return;
    this.persistAcc = 0;
    await this.ctx.storage.put({
      [STORAGE_MATCH]: serializeMatch(this.match),
      [STORAGE_RESERVE]: this.reservations,
      [STORAGE_LOOTS]: [...this.loots.values()],
    });
  }

  countTeam(team) {
    let n = 0;
    for (const s of this.sessions.values()) {
      if (s.role === 'waiting') continue;
      if (s.team === team) n++;
    }
    for (const r of Object.values(this.reservations)) {
      if (r && r.team === team) n++;
    }
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

  newToken() {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }

  invPayload(s) {
    return {
      grenades: s.grenades,
      medkits: s.medkits,
      armor: !!s.armor,
      hp: s.hp,
    };
  }

  welcomePayload(session, exceptWs) {
    const now = Date.now();
    const pub = matchPublic(this.match, now);
    return {
      t: 'welcome',
      you: session.id,
      room: session.room,
      team: session.team,
      role: session.role || 'active',
      token: session.token || '',
      peers: this.peerList(exceptWs),
      score: { ...this.score },
      map: this.map || 'desert',
      match: pub.match,
      phase: pub.phase,
      timeLeft: pub.timeLeft,
      endsAt: pub.endsAt,
      inv: this.invPayload(session),
      loots: [...this.loots.values()],
    };
  }

  isCombatant(session) {
    return session
      && session.role !== 'waiting'
      && this.match.phase === 'live'
      && session.alive;
  }

  async fetch(request) {
    await this.hydrate();
    const url = new URL(request.url);
    const code = normalizeRoomCode(url.searchParams.get('room'));
    const tokenIn = sanitizeToken(url.searchParams.get('token'));

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    const now = Date.now();
    pruneReservations(this.reservations, now);
    const resumed = resumeByToken(this.reservations, tokenIn);
    let session;

    if (resumed.ok) {
      const prev = resumed.player;
      delete this.reservations[tokenIn];
      session = {
        ...defaultLoadout(),
        ...prev,
        id: prev.id,
        room: code,
        team: prev.team || this.pickTeam(),
        token: tokenIn,
        role: 'active',
        joinedAt: prev.joinedAt || now,
        pose: null,
        lastFireAt: 0,
        spawnProtUntil: Math.max(prev.spawnProtUntil || 0, now + 1500),
      };
      // 予約から戻した所持を上書きされないよう default の後に再適用
      session.hp = Number.isFinite(prev.hp) ? prev.hp : 100;
      session.alive = prev.alive !== false && session.hp > 0;
      session.grenades = Number.isFinite(prev.grenades) ? prev.grenades : session.grenades;
      session.medkits = Number.isFinite(prev.medkits) ? prev.medkits : session.medkits;
      session.armor = !!prev.armor;
      session.weapon = prev.weapon || 'assault';
    } else {
      const join = resolveJoin(this.match, null);
      const id = crypto.randomUUID().slice(0, 8);
      const team = this.pickTeam();
      const token = this.newToken();
      const load = defaultLoadout();
      session = {
        id,
        room: code,
        team,
        token,
        role: join.role,
        joinedAt: now,
        pose: null,
        hp: 100,
        alive: true,
        spawnProtUntil: 0,
        lastFireAt: 0,
        ...load,
      };
    }

    server.serializeAttachment({
      id: session.id,
      room: code,
      team: session.team,
      token: session.token,
      role: session.role,
      joinedAt: session.joinedAt,
      hp: session.hp,
      alive: session.alive,
      grenades: session.grenades,
      medkits: session.medkits,
      armor: session.armor,
      weapon: session.weapon,
    });
    this.sessions.set(server, session);

    server.send(JSON.stringify(this.welcomePayload(session, server)));
    if (session.role !== 'waiting') {
      this.broadcast(server, { t: 'peer', op: 'join', id: session.id, team: session.team });
    }
    await this.ensureAlarm();
    await this.persist(true);

    return new Response(null, { status: 101, webSocket: client });
  }

  peerList(except) {
    const peers = [];
    for (const [ws, s] of this.sessions) {
      if (ws === except) continue;
      if (s.role === 'waiting') continue;
      peers.push({ id: s.id, team: s.team });
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

  buildSnap(now) {
    const players = [];
    for (const s of this.sessions.values()) {
      if (!s.pose || s.role === 'waiting') continue;
      players.push({
        id: s.id,
        team: s.team,
        alive: !!s.alive,
        hp: s.hp,
        weapon: s.weapon || (s.pose && s.pose.weapon) || 'assault',
        ...s.pose,
      });
    }
    const pub = matchPublic(this.match, now || Date.now());
    return {
      t: 'snap',
      tick: this.tick,
      players,
      score: { ...this.score },
      phase: pub.phase,
      timeLeft: pub.timeLeft,
      endsAt: pub.endsAt,
    };
  }

  broadcastSnap() {
    this.tick++;
    const snap = this.buildSnap(Date.now());
    if (snap.players.length === 0 && this.match.phase !== 'live') return;
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
    await this.hydrate();
    const now = Date.now();
    const ended = tickMatch(this.match, now);
    if (ended) {
      this.broadcastAll({
        t: 'match_end',
        ...matchPublic(this.match, now),
        score: { ...this.score },
        blue: this.score.blue,
        red: this.score.red,
      });
      await this.persist(true);
    }

    this.broadcastSnap();

    if (this.match.phase === 'live') {
      this.match.supplyAcc += SNAP_MS;
      const need = this.match.supplyArmed ? SUPPLY_EVERY_MS : SUPPLY_FIRST_MS;
      if (this.match.supplyAcc >= need) {
        this.match.supplyAcc = 0;
        this.match.supplyArmed = true;
        this.spawnSupply();
      }
    }

    await this.persist(false);

    if (this.sessions.size > 0
      || Object.keys(this.reservations).length > 0
      || this.match.phase === 'live') {
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

  async resetMatch(mapId) {
    const now = Date.now();
    const gate = canStartMatch(this.match);
    if (!gate.ok) return gate;

    startMatch(this.match, mapId, now);
    this.clearLoots();
    const load = defaultLoadout();
    for (const s of this.sessions.values()) {
      Object.assign(s, load);
      s.role = 'active';
      s.hp = 100;
      s.alive = true;
      s.spawnProtUntil = now + 2000;
      s.lastFireAt = 0;
      s.pendingNade = false;
    }
    // 切断中の予約も次試合用にリセット（チームは維持）
    for (const r of Object.values(this.reservations)) {
      if (!r) continue;
      Object.assign(r, load);
      r.hp = 100;
      r.alive = true;
      r.role = 'active';
      r.spawnProtUntil = now + 2000;
    }

    const pub = matchPublic(this.match, now);
    this.broadcastAll({
      t: 'match_start',
      map: this.match.map,
      blue: 0,
      red: 0,
      match: true,
      phase: 'live',
      timeLeft: pub.timeLeft,
      endsAt: pub.endsAt,
      duration: MATCH_SEC,
    });
    for (const [ws, s] of this.sessions) {
      try {
        ws.send(JSON.stringify({ t: 'inv', id: s.id, ...this.invPayload(s) }));
      } catch (_) { /* ignore */ }
    }
    await this.persist(true);
    return { ok: true };
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
    if (!this.isCombatant(attacker)) return;
    const found = this.findById(String(msg.targetId || ''));
    if (!found) return;
    const victim = found.s;
    if (victim.role === 'waiting') return;
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
    if (!this.isCombatant(session)) return;
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
    if (!this.isCombatant(attacker) && !(attacker && attacker.pendingNade)) return;
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
      if (victim.role === 'waiting') continue;
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
    if (!this.isCombatant(session) && !(session && session.role === 'active' && this.match.phase === 'live')) return;
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
    if (!this.isCombatant(session)) return;
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
    if (session.role === 'waiting' || this.match.phase !== 'live') return;
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

  reserveSession(session) {
    if (!session || !session.token) return;
    this.reservations[session.token] = {
      id: session.id,
      team: session.team,
      token: session.token,
      role: session.role || 'active',
      hp: session.hp,
      alive: session.alive,
      grenades: session.grenades,
      medkits: session.medkits,
      armor: !!session.armor,
      weapon: session.weapon || 'assault',
      joinedAt: session.joinedAt,
      spawnProtUntil: session.spawnProtUntil || 0,
      reservedAt: Date.now(),
    };
  }

  async webSocketMessage(ws, message) {
    await this.hydrate();
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
      ws.send(JSON.stringify(this.welcomePayload(session, ws)));
      return;
    }

    if (msg.t === 'ping') {
      const pub = matchPublic(this.match, Date.now());
      ws.send(JSON.stringify({
        t: 'pong',
        n: msg.n ?? 0,
        peers: this.sessions.size,
        phase: pub.phase,
        timeLeft: pub.timeLeft,
      }));
      return;
    }

    if (msg.t === 'match_start') {
      const result = await this.resetMatch(msg.map);
      if (!result.ok) {
        try {
          ws.send(JSON.stringify({
            t: 'match_deny',
            reason: result.reason || 'denied',
            phase: this.match.phase,
          }));
        } catch (_) { /* ignore */ }
      }
      return;
    }

    if (msg.t === 'input') {
      if (session.role === 'waiting') return;
      if (this.match.phase === 'ended') return;
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
    await this.hydrate();
    const session = this.sessions.get(ws);
    this.sessions.delete(ws);
    if (session) {
      this.reserveSession(session);
      if (session.role !== 'waiting') {
        this.broadcast(null, { t: 'peer', op: 'leave', id: session.id });
      }
      await this.persist(true);
    }
    try { ws.close(code, reason); } catch (_) { /* ignore */ }
  }

  async webSocketError(ws) {
    await this.hydrate();
    const session = this.sessions.get(ws);
    this.sessions.delete(ws);
    if (session) {
      this.reserveSession(session);
      if (session.role !== 'waiting') {
        this.broadcast(null, { t: 'peer', op: 'leave', id: session.id });
      }
      await this.persist(true);
    }
  }
}
