import { GAME_CONFIG } from "../shared/config.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cameraAxis(boat: number, reticle: number, viewport: number, worldSize: number): number {
  const centered = clamp(boat - viewport / 2, 0, worldSize - viewport);
  const minimum = Math.max(
    reticle + GAME_CONFIG.cannon.damageRadius - viewport,
    boat + 35 - viewport,
  );
  const maximum = Math.min(
    reticle - GAME_CONFIG.cannon.damageRadius,
    boat - 35,
  );
  return clamp(centered, minimum, maximum);
}

export function computeCamera(f: { x: number; y: number; heading: number; cannonBearing: number; cannonRange: number }): { x: number; y: number } {
  const aimAngle = f.heading + f.cannonBearing;
  const reticleX = f.x + Math.cos(aimAngle) * f.cannonRange;
  const reticleY = f.y + Math.sin(aimAngle) * f.cannonRange;
  return {
    x: cameraAxis(f.x, reticleX, GAME_CONFIG.screen.width, GAME_CONFIG.world.width),
    y: cameraAxis(f.y, reticleY, GAME_CONFIG.screen.height, GAME_CONFIG.world.height),
  };
}
