import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../src/shared/config.js";
import { mulberry32 } from "../src/shared/rng.js";
import { applyFrigateInput, createGameState, createFrigate, createSeededRandom, INPUT_KEYS, pointToHullDistance, regenerateGameWorld, spawnFrigate, stepGame, type Frigate, type FrigateInput } from "../src/shared/sim.js";
import { DEFAULT_SETTINGS, type GameSettings } from "../src/shared/settings.js";
import { generateWorld, isLandAt, type World } from "../src/shared/world.js";

const dt = 1 / GAME_CONFIG.network.tickRate;
const maxHp = GAME_CONFIG.player.maxHp;
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

function turnedAfterOneSecond(settings: GameSettings, keys: number): Frigate {
  const state = createGameState(openWorld());
  const ship = frigate("captain");
  state.frigates.captain = ship;
  state.scores = scores(ship);
  state.settings = settings;
  for (let tick = 0; tick < GAME_CONFIG.network.tickRate; tick += 1) {
    stepGame(state, { captain: { ...quietInput, keys } }, dt, tick * dt);
  }
  return ship;
}

describe("frigate movement and land contact", () => {
  it("uses five throttle settings, clamps and rounds levels, and turns while stopped", () => {
    const world = openWorld();
    let ship = frigate("captain");
    for (let tick = 0; tick < 60; tick += 1) ship = awaitApply(ship, { ...quietInput, throttle: 3 }, dt, world, tick * dt);
    expect(ship.speed).toBeCloseTo(GAME_CONFIG.frigate.maxForwardSpeed);
    for (let tick = 60; tick < 120; tick += 1) ship = awaitApply(ship, { ...quietInput, throttle: 3 }, dt, world, tick * dt);
    expect(ship.speed).toBe(GAME_CONFIG.frigate.maxForwardSpeed);

    ship.speed = GAME_CONFIG.frigate.maxForwardSpeed;
    for (let tick = 0; tick < 60; tick += 1) ship = awaitApply(ship, quietInput, dt, world, tick * dt);
    expect(ship.speed).toBeCloseTo(0);

    let reverse = frigate("reverse");
    for (let tick = 0; tick < 60; tick += 1) reverse = awaitApply(reverse, { ...quietInput, throttle: -1 }, dt, world, tick * dt);
    expect(reverse.speed).toBe(-GAME_CONFIG.frigate.maxReverseSpeed);

    let oneThird = frigate("one-third");
    for (let tick = 0; tick < 60; tick += 1) oneThird = awaitApply(oneThird, { ...quietInput, throttle: 1 }, dt, world, tick * dt);
    expect(oneThird.speed).toBeCloseTo(GAME_CONFIG.frigate.maxForwardSpeed / 3);

    for (const throttle of [7, 2.6]) {
      let clamped = frigate(`clamped-${throttle}`);
      for (let tick = 0; tick < 60; tick += 1) clamped = awaitApply(clamped, { ...quietInput, throttle }, dt, world, tick * dt);
      expect(clamped.speed).toBeCloseTo(GAME_CONFIG.frigate.maxForwardSpeed);
    }

    let turning = frigate("turning");
    for (let tick = 0; tick < 30; tick += 1) {
      turning = awaitApply(turning, { ...quietInput, keys: INPUT_KEYS.turnRight }, dt, world, tick * dt);
    }
    expect(turning.heading).toBeCloseTo(GAME_CONFIG.frigate.rotationSpeed, 5);
    expect(turning.speed).toBe(0);
  });

  it("scales head-on coast damage by impact speed and ignores shallow slides", () => {
    const world = openWorld();
    const wallColumn = 100;
    for (let row = 0; row < GAME_CONFIG.world.rows; row += 1) world.grid[row * GAME_CONFIG.world.columns + wallColumn] = 1;
    const wallX = wallColumn * GAME_CONFIG.world.tileSize;
    const contactX = wallX - GAME_CONFIG.frigate.length / 2;
    let ship = frigate("coast", contactX, 4500);
    ship.speed = GAME_CONFIG.frigate.maxForwardSpeed;
    ship = awaitApply(ship, { ...quietInput, throttle: 3 }, dt, world, 0);
    expect(ship.hp).toBe(maxHp - GAME_CONFIG.land.damage);

    let slower = frigate("slower", contactX, 4500);
    const partialSpeed = GAME_CONFIG.frigate.maxForwardSpeed * 2 / 3;
    slower.speed = partialSpeed;
    slower = awaitApply(slower, { ...quietInput, throttle: 2 }, dt, world, 0);
    expect(slower.hp).toBe(maxHp - Math.round(GAME_CONFIG.land.damage * partialSpeed / GAME_CONFIG.frigate.maxForwardSpeed));

    const shallowImpactSpeed = GAME_CONFIG.land.grazeSpeed / 2;
    const maxForwardSpeed = GAME_CONFIG.frigate.maxForwardSpeed;
    const heading = Math.acos(shallowImpactSpeed / maxForwardSpeed);
    const halfLength = GAME_CONFIG.frigate.length / 2;
    const halfBeam = GAME_CONFIG.frigate.beam / 2;
    const halfWidthX = Math.abs(Math.cos(heading)) * halfLength + Math.abs(Math.sin(heading)) * halfBeam;
    let slider = frigate("slider", wallX - halfWidthX - shallowImpactSpeed * dt / 2, 4500, heading);
    slider.speed = maxForwardSpeed;
    for (let tick = 0; tick < 8; tick += 1) {
      slider = awaitApply(slider, { ...quietInput, throttle: 3 }, dt, world, tick * dt);
    }
    expect(slider.y).toBeGreaterThan(4500);
    expect(slider.hp).toBe(maxHp);
    expect(slider.speed).toBeGreaterThan(0);
  });

  it("preserves speed while a 45-degree heading slides along a vertical wall", () => {
    const world = openWorld();
    const wallColumn = 100;
    for (let row = 0; row < GAME_CONFIG.world.rows; row += 1) world.grid[row * GAME_CONFIG.world.columns + wallColumn] = 1;
    const wallX = wallColumn * GAME_CONFIG.world.tileSize;
    const heading = Math.PI / 4;
    const halfLength = GAME_CONFIG.frigate.length / 2;
    const halfBeam = GAME_CONFIG.frigate.beam / 2;
    const halfWidthX = Math.abs(Math.cos(heading)) * halfLength + Math.abs(Math.sin(heading)) * halfBeam;
    const dx = Math.cos(heading) * GAME_CONFIG.frigate.maxForwardSpeed * dt;
    const startX = wallX - halfWidthX - 1.5 * dx;
    let ship = frigate("coast-slide", startX, 4500, heading);
    ship.speed = GAME_CONFIG.frigate.maxForwardSpeed;
    ship = awaitApply(ship, { ...quietInput, throttle: 3 }, dt, world, 0);
    expect(ship.x).toBeCloseTo(startX + dx);
    ship = awaitApply(ship, { ...quietInput, throttle: 3 }, dt, world, dt);
    const blockedX = ship.x;
    for (let tick = 2; tick < 8; tick += 1) {
      ship = awaitApply(ship, { ...quietInput, throttle: 3 }, dt, world, tick * dt);
    }
    expect(blockedX).toBeGreaterThan(startX);
    expect(ship.x).toBeCloseTo(blockedX);
    expect(ship.y).toBeGreaterThan(4500);
    expect(ship.speed).toBe(GAME_CONFIG.frigate.maxForwardSpeed);
  });

  it("does no further damage while pushing against a coast after a head-on impact", () => {
    const world = openWorld();
    const wallColumn = 100;
    for (let row = 0; row < GAME_CONFIG.world.rows; row += 1) world.grid[row * GAME_CONFIG.world.columns + wallColumn] = 1;
    let ship = frigate("coast", wallColumn * GAME_CONFIG.world.tileSize - GAME_CONFIG.frigate.length / 2, 4500);
    ship.speed = GAME_CONFIG.frigate.maxForwardSpeed;
    ship = awaitApply(ship, { ...quietInput, throttle: 3 }, dt, world, 0);
    for (let tick = 1; tick <= 3 * GAME_CONFIG.network.tickRate; tick += 1) {
      ship = awaitApply(ship, { ...quietInput, throttle: 3 }, dt, world, tick * dt);
    }
    expect(ship.hp).toBe(maxHp - GAME_CONFIG.land.damage);
  });

  it("ignores land damage during spawn protection", () => {
    const world = openWorld();
    const wallColumn = 100;
    for (let row = 0; row < GAME_CONFIG.world.rows; row += 1) world.grid[row * GAME_CONFIG.world.columns + wallColumn] = 1;
    let protectedShip = frigate("protected", wallColumn * GAME_CONFIG.world.tileSize - GAME_CONFIG.frigate.length / 2, 4500);
    protectedShip.speed = GAME_CONFIG.frigate.maxForwardSpeed;
    protectedShip.spawnProtectedUntil = 3;
    protectedShip = awaitApply(protectedShip, { ...quietInput, throttle: 3 }, dt, world, 0);
    expect(protectedShip.hp).toBe(maxHp);
  });

  it("self-sinks on a damaging land impact and applies the score penalty", () => {
    const world = openWorld();
    const wallColumn = 100;
    for (let row = 0; row < GAME_CONFIG.world.rows; row += 1) world.grid[row * GAME_CONFIG.world.columns + wallColumn] = 1;
    const ship = frigate("coast", wallColumn * GAME_CONFIG.world.tileSize - GAME_CONFIG.frigate.length / 2, 4500);
    ship.speed = GAME_CONFIG.frigate.maxForwardSpeed;
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
    const halfExtent = GAME_CONFIG.frigate.hitCircleRadius
      + Math.max(...GAME_CONFIG.frigate.collisionCircleOffsets.map((offset) => Math.abs(offset)));
    expect(distance).toBeGreaterThanOrEqual(2 * halfExtent - 1);
    expect(first.hp).toBe(maxHp);
    expect(second.hp).toBe(maxHp);
  });
});

