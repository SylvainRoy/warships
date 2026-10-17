import { describe, expect, it } from "vitest";
import { computeCamera } from "../src/client/camera.js";
import { GAME_CONFIG } from "../src/shared/config.js";

const { screen, world, cannon } = GAME_CONFIG;

function expectBoatAndReticleVisible(frigate: { x: number; y: number; heading: number; cannonBearing: number; cannonRange: number }): void {
  const camera = computeCamera(frigate);
  const angle = frigate.heading + frigate.cannonBearing;
  const reticleX = frigate.x + Math.cos(angle) * frigate.cannonRange;
  const reticleY = frigate.y + Math.sin(angle) * frigate.cannonRange;
  expect(camera.x).toBeLessThanOrEqual(frigate.x - 35);
  expect(camera.x + screen.width).toBeGreaterThanOrEqual(frigate.x + 35);
  expect(camera.y).toBeLessThanOrEqual(frigate.y - 35);
  expect(camera.y + screen.height).toBeGreaterThanOrEqual(frigate.y + 35);
  expect(camera.x).toBeLessThanOrEqual(reticleX - cannon.damageRadius);
  expect(camera.x + screen.width).toBeGreaterThanOrEqual(reticleX + cannon.damageRadius);
  expect(camera.y).toBeLessThanOrEqual(reticleY - cannon.damageRadius);
  expect(camera.y + screen.height).toBeGreaterThanOrEqual(reticleY + cannon.damageRadius);
}

describe("computeCamera", () => {
  it("keeps the boat and cannon reticle visible for every heading, bearing, and supported range", () => {
    expect(cannon.maxRange + cannon.damageRadius + 35).toBeLessThanOrEqual(Math.min(screen.width, screen.height));
    const frigate = { x: world.width / 2, y: world.height / 2, cannonRange: 100, heading: 0, cannonBearing: 0 };
    for (const heading of [0, 1.1]) {
      for (const cannonRange of [100, 450, 800]) {
        for (let degrees = 0; degrees < 360; degrees += 5) {
          expectBoatAndReticleVisible({ ...frigate, heading, cannonRange, cannonBearing: degrees * Math.PI / 180 });
        }
      }
    }
  });

  it("keeps the camera centered on a small-range reticle away from world edges", () => {
    const frigate = { x: world.width / 2, y: world.height / 2, heading: 0, cannonBearing: 0, cannonRange: 100 };
    expect(computeCamera(frigate)).toEqual({
      x: frigate.x - screen.width / 2,
      y: frigate.y - screen.height / 2,
    });
  });

  it("keeps the boat and an in-world reticle visible near the world origin", () => {
    const frigate = { x: 100, y: 100, heading: 0, cannonBearing: 0, cannonRange: 100 };
    const camera = computeCamera(frigate);
    expect(camera.x).toBeGreaterThanOrEqual(0);
    expect(camera.y).toBeGreaterThanOrEqual(0);
    expectBoatAndReticleVisible(frigate);
  });

  it("moves outside the world to keep an out-of-world reticle visible", () => {
    const frigate = { x: 100, y: 100, heading: 0, cannonBearing: -3 * Math.PI / 4, cannonRange: 800 };
    const reticleX = frigate.x + Math.cos(frigate.heading + frigate.cannonBearing) * frigate.cannonRange;
    const reticleY = frigate.y + Math.sin(frigate.heading + frigate.cannonBearing) * frigate.cannonRange;
    const camera = computeCamera(frigate);
    expect(reticleX).toBeLessThan(0);
    expect(reticleY).toBeLessThan(0);
    expect(camera.x).toBeLessThan(0);
    expect(camera.y).toBeLessThan(0);
    expectBoatAndReticleVisible(frigate);
  });
});
