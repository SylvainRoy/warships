import { GAME_CONFIG } from "../shared/config.js";
import type { GameEvent } from "../shared/sim.js";

export const EFFECTS_STORAGE_KEY = "warships.effects";

export interface EffectsSettings {
  volume: number;
  shake: boolean;
}

export interface HitNumber {
  targetKey: string;
  x: number;
  y: number;
  amount: number;
  startedAt: number;
  mergedAt: number;
}

export interface HitFeedLine {
  targetKey: string;
  label: string;
  amount: number;
  at: number;
}

export const DEFAULT_EFFECTS_SETTINGS: EffectsSettings = {
  volume: GAME_CONFIG.effects.defaultVolume,
  shake: GAME_CONFIG.effects.defaultShake,
};

export function parseEffectsSettings(serialized: string | null): EffectsSettings {
  if (serialized === null) return { ...DEFAULT_EFFECTS_SETTINGS };
  try {
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_EFFECTS_SETTINGS };
    const stored = value as Record<string, unknown>;
    const volume = typeof stored.volume === "number"
      && Number.isInteger(stored.volume)
      && stored.volume >= 0
      && stored.volume <= 100
      && stored.volume % GAME_CONFIG.effects.volumeStep === 0
      ? stored.volume
      : DEFAULT_EFFECTS_SETTINGS.volume;
    return {
      volume,
      shake: typeof stored.shake === "boolean" ? stored.shake : DEFAULT_EFFECTS_SETTINGS.shake,
    };
  } catch {
    return { ...DEFAULT_EFFECTS_SETTINGS };
  }
}

export function damageTargetKey(event: Pick<GameEvent, "targetId" | "baseId">): string | null {
  if (event.baseId) return `turret:${event.baseId}`;
  return event.targetId ? `frigate:${event.targetId}` : null;
}

export function mergeHitNumber(
  current: HitNumber | undefined,
  incoming: Omit<HitNumber, "startedAt" | "mergedAt">,
  now: number,
  mergeWindowMs = GAME_CONFIG.effects.hitMergeWindowMs,
): HitNumber {
  if (current && current.targetKey === incoming.targetKey && now - current.mergedAt <= mergeWindowMs) {
    return {
      ...current,
      x: incoming.x,
      y: incoming.y,
      amount: current.amount + incoming.amount,
      mergedAt: now,
    };
  }
  return { ...incoming, startedAt: now, mergedAt: now };
}

export function mergeHitFeedLine(
  lines: readonly HitFeedLine[],
  incoming: Omit<HitFeedLine, "at">,
  now: number,
  mergeWindowMs = GAME_CONFIG.effects.feedMergeWindowMs,
): HitFeedLine[] {
  let match = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line?.targetKey === incoming.targetKey && now - line.at <= mergeWindowMs) {
      match = index;
      break;
    }
  }
  if (match < 0) return [...lines, { ...incoming, at: now }].slice(-8);
  return lines.map((line, index) => index === match
    ? { ...incoming, amount: line.amount + incoming.amount, at: now }
    : line);
}

export function formatHitFeedLine(line: HitFeedLine): string {
  return `${line.label} (−${line.amount})`;
}
