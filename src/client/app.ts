import { GAME_CONFIG } from "../shared/config.js";
import type { Base } from "../shared/bases.js";
import { INPUT_KEYS, applyFrigateInput, type Frigate, type FrigateInput, type GameEvent, type Shell, type Torpedo } from "../shared/sim.js";
import { DEFAULT_SETTINGS, describeSettingsChanges, formatMapSize, SETTINGS_LIMITS, type GameSettings } from "../shared/settings.js";
import { APP_VERSION } from "../shared/version.js";
import { createEmptyWorld, decodeWorld, isLandAt, mapDimensions, type World } from "../shared/world.js";
import type { LobbyMessage, ServerMessage, SnapshotFrigate } from "../shared/protocol.js";
import { computeCamera, computeViewport } from "./camera.js";
import { drawBases, drawCaptureProgress } from "./bases.js";
import {
  actionForCode,
  assignBinding,
  bindingLabel,
  BINDINGS_STORAGE_KEY,
  CONTROL_ACTIONS,
  DEFAULT_BINDINGS,
  loadBindings,
  RESERVED_CODES,
  serializeBindings,
  type Bindings,
  type ControlAction,
  type KeyboardLayout,
} from "./controls.js";
import { ProjectileStore } from "./projectiles.js";
import { RADAR, radarBearing, radarContacts, worldToRadar } from "./radar.js";
import {
  landColorAt,
  noise,
  noise2,
  resetTerrainStyleCache,
  terrainFields,
  waterColorAtDistance,
} from "./terrainStyle.js";
import { shouldResetWake, torpedoWakeLength, wakeArmOffset, wakeLife } from "./wake.js";

type Snapshot = Extract<ServerMessage, { type: "snapshot" }>;
type StoredSnapshot = { receivedAt: number; value: Snapshot };
type PendingInput = { input: FrigateInput; sentAt: number };
type WakeSample = { x: number; y: number; heading: number; speed: number; at: number };
type WakeObservation = { x: number; y: number; heading: number; status: SnapshotFrigate["status"]; at: number };
type HostMenuPending =
  | { action: "regenerate" }
  | { action: "resetScores" }
  | { action: "kickSelect" }
  | { action: "kick"; playerId: string; name: string }
  | { action: "settings"; draft: GameSettings; index: number };
type ControlsMenuPending = { action: "controls"; index: number; capturing: boolean; hint: string };
type MenuPending = HostMenuPending | ControlsMenuPending | null;

function storedBindings(): string | null {
  try {
    return localStorage.getItem(BINDINGS_STORAGE_KEY);
  } catch {
    return null;
  }
}

