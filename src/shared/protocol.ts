import type { FrigateInput, GameEvent, Frigate, Shell, Torpedo, PlayerScore } from "./sim.js";
import type { Base, BaseSnapshot } from "./bases.js";
import type { GameSettings } from "./settings.js";

export type HostAction =
  | { action: "regenerate" }
  | { action: "resetScores" }
  | { action: "kick"; target: string }
  | { action: "settings"; settings: GameSettings };

export type ClientMessage =
  | { type: "hello" }
  | { type: "join"; name: string; token?: string }
  | ({ type: "input" } & FrigateInput)
  | ({ type: "host" } & HostAction);

export type LobbyMessage = {
  type: "lobby";
  players: Array<{ playerId: string; name: string; slot: number; host: boolean; connected: boolean }>;
  freeSlots: number;
  full: boolean;
};

export type SnapshotFrigate = Pick<
  Frigate,
  "playerId" | "name" | "slot" | "x" | "y" | "heading" | "hp" | "status" | "sinkingStartedAt" | "spawnProtectedUntil"
> & Partial<Omit<Frigate, "playerId" | "name" | "slot" | "x" | "y" | "heading" | "hp" | "status" | "sinkingStartedAt" | "spawnProtectedUntil">>;

export type ServerMessage =
  | LobbyMessage
  | { type: "welcome"; playerId: string; token: string; slot: number; world: number[]; bases: Base[]; settings: GameSettings }
  | { type: "settings"; settings: GameSettings }
  | { type: "world"; world: number[]; bases: Base[] }
  | { type: "projectiles"; serverTime: number; shells: Shell[]; torpedoes: Torpedo[]; removed: string[]; reset?: true }
  | {
      type: "snapshot";
      tick: number;
      ackSeq: number;
      serverTime: number;
      frigates: SnapshotFrigate[];
      players: PlayerScore[];
      bases: BaseSnapshot[];
    }
  | { type: "event"; event: GameEvent }
  | { type: "error"; code: "name_taken" | "full" | "invalid_name" | "not_host" | "invalid_action" | "kicked" };
