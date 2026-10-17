import { GAME_CONFIG } from "../shared/config.js";
import type { World } from "../shared/world.js";

const { columns, rows, tileSize } = GAME_CONFIG.world;
const noDistance = 0x3fffffff;

export type TerrainStyle = "flat" | "chart" | "natural" | "animated";

export interface TerrainFields {
  waterDistance: Int32Array;
  landDistance: Int32Array;
}

let cachedWorld: World | null = null;
let cachedFields: TerrainFields | null = null;

export function resetTerrainStyleCache(): void {
  cachedWorld = null;
  cachedFields = null;
}

export function terrainFields(world: World): TerrainFields {
  if (cachedWorld !== world || !cachedFields) {
    cachedWorld = world;
    cachedFields = {
      waterDistance: distanceToTarget(world, true, true),
      landDistance: distanceToTarget(world, false, false),
    };
  }
  return cachedFields;
}

export function noise(column: number, row: number): number {
  const x = column / 8;
  const y = row / 8;
  const left = Math.floor(x);
  const top = Math.floor(y);
  const tx = x - left;
  const ty = y - top;
  const upper = hashNoise(left, top) * (1 - tx) + hashNoise(left + 1, top) * tx;
  const lower = hashNoise(left, top + 1) * (1 - tx) + hashNoise(left + 1, top + 1) * tx;
  return upper * (1 - ty) + lower * ty;
}

function distanceToTarget(world: World, targetIsLand: boolean, outsideIsLand: boolean): Int32Array {
  const distances = new Int32Array(columns * rows);
  distances.fill(noDistance);
  const queue = new Int32Array(distances.length);
  let tail = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const isLand = world.grid[index] === 1;
      if (isLand === targetIsLand) {
        distances[index] = 0;
        queue[tail] = index;
        tail += 1;
      }
    }
  }
  if (targetIsLand && outsideIsLand) {
    for (let column = 0; column < columns; column += 1) {
      tail = seedOutsideLand(column, 0, distances, queue, tail);
      tail = seedOutsideLand(column, rows - 1, distances, queue, tail);
    }
    for (let row = 1; row < rows - 1; row += 1) {
      tail = seedOutsideLand(0, row, distances, queue, tail);
      tail = seedOutsideLand(columns - 1, row, distances, queue, tail);
    }
  }

  let head = 0;
  while (head < tail) {
    const index = queue[head] ?? 0;
    head += 1;
    const distance = (distances[index] ?? noDistance) + tileSize;
    const column = index % columns;
    const row = Math.floor(index / columns);
    if (column > 0) tail = visit(index - 1, distance, distances, queue, tail);
    if (column + 1 < columns) tail = visit(index + 1, distance, distances, queue, tail);
    if (row > 0) tail = visit(index - columns, distance, distances, queue, tail);
    if (row + 1 < rows) tail = visit(index + columns, distance, distances, queue, tail);
  }
  return distances;
}

function seedOutsideLand(column: number, row: number, distances: Int32Array, queue: Int32Array, tail: number): number {
  const index = row * columns + column;
  if ((distances[index] ?? noDistance) <= tileSize) return tail;
  distances[index] = tileSize;
  queue[tail] = index;
  return tail + 1;
}

function visit(index: number, distance: number, distances: Int32Array, queue: Int32Array, tail: number): number {
  if ((distances[index] ?? noDistance) <= distance) return tail;
  distances[index] = distance;
  queue[tail] = index;
  return tail + 1;
}

function hashNoise(column: number, row: number): number {
  let value = Math.imul(column | 0, 0x1f123bb5) ^ Math.imul(row | 0, 0x5f356495);
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value ^= value >>> 12;
  return (value >>> 0) / 0xffffffff;
}
