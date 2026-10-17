import { GAME_CONFIG } from "./config.js";
import { mulberry32 } from "./rng.js";
import { DEFAULT_SETTINGS, type GameSettings } from "./settings.js";
import { generateWorldWithFallback, isLandAt, type World } from "./world.js";

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
  x: number;
  y: number;
  heading: number;
  speed: number;
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
  ownerId: string;
  startX: number;
  startY: number;
  impactX: number;
  impactY: number;
  elapsed: number;
  duration: number;
}

export interface Torpedo {
  id: string;
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
  score: number;
  sunk: number;
  host: boolean;
  connected: boolean;
}

export interface GameEvent {
  type: "explosion" | "sank" | "join" | "leave" | "host";
  x?: number;
  y?: number;
  kind?: ExplosionKind;
  playerId?: string;
  name?: string;
  targetId?: string;
  targetName?: string;
  message?: string;
}

export interface GameState {
  tick: number;
  world: World;
  settings: GameSettings;
  frigates: Record<string, Frigate>;
  shells: Shell[];
  torpedoes: Torpedo[];
  scores: Record<string, PlayerScore>;
  events: GameEvent[];
  nextProjectileId: number;
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
  const { tileSize, columns, rows, width, height } = GAME_CONFIG.world;
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
  const speedScale = settings.boatSpeedPct / 100;
  const maxForwardSpeed = GAME_CONFIG.frigate.maxForwardSpeed * speedScale;
  const maxReverseSpeed = GAME_CONFIG.frigate.maxReverseSpeed * speedScale;
  const targetSpeed = level < 0
    ? -maxReverseSpeed
    : maxForwardSpeed * level / 3;
  const speedChange = GAME_CONFIG.frigate.acceleration * speedScale * dt;
  const speedDifference = targetSpeed - frigate.speed;
  const tolerance = Number.EPSILON * maxForwardSpeed * 2;
  frigate.speed = Math.abs(speedDifference) <= speedChange + tolerance
    ? targetSpeed
    : frigate.speed + Math.sign(speedDifference) * speedChange;

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
): Frigate {
  return {
    playerId, name, slot, x, y, heading, speed: 0, hp: GAME_CONFIG.player.maxHp, status: "alive",
    sinkingStartedAt: 0, respawnAt: 0, spawnProtectedUntil: now + GAME_CONFIG.player.spawnProtection,
    cannonBearing: 0, cannonRange: GAME_CONFIG.cannon.maxRange, cannonReadyAt: 0,
    torpedoBearing: 0, torpedoReadyAt: 0, landContact: false, lastLandDamageAt: now,
    lastFireCannon: false, lastFireTorpedo: false, lastDamageSource: null,
  };
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
): Frigate {
  let best: { x: number; y: number; nearest: number } | undefined;
  const validPoint = (x: number, y: number) => hasSpawnClearance(world, x, y);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const x = GAME_CONFIG.world.width * random();
    const y = GAME_CONFIG.world.height * random();
    if (!validPoint(x, y)) continue;
    let nearest = Number.POSITIVE_INFINITY;
    for (const other of others) {
      if (other.status !== "alive") continue;
      nearest = Math.min(nearest, Math.hypot(other.x - x, other.y - y));
    }
    if (nearest >= GAME_CONFIG.player.spawnDistance) {
      return createFrigate(playerId, name, slot, x, y, random() * Math.PI * 2, now);
    }
    if (!best || nearest > best.nearest) best = { x, y, nearest };
  }
  if (!best) {
    for (let y = 80; y < GAME_CONFIG.world.height - 80 && !best; y += 80) {
      for (let x = 80; x < GAME_CONFIG.world.width - 80; x += 80) {
        if (validPoint(x, y)) {
          best = { x, y, nearest: -1 };
          break;
        }
      }
    }
  }
  if (!best) throw new Error("World has no valid spawn point");
  return createFrigate(playerId, name, slot, best.x, best.y, random() * Math.PI * 2, now);
}

export function createGameState(world: World): GameState {
  return {
    tick: 0,
    world,
    settings: { ...DEFAULT_SETTINGS },
    frigates: {},
    shells: [],
    torpedoes: [],
    scores: {},
    events: [],
    nextProjectileId: 1,
  };
}

function emitExplosion(state: GameState, x: number, y: number, kind: ExplosionKind): void {
  state.events.push({ type: "explosion", x, y, kind });
}

function sinkFrigate(state: GameState, frigate: Frigate, sourceId: string | null, now: number): void {
  if (frigate.status !== "alive") return;
  frigate.status = "sinking";
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
  state.events.push({
    type: "sank",
    ...(sourceId !== null ? { playerId: sourceId } : {}),
    name: killerName,
    targetId: frigate.playerId,
    targetName: frigate.name,
    message: `${killerName} sank ${frigate.name}`,
  });
}

