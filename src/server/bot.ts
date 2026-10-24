import { GAME_CONFIG } from "../shared/config.js";
import { hullInsideHarbour, type Base } from "../shared/bases.js";
import {
  INPUT_KEYS,
  type Frigate,
  type FrigateInput,
  type GameState,
} from "../shared/sim.js";
import { isLandAt, type World } from "../shared/world.js";

type Point = { x: number; y: number };
type BotMode = "resupply" | "engage" | "assault" | "patrol";
type BotTarget = {
  id: string;
  x: number;
  y: number;
  speed: number;
  heading: number;
  kind: "frigate" | "turret";
};
type NavigationGrid = {
  columns: number;
  rows: number;
  cellSize: number;
  passable: Uint8Array;
};
type AimState = {
  targetId: string | null;
  targetSince: number;
  sampleAt: number;
  bearingError: number;
  rangeError: number;
};
type BotMemory = {
  seq: number;
  world: World | null;
  mode: BotMode;
  modeChosenAt: number;
  targetId: string | null;
  assaultBaseId: string | null;
  patrolId: number;
  navGoal: Point | null;
  navGoalKey: string | null;
  navPath: Point[];
  navPathIndex: number;
  navPlannedAt: number;
  navPlannedGoal: Point | null;
  reverseUntil: number;
  sampleAt: number;
  sampleX: number;
  sampleY: number;
  lastTurn: number;
  cannonAim: AimState;
  torpedoAim: AimState;
};

const navigationGrids = new WeakMap<World, NavigationGrid>();
const radians = Math.PI / 180;

function emptyInput(seq: number): FrigateInput {
  return { seq, keys: 0, throttle: 0, fireCannon: false, fireTorpedo: false };
}

function angleDifference(target: number, current: number): number {
  const circle = Math.PI * 2;
  return ((target - current + Math.PI) % circle + circle) % circle - Math.PI;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function gaussian(random: () => number): number {
  const first = Math.max(Number.EPSILON, random());
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(Math.PI * 2 * second);
}

function skillProfile(skill: number) {
  const index = Math.max(0, Math.min(GAME_CONFIG.bots.skill.length - 1, Math.round(skill)));
  return GAME_CONFIG.bots.skill[index]!;
}

function createNavigationGrid(world: World): NavigationGrid {
  const cellSize = GAME_CONFIG.bots.navigationCellSize;
  const columns = Math.ceil(world.width / cellSize);
  const rows = Math.ceil(world.height / cellSize);
  const passable = new Uint8Array(columns * rows);
  const samples = GAME_CONFIG.bots.navigationRingSamples;
  const radius = GAME_CONFIG.bots.navigationRingRadius;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = (column + 0.5) * cellSize;
      const y = (row + 0.5) * cellSize;
      if (isLandAt(world, x, y)) continue;
      let water = true;
      for (let sample = 0; sample < samples; sample += 1) {
        const angle = Math.PI * 2 * sample / samples;
        if (isLandAt(world, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)) {
          water = false;
          break;
        }
      }
      if (water) passable[row * columns + column] = 1;
    }
  }
  return { columns, rows, cellSize, passable };
}

function navigationGrid(world: World): NavigationGrid {
  let grid = navigationGrids.get(world);
  if (!grid) {
    grid = createNavigationGrid(world);
    navigationGrids.set(world, grid);
  }
  return grid;
}

function cellPoint(grid: NavigationGrid, index: number): Point {
  const column = index % grid.columns;
  const row = Math.floor(index / grid.columns);
  return { x: (column + 0.5) * grid.cellSize, y: (row + 0.5) * grid.cellSize };
}

function nearestPassableIndex(grid: NavigationGrid, point: Point): number | null {
  const centerColumn = Math.floor(point.x / grid.cellSize);
  const centerRow = Math.floor(point.y / grid.cellSize);
  const maximumRadius = Math.max(grid.columns, grid.rows);
  for (let radius = 0; radius <= maximumRadius; radius += 1) {
    let nearest: number | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const minColumn = Math.max(0, centerColumn - radius);
    const maxColumn = Math.min(grid.columns - 1, centerColumn + radius);
    const minRow = Math.max(0, centerRow - radius);
    const maxRow = Math.min(grid.rows - 1, centerRow + radius);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        if (Math.max(Math.abs(column - centerColumn), Math.abs(row - centerRow)) !== radius) continue;
        const index = row * grid.columns + column;
        if (!grid.passable[index]) continue;
        const candidate = cellPoint(grid, index);
        const candidateDistance = distance(candidate, point);
        if (candidateDistance < nearestDistance) {
          nearest = index;
          nearestDistance = candidateDistance;
        }
      }
    }
    if (nearest !== null) return nearest;
  }
  return null;
}

