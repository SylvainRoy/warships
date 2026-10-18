import { GAME_CONFIG } from "../shared/config.js";
import type { World } from "../shared/world.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeViewport(
  width: number,
  height: number,
): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(
    width / GAME_CONFIG.screen.width,
    height / GAME_CONFIG.screen.height,
  );
  return {
    scale,
    offsetX: (width - GAME_CONFIG.screen.width * scale) / 2,
    offsetY: (height - GAME_CONFIG.screen.height * scale) / 2,
  };
}

export function computeCamera(
  f: { x: number; y: number },
  world: Pick<World, "width" | "height">,
  view: { width: number; height: number } = GAME_CONFIG.screen,
): { x: number; y: number } {
  return {
    x: clamp(f.x - view.width / 2, 0, world.width - view.width),
    y: clamp(f.y - view.height / 2, 0, world.height - view.height),
  };
}
