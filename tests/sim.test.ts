import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../src/shared/config.js";
import { applyFrigateInput, createGameState, createFrigate, createSeededRandom, INPUT_KEYS, pointToHullDistance, regenerateGameWorld, spawnFrigate, stepGame, type Frigate, type FrigateInput } from "../src/shared/sim.js";
import type { World } from "../src/shared/world.js";

const dt = 1 / GAME_CONFIG.network.tickRate;
const quietInput: FrigateInput = { seq: 0, keys: 0, throttle: 0, fireCannon: false, fireTorpedo: false };

function openWorld(): World {
  return { seed: 1, grid: new Uint8Array(GAME_CONFIG.world.columns * GAME_CONFIG.world.rows) };
}

function frigate(id: string, x = 5000, y = 4500, heading = 0): Frigate {
  const ship = createFrigate(id, id, 1, x, y, heading, 0);
  ship.spawnProtectedUntil = 0;
  return ship;
}

function scores(...ships: Frigate[]) {
  return Object.fromEntries(ships.map((ship) => [ship.playerId, {
    playerId: ship.playerId, name: ship.name, slot: ship.slot, score: 0, sunk: 0, host: false, connected: true,
  }]));
}

describe("frigate movement and land contact", () => {
  it("uses five throttle settings, clamps and rounds levels, and turns while stopped", () => {
    const world = openWorld();
    let ship = frigate("captain");
    for (let tick = 0; tick < 60; tick += 1) ship = awaitApply(ship, { ...quietInput, throttle: 3 }, dt, world, tick * dt);
    expect(ship.speed).toBeCloseTo(80);
    for (let tick = 60; tick < 120; tick += 1) ship = awaitApply(ship, { ...quietInput, throttle: 3 }, dt, world, tick * dt);
    expect(ship.speed).toBe(80);

    ship.speed = 80;
    for (let tick = 0; tick < 60; tick += 1) ship = awaitApply(ship, quietInput, dt, world, tick * dt);
    expect(ship.speed).toBe(0);

    let reverse = frigate("reverse");
    for (let tick = 0; tick < 60; tick += 1) reverse = awaitApply(reverse, { ...quietInput, throttle: -1 }, dt, world, tick * dt);
    expect(reverse.speed).toBe(-25);

    let oneThird = frigate("one-third");
    for (let tick = 0; tick < 60; tick += 1) oneThird = awaitApply(oneThird, { ...quietInput, throttle: 1 }, dt, world, tick * dt);
    expect(oneThird.speed).toBeCloseTo(80 / 3);

    for (const throttle of [7, 2.6]) {
      let clamped = frigate(`clamped-${throttle}`);
      for (let tick = 0; tick < 60; tick += 1) clamped = awaitApply(clamped, { ...quietInput, throttle }, dt, world, tick * dt);
      expect(clamped.speed).toBe(80);
    }

    let turning = frigate("turning");
    for (let tick = 0; tick < 30; tick += 1) {
      turning = awaitApply(turning, { ...quietInput, keys: INPUT_KEYS.turnRight }, dt, world, tick * dt);
    }
    expect(turning.heading).toBeCloseTo(Math.PI / 4, 5);
    expect(turning.speed).toBe(0);
  });

  it("scales head-on coast damage by impact speed and ignores shallow slides", () => {
    const world = openWorld();
    const wallColumn = 100;
    for (let row = 0; row < GAME_CONFIG.world.rows; row += 1) world.grid[row * GAME_CONFIG.world.columns + wallColumn] = 1;
    let ship = frigate("coast", 1970, 4500);
    ship.speed = 80;
    ship = awaitApply(ship, { ...quietInput, throttle: 3 }, dt, world, 0);
    expect(ship.hp).toBe(80);

    let slower = frigate("slower", 1970, 4500);
    slower.speed = 80 / 3;
    slower = awaitApply(slower, { ...quietInput, throttle: 1 }, dt, world, 0);
    expect(slower.hp).toBe(93);

    let slider = frigate("slider", 1986, 4500, Math.acos(10 / 80));
    slider.speed = 80;
    for (let tick = 0; tick < 8; tick += 1) {
      slider = awaitApply(slider, { ...quietInput, throttle: 3 }, dt, world, tick * dt);
    }
    expect(slider.y).toBeGreaterThan(4500);
    expect(slider.hp).toBe(100);
    expect(slider.speed).toBeGreaterThan(0);
  });

  it("preserves speed while a 45-degree heading slides along a vertical wall", () => {
    const world = openWorld();
    for (let row = 0; row < GAME_CONFIG.world.rows; row += 1) world.grid[row * GAME_CONFIG.world.columns + 100] = 1;
    let ship = frigate("coast-slide", 1970, 4500, Math.PI / 4);
    ship.speed = 80;
    for (let tick = 0; tick < 8; tick += 1) {
      ship = awaitApply(ship, { ...quietInput, throttle: 3 }, dt, world, tick * dt);
    }
    expect(ship.x).toBe(1970);
    expect(ship.y).toBeGreaterThan(4500);
    expect(ship.speed).toBe(80);
  });

  it("does no further damage while pushing against a coast after a head-on impact", () => {
    const world = openWorld();
    for (let row = 0; row < GAME_CONFIG.world.rows; row += 1) world.grid[row * GAME_CONFIG.world.columns + 100] = 1;
    let ship = frigate("coast", 1970, 4500);
    ship.speed = 80;
    ship = awaitApply(ship, { ...quietInput, throttle: 3 }, dt, world, 0);
    for (let tick = 1; tick <= 3 * GAME_CONFIG.network.tickRate; tick += 1) {
      ship = awaitApply(ship, { ...quietInput, throttle: 3 }, dt, world, tick * dt);
    }
    expect(ship.hp).toBe(80);
  });

  it("ignores land damage during spawn protection", () => {
    const world = openWorld();
    for (let row = 0; row < GAME_CONFIG.world.rows; row += 1) world.grid[row * GAME_CONFIG.world.columns + 100] = 1;
    let protectedShip = frigate("protected", 1970, 4500);
    protectedShip.speed = 80;
    protectedShip.spawnProtectedUntil = 3;
    protectedShip = awaitApply(protectedShip, { ...quietInput, throttle: 3 }, dt, world, 0);
    expect(protectedShip.hp).toBe(100);
  });

  it("self-sinks on a damaging land impact and applies the score penalty", () => {
    const world = openWorld();
    for (let row = 0; row < GAME_CONFIG.world.rows; row += 1) world.grid[row * GAME_CONFIG.world.columns + 100] = 1;
    const ship = frigate("coast", 1970, 4500);
    ship.speed = 80;
    ship.hp = GAME_CONFIG.land.damage;
    const state = createGameState(world);
    state.frigates[ship.playerId] = ship;
    state.scores = scores(ship);
    for (let tick = 0; tick <= GAME_CONFIG.network.tickRate; tick += 1) {
      stepGame(state, { coast: { ...quietInput, throttle: 3 } }, dt, tick * dt);
    }
    expect(state.frigates.coast?.status).toBe("sinking");
    expect(state.scores.coast?.score).toBe(-1);
    expect(state.scores.coast?.sunk).toBe(1);
  });

  it("pushes overlapping frigates apart without damage", () => {
    const world = openWorld();
    const first = frigate("one", 5000, 4500);
    const second = frigate("two", 5010, 4500);
    const state = createGameState(world);
    state.frigates.one = first;
    state.frigates.two = second;
    state.scores = scores(first, second);
    stepGame(state, { one: quietInput, two: quietInput }, dt, dt);
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    expect(distance).toBeGreaterThanOrEqual(59);
    expect(first.hp).toBe(100);
    expect(second.hp).toBe(100);
  });
});