function directlyVisible(world: World, start: Point, end: Point): boolean {
  const length = distance(start, end);
  const steps = Math.max(1, Math.ceil(length / GAME_CONFIG.bots.navigationRingRadius));
  for (let step = 0; step <= steps; step += 1) {
    const fraction = step / steps;
    const x = start.x + (end.x - start.x) * fraction;
    const y = start.y + (end.y - start.y) * fraction;
    if (isLandAt(world, x, y)) return false;
    for (let sample = 0; sample < GAME_CONFIG.bots.navigationRingSamples; sample += 1) {
      const angle = Math.PI * 2 * sample / GAME_CONFIG.bots.navigationRingSamples;
      if (isLandAt(
        world,
        x + Math.cos(angle) * GAME_CONFIG.bots.navigationRingRadius,
        y + Math.sin(angle) * GAME_CONFIG.bots.navigationRingRadius,
      )) return false;
    }
  }
  return true;
}

type HeapNode = { index: number; priority: number };

function heapPush(heap: HeapNode[], node: HeapNode): void {
  let index = heap.length;
  heap.push(node);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if ((heap[parent]?.priority ?? Number.POSITIVE_INFINITY) <= node.priority) break;
    heap[index] = heap[parent]!;
    index = parent;
  }
  heap[index] = node;
}

function heapPop(heap: HeapNode[]): HeapNode | undefined {
  const first = heap[0];
  const last = heap.pop();
  if (!first || !last || heap.length === 0) return first;
  let index = 0;
  while (index * 2 + 1 < heap.length) {
    let child = index * 2 + 1;
    if ((heap[child + 1]?.priority ?? Number.POSITIVE_INFINITY) < (heap[child]?.priority ?? Number.POSITIVE_INFINITY)) child += 1;
    if ((heap[child]?.priority ?? Number.POSITIVE_INFINITY) >= last.priority) break;
    heap[index] = heap[child]!;
    index = child;
  }
  heap[index] = last;
  return first;
}

function octileDistance(grid: NavigationGrid, first: number, second: number): number {
  const dx = Math.abs(first % grid.columns - second % grid.columns);
  const dy = Math.abs(Math.floor(first / grid.columns) - Math.floor(second / grid.columns));
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

function findPath(world: World, start: Point, goal: Point): Point[] | null {
  const grid = navigationGrid(world);
  const startIndex = nearestPassableIndex(grid, start);
  const goalIndex = nearestPassableIndex(grid, goal);
  if (startIndex === null || goalIndex === null) return null;
  if (startIndex === goalIndex) return [goal];
  const count = grid.columns * grid.rows;
  const cameFrom = new Int32Array(count).fill(-1);
  const cost = new Float64Array(count).fill(Number.POSITIVE_INFINITY);
  const closed = new Uint8Array(count);
  const heap: HeapNode[] = [];
  cost[startIndex] = 0;
  heapPush(heap, { index: startIndex, priority: octileDistance(grid, startIndex, goalIndex) });
  let reached = false;
  while (heap.length > 0) {
    const current = heapPop(heap)!.index;
    if (closed[current]) continue;
    if (current === goalIndex) {
      reached = true;
      break;
    }
    closed[current] = 1;
    const column = current % grid.columns;
    const row = Math.floor(current / grid.columns);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nextColumn = column + dx;
        const nextRow = row + dy;
        if (nextColumn < 0 || nextRow < 0 || nextColumn >= grid.columns || nextRow >= grid.rows) continue;
        const next = nextRow * grid.columns + nextColumn;
        if (!grid.passable[next] || closed[next]) continue;
        const candidate = cost[current]! + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
        if (candidate >= cost[next]!) continue;
        cost[next] = candidate;
        cameFrom[next] = current;
        heapPush(heap, { index: next, priority: candidate + octileDistance(grid, next, goalIndex) });
      }
    }
  }
  if (!reached) return null;
  const indices: number[] = [];
  for (let current = goalIndex; current !== startIndex; current = cameFrom[current]!) {
    if (current < 0 || cameFrom[current]! < 0) return null;
    indices.push(current);
  }
  indices.reverse();
  const path = indices.map((index) => cellPoint(grid, index));
  const last = path.at(-1);
  if (last && distance(last, goal) > 1 && directlyVisible(world, last, goal)) path.push(goal);
  return path;
}

function resetNavigation(memory: BotMemory): void {
  memory.navPath = [];
  memory.navPathIndex = 0;
  memory.navPlannedAt = Number.NEGATIVE_INFINITY;
  memory.navPlannedGoal = null;
}

function setGoal(memory: BotMemory, key: string, goal: Point | null): void {
  if (memory.navGoalKey !== key) {
    memory.navGoalKey = key;
    resetNavigation(memory);
  }
  memory.navGoal = goal;
}

