import { GAME_CONFIG } from "./config.js";
import { mulberry32 } from "./rng.js";
import { hullInsideHarbour, pointInsideHarbour, restoreHome, type Base, type BaseSite } from "./bases.js";
import { DEFAULT_SETTINGS, type GameSettings } from "./settings.js";
import { isLandAt, mapDimensions, type World } from "./world.js";

export const INPUT_KEYS = {
  turnLeft: 1 << 0,
  turnRight: 1 << 1,
  cannonLeft: 1 << 2,
  cannonRight: 1 << 3,
  rangeUp: 1 << 4,
  rangeDown: 1 << 5,
  torpedoLeft: 1 << 6,
  torpedoRight: 1 << 7,
} as const;

export type FrigateStatus = "alive" | "sinking" | "waiting";
export type ExplosionKind = "splash" | "land" | "hit";

export interface FrigateInput {
  seq: number;
  keys: number;
  throttle: number;
  fireCannon: boolean;
  fireTorpedo: boolean;
}

export interface Frigate {
  playerId: string;
  name: string;
  slot: number;
  team: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  fuel: number;
  shells: number;
  torpedoes: number;
  throttle: number;
  resupplying: boolean;
  repairLockBaseId: string | null;
  hp: number;
  status: FrigateStatus;
  sinkingStartedAt: number;
  respawnAt: number;
  spawnProtectedUntil: number;
  cannonBearing: number;
  cannonRange: number;
  cannonReadyAt: number;
  torpedoBearing: number;
  torpedoReadyAt: number;
  landContact: boolean;
  lastLandDamageAt: number;
  lastFireCannon: boolean;
  lastFireTorpedo: boolean;
  lastDamageSource: string | null;
}

export interface Shell {
  id: string;
  shotId?: string;
  ownerId: string;
  turretBaseId?: string;
  startX: number;
  startY: number;
  impactX: number;
  impactY: number;
  elapsed: number;
  duration: number;
}

export interface Torpedo {
  id: string;
  shotId?: string;
  ownerId: string;
  x: number;
  y: number;
  angle: number;
  elapsed: number;
  speed: number;
}

export interface PlayerScore {
  playerId: string;
  name: string;
  slot: number;
  team: number;
  score: number;
  sunk: number;
  host: boolean;
  connected: boolean;
}

export interface GameEvent {
  type: "explosion" | "sank" | "join" | "leave" | "host" | "capture" | "turret" | "damage" | "income" | "repairInterrupted";
  x?: number;
  y?: number;
  kind?: ExplosionKind;
  playerId?: string;
  name?: string;
  targetId?: string;
  targetName?: string;
  baseId?: string;
  amount?: number;
  cause?: "shell" | "torpedo" | "land" | "turret";
  shotId?: string;
  team?: number;
  message?: string;
}

export interface GameState {
  tick: number;
  world: World;
  settings: GameSettings;
  bases: Base[];
  frigates: Record<string, Frigate>;
  shells: Shell[];
  torpedoes: Torpedo[];
  scores: Record<string, PlayerScore>;
  teamBonus: number[];
  events: GameEvent[];
  nextProjectileId: number;
  nextShotId: number;
}

function normalizeAngle(angle: number): number {
  const circle = Math.PI * 2;
  return ((angle % circle) + circle) % circle;
}

function isPressed(keys: number, key: number): boolean {
  return (keys & key) !== 0;
}

function hullTouchesLand(x: number, y: number, heading: number, world: World, clearance = 0): boolean {
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const halfLength = GAME_CONFIG.frigate.length / 2 + clearance;
  const halfBeam = GAME_CONFIG.frigate.beam / 2 + clearance;
  const samples: Array<[number, number]> = [
    [0, 0], [-halfLength, -halfBeam], [-halfLength, halfBeam], [halfLength, -halfBeam], [halfLength, halfBeam],
    [-halfLength, 0], [halfLength, 0], [0, -halfBeam], [0, halfBeam],
    [-halfLength / 2, -halfBeam], [-halfLength / 2, halfBeam], [halfLength / 2, -halfBeam], [halfLength / 2, halfBeam],
  ];
  for (const [localX, localY] of samples) {
    if (isLandAt(world, x + localX * cos - localY * sin, y + localX * sin + localY * cos)) return true;
  }
  return false;
}

function hasSpawnClearance(world: World, x: number, y: number): boolean {
  const radius = Math.hypot(GAME_CONFIG.frigate.length / 2, GAME_CONFIG.frigate.beam / 2) + GAME_CONFIG.land.clearance;
  const { tileSize } = GAME_CONFIG.world;
  const { columns, rows, width, height } = world;
  if (x - radius < 0 || y - radius < 0 || x + radius > width || y + radius > height) return false;
  for (let row = Math.floor((y - radius) / tileSize); row <= Math.floor((y + radius) / tileSize); row += 1) {
    for (let column = Math.floor((x - radius) / tileSize); column <= Math.floor((x + radius) / tileSize); column += 1) {
      if (row >= rows || column >= columns) continue;
      const nearestX = Math.min(Math.max(x, column * tileSize), (column + 1) * tileSize);
      const nearestY = Math.min(Math.max(y, row * tileSize), (row + 1) * tileSize);
      if (Math.hypot(nearestX - x, nearestY - y) < radius && world.grid[row * columns + column] === 1) return false;
    }
  }
  return true;
}