describe("cannons", () => {
  function shootAt(range = 400, targetY = 4500) {
    const world = openWorld();
    const shooter = frigate("shooter");
    shooter.cannonRange = range;
    const target = frigate("target", 5000 + range, targetY);
    const state = createGameState(world);
    state.frigates.shooter = shooter;
    state.frigates.target = target;
    state.scores = scores(shooter, target);
    stepGame(state, { shooter: { ...quietInput, fireCannon: true }, target: quietInput }, dt, 0);
    return { world, shooter, target, state };
  }

  it("fires two parallel shells 30 units apart and damages hulls within 60 units, including both-shell damage", () => {
    const { state, target } = shootAt();
    expect(state.shells).toHaveLength(2);
    expect(Math.hypot(state.shells[0]!.impactX - state.shells[1]!.impactX, state.shells[0]!.impactY - state.shells[1]!.impactY)).toBeCloseTo(30);
    for (let tick = 1; tick <= 24; tick += 1) stepGame(state, {}, dt, tick * dt);
    expect(target.hp).toBe(60);
  });

  it("does not damage a hull more than 60 units from either impact", () => {
    const { state, target } = shootAt(400, 4586);
    for (let tick = 1; tick <= 24; tick += 1) stepGame(state, {}, dt, tick * dt);
    expect(target.hp).toBe(100);
  });

  it("allows self-damage, enforces the 3 second reload, and clamps cannon range", () => {
    const { shooter, state } = shootAt(100);
    delete state.frigates.target;
    shooter.x = 5100;
    shooter.y = 4500;
    for (let tick = 1; tick <= 7; tick += 1) stepGame(state, { shooter: { ...quietInput, fireCannon: true } }, dt, tick * dt);
    expect(shooter.hp).toBe(60);
    expect(state.shells).toHaveLength(0);
    stepGame(state, { shooter: quietInput }, dt, 8 * dt);
    stepGame(state, { shooter: { ...quietInput, fireCannon: true } }, dt, 3);
    expect(state.shells).toHaveLength(2);
    let rangeShip = frigate("range");
    for (let tick = 0; tick < 30; tick += 1) rangeShip = awaitApply(rangeShip, { ...quietInput, keys: INPUT_KEYS.rangeUp }, dt, openWorld(), tick * dt);
    expect(rangeShip.cannonRange).toBe(800);
    for (let tick = 0; tick < 120; tick += 1) rangeShip = awaitApply(rangeShip, { ...quietInput, keys: INPUT_KEYS.rangeDown }, dt, openWorld(), tick * dt);
    expect(rangeShip.cannonRange).toBe(100);
  });
});

