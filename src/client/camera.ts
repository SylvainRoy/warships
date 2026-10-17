import { GAME_CONFIG } from "../shared/config.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeViewport(
  width: number,
  height: number,
): { worldScale: number; hudScale: number; viewWidth: number; viewHeight: number } {
  const widthScale = width / GAME_CONFIG.screen.width;
  const heightScale = height / GAME_CONFIG.screen.height;
  const worldScale = Math.max(widthScale, heightScale);
  const hudScale = Math.min(widthScale, heightScale);
  return {
    worldScale,
    hudScale,
    viewWidth: width / worldScale,
    viewHeight: height / worldScale,
  };
}

export function computeCamera(
  f: { x: number; y: number },
  view: { width: number; height: number } = GAME_CONFIG.screen,
): { x: number; y: number } {
  return {
    x: clamp(f.x - view.width / 2, 0, GAME_CONFIG.world.width - view.width),
    y: clamp(f.y - view.height / 2, 0, GAME_CONFIG.world.height - view.height),
  };
}