function goalReachDistance(memory: BotMemory): number {
  if (
    memory.navGoalKey?.startsWith("resupply:")
    || memory.navGoalKey?.startsWith("capture:")
    || memory.navGoalKey?.startsWith("install:")
  ) return 5;
  return GAME_CONFIG.bots.waypointReachDistance;
}

function navigate(
  memory: BotMemory,
  world: World,
  frigate: Frigate,
  now: number,
  goalDistance = goalReachDistance(memory),
): { keys: number; throttle: number; turn: number; hasPath: boolean } {
  const goal = memory.navGoal;
  if (!goal) return { keys: 0, throttle: 0, turn: 0, hasPath: true };
  if (distance(frigate, goal) <= goalDistance) {
    resetNavigation(memory);
    return { keys: 0, throttle: 0, turn: 0, hasPath: true };
  }
  const goalMoved = memory.navPlannedGoal && distance(memory.navPlannedGoal, goal) > GAME_CONFIG.bots.pathGoalReplanDistance;
  if (
    memory.navPlannedAt === Number.NEGATIVE_INFINITY
    || now - memory.navPlannedAt >= GAME_CONFIG.bots.pathReplanSeconds
    || goalMoved
  ) {
    memory.navPath = findPath(world, frigate, goal) ?? [];
    memory.navPathIndex = 0;
    memory.navPlannedAt = now;
    memory.navPlannedGoal = { ...goal };
  }
  if (memory.navPath.length === 0) return { keys: 0, throttle: 0, turn: 0, hasPath: false };
  while (
    memory.navPathIndex < memory.navPath.length - 1
    && distance(frigate, memory.navPath[memory.navPathIndex]!) <= GAME_CONFIG.bots.waypointReachDistance
  ) memory.navPathIndex += 1;
  if (memory.navPathIndex >= memory.navPath.length) {
    resetNavigation(memory);
    return { keys: 0, throttle: 0, turn: 0, hasPath: true };
  }
  if (
    memory.navPathIndex === memory.navPath.length - 1
    && distance(frigate, memory.navPath[memory.navPathIndex]!) <= goalDistance
  ) {
    resetNavigation(memory);
    return { keys: 0, throttle: 0, turn: 0, hasPath: true };
  }
  let furthest = memory.navPathIndex;
  for (let index = memory.navPath.length - 1; index > memory.navPathIndex; index -= 1) {
    if (directlyVisible(world, frigate, memory.navPath[index]!)) {
      furthest = index;
      break;
    }
  }
  const waypoint = memory.navPath[furthest]!;
  const desired = Math.atan2(waypoint.y - frigate.y, waypoint.x - frigate.x);
  const error = angleDifference(desired, frigate.heading);
  const finalApproach = memory.navPathIndex === memory.navPath.length - 1
    && distance(frigate, waypoint) < GAME_CONFIG.bots.waypointReachDistance * 2
    && goalReachDistance(memory) < GAME_CONFIG.bots.waypointReachDistance;
  const turn = Math.abs(error) <= 3 * radians ? 0 : Math.sign(error);
  const keys = turn > 0 ? INPUT_KEYS.turnRight : turn < 0 ? INPUT_KEYS.turnLeft : 0;
  memory.lastTurn = turn;
  return {
    keys,
    throttle: Math.abs(error) < 30 * radians && !finalApproach ? 3 : 1,
    turn,
    hasPath: true,
  };
}

function ownedBases(state: GameState, team: number): Base[] {
  return state.bases.filter((base) => base.active && base.ownerTeam === team);
}

function nearestBase(bases: readonly Base[], point: Point): Base | null {
  return bases.reduce<Base | null>((nearest, base) =>
    !nearest
      || distance(point, { x: base.harbourX, y: base.harbourY })
        < distance(point, { x: nearest.harbourX, y: nearest.harbourY })
      ? base
      : nearest, null);
}

function visibleEnemies(state: GameState, frigate: Frigate, playerId: string, now: number): Frigate[] {
  return Object.values(state.frigates)
    .filter((other) =>
      other.team !== frigate.team
      && other.status === "alive"
      && now >= other.spawnProtectedUntil
      && distance(frigate, other) <= GAME_CONFIG.bots.visionRange,
    )
    .sort((first, second) => distance(frigate, first) - distance(frigate, second));
}

function allStoresFull(frigate: Frigate, state: GameState): boolean {
  const maxFuel = state.settings.fuelCrossings
    * GAME_CONFIG.world.mapSizes[state.settings.mapSize]!.columns
    * GAME_CONFIG.world.tileSize;
  return frigate.hp >= GAME_CONFIG.player.maxHp
    && frigate.fuel >= maxFuel
    && frigate.shells >= state.settings.shells
    && frigate.torpedoes >= state.settings.torpedoes;
}

