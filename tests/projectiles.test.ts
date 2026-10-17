import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../src/shared/config.js";
import { ProjectileStore } from "../src/client/projectiles.js";
import type { Shell, Torpedo } from "../src/shared/sim.js";

const shell: Shell = {
  id: "s1",
  ownerId: "p1",
  startX: 10,
  startY: 20,
  impactX: 210,
  impactY: 20,
  elapsed: 0.1,
  duration: 2,
};

const torpedo: Torpedo = {
  id: "t1",
  ownerId: "p1",
  x: 100,
  y: 200,
  angle: Math.PI / 3,
  elapsed: 0.1,
  speed: 120,
};

describe("projectile store", () => {
  it("advances shell elapsed time and prunes it at its duration", () => {
    const store = new ProjectileStore();
    store.apply({ type: "projectiles", serverTime: 10, shells: [shell], torpedoes: [], removed: [] });

    expect(store.at(10.5).shells[0]?.elapsed).toBeCloseTo(0.6);
    expect(store.at(11.9).shells).toHaveLength(0);
  });

  it("moves a torpedo along its stored speed and bearing", () => {
    const store = new ProjectileStore();
    store.apply({ type: "projectiles", serverTime: 10, shells: [], torpedoes: [torpedo], removed: [] });

    const moved = store.at(11).torpedoes[0]!;
    expect(moved.x).toBeCloseTo(torpedo.x + Math.cos(torpedo.angle) * torpedo.speed);
    expect(moved.y).toBeCloseTo(torpedo.y + Math.sin(torpedo.angle) * torpedo.speed);
    expect(moved.elapsed).toBeCloseTo(1.1);
  });

  it("removes ended torpedoes by id", () => {
    const store = new ProjectileStore();
    store.apply({ type: "projectiles", serverTime: 10, shells: [], torpedoes: [torpedo], removed: [] });
    store.apply({ type: "projectiles", serverTime: 10.5, shells: [], torpedoes: [], removed: [torpedo.id] });

    expect(store.at(10.5).torpedoes).toHaveLength(0);
  });

  it("replaces all projectiles on reset", () => {
    const store = new ProjectileStore();
    store.apply({ type: "projectiles", serverTime: 10, shells: [shell], torpedoes: [torpedo], removed: [] });
    store.apply({
      type: "projectiles",
      reset: true,
      serverTime: 11,
      shells: [{ ...shell, id: "s2" }],
      torpedoes: [],
      removed: [],
    });

    expect(store.at(11).shells.map((projectile) => projectile.id)).toEqual(["s2"]);
    expect(store.at(11).torpedoes).toHaveLength(0);
  });

  it("does not return projectiles before their spawn time", () => {
    const store = new ProjectileStore();
    store.apply({ type: "projectiles", serverTime: 10, shells: [shell], torpedoes: [torpedo], removed: [] });

    expect(store.at(9).shells).toHaveLength(0);
    expect(store.at(9).torpedoes).toHaveLength(0);
    expect(store.at(10).shells).toHaveLength(1);
    expect(store.at(10).torpedoes).toHaveLength(1);
  });

  it("prunes torpedoes that leave the world bounds", () => {
    const store = new ProjectileStore();
    store.apply({
      type: "projectiles",
      serverTime: 10,
      shells: [],
      torpedoes: [{ ...torpedo, x: GAME_CONFIG.world.width - 1, angle: 0 }],
      removed: [],
    });

    expect(store.at(10.1).torpedoes).toHaveLength(0);
    expect(store.at(10).torpedoes).toHaveLength(0);
  });
});
