import { DurableObject } from 'cloudflare:workers';
import { normalizeRoomCode, isValidRoomCode, randomRoomCode } from './room-code.js';
import { sanitizePose } from './pose.js';
import { validateHit, applyDamage, markFired, canRespawn, applyRespawn } from './combat.js';
import {
  defaultLoadout,
  validateNadeThrow,
  validateNadeBoom,
  sanitizeNadeThrow,
  grenadeDmgAt,
  grenadePeerDmgAt,
  dist3,
  beginHeal,
  applyHeal,
  cancelHealChannel,
  pickDeathDrop,
  pickSupplyBundle,
  tryGrantLoot,
  sanitizeLoadout,
  ownsWeapon,
  buildSessionAttachment,
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
  shouldFastTick,
  MATCH_SEC,
} from './match.js';
import { checkMsgRate } from './rate.js';

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

    // DO 疎通確認（無料枠超過などをロビーに返す）
    if (url.pathname === '/api/health') {
      try {
        const id = env.ROOM.idFromName('__health__');
        const stub = env.ROOM.get(id);
        const res = await stub.fetch(new Request('https://room.internal/health'));
        const body = await res.text();
        return new Response(body || JSON.stringify({ ok: res.ok }), {
          status: res.status,
          headers: { 'content-type': 'application/json' },
        });
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        return Response.json({ ok: false, error: msg }, { status: 503 });
      }
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
      try {
        const id = env.ROOM.idFromName(code);
        const stub = env.ROOM.get(id);
        return await stub.fetch(request);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        return new Response(`Room connect failed: ${msg}`, { status: 502 });
      }
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
    /** ホスト（試合開始の権限を持つ最古参アクティブ）のセッション id */
    this.hostId = null;
    /** @type {Map<string, object>} ホストがシミュレートする bot（位置はホスト権威、HP/生死はサーバー権威） */
    this.bots = new Map();

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

  /** ホストがいなければ最古参アクティブを立てる（waiting はホストにしない） */
  ensureHost() {
    if (this.hostId) {
      for (const s of this.sessions.values()) {
        if (s.id === this.hostId && s.role !== 'waiting') return;
      }
    }
    let best = null;
    for (const s of this.sessions.values()) {
      if (s.role === 'waiting') continue;
      if (!best || (s.joinedAt || 0) < (best.joinedAt || 0)) best = s;
    }
    this.hostId = best ? best.id : null;
  }

  rosterPayload() {
    this.ensureHost();
    const players = [];
    for (const s of this.sessions.values()) {
      players.push({
        id: s.id,
        name: s.name || s.id,
        team: s.team,
        role: s.role || 'active',
      });
    }
    // ホストを先頭に
    players.sort((a, b) =>
      ((b.id === this.hostId) ? 1 : 0) - ((a.id === this.hostId) ? 1 : 0));
    return { t: 'roster', host: this.hostId, players };
  }

  broadcastRoster() {
    this.broadcastAll(this.rosterPayload());
  }

  /** ホスト宣言の bot セットを正として同期（増減に対応） */
  syncBots(list) {
    const arr = Array.isArray(list) ? list.slice(0, 10) : [];
    const keep = new Set();
    const now = Date.now();
    for (const src of arr) {
      const id = String(src && src.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
      if (!id) continue;
      keep.add(id);
      let b = this.bots.get(id);
      if (!b) {
        b = {
          id,
          bot: true,
          name: String(src.name || 'BOT').replace(/[<>&"']/g, '').slice(0, 12) || 'BOT',
          team: src.team === 'blue' ? 'blue' : 'red',
          pose: null,
          hp: 100,
          alive: true,
          weapon: 'assault',
          owned: { assault: true, smg: false, shotgun: false, sniper: true, pistol: true },
          crouch: false,
          spawnProtUntil: now + 2000,
          lastFireAt: 0,
          shotgunPellets: 0,
          role: 'active',
          grenades: 0,
          medkits: 0,
          armor: false,
        };
        this.bots.set(id, b);
      } else {
        b.team = src.team === 'blue' ? 'blue' : 'red';
        if (src.name) b.name = String(src.name).replace(/[<>&"']/g, '').slice(0, 12) || b.name;
      }
    }
    for (const id of [...this.bots.keys()]) {
      if (!keep.has(id)) this.bots.delete(id);
    }
  }

  countActiveHumans(team) {
    let n = 0;
    for (const s of this.sessions.values()) {
      if (s.role === 'waiting') continue;
      if (!team || s.team === team) n++;
    }
    return n;
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
    const roster = this.rosterPayload();
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
      host: roster.host,
      roster: roster.players,
    };
  }

  isCombatant(session) {
    return session
      && session.role !== 'waiting'
      && this.match.phase === 'live'
      && session.alive;
  }

  /** hibernation 復帰用に WS attachment を最新化（人間セッションのみ） */
  touchAttachment(session) {
    if (!session || session.bot) return;
    const ws = this.wsForSession(session);
    if (!ws) return;
    try { ws.serializeAttachment(buildSessionAttachment(session)); } catch (_) { /* ignore */ }
  }

  wsForSession(session) {
    for (const [ws, s] of this.sessions) {
      if (s === session) return ws;
    }
    return null;
  }

  async fetch(request) {
    await this.hydrate();
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname.endsWith('/health')) {
      return Response.json({ ok: true, phase: this.match.phase });
    }
    const code = normalizeRoomCode(url.searchParams.get('room'));
    const tokenIn = sanitizeToken(url.searchParams.get('token'));

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    // hibernation API（無料枠でも接続維持コストを抑えやすい）
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
        name: prev.name || `P-${String(prev.id).slice(0, 4).toUpperCase()}`,
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
        name: `P-${id.slice(0, 4).toUpperCase()}`,
        joinedAt: now,
        pose: null,
        hp: 100,
        alive: true,
        spawnProtUntil: 0,
        lastFireAt: 0,
        ...load,
      };
    }

    server.serializeAttachment(buildSessionAttachment(session));
    this.sessions.set(server, session);

    // welcome は握手完了後に送る
    this.ctx.waitUntil(this.afterAccept(server, session));

    return new Response(null, { status: 101, webSocket: client });
  }

  async afterAccept(server, session) {
    try {
      server.send(JSON.stringify(this.welcomePayload(session, server)));
      if (session.role !== 'waiting') {
        this.broadcast(server, { t: 'peer', op: 'join', id: session.id, team: session.team });
      }
      this.broadcastRoster();
      await this.ensureAlarm();
      await this.persist(true);
    } catch (err) {
      console.error('afterAccept', err && err.message ? err.message : err);
    }
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
    const t = now || Date.now();
    const players = [];
    for (const s of this.sessions.values()) {
      if (!s.pose || s.role === 'waiting') continue;
      players.push({
        id: s.id,
        team: s.team,
        alive: !!s.alive,
        hp: s.hp,
        weapon: s.weapon || (s.pose && s.pose.weapon) || 'assault',
        prot: !!(s.spawnProtUntil && t < s.spawnProtUntil),
        ...s.pose,
      });
    }
    for (const b of this.bots.values()) {
      if (!b.pose) continue;
      players.push({
        id: b.id,
        bot: true,
        team: b.team,
        alive: !!b.alive,
        hp: b.hp,
        weapon: b.weapon || 'assault',
        prot: !!(b.spawnProtUntil && t < b.spawnProtUntil),
        ...b.pose,
      });
    }
    const pub = matchPublic(this.match, t);
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

  /** live 中だけ 50ms ループを張る。lobby/ended は起こさない（無料枠・hibernation） */
  async ensureAlarm() {
    if (!shouldFastTick(this.match)) return;
    const next = await this.ctx.storage.getAlarm();
    if (next == null) {
      await this.ctx.storage.setAlarm(Date.now() + SNAP_MS);
    }
  }

  async scheduleNextAlarm() {
    if (!shouldFastTick(this.match)) return;
    await this.ctx.storage.setAlarm(Date.now() + SNAP_MS);
  }

  async alarm() {
    await this.hydrate();
    const now = Date.now();

    // lobby/ended の残骸 alarm — 高速ループを再開しない
    if (!shouldFastTick(this.match)) return;

    const ended = tickMatch(this.match, now);
    if (ended) {
      this.broadcastAll({
        t: 'match_end',
        ...matchPublic(this.match, now),
        score: { ...this.score },
        blue: this.score.blue,
        red: this.score.red,
      });
      this.broadcastSnap();
      await this.persist(true);
      // ended → ループ停止（次の match_start で ensureAlarm）
      return;
    }

    this.broadcastSnap();

    this.match.supplyAcc += SNAP_MS;
    const need = this.match.supplyArmed ? SUPPLY_EVERY_MS : SUPPLY_FIRST_MS;
    if (this.match.supplyAcc >= need) {
      this.match.supplyAcc = 0;
      this.match.supplyArmed = true;
      this.spawnSupply();
    }

    await this.persist(false);
    await this.scheduleNextAlarm();
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
    this.bots.clear(); // bot はホストが match_start 後に再宣言する
    for (const s of this.sessions.values()) {
      const lo = sanitizeLoadout(s.main, s.sub);
      s.main = lo.main;
      s.sub = lo.sub;
      s.owned = lo.owned;
      s.weapon = lo.weapon;
      s.grenades = 2;
      s.medkits = 2;
      s.grenadeMax = 5;
      s.medkitMax = 3;
      s.armor = false;
      s.pendingNade = false;
      s.lastNadeAt = 0;
      s.healStartedAt = 0;
      s.role = 'active';
      s.hp = 100;
      s.alive = true;
      s.spawnProtUntil = now + 2000;
      s.lastFireAt = 0;
      s.shotgunPellets = 0;
      s.lastRespawnAt = 0;
    }
    for (const r of Object.values(this.reservations)) {
      if (!r) continue;
      const lo = sanitizeLoadout(r.main, r.sub);
      r.main = lo.main;
      r.sub = lo.sub;
      r.owned = lo.owned;
      r.weapon = lo.weapon;
      r.grenades = 2;
      r.medkits = 2;
      r.armor = false;
      r.healStartedAt = 0;
      r.hp = 100;
      r.alive = true;
      r.role = 'active';
      r.spawnProtUntil = now + 2000;
      r.lastRespawnAt = 0;
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
      this.touchAttachment(s);
      try {
        ws.send(JSON.stringify({ t: 'inv', id: s.id, ...this.invPayload(s) }));
        ws.send(JSON.stringify({
          t: 'loadout_lock',
          main: s.main,
          sub: s.sub,
          owned: s.owned,
        }));
      } catch (_) { /* ignore */ }
    }
    await this.persist(true);
    await this.ensureAlarm(); // live の 50ms ループ開始
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
    cancelHealChannel(victim);
    const applied = applyDamage(victim, rawDmg);
    victim.hp = applied.hp;
    if (applied.kill) {
      victim.alive = false;
      if (victim.team === 'red') this.score.blue++;
      else this.score.red++;
      this.spawnDeathDrop(victim);
    }
    this.emitDmg(attacker, victim, part, weapon, applied, extra);
    this.touchAttachment(victim);
  }

  handleHit(attacker, msg) {
    if (!this.isCombatant(attacker)) return;
    if (!checkMsgRate(attacker, Date.now(), 'hit', 16).ok) return;
    const targetId = String(msg.targetId || '');
    const found = this.findById(targetId);
    const victim = found ? found.s : this.bots.get(targetId);
    if (!victim) return;
    if (victim.role === 'waiting') return;
    const now = Date.now();
    const weapon = String(msg.weapon || 'assault');
    const result = validateHit({
      attacker, victim, part: msg.part, weapon, now,
    });
    if (!result.ok) return;

    markFired(attacker, weapon, now, result);
    this.applyHitResult(attacker, victim, result.part, weapon, result.dmg);
  }

  handleNadeThrow(session, msg, exceptWs) {
    if (!this.isCombatant(session)) return;
    const now = Date.now();
    const result = validateNadeThrow(session, now);
    if (!result.ok) return;
    session.grenades = result.grenades;
    session.pendingNade = true;
    session.lastNadeAt = now;
    this.touchAttachment(session);
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
      const eyeY = (victim.pose && Number.isFinite(victim.pose.y) ? victim.pose.y : 0)
        + (victim.crouch ? 1.0 : 1.4);
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

  handleHealStart(session, ws) {
    if (!this.isCombatant(session)) return;
    const now = Date.now();
    if (!checkMsgRate(session, now, 'heal', 200).ok) return;
    const result = beginHeal(session, now);
    if (!result.ok) return;
    session.healStartedAt = result.healStartedAt;
  }

  handleHealCancel(session) {
    cancelHealChannel(session);
  }

  handleHeal(session, ws) {
    if (!this.isCombatant(session)) return;
    const now = Date.now();
    if (!checkMsgRate(session, now, 'heal_done', 200).ok) return;
    const result = applyHeal(session, now);
    if (!result.ok) return;
    session.hp = result.hp;
    session.medkits = result.medkits;
    this.touchAttachment(session);
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

  handleLoadout(session, msg, ws) {
    if (this.match.phase === 'live') return; // 試合中は固定
    if (!checkMsgRate(session, Date.now(), 'loadout', 100).ok) return;
    const lo = sanitizeLoadout(msg.main, msg.sub);
    session.main = lo.main;
    session.sub = lo.sub;
    session.owned = lo.owned;
    session.weapon = lo.weapon;
    this.touchAttachment(session);
    try {
      ws.send(JSON.stringify({
        t: 'loadout_lock',
        main: lo.main,
        sub: lo.sub,
        owned: lo.owned,
      }));
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
    this.touchAttachment(session);
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
    const now = Date.now();
    if (!canRespawn(session, this.match.phase, now).ok) return;
    if (!checkMsgRate(session, now, 'respawn', 200).ok) return;
    applyRespawn(session, now);
    cancelHealChannel(session);
    this.touchAttachment(session);
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
      name: session.name,
      hp: session.hp,
      alive: session.alive,
      grenades: session.grenades,
      medkits: session.medkits,
      armor: !!session.armor,
      weapon: session.weapon || 'assault',
      main: session.main || 'assault',
      sub: session.sub || 'smg',
      owned: session.owned || sanitizeLoadout(session.main, session.sub).owned,
      joinedAt: session.joinedAt,
      spawnProtUntil: session.spawnProtUntil || 0,
      lastRespawnAt: session.lastRespawnAt || 0,
      reservedAt: Date.now(),
    };
  }

  async webSocketMessage(ws, message) {
    await this.hydrate();
    // 非 hibernation では AutoResponse が効かないため生 ping を返す
    if (message === 'ping') {
      try { ws.send('pong'); } catch (_) { /* ignore */ }
      return;
    }
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
      // 開始権はホストのみ（いなければ最古参を立ててから判定）
      this.ensureHost();
      if (session.id !== this.hostId) {
        try {
          ws.send(JSON.stringify({
            t: 'match_deny',
            reason: 'not_host',
            phase: this.match.phase,
          }));
        } catch (_) { /* ignore */ }
        return;
      }
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

    if (msg.t === 'name') {
      if (!checkMsgRate(session, Date.now(), 'name', 300).ok) return;
      const n = String(msg.name || '').replace(/[<>&"']/g, '').trim().slice(0, 12);
      if (n && n !== session.name) {
        session.name = n;
        this.touchAttachment(session);
        this.broadcastRoster();
      }
      return;
    }

    /* ---- ホスト管理 bot（位置はホスト権威、HP/生死はサーバー権威） ---- */
    if (msg.t === 'bots') {
      this.ensureHost();
      if (session.id !== this.hostId) return;
      this.syncBots(msg.list);
      return;
    }

    if (msg.t === 'bot_poses') {
      this.ensureHost();
      if (session.id !== this.hostId) return;
      if (this.match.phase === 'ended') return;
      const list = Array.isArray(msg.list) ? msg.list.slice(0, 10) : [];
      for (const src of list) {
        const b = this.bots.get(String(src && src.id || ''));
        if (!b) continue;
        const pose = sanitizePose(src);
        b.pose = pose;
        b.weapon = ownsWeapon(b, pose.weapon) ? pose.weapon : 'assault';
        b.crouch = pose.crouch;
      }
      await this.ensureAlarm();
      return;
    }

    if (msg.t === 'bot_fire') {
      this.ensureHost();
      if (session.id !== this.hostId) return;
      const b = this.bots.get(String(msg.id || ''));
      if (!b || !b.alive || this.match.phase !== 'live') return;
      const weapon = String(msg.weapon || b.weapon || 'assault');
      if (!ownsWeapon(b, weapon)) return;
      // ホスト以外に FX 配信（ホストはローカルの fireOne で音・閃光を出す）
      this.broadcast(ws, { t: 'fire', id: b.id, weapon });
      return;
    }

    if (msg.t === 'bot_hit') {
      this.ensureHost();
      if (session.id !== this.hostId) return;
      const attacker = this.bots.get(String(msg.botId || ''));
      if (!attacker) return;
      this.handleHit(attacker, msg);
      return;
    }

    if (msg.t === 'bot_respawn') {
      this.ensureHost();
      if (session.id !== this.hostId) return;
      const b = this.bots.get(String(msg.id || ''));
      if (!b) return;
      const now = Date.now();
      if (!canRespawn(b, this.match.phase, now).ok) return;
      applyRespawn(b, now);
      this.broadcastAll({ t: 'respawn', id: b.id, team: b.team });
      return;
    }

    if (msg.t === 'input') {
      if (session.role === 'waiting') return;
      if (this.match.phase === 'ended') return;
      if (!checkMsgRate(session, Date.now(), 'input', 30).ok) return;
      const pose = sanitizePose(msg);
      if (session.pose && pose.seq < session.pose.seq) return;
      session.pose = pose;
      session.weapon = ownsWeapon(session, pose.weapon)
        ? pose.weapon
        : (session.main || 'assault');
      session.crouch = pose.crouch;
      await this.ensureAlarm();
      return;
    }

    if (msg.t === 'hit') {
      this.handleHit(session, msg);
      return;
    }

    if (msg.t === 'fire') {
      if (!this.isCombatant(session)) return;
      if (!checkMsgRate(session, Date.now(), 'fire', 45).ok) return;
      const weapon = String(msg.weapon || session.weapon || 'assault');
      if (!ownsWeapon(session, weapon)) return;
      this.broadcast(ws, {
        t: 'fire',
        id: session.id,
        weapon,
      });
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

    if (msg.t === 'heal_start') {
      this.handleHealStart(session, ws);
      return;
    }

    if (msg.t === 'heal_cancel') {
      this.handleHealCancel(session);
      return;
    }

    if (msg.t === 'heal') {
      this.handleHeal(session, ws);
      return;
    }

    if (msg.t === 'loadout') {
      this.handleLoadout(session, msg, ws);
      return;
    }

    if (msg.t === 'loot_pick') {
      if (!checkMsgRate(session, Date.now(), 'loot', 80).ok) return;
      this.handleLootPick(session, msg, ws);
      return;
    }

    if (msg.t === 'respawn') {
      this.handleRespawn(session);
    }
  }

  async webSocketClose(ws, code, reason) {
    await this.onSocketGone(ws);
    try { ws.close(code, reason); } catch (_) { /* ignore */ }
  }

  async webSocketError(ws) {
    await this.onSocketGone(ws);
  }

  async onSocketGone(ws) {
    await this.hydrate();
    const session = this.sessions.get(ws);
    this.sessions.delete(ws);
    if (!session) return;
    this.reserveSession(session);
    if (session.role !== 'waiting') {
      this.broadcast(null, { t: 'peer', op: 'leave', id: session.id });
    }
    this.broadcastRoster();
    await this.persist(true);
  }
}
