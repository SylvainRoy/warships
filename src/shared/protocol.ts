import type { FrigateInput, GameEvent, Frigate, Shell, Torpedo, PlayerScore } from "./sim.js";
import type { BasePublic, BaseSnapshot } from "./bases.js";
import type { GameSettings } from "./settings.js";

export type HostAction =
  | { action: "regenerate" }
  | { action: "resetScores" }
  | { action: "kick"; target: string }
  | { action: "settings"; settings: GameSettings };

export type ClientMessage =
  | { type: "hello" }
  | { type: "join"; name: string; token?: string; team?: number }
  | { type: "team"; team: number }
  | ({ type: "input" } & FrigateInput)
  | ({ type: "host" } & HostAction);

export type LobbyMessage = {
  type: "lobby";
  players: Array<{ playerId: string; name: string; slot: number; team: number; host: boolean; connected: boolean; bot?: true }>;
  freeSlots: number;
  full: boolean;
};

export type SnapshotFrigate = Pick<
  Frigate,
  "playerId" | "name" | "slot" | "team" | "x" | "y" | "heading" | "hp" | "status" | "sinkingStartedAt" | "spawnProtectedUntil"
> & Partial<Omit<Frigate, "playerId" | "name" | "slot" | "team" | "x" | "y" | "heading" | "hp" | "status" | "sinkingStartedAt" | "spawnProtectedUntil">>;

export interface RoundResult {
  playerId: string;
  name: string;
  slot: number;
  team: number;
  score: number;
  sinks: number;
  deaths: number;
  shots: number;
  hits: number;
  bases: number;
}

export type RoundState =
  | { phase: "playing"; endsAt: number | null }
  | { phase: "over"; results: RoundResult[]; winners: string[]; teamScores: number[]; winnerTeams: number[]; nextRoundAt: number };

export type ServerMessage =
  | LobbyMessage
  | { type: "welcome"; playerId: string; token: string; slot: number; team: number; world: number[]; columns: number; rows: number; bases: BasePublic[]; settings: GameSettings; round: RoundState }
  | { type: "round"; round: RoundState }
  | { type: "settings"; settings: GameSettings }
  | { type: "world"; world: number[]; columns: number; rows: number; bases: BasePublic[] }
  | { type: "projectiles"; serverTime: number; shells: Shell[]; torpedoes: Torpedo[]; removed: string[]; reset?: true }
  | {
      type: "snapshot";
      tick: number;
      ackSeq: number;
      serverTime: number;
      frigates: SnapshotFrigate[];
      players: PlayerScore[];
      teamBonus: number[];
      bases?: BaseSnapshot[];
    }
  | { type: "event"; event: GameEvent }
  | { type: "error"; code: "name_taken" | "full" | "invalid_name" | "not_host" | "invalid_action" | "cooldown" | "kicked" };
