import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../src/shared/config.js";
import { mulberry32 } from "../src/shared/rng.js";
import { applyFrigateInput, createGameState, createFrigate, createSeededRandom, fuelCapacity, INPUT_KEYS, pointToHullDistance, regenerateGameWorld, refillSupplies, spawnFrigate, spawnPlayerFrigate, stepBases, stepGame, stepTurrets, type Frigate, type FrigateInput } from "../src/shared/sim.js";
import { DEFAULT_SETTINGS, type GameSettings } from "../src/shared/settings.js";
import { generateWorld, isLandAt, type World } from "../src/shared/world.js";
import { generateWorldWithBases } from "../src/shared/bases.js";

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

function homeSite(id = "h0", homeSlot = 0) {
  return {
    id,
    kind: "home" as const,
    homeSlot,
    cityX: 5000,
    cityY: 4500,
    harbourX: 5050,
    harbourY: 4500,
    facing: 0,
  };
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
    ship.cannonRange = GAME_CONFIG.cannon.maxRange;
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
    rangeShip.cannonRange = GAME_CONFIG.cannon.maxRange;
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

describe("turrets", () => {
  it("fires at the nearest eligible enemy in range and reloads after three seconds", () => {
    const state = createGameState(openWorld(), [homeSite()]);
    const base = state.bases[0]!;
    base.active = true;
    base.ownerId = "owner";
    base.turret = "active";
    base.turretHp = GAME_CONFIG.bases.turretHp;
    state.settings = { ...DEFAULT_SETTINGS, shellSpeedPct: 200 };
    const owner = frigate("owner", base.cityX, base.cityY);
    const nearest = frigate("nearest", base.cityX + 200, base.cityY);
    const farther = frigate("farther", base.cityX + 500, base.cityY);
    const protectedEnemy = frigate("protected", base.cityX + 20, base.cityY);
    protectedEnemy.spawnProtectedUntil = 100;
    state.frigates = {
      owner,
      nearest,
      farther,
      protected: protectedEnemy,
    };
    state.scores = scores(owner, nearest, farther, protectedEnemy);

    stepTurrets(state, 2);

    expect(state.shells).toHaveLength(1);
    expect({ fuel: owner.fuel, shells: owner.shells, torpedoes: owner.torpedoes }).toEqual({
      fuel: fuelCapacity(DEFAULT_SETTINGS),
      shells: DEFAULT_SETTINGS.shells,
      torpedoes: DEFAULT_SETTINGS.torpedoes,
    });
    expect(state.shells[0]).toMatchObject({
      ownerId: owner.playerId,
      turretBaseId: base.id,
      startX: base.cityX,
      startY: base.cityY,
      impactX: nearest.x,
      impactY: nearest.y,
    });
    expect(state.shells[0]?.duration).toBeCloseTo(200 / (GAME_CONFIG.cannon.shellSpeed * 2));
    expect(base.turretReadyAt).toBe(2 + GAME_CONFIG.bases.turretReload);

    stepTurrets(state, 4);
    expect(state.shells).toHaveLength(1);
    stepTurrets(state, 5);
    expect(state.shells).toHaveLength(2);
  });

  it("waits without consuming reload when no eligible target is in range", () => {
    const state = createGameState(openWorld(), [homeSite()]);
    const base = state.bases[0]!;
    base.active = true;
    base.ownerId = "owner";
    base.turret = "active";
    base.turretHp = GAME_CONFIG.bases.turretHp;
    const owner = frigate("owner", base.cityX, base.cityY);
    const distant = frigate("distant", base.cityX + GAME_CONFIG.bases.turretRange + 1, base.cityY);
    const protectedEnemy = frigate("protected", base.cityX + 200, base.cityY);
    protectedEnemy.spawnProtectedUntil = 4;
    state.frigates = { owner, distant, protected: protectedEnemy };

    stepTurrets(state, 0);
    expect(state.shells).toHaveLength(0);
    expect(base.turretReadyAt).toBe(0);
    stepTurrets(state, 3);
    expect(state.shells).toHaveLength(0);
    stepTurrets(state, 4);
    expect(state.shells).toHaveLength(1);
    expect(state.shells[0]?.impactX).toBe(protectedEnemy.x);
  });

  it("does not fire from unowned neutral or inactive bases", () => {
    const neutral = createGameState(openWorld(), [{
      ...homeSite(),
      kind: "neutral",
      homeSlot: null,
    }]);
    const neutralBase = neutral.bases[0]!;
    neutral.frigates.enemy = frigate("enemy", neutralBase.cityX + 100, neutralBase.cityY);
    stepTurrets(neutral, 0);
    expect(neutral.shells).toHaveLength(0);

    const inactive = createGameState(openWorld(), [homeSite()]);
    const inactiveBase = inactive.bases[0]!;
    inactiveBase.active = false;
    inactiveBase.ownerId = "owner";
    inactiveBase.turret = "active";
    inactive.frigates.enemy = frigate("enemy", inactiveBase.cityX + 100, inactiveBase.cityY);
    stepTurrets(inactive, 0);
    expect(inactive.shells).toHaveLength(0);
  });

  it("takes one turret hit per shell and destroys it after six enemy hits", () => {
    const state = createGameState(openWorld(), [homeSite()]);
    const base = state.bases[0]!;
    base.active = true;
    base.ownerId = "defender";
    base.turret = "active";
    base.turretHp = GAME_CONFIG.bases.turretHp;
    base.turretReadyAt = 100;
    const shooter = frigate("shooter", 8000, 8000);
    const defender = frigate("defender", 9000, 9000);
    state.scores = scores(shooter, defender);
    state.shells = Array.from({ length: 6 }, (_, index) => ({
      id: `s${index}`,
      ownerId: shooter.playerId,
      startX: base.cityX,
      startY: base.cityY,
      impactX: base.cityX,
      impactY: base.cityY,
      elapsed: 0,
      duration: 0,
    }));

    stepGame(state, {}, dt, 1);

    expect(base).toMatchObject({ turret: "destroyed", turretHp: 0 });
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "turret",
      playerId: shooter.playerId,
      message: `${shooter.name} destroyed ${defender.name}'s turret`,
    }));
    expect(state.events.filter((event) => event.type === "turret")).toHaveLength(1);
    expect(state.events).toContainEqual({
      type: "explosion",
      x: base.cityX,
      y: base.cityY,
      kind: "hit",
    });
  });

  it("ignores the owner's shells and torpedoes when damaging turrets", () => {
    const state = createGameState(openWorld(), [homeSite()]);
    const base = state.bases[0]!;
    base.active = true;
    base.ownerId = "owner";
    base.turret = "active";
    base.turretHp = GAME_CONFIG.bases.turretHp;
    base.turretReadyAt = 100;
    const owner = frigate("owner", 9000, 9000);
    state.frigates.owner = owner;
    state.scores = scores(owner);
    state.shells.push({
      id: "owned-shell",
      ownerId: owner.playerId,
      startX: base.cityX,
      startY: base.cityY,
      impactX: base.cityX,
      impactY: base.cityY,
      elapsed: 0,
      duration: 0,
    });
    stepGame(state, {}, dt, 1);
    expect(base.turretHp).toBe(GAME_CONFIG.bases.turretHp);

    state.shells = [];
    state.torpedoes = [{
      id: "torpedo",
      ownerId: "enemy",
      x: base.cityX - 300,
      y: base.cityY,
      angle: 0,
      elapsed: 0,
      speed: 600,
    }];
    stepGame(state, {}, 1, 2);
    expect(base).toMatchObject({ turret: "active", turretHp: GAME_CONFIG.bases.turretHp });
  });

  it("makes turret shells immune to their owner's boat and credits turret kills to the owner", () => {
    const state = createGameState(openWorld(), [homeSite()]);
    const base = state.bases[0]!;
    base.active = true;
    base.ownerId = "owner";
    base.turret = "active";
    base.turretHp = GAME_CONFIG.bases.turretHp;
    base.turretReadyAt = 100;
    const owner = frigate("owner", base.cityX, base.cityY);
    const victim = frigate("victim", base.cityX + 50, base.cityY);
    victim.hp = GAME_CONFIG.cannon.damage;
    state.frigates = { owner, victim };
    state.scores = scores(owner, victim);
    state.shells.push({
      id: "turret-shell",
      ownerId: owner.playerId,
      turretBaseId: base.id,
      startX: base.cityX,
      startY: base.cityY,
      impactX: base.cityX,
      impactY: base.cityY,
      elapsed: 0,
      duration: 0,
    });

    stepGame(state, {}, dt, 1);

    expect(owner.hp).toBe(maxHp);
    expect(victim.status).toBe("sinking");
    expect(state.scores.owner?.score).toBe(1);
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "sank",
      playerId: owner.playerId,
      message: `${owner.name}'s turret sank ${victim.name}`,
    }));
  });
});