export function pointToHullDistance(x: number, y: number, frigate: Frigate): number {
  const dx = x - frigate.x;
  const dy = y - frigate.y;
  const cos = Math.cos(frigate.heading);
  const sin = Math.sin(frigate.heading);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  const outsideX = Math.max(Math.abs(localX) - GAME_CONFIG.frigate.length / 2, 0);
  const outsideY = Math.max(Math.abs(localY) - GAME_CONFIG.frigate.beam / 2, 0);
  return Math.hypot(outsideX, outsideY);
}

function canOccupy(frigate: Frigate, x: number, y: number, heading: number, world: World): boolean {
  return !hullTouchesLand(x, y, heading, world);
}

export function applyFrigateInput(
  source: Frigate,
  input: FrigateInput,
  dt: number,
  world: World,
  now = 0,
  settings: GameSettings = DEFAULT_SETTINGS,
): Frigate {
  const frigate = { ...source };
  if (frigate.status !== "alive") return frigate;
  const keys = input.keys;
  const turn = Number(isPressed(keys, INPUT_KEYS.turnRight)) - Number(isPressed(keys, INPUT_KEYS.turnLeft));
  const rotation = turn * GAME_CONFIG.frigate.rotationSpeed * settings.rotationPct / 100 * dt;
  const rotatedHeading = normalizeAngle(frigate.heading + rotation);
  if (rotation === 0 || canOccupy(frigate, frigate.x, frigate.y, rotatedHeading, world)) frigate.heading = rotatedHeading;

  const cannonTurn = Number(isPressed(keys, INPUT_KEYS.cannonRight)) - Number(isPressed(keys, INPUT_KEYS.cannonLeft));
  frigate.cannonBearing = normalizeAngle(
    frigate.cannonBearing + cannonTurn * GAME_CONFIG.cannon.bearingSpeed * settings.cannonRotationPct / 100 * dt,
  );
  const rangeChange = Number(isPressed(keys, INPUT_KEYS.rangeUp)) - Number(isPressed(keys, INPUT_KEYS.rangeDown));
  frigate.cannonRange = Math.max(
    GAME_CONFIG.cannon.minRange,
    Math.min(GAME_CONFIG.cannon.maxRange, frigate.cannonRange + rangeChange * GAME_CONFIG.cannon.rangeSpeed * dt),
  );
  const torpedoTurn = Number(isPressed(keys, INPUT_KEYS.torpedoRight)) - Number(isPressed(keys, INPUT_KEYS.torpedoLeft));
  frigate.torpedoBearing = normalizeAngle(
    frigate.torpedoBearing + torpedoTurn * GAME_CONFIG.torpedo.bearingSpeed * settings.torpedoRotationPct / 100 * dt,
  );

  const level = Math.max(-1, Math.min(3, Math.round(input.throttle) || 0));
  frigate.throttle = level;
  const speedScale = settings.boatSpeedPct / 100;
  const maxForwardSpeed = GAME_CONFIG.frigate.maxForwardSpeed * speedScale;
  const maxReverseSpeed = GAME_CONFIG.frigate.maxReverseSpeed * speedScale;
  const emptyFuelSpeedFactor = frigate.fuel <= 0 ? GAME_CONFIG.frigate.emptyFuelSpeedFactor : 1;
  const targetSpeed = level < 0
    ? -maxReverseSpeed * emptyFuelSpeedFactor
    : maxForwardSpeed * emptyFuelSpeedFactor * level / 3;
  const speedChange = GAME_CONFIG.frigate.acceleration * speedScale * dt;
  const speedDifference = targetSpeed - frigate.speed;
  const tolerance = Number.EPSILON * maxForwardSpeed * 2;
  frigate.speed = Math.abs(speedDifference) <= speedChange + tolerance
    ? targetSpeed
    : frigate.speed + Math.sign(speedDifference) * speedChange;
  frigate.fuel = Math.max(0, frigate.fuel - Math.abs(frigate.speed) * dt);

  const vx = Math.cos(frigate.heading) * frigate.speed;
  const vy = Math.sin(frigate.heading) * frigate.speed;
  const dx = vx * dt;
  const dy = vy * dt;
  let blocked = false;
  let impactSpeed = 0;
  if (!canOccupy(frigate, frigate.x + dx, frigate.y + dy, frigate.heading, world)) {
    blocked = true;
    if (canOccupy(frigate, frigate.x + dx, frigate.y, frigate.heading, world)) {
      frigate.x += dx;
      impactSpeed = Math.abs(vy);
    } else if (canOccupy(frigate, frigate.x, frigate.y + dy, frigate.heading, world)) {
      frigate.y += dy;
      impactSpeed = Math.abs(vx);
    } else {
      impactSpeed = Math.abs(frigate.speed);
      frigate.speed = 0;
    }
  } else {
    frigate.x += dx;
    frigate.y += dy;
  }

  if (blocked) {
    const damage = impactSpeed < GAME_CONFIG.land.grazeSpeed
      ? 0
      : Math.round(GAME_CONFIG.land.damage * Math.min(1, impactSpeed / maxForwardSpeed));
    if (damage > 0
      && now >= frigate.spawnProtectedUntil
      && (!frigate.landContact || now - frigate.lastLandDamageAt >= GAME_CONFIG.land.damageInterval)) {
      frigate.hp = Math.max(0, frigate.hp - damage);
      frigate.lastDamageSource = frigate.playerId;
      frigate.lastLandDamageAt = now;
    }
    frigate.landContact = true;
  } else {
    frigate.landContact = false;
  }
  return frigate;
}

