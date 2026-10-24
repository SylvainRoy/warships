import { GAME_CONFIG } from "./config.js";
import { mulberry32 } from "./rng.js";
import { generateWorld, type MapDimensions, type World } from "./world.js";

export type BaseKind = "home" | "neutral";

export interface BaseSite {
  id: string;
  kind: BaseKind;
  homeTeam: number | null;
  cityX: number;
  cityY: number;
  harbourX: number;
  harbourY: number;
  facing: number;
}

export type TurretState = "none" | "active" | "destroyed";

export interface BaseStatus {
  id: string;
  active: boolean;
  ownerTeam: number | null;
  captureBy: number | null;
  captureProgress: number;
  turret: TurretState;
  turretHp: number;
  turretReadyAt: number;
  repairBy: number | null;
  repairProgress: number;
  lostFrom: number | null;
  returnAt: number | null;
}

export type BasePublic = BaseSite & BaseStatus;
export type Base = BasePublic & { heldFor: number };
export type BaseSnapshot = Pick<
  BaseStatus,
  "id" | "active" | "ownerTeam" | "captureBy" | "captureProgress" | "turret" | "turretHp" | "repairBy" | "repairProgress"
>;

export function restoreHome(base: Base, now: number): void {
  base.active = true;
  base.ownerTeam = base.lostFrom ?? base.ownerTeam;
  base.heldFor = 0;
  base.lostFrom = null;
  base.returnAt = null;
  base.turret = "active";
  base.turretHp = GAME_CONFIG.bases.turretHp;
  base.turretReadyAt = now;
  base.captureBy = null;
  base.captureProgress = 0;
  base.repairBy = null;
  base.repairProgress = 0;
}

type Candidate = Omit<BaseSite, "id" | "kind" | "homeTeam">;
type Rect = { left: number; top: number; right: number; bottom: number };

const { tileSize } = GAME_CONFIG.world;
const { citySize, harbourSize, homeSites, harbourApproach } = GAME_CONFIG.bases;
const directions = [
  { x: 1, y: 0, facing: 0 },
  { x: 0, y: 1, facing: Math.PI / 2 },
  { x: -1, y: 0, facing: Math.PI },
  { x: 0, y: -1, facing: Math.PI * 1.5 },
] as const;

function landAreaFor(world: World): Int32Array {
  const { columns, rows } = world;
  const stride = columns + 1;
  const area = new Int32Array(stride * (rows + 1));
  for (let y = 0; y < rows; y += 1) {
    let rowTotal = 0;
    for (let x = 0; x < columns; x += 1) {
      rowTotal += world.grid[y * columns + x] ?? 0;
      area[(y + 1) * stride + x + 1] = area[y * stride + x + 1]! + rowTotal;
    }
  }
  return area;
}

function landCount(area: Int32Array, rect: Rect, world: World): number | null {
  if (rect.left < 0 || rect.top < 0 || rect.right > world.width || rect.bottom > world.height) return null;
  const left = Math.floor(rect.left / tileSize);
  const top = Math.floor(rect.top / tileSize);
  const right = Math.ceil(rect.right / tileSize);
  const bottom = Math.ceil(rect.bottom / tileSize);
  const stride = world.columns + 1;
  return area[bottom * stride + right]!
    - area[top * stride + right]!
    - area[bottom * stride + left]!
    + area[top * stride + left]!;
}

function cityRect(candidateX: number, candidateY: number): Rect {
  return {
    left: candidateX - citySize / 2,
    top: candidateY - citySize / 2,
    right: candidateX + citySize / 2,
    bottom: candidateY + citySize / 2,
  };
}