function damageFrigate(state: GameState, target: Frigate, amount: number, sourceId: string | null, now: number): void {
  if (target.status !== "alive" || now < target.spawnProtectedUntil) return;
  target.hp = Math.max(0, target.hp - amount);
  target.lastDamageSource = sourceId;
  if (target.hp === 0) sinkFrigate(state, target, sourceId, now);
}

function fireCannon(state: GameState, frigate: Frigate, now: number, settings: GameSettings): void {
  const angle = frigate.heading + frigate.cannonBearing;
  const forwardX = Math.cos(angle);
  const forwardY = Math.sin(angle);
  const perpendicularX = -forwardY;
  const perpendicularY = forwardX;
  const duration = frigate.cannonRange / (GAME_CONFIG.cannon.shellSpeed * settings.shellSpeedPct / 100);
  for (const side of [-1, 1]) {
    state.shells.push({
      id: `s${state.nextProjectileId++}`,
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
  const centre = frigate.heading + frigate.torpedoBearing;
  for (const offset of [-GAME_CONFIG.torpedo.spread, 0, GAME_CONFIG.torpedo.spread]) {
    state.torpedoes.push({
      id: `t${state.nextProjectileId++}`,
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
  for (const frigate of Object.values(state.frigates)) {
    if (frigate.status === "sinking" && now >= frigate.sinkingStartedAt + GAME_CONFIG.player.sinkAnimation) {
      frigate.status = "waiting";
    }
    const input = inputs[frigate.playerId] ?? { seq: 0, keys: 0, throttle: 0, fireCannon: false, fireTorpedo: false };
    if (frigate.status === "alive") {
      const updated = applyFrigateInput(frigate, input, dt, state.world, now, state.settings);
      Object.assign(frigate, updated);
      if (frigate.hp <= 0) sinkFrigate(state, frigate, frigate.playerId, now);
      const cannonEdge = input.fireCannon && !frigate.lastFireCannon;
      const torpedoEdge = input.fireTorpedo && !frigate.lastFireTorpedo;
      if (cannonEdge && now >= frigate.cannonReadyAt) {
        fireCannon(state, frigate, now, state.settings);
        frigate.spawnProtectedUntil = now;
      }
      if (torpedoEdge && now >= frigate.torpedoReadyAt) {
        fireTorpedoes(state, frigate, now, state.settings);
        frigate.spawnProtectedUntil = now;
      }
      frigate.lastFireCannon = input.fireCannon;
      frigate.lastFireTorpedo = input.fireTorpedo;
    } else {
      frigate.lastFireCannon = false;
      frigate.lastFireTorpedo = false;
    }
  }

  resolveFrigateCollisions(Object.values(state.frigates));

  const remainingShells: Shell[] = [];
  for (const shell of state.shells) {
    shell.elapsed += dt;
    if (shell.elapsed < shell.duration) {
      remainingShells.push(shell);
      continue;
    }
    const kind: ExplosionKind = isLandAt(state.world, shell.impactX, shell.impactY) ? "land" : "splash";
    emitExplosion(state, shell.impactX, shell.impactY, kind);
    for (const target of Object.values(state.frigates)) {
      if (target.status === "alive" && pointToHullDistance(shell.impactX, shell.impactY, target) <= GAME_CONFIG.cannon.damageRadius) {
        damageFrigate(state, target, GAME_CONFIG.cannon.damage, shell.ownerId, now);
        if (target.hp > 0) emitExplosion(state, shell.impactX, shell.impactY, "hit");
      }
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
        emitExplosion(state, x, y, "land");
        exploded = true;
        break;
      }
      torpedo.x = x;
      torpedo.y = y;
      for (const target of Object.values(state.frigates)) {
        if (target.status !== "alive" || (target.playerId === torpedo.ownerId && torpedo.elapsed < GAME_CONFIG.torpedo.armingTime)) continue;
        if (segmentHitsHull(oldX, oldY, x, y, target)) {
          damageFrigate(state, target, GAME_CONFIG.torpedo.damage, torpedo.ownerId, now);
          emitExplosion(state, x, y, "hit");
          exploded = true;
          break;
        }
      }
      if (exploded) break;
    }
    if (!exploded && torpedo.x >= 0 && torpedo.y >= 0 && torpedo.x < GAME_CONFIG.world.width && torpedo.y < GAME_CONFIG.world.height) {
      remainingTorpedoes.push(torpedo);
    } else if (!exploded) {
      emitExplosion(state, torpedo.x, torpedo.y, "land");
    }
  }
  state.torpedoes = remainingTorpedoes;
}

export function regenerateGameWorld(state: GameState, seed: number, now: number, random: () => number): void {
  state.world = generateWorldWithFallback(seed, state.settings.landCoveragePct / 100);
  state.shells = [];
  state.torpedoes = [];
  const frigates = Object.values(state.frigates);
  const respawned: Frigate[] = [];
  for (const frigate of frigates) {
    const fresh = spawnFrigate(frigate.playerId, frigate.name, frigate.slot, state.world, respawned, random, now);
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
