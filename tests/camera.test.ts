import { describe, expect, it } from "vitest";
import { computeCamera, computeViewport } from "../src/client/camera.js";
import { GAME_CONFIG } from "../src/shared/config.js";
import { mapDimensions } from "../src/shared/world.js";

const { screen } = GAME_CONFIG;
const world = mapDimensions(2);

describe("computeViewport", () => {
  it("fits the reference frame and centers it in non-16:9 windows", () => {
    expect(computeViewport(1600, 900)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    expect(computeViewport(2048, 900)).toEqual({ scale: 1, offsetX: 224, offsetY: 0 });
    expect(computeViewport(1200, 900)).toEqual({ scale: 0.75, offsetX: 0, offsetY: 112.5 });
  });
});

describe("computeCamera", () => {
  it("centers on the frigate away from world edges, even when the max-range sight is aimed north", () => {
    const frigate = {
      x: world.width / 2,
      y: world.height / 2,
      heading: 0,
      cannonBearing: -Math.PI / 2,
      cannonRange: 800,
    };
    expect(computeCamera(frigate, world)).toEqual({
      x: frigate.x - screen.width / 2,
      y: frigate.y - 450,
    });
  });

  it("clamps near each world corner without leaving the world bounds", () => {
    const corners = [
      { frigate: { x: 10, y: 10 }, expected: { x: 0, y: 0 } },
      { frigate: { x: world.width - 10, y: 10 }, expected: { x: world.width - screen.width, y: 0 } },
      { frigate: { x: 10, y: world.height - 10 }, expected: { x: 0, y: world.height - screen.height } },
      { frigate: { x: world.width - 10, y: world.height - 10 }, expected: { x: world.width - screen.width, y: world.height - screen.height } },
    ];

    for (const { frigate, expected } of corners) {
      const camera = computeCamera(frigate, world);
      expect(camera).toEqual(expected);
      expect(camera.x).toBeGreaterThanOrEqual(0);
      expect(camera.x).toBeLessThanOrEqual(world.width - screen.width);
      expect(camera.y).toBeGreaterThanOrEqual(0);
      expect(camera.y).toBeLessThanOrEqual(world.height - screen.height);
    }
  });

  it("does not depend on cannon bearing or range", () => {
    const frigate = { x: world.width / 2, y: world.height / 2, heading: 0, cannonBearing: 0, cannonRange: 100 };
    const otherAim = { ...frigate, cannonBearing: Math.PI / 2, cannonRange: 800 };

    expect(computeCamera(frigate, world)).toEqual(computeCamera(otherAim, world));
  });

});