describe("host settings in simulation", () => {
  it("scales maximum boat speed and acceleration", () => {
    const state = createGameState(openWorld());
    const ship = frigate("captain");
    state.frigates.captain = ship;
    state.scores = scores(ship);
    state.settings = { ...DEFAULT_SETTINGS, boatSpeedPct: 150 };

    for (let tick = 0; tick < 2 * GAME_CONFIG.network.tickRate; tick += 1) {
      stepGame(state, { captain: { ...quietInput, throttle: 3 } }, dt, tick * dt);
    }

    expect(ship.speed).toBeCloseTo(GAME_CONFIG.frigate.maxForwardSpeed * 1.5);
  });

  it("scales hull rotation", () => {
    const state = createGameState(openWorld());
    const ship = frigate("captain");
    state.frigates.captain = ship;
    state.scores = scores(ship);
    state.settings = { ...DEFAULT_SETTINGS, rotationPct: 200 };

    for (let tick = 0; tick < GAME_CONFIG.network.tickRate; tick += 1) {
      stepGame(state, { captain: { ...quietInput, keys: INPUT_KEYS.turnRight } }, dt, tick * dt);
    }

    expect(ship.heading).toBeCloseTo(GAME_CONFIG.frigate.rotationSpeed * 2, 5);
  });

  it("turns cannon and torpedo bearings at 54 degrees per second by default", () => {
    const cannon = turnedAfterOneSecond(DEFAULT_SETTINGS, INPUT_KEYS.cannonRight);
    const torpedo = turnedAfterOneSecond(DEFAULT_SETTINGS, INPUT_KEYS.torpedoRight);

    expect(cannon.cannonBearing).toBeCloseTo(Math.PI * 0.3, 6);
    expect(torpedo.torpedoBearing).toBeCloseTo(Math.PI * 0.3, 6);
  });

  it("scales cannon and torpedo bearing rotation independently", () => {
    const cannon = turnedAfterOneSecond({ ...DEFAULT_SETTINGS, cannonRotationPct: 200 }, INPUT_KEYS.cannonRight);
    const torpedo = turnedAfterOneSecond({ ...DEFAULT_SETTINGS, torpedoRotationPct: 200 }, INPUT_KEYS.torpedoRight);
    const cannonWithOnlyTorpedoBoost = turnedAfterOneSecond(
      { ...DEFAULT_SETTINGS, torpedoRotationPct: 200 },
      INPUT_KEYS.cannonRight,
    );

    expect(cannon.cannonBearing).toBeCloseTo(Math.PI * 0.6, 6);
    expect(torpedo.torpedoBearing).toBeCloseTo(Math.PI * 0.6, 6);
    expect(cannonWithOnlyTorpedoBoost.cannonBearing).toBeCloseTo(Math.PI * 0.3, 6);
  });

  it("keeps full-speed head-on land damage capped at 10 HP when boat speed is scaled", () => {
    const world = openWorld();
    const wallColumn = 100;
    for (let row = 0; row < GAME_CONFIG.world.rows; row += 1) world.grid[row * GAME_CONFIG.world.columns + wallColumn] = 1;
    const ship = frigate("coast", wallColumn * GAME_CONFIG.world.tileSize - GAME_CONFIG.frigate.length / 2, 4500);
    ship.speed = GAME_CONFIG.frigate.maxForwardSpeed * 2;

    const damaged = awaitApply(
      ship,
      { ...quietInput, throttle: 3 },
      dt,
      world,
      0,
      { ...DEFAULT_SETTINGS, boatSpeedPct: 200 },
    );

    expect(maxHp - damaged.hp).toBeGreaterThan(0);
    expect(maxHp - damaged.hp).toBeLessThanOrEqual(GAME_CONFIG.land.damage);
  });

  it("scales shell flight speed and uses configured cannon and torpedo reloads", () => {
    const state = createGameState(openWorld());
    const ship = frigate("captain");
    state.frigates.captain = ship;
    state.scores = scores(ship);
    state.settings = {
      ...DEFAULT_SETTINGS,
      shellSpeedPct: 200,
      cannonReload: 2.5,
      torpedoReload: 6,
    };

    stepGame(state, { captain: { ...quietInput, fireCannon: true, fireTorpedo: true } }, dt, 5);

    expect(state.shells[0]?.duration).toBeCloseTo(GAME_CONFIG.cannon.maxRange / (GAME_CONFIG.cannon.shellSpeed * 2));
    expect(ship.cannonReadyAt).toBeCloseTo(7.5);
    expect(ship.torpedoReadyAt).toBeCloseTo(11);
  });

  it("stores torpedo speed at fire time", () => {
    const state = createGameState(openWorld());
    const ship = frigate("captain", 1000, 4500);
    state.frigates.captain = ship;
    state.scores = scores(ship);
    state.settings = { ...DEFAULT_SETTINGS, torpedoSpeedPct: 50 };

    stepGame(state, { captain: { ...quietInput, fireTorpedo: true } }, dt, 0);

    const torpedo = state.torpedoes.find((candidate) => candidate.angle === 0)!;
    expect(torpedo.speed).toBe(GAME_CONFIG.torpedo.speed / 2);
    const previousX = torpedo.x;
    state.settings = { ...state.settings, torpedoSpeedPct: 200 };
    stepGame(state, {}, dt, dt);

    expect(torpedo.x - previousX).toBeCloseTo((GAME_CONFIG.torpedo.speed / 2) * dt);
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

  it("fires two parallel shells at the configured muzzle spacing and damages hulls within 60 units, including both-shell damage", () => {
    const { state, target } = shootAt();
    expect(state.shells).toHaveLength(2);
    expect(Math.hypot(state.shells[0]!.impactX - state.shells[1]!.impactX, state.shells[0]!.impactY - state.shells[1]!.impactY))
      .toBeCloseTo(2 * GAME_CONFIG.cannon.shellOffset);
    const flightTicks = Math.ceil(state.shells[0]!.duration / dt);
    for (let tick = 1; tick <= flightTicks; tick += 1) stepGame(state, {}, dt, tick * dt);
    expect(target.hp).toBe(maxHp - 2 * GAME_CONFIG.cannon.damage);
  });

  it("does not damage a hull more than 60 units from either impact", () => {
    const { state, target } = shootAt(400, 4586);
    const flightTicks = Math.ceil(state.shells[0]!.duration / dt);
    for (let tick = 1; tick <= flightTicks; tick += 1) stepGame(state, {}, dt, tick * dt);
    expect(target.hp).toBe(maxHp);
  });

  it("allows self-damage, enforces the configured reload, and clamps cannon range", () => {
    const { shooter, state } = shootAt(100);
    delete state.frigates.target;
    shooter.x = 5100;
    shooter.y = 4500;
    const impactTicks = Math.ceil(100 / GAME_CONFIG.cannon.shellSpeed / dt);
    for (let tick = 1; tick <= impactTicks; tick += 1) {
      stepGame(state, { shooter: { ...quietInput, fireCannon: true } }, dt, tick * dt);
    }
    expect(shooter.hp).toBe(maxHp - 2 * GAME_CONFIG.cannon.damage);
    expect(state.shells).toHaveLength(0);
    stepGame(state, { shooter: quietInput }, dt, GAME_CONFIG.cannon.reload - dt);
    stepGame(state, { shooter: { ...quietInput, fireCannon: true } }, dt, GAME_CONFIG.cannon.reload);
    expect(state.shells).toHaveLength(2);
    let rangeShip = frigate("range");
    for (let tick = 0; tick < 30; tick += 1) rangeShip = awaitApply(rangeShip, { ...quietInput, keys: INPUT_KEYS.rangeUp }, dt, openWorld(), tick * dt);
    expect(rangeShip.cannonRange).toBe(800);
    for (let tick = 0; tick < 120; tick += 1) rangeShip = awaitApply(rangeShip, { ...quietInput, keys: INPUT_KEYS.rangeDown }, dt, openWorld(), tick * dt);
    expect(rangeShip.cannonRange).toBe(100);
  });
});

describe("torpedoes and scoring", () => {
  it("launches a 3-torpedo spread, hits hulls for configured damage, and uses the configured reload", () => {
    const world = openWorld();
    const shooter = frigate("shooter");
    const target = frigate("target", 5120, 4507);
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
    expect(target.hp).toBe(maxHp - GAME_CONFIG.torpedo.damage);
    expect(state.torpedoes.length).toBeLessThan(3);
    state.torpedoes = [];
    stepGame(state, { shooter: quietInput }, dt, GAME_CONFIG.torpedo.reload - dt);
    stepGame(state, { shooter: { ...quietInput, fireTorpedo: true } }, dt, GAME_CONFIG.torpedo.reload);
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
    state.torpedoes = [{
      id: "arming",
      ownerId: shooter.playerId,
      x: 950,
      y: 4500,
      angle: 0,
      elapsed: 0,
      speed: GAME_CONFIG.torpedo.speed,
    }];
    for (let tick = 1; tick <= 14; tick += 1) stepGame(state, {}, dt, tick * dt);
    expect(shooter.hp).toBe(maxHp);
    for (let tick = 15; tick <= 20; tick += 1) stepGame(state, {}, dt, tick * dt);
    expect(shooter.hp).toBe(maxHp - GAME_CONFIG.torpedo.damage);
    expect(state.scores.shooter?.score).toBe(0);
  });

  it("awards only final-hit points and lets a sunk firer's shell score later", () => {
    const world = openWorld();
    const shooter = frigate("shooter");
    const victim = frigate("victim", 5400, 4500);
    victim.hp = GAME_CONFIG.cannon.damage;
    const state = createGameState(world);
    state.frigates.shooter = shooter;
    state.frigates.victim = victim;
    state.scores = scores(shooter, victim);
    const shellDuration = Math.hypot(victim.x - shooter.x, victim.y - shooter.y) / GAME_CONFIG.cannon.shellSpeed;
    state.shells.push({
      id: "late", ownerId: "shooter", startX: shooter.x, startY: shooter.y,
      impactX: victim.x, impactY: victim.y, elapsed: shellDuration - dt, duration: shellDuration,
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
  it("keeps generated-world spawns clear of land at every heading", () => {
    const halfLength = GAME_CONFIG.frigate.length / 2;
    const halfBeam = GAME_CONFIG.frigate.beam / 2;
    for (let seed = 1; seed <= 20; seed += 1) {
      const world = generateWorld(seed);
      const random = mulberry32(seed * 7919);
      for (let spawnIndex = 0; spawnIndex < 200; spawnIndex += 1) {
        const ship = spawnFrigate("spawn-test", "spawn-test", 1, world, [], random, 0);
        const cos = Math.cos(ship.heading);
        const sin = Math.sin(ship.heading);
        for (let localX = -halfLength; localX <= halfLength; localX += 2) {
          for (let localY = -halfBeam; localY <= halfBeam; localY += 2) {
            const x = ship.x + localX * cos - localY * sin;
            const y = ship.y + localX * sin + localY * cos;
            const land = isLandAt(world, x, y);
            if (land) expect(land, `seed ${seed}, spawn ${spawnIndex}, hull point (${localX}, ${localY})`).toBe(false);
          }
        }
        for (let localX = -halfLength - GAME_CONFIG.land.clearance; localX <= halfLength + GAME_CONFIG.land.clearance; localX += 4) {
          for (let localY = -halfBeam - GAME_CONFIG.land.clearance; localY <= halfBeam + GAME_CONFIG.land.clearance; localY += 4) {
            const x = ship.x + localX * cos - localY * sin;
            const y = ship.y + localX * sin + localY * cos;
            if (pointToHullDistance(x, y, ship) > GAME_CONFIG.land.clearance) continue;
            const land = isLandAt(world, x, y);
            if (land) expect(land, `seed ${seed}, spawn ${spawnIndex}, clearance point (${localX}, ${localY})`).toBe(false);
          }
        }
      }
    }
  });

  it("spawns in clear water at least 2400 units from other living ships when possible", () => {
    const world = openWorld();
    const first = spawnFrigate("one", "one", 1, world, [], () => 0.25, 0, 1);
    const second = spawnFrigate("two", "two", 2, world, [first], () => 0.75, 0, 1);
    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThanOrEqual(GAME_CONFIG.player.spawnDistance);
    expect(first.x).toBeGreaterThan(60);
    expect(first.y).toBeGreaterThan(60);
    expect(first.hp).toBe(maxHp);
    expect(first.cannonRange).toBe(800);
    expect(pointToHullDistance(first.x, first.y, first)).toBe(0);
  });

  it("keeps all four players 2400 units apart after world regeneration", () => {
    const state = createGameState(openWorld());
    state.settings = { ...DEFAULT_SETTINGS, boatSpeedPct: 150, cannonReload: 2, landCoveragePct: 10 };
    const ships = [1, 2, 3, 4].map((slot) => frigate(`p${slot}`, 4000 + slot * 100, 4000));
    for (const ship of ships) state.frigates[ship.playerId] = ship;
    state.scores = scores(...ships);

    regenerateGameWorld(state, 2468, 1, createSeededRandom(17));

    expect(state.settings).toEqual({ ...DEFAULT_SETTINGS, boatSpeedPct: 150, cannonReload: 2, landCoveragePct: 10 });
    const coverage = state.world.grid.reduce((sum, cell) => sum + cell, 0) / state.world.grid.length;
    expect(coverage).toBeGreaterThanOrEqual(0.075);
    expect(coverage).toBeLessThanOrEqual(0.125);
    const respawned = Object.values(state.frigates);
    for (let first = 0; first < respawned.length; first += 1) {
      for (let second = first + 1; second < respawned.length; second += 1) {
        expect(Math.hypot(respawned[first]!.x - respawned[second]!.x, respawned[first]!.y - respawned[second]!.y))
          .toBeGreaterThanOrEqual(GAME_CONFIG.player.spawnDistance);
      }
    }
  });
});

function awaitApply(
  ship: Frigate,
  input: FrigateInput,
  step: number,
  world: World,
  now: number,
  settings: GameSettings = DEFAULT_SETTINGS,
): Frigate {
  return applyFrigateInput(ship, input, step, world, now, settings);
}
