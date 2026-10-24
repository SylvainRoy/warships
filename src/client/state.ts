import type { BasePublic } from "../shared/bases.js";
import { DEFAULT_SETTINGS, type GameSettings } from "../shared/settings.js";
import type { Frigate, FrigateInput, GameEvent, Shell, Torpedo } from "../shared/sim.js";
import type { LobbyMessage, RoundState, ServerMessage, SnapshotFrigate } from "../shared/protocol.js";
import type { World } from "../shared/world.js";
import type { Bindings, KeyboardLayout } from "./controls.js";
import type { EffectsSettings, HitFeedLine, HitNumber } from "./feedback.js";

export type Snapshot = Extract<ServerMessage, { type: "snapshot" }>;
export type StoredSnapshot = { receivedAt: number; value: Snapshot };
export type PendingInput = { input: FrigateInput; sentAt: number };
export type WakeSample = { x: number; y: number; heading: number; speed: number; at: number };
export type WakeObservation = { x: number; y: number; heading: number; status: SnapshotFrigate["status"]; at: number };
export type HostMenuPending =
  | { action: "regenerate" }
  | { action: "resetScores" }
  | { action: "kickSelect" }
  | { action: "kick"; playerId: string; name: string }
  | { action: "settings"; draft: GameSettings; index: number }
  | { action: "teamSelect" };
export type ControlsMenuPending = { action: "controls"; index: number; capturing: boolean; hint: string };
export type EffectsMenuPending = { action: "effects"; index: number };
export type MenuPending = HostMenuPending | ControlsMenuPending | EffectsMenuPending | null;
export type HitMarker = { x: number; y: number; at: number };
export type PendingHitFeed = { targetKey: string; targetId?: string; label: string; amount: number; at: number };
export type PendingSplashSound = { x: number; y: number; timer: number };
export type IncomeNumber = { x: number; y: number; team: number; amount: number; startedAt: number; money?: boolean };

export const client = {
  previousRadarSweepAngle: null as number | null,
  radarSweepOwnerId: null as string | null,
  radarSweepRange: null as number | null,
  radarOwnStatus: null as SnapshotFrigate["status"] | null,
  radarMapCanvas: null as HTMLCanvasElement | null,
  radarMapWorld: null as World | null,
  worldCacheResolution: 0,
  damageVignetteAt: -Infinity,
  reticleFlashAt: -Infinity,
  effectsSettings: { volume: 60, shake: true } as EffectsSettings,
  previousResupplying: null as boolean | null,
  ownSinking: false,
  socket: null as WebSocket | null,
  world: null as World | null,
  bases: [] as BasePublic[],
  ownId: null as string | null,
  latestSnapshot: null as Snapshot | null,
  predictedOwn: null as Frigate | null,
  gameSettings: DEFAULT_SETTINGS as GameSettings,
  round: null as RoundState | null,
  snapshots: [] as StoredSnapshot[],
  renderedProjectiles: { shells: [], torpedoes: [] } as { shells: Shell[]; torpedoes: Torpedo[] },
  projectileServerTime: 0,
  pendingInputs: [] as PendingInput[],
  sequence: 0,
  throttleLevel: 0,
  bindings: {} as Bindings,
  keyboardLayout: undefined as KeyboardLayout | undefined,
  gameCodes: new Set<string>(),
  lobbyState: null as LobbyMessage | null,
  shouldAutoJoin: false,
  joined: false,
  tabHeld: false,
  menuOpen: false,
  upgradeMenuOpen: false,
  menuPending: null as MenuPending,
  debugVisible: false,
  cannonFirePending: false,
  torpedoFirePending: false,
  lastTickAt: 0,
  accumulator: 0,
  lastFrameAt: 0,
  fps: 0,
  fpsFrames: 0,
  fpsStartedAt: 0,
  ping: 0,
  lastPingAt: 0,
  serverTimeOffset: 0,
  hasServerTimeOffset: false,
  reconnectTimer: undefined as number | undefined,
  reconnectForLobby: false,
};
