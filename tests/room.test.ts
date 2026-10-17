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

    const settings = { ...DEFAULT_SETTINGS, boatSpeedPct: 150, cannonReload: 2 };
    send(room, hostSocket, { type: "host", action: "settings", settings });
    expect(room.game.settings).toEqual(settings);
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

  it("omits internal torpedo speed from snapshots", () => {
    const { room } = setup();
    const socket = connect(room);
    join(room, socket, "Harbor");
    room.game.torpedoes.push({
      id: "t1",
      ownerId: welcome(socket).playerId,
      x: 1000,
      y: 4500,
      angle: 0,
      elapsed: 0,
      speed: 120,
    });
    room.advanceTick();
    room.advanceTick();

    const torpedo = socket.last("snapshot")?.torpedoes[0];
    expect(torpedo).toBeDefined();
    expect(torpedo).not.toHaveProperty("speed");
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