function approachRects(harbour: Rect, directionIndex: number): Rect[] {
  const distance = harbourApproach;
  switch (directionIndex) {
    case 0:
      return [
        { left: harbour.right, top: harbour.top, right: harbour.right + distance, bottom: harbour.bottom },
        { left: harbour.left, top: harbour.top - distance, right: harbour.right, bottom: harbour.top },
        { left: harbour.left, top: harbour.bottom, right: harbour.right, bottom: harbour.bottom + distance },
      ];
    case 1:
      return [
        { left: harbour.left, top: harbour.bottom, right: harbour.right, bottom: harbour.bottom + distance },
        { left: harbour.left - distance, top: harbour.top, right: harbour.left, bottom: harbour.bottom },
        { left: harbour.right, top: harbour.top, right: harbour.right + distance, bottom: harbour.bottom },
      ];
    case 2:
      return [
        { left: harbour.left - distance, top: harbour.top, right: harbour.left, bottom: harbour.bottom },
        { left: harbour.left, top: harbour.top - distance, right: harbour.right, bottom: harbour.top },
        { left: harbour.left, top: harbour.bottom, right: harbour.right, bottom: harbour.bottom + distance },
      ];
    default:
      return [
        { left: harbour.left, top: harbour.top - distance, right: harbour.right, bottom: harbour.top },
        { left: harbour.left - distance, top: harbour.top, right: harbour.left, bottom: harbour.bottom },
        { left: harbour.right, top: harbour.top, right: harbour.right + distance, bottom: harbour.bottom },
      ];
  }
}

function candidateAt(area: Int32Array, left: number, top: number, directionIndex: number, world: World): Candidate | null {
  const harbour: Rect = { left, top, right: left + harbourSize, bottom: top + harbourSize };
  if (landCount(area, harbour, world) !== 0) return null;
  for (const approach of approachRects(harbour, directionIndex)) {
    if (landCount(area, approach, world) !== 0) return null;
  }

  const harbourX = left + harbourSize / 2;
  const harbourY = top + harbourSize / 2;
  const direction = directions[directionIndex]!;
  const cityX = harbourX - direction.x * (harbourSize / 2 + citySize / 2);
  const cityY = harbourY - direction.y * (harbourSize / 2 + citySize / 2);
  const city = cityRect(cityX, cityY);
  const borderClearance = (GAME_CONFIG.world.generation.borderTiles + 1) * tileSize;
  if (
    city.left < borderClearance
    || city.top < borderClearance
    || city.right > world.width - borderClearance
    || city.bottom > world.height - borderClearance
  ) return null;
  const count = landCount(area, city, world);
  if (count === null) return null;
  const tileColumns = Math.ceil(city.right / tileSize) - Math.floor(city.left / tileSize);
  const tileRows = Math.ceil(city.bottom / tileSize) - Math.floor(city.top / tileSize);
  if (count !== tileColumns * tileRows) return null;

  return { cityX, cityY, harbourX, harbourY, facing: direction.facing };
}

function distanceBetween(first: Candidate, second: Candidate): number {
  return Math.hypot(first.harbourX - second.harbourX, first.harbourY - second.harbourY);
}

function spaced(candidate: Candidate, chosen: readonly Candidate[], minSpacing: number): boolean {
  return chosen.every((other) => distanceBetween(candidate, other) >= minSpacing);
}

function shuffledIndices(length: number, random: () => number): number[] {
  const indices = Array.from({ length }, (_, index) => index);
  for (let index = indices.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [indices[index], indices[other]] = [indices[other]!, indices[index]!];
  }
  return indices;
}

