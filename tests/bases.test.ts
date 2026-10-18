import { describe, expect, it } from "vitest";
import { hullInsideHarbour, placeBases } from "../src/shared/bases.js";
import { GAME_CONFIG } from "../src/shared/config.js";
import { createGameState, createFrigate, stepBases, stepGame, type Frigate } from "../src/shared/sim.js";
import { DEFAULT_SETTINGS } from "../src/shared/settings.js";
import { generateWorld, type World } from "../src/shared/world.js";

const tileSize = GAME_CONFIG.world.tileSize;

function expectValidPlacement(world: World, sites: ReturnType<typeof placeBases>, neutralCount: number): void {
  expect(sites).not.toBeNull();
  const bases = sites!;
  expect(bases.filter((base) => base.kind === "home")).toHaveLength(4);
  expect(bases.filter((base) => base.kind === "neutral")).toHaveLength(neutralCount);
  for (let first = 0; first < bases.length; first += 1) {
    for (let second = first + 1; second < bases.length; second += 1) {
      expect(Math.hypot(
        bases[first]!.harbourX - bases[second]!.harbourX,
        bases[first]!.harbourY - bases[second]!.harbourY,
      )).toBeGreaterThanOrEqual(GAME_CONFIG.bases.minSpacing);
    }
  }
  for (const base of bases) {
    const harbourLeft = base.harbourX - GAME_CONFIG.bases.harbourSize / 2;
    const harbourTop = base.harbourY - GAME_CONFIG.bases.harbourSize / 2;
    for (let y = harbourTop; y < harbourTop + GAME_CONFIG.bases.harbourSize; y += tileSize) {
      for (let x = harbourLeft; x < harbourLeft + GAME_CONFIG.bases.harbourSize; x += tileSize) {
        expect(world.grid[(y / tileSize) * GAME_CONFIG.world.columns + x / tileSize]).toBe(0);
      }
    }
    const cityLeft = base.cityX - GAME_CONFIG.bases.citySize / 2;
    const cityTop = base.cityY - GAME_CONFIG.bases.citySize / 2;
    const right = base.cityX + GAME_CONFIG.bases.citySize / 2;
    const bottom = base.cityY + GAME_CONFIG.bases.citySize / 2;
    for (let row = Math.floor(cityTop / tileSize); row < Math.ceil(bottom / tileSize); row += 1) {
      for (let column = Math.floor(cityLeft / tileSize); column < Math.ceil(right / tileSize); column += 1) {
        expect(world.grid[row * GAME_CONFIG.world.columns + column]).toBe(1);
      }
    }
  }
}

function openWorld(): World {
  return { seed: 1, grid: new Uint8Array(GAME_CONFIG.world.columns * GAME_CONFIG.world.rows) };
}

function neutralSite(id = "n0") {
  return {
    id,
    kind: "neutral" as const,
    homeSlot: null,
    cityX: 5000,
    cityY: 4500,
    harbourX: 5050,
    harbourY: 4500,
    facing: 0,
  };
}

function ship(id: string, x = 5050, y = 4500): Frigate {
  const frigate = createFrigate(id, id, id === "captain" ? 1 : 2, x, y, 0, 0);
  frigate.spawnProtectedUntil = 0;
  return frigate;
}

describe("base placement", () => {
  it.each([11, 73, 512])("places deterministic, spaced bases in seed %i", (seed) => {
    const world = generateWorld(seed, 0.25);
    const sites = placeBases(world, 4);
    expectValidPlacement(world, sites, 4);
    expect(placeBases(world, 4)).toEqual(sites);
  });

  it("supports zero and eight neutral bases at 25% land coverage", () => {
    const world = generateWorld(173, 0.25);
    expectValidPlacement(world, placeBases(world, 0), 0);
    expectValidPlacement(world, placeBases(world, 8), 8);
  });

  it("requires the complete frigate hull to fit in the harbour", () => {
    const base = neutralSite();
    expect(hullInsideHarbour(ship("inside"), base)).toBe(true);
    expect(hullInsideHarbour(ship("outside", base.harbourX + 20, base.harbourY), base)).toBe(false);
  });
});

describe("base capture", () => {
  it("captures after the configured fraction of time without changing score", () => {
    const state = createGameState(openWorld(), [neutralSite()]);
    const captain = ship("captain");
    state.settings = { ...DEFAULT_SETTINGS, captureTime: 2 };
    state.frigates[captain.playerId] = captain;
    state.scores[captain.playerId] = {
      playerId: captain.playerId, name: captain.name, slot: captain.slot, score: 0, sunk: 0, host: false, connected: true,
    };
    stepGame(state, {}, 1, 0);
    expect(state.bases[0]?.captureProgress).toBe(0.5);
    stepGame(state, {}, 1, 1);
    expect(state.bases[0]?.ownerId).toBe(captain.playerId);
    expect(state.bases[0]?.captureProgress).toBe(0);
    expect(state.events).toContainEqual({
      type: "capture",
      playerId: captain.playerId,
      name: captain.name,
      message: `${captain.name} captured a base`,
    });
    expect(state.scores[captain.playerId]?.score).toBe(0);
  });

  it("resets on departure, multiple occupants, ownership, inactivity, and home sites", () => {
    const site = neutralSite();
    const state = createGameState(openWorld(), [site]);
    const captain = ship("captain");
    state.frigates[captain.playerId] = captain;
    state.bases[0]!.captureBy = captain.playerId;
    state.bases[0]!.captureProgress = 0.4;

    captain.x += 100;
    stepBases(state, 1, 0);
    expect(state.bases[0]).toMatchObject({ captureBy: null, captureProgress: 0 });

    captain.x = site.harbourX;
    state.bases[0]!.captureBy = captain.playerId;
    state.bases[0]!.captureProgress = 0.4;
    state.frigates.other = ship("other");
    stepBases(state, 1, 0);
    expect(state.bases[0]).toMatchObject({ captureBy: null, captureProgress: 0 });
    delete state.frigates.other;

    state.bases[0]!.ownerId = captain.playerId;
    state.bases[0]!.captureBy = captain.playerId;
    state.bases[0]!.captureProgress = 0.4;
    stepBases(state, 1, 0);
    expect(state.bases[0]).toMatchObject({ captureBy: null, captureProgress: 0 });
    state.bases[0]!.ownerId = null;
    state.bases[0]!.active = false;
    stepBases(state, 1, 0);
    expect(state.bases[0]).toMatchObject({ captureBy: null, captureProgress: 0 });

    const home = { ...site, id: "h0", kind: "home" as const, homeSlot: 0 };
    const homeState = createGameState(openWorld(), [home]);
    homeState.bases[0]!.active = true;
    homeState.frigates.captain = captain;
    stepBases(homeState, 1, 0);
    expect(homeState.bases[0]).toMatchObject({ captureBy: null, captureProgress: 0, ownerId: null });
  });

  it("keeps capture progress as a fraction when capture time changes", () => {
    const state = createGameState(openWorld(), [neutralSite()]);
    const captain = ship("captain");
    state.settings = { ...DEFAULT_SETTINGS, captureTime: 4 };
    state.frigates[captain.playerId] = captain;
    stepBases(state, 2, 0);
    expect(state.bases[0]?.captureProgress).toBe(0.5);
    state.settings.captureTime = 8;
    stepBases(state, 4, 1);
    expect(state.bases[0]?.ownerId).toBe(captain.playerId);
  });
});
