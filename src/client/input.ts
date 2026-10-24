import { GAME_CONFIG } from "../shared/config.js";
import { INPUT_KEYS, applyFrigateInput, type FrigateInput } from "../shared/sim.js";
import { createEmptyWorld, mapDimensions } from "../shared/world.js";
import {
  actionForCode,
  assignBinding,
  BINDINGS_STORAGE_KEY,
  bindingLabel,
  CONTROL_ACTIONS,
  DEFAULT_BINDINGS,
  loadBindings,
  RESERVED_CODES,
  serializeBindings,
  type Bindings,
  type ControlAction,
  type KeyboardLayout,
} from "./controls.js";
import { renderLobbyControlsHelp } from "./lobby.js";
import { audio } from "./gameEvents.js";
import { client } from "./state.js";

export function storedBindings(): string | null {
  try {
    return localStorage.getItem(BINDINGS_STORAGE_KEY);
  } catch {
    return null;
  }
}

export const pressed = new Set<string>();

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

export function rebuildGameCodes(): void {
  client.gameCodes = new Set([
    ...CONTROL_ACTIONS.flatMap(({ action }) => client.bindings[action]),
    ...RESERVED_CODES,
  ]);
}

export function applyBindings(next: Bindings, persist = true): void {
  client.bindings = next;
  pressed.clear();
  client.cannonFirePending = false;
  client.torpedoFirePending = false;
  rebuildGameCodes();
  if (persist) {
    try {
      localStorage.setItem(BINDINGS_STORAGE_KEY, serializeBindings(client.bindings));
    } catch {
      // Keep the session's binding even if browser storage is unavailable.
    }
  }
  renderLobbyControlsHelp();
}

export async function refreshKeyboardLayout(): Promise<void> {
  const keyboard = (navigator as Navigator & {
    keyboard?: { getLayoutMap?: () => Promise<KeyboardLayout> };
  }).keyboard;
  if (!keyboard?.getLayoutMap) return;
  try {
    client.keyboardLayout = await keyboard.getLayoutMap();
    renderLobbyControlsHelp();
  } catch {
    client.keyboardLayout = undefined;
    renderLobbyControlsHelp();
  }
}

export function clearPressedAndSendNeutral(): void {
  pressed.clear();
  client.tabHeld = false;
  client.cannonFirePending = false;
  client.torpedoFirePending = false;
  if (!client.joined || client.socket?.readyState !== WebSocket.OPEN) return;
  const input = nextInput();
  client.pendingInputs.push({ input, sentAt: performance.now() });
  client.socket.send(JSON.stringify({ type: "input", ...input }));
}

export function nextInput(): FrigateInput {
  let keys = 0;
  if (!client.menuOpen) {
    for (const { action } of CONTROL_ACTIONS) {
      const bit = inputBitsByAction[action];
      if (bit !== undefined && client.bindings[action].some((code) => pressed.has(code))) keys |= bit;
    }
  }
  return {
    seq: ++client.sequence,
    keys,
    throttle: client.throttleLevel,
    fireCannon: !client.menuOpen && client.cannonFirePending,
    fireTorpedo: !client.menuOpen && client.torpedoFirePending,
  };
}

export function simulationTick(): void {
  if (!client.joined || client.socket?.readyState !== WebSocket.OPEN || !client.world) {
    client.cannonFirePending = false;
    client.torpedoFirePending = false;
    return;
  }
  if (client.round?.phase === "over") {
    client.cannonFirePending = false;
    client.torpedoFirePending = false;
    client.pendingInputs = [];
    return;
  }
  const input = nextInput();
  client.cannonFirePending = false;
  client.torpedoFirePending = false;
  if (client.predictedOwn) {
    client.predictedOwn = applyFrigateInput(
      client.predictedOwn,
      input,
      1 / GAME_CONFIG.network.tickRate,
      client.world,
      performance.now() / 1000 + client.serverTimeOffset,
      client.gameSettings,
    );
  }
  client.pendingInputs.push({ input, sentAt: performance.now() });
  client.socket.send(JSON.stringify({ type: "input", ...input }));
}

export function initializeBindings(): void {
  client.bindings = loadBindings(storedBindings());
  client.lastTickAt = performance.now();
  client.lastFrameAt = performance.now();
  client.fpsStartedAt = performance.now();
}

export function initializeInputUi(): void {
  rebuildGameCodes();
  renderLobbyControlsHelp();
  void refreshKeyboardLayout();
}

export function registerInputListeners(): void {
window.addEventListener("keydown", (event) => {
  audio.resumeOnGesture();
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (!client.joined || isTyping) return;
  if (client.round?.phase === "over" && event.code !== "Escape" && event.code !== "Tab") {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  const capturePending = client.menuOpen && client.menuPending?.action === "controls" && client.menuPending.capturing
    ? client.menuPending
    : null;
  if (capturePending) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    if (event.code === "Escape") {
      client.menuPending = { ...capturePending, capturing: false, hint: "" };
      return;
    }
    if (RESERVED_CODES.has(event.code)) {
      client.menuPending = { ...capturePending, hint: "Esc, Tab and F3 can't be assigned" };
      return;
    }
    const row = CONTROL_ACTIONS[capturePending.index];
    if (!row) return;
    applyBindings(assignBinding(client.bindings, row.action, event.code));
    client.menuPending = { ...capturePending, capturing: false, hint: "" };
    return;
  }
  if (client.gameCodes.has(event.code)) event.preventDefault();
  if (event.code === "F3" && !event.repeat) {
    client.debugVisible = !client.debugVisible;
    return;
  }
  if (event.code === "Tab") {
    client.tabHeld = true;
    return;
  }
  if (event.code === "Escape" && !event.repeat) {
    if (client.menuPending) {
      client.menuPending = null;
      return;
    }
    client.menuOpen = !client.menuOpen;
    if (client.menuOpen) {
      pressed.clear();
      client.cannonFirePending = false;
      client.torpedoFirePending = false;
    }
    return;
  }
  if (!client.gameCodes.has(event.code) || client.menuOpen) return;
  if (event.repeat) return;
  const action = actionForCode(client.bindings, event.code);
  if (action === "throttleUp") {
    client.throttleLevel = Math.min(3, client.throttleLevel + 1);
    if (client.predictedOwn?.status === "alive") client.predictedOwn.throttle = client.throttleLevel;
    return;
  }
  if (action === "throttleDown") {
    client.throttleLevel = Math.max(-1, client.throttleLevel - 1);
    if (client.predictedOwn?.status === "alive") client.predictedOwn.throttle = client.throttleLevel;
    return;
  }
  if (action === "fireCannon") client.cannonFirePending = true;
  if (action === "fireTorpedo") client.torpedoFirePending = true;
  pressed.add(event.code);
});

window.addEventListener("keyup", (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  const isCapturing = client.menuOpen && client.menuPending?.action === "controls" && client.menuPending.capturing;
  if (client.joined && !isTyping && (client.gameCodes.has(event.code) || isCapturing)) event.preventDefault();
  pressed.delete(event.code);
  if (event.code === "Tab") client.tabHeld = false;
});

window.addEventListener("blur", clearPressedAndSendNeutral);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearPressedAndSendNeutral();
});
}
