import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { WebSocket } from "ws";
import { GAME_CONFIG } from "../src/shared/config.js";
import type { ClientMessage, ServerMessage } from "../src/shared/protocol.js";
import { DEFAULT_SETTINGS } from "../src/shared/settings.js";
import { Room } from "../src/server/room.js";
import type { World } from "../src/shared/world.js";

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

const openWorld: World = { seed: 11, grid: new Uint8Array(GAME_CONFIG.world.columns * GAME_CONFIG.world.rows) };

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
    });
    expect(room.sessions.get(welcome(sockets[0]!).playerId)?.host).toBe(true);
    expect(welcome(sockets[0]!).settings).toEqual(DEFAULT_SETTINGS);
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
    expect(room.game.settings).toEqual(DEFAULT_SETTINGS);

    const initialSeed = room.game.world.seed;
    const initialWorldMessageCount = hostSocket.messages.filter((message) => message.type === "world").length;
    const settings = { ...DEFAULT_SETTINGS, boatSpeedPct: 150, cannonReload: 2 };
    send(room, hostSocket, { type: "host", action: "settings", settings });
    expect(room.game.settings).toEqual(settings);
    expect(room.game.world.seed).toBe(initialSeed);
    expect(hostSocket.messages.filter((message) => message.type === "world")).toHaveLength(initialWorldMessageCount);
    expect(hostSocket.last("settings")?.settings).toEqual(settings);
    expect(guestSocket.last("settings")?.settings).toEqual(settings);
    expect(guestSocket.messages.some((message) =>
      message.type === "event" && message.event.message === "Host Harbor: boat speed 150%, cannon reload 2 s",
    )).toBe(true);

    const eventCount = hostSocket.messages.filter((message) =>
      message.type === "event" && message.event.message === "Host Harbor: boat speed 150%, cannon reload 2 s",
    ).length;
    send(room, hostSocket, { type: "host", action: "settings", settings });
    expect(hostSocket.messages.filter((message) =>
      message.type === "event" && message.event.message === "Host Harbor: boat speed 150%, cannon reload 2 s",
    )).toHaveLength(eventCount);
  });

  it("regenerates the world when the host changes land coverage", () => {
    const { room } = setup();
    const hostSocket = connect(room);
    join(room, hostSocket, "Harbor");
    const hostId = welcome(hostSocket).playerId;
    room.game.scores[hostId]!.score = 3;
    const initialSeed = room.game.world.seed;
    const settings = { ...DEFAULT_SETTINGS, landCoveragePct: 10 };

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

  it("preserves settings through regeneration, score reset, and host succession", () => {
    const { room, setNow } = setup();
    const hostSocket = connect(room);
    const guestSocket = connect(room);
    join(room, hostSocket, "Harbor");
    setNow(1);
    join(room, guestSocket, "Buoy");
    const settings = { ...DEFAULT_SETTINGS, boatSpeedPct: 150, torpedoReload: 4 };
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
    const { room } = setup();
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

  it("announces a sent torpedo when it ends on land", () => {
    const world: World = { seed: 11, grid: new Uint8Array(openWorld.grid.length) };
    world.grid[225 * GAME_CONFIG.world.columns + 50] = 1;
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
});