describe("torpedoes and scoring", () => {
  it("launches a 3-torpedo spread, hits hulls for 50, and reloads for 8 seconds", () => {
    const world = openWorld();
    const shooter = frigate("shooter");
    const target = frigate("target", 5120, 4512);
    const state = createGameState(world);
    expect(GAME_CONFIG.torpedo.spread).toBeCloseTo(Math.PI / 90);
    state.frigates.shooter = shooter;
    state.frigates.target = target;
    state.scores = scores(shooter, target);
    stepGame(state, { shooter: { ...quietInput, fireTorpedo: true }, target: quietInput }, dt, 0);
    expect(state.torpedoes).toHaveLength(3);
    const angles = state.torpedoes.map((torpedo) => torpedo.angle).sort((a, b) => a - b);
    expect(angles[0]).toBeCloseTo(-GAME_CONFIG.torpedo.spread);
    expect(angles[1]).toBeCloseTo(0);
    expect(angles[2]).toBeCloseTo(GAME_CONFIG.torpedo.spread);
    state.torpedoes = [state.torpedoes[1]!];
    for (let tick = 1; tick <= 60; tick += 1) stepGame(state, { shooter: { ...quietInput, fireTorpedo: true }, target: quietInput }, dt, tick * dt);
    expect(target.hp).toBe(50);
    expect(state.torpedoes.length).toBeLessThan(3);
    state.torpedoes = [];
    stepGame(state, { shooter: quietInput }, dt, 7.9);
    stepGame(state, { shooter: { ...quietInput, fireTorpedo: true } }, dt, 8);
    expect(state.torpedoes.length).toBeGreaterThan(0);
  });

  it("stops torpedoes at land and at the world edge", () => {
    const world = openWorld();
    for (let row = 0; row < GAME_CONFIG.world.rows; row += 1) world.grid[row * GAME_CONFIG.world.columns + 101] = 1;
    const ship = frigate("launcher", 1950, 4500);
    const state = createGameState(world);
    state.frigates.launcher = ship;
    state.scores = scores(ship);
    stepGame(state, { launcher: { ...quietInput, fireTorpedo: true } }, dt, 0);
    for (let tick = 1; tick < 60; tick += 1) stepGame(state, {}, dt, tick * dt);
    expect(state.torpedoes).toHaveLength(0);
    const edgeState = createGameState(openWorld());
    const edgeShip = frigate("edge", 15950, 4500);
    edgeState.frigates.edge = edgeShip;
    edgeState.scores = scores(edgeShip);
    stepGame(edgeState, { edge: { ...quietInput, fireTorpedo: true } }, dt, 0);
    for (let tick = 1; tick < 60; tick += 1) stepGame(edgeState, {}, dt, tick * dt);
    expect(edgeState.torpedoes).toHaveLength(0);
  });

  it("ignores the firer for 0.5 seconds, then permits a self-hit", () => {
    const world = openWorld();
    const shooter = frigate("shooter", 1000, 4500);
    const state = createGameState(world);
    state.frigates.shooter = shooter;
    state.scores = scores(shooter);
    state.torpedoes = [{ id: "arming", ownerId: shooter.playerId, x: 800, y: 4500, angle: 0, elapsed: 0 }];
    for (let tick = 1; tick <= 20; tick += 1) stepGame(state, {}, dt, tick * dt);
    expect(shooter.hp).toBe(100);
    for (let tick = 21; tick <= 30; tick += 1) stepGame(state, {}, dt, tick * dt);
    expect(shooter.hp).toBe(50);
    expect(state.scores.shooter?.score).toBe(0);
  });

  it("awards only final-hit points and lets a sunk firer's shell score later", () => {
    const world = openWorld();
    const shooter = frigate("shooter");
    const victim = frigate("victim", 5400, 4500);
    victim.hp = 20;
    const state = createGameState(world);
    state.frigates.shooter = shooter;
    state.frigates.victim = victim;
    state.scores = scores(shooter, victim);
    state.shells.push({
      id: "late", ownerId: "shooter", startX: 5000, startY: 4500,
      impactX: 5400, impactY: 4500, elapsed: 0.79, duration: 0.8,
    });
    shooter.status = "sinking";
    shooter.sinkingStartedAt = 0;
    stepGame(state, {}, dt, 1);
    expect(victim.status).toBe("sinking");
    expect(state.scores.shooter?.score).toBe(1);
    expect(state.scores.victim?.score).toBe(0);
  });
});

