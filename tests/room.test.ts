import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { WebSocket } from "ws";
import { GAME_CONFIG } from "../src/shared/config.js";
import type { ClientMessage, ServerMessage } from "../src/shared/protocol.js";
import { DEFAULT_SETTINGS } from "../src/shared/settings.js";
import type { BaseSite } from "../src/shared/bases.js";
import { Room } from "../src/server/room.js";
import { createEmptyWorld, mapDimensions, type World } from "../src/shared/world.js";

class FakeSocket extends EventEmitter {
  readyState = 1;
  readonly messages: ServerMessage[] = [];

  send(data: string): void {
    this.messages.push(JSON.parse(data) as ServerMessage);
  }

  close(): void {
    this.readyState = 3;
    this.emit("close");
  }

  last<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return [...this.messages].reverse().find((message) => message.type === type) as Extract<ServerMessage, { type: T }> | undefined;
  }
}

const bigDimensions = mapDimensions(2);
const openWorld: World = createEmptyWorld(bigDimensions, 11);
const fixtureSites: BaseSite[] = [
  { id: "h0", kind: "home", homeSlot: 0, cityX: 1750, cityY: 4500, harbourX: 1800, harbourY: 4500, facing: 0 },
  { id: "h1", kind: "home", homeSlot: 1, cityX: 4450, cityY: 4500, harbourX: 4500, harbourY: 4500, facing: Math.PI / 2 },
  { id: "h2", kind: "home", homeSlot: 2, cityX: 7150, cityY: 4500, harbourX: 7200, harbourY: 4500, facing: Math.PI },
  { id: "h3", kind: "home", homeSlot: 3, cityX: 9850, cityY: 4500, harbourX: 9900, harbourY: 4500, facing: Math.PI * 1.5 },
  { id: "n0", kind: "neutral", homeSlot: null, cityX: 12550, cityY: 4500, harbourX: 12600, harbourY: 4500, facing: 0 },
];

function setup() {
  let now = 0;
  const room = new Room(11, () => now, openWorld);
  return { room, setNow: (value: number) => { now = value; } };
}

function connect(room: Room): FakeSocket {
  const socket = new FakeSocket();
  room.accept(socket as unknown as WebSocket);
  return socket;
}

function send(room: Room, socket: FakeSocket, message: ClientMessage): void {
  room.handleMessage(socket as unknown as WebSocket, message);
}

function join(room: Room, socket: FakeSocket, name: string, token?: string): void {
  send(room, socket, { type: "join", name, ...(token ? { token } : {}) });
}

function welcome(socket: FakeSocket) {
  const message = socket.last("welcome");
  expect(message).toBeDefined();
  return message!;
}

