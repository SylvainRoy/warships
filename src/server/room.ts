import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { WebSocket } from "ws";
import { generateWorldWithBases, placeBases, restoreHome, type BaseSite, type BaseSnapshot } from "../shared/bases.js";
import { GAME_CONFIG } from "../shared/config.js";
import type { ClientMessage, ServerMessage, SnapshotFrigate } from "../shared/protocol.js";
import { DEFAULT_SETTINGS, describeSettingsChanges, sanitizeSettings } from "../shared/settings.js";
import {
  createGameState,
  createSeededRandom,
  fuelCapacity,
  regenerateGameWorld,
  spawnPlayerFrigate,
  stepGame,
  type Frigate,
  type FrigateInput,
  type GameState,
  type GameEvent,
} from "../shared/sim.js";
import { encodeWorld, mapDimensions, type World } from "../shared/world.js";

const SLOT_COLOURS = ["#3b82f6", "#ef4444", "#facc15", "#a855f7"] as const;
const EMPTY_INPUT: FrigateInput = { seq: 0, keys: 0, throttle: 0, fireCannon: false, fireTorpedo: false };

interface PlayerSession {
  id: string;
  token: string;
  name: string;
  slot: number;
  score: number;
  sunk: number;
  host: boolean;
  joinedAt: number;
  socket: WebSocket | null;
  disconnectedAt: number | null;
  inputQueue: FrigateInput[];
  lastInput: FrigateInput;
  ackSeq: number;
  lastBasesJson: string | null;
}

export class Room {
  readonly game: GameState;
  readonly sessions = new Map<string, PlayerSession>();
  private readonly sockets = new Set<WebSocket>();
  private readonly sessionBySocket = new Map<WebSocket, PlayerSession>();
  private readonly random: () => number;
  private nextPlayerId = 1;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastLobbySent = "";
  private snapshotAccumulator = 0;
  private sentProjectileIds = new Set<string>();

  constructor(
    seed = randomBytes(4).readUInt32LE(),
    private readonly clock: () => number = () => performance.now() / 1000,
    initialWorld?: World,
    initialSites?: readonly BaseSite[],
  ) {
    const generated = initialWorld
      ? { world: initialWorld, sites: initialSites ?? placeBases(initialWorld, DEFAULT_SETTINGS.neutralBases) ?? [] }
      : generateWorldWithBases(
        seed,
        GAME_CONFIG.world.generation.targetLandCoverage,
        DEFAULT_SETTINGS.neutralBases,
        mapDimensions(DEFAULT_SETTINGS.mapSize),
      );
    this.game = createGameState(generated.world, generated.sites);
    if (initialWorld) {
      const matchingSize = GAME_CONFIG.world.mapSizes.findIndex(
        ({ columns, rows }) => columns === initialWorld.columns && rows === initialWorld.rows,
      );
      if (matchingSize >= 0) this.game.settings.mapSize = matchingSize;
    }
    this.random = createSeededRandom(seed ^ 0x753a9);
  }