describe("spawning", () => {
  it("spawns in clear water at least 2400 units from other living ships when possible", () => {
    const world = openWorld();
    const first = spawnFrigate("one", "one", 1, world, [], () => 0.25, 0, 1);
    const second = spawnFrigate("two", "two", 2, world, [first], () => 0.75, 0, 1);
    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThanOrEqual(GAME_CONFIG.player.spawnDistance);
    expect(first.x).toBeGreaterThan(60);
    expect(first.y).toBeGreaterThan(60);
    expect(first.hp).toBe(100);
    expect(first.cannonRange).toBe(800);
    expect(pointToHullDistance(first.x, first.y, first)).toBe(0);
  });

  it("keeps all four players 2400 units apart after world regeneration", () => {
    const state = createGameState(openWorld());
    const ships = [1, 2, 3, 4].map((slot) => frigate(`p${slot}`, 4000 + slot * 100, 4000));
    for (const ship of ships) state.frigates[ship.playerId] = ship;
    state.scores = scores(...ships);

    regenerateGameWorld(state, 2468, 1, createSeededRandom(17));

    const respawned = Object.values(state.frigates);
    for (let first = 0; first < respawned.length; first += 1) {
      for (let second = first + 1; second < respawned.length; second += 1) {
        expect(Math.hypot(respawned[first]!.x - respawned[second]!.x, respawned[first]!.y - respawned[second]!.y))
          .toBeGreaterThanOrEqual(GAME_CONFIG.player.spawnDistance);
      }
    }
  });
});

function awaitApply(ship: Frigate, input: FrigateInput, step: number, world: World, now: number): Frigate {
  return applyFrigateInput(ship, input, step, world, now);
}