export function createFrigate(
  playerId: string,
  name: string,
  slot: number,
  x: number,
  y: number,
  heading: number,
  now: number,
  settings: GameSettings = DEFAULT_SETTINGS,
  team = slot - 1,
): Frigate {
  return {
    playerId, name, slot, team, x, y, heading, speed: 0, hp: GAME_CONFIG.player.maxHp, status: "alive",
    fuel: fuelCapacity(settings), shells: settings.shells, torpedoes: settings.torpedoes, throttle: 0, resupplying: false,
    repairLockBaseId: null,
    sinkingStartedAt: 0, respawnAt: 0, spawnProtectedUntil: now + GAME_CONFIG.player.spawnProtection,
    cannonBearing: 0, cannonRange: GAME_CONFIG.cannon.minRange, cannonReadyAt: 0,
    torpedoBearing: 0, torpedoReadyAt: 0, landContact: false, lastLandDamageAt: now,
    lastFireCannon: false, lastFireTorpedo: false, lastDamageSource: null,
  };
}

export function fuelCapacity(settings: GameSettings): number {
  return settings.fuelCrossings * mapDimensions(settings.mapSize).width;
}

export function refillSupplies(frigate: Frigate, settings: GameSettings): void {
  frigate.fuel = fuelCapacity(settings);
  frigate.shells = settings.shells;
  frigate.torpedoes = settings.torpedoes;
  frigate.hp = GAME_CONFIG.player.maxHp;
  frigate.resupplying = false;
}

export function spawnFrigate(
  playerId: string,
  name: string,
  slot: number,
  world: World,
  others: readonly Frigate[],
  random: () => number,
  now: number,
  attempts: number = GAME_CONFIG.player.spawnAttempts,
  settings: GameSettings = DEFAULT_SETTINGS,
  team = slot - 1,
): Frigate {
  let best: { x: number; y: number; nearest: number } | undefined;
  const validPoint = (x: number, y: number) => hasSpawnClearance(world, x, y);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const x = world.width * random();
    const y = world.height * random();
    if (!validPoint(x, y)) continue;
    let nearest = Number.POSITIVE_INFINITY;
    for (const other of others) {
      if (other.status !== "alive") continue;
      nearest = Math.min(nearest, Math.hypot(other.x - x, other.y - y));
    }
    if (nearest >= GAME_CONFIG.player.spawnDistanceRatio * world.width) {
      return createFrigate(playerId, name, slot, x, y, random() * Math.PI * 2, now, settings, team);
    }
    if (!best || nearest > best.nearest) best = { x, y, nearest };
  }
  if (!best) {
    for (let y = 80; y < world.height - 80 && !best; y += 80) {
      for (let x = 80; x < world.width - 80; x += 80) {
        if (validPoint(x, y)) {
          best = { x, y, nearest: -1 };
          break;
        }
      }
    }
  }
  if (!best) throw new Error("World has no valid spawn point");
  return createFrigate(playerId, name, slot, best.x, best.y, random() * Math.PI * 2, now, settings, team);
}

export function spawnAtBase(
  playerId: string,
  name: string,
  slot: number,
  base: BaseSite,
  now: number,
  settings: GameSettings = DEFAULT_SETTINGS,
  team = slot - 1,
): Frigate {
  return createFrigate(playerId, name, slot, base.harbourX, base.harbourY, base.facing, now, settings, team);
}

export function spawnPlayerFrigate(
  playerId: string,
  name: string,
  slot: number,
  state: GameState,
  others: readonly Frigate[],
  random: () => number,
  now: number,
  team = slot - 1,
): Frigate {
  const home = state.bases.find((base) =>
    base.kind === "home" && base.homeTeam === team && base.ownerTeam === team,
  );
  const ownedBases = state.bases.filter((base) => base.active && base.ownerTeam === team);
  const bases = home ? [home, ...ownedBases.filter((base) => base.id !== home.id)] : ownedBases;
  for (const base of bases) {
    for (const radius of [0, 35, 45, 55, 65, 75]) {
      for (let direction = 0; direction < 16; direction += 1) {
        const angle = base.facing + direction * Math.PI / 8;
        const x = base.harbourX + Math.cos(angle) * radius;
        const y = base.harbourY + Math.sin(angle) * radius;
        if (!hasSpawnClearance(state.world, x, y)) continue;
        if (others.some((other) =>
          other.status === "alive"
          && pointToHullDistance(x, y, other) < GAME_CONFIG.frigate.length,
        )) continue;
        return createFrigate(playerId, name, slot, x, y, base.facing, now, state.settings, team);
      }
    }
  }
  return spawnFrigate(
    playerId,
    name,
    slot,
    state.world,
    others,
    random,
    now,
    GAME_CONFIG.player.spawnAttempts,
    state.settings,
    team,
  );
}

export function createGameState(world: World, sites: readonly BaseSite[] = []): GameState {
  return {
    tick: 0,
    world,
    settings: { ...DEFAULT_SETTINGS },
    bases: sites.map((site): Base => ({
      ...site,
      active: site.kind === "neutral",
      ownerTeam: null,
      captureBy: null,
      captureProgress: 0,
      turret: "none",
      turretHp: 0,
      turretReadyAt: 0,
      repairBy: null,
      repairProgress: 0,
      lostFrom: null,
      returnAt: null,
      heldFor: 0,
    })),
    frigates: {},
    shells: [],
    torpedoes: [],
    scores: {},
    teamBonus: Array(GAME_CONFIG.teams.count).fill(0),
    events: [],
    nextProjectileId: 1,
    nextShotId: 1,
  };
}