function needsResupply(frigate: Frigate, state: GameState): boolean {
  const maxFuel = state.settings.fuelCrossings
    * GAME_CONFIG.world.mapSizes[state.settings.mapSize]!.columns
    * GAME_CONFIG.world.tileSize;
  return frigate.hp < GAME_CONFIG.player.maxHp * GAME_CONFIG.bots.resupplyHullFraction
    || frigate.shells < state.settings.shells * GAME_CONFIG.bots.resupplyShellFraction
    || frigate.fuel < maxFuel * GAME_CONFIG.bots.resupplyFuelFraction;
}

function choosePatrolPoint(
  memory: BotMemory,
  state: GameState,
  frigate: Frigate,
  random: () => number,
): Point | null {
  const grid = navigationGrid(state.world);
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = { x: random() * state.world.width, y: random() * state.world.height };
    if (distance(candidate, frigate) < GAME_CONFIG.bots.patrolMinDistance) continue;
    const index = nearestPassableIndex(grid, candidate);
    if (index === null) continue;
    const point = cellPoint(grid, index);
    if (distance(point, frigate) < GAME_CONFIG.bots.patrolMinDistance) continue;
    const path = findPath(state.world, frigate, point);
    if (!path || path.length === 0) continue;
    memory.patrolId += 1;
    return point;
  }
  return null;
}

function chooseMode(
  memory: BotMemory,
  state: GameState,
  frigate: Frigate,
  playerId: string,
  now: number,
  random: () => number,
): void {
  const bases = ownedBases(state, frigate.team);
  const targetBase = memory.assaultBaseId
    ? state.bases.find((base) => base.id === memory.assaultBaseId && base.active)
    : undefined;
  if (targetBase?.ownerTeam === frigate.team && targetBase.turret !== "active") {
    memory.mode = "assault";
    memory.targetId = targetBase.id;
    memory.modeChosenAt = now;
    return;
  }
  if (needsResupply(frigate, state) && bases.length > 0) {
    const home = nearestBase(bases, frigate);
    memory.mode = "resupply";
    memory.targetId = home?.id ?? null;
    memory.modeChosenAt = now;
    return;
  }
  if (memory.mode === "resupply" && !allStoresFull(frigate, state) && bases.length > 0) {
    const home = nearestBase(bases, frigate);
    memory.mode = "resupply";
    memory.targetId = home?.id ?? null;
    memory.modeChosenAt = now;
    return;
  }
  const enemy = visibleEnemies(state, frigate, playerId, now)[0];
  if (enemy) {
    memory.mode = "engage";
    memory.targetId = enemy.playerId;
    memory.modeChosenAt = now;
    return;
  }
  const target = nearestBase(
    state.bases.filter((base) => base.active && base.ownerTeam !== frigate.team),
    frigate,
  );
  if (target) {
    memory.mode = "assault";
    memory.assaultBaseId = target.id;
    memory.targetId = target.id;
    memory.modeChosenAt = now;
    return;
  }
  const continuePatrol = memory.mode === "patrol"
    && memory.navGoal
    && distance(frigate, memory.navGoal) > GAME_CONFIG.bots.waypointReachDistance;
  memory.mode = "patrol";
  memory.targetId = null;
  memory.assaultBaseId = null;
  if (!continuePatrol) {
    memory.navGoalKey = null;
    const patrol = choosePatrolPoint(memory, state, frigate, random);
    setGoal(memory, `patrol:${memory.patrolId}`, patrol);
  }
  memory.modeChosenAt = now;
}

function waterAt(world: World, point: Point): boolean {
  return !isLandAt(world, point.x, point.y);
}

function choosePerpendicularGoal(
  world: World,
  frigate: Frigate,
  target: Frigate,
): Point {
  const bearing = Math.atan2(target.y - frigate.y, target.x - frigate.x);
  const distanceToKeep = GAME_CONFIG.bots.engageMaxDistance - 100;
  const candidates = [bearing + Math.PI / 2, bearing - Math.PI / 2].map((angle) => ({
    x: target.x + Math.cos(angle) * distanceToKeep,
    y: target.y + Math.sin(angle) * distanceToKeep,
  }));
  const water = candidates.filter((candidate) => waterAt(world, candidate));
  return water[0] ?? candidates[0]!;
}

function chooseTurretStandoff(world: World, frigate: Frigate, base: Base): Point {
  const center = { x: base.cityX, y: base.cityY };
  const range = (GAME_CONFIG.bots.turretMinDistance + GAME_CONFIG.bots.turretMaxDistance) / 2;
  const towardBase = Math.atan2(center.y - frigate.y, center.x - frigate.x);
  for (let offset = 0; offset < 8; offset += 1) {
    const angle = towardBase + Math.PI + offset * Math.PI / 4;
    const candidate = { x: center.x + Math.cos(angle) * range, y: center.y + Math.sin(angle) * range };
    if (waterAt(world, candidate)) return candidate;
  }
  return { x: center.x + Math.cos(towardBase + Math.PI) * range, y: center.y + Math.sin(towardBase + Math.PI) * range };
}

