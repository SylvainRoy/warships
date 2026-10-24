import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { GAME_CONFIG } from "../src/shared/config.js";
import type { ClientMessage, ServerMessage } from "../src/shared/protocol.js";
import { DEFAULT_SETTINGS } from "../src/shared/settings.js";
import type { BaseSite } from "../src/shared/bases.js";
import { Room } from "../src/server/room.js";
import { createEmptyWorld, mapDimensions, type World } from "../src/shared/world.js";

const regenerationSeed = vi.hoisted(() => ({ value: undefined as number | undefined }));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    randomBytes: ((size: number) => {
      if (size === 4 && regenerationSeed.value !== undefined) {
        const bytes = Buffer.alloc(4);
        bytes.writeUInt32LE(regenerationSeed.value);
        return bytes;
      }
      return actual.randomBytes(size);
    }) as typeof actual.randomBytes,
  };
});

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
  { id: "h0", kind: "home", homeTeam: 0, cityX: 1750, cityY: 4500, harbourX: 1800, harbourY: 4500, facing: 0 },
  { id: "h1", kind: "home", homeTeam: 1, cityX: 4450, cityY: 4500, harbourX: 4500, harbourY: 4500, facing: Math.PI / 2 },
  { id: "h2", kind: "home", homeTeam: 2, cityX: 7150, cityY: 4500, harbourX: 7200, harbourY: 4500, facing: Math.PI },
  { id: "h3", kind: "home", homeTeam: 3, cityX: 9850, cityY: 4500, harbourX: 9900, harbourY: 4500, facing: Math.PI * 1.5 },
  { id: "n0", kind: "neutral", homeTeam: null, cityX: 12550, cityY: 4500, harbourX: 12600, harbourY: 4500, facing: 0 },
];

function setup() {
  let now = 0;
  const room = roomWithoutBots(11, () => now, openWorld);
  return { room, setNow: (value: number) => { now = value; } };
}

