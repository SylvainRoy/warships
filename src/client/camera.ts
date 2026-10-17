import { GAME_CONFIG } from "../shared/config.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeCamera(f: { x: number; y: number }): { x: number; y: number } {
  return {
    x: clamp(f.x - GAME_CONFIG.screen.width / 2, 0, GAME_CONFIG.world.width - GAME_CONFIG.screen.width),
    y: clamp(f.y - GAME_CONFIG.screen.height / 2, 0, GAME_CONFIG.world.height - GAME_CONFIG.screen.height),
  };
}