function playerName(state: GameState, playerId: string): string {
  return state.scores[playerId]?.name ?? state.frigates[playerId]?.name ?? "Unknown";
}

export function stepTurrets(state: GameState, now: number): void {
  for (const base of state.bases) {
    if (!base.active || base.ownerTeam === null || base.turret !== "active" || now < base.turretReadyAt) continue;
    const owner = Object.values(state.scores).find((score) => score.team === base.ownerTeam);
    if (!owner) continue;
    let target: Frigate | undefined;
    let nearestDistance: number = GAME_CONFIG.bases.turretRange;
    for (const frigate of Object.values(state.frigates)) {
      if (
        frigate.status !== "alive"
        || frigate.team === base.ownerTeam
        || now < frigate.spawnProtectedUntil
      ) continue;
      const distance = Math.hypot(frigate.x - base.cityX, frigate.y - base.cityY);
      if (distance <= nearestDistance) {
        if (distance < nearestDistance || !target) {
          target = frigate;
          nearestDistance = distance;
        }
      }
    }
    if (!target) continue;
    const distance = Math.hypot(target.x - base.cityX, target.y - base.cityY);
    const shellSpeed = GAME_CONFIG.cannon.shellSpeed * state.settings.shellSpeedPct / 100;
    state.shells.push({
      id: `s${state.nextProjectileId++}`,
      ownerId: owner.playerId,
      turretBaseId: base.id,
      startX: base.cityX,
      startY: base.cityY,
      impactX: target.x,
      impactY: target.y,
      elapsed: 0,
      duration: distance / shellSpeed,
    });
    base.turretReadyAt = now + GAME_CONFIG.bases.turretReload;
  }
}

function distanceToCity(base: Base, x: number, y: number): number {
  const dx = Math.max(Math.abs(x - base.cityX) - GAME_CONFIG.bases.citySize / 2, 0);
  const dy = Math.max(Math.abs(y - base.cityY) - GAME_CONFIG.bases.citySize / 2, 0);
  return Math.hypot(dx, dy);
}

function lockFrigateToBase(state: GameState, frigate: Frigate, base: Base): void {
  if (frigate.repairLockBaseId === base.id) {
    frigate.resupplying = false;
    return;
  }
  frigate.repairLockBaseId = base.id;
  frigate.resupplying = false;
  state.events.push({
    type: "repairInterrupted",
    playerId: frigate.playerId,
    baseId: base.id,
  });
}

function lockTeamBoatsInHarbour(state: GameState, team: number, base: Base): void {
  for (const frigate of Object.values(state.frigates)) {
    if (
      frigate.status === "alive"
      && frigate.team === team
      && pointInsideHarbour(frigate.x, frigate.y, base)
    ) lockFrigateToBase(state, frigate, base);
  }
}