function roomWithoutBots(
  seed = 11,
  clock: () => number = () => 0,
  world = openWorld,
  sites?: readonly BaseSite[],
): Room {
  const room = new Room(seed, clock, world, sites);
  room.game.settings.bots = 0;
  return room;
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
  it("assigns default teams in order, honours shared teams, and falls back for invalid teams", () => {
    const defaults = roomWithoutBots(11, () => 0, openWorld, fixtureSites);
    const defaultSockets = ["A", "B", "C", "D"].map((name) => {
      const socket = connect(defaults);
      join(defaults, socket, name);
      return socket;
    });
    expect(defaultSockets.map((socket) => welcome(socket).team)).toEqual([0, 1, 2, 3]);

    const shared = roomWithoutBots(11, () => 0, openWorld, fixtureSites);
    const first = connect(shared);
    const second = connect(shared);
    const invalidHigh = connect(shared);
    const invalidLow = connect(shared);
    send(shared, first, { type: "join", name: "First", team: 2 });
    send(shared, second, { type: "join", name: "Second", team: 2 });
    send(shared, invalidHigh, { type: "join", name: "High", team: 7 });
    send(shared, invalidLow, { type: "join", name: "Low", team: -1 });
    expect([first, second, invalidHigh, invalidLow].map((socket) => welcome(socket).team)).toEqual([2, 2, 0, 1]);
  });

  it("switches team after the cooldown and respawns at the new home without a death", () => {
    let now = 10;
    const room = roomWithoutBots(11, () => now, openWorld, fixtureSites);
    const socket = connect(room);
    join(room, socket, "Alice");
    const id = welcome(socket).playerId;
    const neutral = room.game.bases.find((base) => base.kind === "neutral")!;
    neutral.active = true;
    neutral.ownerTeam = 0;
    room.game.teamBonus[0] = 8;
    room.sessions.get(id)!.score = 7;
    room.game.scores[id]!.score = 7;

    send(room, socket, { type: "team", team: 1 });
    expect(socket.last("error")?.code).toBeUndefined();
    expect(room.sessions.get(id)).toMatchObject({ team: 1, score: 7, sunk: 0 });
    expect(room.game.frigates[id]).toBeUndefined();
    expect(room.game.bases.find((base) => base.kind === "home" && base.homeTeam === 0)).toMatchObject({
      active: false,
      ownerTeam: null,
    });
    expect(neutral.ownerTeam).toBeNull();
    expect(room.game.teamBonus[0]).toBe(0);

    send(room, socket, { type: "team", team: 2 });
    expect(socket.last("error")?.code).toBe("cooldown");
    now += GAME_CONFIG.player.respawnDelay;
    room.advanceTick();
    const respawned = room.game.frigates[id];
    const newHome = room.game.bases.find((base) => base.kind === "home" && base.homeTeam === 1)!;
    expect(respawned).toMatchObject({
      team: 1,
      x: newHome.harbourX,
      y: newHome.harbourY,
      status: "alive",
    });
    expect(room.sessions.get(id)?.sunk).toBe(0);
  });

  it("rejects team switching during the round intermission", () => {
    let now = 0;
    const room = roomWithoutBots(11, () => now, openWorld, fixtureSites);
    const socket = connect(room);
    join(room, socket, "Alice");
    now = 600;
    room.advanceTick();

    send(room, socket, { type: "team", team: 1 });

    expect(socket.last("error")?.code).toBe("invalid_action");
  });

  it("keeps team pools through intermission and resets them on scores and the next round", () => {
    let now = 0;
    const room = roomWithoutBots(11, () => now, openWorld, fixtureSites);
    const socket = connect(room);
    join(room, socket, "Alice");
    room.game.teamBonus[0] = 4;
    send(room, socket, { type: "host", action: "resetScores" });
    expect(room.game.teamBonus[0]).toBe(0);

    room.game.teamBonus[0] = 6;
    now = 600;
    room.advanceTick();
    expect(room.game.teamBonus[0]).toBe(6);
    expect(socket.last("round")?.round).toMatchObject({
      phase: "over",
      teamScores: [6, 0, 0, 0],
    });

    now = 610;
    room.advanceTick();
    expect(room.game.teamBonus).toEqual([0, 0, 0, 0]);
  });

  it("sums teammate scores and pool bonuses into team round totals", () => {
    let now = 0;
    const room = roomWithoutBots(11, () => now, openWorld, fixtureSites);
    const alice = connect(room);
    const bob = connect(room);
    send(room, alice, { type: "join", name: "Alice", team: 0 });
    send(room, bob, { type: "join", name: "Bob", team: 0 });
    const aliceId = welcome(alice).playerId;
    const bobId = welcome(bob).playerId;
    room.sessions.get(aliceId)!.score = 2;
    room.sessions.get(bobId)!.score = 3;
    room.game.scores[aliceId]!.score = 2;
    room.game.scores[bobId]!.score = 3;
    room.game.teamBonus[0] = 4;
    now = 600;

    room.advanceTick();

    expect(alice.last("round")?.round).toMatchObject({
      phase: "over",
      teamScores: [9, 0, 0, 0],
      winnerTeams: [0],
      winners: [bobId, aliceId],
    });
  });

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
    expect(welcome(sockets[0]!).settings).toEqual({ ...DEFAULT_SETTINGS, bots: 0, mapSize: 2 });
    expect(colours).toEqual(["#4b9bff", "#ff6266", "#f3c94e", "#c084fc"]);
    const fifth = connect(room);
    join(room, fifth, "Eve");
    expect(fifth.last("error")?.code).toBe("full");
    const duplicate = connect(room);
    join(room, duplicate, "alice");
    expect(duplicate.last("error")?.code).toBe("name_taken");
  });

  it("resends welcome when the same connection joins with the same name", () => {
    const { room } = setup();
    const socket = connect(room);
    join(room, socket, "A");
    const firstWelcome = welcome(socket);

    join(room, socket, "a");

    const welcomes = socket.messages.filter((message) => message.type === "welcome");
    expect(welcomes).toHaveLength(2);
    expect(welcomes[1]).toMatchObject({
      playerId: firstWelcome.playerId,
      token: firstWelcome.token,
      slot: firstWelcome.slot,
    });
    expect(socket.last("error")).toBeUndefined();
    expect(room.sessions.size).toBe(1);
    expect(room.sessions.has(firstWelcome.playerId)).toBe(true);
  });

  it("replaces a session when the same connection joins with a different name", () => {
    const room = roomWithoutBots(11, () => 0, openWorld, fixtureSites);
    const socket = connect(room);
    join(room, socket, "A");
    const oldPlayerId = welcome(socket).playerId;

    join(room, socket, "B");

    const newPlayerId = welcome(socket).playerId;
    expect(socket.readyState).toBe(1);
    expect(socket.last("error")).toBeUndefined();
    expect(room.sessions.size).toBe(1);
    expect(room.sessions.get(newPlayerId)?.name).toBe("B");
    expect(room.sessions.get(newPlayerId)?.slot).toBe(1);
    expect(room.sessions.has(oldPlayerId)).toBe(false);
    expect(room.game.frigates[oldPlayerId]).toBeUndefined();
    expect(room.game.scores[oldPlayerId]).toBeUndefined();
    expect(room.game.bases.find((base) => base.kind === "home" && base.homeTeam === 0)?.ownerTeam)
      .toBe(room.sessions.get(newPlayerId)?.team);
    expect(socket.last("lobby")).toMatchObject({
      players: [{ playerId: newPlayerId, name: "B", slot: 1 }],
      freeSlots: 3,
      full: false,
    });
  });

  it("frees a replacement session after its socket disconnects and grace expires", () => {
    const { room, setNow } = setup();
    const observer = connect(room);
    const socket = connect(room);
    join(room, socket, "A");
    join(room, socket, "B");
    const playerId = welcome(socket).playerId;

    socket.close();
    setNow(GAME_CONFIG.network.reconnectGrace + 1);
    room.advanceTick();

    expect(room.sessions.size).toBe(0);
    expect(room.game.frigates[playerId]).toBeUndefined();
    expect(room.game.scores[playerId]).toBeUndefined();
    expect(observer.last("lobby")).toMatchObject({ players: [], freeSlots: 4, full: false });
  });

  it("never fills the room when one connection repeatedly changes its name", () => {
    const { room } = setup();
    const socket = connect(room);

    for (const name of ["A", "B", "C", "D"]) {
      join(room, socket, name);
      expect(room.sessions.size).toBe(1);
      expect(socket.readyState).toBe(1);
    }

    expect(socket.last("lobby")).toMatchObject({
      players: [{ name: "D", slot: 1 }],
      freeSlots: 3,
      full: false,
    });
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
    const incomeBase = room.game.bases.find((base) => base.kind === "neutral")!;
    incomeBase.ownerTeam = host.team;
    incomeBase.heldFor = 12;
    send(room, hostSocket, { type: "host", action: "resetScores" });
    expect(room.game.scores[host.playerId]?.score).toBe(0);
    expect(room.game.scores[guest.playerId]?.sunk).toBe(0);
    expect(incomeBase.heldFor).toBe(0);
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
    expect(room.game.settings).toEqual({ ...DEFAULT_SETTINGS, bots: 0, mapSize: 2 });

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
      bots: 0,
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

  it("preserves base income progress as a fraction and resets it when income is Off", () => {
    const room = roomWithoutBots(11, () => 0, openWorld, fixtureSites);
    const hostSocket = connect(room);
    join(room, hostSocket, "Harbor");
    const hostId = welcome(hostSocket).playerId;
    const base = room.game.bases.find((candidate) => candidate.kind === "neutral")!;
    base.ownerTeam = room.sessions.get(hostId)!.team;
    base.heldFor = 30;

    send(room, hostSocket, {
      type: "host",
      action: "settings",
      settings: { ...room.game.settings, baseIncomeInterval: 120 },
    });
    expect(base.heldFor).toBe(60);

    base.heldFor = 42;
    send(room, hostSocket, {
      type: "host",
      action: "settings",
      settings: { ...room.game.settings, baseIncomeInterval: 0 },
    });
    expect(base.heldFor).toBe(0);
  });

  it("resets base income progress when its owner is neutralized", () => {
    let now = 0;
    const room = roomWithoutBots(11, () => now, openWorld, fixtureSites);
    const hostSocket = connect(room);
    join(room, hostSocket, "Harbor");
    const hostId = welcome(hostSocket).playerId;
    const base = room.game.bases.find((candidate) => candidate.kind === "neutral")!;
    base.ownerTeam = room.sessions.get(hostId)!.team;
    base.heldFor = 18;

    hostSocket.close();
    now = GAME_CONFIG.network.reconnectGrace + 1;
    room.advanceTick();

    expect(base.ownerTeam).toBeNull();
    expect(base.heldFor).toBe(0);
  });

  it("regenerates the world when the host changes land coverage", () => {
    const { room } = setup();
    const hostSocket = connect(room);
    join(room, hostSocket, "Harbor");
    const hostId = welcome(hostSocket).playerId;
    room.game.scores[hostId]!.score = 3;
    const initialSeed = room.game.world.seed;
    const settings = { ...DEFAULT_SETTINGS, landCoveragePct: 10, mapSize: 2, bots: 0 };

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

    regenerationSeed.value = 11;
    try {
      send(room, hostSocket, { type: "host", action: "settings", settings });
    } finally {
      regenerationSeed.value = undefined;
    }

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
    const room = roomWithoutBots(11, () => 0, openWorld, fixtureSites);
    const host = connect(room);
    const guest = connect(room);
    join(room, host, "Harbor");
    join(room, guest, "Buoy");
    const playerId = welcome(host).playerId;
    expect(welcome(host).bases[0]).not.toHaveProperty("heldFor");
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
    expect(snapshot?.bases?.[0]).not.toHaveProperty("heldFor");

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

  it("includes commanded throttle for non-own frigates in snapshots", () => {
    const room = roomWithoutBots(11, () => 0, openWorld, fixtureSites);
    const observer = connect(room);
    const guest = connect(room);
    join(room, observer, "Harbor");
    join(room, guest, "Buoy");
    const guestId = welcome(guest).playerId;
    send(room, guest, {
      type: "input",
      seq: 1,
      keys: 0,
      throttle: 2,
      fireCannon: false,
      fireTorpedo: false,
    });

    room.advanceTick();
    room.advanceTick();

    const snapshot = observer.last("snapshot");
    expect(snapshot?.frigates.find((frigate) => frigate.playerId === guestId)).toMatchObject({ throttle: 2 });
  });

  it("broadcasts damage events to every joined client without adding a message", () => {
    const room = roomWithoutBots(11, () => 0, openWorld, fixtureSites);
    const shooterSocket = connect(room);
    const targetSocket = connect(room);
    join(room, shooterSocket, "Harbor");
    join(room, targetSocket, "Buoy");
    const shooterId = welcome(shooterSocket).playerId;
    const targetId = welcome(targetSocket).playerId;
    const shooter = room.game.frigates[shooterId]!;
    const target = room.game.frigates[targetId]!;
    shooter.x = 9000;
    shooter.y = 8000;
    shooter.spawnProtectedUntil = 0;
    target.x = 8500;
    target.y = 8000;
    target.spawnProtectedUntil = 0;
    room.game.shells.push({
      id: "damage-shell",
      ownerId: shooterId,
      startX: shooter.x,
      startY: shooter.y,
      impactX: target.x,
      impactY: target.y,
      elapsed: 0,
      duration: 0,
    });

    room.advanceTick();

    for (const socket of [shooterSocket, targetSocket]) {
      expect(socket.messages).toContainEqual(expect.objectContaining({
        type: "event",
        event: expect.objectContaining({
          type: "damage",
          playerId: shooterId,
          targetId,
          x: target.x,
          y: target.y,
          amount: GAME_CONFIG.cannon.damage,
          cause: "shell",
        }),
      }));
      const damageMessage = socket.messages.find((message) =>
        message.type === "event" && message.event.type === "damage");
      expect(damageMessage?.type === "event" ? damageMessage.event : undefined).not.toHaveProperty("message");
    }
  });

  it("sends base statuses only when changed and after world regeneration", () => {
    const room = roomWithoutBots(11, () => 0, openWorld, fixtureSites);
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
    expect(capturedStatus?.captureBy).toBe(room.sessions.get(playerId)?.team);
    expect(capturedStatus?.captureProgress).toBe(Number(neutral.captureProgress.toFixed(2)));

    neutral.ownerTeam = room.sessions.get(playerId)!.team;
    neutral.turret = "destroyed";
    neutral.turretHp = 0;
    neutral.captureBy = null;
    neutral.captureProgress = 0;
    neutral.repairBy = room.sessions.get(playerId)!.team;
    neutral.repairProgress = 0.1234;
    const repairing = nextSnapshot();
    const repairingStatus = repairing?.bases?.find((base) => base.id === neutral.id);
    expect(repairingStatus?.repairBy).toBe(room.sessions.get(playerId)?.team);
    expect(repairingStatus?.repairProgress).toBe(Number(neutral.repairProgress.toFixed(2)));

    send(room, socket, { type: "host", action: "regenerate" });
    const regenerated = nextSnapshot();
    expect(regenerated?.bases).toBeDefined();
  });

  it("announces a sent torpedo when it ends on land", () => {
    const world: World = createEmptyWorld(bigDimensions, 11);
    world.grid[225 * bigDimensions.columns + 50] = 1;
    const room = roomWithoutBots(11, () => 0, world);
    const socket = connect(room);
    join(room, socket, "Harbor");
    room.game.torpedoes.push({
      id: "tland",
      ownerId: welcome(socket).playerId,
      x: 990,
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
    const room = roomWithoutBots(11, () => now, openWorld, fixtureSites);
    const first = connect(room);
    join(room, first, "Harbor");
    const joined = welcome(first);
    const home = room.game.bases.find((base) => base.id === "h0")!;
    const frigate = room.game.frigates[joined.playerId]!;
    expect(home).toMatchObject({
      active: true,
      ownerTeam: joined.team,
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
    room.game.bases.find((base) => base.id === "n0")!.ownerTeam = joined.team;
    room.game.bases.find((base) => base.id === "n0")!.captureBy = joined.team;
    room.game.bases.find((base) => base.id === "n0")!.captureProgress = 0.4;
    room.game.bases.find((base) => base.id === "n0")!.turret = "active";
    room.game.bases.find((base) => base.id === "n0")!.turretHp = 30;
    room.game.bases.find((base) => base.id === "n0")!.repairBy = joined.team;
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
      ownerTeam: joined.team,
      turretHp: 37,
      turretReadyAt: 4,
    });
    expect(room.game.bases.find((base) => base.id === "n0")).toMatchObject({
      ownerTeam: joined.team,
      captureBy: joined.team,
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
      ownerTeam: null,
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
      ownerTeam: null,
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
    const room = roomWithoutBots(11, () => now, openWorld, fixtureSites);
    const originalSocket = connect(room);
    const holderSocket = connect(room);
    join(room, originalSocket, "Original");
    now = 1;
    join(room, holderSocket, "Holder");
    const originalId = welcome(originalSocket).playerId;
    const holderId = welcome(holderSocket).playerId;
    const home = room.game.bases.find((base) => base.id === "h0")!;
    home.ownerTeam = welcome(holderSocket).team;
    home.lostFrom = welcome(originalSocket).team;
    home.returnAt = 50;
    home.turret = "destroyed";
    home.turretHp = 0;
    home.repairBy = welcome(holderSocket).team;
    home.repairProgress = 0.5;
    home.captureBy = welcome(holderSocket).team;
    home.captureProgress = 0.4;

    holderSocket.close();
    now = 1 + GAME_CONFIG.network.reconnectGrace;
    room.advanceTick();

    expect(room.game.bases.find((base) => base.id === "h0")).toMatchObject({
      active: true,
      ownerTeam: welcome(originalSocket).team,
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
      ownerTeam: null,
      turret: "none",
      turretHp: 0,
    });
    expect(originalSocket.messages.some((message) =>
      message.type === "event" && message.event.message === "Original's home base is back",
    )).toBe(true);
  });

  it("regenerates configured neutral bases and keeps home ownership for connected players", () => {
    let now = 0;
    const room = roomWithoutBots(11, () => now, openWorld, fixtureSites);
    const socket = connect(room);
    join(room, socket, "Harbor");
    const playerId = welcome(socket).playerId;
    room.game.bases.find((base) => base.id === "n0")!.ownerTeam = welcome(socket).team;
    room.game.bases.find((base) => base.id === "n0")!.captureBy = welcome(socket).team;
    room.game.bases.find((base) => base.id === "n0")!.captureProgress = 0.6;
    const originalHome = room.game.bases.find((base) => base.id === "h0")!;
    originalHome.lostFrom = 1;
    originalHome.returnAt = 30;
    originalHome.turret = "destroyed";
    originalHome.turretHp = 0;
    const settings = { ...DEFAULT_SETTINGS, neutralBases: 2, mapSize: 2 };

    send(room, socket, { type: "host", action: "settings", settings });

    expect(room.game.bases).toHaveLength(6);
    expect(room.game.bases.filter((base) => base.kind === "neutral")).toHaveLength(2);
    expect(room.game.bases.filter((base) => base.kind === "neutral").every((base) =>
      base.active && base.ownerTeam === null && base.captureBy === null && base.captureProgress === 0
      && base.turret === "none" && base.turretHp === 0 && base.lostFrom === null && base.returnAt === null,
    )).toBe(true);
    const home = room.game.bases.find((base) => base.kind === "home" && base.homeTeam === 0)!;
    expect(home).toMatchObject({
      active: true,
      ownerTeam: welcome(socket).team,
      turret: "active",
      turretHp: GAME_CONFIG.bases.turretHp,
      lostFrom: null,
      returnAt: null,
    });
    const frigate = room.game.frigates[playerId]!;
    expect(Math.hypot(frigate.x - home.harbourX, frigate.y - home.harbourY)).toBeLessThanOrEqual(75);
    expect(frigate.heading).toBe(home.facing);
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

describe("room bots", () => {
  it("assigns bots to the least-populated team, breaking ties by team index", () => {
    const room = new Room(11, () => 0, openWorld, fixtureSites);
    const socket = connect(room);
    send(room, socket, { type: "join", name: "Harbor", team: 3 });

    const bots = [...room.sessions.values()].filter((session) => session.bot);

    expect(bots.map((bot) => bot.team)).toEqual([0, 1]);
  });

  it("fills the configured bot roster, reserves its names, exposes lobby flags, and keeps bots out of kicks", () => {
    const room = new Room(11, () => 0, openWorld, fixtureSites);
    const host = connect(room);
    join(room, host, "Harbor");

    const bots = [...room.sessions.values()].filter((session) => session.bot);
    expect(bots.map((bot) => bot.name)).toEqual(["Bot Nelson", "Bot Suffren"]);
    expect(bots.every((bot) => bot.socket === null && !bot.host && Boolean(bot.brain))).toBe(true);
    expect(host.last("lobby")).toMatchObject({
      freeSlots: 3,
      full: false,
      players: expect.arrayContaining([
        expect.objectContaining({ name: "Bot Nelson", bot: true }),
        expect.objectContaining({ name: "Bot Suffren", bot: true }),
      ]),
    });

    const reserved = connect(room);
    join(room, reserved, "bOt nElSoN");
    expect(reserved.last("error")?.code).toBe("name_taken");

    send(room, host, { type: "host", action: "kick", target: bots[0]!.id });
    expect(host.last("error")?.code).toBe("invalid_action");
    expect(room.sessions.has(bots[0]!.id)).toBe(true);

    send(room, host, {
      type: "host",
      action: "settings",
      settings: { ...room.game.settings, bots: 3, botSkill: 2 },
    });
    expect([...room.sessions.values()].filter((session) => session.bot)).toHaveLength(3);
    expect([...room.sessions.values()].filter((session) => session.bot).every((bot) => bot.botSkill === 2)).toBe(true);
  });

  it("evicts the newest bot before welcoming a human when the room is full", () => {
    const room = new Room(11, () => 0, openWorld, fixtureSites);
    const host = connect(room);
    join(room, host, "Harbor");
    send(room, host, {
      type: "host",
      action: "settings",
      settings: { ...room.game.settings, bots: 3 },
    });
    const newestBot = [...room.sessions.values()].filter((session) => session.bot).at(-1)!;
    expect(newestBot.name).toBe("Bot Tromp");

    const guest = connect(room);
    join(room, guest, "Buoy");

    const guestId = welcome(guest).playerId;
    expect(room.sessions.get(guestId)?.slot).toBe(newestBot.slot);
    expect(room.sessions.has(newestBot.id)).toBe(false);
    expect(room.game.frigates[newestBot.id]).toBeUndefined();
    expect(room.game.scores[newestBot.id]).toBeUndefined();
    expect(room.game.bases.find((base) => base.homeTeam === newestBot.team)?.ownerTeam)
      .toBe(room.sessions.get(guestId)?.team);
    expect(host.messages.some((message) =>
      message.type === "event" && message.event.type === "leave" && message.event.playerId === newestBot.id,
    )).toBe(true);
    expect([...room.sessions.values()].filter((session) => session.bot).map((bot) => bot.name)).toEqual([
      "Bot Nelson",
      "Bot Suffren",
    ]);
  });

  it("counts human reconnect-grace sessions, transfers hosts only to humans, and removes bots after the last human expires", () => {
    let now = 0;
    const room = new Room(11, () => now, openWorld, fixtureSites);
    const host = connect(room);
    const guest = connect(room);
    join(room, host, "Harbor");
    join(room, guest, "Buoy");
    const botIds = [...room.sessions.values()].filter((session) => session.bot).map((bot) => bot.id);
    expect(botIds).toHaveLength(2);

    host.close();
    now = GAME_CONFIG.network.reconnectGrace + 1;
    room.advanceTick();
    expect(room.sessions.get(welcome(guest).playerId)?.host).toBe(true);
    expect([...room.sessions.values()].filter((session) => session.bot)).toHaveLength(2);
    expect([...room.sessions.values()].filter((session) => session.bot).every((bot) => !bot.host)).toBe(true);

    guest.close();
    now += GAME_CONFIG.network.reconnectGrace + 1;
    room.advanceTick();
    expect(room.sessions.size).toBe(0);
    for (const id of botIds) {
      expect(room.game.frigates[id]).toBeUndefined();
      expect(room.game.scores[id]).toBeUndefined();
    }
    expect(room.game.bases.filter((base) => base.kind === "home" && base.active)).toHaveLength(0);
  });

  it("reports four human berths as full and rejects a fifth human despite bot occupancy changes", () => {
    const room = new Room(11, () => 0, openWorld, fixtureSites);
    const sockets = ["Harbor", "Buoy", "Sail", "Wake"].map(() => connect(room));
    for (const [index, name] of ["Harbor", "Buoy", "Sail", "Wake"].entries()) {
      join(room, sockets[index]!, name);
    }
    expect(sockets[3]!.last("lobby")).toMatchObject({ freeSlots: 0, full: true });
    expect(sockets[3]!.last("lobby")?.players).toHaveLength(4);

    const fifth = connect(room);
    join(room, fifth, "Fifth");
    expect(fifth.last("error")?.code).toBe("full");
    expect(room.sessions.size).toBe(4);
  });

  it("ends timed rounds with sorted results and gives late joiners the end state", () => {
    let now = 0;
    const room = roomWithoutBots(11, () => now, openWorld, fixtureSites);
    const alice = connect(room);
    const bob = connect(room);
    join(room, alice, "Alice");
    join(room, bob, "Bob");
    const aliceId = welcome(alice).playerId;
    const bobId = welcome(bob).playerId;
    room.sessions.get(aliceId)!.score = 5;
    room.game.scores[aliceId]!.score = 5;
    room.sessions.get(bobId)!.score = 2;
    room.game.scores[bobId]!.score = 2;
    room.game.teamBonus[0] = 3;
    now = 600;
    room.advanceTick();
    expect(alice.last("round")).toMatchObject({
      round: {
        phase: "over",
        winners: [aliceId],
        teamScores: [8, 2, 0, 0],
        winnerTeams: [0],
        results: [{ playerId: aliceId, score: 5 }, { playerId: bobId, score: 2 }],
      },
    });
    const lateJoiner = connect(room);
    join(room, lateJoiner, "Cara");
    expect(welcome(lateJoiner).round.phase).toBe("over");
    expect(alice.last("round")?.round.phase).toBe("over");
  });

  it("freezes and drains intermission input, rejects host map actions, then resets the next round", () => {
    let now = 0;
    const room = roomWithoutBots(11, () => now, openWorld, fixtureSites);
    const socket = connect(room);
    join(room, socket, "Harbor");
    const id = welcome(socket).playerId;
    const initialSeed = room.game.world.seed;
    room.sessions.get(id)!.score = 4;
    room.game.scores[id]!.score = 4;
    room.game.shells.push({ id: "s0", ownerId: id, startX: 0, startY: 0, impactX: 1, impactY: 1, elapsed: 0, duration: 1 });
    now = 600;
    room.advanceTick();
    const frigate = room.game.frigates[id]!;
    const position = { x: frigate.x, y: frigate.y };
    expect(room.game.shells).toHaveLength(0);
    expect(socket.last("projectiles")).toMatchObject({ reset: true });
    send(room, socket, { type: "input", seq: 1, keys: 0, throttle: 3, fireCannon: true, fireTorpedo: false });
    room.advanceTick();
    expect(room.game.frigates[id]).toMatchObject(position);
    expect(room.sessions.get(id)!.inputQueue).toHaveLength(0);
    send(room, socket, { type: "host", action: "regenerate" });
    expect(socket.last("error")?.code).toBe("invalid_action");
    send(room, socket, { type: "host", action: "resetScores" });
    expect(socket.last("error")?.code).toBe("invalid_action");
    now = 610;
    room.advanceTick();
    expect(socket.last("round")?.round.phase).toBe("playing");
    expect(room.game.world.seed).not.toBe(initialSeed);
    expect(room.sessions.get(id)).toMatchObject({ score: 0, sunk: 0, sinks: 0, shots: 0, hits: 0 });
    expect(room.game.frigates[id]).toMatchObject({ status: "alive", hp: GAME_CONFIG.player.maxHp });
    expect(room.game.bases.every((base) => base.heldFor <= 1 / GAME_CONFIG.network.tickRate)).toBe(true);
  });

  it("restarts the timer on round-length changes and keeps Endless rounds active", () => {
    let now = 12;
    const room = roomWithoutBots(11, () => now, openWorld, fixtureSites);
    const socket = connect(room);
    join(room, socket, "Harbor");
    send(room, socket, { type: "host", action: "settings", settings: { ...room.game.settings, roundMinutes: 5 } });
    expect(socket.last("round")?.round).toEqual({ phase: "playing", endsAt: 312 });
    now = 20;
    send(room, socket, { type: "host", action: "resetScores" });
    expect(socket.last("round")?.round).toEqual({ phase: "playing", endsAt: 320 });
    send(room, socket, { type: "host", action: "settings", settings: { ...room.game.settings, roundMinutes: 0 } });
    expect(socket.last("round")?.round).toEqual({ phase: "playing", endsAt: null });
    now = 10000;
    room.advanceTick();
    expect(socket.last("round")?.round).toEqual({ phase: "playing", endsAt: null });
  });

  it("counts cannon salvos and torpedo spreads once per trigger and once per hitting shot", () => {
    let now = 0;
    const room = roomWithoutBots(11, () => now, openWorld, fixtureSites);
    const shooterSocket = connect(room);
    const targetSocket = connect(room);
    join(room, shooterSocket, "Shooter");
    join(room, targetSocket, "Target");
    const shooterId = welcome(shooterSocket).playerId;
    const targetId = welcome(targetSocket).playerId;
    const shooter = room.game.frigates[shooterId]!;
    const target = room.game.frigates[targetId]!;
    Object.assign(shooter, { x: 4800, y: 1500, heading: 0, cannonBearing: 0, cannonRange: 100 });
    Object.assign(target, { x: 4900, y: 1500, heading: 0, spawnProtectedUntil: 0 });

    send(room, shooterSocket, { type: "input", seq: 1, keys: 0, throttle: 0, fireCannon: true, fireTorpedo: false });
    room.advanceTick();
    expect(room.sessions.get(shooterId)?.shots).toBe(1);
    for (let tick = 0; tick < 10; tick += 1) room.advanceTick();
    expect(room.sessions.get(shooterId)?.hits).toBe(1);

    Object.assign(target, { x: 5200, y: 1500, hp: GAME_CONFIG.player.maxHp, spawnProtectedUntil: 0 });
    shooter.torpedoReadyAt = 0;
    send(room, shooterSocket, { type: "input", seq: 2, keys: 0, throttle: 0, fireCannon: false, fireTorpedo: true });
    room.advanceTick();
    const shotId = room.game.torpedoes[0]!.shotId!;
    expect(room.sessions.get(shooterId)?.shots).toBe(2);
    room.game.torpedoes = [0, 1].map((index) => ({
      id: `test-${index}`,
      shotId,
      ownerId: shooterId,
      x: target.x - 20,
      y: target.y,
      angle: 0,
      elapsed: 0.6,
      speed: GAME_CONFIG.torpedo.speed,
    }));
    room.advanceTick();
    expect(target.hp).toBe(GAME_CONFIG.player.maxHp - 2 * GAME_CONFIG.torpedo.damage);
    expect(room.sessions.get(shooterId)?.hits).toBe(2);
  });

  it("includes bots in tied results and returns Draw when all scores tie", () => {
    let now = 0;
    const room = new Room(11, () => now, openWorld, fixtureSites);
    const socket = connect(room);
    join(room, socket, "Harbor");
    for (const session of room.sessions.values()) {
      session.score = 4;
      room.game.scores[session.id]!.score = 4;
    }
    now = 600;
    room.advanceTick();
    const round = socket.last("round")?.round;
    expect(round?.phase).toBe("over");
    if (round?.phase !== "over") return;
    expect(round.winners).toEqual([]);
    expect(round.winnerTeams).toEqual([]);
    expect(round.teamScores).toEqual([4, 4, 4, 0]);
    expect(round.results).toHaveLength(3);
    expect(round.results.map((result) => result.score)).toEqual([4, 4, 4]);
  });

  it("credits a sink caused by the player's own turret", () => {
    let now = 0;
    const room = roomWithoutBots(11, () => now, openWorld, fixtureSites);
    const hostSocket = connect(room);
    const targetSocket = connect(room);
    join(room, hostSocket, "Harbor");
    join(room, targetSocket, "Target");
    const hostId = welcome(hostSocket).playerId;
    const targetId = welcome(targetSocket).playerId;
    const base = room.game.bases.find((candidate) => candidate.kind === "home" && candidate.homeTeam === 0)!;
    const target = room.game.frigates[targetId]!;
    Object.assign(target, { x: base.cityX + 200, y: base.cityY, hp: 10, spawnProtectedUntil: 0 });
    for (let tick = 0; tick < 20 && target.status === "alive"; tick += 1) {
      now += 1 / GAME_CONFIG.network.tickRate;
      room.advanceTick();
    }
    expect(target.status).toBe("sinking");
    expect(room.sessions.get(hostId)?.sinks).toBe(1);
    expect(room.sessions.get(hostId)?.shots).toBe(0);
  });
});
