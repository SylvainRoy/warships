import { describe, expect, it } from "vitest";
import { computeCamera, computeViewport } from "../src/client/camera.js";
import { GAME_CONFIG } from "../src/shared/config.js";

const { screen, world } = GAME_CONFIG;

describe("computeViewport", () => {
  it("covers the window without showing more than the reference view", () => {
    for (const { width, height } of [
      { width: 1600, height: 900 },
      { width: 2048, height: 900 },
      { width: 1200, height: 900 },
    ]) {
      const viewport = computeViewport(width, height);
      expect(viewport.viewWidth).toBeLessThanOrEqual(screen.width);
      expect(viewport.viewHeight).toBeLessThanOrEqual(screen.height);
      expect(
        Math.abs(viewport.viewWidth - screen.width) < 1e-6
        || Math.abs(viewport.viewHeight - screen.height) < 1e-6,
      ).toBe(true);
    }

    expect(computeViewport(2048, 900).viewHeight).toBeCloseTo(703.125);
  });

  it("uses CSS viewport dimensions independently from device pixel ratio", () => {
    expect(computeViewport(1440, 900)).toEqual({
      worldScale: 1,
      hudScale: 0.9,
      viewWidth: 1440,
      viewHeight: 900,
    });
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
    expect(computeCamera(frigate)).toEqual({
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
      const camera = computeCamera(frigate);
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

    expect(computeCamera(frigate)).toEqual(computeCamera(otherAim));
  });

  it("centers and clamps using the visible viewport", () => {
    for (const view of [{ width: 1600, height: 703.125 }, { width: 1200, height: 900 }]) {
      const center = computeCamera({ x: world.width / 2, y: world.height / 2 }, view);
      expect(center).toEqual({
        x: world.width / 2 - view.width / 2,
        y: world.height / 2 - view.height / 2,
      });

      const corners = [
        { frigate: { x: 10, y: 10 }, expected: { x: 0, y: 0 } },
        { frigate: { x: world.width - 10, y: 10 }, expected: { x: world.width - view.width, y: 0 } },
        { frigate: { x: 10, y: world.height - 10 }, expected: { x: 0, y: world.height - view.height } },
        {
          frigate: { x: world.width - 10, y: world.height - 10 },
          expected: { x: world.width - view.width, y: world.height - view.height },
        },
      ];
      for (const { frigate, expected } of corners) {
        const camera = computeCamera(frigate, view);
        expect(camera).toEqual(expected);
        expect(camera.x).toBeGreaterThanOrEqual(0);
        expect(camera.x).toBeLessThanOrEqual(world.width - view.width);
        expect(camera.y).toBeGreaterThanOrEqual(0);
        expect(camera.y).toBeLessThanOrEqual(world.height - view.height);
      }
    }
  });
});