  accept(socket: WebSocket): void {
    this.sockets.add(socket);
    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        this.handleMessage(socket, message);
      } catch {
        this.send(socket, { type: "error", code: "invalid_action" });
      }
    });
    socket.on("close", () => this.disconnect(socket));
    socket.on("error", () => this.disconnect(socket));
    this.sendLobby(socket);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000 / GAME_CONFIG.network.tickRate);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  advanceTick(): void {
    this.tick();
  }

  handleMessage(socket: WebSocket, message: ClientMessage): void {
    if (!this.sockets.has(socket)) this.sockets.add(socket);
    if (message.type === "hello") {
      this.sendLobby(socket);
      return;
    }
    if (message.type === "join") {
      this.join(socket, message.name, message.token);
      return;
    }
    const session = this.sessionBySocket.get(socket);
    if (!session) {
      this.send(socket, { type: "error", code: "invalid_action" });
      return;
    }
    if (message.type === "input") {
      if (!Number.isInteger(message.seq) || !Number.isInteger(message.keys)) return;
      session.inputQueue.push({
        seq: message.seq,
        keys: message.keys >>> 0,
        throttle: typeof message.throttle === "number" ? message.throttle : 0,
        fireCannon: Boolean(message.fireCannon),
        fireTorpedo: Boolean(message.fireTorpedo),
      });
      if (session.inputQueue.length > 6) session.inputQueue.shift();
      return;
    }
    if (message.type === "host") this.performHostAction(session, message);
  }

  private join(socket: WebSocket, rawName: string, token?: string): void {
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (name.length < GAME_CONFIG.name.minLength || name.length > GAME_CONFIG.name.maxLength) {
      this.send(socket, { type: "error", code: "invalid_name" });
      return;
    }
    const now = this.clock();
    this.expireDisconnected(now);
    const normalized = name.toLocaleLowerCase();
    let session = token ? [...this.sessions.values()].find((candidate) => candidate.token === token) : undefined;
    if (session && (session.disconnectedAt === null || now - session.disconnectedAt > GAME_CONFIG.network.reconnectGrace)) session = undefined;
    if (session && session.name.toLocaleLowerCase() !== normalized) session = undefined;
    if (session) {
      if (session.socket) this.disconnect(session.socket);
      session.socket = socket;
      session.disconnectedAt = null;
      session.inputQueue = [];
      session.lastInput = { ...EMPTY_INPUT };
    } else {
      if ([...this.sessions.values()].some((candidate) => candidate.name.toLocaleLowerCase() === normalized)) {
        this.send(socket, { type: "error", code: "name_taken" });
        return;
      }
      const usedSlots = new Set([...this.sessions.values()].map((candidate) => candidate.slot));
      const slot = [1, 2, 3, 4].find((candidate) => !usedSlots.has(candidate));
      if (!slot) {
        this.send(socket, { type: "error", code: "full" });
        return;
      }
      session = {
        id: `p${this.nextPlayerId++}`,
        token: randomBytes(24).toString("hex"),
        name,
        slot,
        score: 0,
        sunk: 0,
        host: ![...this.sessions.values()].some((candidate) => candidate.host),
        joinedAt: now,
        socket,
        disconnectedAt: null,
        inputQueue: [],
        lastInput: { ...EMPTY_INPUT },
        ackSeq: 0,
        lastBasesJson: null,
      };
      this.sessions.set(session.id, session);
      const home = this.game.bases.find((base) => base.kind === "home" && base.homeSlot === slot - 1);
      if (home) {
        home.active = true;
        home.ownerId = session.id;
        home.turret = "active";
        home.turretHp = GAME_CONFIG.bases.turretHp;
        home.turretReadyAt = now;
        home.lostFrom = null;
        home.returnAt = null;
        home.captureBy = null;
        home.captureProgress = 0;
        home.repairBy = null;
        home.repairProgress = 0;
      }
      const others = Object.values(this.game.frigates).filter((frigate) => frigate.status === "alive");
      const frigate = spawnPlayerFrigate(session.id, name, slot, this.game, others, this.random, now);
      this.game.frigates[session.id] = frigate;
      this.game.scores[session.id] = this.scoreRecord(session);
      this.game.events.push({ type: "join", playerId: session.id, name, message: `${name} joined` });
      this.broadcastEvent({ type: "join", playerId: session.id, name, message: `${name} joined` });
    }
    if (!session.host && ![...this.sessions.values()].some((candidate) => candidate.host)) {
      session.host = true;
      this.game.scores[session.id] = this.scoreRecord(session);
    }
    this.sessionBySocket.set(socket, session);
    session.lastBasesJson = null;
    this.send(socket, {
      type: "welcome",
      playerId: session.id,
      token: session.token,
      slot: session.slot,
      world: encodeWorld(this.game.world.grid),
      columns: this.game.world.columns,
      rows: this.game.world.rows,
      bases: this.game.bases,
      settings: { ...this.game.settings },
    });
    this.send(socket, {
      type: "projectiles",
      reset: true,
      serverTime: now,
      shells: [...this.game.shells],
      torpedoes: [...this.game.torpedoes],
      removed: [],
    });
    this.broadcastLobby();
  }

  private scoreRecord(session: PlayerSession) {
    return {
      playerId: session.id,
      name: session.name,
      slot: session.slot,
      score: session.score,
      sunk: session.sunk,
      host: session.host,
      connected: session.socket !== null,
    };
  }

  private performHostAction(session: PlayerSession, message: Extract<ClientMessage, { type: "host" }>): void {
    if (!session.host) {
      this.send(session.socket!, { type: "error", code: "not_host" });
      return;
    }
    const now = this.clock();
    if (message.action === "regenerate") {
      this.regenerateWorld(session, now);
      return;
    }
    if (message.action === "resetScores") {
      for (const player of this.sessions.values()) {
        player.score = 0;
        player.sunk = 0;
        this.game.scores[player.id] = this.scoreRecord(player);
      }
      this.broadcastEvent({ type: "host", playerId: session.id, name: session.name, message: `${session.name} reset the scores` });
      return;
    }
    if (message.action === "kick") {
      const target = [...this.sessions.values()].find((player) => player.id === message.target || player.name === message.target);
      if (!target || target.id === session.id) {
        this.send(session.socket!, { type: "error", code: "invalid_action" });
        return;
      }
      this.broadcastEvent({ type: "host", playerId: session.id, name: session.name, targetId: target.id, targetName: target.name, message: `${target.name} was kicked` });
      if (target.socket) this.send(target.socket, { type: "error", code: "kicked" });
      this.removeSession(target);
      return;
    }
    if (message.action === "settings") {
      const settings = sanitizeSettings(message.settings);
      if (!settings) {
        this.send(session.socket!, { type: "error", code: "invalid_action" });
        return;
      }
      const changes = describeSettingsChanges(this.game.settings, settings);
      const coverageChanged = this.game.settings.landCoveragePct !== settings.landCoveragePct;
      const neutralBasesChanged = this.game.settings.neutralBases !== settings.neutralBases;
      const mapSizeChanged = this.game.settings.mapSize !== settings.mapSize;
      this.game.settings = settings;
      for (const frigate of Object.values(this.game.frigates)) {
        frigate.fuel = Math.min(frigate.fuel, fuelCapacity(settings));
        frigate.shells = Math.min(frigate.shells, settings.shells);
        frigate.torpedoes = Math.min(frigate.torpedoes, settings.torpedoes);
      }
      for (const player of this.sessions.values()) {
        if (player.socket) this.send(player.socket, { type: "settings", settings: { ...settings } });
      }
      if (changes.length > 0) {
        this.broadcastEvent({
          type: "host",
          playerId: session.id,
          name: session.name,
          message: `Host ${session.name}: ${changes.join(", ")}`,
        });
      }
      if (coverageChanged || neutralBasesChanged || mapSizeChanged) this.regenerateWorld(session, now);
      return;
    }
    this.send(session.socket!, { type: "error", code: "invalid_action" });
  }

  private regenerateWorld(session: PlayerSession, now: number): void {
    const seed = randomBytes(4).readUInt32LE();
    const generated = generateWorldWithBases(
      seed,
      this.game.settings.landCoveragePct / 100,
      this.game.settings.neutralBases,
      mapDimensions(this.game.settings.mapSize),
    );
    regenerateGameWorld(this.game, generated.world, generated.sites, now, this.random);
    for (const player of this.sessions.values()) player.lastBasesJson = null;
    for (const player of this.sessions.values()) {
      const frigate = this.game.frigates[player.id];
      if (frigate) frigate.name = player.name;
    }
    const encoded = encodeWorld(this.game.world.grid);
    this.broadcast({
      type: "world",
      world: encoded,
      columns: this.game.world.columns,
      rows: this.game.world.rows,
      bases: this.game.bases,
    });
    this.sentProjectileIds.clear();
    this.broadcastJoined({
      type: "projectiles",
      reset: true,
      serverTime: now,
      shells: [],
      torpedoes: [],
      removed: [],
    });
    this.broadcastEvent({ type: "host", playerId: session.id, name: session.name, message: `${session.name} regenerated the world` });
    if (generated.neutralPlaced < this.game.settings.neutralBases) {
      this.broadcastEvent({
        type: "host",
        playerId: session.id,
        name: session.name,
        message: `Only ${generated.neutralPlaced} neutral bases fit on this map`,
      });
    }
  }

  private tick(): void {
    const now = this.clock();
    this.expireDisconnected(now);
    const inputs: Record<string, FrigateInput | undefined> = {};
    for (const session of this.sessions.values()) {
      const next = session.inputQueue.shift();
      if (next) {
        session.lastInput = next;
        session.ackSeq = next.seq;
        inputs[session.id] = next;
      } else {
        inputs[session.id] = { ...session.lastInput, seq: session.ackSeq, fireCannon: false, fireTorpedo: false };
      }
    }
    stepGame(this.game, inputs, 1 / GAME_CONFIG.network.tickRate, now);
    this.broadcastProjectileChanges(now);
    for (const session of this.sessions.values()) {
      const score = this.game.scores[session.id];
      if (score) {
        session.score = score.score;
        session.sunk = score.sunk;
      }
    }
    this.respawnReady(now);
    for (const event of this.game.events) this.broadcastEvent(event);
    this.snapshotAccumulator += GAME_CONFIG.network.snapshotRate / GAME_CONFIG.network.tickRate;
    if (this.snapshotAccumulator >= 1) {
      this.snapshotAccumulator -= 1;
      this.broadcastSnapshots(now);
    }
    this.broadcastLobbyIfChanged();
  }

  private respawnReady(now: number): void {
    for (const session of this.sessions.values()) {
      const frigate = this.game.frigates[session.id];
      if (!frigate || frigate.status === "alive" || now < frigate.respawnAt) continue;
      const others = Object.values(this.game.frigates).filter((other) => other.playerId !== session.id && other.status === "alive");
      this.game.frigates[session.id] = spawnPlayerFrigate(
        session.id,
        session.name,
        session.slot,
        this.game,
        others,
        this.random,
        now,
      );
    }
  }

  private broadcastSnapshots(now: number): void {
    const players = [...this.sessions.values()].map((session) => this.scoreRecord(session));
    const baseSnapshots: BaseSnapshot[] = this.game.bases.map(({
      id,
      active,
      ownerId,
      captureBy,
      captureProgress,
      turret,
      turretHp,
      repairBy,
      repairProgress,
    }) => ({
      id,
      active,
      ownerId,
      captureBy,
      captureProgress: Number(captureProgress.toFixed(2)),
      turret,
      turretHp,
      repairBy,
      repairProgress: Number(repairProgress.toFixed(2)),
    }));
    const basesJson = JSON.stringify(baseSnapshots);
    for (const session of this.sessions.values()) {
      if (!session.socket) continue;
      const frigates: SnapshotFrigate[] = Object.values(this.game.frigates).map((frigate) =>
        frigate.playerId === session.id
          ? {
              ...frigate,
              fuel: Number(frigate.fuel.toFixed(1)),
              shells: Number(frigate.shells.toFixed(2)),
              torpedoes: Number(frigate.torpedoes.toFixed(2)),
            }
          : {
              playerId: frigate.playerId,
              name: frigate.name,
              slot: frigate.slot,
              x: frigate.x,
              y: frigate.y,
              heading: frigate.heading,
              hp: frigate.hp,
              status: frigate.status,
              sinkingStartedAt: frigate.sinkingStartedAt,
              spawnProtectedUntil: frigate.spawnProtectedUntil,
            },
      );
      const snapshot: Extract<ServerMessage, { type: "snapshot" }> = {
        type: "snapshot",
        tick: this.game.tick,
        ackSeq: session.ackSeq,
        serverTime: now,
        frigates,
        players,
      };
      if (session.lastBasesJson !== basesJson) {
        snapshot.bases = baseSnapshots;
        session.lastBasesJson = basesJson;
      }
      this.send(session.socket, snapshot);
    }
  }

  private broadcastProjectileChanges(now: number): void {
    const liveShells = this.game.shells;
    const liveTorpedoes = this.game.torpedoes;
    const liveIds = new Set([...liveShells, ...liveTorpedoes].map((projectile) => projectile.id));
    const liveTorpedoIds = new Set(liveTorpedoes.map((torpedo) => torpedo.id));
    const shells = liveShells.filter((shell) => !this.sentProjectileIds.has(shell.id));
    const torpedoes = liveTorpedoes.filter((torpedo) => !this.sentProjectileIds.has(torpedo.id));
    const removed = [...this.sentProjectileIds].filter((id) => id.startsWith("t") && !liveTorpedoIds.has(id));

    for (const shell of shells) this.sentProjectileIds.add(shell.id);
    for (const torpedo of torpedoes) this.sentProjectileIds.add(torpedo.id);
    for (const id of this.sentProjectileIds) {
      if (!liveIds.has(id)) this.sentProjectileIds.delete(id);
    }

    if (shells.length > 0 || torpedoes.length > 0 || removed.length > 0) {
      this.broadcastJoined({ type: "projectiles", serverTime: now, shells, torpedoes, removed });
    }
  }

  private broadcastJoined(message: ServerMessage): void {
    for (const session of this.sessions.values()) {
      if (session.socket) this.send(session.socket, message);
    }
  }

  private broadcastEvent(event: GameEvent): void {
    this.broadcast({ type: "event", event });
  }

  private broadcast(message: ServerMessage): void {
    for (const socket of this.sockets) this.send(socket, message);
  }

  private sendLobby(socket: WebSocket): void {
    const lobby = this.lobbyMessage();
    this.send(socket, lobby);
  }

  private broadcastLobby(): void {
    const lobby = this.lobbyMessage();
    this.lastLobbySent = JSON.stringify(lobby);
    this.broadcast(lobby);
  }

  private broadcastLobbyIfChanged(): void {
    const serialized = JSON.stringify(this.lobbyMessage());
    if (serialized !== this.lastLobbySent) {
      this.lastLobbySent = serialized;
      this.broadcast(JSON.parse(serialized) as ServerMessage);
    }
  }

  private lobbyMessage() {
    const players = [...this.sessions.values()].map((session) => ({
      playerId: session.id,
      name: session.name,
      slot: session.slot,
      host: session.host,
      connected: session.socket !== null,
    }));
    const freeSlots = GAME_CONFIG.player.maxPlayers - this.sessions.size;
    return { type: "lobby" as const, players, freeSlots, full: freeSlots === 0 };
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify(message, (_key, value: unknown) =>
        typeof value === "number" && !Number.isInteger(value) ? Number(value.toFixed(3)) : value,
      ));
    }
  }

  private disconnect(socket: WebSocket): void {
    this.sockets.delete(socket);
    const session = this.sessionBySocket.get(socket);
    this.sessionBySocket.delete(socket);
    if (!session || session.socket !== socket) return;
    session.socket = null;
    session.disconnectedAt = this.clock();
    session.inputQueue = [];
    session.lastInput = { ...EMPTY_INPUT };
    const frigate = this.game.frigates[session.id];
    if (frigate) {
      frigate.speed = 0;
      frigate.lastFireCannon = false;
      frigate.lastFireTorpedo = false;
    }
    this.broadcastEvent({ type: "leave", playerId: session.id, name: session.name, message: `${session.name} disconnected` });
    this.broadcastLobby();
  }

  private expireDisconnected(now: number): void {
    for (const session of [...this.sessions.values()]) {
      if (session.disconnectedAt !== null && now - session.disconnectedAt >= GAME_CONFIG.network.reconnectGrace) this.removeSession(session);
    }
  }

  private removeSession(session: PlayerSession): void {
    if (session.socket) {
      const socket = session.socket;
      this.sessionBySocket.delete(socket);
      this.sockets.delete(socket);
      session.socket = null;
      if (socket.readyState === 1) socket.close(4000, "Session ended");
    }
    for (const base of this.game.bases) {
      const home = base.kind === "home" && base.homeSlot === session.slot - 1;
      if (home) {
        base.active = false;
        base.ownerId = null;
        base.turret = "none";
        base.turretHp = 0;
        base.turretReadyAt = 0;
        base.lostFrom = null;
        base.returnAt = null;
        base.captureBy = null;
        base.captureProgress = 0;
        base.repairBy = null;
        base.repairProgress = 0;
      } else if (base.ownerId === session.id) {
        const originalOwner = base.kind === "home" && base.lostFrom && base.lostFrom !== session.id
          ? this.sessions.get(base.lostFrom)
          : undefined;
        if (originalOwner) {
          restoreHome(base, this.clock());
          this.broadcastEvent({
            type: "capture",
            playerId: originalOwner.id,
            name: originalOwner.name,
            message: `${originalOwner.name}'s home base is back`,
          });
        } else {
          base.ownerId = null;
          base.turret = "none";
          base.turretHp = 0;
          base.turretReadyAt = 0;
          base.lostFrom = null;
          base.returnAt = null;
          base.repairBy = null;
          base.repairProgress = 0;
        }
        base.captureBy = null;
        base.captureProgress = 0;
      } else {
        if (base.captureBy === session.id) {
          base.captureBy = null;
          base.captureProgress = 0;
        }
        if (base.repairBy === session.id) {
          base.repairBy = null;
          base.repairProgress = 0;
        }
      }
    }
    this.sessions.delete(session.id);
    delete this.game.frigates[session.id];
    delete this.game.scores[session.id];
    if (session.host) {
      const successor = [...this.sessions.values()]
        .filter((candidate) => candidate.socket !== null)
        .sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (successor) {
        successor.host = true;
        this.game.scores[successor.id] = this.scoreRecord(successor);
        this.broadcastEvent({ type: "host", playerId: successor.id, name: successor.name, message: `${successor.name} is now host` });
      }
    }
    this.broadcastLobby();
  }

  getConnectedFrigates(): Frigate[] {
    return [...this.sessions.values()].filter((session) => session.socket !== null).map((session) => this.game.frigates[session.id]).filter((frigate): frigate is Frigate => Boolean(frigate));
  }

  getColours(): readonly string[] {
    return SLOT_COLOURS;
  }
}