describe("home bases and turret repair", () => {
  function ownedHome() {
    const state = createGameState(openWorld(), [homeSite()]);
    const base = state.bases[0]!;
    const original = frigate("original", 9000, 8000);
    const capturer = frigate("capturer", base.harbourX, base.harbourY);
    state.frigates = { original, capturer };
    state.scores = scores(original, capturer);
    state.settings = { ...DEFAULT_SETTINGS, captureTime: 1 };
    base.active = true;
    base.ownerId = original.playerId;
    base.turret = "active";
    base.turretHp = GAME_CONFIG.bases.turretHp;
    base.turretReadyAt = 100;
    return { state, base, original, capturer };
  }

  it("blocks home capture while the turret is active, then scores first loss and returns after 30 seconds", () => {
    const { state, base, original, capturer } = ownedHome();
    stepBases(state, 1, 0);
    expect(base).toMatchObject({ ownerId: original.playerId, captureBy: null, captureProgress: 0 });

    base.turret = "destroyed";
    base.turretHp = 0;
    stepBases(state, 1, 1);
    expect(base).toMatchObject({
      ownerId: capturer.playerId,
      lostFrom: original.playerId,
      returnAt: 1 + GAME_CONFIG.bases.homeReturnDelay,
      turret: "destroyed",
    });
    expect(state.scores[original.playerId]?.score).toBe(-GAME_CONFIG.bases.homeCapturePoints);
    expect(state.scores[capturer.playerId]?.score).toBe(GAME_CONFIG.bases.homeCapturePoints);
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "capture",
      message: `${capturer.name} captured ${original.name}'s home base`,
    }));

    stepBases(state, 1, 30.999);
    expect(base.ownerId).toBe(capturer.playerId);
    stepBases(state, 1, 31);
    expect(base).toMatchObject({
      active: true,
      ownerId: original.playerId,
      lostFrom: null,
      returnAt: null,
      turret: "active",
      turretHp: GAME_CONFIG.bases.turretHp,
      turretReadyAt: 31,
      repairBy: null,
      repairProgress: 0,
    });
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "capture",
      message: `${original.name}'s home base is back`,
    }));
  });

  it("lets the original owner recapture without points and restores the full home turret", () => {
    const { state, base, original, capturer } = ownedHome();
    base.turret = "destroyed";
    base.turretHp = 0;
    stepBases(state, 1, 1);
    const scoresAfterFirstCapture = [state.scores[original.playerId]?.score, state.scores[capturer.playerId]?.score];
    capturer.x = 9000;
    capturer.y = 8000;
    original.x = base.harbourX;
    original.y = base.harbourY;

    stepBases(state, 1, 2);

    expect(base).toMatchObject({
      ownerId: original.playerId,
      lostFrom: null,
      returnAt: null,
      turret: "active",
      turretHp: GAME_CONFIG.bases.turretHp,
      turretReadyAt: 2,
    });
    expect([state.scores[original.playerId]?.score, state.scores[capturer.playerId]?.score]).toEqual(scoresAfterFirstCapture);
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "capture",
      message: `${original.name} took back their home base`,
    }));
  });

  it("awards a third-party home capture without penalizing the original owner again", () => {
    const { state, base, original, capturer } = ownedHome();
    const third = frigate("third", 9000, 9000);
    state.frigates.third = third;
    state.scores.third = {
      playerId: third.playerId, name: third.name, slot: third.slot, score: 0, sunk: 0, host: false, connected: true,
    };
    base.turret = "destroyed";
    base.turretHp = 0;
    stepBases(state, 1, 1);
    const returnAt = base.returnAt;
    capturer.x = 9000;
    capturer.y = 8000;
    third.x = base.harbourX;
    third.y = base.harbourY;

    stepBases(state, 1, 2);

    expect(base).toMatchObject({ ownerId: third.playerId, lostFrom: original.playerId, returnAt });
    expect(state.scores[original.playerId]?.score).toBe(-GAME_CONFIG.bases.homeCapturePoints);
    expect(state.scores[capturer.playerId]?.score).toBe(GAME_CONFIG.bases.homeCapturePoints);
    expect(state.scores[third.playerId]?.score).toBe(GAME_CONFIG.bases.homeCapturePoints);
  });

  it("installs and repairs turrets after the configured fraction, preserving progress after time changes", () => {
    const state = createGameState(openWorld(), [{
      id: "n0", kind: "neutral", homeSlot: null, cityX: 5000, cityY: 4500,
      harbourX: 5050, harbourY: 4500, facing: 0,
    }]);
    const base = state.bases[0]!;
    const owner = frigate("owner", base.harbourX, base.harbourY);
    state.frigates.owner = owner;
    state.scores = scores(owner);
    base.ownerId = owner.playerId;
    state.settings = { ...DEFAULT_SETTINGS, repairTime: 4 };

    stepBases(state, 2, 0);
    expect(base).toMatchObject({ repairBy: owner.playerId, repairProgress: 0.5, turret: "none" });
    state.settings.repairTime = 8;
    stepBases(state, 4, 1);
    expect(base).toMatchObject({
      turret: "active",
      turretHp: GAME_CONFIG.bases.turretHp,
      turretReadyAt: 1,
      repairBy: null,
      repairProgress: 0,
    });
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "turret",
      message: `${owner.name} installed a turret`,
    }));

    base.turret = "destroyed";
    base.turretHp = 0;
    state.settings.repairTime = 1;
    stepBases(state, 1, 2);
    expect(base.turret).toBe("active");
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "turret",
      message: `${owner.name} repaired a turret`,
    }));
  });

  it("resets repair progress when the owner fires, leaves the harbour, or sinks", () => {
    const state = createGameState(openWorld(), [{
      id: "n0", kind: "neutral", homeSlot: null, cityX: 5000, cityY: 4500,
      harbourX: 5050, harbourY: 4500, facing: 0,
    }]);
    const base = state.bases[0]!;
    const owner = frigate("owner", base.harbourX, base.harbourY);
    state.frigates.owner = owner;
    state.scores = scores(owner);
    base.ownerId = owner.playerId;
    state.settings = { ...DEFAULT_SETTINGS, repairTime: 2 };

    stepBases(state, 1, 0);
    expect(base.repairProgress).toBe(0.5);
    stepGame(state, { owner: { ...quietInput, fireCannon: true } }, dt, 1);
    expect(base).toMatchObject({ repairBy: null, repairProgress: 0 });

    stepBases(state, 1, 2);
    expect(base.repairProgress).toBe(0.5);
    owner.x += 200;
    stepBases(state, 1, 3);
    expect(base).toMatchObject({ repairBy: null, repairProgress: 0 });

    owner.x = base.harbourX;
    stepBases(state, 1, 4);
    expect(base.repairProgress).toBe(0.5);
    owner.status = "sinking";
    stepBases(state, 1, 5);
    expect(base).toMatchObject({ repairBy: null, repairProgress: 0 });
  });
});