declare global {
  interface Window {
    __warships: Readonly<{
      ownId: string | null;
      latestSnapshot: Readonly<Snapshot> | null;
      predictedOwnFrigate: Readonly<Frigate> | null;
      bases: ReadonlyArray<Readonly<Base>>;
      projectiles: Readonly<{ shells: Shell[]; torpedoes: Torpedo[] }>;
      projectileServerTime: number;
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
const lobbyFooter = requireElement<HTMLElement>(".lobby-footer");
const lobbyVersion = requireElement<HTMLElement>("#lobby-version");
lobbyVersion.textContent = `v${APP_VERSION}`;
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
let radarMapCanvas: HTMLCanvasElement | null = null;
let radarMapWorld: World | null = null;
const terrainChunkSize = 800;
let worldCacheResolution = 0;
const wakeTrails = new Map<string, WakeSample[]>();
const wakeObservations = new Map<string, WakeObservation>();
const effects: Array<{ event: GameEvent; at: number }> = [];
const feed: Array<{ text: string; at: number }> = [];
let socket: WebSocket | null = null;
let world: World | null = null;
let bases: Base[] = [];
let ownId: string | null = null;
let latestSnapshot: Snapshot | null = null;
let predictedOwn: Frigate | null = null;
let gameSettings: GameSettings = DEFAULT_SETTINGS;
let snapshots: StoredSnapshot[] = [];
const projectileStore = new ProjectileStore();
let renderedProjectiles: { shells: Shell[]; torpedoes: Torpedo[] } = { shells: [], torpedoes: [] };
let projectileServerTime = 0;
let pendingInputs: PendingInput[] = [];
let sequence = 0;
let throttleLevel = 0;
let bindings = loadBindings(storedBindings());
let keyboardLayout: KeyboardLayout | undefined;
let gameCodes = new Set<string>();
let lobbyState: LobbyMessage | null = null;
let shouldAutoJoin = false;
let joined = false;
let tabHeld = false;
let menuOpen = false;
let menuPending: MenuPending = null;
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
let hasServerTimeOffset = false;
let reconnectTimer: number | undefined;
let reconnectForLobby = false;

function resetWorldCaches(): void {
  worldCache.clear();
  radarMapCanvas = null;
  radarMapWorld = null;
  resetTerrainStyleCache();
}

Object.defineProperty(window, "__warships", {
  configurable: false,
  enumerable: false,
  get: () => Object.freeze({
    ownId,
    latestSnapshot: latestSnapshot ? deepFreeze(structuredClone(latestSnapshot)) : null,
    predictedOwnFrigate: predictedOwn ? deepFreeze({ ...predictedOwn }) : null,
    bases: deepFreeze(structuredClone(bases)),
    projectiles: deepFreeze(structuredClone(renderedProjectiles)),
    projectileServerTime,
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

function worldFromMessage(encoded: number[], columns: number, rows: number, seed = 0): World {
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
    projectileStore.clear();
    renderedProjectiles = { shells: [], torpedoes: [] };
    projectileServerTime = 0;
    hasServerTimeOffset = false;
    ownId = message.playerId;
    latestSnapshot = null;
    gameSettings = { ...message.settings };
    bases = message.bases;
    sessionStorage.setItem("warships.token", message.token);
    sessionStorage.setItem("warships.sessionName", nameInput.value.trim());
    world = worldFromMessage(message.world, message.columns, message.rows);
    resetWorldCaches();
    joined = true;
    shouldAutoJoin = false;
    lobby.hidden = true;
    pressed.clear();
    pendingInputs = [];
    snapshots = [];
    predictedOwn = null;
    menuOpen = false;
    menuPending = null;
    addFeed("Connected to the battle");
  } else if (message.type === "world") {
    throttleLevel = 0;
    bases = message.bases;
    world = worldFromMessage(message.world, message.columns, message.rows, world?.seed ?? 0);
    resetWorldCaches();
    addFeed("World regenerated");
  } else if (message.type === "settings") {
    gameSettings = { ...message.settings };
  } else if (message.type === "snapshot") {
    if (message.bases) {
      const statuses = new Map(message.bases.map((base) => [base.id, base]));
      bases = bases.map((base) => ({ ...base, ...statuses.get(base.id) }));
    }
    onSnapshot(message);
  } else if (message.type === "projectiles") {
    projectileStore.apply(message);
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
  bases = [];
  latestSnapshot = null;
  predictedOwn = null;
  snapshots = [];
  projectileStore.clear();
  renderedProjectiles = { shells: [], torpedoes: [] };
  projectileServerTime = 0;
  hasServerTimeOffset = false;
  pendingInputs = [];
  pressed.clear();
  tabHeld = false;
  cannonFirePending = false;
  torpedoFirePending = false;
  menuOpen = false;
  menuPending = null;
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

const inputBitsByAction: Partial<Record<ControlAction, number>> = {
  hullLeft: INPUT_KEYS.turnLeft,
  hullRight: INPUT_KEYS.turnRight,
  cannonLeft: INPUT_KEYS.cannonLeft,
  cannonRight: INPUT_KEYS.cannonRight,
  rangeUp: INPUT_KEYS.rangeUp,
  rangeDown: INPUT_KEYS.rangeDown,
  torpedoLeft: INPUT_KEYS.torpedoLeft,
  torpedoRight: INPUT_KEYS.torpedoRight,
};

const settingsRows: Array<{ key: keyof GameSettings; label: string }> = [
  { key: "boatSpeedPct", label: "Boat speed" },
  { key: "rotationPct", label: "Rotation speed" },
  { key: "cannonRotationPct", label: "Cannon rotation" },
  { key: "torpedoRotationPct", label: "Torpedo rotation" },
  { key: "shellSpeedPct", label: "Shell speed" },
  { key: "torpedoSpeedPct", label: "Torpedo speed" },
  { key: "cannonReload", label: "Cannon reload" },
  { key: "torpedoReload", label: "Torpedo reload" },
  { key: "landCoveragePct", label: "Land coverage" },
  { key: "mapSize", label: "Map size" },
  { key: "neutralBases", label: "Neutral bases" },
  { key: "fuelCrossings", label: "Fuel" },
  { key: "shells", label: "Shells" },
  { key: "torpedoes", label: "Torpedoes" },
  { key: "resupplyTime", label: "Resupply time" },
  { key: "captureTime", label: "Capture time" },
  { key: "repairTime", label: "Repair time" },
];

function isOwnHost(snapshot: Snapshot | null = latestSnapshot): boolean {
  return Boolean(snapshot?.players.find((player) => player.playerId === ownId)?.host);
}

function rebuildGameCodes(): void {
  gameCodes = new Set([
    ...CONTROL_ACTIONS.flatMap(({ action }) => bindings[action]),
    ...RESERVED_CODES,
  ]);
}

function renderLobbyControlsHelp(): void {
  const label = (action: ControlAction) => bindingLabel(bindings[action], keyboardLayout);
  lobbyFooter.textContent = `${label("throttleUp")} / ${label("throttleDown")} throttle · ${label("hullLeft")} / ${label("hullRight")} steer · ${label("fireCannon")} fire · ${label("fireTorpedo")} torpedoes · Esc menu`;
}

function applyBindings(next: Bindings, persist = true): void {
  bindings = next;
  pressed.clear();
  cannonFirePending = false;
  torpedoFirePending = false;
  rebuildGameCodes();
  if (persist) {
    try {
      localStorage.setItem(BINDINGS_STORAGE_KEY, serializeBindings(bindings));
    } catch {
      // Keep the session's binding even if browser storage is unavailable.
    }
  }
  renderLobbyControlsHelp();
}

async function refreshKeyboardLayout(): Promise<void> {
  const keyboard = (navigator as Navigator & {
    keyboard?: { getLayoutMap?: () => Promise<KeyboardLayout> };
  }).keyboard;
  if (!keyboard?.getLayoutMap) return;
  try {
    keyboardLayout = await keyboard.getLayoutMap();
    renderLobbyControlsHelp();
  } catch {
    keyboardLayout = undefined;
    renderLobbyControlsHelp();
  }
}

rebuildGameCodes();
renderLobbyControlsHelp();
void refreshKeyboardLayout();

window.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (!joined || isTyping) return;
  const capturePending = menuOpen && menuPending?.action === "controls" && menuPending.capturing
    ? menuPending
    : null;
  if (capturePending) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    if (event.code === "Escape") {
      menuPending = { ...capturePending, capturing: false, hint: "" };
      return;
    }
    if (RESERVED_CODES.has(event.code)) {
      menuPending = { ...capturePending, hint: "Esc, Tab and F3 can't be assigned" };
      return;
    }
    const row = CONTROL_ACTIONS[capturePending.index];
    if (!row) return;
    applyBindings(assignBinding(bindings, row.action, event.code));
    menuPending = { ...capturePending, capturing: false, hint: "" };
    return;
  }
  if (gameCodes.has(event.code)) event.preventDefault();
  if (event.code === "F3" && !event.repeat) {
    debugVisible = !debugVisible;
    return;
  }
  if (event.code === "Tab") {
    tabHeld = true;
    return;
  }
  if (event.code === "Escape" && !event.repeat) {
    if (menuPending) {
      menuPending = null;
      return;
    }
    menuOpen = !menuOpen;
    if (menuOpen) {
      pressed.clear();
      cannonFirePending = false;
      torpedoFirePending = false;
    }
    return;
  }
  if (!gameCodes.has(event.code) || menuOpen) return;
  if (event.repeat) return;
  const action = actionForCode(bindings, event.code);
  if (action === "throttleUp") {
    throttleLevel = Math.min(3, throttleLevel + 1);
    return;
  }
  if (action === "throttleDown") {
    throttleLevel = Math.max(-1, throttleLevel - 1);
    return;
  }
  if (action === "fireCannon") cannonFirePending = true;
  if (action === "fireTorpedo") torpedoFirePending = true;
  pressed.add(event.code);
});

window.addEventListener("keyup", (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  const isCapturing = menuOpen && menuPending?.action === "controls" && menuPending.capturing;
  if (joined && !isTyping && (gameCodes.has(event.code) || isCapturing)) event.preventDefault();
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
  const snapshotWithBases: Snapshot = snapshot.bases
    ? snapshot
    : {
        ...snapshot,
        bases: latestSnapshot?.bases ?? bases.map(({
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
  latestSnapshot = snapshotWithBases;
  if (!isOwnHost() && menuPending && menuPending.action !== "controls") menuPending = null;
  const receivedAt = performance.now();
  serverTimeOffset = snapshotWithBases.serverTime - receivedAt / 1000;
  hasServerTimeOffset = true;
  snapshots.push({ receivedAt, value: snapshotWithBases });
  snapshots = snapshots.slice(-6);
  const own = snapshotWithBases.frigates.find((frigate) => frigate.playerId === ownId) as Frigate | undefined;
  if (own) {
    if (own.status !== "alive") throttleLevel = 0;
    const acknowledgedAt = pendingInputs.find((entry) => entry.input.seq === snapshotWithBases.ackSeq)?.sentAt;
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
        world ?? createEmptyWorld(mapDimensions(gameSettings.mapSize)),
        localTime,
        gameSettings,
      );
      localTime += 1 / GAME_CONFIG.network.tickRate;
    }
  }
}

function nextInput(): FrigateInput {
  let keys = 0;
  if (!menuOpen) {
    for (const { action } of CONTROL_ACTIONS) {
      const bit = inputBitsByAction[action];
      if (bit !== undefined && bindings[action].some((code) => pressed.has(code))) keys |= bit;
    }
  }
  return {
    seq: ++sequence,
    keys,
    throttle: throttleLevel,
    fireCannon: !menuOpen && cannonFirePending,
    fireTorpedo: !menuOpen && torpedoFirePending,
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
  if (predictedOwn) {
    predictedOwn = applyFrigateInput(
      predictedOwn,
      input,
      1 / GAME_CONFIG.network.tickRate,
      world,
      performance.now() / 1000 + serverTimeOffset,
      gameSettings,
    );
  }
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
  return { ...later, frigates };
}

function interpolateAngle(first: number, second: number, amount: number): number {
  const delta = Math.atan2(Math.sin(second - first), Math.cos(second - first));
  return first + delta * amount;
}

function resizeCanvas(): {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  dpr: number;
} {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (canvasElement.width !== Math.round(width * dpr) || canvasElement.height !== Math.round(height * dpr)) {
    canvasElement.width = Math.round(width * dpr);
    canvasElement.height = Math.round(height * dpr);
  }
  const viewport = computeViewport(width, height);
  return {
    width,
    height,
    ...viewport,
    dpr,
  };
}

function renderTerrain(
  worldState: World,
  cameraX: number,
  cameraY: number,
  viewWidth: number,
  viewHeight: number,
  worldScale: number,
  dpr: number,
): void {
  const resolution = Math.max(1, Math.min(2, Math.ceil(worldScale * dpr)));
  if (resolution !== worldCacheResolution) {
    worldCache.clear();
    worldCacheResolution = resolution;
  }
  const lastWorldChunkX = Math.ceil(worldState.width / terrainChunkSize) - 1;
  const lastWorldChunkY = Math.ceil(worldState.height / terrainChunkSize) - 1;
  const firstChunkX = Math.max(0, Math.floor(cameraX / terrainChunkSize));
  const lastChunkX = Math.min(lastWorldChunkX, Math.floor((cameraX + viewWidth) / terrainChunkSize));
  const firstChunkY = Math.max(0, Math.floor(cameraY / terrainChunkSize));
  const lastChunkY = Math.min(lastWorldChunkY, Math.floor((cameraY + viewHeight) / terrainChunkSize));
  ctx.fillStyle = "#0f3d55";
  ctx.fillRect(cameraX, cameraY, viewWidth, viewHeight);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, worldState.width, worldState.height);
  ctx.clip();
  for (let cy = firstChunkY; cy <= lastChunkY; cy += 1) {
    for (let cx = firstChunkX; cx <= lastChunkX; cx += 1) {
      const key = `${worldState.seed}:${cx}:${cy}:${resolution}`;
      let chunk = worldCache.get(key);
      if (!chunk) {
        chunk = buildTerrainChunk(worldState, cx, cy, resolution);
        worldCache.set(key, chunk);
      }
      const chunkOriginX = cx * terrainChunkSize - GAME_CONFIG.world.tileSize;
      const chunkOriginY = cy * terrainChunkSize - GAME_CONFIG.world.tileSize;
      const paddedChunkSize = terrainChunkSize + GAME_CONFIG.world.tileSize * 2;
      ctx.drawImage(chunk, chunkOriginX, chunkOriginY, paddedChunkSize, paddedChunkSize);
    }
  }
  ctx.restore();
}

function sampleTerrainField(worldState: World, field: Float64Array, column: number, row: number): number {
  const x = Math.max(0, Math.min(worldState.columns - 1, column));
  const y = Math.max(0, Math.min(worldState.rows - 1, row));
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.min(worldState.columns - 1, left + 1);
  const bottom = Math.min(worldState.rows - 1, top + 1);
  const tx = x - left;
  const ty = y - top;
  const upper = (field[top * worldState.columns + left] ?? 0) * (1 - tx)
    + (field[top * worldState.columns + right] ?? 0) * tx;
  const lower = (field[bottom * worldState.columns + left] ?? 0) * (1 - tx)
    + (field[bottom * worldState.columns + right] ?? 0) * tx;
  return upper * (1 - ty) + lower * ty;
}

function buildTerrainImage(
  worldState: World,
  chunkX: number,
  chunkY: number,
  kind: "water" | "land",
): HTMLCanvasElement {
  const tile = GAME_CONFIG.world.tileSize;
  const chunkTiles = terrainChunkSize / tile;
  const imageMarginTiles = 3;
  const pixelsPerTile = kind === "water" ? 1 : 4;
  const imageTiles = chunkTiles + imageMarginTiles * 2;
  const imageCanvas = document.createElement("canvas");
  imageCanvas.width = imageTiles * pixelsPerTile;
  imageCanvas.height = imageTiles * pixelsPerTile;
  const imageContext = imageCanvas.getContext("2d");
  if (!imageContext) return imageCanvas;
  const image = imageContext.createImageData(imageCanvas.width, imageCanvas.height);
  const fields = terrainFields(worldState);
  const firstColumn = chunkX * chunkTiles - imageMarginTiles;
  const firstRow = chunkY * chunkTiles - imageMarginTiles;

  for (let pixelRow = 0; pixelRow < imageCanvas.height; pixelRow += 1) {
    const row = firstRow + (pixelRow + 0.5) / pixelsPerTile - 0.5;
    for (let pixelColumn = 0; pixelColumn < imageCanvas.width; pixelColumn += 1) {
      const column = firstColumn + (pixelColumn + 0.5) / pixelsPerTile - 0.5;
      let color: readonly [number, number, number];
      if (kind === "water") {
        color = waterColorAtDistance(sampleTerrainField(worldState, fields.waterDistance, column, row));
      } else {
        const edge = sampleTerrainField(worldState, fields.landDistance, column, row);
        color = landColorAt(edge, noise(column, row), noise2(column, row));
      }
      const pixel = (pixelRow * imageCanvas.width + pixelColumn) * 4;
      image.data[pixel] = Math.round(color[0]);
      image.data[pixel + 1] = Math.round(color[1]);
      image.data[pixel + 2] = Math.round(color[2]);
      image.data[pixel + 3] = 255;
    }
  }
  imageContext.putImageData(image, 0, 0);
  return imageCanvas;
}

function buildTerrainChunk(worldState: World, chunkX: number, chunkY: number, resolution: number): HTMLCanvasElement {
  const chunkSize = terrainChunkSize;
  const tile = GAME_CONFIG.world.tileSize;
  const chunkTiles = chunkSize / tile;
  const padding = tile;
  const paddedSize = chunkSize + padding * 2;
  const chunk = document.createElement("canvas");
  chunk.width = Math.ceil(paddedSize * resolution);
  chunk.height = Math.ceil(paddedSize * resolution);
  const terrain = chunk.getContext("2d", { alpha: false });
  if (!terrain) return chunk;
  terrain.scale(resolution, resolution);
  terrain.fillStyle = "#0f3d55";
  terrain.fillRect(0, 0, paddedSize, paddedSize);
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
  const polygonMarginTiles = 3;
  const startColumn = Math.max(0, chunkX * chunkTiles - polygonMarginTiles);
  const endColumn = Math.min(worldState.columns - 2, chunkX * chunkTiles + chunkTiles + polygonMarginTiles - 1);
  const startRow = Math.max(0, chunkY * chunkTiles - polygonMarginTiles);
  const endRow = Math.min(worldState.rows - 2, chunkY * chunkTiles + chunkTiles + polygonMarginTiles - 1);
  const landPath = new Path2D();
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      const topLeft = isLandAt(worldState, column * tile + tile / 2, row * tile + tile / 2);
      const topRight = isLandAt(worldState, (column + 1) * tile + tile / 2, row * tile + tile / 2);
      const bottomRight = isLandAt(worldState, (column + 1) * tile + tile / 2, (row + 1) * tile + tile / 2);
      const bottomLeft = isLandAt(worldState, column * tile + tile / 2, (row + 1) * tile + tile / 2);
      const code = Number(topLeft) | (Number(topRight) << 1) | (Number(bottomRight) << 2) | (Number(bottomLeft) << 3);
      const polygons = landCases[code] ?? [];
      if (polygons.length === 0) continue;
      const x = column * tile - chunkX * chunkSize + padding;
      const y = row * tile - chunkY * chunkSize + padding;
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
        landPath.moveTo(first[0], first[1]);
        for (const key of polygon.slice(1)) {
          const point = points[key];
          if (point) landPath.lineTo(point[0], point[1]);
        }
        landPath.closePath();
      }
    }
  }

  terrain.imageSmoothingEnabled = true;
  const imageOffset = -tile * 2;
  const imageSize = paddedSize + tile * 4;
  const waterImage = buildTerrainImage(worldState, chunkX, chunkY, "water");
  terrain.drawImage(waterImage, imageOffset, imageOffset, imageSize, imageSize);
  terrain.lineJoin = "round";
  terrain.lineCap = "round";
  terrain.strokeStyle = "rgba(255, 255, 255, .15)";
  terrain.lineWidth = 12;
  terrain.stroke(landPath);
  terrain.strokeStyle = "rgba(255, 255, 255, .6)";
  terrain.lineWidth = 5;
  terrain.stroke(landPath);
  const landImage = buildTerrainImage(worldState, chunkX, chunkY, "land");
  terrain.save();
  terrain.clip(landPath);
  terrain.drawImage(landImage, imageOffset, imageOffset, imageSize, imageSize);
  terrain.restore();
  return chunk;
}

function sternPoint(sample: WakeSample): { x: number; y: number } {
  return {
    x: sample.x - Math.cos(sample.heading) * GAME_CONFIG.frigate.length / 2,
    y: sample.y - Math.sin(sample.heading) * GAME_CONFIG.frigate.length / 2,
  };
}

function wakeSpeedFraction(speed: number): number {
  const settingAdjustedSpeed = GAME_CONFIG.frigate.maxForwardSpeed * gameSettings.boatSpeedPct / 100;
  return Math.max(0, Math.min(1, Math.abs(speed) / settingAdjustedSpeed));
}

function wakeArmPoint(sample: WakeSample, now: number, side: number): { x: number; y: number } {
  const age = now - sample.at;
  const offset = wakeArmOffset(age, wakeSpeedFraction(sample.speed), GAME_CONFIG.frigate.beam);
  const stern = sternPoint(sample);
  const perpendicularX = -Math.sin(sample.heading);
  const perpendicularY = Math.cos(sample.heading);
  return {
    x: stern.x + perpendicularX * offset * side,
    y: stern.y + perpendicularY * offset * side,
  };
}

function drawWakes(frigates: readonly SnapshotFrigate[], now: number): void {
  const present = new Set(frigates.map((frigate) => frigate.playerId));
  for (const playerId of wakeObservations.keys()) {
    if (present.has(playerId)) continue;
    wakeTrails.delete(playerId);
    wakeObservations.delete(playerId);
  }
  for (const frigate of frigates) {
    const history = wakeTrails.get(frigate.playerId) ?? [];
    const last = history[history.length - 1];
    const previousObservation = wakeObservations.get(frigate.playerId);
    const observationJumped = previousObservation !== undefined && shouldResetWake(previousObservation, frigate);
    const observationMoved = previousObservation !== undefined
      && Math.hypot(frigate.x - previousObservation.x, frigate.y - previousObservation.y) > 0.001;
    const observationStatusChanged = previousObservation !== undefined && previousObservation.status !== frigate.status;
    const respawned = observationStatusChanged
      && previousObservation.status !== "alive"
      && frigate.status === "alive";
    const sampleJumped = last !== undefined && shouldResetWake(last, frigate);
    let speed = frigate.speed;
    if (typeof speed !== "number") {
      speed = previousObservation && observationMoved && !observationJumped && !respawned && now > previousObservation.at
        ? (
          (frigate.x - previousObservation.x) * Math.cos(frigate.heading)
          + (frigate.y - previousObservation.y) * Math.sin(frigate.heading)
        ) / (now - previousObservation.at)
        : 0;
    }
    if (!previousObservation || observationMoved || observationJumped || observationStatusChanged) {
      wakeObservations.set(frigate.playerId, {
        x: frigate.x,
        y: frigate.y,
        heading: frigate.heading,
        status: frigate.status,
        at: now,
      });
    }

    if (sampleJumped || respawned) history.length = 0;
    const lastSample = history[history.length - 1];
    if (
      (frigate.status === "alive" || frigate.status === "sinking")
      && Math.abs(speed) > 2
      && (!lastSample || Math.hypot(frigate.x - lastSample.x, frigate.y - lastSample.y) >= 3)
    ) {
      history.push({ x: frigate.x, y: frigate.y, heading: frigate.heading, speed, at: now });
    }

    const currentSamples = history.filter((sample) => now - sample.at < wakeLife(sample.speed));
    if (currentSamples.length > 0) wakeTrails.set(frigate.playerId, currentSamples);
    else wakeTrails.delete(frigate.playerId);
  }

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const history of wakeTrails.values()) {
    for (let index = 1; index < history.length; index += 1) {
      const previous = history[index - 1];
      const sample = history[index];
      if (!previous || !sample) continue;
      const age = now - sample.at;
      const speedFraction = wakeSpeedFraction(sample.speed);
      const fade = Math.max(0, 1 - age / wakeLife(sample.speed));
      if (fade === 0 || speedFraction === 0) continue;

      const previousStern = sternPoint(previous);
      const currentStern = sternPoint(sample);
      ctx.strokeStyle = `rgba(222, 246, 248, ${0.18 * fade * speedFraction})`;
      ctx.lineWidth = 8 + age * 2;
      ctx.beginPath();
      ctx.moveTo(previousStern.x, previousStern.y);
      ctx.lineTo(currentStern.x, currentStern.y);
      ctx.stroke();

      if (previous.speed <= 2 || sample.speed <= 2) continue;
      ctx.strokeStyle = `rgba(222, 246, 248, ${0.55 * fade * speedFraction})`;
      ctx.lineWidth = 1.5;
      for (const side of [-1, 1]) {
        const previousArm = wakeArmPoint(previous, now, side);
        const currentArm = wakeArmPoint(sample, now, side);
        ctx.beginPath();
        ctx.moveTo(previousArm.x, previousArm.y);
        ctx.lineTo(currentArm.x, currentArm.y);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function torpedoBubbleJitter(id: string, index: number): number {
  let hash = 2166136261;
  for (let character = 0; character < id.length; character += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(character), 16777619);
  }
  hash = Math.imul(hash ^ index, 16777619);
  return (hash >>> 0) / 0xffffffff * 4 - 2;
}

function drawTorpedoWake(torpedo: Torpedo): void {
  const travelled = torpedo.elapsed * torpedo.speed;
  const length = torpedoWakeLength(torpedo.speed, travelled);
  if (length <= 0) return;

  ctx.save();
  const tailX = torpedo.x;
  const tailY = torpedo.y;
  const directionX = Math.cos(torpedo.angle);
  const directionY = Math.sin(torpedo.angle);
  const farX = tailX - directionX * length;
  const farY = tailY - directionY * length;
  const gradient = ctx.createLinearGradient(tailX, tailY, farX, farY);
  gradient.addColorStop(0, "rgba(222, 246, 248, .5)");
  gradient.addColorStop(1, "rgba(222, 246, 248, 0)");
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(farX, farY);
  ctx.stroke();

  for (let distance = 12, index = 0; distance <= length; distance += 12, index += 1) {
    const fade = 1 - distance / length;
    if (fade <= 0) continue;
    const jitter = torpedoBubbleJitter(torpedo.id, index);
    const x = tailX - directionX * distance - directionY * jitter;
    const y = tailY - directionY * distance + directionX * jitter;
    ctx.globalAlpha = 0.5 * fade;
    ctx.fillStyle = "#def6f8";
    ctx.beginPath();
    ctx.arc(x, y, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFrigate(frigate: SnapshotFrigate, now: number, debug: boolean): void {
  if (frigate.status === "waiting") return;
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
  ctx.ellipse(-1, 1.5, 15.5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = frigate.status === "sinking" ? "#58646a" : color;
  ctx.strokeStyle = "#e9f7f6";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(10, -4);
  ctx.lineTo(-11.5, -4.5);
  ctx.lineTo(-14.5, -2.5);
  ctx.lineTo(-14.5, 2.5);
  ctx.lineTo(-11.5, 4.5);
  ctx.lineTo(10, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(10, 35, 45, .72)";
  ctx.fillRect(-7, -2.5, 8, 5);
  ctx.fillStyle = "rgba(242, 250, 242, .85)";
  ctx.fillRect(2.5, -1, 4, 2);
  if (debug) {
    ctx.strokeStyle = "#ff4d63";
    ctx.lineWidth = 1;
    ctx.strokeRect(-15, -5, 30, 10);
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
  ctx.fillText(frigate.name, frigate.x, frigate.y - 12);
  if (frigate.playerId !== ownId) {
    ctx.fillStyle = "rgba(5, 20, 25, .78)";
    ctx.fillRect(frigate.x - 21, frigate.y + 10, 42, 4);
    ctx.fillStyle = frigate.hp > 35 ? "#62d3b2" : "#ff776c";
    ctx.fillRect(frigate.x - 21, frigate.y + 10, 42 * Math.max(0, frigate.hp / GAME_CONFIG.player.maxHp), 4);
  }
}

function drawShell(shell: Shell): void {
  const progress = Math.max(0, Math.min(1, shell.elapsed / shell.duration));
  const x = shell.startX + (shell.impactX - shell.startX) * progress;
  const y = shell.startY + (shell.impactY - shell.startY) * progress;
  const height = Math.sin(progress * Math.PI) * 48;
  const size = 2.2 + Math.sin(progress * Math.PI) * 2.5;
  const angle = Math.atan2(shell.impactY - shell.startY, shell.impactX - shell.startX);
  ctx.fillStyle = "rgba(0, 11, 17, .3)";
  ctx.beginPath();
  ctx.ellipse(x, y + 4, size * 2, size * .7, angle, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y - height);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(2.6 * size, 0);
  ctx.quadraticCurveTo(1.4 * size, -0.8 * size, 0.4 * size, -0.8 * size);
  ctx.lineTo(-1.6 * size, -0.8 * size);
  ctx.lineTo(-1.6 * size, 0.8 * size);
  ctx.lineTo(0.4 * size, 0.8 * size);
  ctx.quadraticCurveTo(1.4 * size, 0.8 * size, 2.6 * size, 0);
  ctx.closePath();
  ctx.fillStyle = "#0b0d0e";
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = "rgba(225, 240, 236, .75)";
  ctx.stroke();
  ctx.restore();
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
  const reticleRadius = 30;
  const reloading = Math.max(0, frigate.cannonReadyAt - now);
  const progress = 1 - reloading / gameSettings.cannonReload;
  ctx.save();
  ctx.globalAlpha = reloading > 0 ? .35 : .95;
  ctx.strokeStyle = "#5dffac";
  ctx.fillStyle = "#5dffac";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, reticleRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 1.25, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i += 1) {
    const a = angle + i * Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 25, y + Math.sin(a) * 25);
    ctx.lineTo(x + Math.cos(a) * 27.5, y + Math.sin(a) * 27.5);
    ctx.stroke();
  }
  if (reloading > 0) {
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, reticleRadius + 3.5, angle, angle + Math.PI * 2 * progress);
    ctx.stroke();
  }
  const cannonAxisX = Math.cos(angle);
  const cannonAxisY = Math.sin(angle);
  const cannonPerpendicularX = -cannonAxisY;
  const cannonPerpendicularY = cannonAxisX;
  ctx.beginPath();
  ctx.moveTo(
    frigate.x + cannonAxisX * 70,
    frigate.y + cannonAxisY * 70,
  );
  ctx.lineTo(
    frigate.x + cannonAxisX * 60 + cannonPerpendicularX * 4,
    frigate.y + cannonAxisY * 60 + cannonPerpendicularY * 4,
  );
  ctx.lineTo(
    frigate.x + cannonAxisX * 60 - cannonPerpendicularX * 4,
    frigate.y + cannonAxisY * 60 - cannonPerpendicularY * 4,
  );
  ctx.closePath();
  ctx.fillStyle = "#5dffac";
  ctx.fill();
  const torpedoAngle = frigate.heading + frigate.torpedoBearing;
  const torpedoReload = Math.max(0, frigate.torpedoReadyAt - now);
  const torpedoProgress = 1 - torpedoReload / gameSettings.torpedoReload;
  const filled = Math.floor(torpedoProgress * 5);
  const ready = torpedoReload === 0;
  const axisX = Math.cos(torpedoAngle);
  const axisY = Math.sin(torpedoAngle);
  const perpendicularX = -axisY;
  const perpendicularY = axisX;
  const dashLength = (48 - 19 - 4 * 1.5) / 5;
  ctx.strokeStyle = "#7dff70";
  ctx.lineCap = "butt";
  ctx.lineWidth = 1.25;
  for (let i = 0; i < 5; i += 1) {
    const startRadius = 19 + i * (dashLength + 1.5);
    ctx.globalAlpha = ready || i < filled ? .95 : .25;
    ctx.beginPath();
    ctx.moveTo(frigate.x + axisX * startRadius, frigate.y + axisY * startRadius);
    ctx.lineTo(frigate.x + axisX * (startRadius + dashLength), frigate.y + axisY * (startRadius + dashLength));
    ctx.stroke();
  }
  ctx.globalAlpha = ready ? .95 : .25;
  const tipX = frigate.x + axisX * 56;
  const tipY = frigate.y + axisY * 56;
  for (const side of [-1, 1]) {
    const baseX = frigate.x + axisX * 49 + perpendicularX * 4.5 * side;
    const baseY = frigate.y + axisY * 49 + perpendicularY * 4.5 * side;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX, baseY);
    ctx.stroke();
  }
  ctx.globalAlpha = ready ? .95 : .6;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(
    frigate.x + axisX * 19 - perpendicularX * 3,
    frigate.y + axisY * 19 - perpendicularY * 3,
  );
  ctx.lineTo(
    frigate.x + axisX * 19 + perpendicularX * 3,
    frigate.y + axisY * 19 + perpendicularY * 3,
  );
  ctx.stroke();
  ctx.restore();
}

function getRadarMap(worldState: World): HTMLCanvasElement {
  if (radarMapCanvas && radarMapWorld === worldState) return radarMapCanvas;
  const canvas = document.createElement("canvas");
  canvas.width = worldState.columns;
  canvas.height = worldState.rows;
  const mapContext = canvas.getContext("2d");
  if (mapContext) {
    const image = mapContext.createImageData(canvas.width, canvas.height);
    for (let index = 0; index < worldState.grid.length; index += 1) {
      if (!worldState.grid[index]) continue;
      const pixel = index * 4;
      image.data[pixel] = 93;
      image.data[pixel + 1] = 255;
      image.data[pixel + 2] = 172;
      image.data[pixel + 3] = 115;
    }
    mapContext.putImageData(image, 0, 0);
  }
  radarMapCanvas = canvas;
  radarMapWorld = worldState;
  return canvas;
}

const RADAR_OUTLINE = "#030d14";

function drawRadarTriangle(x: number, y: number, angle: number, length: number, width: number, color: string): void {
  const axisX = Math.cos(angle);
  const axisY = Math.sin(angle);
  const perpendicularX = -axisY;
  const perpendicularY = axisX;
  const tipX = x + axisX * length / 2;
  const tipY = y + axisY * length / 2;
  const baseX = x - axisX * length / 2;
  const baseY = y - axisY * length / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + perpendicularX * width / 2, baseY + perpendicularY * width / 2);
  ctx.lineTo(baseX - perpendicularX * width / 2, baseY - perpendicularY * width / 2);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = RADAR_OUTLINE;
  ctx.stroke();
}

function drawRadar(snapshot: Snapshot, frigate: Frigate, now: number, logicalWidth: number, logicalHeight: number): void {
  if (!world) return;
  const centerX = logicalWidth - RADAR.margin - RADAR.radius;
  const centerY = logicalHeight - RADAR.margin - RADAR.radius;
  const worldScale = RADAR.radius / RADAR.range;
  const worldLeft = centerX - frigate.x * worldScale;
  const worldTop = centerY - frigate.y * worldScale;
  const worldRight = worldLeft + world.width * worldScale;
  const worldBottom = worldTop + world.height * worldScale;
  const scopeLeft = centerX - RADAR.radius;
  const scopeTop = centerY - RADAR.radius;
  const scopeRight = centerX + RADAR.radius;
  const scopeBottom = centerY + RADAR.radius;

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, RADAR.radius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(5, 20, 29, .72)";
  ctx.fill();
  ctx.clip();

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    getRadarMap(world),
    worldLeft,
    worldTop,
    world.width * worldScale,
    world.height * worldScale,
  );

  ctx.fillStyle = "rgba(93, 255, 172, .45)";
  if (worldTop > scopeTop) {
    ctx.fillRect(scopeLeft, scopeTop, scopeRight - scopeLeft, Math.min(scopeBottom, worldTop) - scopeTop);
  }
  if (worldBottom < scopeBottom) {
    const boundaryTop = Math.max(scopeTop, worldBottom);
    ctx.fillRect(scopeLeft, boundaryTop, scopeRight - scopeLeft, scopeBottom - boundaryTop);
  }
  const boundaryTop = Math.max(scopeTop, worldTop);
  const boundaryBottom = Math.min(scopeBottom, worldBottom);
  if (boundaryBottom > boundaryTop && worldLeft > scopeLeft) {
    ctx.fillRect(scopeLeft, boundaryTop, Math.min(scopeRight, worldLeft) - scopeLeft, boundaryBottom - boundaryTop);
  }
  if (boundaryBottom > boundaryTop && worldRight < scopeRight) {
    const boundaryLeft = Math.max(scopeLeft, worldRight);
    ctx.fillRect(boundaryLeft, boundaryTop, scopeRight - boundaryLeft, boundaryBottom - boundaryTop);
  }

  ctx.globalAlpha = .15;
  ctx.strokeStyle = "#5dffac";
  ctx.lineWidth = 1;
  for (const fraction of [1 / 3, 2 / 3]) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, RADAR.radius * fraction, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(centerX, scopeTop);
  ctx.lineTo(centerX, scopeBottom);
  ctx.moveTo(scopeLeft, centerY);
  ctx.lineTo(scopeRight, centerY);
  ctx.stroke();

  const sweepAngle = now / RADAR.sweepPeriod * Math.PI * 2;
  ctx.globalAlpha = .1;
  ctx.fillStyle = "#5dffac";
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.arc(centerX, centerY, RADAR.radius, sweepAngle - Math.PI / 6, sweepAngle);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = .5;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX + Math.cos(sweepAngle) * RADAR.radius, centerY + Math.sin(sweepAngle) * RADAR.radius);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const contacts = radarContacts(
    snapshot.frigates,
    frigate.playerId,
    (slot) => colours[slot - 1] ?? "#fff",
  );
  for (const contact of contacts) {
    const dx = contact.x - frigate.x;
    const dy = contact.y - frigate.y;
    if (contact.kind === "position") {
      if (Math.hypot(dx, dy) > RADAR.range) continue;
      const [radarX, radarY] = worldToRadar(dx, dy);
      ctx.fillStyle = contact.color;
      ctx.beginPath();
      ctx.arc(centerX + radarX, centerY + radarY, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = RADAR_OUTLINE;
      ctx.stroke();
    } else {
      const bearing = radarBearing(frigate.x, frigate.y, contact.x, contact.y);
      const distance = RADAR.radius - 6;
      drawRadarTriangle(
        centerX + Math.cos(bearing) * distance,
        centerY + Math.sin(bearing) * distance,
        bearing,
        7,
        6,
        contact.color,
      );
    }
  }

  for (const base of bases) {
    if (!base.active) continue;
    const dx = base.harbourX - frigate.x;
    const dy = base.harbourY - frigate.y;
    const distance = Math.hypot(dx, dy);
    const ownerSlot = snapshot.players.find((player) => player.playerId === base.ownerId)?.slot;
    ctx.fillStyle = base.ownerId === null ? "#fff" : colours[(ownerSlot ?? 0) - 1] ?? "#fff";
    if (distance <= RADAR.range) {
      const [radarX, radarY] = worldToRadar(dx, dy);
      const markerX = Math.round(centerX + radarX) - 3;
      const markerY = Math.round(centerY + radarY) - 3;
      ctx.fillRect(markerX, markerY, 6, 6);
      ctx.lineWidth = 1;
      ctx.strokeStyle = RADAR_OUTLINE;
      ctx.strokeRect(markerX - 0.5, markerY - 0.5, 7, 7);
    } else if (base.ownerId === ownId) {
      const bearing = radarBearing(frigate.x, frigate.y, base.harbourX, base.harbourY);
      const inner = RADAR.radius - 8;
      const outer = RADAR.radius - 2;
      const tickColour = ctx.fillStyle;
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(bearing) * inner, centerY + Math.sin(bearing) * inner);
      ctx.lineTo(centerX + Math.cos(bearing) * outer, centerY + Math.sin(bearing) * outer);
      ctx.lineWidth = 4;
      ctx.strokeStyle = RADAR_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = tickColour;
      ctx.stroke();
    }
  }

  drawRadarTriangle(centerX, centerY, frigate.heading, 6, 5, "#fff");
  ctx.globalAlpha = .6;
  ctx.strokeStyle = "#5dffac";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(centerX, centerY, RADAR.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawHud(snapshot: Snapshot, frigate: Frigate | undefined, now: number, logicalWidth: number, logicalHeight: number): void {
  const hudMargin = 8;
  const captainsPanelX = logicalWidth - hudMargin - 230;
  const captainsPanelY = hudMargin;
  const hullPanelX = hudMargin;
  const hullPanelHeight = 152;
  const hullPanelY = logicalHeight - hudMargin - hullPanelHeight;
  const hullPanelWidth = 380;
  const hullBarWidth = hullPanelWidth - 28;
  ctx.save();
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(5, 20, 29, .72)";
  ctx.fillRect(captainsPanelX, captainsPanelY, 230, Math.min(235, 54 + snapshot.players.length * 34));
  ctx.fillStyle = "#88a7b0";
  ctx.font = "500 10px DM Mono, monospace";
  ctx.fillText("CAPTAINS", captainsPanelX + 18, captainsPanelY + 11);
  snapshot.players.slice().sort((a, b) => a.slot - b.slot).forEach((player, index) => {
    const y = captainsPanelY + 32 + index * 34;
    const own = player.playerId === ownId;
    if (own) {
      ctx.fillStyle = "rgba(100, 223, 202, .12)";
      ctx.fillRect(captainsPanelX + 10, y - 5, 210, 29);
    }
    ctx.fillStyle = colours[player.slot - 1] ?? "#fff";
    ctx.beginPath();
    ctx.arc(captainsPanelX + 24, y + 5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = own ? "#f0fffa" : "#d7e5e9";
    ctx.font = `${own ? 700 : 500} 12px Manrope, sans-serif`;
    ctx.fillText(`${player.host ? "♛ " : ""}${player.name}`, captainsPanelX + 35, y - 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#b7cbd0";
    ctx.font = "500 11px DM Mono, monospace";
    ctx.fillText(`${player.score}  ·  ${player.sunk}`, captainsPanelX + 218, y);
    ctx.textAlign = "left";
  });
  if (frigate) {
    ctx.fillStyle = "rgba(5, 20, 29, .78)";
    ctx.fillRect(hullPanelX, hullPanelY, hullPanelWidth, hullPanelHeight);
    ctx.fillStyle = "#90a8b0";
    ctx.font = "500 10px DM Mono, monospace";
    ctx.fillText("HULL INTEGRITY", hullPanelX + 14, hullPanelY + 14);
    ctx.fillStyle = "rgba(215, 237, 238, .17)";
    ctx.fillRect(hullPanelX + 14, hullPanelY + 34, hullBarWidth, 7);
    ctx.fillStyle = frigate.hp > 35 ? "#62d3b2" : "#ff776c";
    ctx.fillRect(hullPanelX + 14, hullPanelY + 34, hullBarWidth * Math.max(0, frigate.hp / GAME_CONFIG.player.maxHp), 7);
    ctx.fillStyle = "#e8f4f4";
    ctx.font = "600 11px DM Mono, monospace";
    ctx.fillText(`${frigate.hp} HP`, hullPanelX + 14, hullPanelY + 49);
    ctx.fillStyle = "#91a8ae";
    ctx.fillText(`CANNON ${Math.max(0, frigate.cannonReadyAt - now).toFixed(1)}s`, hullPanelX + 91, hullPanelY + 49);
    ctx.fillText(`TORPEDO ${Math.max(0, frigate.torpedoReadyAt - now).toFixed(1)}s`, hullPanelX + 191, hullPanelY + 49);
    ctx.fillStyle = "#90a8b0";
    ctx.font = "500 10px DM Mono, monospace";
    ctx.textBaseline = "middle";
    ctx.fillText("THROTTLE", hullPanelX + 14, hullPanelY + 72);
    const steps = ["ASTERN", "STOP", "1/3", "2/3", "FULL"];
    const activeStep = throttleLevel + 1;
    const stepX = hullPanelX + 88;
    const stepY = hullPanelY + 61;
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
    ctx.fillText(throttleLabels[activeStep] ?? "STOP", hullPanelX + 14, hullPanelY + 94);
    ctx.textBaseline = "top";
    const fuelCapacity = gameSettings.fuelCrossings * mapDimensions(gameSettings.mapSize).width;
    const fuelFraction = Math.max(0, Math.min(1, frigate.fuel / fuelCapacity));
    const fuelColor = frigate.fuel <= 0
      ? "#ff776c"
      : fuelFraction < 0.2
        ? "#ffb347"
        : "#62d3b2";
    const shellsColor = frigate.shells < 1
      ? "#ff776c"
      : frigate.shells / gameSettings.shells < 0.2
        ? "#ffb347"
        : "#62d3b2";
    const torpedoesColor = frigate.torpedoes < 1
      ? "#ff776c"
      : frigate.torpedoes / gameSettings.torpedoes < 0.2
        ? "#ffb347"
        : "#62d3b2";
    ctx.fillStyle = "#90a8b0";
    ctx.font = "500 10px DM Mono, monospace";
    ctx.fillText("FUEL", hullPanelX + 14, hullPanelY + 109);
    ctx.fillStyle = "rgba(215, 237, 238, .17)";
    ctx.fillRect(hullPanelX + 52, hullPanelY + 111, 160, 7);
    ctx.fillStyle = fuelColor;
    ctx.fillRect(hullPanelX + 52, hullPanelY + 111, 160 * fuelFraction, 7);
    ctx.fillStyle = fuelColor;
    ctx.fillText(`${Math.floor(fuelFraction * 100)}%`, hullPanelX + 224, hullPanelY + 109);
    ctx.font = "600 10px DM Mono, monospace";
    ctx.fillStyle = shellsColor;
    ctx.fillText(`SHELLS ${Math.floor(frigate.shells)}`, hullPanelX + 14, hullPanelY + 132);
    ctx.fillStyle = torpedoesColor;
    ctx.fillText(`TORPEDOES ${Math.floor(frigate.torpedoes)}`, hullPanelX + 150, hullPanelY + 132);
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
  if (menuOpen) drawMenu(snapshot, logicalWidth, logicalHeight);
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
  if (frigate && frigate.status !== "waiting") drawRadar(snapshot, frigate, now, logicalWidth, logicalHeight);
}

function drawFullScoreboard(snapshot: Snapshot, width: number, height: number): void {
  const changes = describeSettingsChanges(DEFAULT_SETTINGS, gameSettings);
  const customRules = changes.length > 0 ? `CUSTOM RULES · ${changes.join(" · ")}` : "";
  ctx.font = "500 11px DM Mono, monospace";
  const panelWidth = Math.min(width - 32, Math.max(490, customRules ? ctx.measureText(customRules).width + 48 : 490));
  const panelHeight = customRules ? 360 : 320;
  ctx.fillStyle = "rgba(3, 13, 20, .84)";
  ctx.fillRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight);
  ctx.fillStyle = "#9bb6bf";
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
  if (customRules) {
    ctx.fillStyle = "#e4ad80";
    ctx.font = "500 11px DM Mono, monospace";
    ctx.fillText(customRules, width / 2 - panelWidth / 2 + 24, height / 2 + 127);
  }
}

function drawMenu(snapshot: Snapshot, width: number, height: number): void {
  const host = snapshot.players.find((player) => player.playerId === ownId)?.host ?? false;
  if (!host && menuPending && menuPending.action !== "controls") menuPending = null;
  const controlsPending = menuPending?.action === "controls" ? menuPending : null;
  const left = width / 2 - 184;
  const centerY = height / 2;
  const panelWidth = controlsPending ? 520 : 440;
  const settingsView = menuPending?.action === "settings";
  const panelHeight = controlsPending ? 560 : settingsView ? 461 : 350;
  const panelTop = settingsView ? centerY - 175 : centerY - panelHeight / 2;
  ctx.fillStyle = "rgba(3, 13, 20, .88)";
  ctx.fillRect(width / 2 - panelWidth / 2, panelTop, panelWidth, panelHeight);
  ctx.fillStyle = "#eff8f6";
  ctx.font = "800 20px Manrope, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(controlsPending ? "PLAYER CONTROLS" : host ? "HOST CONTROL" : "MENU", left, centerY - (controlsPending ? 242 : 142));
  ctx.fillStyle = "#9bb4bb";
  ctx.font = "12px Manrope, sans-serif";
  if (controlsPending) {
    const selected = CONTROL_ACTIONS[controlsPending.index];
    const hint = controlsPending.capturing
      ? controlsPending.hint || `Press a key for ${selected?.label ?? "action"}… Esc cancels`
      : controlsPending.hint || "Choose a row to change its binding.";
    ctx.fillText(hint, width / 2 - 236, centerY - 212);
    CONTROL_ACTIONS.forEach(({ action, label }, index) => {
      const y = centerY - 174 + index * 24;
      const selectedRow = index === controlsPending.index;
      const changed = bindings[action].length !== DEFAULT_BINDINGS[action].length
        || bindings[action].some((code, codeIndex) => code !== DEFAULT_BINDINGS[action][codeIndex]);
      if (selectedRow) {
        ctx.fillStyle = "rgba(107, 224, 207, .14)";
        ctx.fillRect(width / 2 - 236, y - 5, 472, 22);
      }
      ctx.fillStyle = selectedRow ? "#6be0cf" : "#d7e5e9";
      ctx.font = "600 12px Manrope, sans-serif";
      ctx.fillText(`${selectedRow ? "▸" : " "}  ${label}`, width / 2 - 228, y);
      ctx.textAlign = "right";
      ctx.fillStyle = changed ? "#e4ad80" : "#d7e5e9";
      ctx.font = "500 12px DM Mono, monospace";
      const value = controlsPending.capturing && selectedRow
        ? "…"
        : bindingLabel(bindings[action], keyboardLayout);
      ctx.fillText(value, width / 2 + 228, y);
      ctx.textAlign = "left";
    });
    ctx.fillStyle = "#8ea9b0";
    ctx.font = "10px DM Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText("↑↓ select · Enter change · D defaults · Esc back", width / 2, centerY + 256);
    ctx.textAlign = "left";
    return;
  }
  const mapChanged = menuPending?.action === "settings"
    && (menuPending.draft.landCoveragePct !== gameSettings.landCoveragePct
      || menuPending.draft.mapSize !== gameSettings.mapSize
      || menuPending.draft.neutralBases !== gameSettings.neutralBases);
  ctx.fillText(
    mapChanged
      ? "Enter: apply + new map"
      : menuPending?.action === "settings"
        ? "Adjust values for this battle."
        : host
          ? "Host actions · Controls for every captain."
          : "Configure your controls or return to battle.",
    left,
    centerY - 112,
  );
  if (menuPending?.action === "settings") {
    const pending = menuPending;
    settingsRows.forEach((row, index) => {
      const y = centerY - 85 + index * 20;
      const selected = index === pending.index;
      const value = pending.draft[row.key];
      if (selected) {
        ctx.fillStyle = "rgba(107, 224, 207, .14)";
        ctx.fillRect(width / 2 - 200, y - 6, 400, 23);
      }
      ctx.fillStyle = selected ? "#6be0cf" : "#d7e5e9";
      ctx.font = "600 12px Manrope, sans-serif";
      ctx.fillText(`${selected ? "▸" : " "}  ${row.label}`, left, y);
      ctx.textAlign = "right";
      ctx.fillStyle = value !== DEFAULT_SETTINGS[row.key] ? "#e4ad80" : "#d7e5e9";
      ctx.font = "500 12px DM Mono, monospace";
      const displayedValue = row.key === "mapSize"
        ? formatMapSize(value)
        : row.key === "cannonReload" || row.key === "torpedoReload" || row.key === "resupplyTime" || row.key === "captureTime" || row.key === "repairTime"
          ? `${value.toFixed(1).replace(/\.0$/, "")} s`
          : row.key === "neutralBases" || row.key === "shells" || row.key === "torpedoes"
            ? `${value}`
            : row.key === "fuelCrossings"
              ? `${value} crossings`
              : `${value}%`;
      ctx.fillText(
        displayedValue,
        left + 368,
        y,
      );
      ctx.textAlign = "left";
    });
  } else if (menuPending?.action === "kickSelect") {
    ctx.fillStyle = "#e4ad80";
    ctx.fillText("Select a player to kick:", left, centerY - 65);
    snapshot.players
      .filter((player) => player.playerId !== ownId)
      .sort((a, b) => a.slot - b.slot)
      .forEach((player, index) => {
        ctx.fillText(`${index + 1}  ${player.name}`, left, centerY - 35 + index * 24);
      });
  } else if (menuPending) {
    ctx.fillStyle = menuPending.action === "kick" ? "#e4ad80" : "#6be0cf";
    const question = menuPending.action === "regenerate"
      ? "Regenerate the world? All frigates respawn; scores are kept."
      : menuPending.action === "resetScores"
        ? "Reset all scores and sunk counts?"
        : menuPending.action === "kick" ? `Kick ${menuPending.name}?` : "";
    ctx.fillText(question, left, centerY - 65);
  } else if (host) {
    ctx.fillStyle = "#6be0cf";
    ctx.fillText("R  Regenerate world", left, centerY - 65);
    ctx.fillText("X  Reset scores", left, centerY - 35);
    ctx.fillStyle = "#e4ad80";
    ctx.fillText("K  Kick player", left, centerY - 5);
    ctx.fillStyle = "#6be0cf";
    ctx.fillText("S  Settings", left, centerY + 25);
    ctx.fillText("C  Controls", left, centerY + 55);
  } else {
    ctx.fillStyle = "#6be0cf";
    ctx.fillText("C  Controls", left, centerY - 65);
  }
  ctx.fillStyle = "#8ea9b0";
  ctx.font = "10px DM Mono, monospace";
  const footer = menuPending?.action === "settings"
    ? "↑↓ SELECT · ←→ CHANGE · D DEFAULTS · ENTER APPLY · ESC BACK"
    : menuPending?.action === "kickSelect"
      ? "ESC BACK"
      : menuPending
        ? "ENTER CONFIRM · ESC CANCEL"
        : host
          ? "C CONTROLS · ESC TO CLOSE"
          : "C controls · Esc close";
  ctx.textAlign = "center";
  ctx.fillText(footer, width / 2, centerY + (menuPending?.action === "settings" ? 262 : 140));
  ctx.textAlign = "left";
}

function sendHost(action: "regenerate" | "resetScores"): void;
function sendHost(action: "kick", target: string): void;
function sendHost(action: "settings", settings: GameSettings): void;
function sendHost(
  action: "regenerate" | "resetScores" | "kick" | "settings",
  value?: string | GameSettings,
): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const message = action === "kick"
    ? { type: "host", action, target: value as string }
    : action === "settings"
      ? { type: "host", action, settings: value as GameSettings }
      : { type: "host", action };
  socket.send(JSON.stringify(message));
}

window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (!joined || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || !menuOpen) return;
  if (event.code === "Escape") return;
  if (!isOwnHost() && menuPending && menuPending.action !== "controls") menuPending = null;

  if (menuPending?.action === "controls") {
    if (menuPending.capturing || event.repeat) return;
    if (event.code === "ArrowUp" || event.code === "ArrowDown") {
      event.preventDefault();
      const direction = event.code === "ArrowUp" ? -1 : 1;
      menuPending = {
        ...menuPending,
        index: (menuPending.index + direction + CONTROL_ACTIONS.length) % CONTROL_ACTIONS.length,
        hint: "",
      };
    } else if (event.code === "Enter" || event.code === "NumpadEnter") {
      event.preventDefault();
      void refreshKeyboardLayout();
      menuPending = { ...menuPending, capturing: true, hint: "" };
    } else if (event.code === "KeyD") {
      event.preventDefault();
      applyBindings(loadBindings(serializeBindings(DEFAULT_BINDINGS)));
      menuPending = { ...menuPending, hint: "" };
    }
    return;
  }

  const settingsPending = menuPending?.action === "settings" ? menuPending : null;
  const isSettingsArrow = event.code === "ArrowUp" || event.code === "ArrowDown"
    || event.code === "ArrowLeft" || event.code === "ArrowRight";
  if (settingsPending && isSettingsArrow) {
    event.preventDefault();
    if ((event.code === "ArrowUp" || event.code === "ArrowDown") && event.repeat) return;
    const direction = event.code === "ArrowUp" || event.code === "ArrowLeft" ? -1 : 1;
    if (event.code === "ArrowUp" || event.code === "ArrowDown") {
      menuPending = {
        ...settingsPending,
        index: Math.max(0, Math.min(settingsRows.length - 1, settingsPending.index + direction)),
      };
      return;
    }
    const row = settingsRows[settingsPending.index];
    if (!row) return;
    const limits = SETTINGS_LIMITS[row.key];
    const currentSteps = Math.round((settingsPending.draft[row.key] - limits.min) / limits.step);
    const totalSteps = Math.round((limits.max - limits.min) / limits.step);
    const value = Number((limits.min + Math.max(0, Math.min(totalSteps, currentSteps + direction)) * limits.step).toFixed(6));
    menuPending = { ...settingsPending, draft: { ...settingsPending.draft, [row.key]: value } };
    return;
  }

  if (event.repeat) return;
  const digit = /^(?:Digit|Numpad)([1-3])$/.exec(event.code);
  const isEnter = event.code === "Enter" || event.code === "NumpadEnter";
  if (isEnter || digit || (settingsPending && event.code === "KeyD")) event.preventDefault();
  if (settingsPending) {
    if (event.code === "KeyD") {
      menuPending = { ...settingsPending, draft: { ...DEFAULT_SETTINGS } };
      return;
    }
    if (isEnter) {
      sendHost("settings", { ...settingsPending.draft });
      menuPending = null;
      menuOpen = false;
    }
    return;
  }
  if (menuPending) {
    if (menuPending.action === "kickSelect" && digit && latestSnapshot) {
      const targetPlayer = latestSnapshot.players
        .filter((player) => player.playerId !== ownId)
        .sort((a, b) => a.slot - b.slot)[Number(digit[1]) - 1];
      if (targetPlayer) menuPending = { action: "kick", playerId: targetPlayer.playerId, name: targetPlayer.name };
      return;
    }
    if (menuPending.action !== "kickSelect" && isEnter) {
      if (menuPending.action === "kick") sendHost("kick", menuPending.playerId);
      else if (menuPending.action === "regenerate" || menuPending.action === "resetScores") sendHost(menuPending.action);
      menuPending = null;
      menuOpen = false;
    }
    return;
  }

  if (event.code === "KeyC") {
    event.preventDefault();
    void refreshKeyboardLayout();
    menuPending = { action: "controls", index: 0, capturing: false, hint: "" };
    return;
  }
  if (!isOwnHost()) return;
  if (event.code === "KeyS") {
    for (const code of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) pressed.delete(code);
    menuPending = { action: "settings", draft: { ...gameSettings }, index: 0 };
  } else if (event.code === "KeyR") menuPending = { action: "regenerate" };
  else if (event.code === "KeyX") menuPending = { action: "resetScores" };
  else if (event.code === "KeyK" && latestSnapshot) {
    if (latestSnapshot.players.some((player) => player.playerId !== ownId)) {
      menuPending = { action: "kickSelect" };
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
  if (hasServerTimeOffset) {
    projectileServerTime = performance.now() / 1000 + serverTimeOffset - GAME_CONFIG.network.interpolationDelay;
    renderedProjectiles = projectileStore.at(
      projectileServerTime,
      world ?? createEmptyWorld(mapDimensions(gameSettings.mapSize)),
    );
  } else {
    projectileServerTime = 0;
    renderedProjectiles = { shells: [], torpedoes: [] };
  }
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.fillStyle = "#071b2a";
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.setTransform(
    viewport.dpr * viewport.scale,
    0,
    0,
    viewport.dpr * viewport.scale,
    viewport.dpr * viewport.offsetX,
    viewport.dpr * viewport.offsetY,
  );
  const snapshot = getRenderSnapshot();
  const own = predictedOwn ?? snapshot?.frigates.find((frigate) => frigate.playerId === ownId) as Frigate | undefined;
  if (world && own) {
    const camera = computeCamera({ x: own.x, y: own.y }, world);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, GAME_CONFIG.screen.width, GAME_CONFIG.screen.height);
    ctx.clip();
    ctx.translate(-camera.x, -camera.y);
    renderTerrain(
      world,
      camera.x,
      camera.y,
      GAME_CONFIG.screen.width,
      GAME_CONFIG.screen.height,
      viewport.scale,
      viewport.dpr,
    );
    const visible = snapshot?.frigates ?? [];
    const players = snapshot?.players ?? [];
    drawBases(ctx, bases, (ownerId) => {
      const owner = players.find((player) => player.playerId === ownerId);
      return owner ? colours[owner.slot - 1] : undefined;
    });
    drawWakes(visible, serverNow);
    for (const shell of renderedProjectiles.shells) drawShell(shell);
    for (const torpedo of renderedProjectiles.torpedoes) {
      drawTorpedoWake(torpedo);
      drawTorpedo(torpedo);
    }
    for (const frigate of visible) if (frigate.playerId !== ownId) drawFrigate(frigate, serverNow, debugVisible);
    if (own) drawFrigate(own, serverNow, debugVisible);
    for (const effect of effects) drawExplosion(effect, now);
    if (own) drawReticle(own, serverNow);
    if (own) drawCaptureProgress(
      ctx,
      own,
      bases,
      own.playerId,
      gameSettings.captureTime,
      gameSettings.repairTime,
      gameSettings,
    );
    ctx.restore();
  } else {
    ctx.setTransform(viewport.dpr * viewport.scale, 0, 0, viewport.dpr * viewport.scale, 0, 0);
    const logicalWidth = viewport.width / viewport.scale;
    const logicalHeight = viewport.height / viewport.scale;
    ctx.fillStyle = "#071b2a";
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    ctx.fillStyle = "#88adaf";
    ctx.font = "14px DM Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText("CONNECTING TO THE FLEET…", logicalWidth / 2, logicalHeight / 2);
  }
  if (snapshot) {
    ctx.setTransform(viewport.dpr * viewport.scale, 0, 0, viewport.dpr * viewport.scale, 0, 0);
    drawHud(snapshot, own, serverNow, viewport.width / viewport.scale, viewport.height / viewport.scale);
  }
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
