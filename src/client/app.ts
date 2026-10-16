import { GAME_CONFIG } from "../shared/config.js";
import { INPUT_KEYS, applyFrigateInput, type Frigate, type FrigateInput, type GameEvent, type Shell, type Torpedo } from "../shared/sim.js";
import { decodeWorld, isLandAt, type World } from "../shared/world.js";
import type { LobbyMessage, ServerMessage, SnapshotFrigate } from "../shared/protocol.js";

type Snapshot = Extract<ServerMessage, { type: "snapshot" }>;
type StoredSnapshot = { receivedAt: number; value: Snapshot };
type PendingInput = { input: FrigateInput; sentAt: number };

declare global {
  interface Window {
    __warships: Readonly<{
      ownId: string | null;
      latestSnapshot: Readonly<Snapshot> | null;
      predictedOwnFrigate: Readonly<Frigate> | null;
    }>;
  }
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Game page is missing ${selector}`);
  return element;
}

const canvasElement = requireElement<HTMLCanvasElement>("#game");
const lobby = requireElement<HTMLElement>("#lobby");
const form = requireElement<HTMLFormElement>("#join-form");
const nameInput = requireElement<HTMLInputElement>("#player-name");
const joinButton = requireElement<HTMLButtonElement>("#join-button");
const errorBox = requireElement<HTMLElement>("#lobby-error");
const roster = requireElement<HTMLUListElement>("#lobby-players");
const freeSlots = requireElement<HTMLElement>("#free-slots");
const fullNote = requireElement<HTMLElement>("#server-full");
const context = canvasElement.getContext("2d", { alpha: false });
if (!context) throw new Error("Canvas 2D is unavailable");
const ctx = context;

const colours = ["#4b9bff", "#ff6266", "#f3c94e", "#c084fc"];
const pressed = new Set<string>();
const worldCache = new Map<string, HTMLCanvasElement>();
let worldCacheResolution = 0;
const wakeTrails = new Map<string, Array<{ x: number; y: number; at: number }>>();
const effects: Array<{ event: GameEvent; at: number }> = [];
const feed: Array<{ text: string; at: number }> = [];
let socket: WebSocket | null = null;
let world: World | null = null;
let ownId: string | null = null;
let latestSnapshot: Snapshot | null = null;
let predictedOwn: Frigate | null = null;
let snapshots: StoredSnapshot[] = [];
let pendingInputs: PendingInput[] = [];
let sequence = 0;
let throttleLevel = 0;
let lobbyState: LobbyMessage | null = null;
let shouldAutoJoin = false;
let joined = false;
let tabHeld = false;
let hostMenuOpen = false;
let debugVisible = false;
let cannonFirePending = false;
let torpedoFirePending = false;
let lastTickAt = performance.now();
let accumulator = 0;
let lastFrameAt = performance.now();
let fps = 0;
let fpsFrames = 0;
let fpsStartedAt = performance.now();
let ping = 0;
let lastPingAt = 0;
let serverTimeOffset = 0;
let reconnectTimer: number | undefined;
let reconnectForLobby = false;

Object.defineProperty(window, "__warships", {
  configurable: false,
  enumerable: false,
  get: () => Object.freeze({
    ownId,
    latestSnapshot: latestSnapshot ? deepFreeze(structuredClone(latestSnapshot)) : null,
    predictedOwnFrigate: predictedOwn ? deepFreeze({ ...predictedOwn }) : null,
  }),
});

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value as Readonly<T>;
}

nameInput.value = sessionStorage.getItem("warships.sessionName") ?? localStorage.getItem("warships.name") ?? "";

function socketAddress(): string {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

function connect(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  const connection = new WebSocket(socketAddress());
  socket = connection;
  connection.addEventListener("open", () => {
    reconnectForLobby = false;
    connection.send(JSON.stringify({ type: "hello" }));
    const token = sessionStorage.getItem("warships.token");
    const rememberedName = nameInput.value.trim() || sessionStorage.getItem("warships.sessionName") || localStorage.getItem("warships.name") || "";
    if (token && rememberedName) {
      nameInput.value = rememberedName;
      connection.send(JSON.stringify({ type: "join", name: rememberedName, token }));
    }
  });
  connection.addEventListener("message", (message) => {
    let payload: ServerMessage;
    try {
      payload = JSON.parse(String(message.data)) as ServerMessage;
    } catch {
      return;
    }
    handleMessage(payload);
  });
  connection.addEventListener("close", (event) => {
    if (socket === connection) socket = null;
    if (event.code === 4000) showKickedMessage();
    const shouldReconnect = joined || reconnectForLobby;
    if (joined) {
      joined = false;
      lobby.hidden = false;
      addFeed("Connection lost · reconnecting");
    }
    if (shouldReconnect) reconnectTimer = window.setTimeout(connect, 1000);
  });
  connection.addEventListener("error", () => connection.close());
}

function handleMessage(message: ServerMessage): void {
  if (message.type === "lobby") {
    lobbyState = message;
    renderLobby(message);
    if (shouldAutoJoin && message.freeSlots > 0 && !joined && socket?.readyState === WebSocket.OPEN) {
      shouldAutoJoin = false;
      sendJoin();
    }
  } else if (message.type === "welcome") {
    throttleLevel = 0;
    ownId = message.playerId;
    sessionStorage.setItem("warships.token", message.token);
    sessionStorage.setItem("warships.sessionName", nameInput.value.trim());
    world = { seed: 0, grid: decodeWorld(message.world) };
    worldCache.clear();
    joined = true;
    shouldAutoJoin = false;
    lobby.hidden = true;
    pressed.clear();
    pendingInputs = [];
    snapshots = [];
    predictedOwn = null;
    addFeed("Connected to the battle");
  } else if (message.type === "world") {
    throttleLevel = 0;
    if (world) world = { ...world, grid: decodeWorld(message.world) };
    worldCache.clear();
    addFeed("World regenerated");
  } else if (message.type === "snapshot") {
    onSnapshot(message);
  } else if (message.type === "event") {
    effects.push({ event: message.event, at: performance.now() });
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
    if (message.code === "full") shouldAutoJoin = true;
    lobby.hidden = false;
  }
}

function showKickedMessage(): void {
  sessionStorage.removeItem("warships.token");
  reconnectForLobby = true;
  shouldAutoJoin = false;
  joined = false;
  ownId = null;
  world = null;
  latestSnapshot = null;
  predictedOwn = null;
  snapshots = [];
  pendingInputs = [];
  pressed.clear();
  tabHeld = false;
  cannonFirePending = false;
  torpedoFirePending = false;
  hostMenuOpen = false;
  errorBox.textContent = "You were removed from the battle by the host.";
  lobby.hidden = false;
}

function renderLobby(state: LobbyMessage): void {
  if (!joined) lobby.hidden = false;
  freeSlots.textContent = `${state.freeSlots} BERTH${state.freeSlots === 1 ? "" : "S"} FREE`;
  fullNote.hidden = !state.full;
  joinButton.disabled = state.full;
  roster.replaceChildren();
  for (const player of state.players) {
    const line = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.backgroundColor = colours[player.slot - 1] ?? "#fff";
    const name = document.createElement("span");
    name.textContent = player.name;
    const meta = document.createElement("span");
    meta.className = "player-meta";
    meta.textContent = `${player.host ? "♛ HOST · " : ""}${player.connected ? "ONLINE" : "RECONNECTING"}`;
    line.append(dot, name, meta);
    roster.append(line);
  }
  if (shouldAutoJoin && state.freeSlots > 0 && !joined) {
    shouldAutoJoin = false;
    sendJoin();
  }
}

function sendJoin(): void {
  throttleLevel = 0;
  const name = nameInput.value.trim();
  errorBox.textContent = "";
  if (name.length < 1 || name.length > 16) {
    errorBox.textContent = "Choose a name between 1 and 16 characters.";
    return;
  }
  localStorage.setItem("warships.name", name);
  sessionStorage.setItem("warships.sessionName", name);
  if (socket?.readyState === WebSocket.OPEN) {
    const token = sessionStorage.getItem("warships.token");
    socket.send(JSON.stringify({ type: "join", name, ...(token ? { token } : {}) }));
  } else {
    connect();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  shouldAutoJoin = true;
  sendJoin();
});

const bindingToKey: Record<string, number> = {
  KeyA: INPUT_KEYS.turnLeft,
  KeyD: INPUT_KEYS.turnRight,
  ArrowLeft: INPUT_KEYS.cannonLeft,
  ArrowRight: INPUT_KEYS.cannonRight,
  ArrowUp: INPUT_KEYS.rangeUp,
  ArrowDown: INPUT_KEYS.rangeDown,
  BracketLeft: INPUT_KEYS.torpedoLeft,
  BracketRight: INPUT_KEYS.torpedoRight,
};
const gameCodes = new Set([
  ...Object.keys(bindingToKey),
  "KeyW", "KeyS", "ShiftRight", "Backslash", "IntlBackslash", "Tab", "Escape", "F3",
]);

window.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (gameCodes.has(event.code) && !isTyping && joined) event.preventDefault();
  if (!joined || isTyping || !gameCodes.has(event.code)) return;
  if (event.code === "F3" && !event.repeat) {
    debugVisible = !debugVisible;
    return;
  }
  if (event.code === "Tab") {
    tabHeld = true;
    return;
  }
  if (event.code === "Escape" && !event.repeat) {
    if (latestSnapshot?.players.find((player) => player.playerId === ownId)?.host) hostMenuOpen = !hostMenuOpen;
    return;
  }
  if (event.repeat) return;
  if (event.code === "KeyW") {
    throttleLevel = Math.min(3, throttleLevel + 1);
    return;
  }
  if (event.code === "KeyS") {
    throttleLevel = Math.max(-1, throttleLevel - 1);
    return;
  }
  if (event.code === "ShiftRight") cannonFirePending = true;
  if (event.code === "Backslash" || event.code === "IntlBackslash") torpedoFirePending = true;
  pressed.add(event.code);
});

window.addEventListener("keyup", (event) => {
  if (gameCodes.has(event.code) && joined) event.preventDefault();
  pressed.delete(event.code);
  if (event.code === "Tab") tabHeld = false;
});

function clearPressedAndSendNeutral(): void {
  pressed.clear();
  tabHeld = false;
  cannonFirePending = false;
  torpedoFirePending = false;
  if (!joined || socket?.readyState !== WebSocket.OPEN) return;
  const input = nextInput();
  pendingInputs.push({ input, sentAt: performance.now() });
  socket.send(JSON.stringify({ type: "input", ...input }));
}

window.addEventListener("blur", clearPressedAndSendNeutral);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearPressedAndSendNeutral();
});

function onSnapshot(snapshot: Snapshot): void {
  latestSnapshot = snapshot;
  const receivedAt = performance.now();
  serverTimeOffset = snapshot.serverTime - receivedAt / 1000;
  snapshots.push({ receivedAt, value: snapshot });
  snapshots = snapshots.slice(-6);
  const own = snapshot.frigates.find((frigate) => frigate.playerId === ownId) as Frigate | undefined;
  if (own) {
    if (own.status !== "alive") throttleLevel = 0;
    const acknowledgedAt = pendingInputs.find((entry) => entry.input.seq === snapshot.ackSeq)?.sentAt;
    if (acknowledgedAt !== undefined) {
      ping = performance.now() - acknowledgedAt;
      lastPingAt = performance.now();
    }
    pendingInputs = pendingInputs.filter((entry) => entry.input.seq > snapshot.ackSeq);
    predictedOwn = { ...own };
    let localTime = performance.now() / 1000 + serverTimeOffset;
    for (const pending of pendingInputs) {
      predictedOwn = applyFrigateInput(
        predictedOwn,
        pending.input,
        1 / GAME_CONFIG.network.tickRate,
        world ?? { seed: 0, grid: new Uint8Array(800 * 450) },
        localTime,
      );
      localTime += 1 / GAME_CONFIG.network.tickRate;
    }
  }
}

function nextInput(): FrigateInput {
  let keys = 0;
  for (const [code, bit] of Object.entries(bindingToKey)) if (pressed.has(code)) keys |= bit;
  return {
    seq: ++sequence,
    keys,
    throttle: throttleLevel,
    fireCannon: cannonFirePending,
    fireTorpedo: torpedoFirePending,
  };
}

function simulationTick(): void {
  if (!joined || socket?.readyState !== WebSocket.OPEN || !world) {
    cannonFirePending = false;
    torpedoFirePending = false;
    return;
  }
  const input = nextInput();
  cannonFirePending = false;
  torpedoFirePending = false;
  if (predictedOwn) predictedOwn = applyFrigateInput(predictedOwn, input, 1 / GAME_CONFIG.network.tickRate, world, performance.now() / 1000 + serverTimeOffset);
  pendingInputs.push({ input, sentAt: performance.now() });
  socket.send(JSON.stringify({ type: "input", ...input }));
}

function getRenderSnapshot(): Snapshot | null {
  if (snapshots.length === 0) return latestSnapshot;
  const targetTime = performance.now() - GAME_CONFIG.network.interpolationDelay * 1000;
  let before = snapshots[0];
  let after = snapshots[snapshots.length - 1];
  for (let i = 1; i < snapshots.length; i += 1) {
    const candidate = snapshots[i];
    if (candidate && candidate.receivedAt >= targetTime) {
      after = candidate;
      before = snapshots[i - 1] ?? candidate;
      break;
    }
  }
  if (!before || !after || before === after) return latestSnapshot;
  const fraction = Math.max(0, Math.min(1, (targetTime - before.receivedAt) / (after.receivedAt - before.receivedAt)));
  const later = after.value;
  const frigates = later.frigates.map((item) => {
    if (item.playerId === ownId) return predictedOwn ?? item;
    const earlier = before?.value.frigates.find((candidate) => candidate.playerId === item.playerId);
    if (!earlier) return item;
    return {
      ...item,
      x: earlier.x + (item.x - earlier.x) * fraction,
      y: earlier.y + (item.y - earlier.y) * fraction,
      heading: interpolateAngle(earlier.heading, item.heading, fraction),
    };
  });
  return {
    ...later,
    frigates,
    shells: interpolateProjectiles(before.value.shells, later.shells, fraction, "shell"),
    torpedoes: interpolateProjectiles(before.value.torpedoes, later.torpedoes, fraction, "torpedo"),
  };
}

function interpolateAngle(first: number, second: number, amount: number): number {
  const delta = Math.atan2(Math.sin(second - first), Math.cos(second - first));
  return first + delta * amount;
}

function interpolateProjectiles<T extends Shell | Torpedo>(
  older: T[],
  newer: T[],
  amount: number,
  kind: "shell" | "torpedo",
): T[] {
  const prior = new Map(older.map((projectile) => [projectile.id, projectile]));
  return newer.map((projectile) => {
    const previous = prior.get(projectile.id);
    if (!previous) return projectile;
    if (kind === "shell") {
      const shell = projectile as Shell;
      const oldShell = previous as Shell;
      return { ...shell, elapsed: oldShell.elapsed + (shell.elapsed - oldShell.elapsed) * amount } as T;
    }
    const torpedo = projectile as Torpedo;
    const oldTorpedo = previous as Torpedo;
    return {
      ...torpedo,
      x: oldTorpedo.x + (torpedo.x - oldTorpedo.x) * amount,
      y: oldTorpedo.y + (torpedo.y - oldTorpedo.y) * amount,
    } as T;
  });
}

function resizeCanvas(): { width: number; height: number; scale: number; offsetX: number; offsetY: number; dpr: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (canvasElement.width !== Math.round(width * dpr) || canvasElement.height !== Math.round(height * dpr)) {
    canvasElement.width = Math.round(width * dpr);
    canvasElement.height = Math.round(height * dpr);
  }
  const scale = Math.min(width / GAME_CONFIG.screen.width, height / GAME_CONFIG.screen.height);
  return {
    width, height, scale, dpr,
    offsetX: (width - GAME_CONFIG.screen.width * scale) / 2,
    offsetY: (height - GAME_CONFIG.screen.height * scale) / 2,
  };
}

function renderTerrain(worldState: World, cameraX: number, cameraY: number, scale: number, dpr: number): void {
  const chunkSize = 800;
  const resolution = Math.max(1, Math.min(2, scale * dpr));
  if (resolution !== worldCacheResolution) {
    worldCache.clear();
    worldCacheResolution = resolution;
  }
  const firstChunkX = Math.floor(cameraX / chunkSize);
  const lastChunkX = Math.floor((cameraX + GAME_CONFIG.screen.width) / chunkSize);
  const firstChunkY = Math.floor(cameraY / chunkSize);
  const lastChunkY = Math.floor((cameraY + GAME_CONFIG.screen.height) / chunkSize);
  ctx.fillStyle = "#0c3445";
  ctx.fillRect(cameraX, cameraY, GAME_CONFIG.screen.width, GAME_CONFIG.screen.height);
  for (let cy = firstChunkY; cy <= lastChunkY; cy += 1) {
    for (let cx = firstChunkX; cx <= lastChunkX; cx += 1) {
      const key = `${worldState.seed}:${cx}:${cy}:${resolution}`;
      let chunk = worldCache.get(key);
      if (!chunk) {
        chunk = buildTerrainChunk(worldState, cx, cy, resolution);
        worldCache.set(key, chunk);
      }
      ctx.drawImage(chunk, cx * chunkSize, cy * chunkSize, chunkSize, chunkSize);
    }
  }
}

function buildTerrainChunk(worldState: World, chunkX: number, chunkY: number, resolution: number): HTMLCanvasElement {
  const chunk = document.createElement("canvas");
  chunk.width = 800 * resolution;
  chunk.height = 800 * resolution;
  const terrain = chunk.getContext("2d", { alpha: false });
  if (!terrain) return chunk;
  terrain.scale(resolution, resolution);
  terrain.fillStyle = "#103e4d";
  terrain.fillRect(0, 0, 800, 800);
  const landCases: string[][][] = [
    [],
    [["tl", "t", "l"]],
    [["tr", "r", "t"]],
    [["tl", "tr", "r", "l"]],
    [["br", "b", "r"]],
    [["tl", "t", "l"], ["br", "b", "r"]],
    [["tr", "br", "b", "t"]],
    [["tl", "tr", "br", "b", "l"]],
    [["bl", "l", "b"]],
    [["tl", "t", "b", "bl"]],
    [["tr", "r", "t"], ["bl", "l", "b"]],
    [["tl", "tr", "r", "b", "bl", "l"]],
    [["bl", "br", "r", "l"]],
    [["tl", "t", "r", "br", "bl", "l"]],
    [["t", "tr", "br", "bl", "l"]],
    [["tl", "tr", "br", "bl"]],
  ];
  const tile = GAME_CONFIG.world.tileSize;
  const startColumn = Math.max(0, chunkX * 40 - 1);
  const endColumn = Math.min(GAME_CONFIG.world.columns - 2, chunkX * 40 + 39);
  const startRow = Math.max(0, chunkY * 40 - 1);
  const endRow = Math.min(GAME_CONFIG.world.rows - 2, chunkY * 40 + 39);
  terrain.fillStyle = "#c5b58b";
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      const topLeft = isLandAt(worldState, column * tile + tile / 2, row * tile + tile / 2);
      const topRight = isLandAt(worldState, (column + 1) * tile + tile / 2, row * tile + tile / 2);
      const bottomRight = isLandAt(worldState, (column + 1) * tile + tile / 2, (row + 1) * tile + tile / 2);
      const bottomLeft = isLandAt(worldState, column * tile + tile / 2, (row + 1) * tile + tile / 2);
      const code = Number(topLeft) | (Number(topRight) << 1) | (Number(bottomRight) << 2) | (Number(bottomLeft) << 3);
      const polygons = landCases[code] ?? [];
      if (polygons.length === 0) continue;
      const x = column * tile - chunkX * 800;
      const y = row * tile - chunkY * 800;
      const points: Record<string, [number, number]> = {
        tl: [x, y],
        t: [x + tile / 2, y],
        tr: [x + tile, y],
        r: [x + tile, y + tile / 2],
        br: [x + tile, y + tile],
        b: [x + tile / 2, y + tile],
        bl: [x, y + tile],
        l: [x, y + tile / 2],
      };
      for (const polygon of polygons) {
        const firstKey = polygon[0];
        const first = firstKey ? points[firstKey] : undefined;
        if (!first) continue;
        terrain.beginPath();
        terrain.moveTo(first[0], first[1]);
        for (const key of polygon.slice(1)) {
          const point = points[key];
          if (point) terrain.lineTo(point[0], point[1]);
        }
        terrain.closePath();
        terrain.fill();
      }
    }
  }
  return chunk;
}

function cameraFor(frigate: Frigate): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(GAME_CONFIG.world.width - GAME_CONFIG.screen.width, frigate.x - GAME_CONFIG.screen.width / 2)),
    y: Math.max(0, Math.min(GAME_CONFIG.world.height - GAME_CONFIG.screen.height, frigate.y - GAME_CONFIG.screen.height / 2)),
  };
}

function drawWake(frigate: SnapshotFrigate, now: number): void {
  const history = wakeTrails.get(frigate.playerId) ?? [];
  const last = history[history.length - 1];
  if (!last || Math.hypot(frigate.x - last.x, frigate.y - last.y) > 1) {
    history.push({ x: frigate.x, y: frigate.y, at: now });
  }
  while (history.length > 0 && now - (history[0]?.at ?? now) > 1.3) history.shift();
  wakeTrails.set(frigate.playerId, history);
  if (history.length < 2) return;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 7]);
  ctx.strokeStyle = "rgba(222, 246, 248, .36)";
  ctx.beginPath();
  history.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawFrigate(frigate: SnapshotFrigate, now: number, debug: boolean): void {
  if (frigate.status === "waiting") return;
  drawWake(frigate, now);
  if (frigate.status === "alive" && now < frigate.spawnProtectedUntil && Math.floor(now * 8) % 2 === 0) return;
  const sinkingProgress = frigate.status === "sinking"
    ? Math.min(1, (now - frigate.sinkingStartedAt) / GAME_CONFIG.player.sinkAnimation)
    : 0;
  const color = colours[frigate.slot - 1] ?? "#d6e9ee";
  ctx.save();
  ctx.translate(frigate.x, frigate.y);
  ctx.rotate(frigate.heading);
  ctx.globalAlpha = 1 - sinkingProgress * 0.8;
  ctx.fillStyle = "rgba(0, 12, 19, .38)";
  ctx.beginPath();
  ctx.ellipse(-2, 3, 31, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = frigate.status === "sinking" ? "#58646a" : color;
  ctx.strokeStyle = "#e9f7f6";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(32, 0);
  ctx.lineTo(20, -8);
  ctx.lineTo(-23, -9);
  ctx.lineTo(-29, -5);
  ctx.lineTo(-29, 5);
  ctx.lineTo(-23, 9);
  ctx.lineTo(20, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(10, 35, 45, .72)";
  ctx.fillRect(-14, -5, 16, 10);
  ctx.fillStyle = "rgba(242, 250, 242, .85)";
  ctx.fillRect(5, -2, 8, 4);
  if (debug) {
    ctx.strokeStyle = "#ff4d63";
    ctx.lineWidth = 1;
    ctx.strokeRect(-30, -10, 60, 20);
    ctx.strokeStyle = "#faeb68";
    for (const offset of GAME_CONFIG.frigate.collisionCircleOffsets) {
      ctx.beginPath();
      ctx.arc(offset, 0, GAME_CONFIG.frigate.hitCircleRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#f3f9f7";
  ctx.font = "600 13px Manrope, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(frigate.name, frigate.x, frigate.y - 19);
  ctx.fillStyle = "rgba(5, 20, 25, .78)";
  ctx.fillRect(frigate.x - 21, frigate.y + 16, 42, 4);
  ctx.fillStyle = frigate.hp > 35 ? "#62d3b2" : "#ff776c";
  ctx.fillRect(frigate.x - 21, frigate.y + 16, 42 * Math.max(0, frigate.hp / GAME_CONFIG.player.maxHp), 4);
}

function drawShell(shell: Shell): void {
  const progress = Math.max(0, Math.min(1, shell.elapsed / shell.duration));
  const x = shell.startX + (shell.impactX - shell.startX) * progress;
  const y = shell.startY + (shell.impactY - shell.startY) * progress;
  const height = Math.sin(progress * Math.PI) * 48;
  const size = 2.2 + Math.sin(progress * Math.PI) * 2.5;
  ctx.fillStyle = "rgba(0, 11, 17, .3)";
  ctx.beginPath();
  ctx.ellipse(x, y + 4, size * 1.5, size * .8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff4c4";
  ctx.beginPath();
  ctx.arc(x, y - height, size, 0, Math.PI * 2);
  ctx.fill();
}

function drawTorpedo(torpedo: Torpedo): void {
  ctx.save();
  ctx.translate(torpedo.x, torpedo.y);
  ctx.rotate(torpedo.angle);
  ctx.fillStyle = "#e8f6e9";
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-5, -3);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-5, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawExplosion(effect: { event: GameEvent; at: number }, now: number): void {
  const event = effect.event;
  if (event.type !== "explosion" || event.x === undefined || event.y === undefined) return;
  const age = (now - effect.at) / 1000;
  const duration = event.kind === "splash" ? 0.7 : 0.45;
  if (age > duration) return;
  const progress = age / duration;
  const radius = event.kind === "hit" ? 9 + progress * 27 : 5 + progress * 38;
  ctx.globalAlpha = 1 - progress;
  ctx.strokeStyle = event.kind === "splash" ? "#b9f0ed" : "#ffd277";
  ctx.lineWidth = 3 - progress * 2;
  ctx.beginPath();
  ctx.arc(event.x, event.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawReticle(frigate: Frigate, now: number): void {
  if (frigate.playerId !== ownId || frigate.status !== "alive") return;
  const angle = frigate.heading + frigate.cannonBearing;
  const x = frigate.x + Math.cos(angle) * frigate.cannonRange;
  const y = frigate.y + Math.sin(angle) * frigate.cannonRange;
  const reloading = Math.max(0, frigate.cannonReadyAt - now);
  const progress = 1 - reloading / GAME_CONFIG.cannon.reload;
  ctx.save();
  ctx.globalAlpha = reloading > 0 ? .35 : .95;
  ctx.strokeStyle = "#5dffac";
  ctx.fillStyle = "#5dffac";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(x, y, GAME_CONFIG.cannon.damageRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 2.5, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i += 1) {
    const a = i * Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 45, y + Math.sin(a) * 45);
    ctx.lineTo(x + Math.cos(a) * 55, y + Math.sin(a) * 55);
    ctx.stroke();
  }
  if (reloading > 0) {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, GAME_CONFIG.cannon.damageRadius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
  }
  const torpedoAngle = frigate.heading + frigate.torpedoBearing;
  const arrowX = frigate.x + Math.cos(torpedoAngle) * 50;
  const arrowY = frigate.y + Math.sin(torpedoAngle) * 50;
  const torpedoReload = Math.max(0, frigate.torpedoReadyAt - now);
  const torpedoProgress = 1 - torpedoReload / GAME_CONFIG.torpedo.reload;
  ctx.globalAlpha = torpedoReload > 0 ? .35 : .95;
  ctx.strokeStyle = "#7dff70";
  ctx.fillStyle = "#7dff70";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(frigate.x, frigate.y, 50, torpedoAngle - .3, torpedoAngle + .3);
  ctx.stroke();
  const arrowHeadLength = 14;
  const arrowHeadHalfWidth = 5;
  const arrowTipX = arrowX + Math.cos(torpedoAngle) * arrowHeadLength / 2;
  const arrowTipY = arrowY + Math.sin(torpedoAngle) * arrowHeadLength / 2;
  const arrowBaseX = arrowX - Math.cos(torpedoAngle) * arrowHeadLength / 2;
  const arrowBaseY = arrowY - Math.sin(torpedoAngle) * arrowHeadLength / 2;
  const arrowSideX = -Math.sin(torpedoAngle) * arrowHeadHalfWidth;
  const arrowSideY = Math.cos(torpedoAngle) * arrowHeadHalfWidth;
  ctx.beginPath();
  ctx.moveTo(arrowTipX, arrowTipY);
  ctx.lineTo(arrowBaseX + arrowSideX, arrowBaseY + arrowSideY);
  ctx.lineTo(arrowBaseX - arrowSideX, arrowBaseY - arrowSideY);
  ctx.closePath();
  ctx.fill();
  if (torpedoReload > 0) {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(frigate.x, frigate.y, 58, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * torpedoProgress);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHud(snapshot: Snapshot, frigate: Frigate | undefined, now: number, logicalWidth: number, logicalHeight: number): void {
  ctx.save();
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(5, 20, 29, .72)";
  ctx.fillRect(logicalWidth - 250, 20, 230, Math.min(235, 54 + snapshot.players.length * 34));
  ctx.fillStyle = "#88a7b0";
  ctx.font = "500 10px DM Mono, monospace";
  ctx.fillText("CAPTAINS", logicalWidth - 232, 31);
  snapshot.players.slice().sort((a, b) => a.slot - b.slot).forEach((player, index) => {
    const y = 52 + index * 34;
    const own = player.playerId === ownId;
    if (own) {
      ctx.fillStyle = "rgba(100, 223, 202, .12)";
      ctx.fillRect(logicalWidth - 240, y - 5, 210, 29);
    }
    ctx.fillStyle = colours[player.slot - 1] ?? "#fff";
    ctx.beginPath();
    ctx.arc(logicalWidth - 226, y + 5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = own ? "#f0fffa" : "#d7e5e9";
    ctx.font = `${own ? 700 : 500} 12px Manrope, sans-serif`;
    ctx.fillText(`${player.host ? "♛ " : ""}${player.name}`, logicalWidth - 215, y - 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#b7cbd0";
    ctx.font = "500 11px DM Mono, monospace";
    ctx.fillText(`${player.score}  ·  ${player.sunk}`, logicalWidth - 32, y);
    ctx.textAlign = "left";
  });
  if (frigate) {
    ctx.fillStyle = "rgba(5, 20, 29, .78)";
    ctx.fillRect(20, logicalHeight - 130, 380, 110);
    ctx.fillStyle = "#90a8b0";
    ctx.font = "500 10px DM Mono, monospace";
    ctx.fillText("HULL INTEGRITY", 34, logicalHeight - 116);
    ctx.fillStyle = "rgba(215, 237, 238, .17)";
    ctx.fillRect(34, logicalHeight - 96, 248, 7);
    ctx.fillStyle = frigate.hp > 35 ? "#62d3b2" : "#ff776c";
    ctx.fillRect(34, logicalHeight - 96, 248 * Math.max(0, frigate.hp / GAME_CONFIG.player.maxHp), 7);
    ctx.fillStyle = "#e8f4f4";
    ctx.font = "600 11px DM Mono, monospace";
    ctx.fillText(`${frigate.hp} HP`, 34, logicalHeight - 81);
    ctx.fillStyle = "#91a8ae";
    ctx.fillText(`CANNON ${Math.max(0, frigate.cannonReadyAt - now).toFixed(1)}s`, 111, logicalHeight - 81);
    ctx.fillText(`TORPEDO ${Math.max(0, frigate.torpedoReadyAt - now).toFixed(1)}s`, 211, logicalHeight - 81);
    ctx.fillStyle = "#90a8b0";
    ctx.font = "500 10px DM Mono, monospace";
    ctx.textBaseline = "middle";
    ctx.fillText("THROTTLE", 34, logicalHeight - 58);
    const steps = ["ASTERN", "STOP", "1/3", "2/3", "FULL"];
    const activeStep = throttleLevel + 1;
    const stepX = 108;
    const stepY = logicalHeight - 69;
    const stepWidth = 52;
    const stepGap = 4;
    const stepHeight = 22;
    ctx.textAlign = "center";
    steps.forEach((label, index) => {
      const x = stepX + index * (stepWidth + stepGap);
      ctx.fillStyle = index === activeStep ? "rgba(100, 223, 202, .3)" : "rgba(215, 237, 238, .08)";
      ctx.fillRect(x, stepY, stepWidth, stepHeight);
      ctx.fillStyle = index === activeStep ? "#bfffee" : "#91a8ae";
      ctx.font = "600 10px DM Mono, monospace";
      ctx.fillText(label, x + stepWidth / 2, stepY + stepHeight / 2);
    });
    const throttleLabels = ["FULL ASTERN", "STOP", "1/3 AHEAD", "2/3 AHEAD", "FULL AHEAD"];
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#d7e5e9";
    ctx.font = "600 11px DM Mono, monospace";
    ctx.fillText(throttleLabels[activeStep] ?? "STOP", 34, logicalHeight - 36);
    ctx.textBaseline = "top";
  }
  const feedNow = performance.now();
  const visibleFeed = feed.filter((entry) => feedNow - entry.at < 5000).slice(-5);
  ctx.textAlign = "left";
  visibleFeed.forEach((entry, index) => {
    const alpha = Math.min(1, (5000 - (feedNow - entry.at)) / 1000);
    ctx.globalAlpha = alpha;
    ctx.font = "500 12px Manrope, sans-serif";
    ctx.fillStyle = "#e4f2f3";
    ctx.fillText(entry.text, 20, 27 + index * 20);
  });
  ctx.globalAlpha = 1;
  if (frigate && frigate.status !== "alive") {
    const own = snapshot.frigates.find((candidate) => candidate.playerId === ownId);
    const selfSunk = own?.lastDamageSource === ownId;
    const killer = own?.lastDamageSource ? snapshot.players.find((player) => player.playerId === own.lastDamageSource)?.name ?? "the sea" : "the sea";
    const countdown = Math.max(0, frigate.respawnAt - now);
    ctx.fillStyle = "rgba(2, 12, 18, .62)";
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    ctx.textAlign = "center";
    ctx.fillStyle = "#f3f7f6";
    ctx.font = "800 34px Manrope, sans-serif";
    ctx.fillText(selfSunk ? "You sank your own frigate" : `Sunk by ${killer}`, logicalWidth / 2, logicalHeight / 2 - 28);
    ctx.fillStyle = "#a4bdc4";
    ctx.font = "500 14px DM Mono, monospace";
    ctx.fillText(`RESPAWNING IN ${countdown.toFixed(1)}s`, logicalWidth / 2, logicalHeight / 2 + 22);
  }
  if (tabHeld) drawFullScoreboard(snapshot, logicalWidth, logicalHeight);
  if (hostMenuOpen) drawHostMenu(snapshot, logicalWidth, logicalHeight);
  if (debugVisible) {
    ctx.fillStyle = "rgba(4, 14, 21, .78)";
    ctx.fillRect(20, logicalHeight - 148, 190, 52);
    ctx.fillStyle = "#89f2db";
    ctx.font = "11px DM Mono, monospace";
    ctx.fillText(`FPS ${fps.toFixed(0)}`, 32, logicalHeight - 135);
    ctx.fillText(`PING ${ping.toFixed(0)} ms`, 32, logicalHeight - 118);
    ctx.fillText(`TICK ${snapshot.tick}`, 32, logicalHeight - 101);
  }
  ctx.restore();
}

function drawFullScoreboard(snapshot: Snapshot, width: number, height: number): void {
  ctx.fillStyle = "rgba(3, 13, 20, .84)";
  ctx.fillRect(width / 2 - 245, height / 2 - 160, 490, 320);
  ctx.fillStyle = "#9bb6bf";
  ctx.font = "500 11px DM Mono, monospace";
  ctx.textAlign = "left";
  ctx.fillText("WATERSIDE SCOREBOARD", width / 2 - 215, height / 2 - 128);
  snapshot.players.slice().sort((a, b) => b.score - a.score || a.sunk - b.sunk).forEach((player, index) => {
    const y = height / 2 - 89 + index * 48;
    ctx.fillStyle = player.playerId === ownId ? "rgba(96, 224, 203, .13)" : "rgba(225, 243, 244, .04)";
    ctx.fillRect(width / 2 - 222, y - 7, 444, 38);
    ctx.fillStyle = colours[player.slot - 1] ?? "#fff";
    ctx.beginPath();
    ctx.arc(width / 2 - 203, y + 11, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e5f1f2";
    ctx.font = "600 14px Manrope, sans-serif";
    ctx.fillText(`${player.host ? "♛ " : ""}${player.name}`, width / 2 - 187, y + 2);
    ctx.textAlign = "right";
    ctx.font = "12px DM Mono, monospace";
    ctx.fillText(`${player.score} PTS    ${player.sunk} SUNK`, width / 2 + 202, y + 4);
    ctx.textAlign = "left";
  });
}

function drawHostMenu(snapshot: Snapshot, width: number, height: number): void {
  const host = snapshot.players.find((player) => player.playerId === ownId)?.host;
  if (!host) {
    hostMenuOpen = false;
    return;
  }
  ctx.fillStyle = "rgba(3, 13, 20, .88)";
  ctx.fillRect(width / 2 - 220, height / 2 - 175, 440, 350);
  ctx.fillStyle = "#eff8f6";
  ctx.font = "800 20px Manrope, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("HOST CONTROL", width / 2 - 184, height / 2 - 142);
  ctx.fillStyle = "#9bb4bb";
  ctx.font = "12px Manrope, sans-serif";
  ctx.fillText("Actions are shared with every captain.", width / 2 - 184, height / 2 - 112);
  ctx.fillStyle = "#6be0cf";
  ctx.fillText("R  Regenerate world", width / 2 - 184, height / 2 - 65);
  ctx.fillText("X  Reset scores", width / 2 - 184, height / 2 - 35);
  ctx.fillStyle = "#e4ad80";
  ctx.fillText("K  Kick player (press K)", width / 2 - 184, height / 2 - 5);
  ctx.fillStyle = "#8ea9b0";
  ctx.font = "10px DM Mono, monospace";
  ctx.fillText("ESC TO CLOSE", width / 2 - 184, height / 2 + 140);
}

function sendHost(action: "regenerate" | "resetScores" | "kick", target?: string): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "host", action, ...(target ? { target } : {}) }));
}

window.addEventListener("keydown", (event) => {
  if (!joined || event.repeat || event.target instanceof HTMLInputElement) return;
  if (event.code === "KeyR" && hostMenuOpen) {
    const confirmed = confirm("Regenerate the world? All frigates will respawn; scores are kept.");
    clearPressedAndSendNeutral();
    if (confirmed) sendHost("regenerate");
  }
  if (event.code === "KeyX" && hostMenuOpen) {
    const confirmed = confirm("Reset all scores and sunk counts?");
    clearPressedAndSendNeutral();
    if (confirmed) sendHost("resetScores");
  }
  if (event.code === "KeyK" && hostMenuOpen && latestSnapshot) {
    const others = latestSnapshot.players.filter((player) => player.playerId !== ownId);
    const choice = prompt(`Kick which player?\n${others.map((player) => player.name).join(", ")}`);
    clearPressedAndSendNeutral();
    if (choice && others.some((player) => player.name === choice)) {
      const confirmed = confirm(`Kick ${choice} from the battle?`);
      clearPressedAndSendNeutral();
      if (confirmed) sendHost("kick", choice);
    }
  }
});

function addFeed(text: string): void {
  feed.push({ text, at: performance.now() });
  feed.splice(0, Math.max(0, feed.length - 8));
}

function renderFrame(now: number): void {
  const viewport = resizeCanvas();
  const serverNow = now / 1000 + serverTimeOffset;
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.fillStyle = "#071b2a";
  const contentWidth = GAME_CONFIG.screen.width * viewport.scale;
  const contentHeight = GAME_CONFIG.screen.height * viewport.scale;
  if (viewport.offsetY > 0) ctx.fillRect(0, 0, viewport.width, viewport.offsetY);
  if (viewport.offsetY + contentHeight < viewport.height) {
    ctx.fillRect(0, viewport.offsetY + contentHeight, viewport.width, viewport.height - viewport.offsetY - contentHeight);
  }
  if (viewport.offsetX > 0) ctx.fillRect(0, viewport.offsetY, viewport.offsetX, contentHeight);
  if (viewport.offsetX + contentWidth < viewport.width) {
    ctx.fillRect(viewport.offsetX + contentWidth, viewport.offsetY, viewport.width - viewport.offsetX - contentWidth, contentHeight);
  }
  ctx.setTransform(viewport.dpr * viewport.scale, 0, 0, viewport.dpr * viewport.scale, viewport.dpr * viewport.offsetX, viewport.dpr * viewport.offsetY);
  const snapshot = getRenderSnapshot();
  const own = predictedOwn ?? snapshot?.frigates.find((frigate) => frigate.playerId === ownId) as Frigate | undefined;
  if (world && own) {
    const camera = cameraFor(own);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    renderTerrain(world, camera.x, camera.y, viewport.scale, viewport.dpr);
    const visible = snapshot?.frigates ?? [];
    for (const frigate of visible) if (frigate.playerId !== ownId) drawFrigate(frigate, serverNow, debugVisible);
    if (own) drawFrigate(own, serverNow, debugVisible);
    for (const shell of snapshot?.shells ?? []) drawShell(shell);
    for (const torpedo of snapshot?.torpedoes ?? []) drawTorpedo(torpedo);
    for (const effect of effects) drawExplosion(effect, now);
    if (own) drawReticle(own, serverNow);
    ctx.restore();
  } else {
    ctx.fillStyle = "#071b2a";
    ctx.fillRect(0, 0, GAME_CONFIG.screen.width, GAME_CONFIG.screen.height);
    ctx.fillStyle = "#88adaf";
    ctx.font = "14px DM Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText("CONNECTING TO THE FLEET…", GAME_CONFIG.screen.width / 2, GAME_CONFIG.screen.height / 2);
  }
  if (snapshot) drawHud(snapshot, own, serverNow, GAME_CONFIG.screen.width, GAME_CONFIG.screen.height);
  effects.splice(0, effects.length, ...effects.filter((effect) => now - effect.at < 1200));
  const frameDelta = Math.min(100, now - lastFrameAt);
  accumulator += frameDelta;
  lastFrameAt = now;
  while (accumulator >= 1000 / GAME_CONFIG.network.tickRate) {
    simulationTick();
    accumulator -= 1000 / GAME_CONFIG.network.tickRate;
  }
  fpsFrames += 1;
  if (now - fpsStartedAt >= 1000) {
    fps = fpsFrames * 1000 / (now - fpsStartedAt);
    fpsFrames = 0;
    fpsStartedAt = now;
  }
  if (lastPingAt > 0 && now - lastPingAt > 500) ping = 0;
  requestAnimationFrame(renderFrame);
}

connect();
requestAnimationFrame(renderFrame);
