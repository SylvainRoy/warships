import { GAME_CONFIG } from "../shared/config.js";
import { applyFrigateInput, type Frigate } from "../shared/sim.js";
import { DEFAULT_SETTINGS, type GameSettings } from "../shared/settings.js";
import { decodeWorld, createEmptyWorld, mapDimensions, type World } from "../shared/world.js";
import type { ServerMessage } from "../shared/protocol.js";
import { client, type Snapshot } from "./state.js";
import { errorBox, form, joinButton, lobby, nameInput } from "./dom.js";
import {
  audio,
  addFeed,
  effects,
  handleGameEvent,
  hitMarkers,
  hitNumbers,
  incomeNumbers,
  knownPositions,
  ownDamageTimes,
  pendingHitFeed,
  pendingSplashSounds,
  playProjectileSounds,
  recentSinkTimes,
  resetRadarSweep,
} from "./gameEvents.js";
import { pressed } from "./input.js";
import { renderLobby } from "./lobby.js";
import { isOwnHost } from "./menu.js";
import { resetWorldCaches } from "./render/terrain.js";
import { ProjectileStore } from "./projectiles.js";

export const projectileStore = new ProjectileStore();

export function socketAddress(): string {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

export function connect(): void {
  if (client.socket && (client.socket.readyState === WebSocket.OPEN || client.socket.readyState === WebSocket.CONNECTING)) return;
  const connection = new WebSocket(socketAddress());
  client.socket = connection;
  connection.addEventListener("open", () => {
    client.reconnectForLobby = false;
    connection.send(JSON.stringify({ type: "hello" }));
    const token = sessionStorage.getItem("warships.token");
    const rememberedName = nameInput.value.trim() || sessionStorage.getItem("warships.sessionName") || localStorage.getItem("warships.name") || "";
    if (token && rememberedName) {
      nameInput.value = rememberedName;
      connection.send(JSON.stringify({ type: "join", name: rememberedName, token }));
    }
  });
  connection.addEventListener("message", (message) => {
    try {
      const payload = JSON.parse(String(message.data)) as ServerMessage;
      handleMessage(payload);
    } catch (error) {
      console.error(error);
      client.joined = false;
      client.shouldAutoJoin = false;
      sessionStorage.removeItem("warships.token");
      client.ownId = null;
      resetRadarSweep();
      client.world = null;
      client.bases = [];
      client.latestSnapshot = null;
      client.predictedOwn = null;
      client.snapshots = [];
      projectileStore.clear();
      client.renderedProjectiles = { shells: [], torpedoes: [] };
      client.pendingInputs = [];
      pressed.clear();
      lobby.hidden = false;
      errorBox.textContent = "Unable to join: this page doesn't match the server version. Reload the page.";
      connection.close();
    }
  });
  connection.addEventListener("close", (event) => {
    if (client.socket === connection) client.socket = null;
    if (event.code === 4000) showKickedMessage();
    const shouldReconnect = client.joined || client.reconnectForLobby;
    if (client.joined) {
      client.joined = false;
      lobby.hidden = false;
      addFeed("Connection lost · reconnecting");
    }
    if (shouldReconnect) client.reconnectTimer = window.setTimeout(connect, 1000);
  });
  connection.addEventListener("error", () => connection.close());
}

export function worldFromMessage(encoded: number[], columns: number, rows: number, seed = 0): World {
  const tileSize = GAME_CONFIG.world.tileSize;
  return {
    seed,
    columns,
    rows,
    width: columns * tileSize,
    height: rows * tileSize,
    grid: decodeWorld(encoded, columns * rows),
  };
}

export function handleMessage(message: ServerMessage): void {
  if (message.type === "lobby") {
    client.lobbyState = message;
    renderLobby(message);
    if (client.shouldAutoJoin && message.freeSlots > 0 && !client.joined && client.socket?.readyState === WebSocket.OPEN) {
      client.shouldAutoJoin = false;
      sendJoin();
    }
  } else if (message.type === "welcome") {
    client.throttleLevel = 0;
    projectileStore.clear();
    client.renderedProjectiles = { shells: [], torpedoes: [] };
    client.projectileServerTime = 0;
    client.hasServerTimeOffset = false;
    client.ownId = message.playerId;
    client.latestSnapshot = null;
    client.previousResupplying = null;
    client.ownSinking = false;
    for (const splash of pendingSplashSounds) window.clearTimeout(splash.timer);
    pendingSplashSounds.length = 0;
    knownPositions.clear();
    hitMarkers.length = 0;
    hitNumbers.clear();
    incomeNumbers.length = 0;
    pendingHitFeed.length = 0;
    ownDamageTimes.length = 0;
    recentSinkTimes.clear();
    client.gameSettings = { ...message.settings };
    client.round = message.round;
    client.bases = message.bases;
    sessionStorage.setItem("warships.token", message.token);
    sessionStorage.setItem("warships.sessionName", nameInput.value.trim());
    client.world = worldFromMessage(message.world, message.columns, message.rows);
    resetWorldCaches();
    client.joined = true;
    client.shouldAutoJoin = false;
    lobby.hidden = true;
    pressed.clear();
    client.pendingInputs = [];
    client.snapshots = [];
    client.predictedOwn = null;
    client.menuOpen = false;
    client.menuPending = null;
    addFeed("Connected to the battle");
  } else if (message.type === "world") {
    client.throttleLevel = 0;
    incomeNumbers.length = 0;
    client.bases = message.bases;
    client.world = worldFromMessage(message.world, message.columns, message.rows, client.world?.seed ?? 0);
    resetWorldCaches();
    addFeed("World regenerated");
  } else if (message.type === "round") {
    client.round = message.round;
    const round = message.round;
    if (round.phase === "over") {
      const winnerNames = round.winners.map((id) => round.results.find((result) => result.playerId === id)?.name).filter((name): name is string => Boolean(name));
      addFeed(winnerNames.length ? `Round over — ${winnerNames.join(" and ")} ${winnerNames.length === 1 ? "wins" : "win"}` : "Round over — draw");
      if (round.winners.includes(client.ownId ?? "")) audio.play("chime", { own: true });
    }
  } else if (message.type === "settings") {
    client.gameSettings = { ...message.settings };
  } else if (message.type === "snapshot") {
    if (message.bases) {
      const statuses = new Map(message.bases.map((base) => [base.id, base]));
      client.bases = client.bases.map((base) => ({ ...base, ...statuses.get(base.id) }));
    }
    onSnapshot(message);
  } else if (message.type === "projectiles") {
    playProjectileSounds(message);
    projectileStore.apply(message);
  } else if (message.type === "event") {
    const at = performance.now();
    effects.push({ event: message.event, at });
    handleGameEvent(message.event, at);
    if (message.event.message) addFeed(message.event.message);
  } else if (message.type === "error") {
    if (message.code === "kicked") {
      showKickedMessage();
      return;
    }
    const errors: Record<string, string> = {
      name_taken: "That captain name is already in use.",
      full: "Server full · we'll join when a berth opens.",
      invalid_name: "Choose a name between 1 and 16 characters.",
      not_host: "Only the host can use that control.",
      invalid_action: "That action could not be completed.",
    };
    errorBox.textContent = errors[message.code] ?? "Unable to join.";
    if (message.code === "full") client.shouldAutoJoin = true;
    lobby.hidden = false;
  }
}

export function showKickedMessage(): void {
  sessionStorage.removeItem("warships.token");
  client.reconnectForLobby = true;
  client.shouldAutoJoin = false;
  client.joined = false;
  client.ownId = null;
  resetRadarSweep();
  client.world = null;
  client.bases = [];
  client.latestSnapshot = null;
  client.predictedOwn = null;
  client.snapshots = [];
  projectileStore.clear();
  client.renderedProjectiles = { shells: [], torpedoes: [] };
  client.projectileServerTime = 0;
  client.hasServerTimeOffset = false;
  client.pendingInputs = [];
  pressed.clear();
  client.tabHeld = false;
  client.cannonFirePending = false;
  client.torpedoFirePending = false;
  client.menuOpen = false;
  client.menuPending = null;
  errorBox.textContent = "You were removed from the battle by the host.";
  lobby.hidden = false;
}

export function sendJoin(): void {
  client.throttleLevel = 0;
  const name = nameInput.value.trim();
  errorBox.textContent = "";
  if (name.length < 1 || name.length > 16) {
    errorBox.textContent = "Choose a name between 1 and 16 characters.";
    return;
  }
  localStorage.setItem("warships.name", name);
  sessionStorage.setItem("warships.sessionName", name);
  if (client.socket?.readyState === WebSocket.OPEN) {
    const token = sessionStorage.getItem("warships.token");
    client.socket.send(JSON.stringify({ type: "join", name, ...(token ? { token } : {}) }));
  } else {
    connect();
  }
}

export function onSnapshot(snapshot: Snapshot): void {
  const snapshotWithBases: Snapshot = snapshot.bases
    ? snapshot
    : {
        ...snapshot,
        bases: client.latestSnapshot?.bases ?? client.bases.map(({
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
          captureProgress,
          turret,
          turretHp,
          repairBy,
          repairProgress,
        })),
      };
  client.latestSnapshot = snapshotWithBases;
  if (!isOwnHost() && client.menuPending && client.menuPending.action !== "controls" && client.menuPending.action !== "effects") client.menuPending = null;
  const receivedAt = performance.now();
  client.serverTimeOffset = snapshotWithBases.serverTime - receivedAt / 1000;
  client.hasServerTimeOffset = true;
  client.snapshots.push({ receivedAt, value: snapshotWithBases });
  client.snapshots = client.snapshots.slice(-6);
  const own = snapshotWithBases.frigates.find((frigate) => frigate.playerId === client.ownId) as Frigate | undefined;
  for (const frigate of snapshotWithBases.frigates) {
    knownPositions.set(frigate.playerId, { x: frigate.x, y: frigate.y });
  }
  if (own) {
    client.ownSinking = own.status !== "alive";
    if (typeof own.resupplying === "boolean") {
      if (client.previousResupplying === true && !own.resupplying) audio.play("chime", { own: true });
      client.previousResupplying = own.resupplying;
    }
    if (own.status === "alive" && client.radarOwnStatus !== null && client.radarOwnStatus !== "alive") resetRadarSweep();
    client.radarOwnStatus = own.status;
    if (own.status !== "alive") client.throttleLevel = 0;
    const acknowledgedAt = client.pendingInputs.find((entry) => entry.input.seq === snapshotWithBases.ackSeq)?.sentAt;
    if (acknowledgedAt !== undefined) {
      client.ping = performance.now() - acknowledgedAt;
      client.lastPingAt = performance.now();
    }
    client.pendingInputs = client.pendingInputs.filter((entry) => entry.input.seq > snapshot.ackSeq);
    client.predictedOwn = { ...own };
    let localTime = performance.now() / 1000 + client.serverTimeOffset;
    for (const pending of client.pendingInputs) {
      client.predictedOwn = applyFrigateInput(
        client.predictedOwn,
        pending.input,
        1 / GAME_CONFIG.network.tickRate,
        client.world ?? createEmptyWorld(mapDimensions(client.gameSettings.mapSize)),
        localTime,
        client.gameSettings,
      );
      localTime += 1 / GAME_CONFIG.network.tickRate;
    }
  }
}

export function sendHost(action: "regenerate" | "resetScores"): void;

export function sendHost(action: "kick", target: string): void;

export function sendHost(action: "settings", settings: GameSettings): void;

export function sendHost(
  action: "regenerate" | "resetScores" | "kick" | "settings",
  value?: string | GameSettings,
): void {
  if (!client.socket || client.socket.readyState !== WebSocket.OPEN) return;
  const message = action === "kick"
    ? { type: "host", action, target: value as string }
    : action === "settings"
      ? { type: "host", action, settings: value as GameSettings }
      : { type: "host", action };
  client.socket.send(JSON.stringify(message));
}

export function registerNetListeners(): void {
form.addEventListener("submit", (event) => {
  event.preventDefault();
  audio.resumeOnGesture();
  client.shouldAutoJoin = true;
  sendJoin();
});

joinButton.addEventListener("click", () => audio.resumeOnGesture());
}