export function stepBases(
  state: GameState,
  dt: number,
  now: number,
  firedPlayers: ReadonlySet<string> = new Set(),
): void {
  for (const frigate of Object.values(state.frigates)) {
    if (frigate.status !== "alive") {
      frigate.repairLockBaseId = null;
      frigate.resupplying = false;
      continue;
    }
    if (
      frigate.repairLockBaseId !== null
      && !state.bases.some((base) =>
        base.id === frigate.repairLockBaseId && pointInsideHarbour(frigate.x, frigate.y, base),
      )
    ) frigate.repairLockBaseId = null;
  }
  for (const base of state.bases) {
    let ownershipChanged = false;
    if (base.kind === "home" && base.returnAt !== null && now >= base.returnAt) {
      const ownerTeam = base.lostFrom;
      const owner = Object.values(state.scores).find((score) => score.team === ownerTeam);
      restoreHome(base, now);
      if (owner) {
        state.events.push({
          type: "capture",
          playerId: owner.playerId,
          name: owner.name,
          message: `${owner.name}'s home base is back`,
        });
      }
    }
    const occupants = Object.values(state.frigates).filter((frigate) =>
      frigate.status === "alive" && hullInsideHarbour(frigate, base),
    );
    const capturers = occupants.filter((frigate) => frigate.team !== base.ownerTeam);
    const captureTeam = capturers[0]?.team;
    if (
      !base.active
      || captureTeam === undefined
      || capturers.some((frigate) => frigate.team !== captureTeam)
      || base.turret === "active"
    ) {
      base.captureBy = null;
      base.captureProgress = 0;
    } else {
      const capturer = capturers[0]!;
      if (base.captureBy !== captureTeam) {
        base.captureBy = captureTeam;
        base.captureProgress = 0;
      }
      base.captureProgress += dt / state.settings.captureTime;
      if (base.captureProgress >= 1) {
        const previousOwnerTeam = base.ownerTeam;
        const capturerId = capturer.playerId;
        const capturerTeam = captureTeam;
        const capturerName = playerName(state, capturerId);
        base.ownerTeam = capturerTeam;
        base.heldFor = 0;
        ownershipChanged = true;
        base.captureBy = null;
        base.captureProgress = 0;
        if (base.kind === "home" && base.lostFrom !== null && capturerTeam === base.lostFrom) {
          restoreHome(base, now);
          state.events.push({
            type: "capture",
            playerId: capturerId,
            name: capturerName,
            message: `${capturerName} took back their home base`,
          });
        } else if (base.kind === "home" && base.lostFrom === null && previousOwnerTeam !== null) {
          const owner = Object.values(state.scores).find((score) => score.team === previousOwnerTeam);
          const ownerName = owner?.name ?? "Unknown";
          base.lostFrom = previousOwnerTeam;
          base.returnAt = now + GAME_CONFIG.bases.homeReturnDelay;
          state.teamBonus[previousOwnerTeam] = (state.teamBonus[previousOwnerTeam] ?? 0) - GAME_CONFIG.bases.homeCapturePoints;
          state.teamBonus[capturerTeam] = (state.teamBonus[capturerTeam] ?? 0) + GAME_CONFIG.bases.homeCapturePoints;
          state.events.push({
            type: "capture",
            playerId: capturerId,
            name: capturerName,
            message: `${capturerName} captured ${ownerName}'s home base`,
          });
        } else if (base.kind === "home" && base.lostFrom !== null) {
          const owner = Object.values(state.scores).find((score) => score.team === base.lostFrom);
          const ownerName = owner?.name ?? "Unknown";
          state.teamBonus[capturerTeam] = (state.teamBonus[capturerTeam] ?? 0) + GAME_CONFIG.bases.homeCapturePoints;
          state.events.push({
            type: "capture",
            playerId: capturerId,
            name: capturerName,
            message: `${capturerName} captured ${ownerName}'s home base`,
          });
        } else {
          state.events.push({
            type: "capture",
            playerId: capturerId,
            name: capturerName,
            message: `${capturerName} captured a base`,
          });
        }
      }
    }

    const ownerTeam = base.ownerTeam;
    const owner = Object.values(state.scores).find((score) => score.team === ownerTeam);
    const incomeInterval = state.settings.baseIncomeInterval;
    if (!base.active || ownerTeam === null || incomeInterval === 0) {
      base.heldFor = 0;
    } else if (!ownershipChanged) {
      base.heldFor += dt;
      while (base.heldFor >= incomeInterval) {
        if (base.kind !== "home") {
          state.teamBonus[ownerTeam] = (state.teamBonus[ownerTeam] ?? 0) + GAME_CONFIG.baseIncome.payout;
          if (owner) {
            state.events.push({
              type: "income",
              playerId: owner.playerId,
              baseId: base.id,
              team: ownerTeam,
              x: base.cityX,
              y: base.cityY,
              amount: GAME_CONFIG.baseIncome.payout,
            });
          }
        }
        base.heldFor -= incomeInterval;
      }
    }
    if (!base.active || ownerTeam === null || base.turret === "active") {
      base.repairBy = null;
      base.repairProgress = 0;
      continue;
    }
    const repairer = Object.values(state.frigates).find((frigate) =>
      frigate.team === ownerTeam
      && frigate.status === "alive"
      && frigate.repairLockBaseId === null
      && hullInsideHarbour(frigate, base)
      && !firedPlayers.has(frigate.playerId),
    );
    if (!repairer) {
      base.repairBy = null;
      base.repairProgress = 0;
      continue;
    }
    if (base.repairBy !== ownerTeam) {
      base.repairBy = ownerTeam;
      base.repairProgress = 0;
    }
    base.repairProgress += dt / state.settings.repairTime;
    if (base.repairProgress < 1) continue;
    const action = base.turret === "none" ? "installed" : "repaired";
    const name = playerName(state, repairer.playerId);
    base.turret = "active";
    base.turretHp = GAME_CONFIG.bases.turretHp;
    base.turretReadyAt = now;
    base.repairBy = null;
    base.repairProgress = 0;
    state.events.push({
      type: "turret",
      playerId: repairer.playerId,
      name,
      message: `${name} ${action} a turret`,
    });
  }
  for (const frigate of Object.values(state.frigates)) {
    const canResupply = frigate.status === "alive"
      && frigate.repairLockBaseId === null
      && frigate.throttle === 0
      && state.bases.some((base) =>
        base.active && base.ownerTeam === frigate.team && hullInsideHarbour(frigate, base),
      );
    if (!canResupply) {
      frigate.resupplying = false;
      continue;
    }
    const maxFuel = fuelCapacity(state.settings);
    const hasSuppliesMissing = frigate.fuel < maxFuel
      || frigate.shells < state.settings.shells
      || frigate.torpedoes < state.settings.torpedoes
      || frigate.hp < GAME_CONFIG.player.maxHp;
    if (!hasSuppliesMissing) {
      frigate.resupplying = false;
      continue;
    }
    const fractionPerSecond = dt / state.settings.resupplyTime;
    frigate.fuel = Math.min(maxFuel, frigate.fuel + maxFuel * fractionPerSecond);
    frigate.shells = Math.min(state.settings.shells, frigate.shells + state.settings.shells * fractionPerSecond);
    frigate.torpedoes = Math.min(state.settings.torpedoes, frigate.torpedoes + state.settings.torpedoes * fractionPerSecond);
    frigate.hp = Math.min(
      GAME_CONFIG.player.maxHp,
      frigate.hp + GAME_CONFIG.player.maxHp * fractionPerSecond,
    );
    frigate.resupplying = frigate.fuel < maxFuel
      || frigate.shells < state.settings.shells
      || frigate.torpedoes < state.settings.torpedoes
      || frigate.hp < GAME_CONFIG.player.maxHp;
  }
}