export function placeBases(world: World, neutralCount: number): BaseSite[] | null {
  if (!Number.isInteger(neutralCount) || neutralCount < 0) return null;
  const area = landAreaFor(world);
  const minSpacing = GAME_CONFIG.bases.minSpacingRatio * world.width;
  const candidates: Candidate[] = [];
  for (let row = 0; row <= world.rows - harbourSize / tileSize; row += 1) {
    for (let column = 0; column <= world.columns - harbourSize / tileSize; column += 1) {
      const left = column * tileSize;
      const top = row * tileSize;
      for (let directionIndex = 0; directionIndex < directions.length; directionIndex += 1) {
        const candidate = candidateAt(area, left, top, directionIndex, world);
        if (candidate) candidates.push(candidate);
      }
    }
  }
  if (candidates.length === 0) return null;

  const random = mulberry32(world.seed);
  const firstIndex = Math.floor(random() * candidates.length);
  const homes: Candidate[] = [candidates[firstIndex]!];
  const selectedIndices = new Set([firstIndex]);
  while (homes.length < homeSites) {
    let bestIndex = -1;
    let bestDistance = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < candidates.length; index += 1) {
      if (selectedIndices.has(index)) continue;
      const candidate = candidates[index]!;
      const minimumDistance = Math.min(...homes.map((home) => distanceBetween(candidate, home)));
      if (minimumDistance >= minSpacing && minimumDistance > bestDistance) {
        bestIndex = index;
        bestDistance = minimumDistance;
      }
    }
    if (bestIndex < 0) return null;
    selectedIndices.add(bestIndex);
    homes.push(candidates[bestIndex]!);
  }

  const chosen = [...homes];
  const remaining = shuffledIndices(candidates.length, random).filter((index) => !selectedIndices.has(index));
  const neutrals: Candidate[] = [];
  if (neutralCount > 0) {
    for (const index of remaining) {
      const candidate = candidates[index]!;
      if (!spaced(candidate, chosen, minSpacing)) continue;
      selectedIndices.add(index);
      chosen.push(candidate);
      neutrals.push(candidate);
      if (neutrals.length === neutralCount) break;
    }
  }
  if (neutrals.length !== neutralCount) return null;

  return [
    ...homes.map((candidate, index): BaseSite => ({
      ...candidate,
      id: `h${index}`,
      kind: "home",
      homeTeam: index,
    })),
    ...neutrals.map((candidate, index): BaseSite => ({
      ...candidate,
      id: `n${index}`,
      kind: "neutral",
      homeTeam: null,
    })),
  ];
}

export function generateWorldWithBases(
  seed: number,
  landCoverage: number,
  neutralCount: number,
  dimensions: MapDimensions,
): { world: World; sites: BaseSite[]; neutralPlaced: number } {
  let lastError: unknown;
  const worlds: World[] = [];
  for (let offset = 0; offset < 16; offset += 1) {
    try {
      const world = generateWorld(seed + offset, landCoverage, dimensions);
      worlds.push(world);
      const sites = placeBases(world, neutralCount);
      if (sites) return { world, sites, neutralPlaced: neutralCount };
      lastError = new Error(`Could not place ${homeSites + neutralCount} bases in world seed ${world.seed}`);
    } catch (error) {
      lastError = error;
    }
  }
  for (let count = neutralCount - 1; count >= 0; count -= 1) {
    for (const world of worlds) {
      const sites = placeBases(world, count);
      if (sites) return { world, sites, neutralPlaced: count };
    }
  }
  throw lastError ?? new Error("Could not generate a world with bases");
}

export function hullInsideHarbour(
  frigate: Pick<import("./sim.js").Frigate, "x" | "y" | "heading">,
  base: BaseSite,
): boolean {
  const halfLength = GAME_CONFIG.frigate.length / 2;
  const halfBeam = GAME_CONFIG.frigate.beam / 2;
  const cos = Math.cos(frigate.heading);
  const sin = Math.sin(frigate.heading);
  const halfHarbour = harbourSize / 2;
  for (const localX of [-halfLength, halfLength]) {
    for (const localY of [-halfBeam, halfBeam]) {
      const x = frigate.x + localX * cos - localY * sin;
      const y = frigate.y + localX * sin + localY * cos;
      if (!pointInsideHarbour(x, y, base)) return false;
    }
  }
  return true;
}

export function pointInsideHarbour(x: number, y: number, base: BaseSite): boolean {
  const halfHarbour = harbourSize / 2;
  return x >= base.harbourX - halfHarbour
    && x <= base.harbourX + halfHarbour
    && y >= base.harbourY - halfHarbour
    && y <= base.harbourY + halfHarbour;
}