function setMissionGoal(
  memory: BotMemory,
  state: GameState,
  frigate: Frigate,
  now: number,
  random: () => number,
): { throttleOverride: number | null; movementKeys: number; noPath: boolean } {
  const lockedBase = frigate.repairLockBaseId
    ? state.bases.find((candidate) => candidate.id === frigate.repairLockBaseId)
    : undefined;
  const installingAtLockedBase = memory.mode === "assault"
    && memory.assaultBaseId === lockedBase?.id
    && lockedBase?.ownerTeam === frigate.team
    && lockedBase.turret !== "active";
  if (lockedBase && (memory.mode === "resupply" || installingAtLockedBase)) {
    const goal = {
      x: lockedBase.harbourX + Math.cos(lockedBase.facing) * 120,
      y: lockedBase.harbourY + Math.sin(lockedBase.facing) * 120,
    };
    setGoal(memory, `repair-lock:${lockedBase.id}`, goal);
    const navigation = navigate(memory, state.world, frigate, now);
    return { throttleOverride: null, movementKeys: navigation.keys, noPath: !navigation.hasPath };
  }
  if (memory.mode === "resupply") {
    const base = state.bases.find((candidate) => candidate.id === memory.targetId && candidate.active);
    if (!base || base.ownerTeam !== frigate.team) return { throttleOverride: null, movementKeys: 0, noPath: false };
    if (hullInsideHarbour(frigate, base)) {
      setGoal(memory, `resupply:${base.id}`, null);
      return { throttleOverride: 0, movementKeys: 0, noPath: false };
    }
    setGoal(memory, `resupply:${base.id}`, { x: base.harbourX, y: base.harbourY });
  } else if (memory.mode === "engage") {
    const target = state.frigates[memory.targetId ?? ""];
    if (!target || target.status !== "alive") return { throttleOverride: null, movementKeys: 0, noPath: false };
    const range = distance(frigate, target);
    if (range < GAME_CONFIG.bots.engageMinDistance) {
      setGoal(memory, `engage-close:${target.playerId}`, choosePerpendicularGoal(state.world, frigate, target));
      const navigation = navigate(memory, state.world, frigate, now);
      return { throttleOverride: 2, movementKeys: navigation.keys, noPath: !navigation.hasPath };
    }
    if (range > GAME_CONFIG.bots.engageMaxDistance) {
      const bearing = Math.atan2(target.y - frigate.y, target.x - frigate.x);
      const rangeGoal = (GAME_CONFIG.bots.engageMinDistance + GAME_CONFIG.bots.engageMaxDistance) / 2;
      setGoal(memory, `engage-close:${target.playerId}`, {
        x: target.x - Math.cos(bearing) * rangeGoal,
        y: target.y - Math.sin(bearing) * rangeGoal,
      });
    } else {
      setGoal(memory, `engage-hold:${target.playerId}`, null);
      return { throttleOverride: 0, movementKeys: 0, noPath: false };
    }
  } else if (memory.mode === "assault") {
    const base = state.bases.find((candidate) => candidate.id === memory.assaultBaseId && candidate.active);
    if (!base) return { throttleOverride: null, movementKeys: 0, noPath: false };
    if (base.ownerTeam === frigate.team && base.turret === "active") {
      memory.assaultBaseId = null;
      return { throttleOverride: null, movementKeys: 0, noPath: false };
    }
    if (base.ownerTeam !== null && base.ownerTeam !== frigate.team && base.turret === "active") {
      const range = Math.hypot(frigate.x - base.cityX, frigate.y - base.cityY);
      if (range >= GAME_CONFIG.bots.turretMinDistance && range <= GAME_CONFIG.bots.turretMaxDistance) {
        setGoal(memory, `turret:${base.id}`, null);
        return { throttleOverride: 0, movementKeys: 0, noPath: false };
      }
      setGoal(memory, `turret:${base.id}`, chooseTurretStandoff(state.world, frigate, base));
    } else if (base.ownerTeam === frigate.team && base.turret !== "active") {
      if (hullInsideHarbour(frigate, base)) {
        setGoal(memory, `install:${base.id}`, null);
        return { throttleOverride: 0, movementKeys: 0, noPath: false };
      }
      setGoal(memory, `install:${base.id}`, { x: base.harbourX, y: base.harbourY });
    } else {
      if (hullInsideHarbour(frigate, base)) {
        setGoal(memory, `capture:${base.id}`, null);
        return { throttleOverride: 0, movementKeys: 0, noPath: false };
      }
      setGoal(memory, `capture:${base.id}`, { x: base.harbourX, y: base.harbourY });
    }
  }
  if (memory.mode === "patrol" && (!memory.navGoal || distance(frigate, memory.navGoal) <= GAME_CONFIG.bots.waypointReachDistance)) {
    const patrol = choosePatrolPoint(memory, state, frigate, random);
    setGoal(memory, `patrol:${memory.patrolId}`, patrol);
  }
  const navigation = navigate(memory, state.world, frigate, now);
  if (!navigation.hasPath && memory.mode === "patrol") {
    const patrol = choosePatrolPoint(memory, state, frigate, random);
    setGoal(memory, `patrol:${memory.patrolId}`, patrol);
    return { throttleOverride: 0, movementKeys: 0, noPath: true };
  }
  return { throttleOverride: null, movementKeys: navigation.keys, noPath: !navigation.hasPath };
}