function emitExplosion(
  state: GameState,
  x: number,
  y: number,
  kind: ExplosionKind,
  cause?: "shell" | "torpedo" | "land" | "turret",
): void {
  state.events.push({
    type: "explosion",
    x,
    y,
    kind,
    ...(cause === "torpedo" ? { cause } : {}),
  });
}

function sinkFrigate(
  state: GameState,
  frigate: Frigate,
  sourceId: string | null,
  now: number,
  sourceLabel?: string,
): void {
  if (frigate.status !== "alive") return;
  frigate.status = "sinking";
  frigate.repairLockBaseId = null;
  frigate.resupplying = false;
  frigate.sinkingStartedAt = now;
  frigate.respawnAt = now + GAME_CONFIG.player.respawnDelay;
  frigate.speed = 0;
  const killer = sourceId && state.scores[sourceId] ? state.scores[sourceId] : undefined;
  const victimScore = state.scores[frigate.playerId];
  if (victimScore) victimScore.sunk += 1;
  if (sourceId === frigate.playerId) {
    if (victimScore) victimScore.score -= 1;
  } else if (killer) killer.score += 1;
  const killerName = sourceId ? state.scores[sourceId]?.name ?? (state.frigates[sourceId]?.name ?? "Unknown") : "the sea";
  const displayName = sourceLabel ?? killerName;
  state.events.push({
    type: "sank",
    ...(sourceId !== null ? { playerId: sourceId } : {}),
    name: displayName,
    targetId: frigate.playerId,
    targetName: frigate.name,
    message: `${displayName} sank ${frigate.name}`,
  });
}

function damageFrigate(
  state: GameState,
  target: Frigate,
  amount: number,
  sourceId: string | null,
  now: number,
  sourceLabel?: string,
  cause: "shell" | "torpedo" | "turret" = "shell",
  shotId?: string,
): void {
  if (target.status !== "alive" || now < target.spawnProtectedUntil) return;
  const previousHp = target.hp;
  target.hp = Math.max(0, target.hp - amount);
  const damage = previousHp - target.hp;
  if (damage <= 0) return;
  target.lastDamageSource = sourceId;
  state.events.push({
    type: "damage",
    ...(sourceId !== null ? { playerId: sourceId } : {}),
    targetId: target.playerId,
    x: target.x,
    y: target.y,
    amount: damage,
    cause,
    ...(shotId ? { shotId } : {}),
  });
  const sourceTeam = sourceId
    ? state.scores[sourceId]?.team ?? state.frigates[sourceId]?.team
    : undefined;
  if (sourceTeam !== undefined && sourceTeam !== target.team) {
    const base = state.bases.find((candidate) =>
      candidate.active
      && candidate.ownerTeam === target.team
      && pointInsideHarbour(target.x, target.y, candidate),
    );
    if (base) lockFrigateToBase(state, target, base);
  }
  if (target.hp === 0) sinkFrigate(state, target, sourceId, now, sourceLabel);
}

function fireCannon(state: GameState, frigate: Frigate, now: number, settings: GameSettings): void {
  const shotId = `q${state.nextShotId++}`;
  const angle = frigate.heading + frigate.cannonBearing;
  const forwardX = Math.cos(angle);
  const forwardY = Math.sin(angle);
  const perpendicularX = -forwardY;
  const perpendicularY = forwardX;
  const duration = frigate.cannonRange / (GAME_CONFIG.cannon.shellSpeed * settings.shellSpeedPct / 100);
  for (const side of [-1, 1]) {
    state.shells.push({
      id: `s${state.nextProjectileId++}`,
      shotId,
      ownerId: frigate.playerId,
      startX: frigate.x + perpendicularX * GAME_CONFIG.cannon.shellOffset * side,
      startY: frigate.y + perpendicularY * GAME_CONFIG.cannon.shellOffset * side,
      impactX: frigate.x + forwardX * frigate.cannonRange + perpendicularX * GAME_CONFIG.cannon.shellOffset * side,
      impactY: frigate.y + forwardY * frigate.cannonRange + perpendicularY * GAME_CONFIG.cannon.shellOffset * side,
      elapsed: 0,
      duration,
    });
  }
  frigate.cannonReadyAt = now + settings.cannonReload;
}

function fireTorpedoes(state: GameState, frigate: Frigate, now: number, settings: GameSettings): void {
  const shotId = `q${state.nextShotId++}`;
  const centre = frigate.heading + frigate.torpedoBearing;
  for (const offset of [-GAME_CONFIG.torpedo.spread, 0, GAME_CONFIG.torpedo.spread]) {
    state.torpedoes.push({
      id: `t${state.nextProjectileId++}`,
      shotId,
      ownerId: frigate.playerId,
      x: frigate.x,
      y: frigate.y,
      angle: centre + offset,
      elapsed: 0,
      speed: GAME_CONFIG.torpedo.speed * settings.torpedoSpeedPct / 100,
    });
  }
  frigate.torpedoReadyAt = now + settings.torpedoReload;
}

function circlesFor(frigate: Frigate): Array<{ x: number; y: number }> {
  return GAME_CONFIG.frigate.collisionCircleOffsets.map((offset) => ({
    x: frigate.x + Math.cos(frigate.heading) * offset,
    y: frigate.y + Math.sin(frigate.heading) * offset,
  }));
}