describe("multiplayer room", () => {
  it("assigns lowest slots and colours, rejects the fifth player and duplicate names, and makes the first joiner host", () => {
    const { room } = setup();
    const sockets = ["Alice", "Bob", "Cara", "Drew"].map(() => connect(room));
    const colours = room.getColours();
    sockets.forEach((socket, index) => {
      join(room, socket, ["Alice", "Bob", "Cara", "Drew"][index] ?? "Guest");
      expect(welcome(socket).slot).toBe(index + 1);
      expect(welcome(socket).playerId).toBe(`p${index + 1}`);
      expect(welcome(socket)).toMatchObject({ columns: bigDimensions.columns, rows: bigDimensions.rows });
    });
    expect(room.sessions.get(welcome(sockets[0]!).playerId)?.host).toBe(true);
    expect(welcome(sockets[0]!).settings).toEqual({ ...DEFAULT_SETTINGS, mapSize: 2 });
    expect(colours).toEqual(["#3b82f6", "#ef4444", "#facc15", "#a855f7"]);
    const fifth = connect(room);
    join(room, fifth, "Eve");
    expect(fifth.last("error")?.code).toBe("full");
    const duplicate = connect(room);
    join(room, duplicate, "alice");
    expect(duplicate.last("error")?.code).toBe("name_taken");
  });

  it("keeps non-host actions blocked, regenerates while keeping scores, resets scores, and kicks", () => {
    const { room } = setup();
    const hostSocket = connect(room);
    const guestSocket = connect(room);
    join(room, hostSocket, "Harbor");
    join(room, guestSocket, "Buoy");
    const host = welcome(hostSocket);
    const guest = welcome(guestSocket);
    const initialSeed = room.game.world.seed;
    send(room, guestSocket, { type: "host", action: "regenerate" });
    expect(guestSocket.last("error")?.code).toBe("not_host");
    expect(room.game.world.seed).toBe(initialSeed);

    const hostSession = room.sessions.get(host.playerId)!;
    hostSession.score = 4;
    room.game.scores[host.playerId]!.score = 4;
    send(room, hostSocket, { type: "host", action: "regenerate" });
    expect(room.game.world.seed).not.toBe(initialSeed);
    expect(room.game.scores[host.playerId]?.score).toBe(4);
    expect(room.game.frigates[host.playerId]?.status).toBe("alive");
    expect(room.game.frigates[guest.playerId]?.hp).toBe(GAME_CONFIG.player.maxHp);
    send(room, hostSocket, { type: "host", action: "resetScores" });
    expect(room.game.scores[host.playerId]?.score).toBe(0);
    expect(room.game.scores[guest.playerId]?.sunk).toBe(0);
    send(room, hostSocket, { type: "host", action: "kick", target: guest.playerId });
    expect(room.sessions.has(guest.playerId)).toBe(false);
    expect(guestSocket.last("error")?.code).toBe("kicked");
    expect(guestSocket.readyState).toBe(3);
  });

  it("validates host settings, broadcasts changes, and only announces actual changes", () => {
    const { room } = setup();
    const hostSocket = connect(room);
    const guestSocket = connect(room);
    join(room, hostSocket, "Harbor");
    join(room, guestSocket, "Buoy");

    send(room, guestSocket, { type: "host", action: "settings", settings: { ...DEFAULT_SETTINGS, boatSpeedPct: 150 } });
    expect(guestSocket.last("error")?.code).toBe("not_host");

    send(room, hostSocket, { type: "host", action: "settings", settings: { ...DEFAULT_SETTINGS, boatSpeedPct: 105 } });
    expect(hostSocket.last("error")?.code).toBe("invalid_action");
    expect(room.game.settings).toEqual({ ...DEFAULT_SETTINGS, mapSize: 2 });

    const initialSeed = room.game.world.seed;
    const initialWorldMessageCount = hostSocket.messages.filter((message) => message.type === "world").length;
    const settings = {
      ...DEFAULT_SETTINGS,
      boatSpeedPct: 150,
      cannonReload: 2,
      fuelCrossings: 3,
      shells: 100,
      torpedoes: 60,
      resupplyTime: 6,
      mapSize: 2,
    };
    send(room, hostSocket, { type: "host", action: "settings", settings });
    expect(room.game.settings).toEqual(settings);
    expect(room.game.world.seed).toBe(initialSeed);
    expect(hostSocket.messages.filter((message) => message.type === "world")).toHaveLength(initialWorldMessageCount);
    expect(hostSocket.last("settings")?.settings).toEqual(settings);
    expect(guestSocket.last("settings")?.settings).toEqual(settings);
    expect(guestSocket.messages.some((message) =>
      message.type === "event"
        && message.event.message === "Host Harbor: boat speed 150%, cannon reload 2 s, fuel 3 crossings, shells 100, torpedoes 60, resupply time 6 s",
    )).toBe(true);

    const eventCount = hostSocket.messages.filter((message) =>
      message.type === "event"
        && message.event.message === "Host Harbor: boat speed 150%, cannon reload 2 s, fuel 3 crossings, shells 100, torpedoes 60, resupply time 6 s",
    ).length;
    send(room, hostSocket, { type: "host", action: "settings", settings });
    expect(hostSocket.messages.filter((message) =>
      message.type === "event"
        && message.event.message === "Host Harbor: boat speed 150%, cannon reload 2 s, fuel 3 crossings, shells 100, torpedoes 60, resupply time 6 s",
    )).toHaveLength(eventCount);
  });

  it("regenerates the world when the host changes land coverage", () => {
    const { room } = setup();
    const hostSocket = connect(room);
    join(room, hostSocket, "Harbor");
    const hostId = welcome(hostSocket).playerId;
    room.game.scores[hostId]!.score = 3;
    const initialSeed = room.game.world.seed;
    const settings = { ...DEFAULT_SETTINGS, landCoveragePct: 10, mapSize: 2 };

    send(room, hostSocket, { type: "host", action: "settings", settings });

    expect(room.game.settings).toEqual(settings);
    expect(room.game.world.seed).not.toBe(initialSeed);
    const coverage = room.game.world.grid.reduce((sum, cell) => sum + cell, 0) / room.game.world.grid.length;
    expect(coverage).toBeGreaterThanOrEqual(0.075);
    expect(coverage).toBeLessThanOrEqual(0.125);
    expect(hostSocket.last("world")?.type).toBe("world");
    expect(hostSocket.last("projectiles")).toMatchObject({ type: "projectiles", reset: true, shells: [], torpedoes: [] });
    expect(hostSocket.messages.some((message) =>
      message.type === "event" && message.event.message === "Host Harbor: land coverage 10%",
    )).toBe(true);
    expect(hostSocket.messages.some((message) =>
      message.type === "event" && message.event.message === "Harbor regenerated the world",
    )).toBe(true);
    expect(room.game.scores[hostId]?.score).toBe(3);
  });

  it("regenerates for map-size changes and announces neutral-base fallback", () => {
    const { room } = setup();
    const hostSocket = connect(room);
    join(room, hostSocket, "Harbor");
    const settings = { ...room.game.settings, landCoveragePct: 5, mapSize: 0, neutralBases: 8 };

    send(room, hostSocket, { type: "host", action: "settings", settings });

    const dimensions = mapDimensions(0);
    expect(room.game.settings).toEqual(settings);
    expect(room.game.world).toMatchObject(dimensions);
    expect(hostSocket.last("world")).toMatchObject({ columns: dimensions.columns, rows: dimensions.rows });
    const neutralPlaced = room.game.bases.filter((base) => base.kind === "neutral").length;
    expect(neutralPlaced).toBeLessThan(8);
    expect(hostSocket.messages.some((message) =>
      message.type === "event" && message.event.message === `Only ${neutralPlaced} neutral bases fit on this map`,
    )).toBe(true);
  }, 120_000);

  it("preserves settings through regeneration, score reset, and host succession", () => {
    const { room, setNow } = setup();
    const hostSocket = connect(room);
    const guestSocket = connect(room);
    join(room, hostSocket, "Harbor");
    setNow(1);
    join(room, guestSocket, "Buoy");
    const settings = { ...DEFAULT_SETTINGS, boatSpeedPct: 150, torpedoReload: 4, mapSize: 2 };
    send(room, hostSocket, { type: "host", action: "settings", settings });

    send(room, hostSocket, { type: "host", action: "regenerate" });
    expect(room.game.settings).toEqual(settings);
    send(room, hostSocket, { type: "host", action: "resetScores" });
    expect(room.game.settings).toEqual(settings);

    hostSocket.close();
    setNow(12);
    room.advanceTick();
    expect(room.sessions.get(welcome(guestSocket).playerId)?.host).toBe(true);
    expect(room.game.settings).toEqual(settings);
  });

  it("keeps snapshots free of projectiles and sends new projectiles only once to joined sockets", () => {
    const room = new Room(11, () => 0, openWorld, fixtureSites);
    const host = connect(room);
    const guest = connect(room);
    join(room, host, "Harbor");
    join(room, guest, "Buoy");
    const playerId = welcome(host).playerId;
    send(room, host, {
      type: "input",
      seq: 1,
      keys: 0,
      throttle: 0,
      fireCannon: true,
      fireTorpedo: true,
    });
    room.advanceTick();
    room.advanceTick();
    const snapshot = host.last("snapshot");
    expect(snapshot).toBeDefined();
    expect(snapshot).not.toHaveProperty("shells");
    expect(snapshot).not.toHaveProperty("torpedoes");
    expect(snapshot?.bases?.[0]).toHaveProperty("turret", "active");
    expect(snapshot?.bases?.[0]).not.toHaveProperty("cityX");
    expect(snapshot?.bases?.[0]).not.toHaveProperty("lostFrom");
    expect(snapshot?.bases?.[0]).not.toHaveProperty("turretReadyAt");

    for (const socket of [host, guest]) {
      const spawned = socket.messages.filter(
        (message): message is Extract<ServerMessage, { type: "projectiles" }> => message.type === "projectiles" && !message.reset,
      );
      expect(spawned).toHaveLength(1);
      expect(spawned[0]?.shells).toHaveLength(2);
      expect(spawned[0]?.torpedoes).toHaveLength(3);
      expect(spawned[0]?.torpedoes.every((torpedo) => torpedo.speed === GAME_CONFIG.torpedo.speed)).toBe(true);
      expect(spawned[0]?.shells.every((shell) => shell.ownerId === playerId)).toBe(true);
    }

    room.advanceTick();
    for (const socket of [host, guest]) {
      expect(socket.messages.filter((message) => message.type === "projectiles" && !message.reset)).toHaveLength(1);
    }
  });

  it("sends base statuses only when changed and after world regeneration", () => {
    const room = new Room(11, () => 0, openWorld, fixtureSites);
    const socket = connect(room);
    join(room, socket, "Harbor");
    const playerId = welcome(socket).playerId;
    const nextSnapshot = () => {
      const lastTick = socket.last("snapshot")?.tick;
      for (let tick = 0; tick < 4 && socket.last("snapshot")?.tick === lastTick; tick += 1) {
        room.advanceTick();
      }
      return socket.last("snapshot");
    };

    const first = nextSnapshot();
    expect(first?.bases).toBeDefined();
    const unchanged = nextSnapshot();
    expect(unchanged).not.toHaveProperty("bases");

    const neutral = room.game.bases.find((base) => base.kind === "neutral")!;
    const frigate = room.game.frigates[playerId]!;
    frigate.x = neutral.harbourX;
    frigate.y = neutral.harbourY;
    const capturing = nextSnapshot();
    const capturedStatus = capturing?.bases?.find((base) => base.id === neutral.id);
    expect(capturedStatus?.captureBy).toBe(playerId);
    expect(capturedStatus?.captureProgress).toBe(Number(neutral.captureProgress.toFixed(2)));

    neutral.ownerId = playerId;
    neutral.turret = "destroyed";
    neutral.turretHp = 0;
    neutral.captureBy = null;
    neutral.captureProgress = 0;
    neutral.repairBy = playerId;
    neutral.repairProgress = 0.1234;
    const repairing = nextSnapshot();
    const repairingStatus = repairing?.bases?.find((base) => base.id === neutral.id);
    expect(repairingStatus?.repairBy).toBe(playerId);
    expect(repairingStatus?.repairProgress).toBe(Number(neutral.repairProgress.toFixed(2)));

    send(room, socket, { type: "host", action: "regenerate" });
    const regenerated = nextSnapshot();
    expect(regenerated?.bases).toBeDefined();
  });

  it("announces a sent torpedo when it ends on land", () => {
    const world: World = createEmptyWorld(bigDimensions, 11);
    world.grid[225 * bigDimensions.columns + 50] = 1;
    const room = new Room(11, () => 0, world);
    const socket = connect(room);
    join(room, socket, "Harbor");
    room.game.torpedoes.push({
      id: "tland",
      ownerId: welcome(socket).playerId,
      x: 995,
      y: 4510,
      angle: 0,
      elapsed: 0,
      speed: GAME_CONFIG.torpedo.speed,
    });

    room.advanceTick();
    expect(socket.last("projectiles")?.torpedoes.map((torpedo) => torpedo.id)).toContain("tland");
    room.advanceTick();
    expect(socket.last("projectiles")?.removed).toContain("tland");
  });

  it("sends live projectiles after welcome and resets all clients on regeneration", () => {
    const { room } = setup();
    const host = connect(room);
    join(room, host, "Harbor");
    send(room, host, {
      type: "input",
      seq: 1,
      keys: 0,
      throttle: 0,
      fireCannon: true,
      fireTorpedo: true,
    });
    room.advanceTick();

    const guest = connect(room);
    join(room, guest, "Buoy");
    const welcomeIndex = guest.messages.findIndex((message) => message.type === "welcome");
    const resetIndex = guest.messages.findIndex((message) => message.type === "projectiles" && message.reset);
    expect(resetIndex).toBeGreaterThan(welcomeIndex);
    const reset = guest.messages[resetIndex]!;
    expect(reset.type).toBe("projectiles");
    if (reset.type !== "projectiles") throw new Error("Expected projectile reset");
    expect(reset.shells).toHaveLength(2);
    expect(reset.torpedoes).toHaveLength(3);
    expect(reset.torpedoes.every((torpedo) => torpedo.speed === GAME_CONFIG.torpedo.speed)).toBe(true);

    send(room, host, { type: "host", action: "regenerate" });
    expect(room.game.shells).toHaveLength(0);
    expect(room.game.torpedoes).toHaveLength(0);
    for (const socket of [host, guest]) {
      const regenerated = socket.last("projectiles");
      expect(regenerated).toMatchObject({ type: "projectiles", reset: true, shells: [], torpedoes: [], removed: [] });
    }
  });

  it("transfers host to the longest-connected player when the host's grace period expires", () => {
    const { room, setNow } = setup();
    const first = connect(room);
    const second = connect(room);
    const third = connect(room);
    join(room, first, "First");
    setNow(1);
    join(room, second, "Second");
    setNow(2);
    join(room, third, "Third");
    const secondId = welcome(second).playerId;
    first.close();
    setNow(12);
    room.advanceTick();
    expect(room.sessions.has(welcome(first).playerId)).toBe(false);
    expect(room.sessions.get(secondId)?.host).toBe(true);
    expect(room.sessions.get(welcome(third).playerId)?.host).toBe(false);
  });

  it("makes a reconnecting player host when the previous host expires during their grace period", () => {
    const { room, setNow } = setup();
    const first = connect(room);
    join(room, first, "First");
    const firstJoin = welcome(first);
    setNow(1);
    const second = connect(room);
    join(room, second, "Second");
    const secondJoin = welcome(second);

    setNow(2);
    first.close();
    setNow(3);
    second.close();
    setNow(12);
    room.advanceTick();
    expect(room.sessions.has(firstJoin.playerId)).toBe(false);
    expect(room.sessions.get(secondJoin.playerId)?.host).toBe(false);

    setNow(12.5);
    const reconnect = connect(room);
    join(room, reconnect, "Second", secondJoin.token);
    expect(welcome(reconnect).playerId).toBe(secondJoin.playerId);
    expect(room.sessions.get(secondJoin.playerId)?.host).toBe(true);
    expect(room.game.scores[secondJoin.playerId]?.host).toBe(true);
  });

  it("resumes score and frigate inside the grace period, then drops score after expiry", () => {
    const { room, setNow } = setup();
    const first = connect(room);
    join(room, first, "Returner");
    const joined = welcome(first);
    const session = room.sessions.get(joined.playerId)!;
    session.score = 3;
    room.game.scores[session.id]!.score = 3;
    const originalPosition = { x: room.game.frigates[session.id]!.x, y: room.game.frigates[session.id]!.y };
    first.close();

    setNow(9);
    const reconnect = connect(room);
    join(room, reconnect, "Returner", joined.token);
    expect(welcome(reconnect).playerId).toBe(joined.playerId);
    expect(room.sessions.get(joined.playerId)?.score).toBe(3);
    expect(room.game.frigates[joined.playerId]?.x).toBe(originalPosition.x);
    reconnect.close();
    setNow(19);
    room.advanceTick();
    expect(room.sessions.has(joined.playerId)).toBe(false);
    expect(room.game.scores[joined.playerId]).toBeUndefined();
  });

  it("activates home harbours before spawning and preserves base state during reconnect grace", () => {
    let now = 0;
    const room = new Room(11, () => now, openWorld, fixtureSites);
    const first = connect(room);
    join(room, first, "Harbor");
    const joined = welcome(first);
    const home = room.game.bases.find((base) => base.id === "h0")!;
    const frigate = room.game.frigates[joined.playerId]!;
    expect(home).toMatchObject({
      active: true,
      ownerId: joined.playerId,
      turret: "active",
      turretHp: GAME_CONFIG.bases.turretHp,
      turretReadyAt: 0,
    });
    expect({ x: frigate.x, y: frigate.y, heading: frigate.heading }).toEqual({
      x: home.harbourX,
      y: home.harbourY,
      heading: home.facing,
    });
    expect(frigate).toMatchObject({
      fuel: DEFAULT_SETTINGS.fuelCrossings * bigDimensions.width,
      shells: DEFAULT_SETTINGS.shells,
      torpedoes: DEFAULT_SETTINGS.torpedoes,
    });
    expect(joined.bases[0]).toHaveProperty("cityX");
    home.turretHp = 37;
    home.turretReadyAt = 4;
    room.game.bases.find((base) => base.id === "n0")!.ownerId = joined.playerId;
    room.game.bases.find((base) => base.id === "n0")!.captureBy = joined.playerId;
    room.game.bases.find((base) => base.id === "n0")!.captureProgress = 0.4;
    room.game.bases.find((base) => base.id === "n0")!.turret = "active";
    room.game.bases.find((base) => base.id === "n0")!.turretHp = 30;
    room.game.bases.find((base) => base.id === "n0")!.repairBy = joined.playerId;
    room.game.bases.find((base) => base.id === "n0")!.repairProgress = 0.3;
    frigate.fuel = 12345.6;
    frigate.shells = 12.34;
    frigate.torpedoes = 5.67;
    first.close();

    now = 9;
    const reconnect = connect(room);
    join(room, reconnect, "Harbor", joined.token);
    expect(welcome(reconnect).playerId).toBe(joined.playerId);
    expect(room.game.bases.find((base) => base.id === "h0")).toMatchObject({
      active: true,
      ownerId: joined.playerId,
      turretHp: 37,
      turretReadyAt: 4,
    });
    expect(room.game.bases.find((base) => base.id === "n0")).toMatchObject({
      ownerId: joined.playerId,
      captureBy: joined.playerId,
      captureProgress: 0.4,
    });
    expect(room.game.frigates[joined.playerId]).toMatchObject({
      fuel: 12345.6,
      shells: 12.34,
      torpedoes: 5.67,
    });
    room.advanceTick();
    room.advanceTick();
    expect(reconnect.last("snapshot")?.bases).toBeDefined();

    reconnect.close();
    now = 20;
    room.advanceTick();
    expect(room.game.bases.find((base) => base.id === "h0")).toMatchObject({
      active: false,
      ownerId: null,
      turret: "none",
      turretHp: 0,
      lostFrom: null,
      returnAt: null,
      captureBy: null,
      captureProgress: 0,
      repairBy: null,
      repairProgress: 0,
    });
    expect(room.game.bases.find((base) => base.id === "n0")).toMatchObject({
      ownerId: null,
      turret: "none",
      turretHp: 0,
      captureBy: null,
      captureProgress: 0,
      repairBy: null,
      repairProgress: 0,
    });
  });

  it("returns a lost home to its original owner when the current holder leaves", () => {
    let now = 0;
    const room = new Room(11, () => now, openWorld, fixtureSites);
    const originalSocket = connect(room);
    const holderSocket = connect(room);
    join(room, originalSocket, "Original");
    now = 1;
    join(room, holderSocket, "Holder");
    const originalId = welcome(originalSocket).playerId;
    const holderId = welcome(holderSocket).playerId;
    const home = room.game.bases.find((base) => base.id === "h0")!;
    home.ownerId = holderId;
    home.lostFrom = originalId;
    home.returnAt = 50;
    home.turret = "destroyed";
    home.turretHp = 0;
    home.repairBy = holderId;
    home.repairProgress = 0.5;
    home.captureBy = holderId;
    home.captureProgress = 0.4;

    holderSocket.close();
    now = 1 + GAME_CONFIG.network.reconnectGrace;
    room.advanceTick();

    expect(room.game.bases.find((base) => base.id === "h0")).toMatchObject({
      active: true,
      ownerId: originalId,
      lostFrom: null,
      returnAt: null,
      turret: "active",
      turretHp: GAME_CONFIG.bases.turretHp,
      turretReadyAt: now,
      repairBy: null,
      repairProgress: 0,
      captureBy: null,
      captureProgress: 0,
    });
    expect(room.game.bases.find((base) => base.id === "h1")).toMatchObject({
      active: false,
      ownerId: null,
      turret: "none",
      turretHp: 0,
    });
    expect(originalSocket.messages.some((message) =>
      message.type === "event" && message.event.message === "Original's home base is back",
    )).toBe(true);
  });

  it("regenerates configured neutral bases and keeps home ownership for connected players", () => {
    let now = 0;
    const room = new Room(11, () => now, openWorld, fixtureSites);
    const socket = connect(room);
    join(room, socket, "Harbor");
    const playerId = welcome(socket).playerId;
    room.game.bases.find((base) => base.id === "n0")!.ownerId = playerId;
    room.game.bases.find((base) => base.id === "n0")!.captureBy = playerId;
    room.game.bases.find((base) => base.id === "n0")!.captureProgress = 0.6;
    const originalHome = room.game.bases.find((base) => base.id === "h0")!;
    originalHome.lostFrom = "former-owner";
    originalHome.returnAt = 30;
    originalHome.turret = "destroyed";
    originalHome.turretHp = 0;
    const settings = { ...DEFAULT_SETTINGS, neutralBases: 2, mapSize: 2 };

    send(room, socket, { type: "host", action: "settings", settings });

    expect(room.game.bases).toHaveLength(6);
    expect(room.game.bases.filter((base) => base.kind === "neutral")).toHaveLength(2);
    expect(room.game.bases.filter((base) => base.kind === "neutral").every((base) =>
      base.active && base.ownerId === null && base.captureBy === null && base.captureProgress === 0
      && base.turret === "none" && base.turretHp === 0 && base.lostFrom === null && base.returnAt === null,
    )).toBe(true);
    const home = room.game.bases.find((base) => base.kind === "home" && base.homeSlot === 0)!;
    expect(home).toMatchObject({
      active: true,
      ownerId: playerId,
      turret: "active",
      turretHp: GAME_CONFIG.bases.turretHp,
      lostFrom: null,
      returnAt: null,
    });
    expect(room.game.frigates[playerId]).toMatchObject({ x: home.harbourX, y: home.harbourY, heading: home.facing });
    expect(socket.last("world")?.bases).toHaveLength(6);

    room.advanceTick();
    room.advanceTick();
    const snapshot = socket.last("snapshot");
    expect(snapshot?.bases?.[0]).not.toHaveProperty("cityX");
    expect(snapshot?.bases?.[0]).toHaveProperty("captureProgress");
  });

  it("clamps supplies on setting changes, respawns full with current settings, and hides other players' supplies", () => {
    const { room, setNow } = setup();
    const hostSocket = connect(room);
    const guestSocket = connect(room);
    join(room, hostSocket, "Host");
    join(room, guestSocket, "Guest");
    const hostId = welcome(hostSocket).playerId;
    const guestId = welcome(guestSocket).playerId;
    const host = room.game.frigates[hostId]!;
    host.fuel = 20000;
    host.shells = 25;
    host.torpedoes = 6;

    const lower = { ...DEFAULT_SETTINGS, fuelCrossings: 1, shells: 10, torpedoes: 5, mapSize: 2 };
    send(room, hostSocket, { type: "host", action: "settings", settings: lower });
    expect(host).toMatchObject({ fuel: 16000, shells: 10, torpedoes: 5 });

    const higher = { ...DEFAULT_SETTINGS, fuelCrossings: 4, shells: 100, torpedoes: 50, mapSize: 2 };
    send(room, hostSocket, { type: "host", action: "settings", settings: higher });
    expect(host).toMatchObject({ fuel: 16000, shells: 10, torpedoes: 5 });
    host.fuel = 12345.678;
    host.shells = 9.876;
    host.torpedoes = 4.567;

    const guest = room.game.frigates[guestId]!;
    guest.status = "sinking";
    guest.respawnAt = 1;
    setNow(1);
    room.advanceTick();
    expect(room.game.frigates[guestId]).toMatchObject({
      fuel: higher.fuelCrossings * bigDimensions.width,
      shells: higher.shells,
      torpedoes: higher.torpedoes,
      status: "alive",
    });
    room.advanceTick();

    const snapshot = hostSocket.last("snapshot");
    const own = snapshot?.frigates.find((frigate) => frigate.playerId === hostId);
    const other = snapshot?.frigates.find((frigate) => frigate.playerId === guestId);
    expect(own).toMatchObject({ fuel: 12345.7, shells: 9.88, torpedoes: 4.57 });
    expect(other).toBeDefined();
    expect(other).not.toHaveProperty("fuel");
    expect(other).not.toHaveProperty("shells");
    expect(other).not.toHaveProperty("torpedoes");
  });
});