function visibleCannonTargets(
  memory: BotMemory,
  state: GameState,
  frigate: Frigate,
  playerId: string,
  now: number,
): BotTarget[] {
  const maximumRange = GAME_CONFIG.cannon.maxRange;
  const enemies = visibleEnemies(state, frigate, playerId, now)
    .filter((enemy) => distance(frigate, enemy) >= GAME_CONFIG.cannon.minRange && distance(frigate, enemy) <= maximumRange)
    .map((enemy): BotTarget => ({
      id: `frigate:${enemy.playerId}`,
      x: enemy.x,
      y: enemy.y,
      speed: enemy.speed,
      heading: enemy.heading,
      kind: "frigate",
    }));
  const base = state.bases.find((candidate) =>
    candidate.id === memory.assaultBaseId
    && candidate.active
    && candidate.ownerTeam !== null
    && candidate.ownerTeam !== frigate.team
    && candidate.turret === "active",
  );
  if (base && distance(frigate, { x: base.cityX, y: base.cityY }) <= maximumRange) {
    enemies.push({
      id: `turret:${base.id}`,
      x: base.cityX,
      y: base.cityY,
      speed: 0,
      heading: 0,
      kind: "turret",
    });
  }
  return enemies.sort((first, second) => distance(frigate, first) - distance(frigate, second));
}

function visibleTorpedoTargets(
  state: GameState,
  frigate: Frigate,
  playerId: string,
  now: number,
): BotTarget[] {
  return visibleEnemies(state, frigate, playerId, now)
    .filter((enemy) => distance(frigate, enemy) <= GAME_CONFIG.bots.torpedoRange)
    .map((enemy): BotTarget => ({
      id: `frigate:${enemy.playerId}`,
      x: enemy.x,
      y: enemy.y,
      speed: enemy.speed,
      heading: enemy.heading,
      kind: "frigate",
    }));
}

function interceptPoint(
  frigate: Frigate,
  target: BotTarget,
  speed: number,
  lead: boolean,
): Point {
  let point = { x: target.x, y: target.y };
  if (!lead || target.kind !== "frigate") return point;
  const velocityX = Math.cos(target.heading) * target.speed;
  const velocityY = Math.sin(target.heading) * target.speed;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const flightTime = distance(frigate, point) / speed;
    point = { x: target.x + velocityX * flightTime, y: target.y + velocityY * flightTime };
  }
  return point;
}

function updateAimSample(
  aim: AimState,
  target: BotTarget,
  random: () => number,
  profile: ReturnType<typeof skillProfile>,
  now: number,
): void {
  if (aim.targetId !== target.id) {
    aim.targetId = target.id;
    aim.targetSince = now;
    aim.sampleAt = now + profile.reactionInterval;
    aim.bearingError = gaussian(random) * profile.bearingSigmaDegrees * radians;
    aim.rangeError = gaussian(random) * profile.rangeSigmaPercent;
  } else if (now >= aim.sampleAt) {
    aim.sampleAt = now + profile.reactionInterval;
    aim.bearingError = gaussian(random) * profile.bearingSigmaDegrees * radians;
    aim.rangeError = gaussian(random) * profile.rangeSigmaPercent;
  }
}

function adjustBearing(
  frigate: Frigate,
  desiredAbsolute: number,
  currentRelative: number,
  rightKey: number,
  leftKey: number,
): { keys: number; error: number } {
  const desiredRelative = angleDifference(desiredAbsolute - frigate.heading, 0);
  const error = angleDifference(desiredRelative, currentRelative);
  if (Math.abs(error) <= GAME_CONFIG.bots.cannonBearingTolerance) return { keys: 0, error };
  return { keys: error > 0 ? rightKey : leftKey, error };
}