function resolveFrigateCollisions(frigates: Frigate[]): void {
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < frigates.length; i += 1) {
      const first = frigates[i];
      if (!first || first.status !== "alive") continue;
      for (let j = i + 1; j < frigates.length; j += 1) {
        const second = frigates[j];
        if (!second || second.status !== "alive") continue;
        const minimum = GAME_CONFIG.frigate.hitCircleRadius * 2;
        const overlapping = circlesFor(first).some((a) => circlesFor(second).some((b) => Math.hypot(b.x - a.x, b.y - a.y) < minimum));
        if (!overlapping) continue;
        let dx = second.x - first.x;
        let dy = second.y - first.y;
        let distance = Math.hypot(dx, dy);
        if (distance === 0) {
          dx = Math.cos(first.heading);
          dy = Math.sin(first.heading);
          distance = 1;
        }
        const axisX = dx / distance;
        const axisY = dy / distance;
        const angle = Math.atan2(axisY, axisX);
        const extent = (frigate: Frigate) => GAME_CONFIG.frigate.hitCircleRadius
          + Math.max(...GAME_CONFIG.frigate.collisionCircleOffsets.map((offset) => Math.abs(offset * Math.cos(frigate.heading - angle))));
        const separation = extent(first) + extent(second);
        const overlap = separation - distance;
        if (overlap <= 0) continue;
        const pushX = axisX * overlap / 2;
        const pushY = axisY * overlap / 2;
        first.x -= pushX;
        first.y -= pushY;
        second.x += pushX;
        second.y += pushY;
        first.speed = 0;
        second.speed = 0;
      }
    }
  }
}

function segmentHitsHull(x1: number, y1: number, x2: number, y2: number, target: Frigate): boolean {
  const distance = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(distance / 5));
  for (let i = 0; i <= steps; i += 1) {
    const fraction = i / steps;
    if (pointToHullDistance(x1 + (x2 - x1) * fraction, y1 + (y2 - y1) * fraction, target) <= 2) return true;
  }
  return false;
}

