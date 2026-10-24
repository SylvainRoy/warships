import { GAME_CONFIG } from "../shared/config.js";

export function throttleWaveOffsets(throttle: unknown): number[] {
  const level = typeof throttle === "number" && Number.isFinite(throttle)
    ? Math.max(-1, Math.min(3, Math.round(throttle) || 0))
    : 0;
  if (level === 0) return [];
  if (level < 0) return [GAME_CONFIG.effects.throttleWave.sternX];
  return Array.from(
    { length: level },
    (_, index) => GAME_CONFIG.effects.throttleWave.bowStartX + index * GAME_CONFIG.effects.throttleWave.spacing,
  );
}