function torpedoPathIsWater(world: World, start: Point, end: Point): boolean {
  const steps = Math.max(1, Math.ceil(distance(start, end) / GAME_CONFIG.bots.torpedoWaterSampleDistance));
  for (let step = 0; step <= steps; step += 1) {
    const fraction = step / steps;
    if (isLandAt(world, start.x + (end.x - start.x) * fraction, start.y + (end.y - start.y) * fraction)) return false;
  }
  return true;
}

function weaponInputs(
  memory: BotMemory,
  state: GameState,
  frigate: Frigate,
  playerId: string,
  skill: number,
  now: number,
  random: () => number,
): Pick<FrigateInput, "keys" | "fireCannon" | "fireTorpedo"> {
  const profile = skillProfile(skill);
  let keys = 0;
  let fireCannon = false;
  let fireTorpedo = false;
  const cannonTarget = visibleCannonTargets(memory, state, frigate, playerId, now)[0];
  if (!cannonTarget) {
    memory.cannonAim.targetId = null;
  } else {
    updateAimSample(memory.cannonAim, cannonTarget, random, profile, now);
    const shellSpeed = GAME_CONFIG.cannon.shellSpeed * state.settings.shellSpeedPct / 100;
    const intercept = interceptPoint(frigate, cannonTarget, shellSpeed, profile.lead);
    const aimDistance = distance(frigate, intercept);
    const actualDistance = distance(frigate, cannonTarget);
    const desiredBearing = Math.atan2(intercept.y - frigate.y, intercept.x - frigate.x) + memory.cannonAim.bearingError;
    const bearing = adjustBearing(
      frigate,
      desiredBearing,
      frigate.cannonBearing,
      INPUT_KEYS.cannonRight,
      INPUT_KEYS.cannonLeft,
    );
    keys |= bearing.keys;
    const desiredRange = Math.max(
      GAME_CONFIG.cannon.minRange,
      Math.min(GAME_CONFIG.cannon.maxRange, aimDistance * (1 + memory.cannonAim.rangeError / 100)),
    );
    if (frigate.cannonRange < desiredRange - 1) keys |= INPUT_KEYS.rangeUp;
    if (frigate.cannonRange > desiredRange + 1) keys |= INPUT_KEYS.rangeDown;
    const rangeError = Math.abs(memory.cannonAim.rangeError * aimDistance / 100);
    const ready = now >= frigate.cannonReadyAt && frigate.shells > 0;
    fireCannon = ready
      && !frigate.lastFireCannon
      && now - memory.cannonAim.targetSince >= profile.reactionInterval
      && actualDistance >= GAME_CONFIG.cannon.minRange
      && actualDistance <= GAME_CONFIG.cannon.maxRange
      && Math.abs(memory.cannonAim.bearingError) < GAME_CONFIG.bots.cannonBearingTolerance
      && Math.abs(bearing.error) < GAME_CONFIG.bots.cannonBearingTolerance
      && rangeError < GAME_CONFIG.bots.cannonRangeTolerance
      && Math.abs(frigate.cannonRange - desiredRange) < GAME_CONFIG.bots.cannonRangeTolerance;
    if (fireCannon) {
      memory.cannonAim.sampleAt = now + profile.reactionInterval;
      memory.cannonAim.bearingError = gaussian(random) * profile.bearingSigmaDegrees * radians;
      memory.cannonAim.rangeError = gaussian(random) * profile.rangeSigmaPercent;
    }
  }

  const torpedoTarget = profile.torpedoes
    ? visibleTorpedoTargets(state, frigate, playerId, now)[0]
    : undefined;
  if (!torpedoTarget) {
    memory.torpedoAim.targetId = null;
  } else {
    updateAimSample(memory.torpedoAim, torpedoTarget, random, profile, now);
    const torpedoSpeed = GAME_CONFIG.torpedo.speed * state.settings.torpedoSpeedPct / 100;
    const intercept = interceptPoint(frigate, torpedoTarget, torpedoSpeed, profile.lead);
    const desiredBearing = Math.atan2(intercept.y - frigate.y, intercept.x - frigate.x) + memory.torpedoAim.bearingError;
    const bearing = adjustBearing(
      frigate,
      desiredBearing,
      frigate.torpedoBearing,
      INPUT_KEYS.torpedoRight,
      INPUT_KEYS.torpedoLeft,
    );
    keys |= bearing.keys;
    const ready = now >= frigate.torpedoReadyAt && frigate.torpedoes > 0;
    fireTorpedo = ready
      && !frigate.lastFireTorpedo
      && now - memory.torpedoAim.targetSince >= profile.reactionInterval
      && distance(frigate, torpedoTarget) <= GAME_CONFIG.bots.torpedoRange
      && Math.abs(memory.torpedoAim.bearingError) < GAME_CONFIG.bots.torpedoBearingTolerance
      && Math.abs(bearing.error) < GAME_CONFIG.bots.torpedoBearingTolerance
      && torpedoPathIsWater(state.world, frigate, intercept);
    if (fireTorpedo) {
      memory.torpedoAim.sampleAt = now + profile.reactionInterval;
      memory.torpedoAim.bearingError = gaussian(random) * profile.bearingSigmaDegrees * radians;
      memory.torpedoAim.rangeError = gaussian(random) * profile.rangeSigmaPercent;
    }
  }
  return { keys, fireCannon, fireTorpedo };
}