describe("fuel, ammunition, and resupply", () => {
  function ownedHarbour() {
    const state = createGameState(openWorld(), [{
      id: "n0",
      kind: "neutral",
      homeSlot: null,
      cityX: 5000,
      cityY: 4500,
      harbourX: 5050,
      harbourY: 4500,
      facing: 0,
    }]);
    const base = state.bases[0]!;
    const owner = frigate("owner", base.harbourX, base.harbourY);
    base.ownerId = owner.playerId;
    state.frigates.owner = owner;
    state.scores = scores(owner);
    return { state, base, owner };
  }

  it("burns fuel at absolute speed and leaves stopped frigates unchanged", () => {
    const world = openWorld();
    const stopped = frigate("stopped");
    const stillStopped = applyFrigateInput(stopped, quietInput, 1, world, 0);
    expect(stillStopped.fuel).toBe(stopped.fuel);

    const moving = frigate("moving");
    moving.speed = GAME_CONFIG.frigate.maxForwardSpeed;
    const distance = moving.speed;
    const advanced = applyFrigateInput(moving, { ...quietInput, throttle: 3 }, 1, world, 0);
    expect(advanced.fuel).toBeCloseTo(moving.fuel - distance);
    expect(advanced.x - moving.x).toBeCloseTo(distance);
  });

  it("refills all three supplies to the configured capacity", () => {
    const ship = frigate("captain");
    ship.fuel = 0;
    ship.shells = 0;
    ship.torpedoes = 0;
    refillSupplies(ship, { ...DEFAULT_SETTINGS, fuelCrossings: 3, shells: 80, torpedoes: 40 });
    expect(ship).toMatchObject({
      fuel: 3 * GAME_CONFIG.world.width,
      shells: 80,
      torpedoes: 40,
      resupplying: false,
    });
  });

  it("limits an empty-tank frigate to ten percent speed in both directions while allowing turns", () => {
    const world = openWorld();
    for (const throttle of [-1, 3]) {
      const ship = frigate(`empty-${throttle}`);
      ship.fuel = 0;
      const advanced = applyFrigateInput(
        ship,
        { ...quietInput, throttle, keys: INPUT_KEYS.turnRight },
        1,
        world,
        0,
      );
      const expected = throttle < 0
        ? -GAME_CONFIG.frigate.maxReverseSpeed * GAME_CONFIG.frigate.emptyFuelSpeedFactor
        : GAME_CONFIG.frigate.maxForwardSpeed * GAME_CONFIG.frigate.emptyFuelSpeedFactor;
      expect(advanced.speed).toBeCloseTo(expected);
      expect(advanced.heading).toBeCloseTo(GAME_CONFIG.frigate.rotationSpeed);
      expect(advanced.throttle).toBe(throttle);
    }
  });

  it("consumes one unit per cannon salvo and torpedo spread and blocks empty fire", () => {
    const state = createGameState(openWorld());
    const shooter = frigate("shooter");
    shooter.shells = 1;
    shooter.torpedoes = 1;
    state.frigates.shooter = shooter;
    state.scores = scores(shooter);

    stepGame(state, {
      shooter: { ...quietInput, fireCannon: true, fireTorpedo: true },
    }, dt, 0);

    expect(state.shells).toHaveLength(2);
    expect(state.torpedoes).toHaveLength(3);
    expect(shooter.shells).toBe(0);
    expect(shooter.torpedoes).toBe(0);

    const blocked = createGameState(openWorld(), [{
      id: "n0",
      kind: "neutral",
      homeSlot: null,
      cityX: 5000,
      cityY: 4500,
      harbourX: 5050,
      harbourY: 4500,
      facing: 0,
    }]);
    const owner = frigate("owner", 5050, 4500);
    owner.shells = 0;
    owner.torpedoes = 0;
    owner.cannonReadyAt = 7;
    owner.torpedoReadyAt = 8;
    owner.spawnProtectedUntil = 99;
    const base = blocked.bases[0]!;
    base.active = true;
    base.ownerId = owner.playerId;
    base.repairBy = owner.playerId;
    base.repairProgress = 0.4;
    blocked.settings.repairTime = 2;
    blocked.frigates.owner = owner;
    blocked.scores = scores(owner);

    stepGame(blocked, {
      owner: { ...quietInput, throttle: 1, fireCannon: true, fireTorpedo: true },
    }, 0.1, 1);

    expect(blocked.shells).toHaveLength(0);
    expect(blocked.torpedoes).toHaveLength(0);
    expect(owner.cannonReadyAt).toBe(7);
    expect(owner.torpedoReadyAt).toBe(8);
    expect(owner.spawnProtectedUntil).toBe(99);
    expect(base.repairProgress).toBeCloseTo(0.45);
  });

  it("refills all supplies simultaneously at the configured rate and preserves partial refills on departure", () => {
    const { state, base, owner } = ownedHarbour();
    state.settings.resupplyTime = 4;
    owner.fuel = 0;
    owner.shells = 0;
    owner.torpedoes = 0;
    owner.speed = 10;

    stepBases(state, 1, 0);

    expect(owner.fuel).toBeCloseTo(fuelCapacity(state.settings) / 4);
    expect(owner.shells).toBeCloseTo(state.settings.shells / 4);
    expect(owner.torpedoes).toBeCloseTo(state.settings.torpedoes / 4);
    expect(owner.resupplying).toBe(true);

    const partial = { fuel: owner.fuel, shells: owner.shells, torpedoes: owner.torpedoes };
    owner.x = base.harbourX + 100;
    stepBases(state, 1, 1);
    expect({ fuel: owner.fuel, shells: owner.shells, torpedoes: owner.torpedoes }).toEqual(partial);
    expect(owner.resupplying).toBe(false);

    owner.x = base.harbourX;
    stepBases(state, 8, 2);
    expect(owner).toMatchObject({
      fuel: fuelCapacity(state.settings),
      shells: state.settings.shells,
      torpedoes: state.settings.torpedoes,
      resupplying: false,
    });
  });

  it("requires an active owned harbour, a whole hull inside, an alive frigate, and commanded STOP", () => {
    const excludedCases: Array<(base: { active: boolean; ownerId: string | null }, owner: Frigate) => void> = [
      (base) => { base.active = false; },
      (base) => { base.ownerId = null; },
      (base) => { base.ownerId = "enemy"; },
      (_base, owner) => { owner.x += 20; },
      (_base, owner) => { owner.status = "sinking"; },
      (_base, owner) => { owner.throttle = 1; },
    ];
    for (const exclude of excludedCases) {
      const { state, base, owner } = ownedHarbour();
      owner.fuel = 0;
      owner.shells = 0;
      owner.torpedoes = 0;
      exclude(base, owner);
      stepBases(state, 1, 0);
      expect(owner).toMatchObject({ fuel: 0, shells: 0, torpedoes: 0, resupplying: false });
    }
  });

  it("does not stop resupply when firing at an owned base", () => {
    const { state, base, owner } = ownedHarbour();
    state.settings.resupplyTime = 4;
    base.turret = "active";
    base.turretHp = GAME_CONFIG.bases.turretHp;
    owner.fuel = 0;
    owner.shells = 1;
    owner.torpedoes = 0;

    stepGame(state, { owner: { ...quietInput, fireCannon: true } }, 0.1, 0);

    expect(state.shells).toHaveLength(2);
    expect(owner.fuel).toBeCloseTo(fuelCapacity(state.settings) / 40);
    expect(owner.shells).toBeCloseTo(state.settings.shells / 40);
    expect(owner.torpedoes).toBeCloseTo(state.settings.torpedoes / 40);
    expect(owner.resupplying).toBe(true);
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
    expect(first.cannonRange).toBe(GAME_CONFIG.cannon.minRange);
    expect(pointToHullDistance(first.x, first.y, first)).toBe(0);
  });

  it("uses another owned base after home loss and falls back to a random spawn", () => {
    const state = createGameState(openWorld(), [
      homeSite(),
      {
        id: "n0", kind: "neutral", homeSlot: null, cityX: 7000, cityY: 7000,
        harbourX: 7050, harbourY: 7000, facing: Math.PI / 2,
      },
    ]);
    const home = state.bases[0]!;
    const other = state.bases[1]!;
    state.settings = { ...DEFAULT_SETTINGS, fuelCrossings: 3, shells: 80, torpedoes: 40 };
    home.active = true;
    home.ownerId = "holder";
    home.lostFrom = "player";
    home.returnAt = 30;
    home.turret = "destroyed";
    other.ownerId = "player";

    const atOwnedBase = spawnPlayerFrigate("player", "Player", 1, state, [], () => 0.5, 20);
    expect(atOwnedBase).toMatchObject({ x: other.harbourX, y: other.harbourY, heading: other.facing });
    expect(atOwnedBase).toMatchObject({
      fuel: fuelCapacity(state.settings),
      shells: state.settings.shells,
      torpedoes: state.settings.torpedoes,
    });

    other.ownerId = null;
    const randomSpawn = spawnPlayerFrigate("player", "Player", 1, state, [], createSeededRandom(41), 21);
    expect({ x: randomSpawn.x, y: randomSpawn.y }).not.toEqual({ x: home.harbourX, y: home.harbourY });
    expect(randomSpawn.status).toBe("alive");
    expect(randomSpawn).toMatchObject({
      fuel: fuelCapacity(state.settings),
      shells: state.settings.shells,
      torpedoes: state.settings.torpedoes,
    });
  });

  it("regenerates bases and respawns each player at their home harbour", () => {
    const state = createGameState(openWorld());
    state.settings = {
      ...DEFAULT_SETTINGS,
      boatSpeedPct: 150,
      cannonReload: 2,
      landCoveragePct: 10,
      fuelCrossings: 3,
      shells: 80,
      torpedoes: 40,
    };
    const ships = [1, 2, 3, 4].map((slot) => {
      const ship = frigate(`p${slot}`, 4000 + slot * 100, 4000);
      ship.slot = slot;
      return ship;
    });
    for (const ship of ships) state.frigates[ship.playerId] = ship;
    state.scores = scores(...ships);

    const generated = generateWorldWithBases(2468, 0.1, state.settings.neutralBases);
    regenerateGameWorld(state, generated.world, generated.sites, 1, createSeededRandom(17));

    expect(state.settings).toEqual({
      ...DEFAULT_SETTINGS,
      boatSpeedPct: 150,
      cannonReload: 2,
      landCoveragePct: 10,
      fuelCrossings: 3,
      shells: 80,
      torpedoes: 40,
    });
    const coverage = state.world.grid.reduce((sum, cell) => sum + cell, 0) / state.world.grid.length;
    expect(coverage).toBeGreaterThanOrEqual(0.075);
    expect(coverage).toBeLessThanOrEqual(0.125);
    const respawned = Object.values(state.frigates);
    for (const ship of respawned) {
      const home = state.bases.find((base) => base.kind === "home" && base.homeSlot === ship.slot - 1);
      expect(ship.x).toBe(home?.harbourX);
      expect(ship.y).toBe(home?.harbourY);
      expect(ship.heading).toBe(home?.facing);
      expect(ship).toMatchObject({
        fuel: fuelCapacity(state.settings),
        shells: state.settings.shells,
        torpedoes: state.settings.torpedoes,
      });
      expect(home).toMatchObject({
        active: true,
        ownerId: ship.playerId,
        turret: "active",
        turretHp: GAME_CONFIG.bases.turretHp,
        turretReadyAt: 1,
        lostFrom: null,
        returnAt: null,
      });
    }
    expect(state.bases.filter((base) => base.kind === "neutral")).toHaveLength(DEFAULT_SETTINGS.neutralBases);
    expect(state.bases.filter((base) => base.kind === "neutral").every((base) =>
      base.turret === "none" && base.turretHp === 0 && base.lostFrom === null && base.returnAt === null,
    )).toBe(true);
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