export function stepGame(state: GameState, inputs: Record<string, FrigateInput | undefined>, dt: number, now: number): void {
  state.tick += 1;
  state.events = [];
  const firedPlayers = new Set<string>();
  for (const frigate of Object.values(state.frigates)) {
    if (frigate.status === "sinking" && now >= frigate.sinkingStartedAt + GAME_CONFIG.player.sinkAnimation) {
      frigate.status = "waiting";
    }
    const input = inputs[frigate.playerId] ?? { seq: 0, keys: 0, throttle: 0, fireCannon: false, fireTorpedo: false };
    if (frigate.status === "alive") {
      const previousHp = frigate.hp;
      const updated = applyFrigateInput(frigate, input, dt, state.world, now, state.settings);
      Object.assign(frigate, updated);
      if (frigate.hp < previousHp) {
        state.events.push({
          type: "damage",
          targetId: frigate.playerId,
          x: frigate.x,
          y: frigate.y,
          amount: previousHp - frigate.hp,
          cause: "land",
        });
      }
      if (frigate.hp <= 0) sinkFrigate(state, frigate, frigate.playerId, now);
      const cannonEdge = input.fireCannon && !frigate.lastFireCannon;
      const torpedoEdge = input.fireTorpedo && !frigate.lastFireTorpedo;
      if (cannonEdge && now >= frigate.cannonReadyAt && frigate.shells >= 1) {
        fireCannon(state, frigate, now, state.settings);
        frigate.shells -= 1;
        frigate.spawnProtectedUntil = now;
        firedPlayers.add(frigate.playerId);
      }
      if (torpedoEdge && now >= frigate.torpedoReadyAt && frigate.torpedoes >= 1) {
        fireTorpedoes(state, frigate, now, state.settings);
        frigate.torpedoes -= 1;
        frigate.spawnProtectedUntil = now;
        firedPlayers.add(frigate.playerId);
      }
      frigate.lastFireCannon = input.fireCannon;
      frigate.lastFireTorpedo = input.fireTorpedo;
    } else {
      frigate.lastFireCannon = false;
      frigate.lastFireTorpedo = false;
    }
  }

  resolveFrigateCollisions(Object.values(state.frigates));
  stepTurrets(state, now);

  const remainingShells: Shell[] = [];
  for (const shell of state.shells) {
    shell.elapsed += dt;
    if (shell.elapsed < shell.duration) {
      remainingShells.push(shell);
      continue;
    }
    const kind: ExplosionKind = isLandAt(state.world, shell.impactX, shell.impactY) ? "land" : "splash";
    const shellCause = shell.turretBaseId ? "turret" : "shell";
    emitExplosion(state, shell.impactX, shell.impactY, kind, shellCause);
    const shooterName = playerName(state, shell.ownerId);
    const shooterTeam = state.scores[shell.ownerId]?.team ?? state.frigates[shell.ownerId]?.team;
    const sourceLabel = shell.turretBaseId ? `${shooterName}'s turret` : undefined;
    for (const target of Object.values(state.frigates)) {
      if (
        target.status === "alive"
        && !(shell.turretBaseId && target.playerId === shell.ownerId)
        && pointToHullDistance(shell.impactX, shell.impactY, target) <= GAME_CONFIG.cannon.damageRadius
      ) {
        if (target.playerId === shell.ownerId || target.team !== shooterTeam) {
          damageFrigate(
            state,
            target,
            GAME_CONFIG.cannon.damage,
            shell.ownerId,
            now,
            sourceLabel,
            shell.turretBaseId ? "turret" : "shell",
            shell.shotId,
          );
        }
        if (target.hp > 0) emitExplosion(state, shell.impactX, shell.impactY, "hit", shellCause);
      }
    }
    for (const base of state.bases) {
      if (
        base.ownerTeam === null
        || base.ownerTeam === shooterTeam
        || distanceToCity(base, shell.impactX, shell.impactY) > GAME_CONFIG.cannon.damageRadius
      ) continue;
      if (base.turret !== "active") {
        if (base.repairProgress > 0) {
          const ownerTeam = base.ownerTeam;
          base.repairBy = null;
          base.repairProgress = 0;
          lockTeamBoatsInHarbour(state, ownerTeam, base);
        }
        continue;
      }
      const previousHp = base.turretHp;
      base.turretHp = Math.max(0, base.turretHp - GAME_CONFIG.cannon.damage);
      state.events.push({
        type: "damage",
        playerId: shell.ownerId,
        baseId: base.id,
        x: base.cityX,
        y: base.cityY,
        amount: previousHp - base.turretHp,
        cause: "shell",
        ...(shell.shotId ? { shotId: shell.shotId } : {}),
      });
      if (base.turretHp > 0) continue;
      base.turret = "destroyed";
      emitExplosion(state, base.cityX, base.cityY, "hit", shellCause);
      const owner = Object.values(state.scores).find((score) => score.team === base.ownerTeam);
      const ownerName = owner?.name ?? "Unknown";
      state.events.push({
        type: "turret",
        playerId: shell.ownerId,
        name: shooterName,
        message: `${shooterName} destroyed ${ownerName}'s turret`,
      });
    }
  }
  state.shells = remainingShells;

  const remainingTorpedoes: Torpedo[] = [];
  for (const torpedo of state.torpedoes) {
    const oldX = torpedo.x;
    const oldY = torpedo.y;
    const distance = torpedo.speed * dt;
    const steps = Math.max(1, Math.ceil(distance / (GAME_CONFIG.world.tileSize / 2)));
    let exploded = false;
    for (let step = 1; step <= steps; step += 1) {
      const fraction = step / steps;
      const x = oldX + Math.cos(torpedo.angle) * distance * fraction;
      const y = oldY + Math.sin(torpedo.angle) * distance * fraction;
      torpedo.elapsed += step === 1 ? dt / steps : dt / steps;
      if (isLandAt(state.world, x, y)) {
        torpedo.x = x;
        torpedo.y = y;
        emitExplosion(state, x, y, "land", "torpedo");
        exploded = true;
        break;
      }
      torpedo.x = x;
      torpedo.y = y;
      for (const target of Object.values(state.frigates)) {
        if (target.status !== "alive" || (target.playerId === torpedo.ownerId && torpedo.elapsed < GAME_CONFIG.torpedo.armingTime)) continue;
        if (segmentHitsHull(oldX, oldY, x, y, target)) {
          const shooterTeam = state.scores[torpedo.ownerId]?.team ?? state.frigates[torpedo.ownerId]?.team;
          if (target.playerId === torpedo.ownerId || target.team !== shooterTeam) {
            damageFrigate(state, target, GAME_CONFIG.torpedo.damage, torpedo.ownerId, now, undefined, "torpedo", torpedo.shotId);
          }
          emitExplosion(state, x, y, "hit", "torpedo");
          exploded = true;
          break;
        }
      }
      if (exploded) break;
    }
    if (!exploded && torpedo.x >= 0 && torpedo.y >= 0 && torpedo.x < state.world.width && torpedo.y < state.world.height) {
      remainingTorpedoes.push(torpedo);
    } else if (!exploded) {
      emitExplosion(state, torpedo.x, torpedo.y, "land", "torpedo");
    }
  }
  state.torpedoes = remainingTorpedoes;
  stepBases(state, dt, now, firedPlayers);
}

export function regenerateGameWorld(
  state: GameState,
  world: World,
  sites: readonly BaseSite[],
  now: number,
  random: () => number,
): void {
  state.world = world;
  state.bases = sites.map((site): Base => {
    const owner = site.kind === "home"
      ? Object.values(state.scores).find((score) => score.team === site.homeTeam)
      : undefined;
    return {
      ...site,
      active: site.kind === "neutral" || Boolean(owner),
      ownerTeam: owner?.team ?? null,
      captureBy: null,
      captureProgress: 0,
      turret: owner ? "active" : "none",
      turretHp: owner ? GAME_CONFIG.bases.turretHp : 0,
      turretReadyAt: owner ? now : 0,
      repairBy: null,
      repairProgress: 0,
      lostFrom: null,
      returnAt: null,
      heldFor: 0,
    };
  });
  state.shells = [];
  state.torpedoes = [];
  const frigates = Object.values(state.frigates);
  const respawned: Frigate[] = [];
  for (const frigate of frigates) {
    const fresh = spawnPlayerFrigate(
      frigate.playerId,
      frigate.name,
      frigate.slot,
      state,
      respawned,
      random,
      now,
      frigate.team,
    );
    const score = state.scores[frigate.playerId];
    const host = score?.host ?? false;
    const connected = score?.connected ?? true;
    Object.assign(frigate, fresh);
    respawned.push(frigate);
    if (score) {
      score.host = host;
      score.connected = connected;
    }
  }
}

function createSeededRandom(seed: number): () => number {
  return mulberry32(seed);
}

export { createSeededRandom };