function updateStuckState(
  memory: BotMemory,
  frigate: Frigate,
  now: number,
  throttle: number,
  fallbackTurn: number,
): { turn: number; reversing: boolean } {
  if (now < memory.reverseUntil) return { turn: -memory.lastTurn || -fallbackTurn || 1, reversing: true };
  if (memory.reverseUntil !== 0 && now >= memory.reverseUntil) {
    memory.reverseUntil = 0;
    resetNavigation(memory);
  }
  if (throttle <= 0) {
    memory.sampleAt = now;
    memory.sampleX = frigate.x;
    memory.sampleY = frigate.y;
    return { turn: fallbackTurn, reversing: false };
  }
  if (now - memory.sampleAt >= GAME_CONFIG.bots.stuckDuration) {
    const moved = Math.hypot(frigate.x - memory.sampleX, frigate.y - memory.sampleY);
    if (moved < GAME_CONFIG.bots.stuckDistance) {
      memory.reverseUntil = now + GAME_CONFIG.bots.reverseDuration;
      resetNavigation(memory);
      memory.sampleAt = now;
      memory.sampleX = frigate.x;
      memory.sampleY = frigate.y;
      return { turn: -memory.lastTurn || -fallbackTurn || 1, reversing: true };
    }
    memory.sampleAt = now;
    memory.sampleX = frigate.x;
    memory.sampleY = frigate.y;
  }
  return { turn: fallbackTurn, reversing: false };
}

function newMemory(now: number): BotMemory {
  return {
    seq: 0,
    world: null,
    mode: "patrol",
    modeChosenAt: Number.NEGATIVE_INFINITY,
    targetId: null,
    assaultBaseId: null,
    patrolId: 0,
    navGoal: null,
    navGoalKey: null,
    navPath: [],
    navPathIndex: 0,
    navPlannedAt: Number.NEGATIVE_INFINITY,
    navPlannedGoal: null,
    reverseUntil: 0,
    sampleAt: now,
    sampleX: 0,
    sampleY: 0,
    lastTurn: 0,
    cannonAim: { targetId: null, targetSince: now, sampleAt: now, bearingError: 0, rangeError: 0 },
    torpedoAim: { targetId: null, targetSince: now, sampleAt: now, bearingError: 0, rangeError: 0 },
  };
}

export function createBotBrain(
  playerId: string,
  skill: number,
  random: () => number,
): { think(state: GameState, now: number, dt: number): FrigateInput } {
  let memory = newMemory(0);
  return {
    think(state, now, dt) {
      if (memory.world !== state.world) {
        memory = newMemory(now);
        memory.world = state.world;
      }
      const frigate = state.frigates[playerId];
      const output = emptyInput(memory.seq++);
      if (!frigate || frigate.status !== "alive" || dt <= 0) return output;
      if (memory.sampleX === 0 && memory.sampleY === 0 && memory.sampleAt === now) {
        memory.sampleX = frigate.x;
        memory.sampleY = frigate.y;
      }

      const profile = skillProfile(skill);
      if (
        now >= memory.modeChosenAt + profile.reactionInterval
        || (memory.mode === "engage" && !visibleEnemies(state, frigate, playerId, now).some((enemy) => enemy.playerId === memory.targetId))
        || (memory.mode === "assault" && !state.bases.some((base) => base.id === memory.assaultBaseId && base.active))
      ) chooseMode(memory, state, frigate, playerId, now, random);

      const mission = setMissionGoal(memory, state, frigate, now, random);
      let throttle = mission.throttleOverride ?? 0;
      let movementKeys = mission.movementKeys;
      if (mission.throttleOverride === null) {
        const movement = navigate(memory, state.world, frigate, now);
        movementKeys = movement.keys;
        throttle = movement.throttle;
      }
      const steering = updateStuckState(memory, frigate, now, throttle, memory.lastTurn);
      if (steering.reversing) {
        throttle = -1;
        movementKeys = steering.turn > 0 ? INPUT_KEYS.turnRight : INPUT_KEYS.turnLeft;
      }
      const weapons = weaponInputs(memory, state, frigate, playerId, skill, now, random);
      output.keys = movementKeys | weapons.keys;
      output.throttle = throttle;
      output.fireCannon = weapons.fireCannon;
      output.fireTorpedo = weapons.fireTorpedo;
      return output;
    },
  };
}
