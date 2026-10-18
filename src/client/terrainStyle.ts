import { GAME_CONFIG } from "../shared/config.js";
import type { World } from "../shared/world.js";

const { tileSize } = GAME_CONFIG.world;
const infiniteDistance = Number.POSITIVE_INFINITY;
const sandColor: readonly [number, number, number] = [216, 198, 144];
const grassColor: readonly [number, number, number] = [111, 154, 79];
const forestColor: readonly [number, number, number] = [63, 107, 56];
const rockColor: readonly [number, number, number] = [138, 133, 119];

export interface TerrainFields {
  waterDistance: Float64Array;
  landDistance: Float64Array;
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
      waterDistance: euclideanDistanceField(world.grid, world.columns, world.rows, true, true, tileSize),
      landDistance: euclideanDistanceField(world.grid, world.columns, world.rows, false, false, tileSize),
    };
  }
  return cachedFields;
}

export function euclideanDistanceField(
  grid: Uint8Array,
  width: number,
  height: number,
  targetIsLand: boolean,
  outsideIsLand = false,
  cellSize = GAME_CONFIG.world.tileSize,
): Float64Array {
  const margin = targetIsLand && outsideIsLand ? 1 : 0;
  const paddedWidth = width + margin * 2;
  const paddedHeight = height + margin * 2;
  const squared = new Float64Array(paddedWidth * paddedHeight);
  squared.fill(infiniteDistance);

  if (margin === 1) {
    for (let column = 0; column < paddedWidth; column += 1) {
      squared[column] = 0;
      squared[(paddedHeight - 1) * paddedWidth + column] = 0;
    }
    for (let row = 1; row < paddedHeight - 1; row += 1) {
      squared[row * paddedWidth] = 0;
      squared[row * paddedWidth + paddedWidth - 1] = 0;
    }
  }

  const targetValue = targetIsLand ? 1 : 0;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if (grid[row * width + column] === targetValue) {
        squared[(row + margin) * paddedWidth + column + margin] = 0;
      }
    }
  }

  const lineLength = Math.max(paddedWidth, paddedHeight);
  const input = new Float64Array(lineLength);
  const output = new Float64Array(lineLength);
  const sites = new Int32Array(lineLength);
  const boundaries = new Float64Array(lineLength + 1);
  const horizontal = new Float64Array(squared.length);
  for (let row = 0; row < paddedHeight; row += 1) {
    const offset = row * paddedWidth;
    input.set(squared.subarray(offset, offset + paddedWidth));
    transformLine(input, paddedWidth, output, sites, boundaries);
    horizontal.set(output.subarray(0, paddedWidth), offset);
  }

  const squaredDistances = new Float64Array(squared.length);
  for (let column = 0; column < paddedWidth; column += 1) {
    for (let row = 0; row < paddedHeight; row += 1) {
      input[row] = horizontal[row * paddedWidth + column] ?? infiniteDistance;
    }
    transformLine(input, paddedHeight, output, sites, boundaries);
    for (let row = 0; row < paddedHeight; row += 1) {
      squaredDistances[row * paddedWidth + column] = output[row] ?? infiniteDistance;
    }
  }

  const distances = new Float64Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const squaredDistance = squaredDistances[(row + margin) * paddedWidth + column + margin] ?? infiniteDistance;
      distances[row * width + column] = Math.sqrt(squaredDistance) * cellSize;
    }
  }
  return distances;
}

export function waterColorAtDistance(distance: number): readonly [number, number, number] {
  const shallows: readonly [number, number, number] = [63, 183, 176];
  const mid: readonly [number, number, number] = [26, 95, 122];
  const deep: readonly [number, number, number] = [15, 61, 85];
  if (distance <= 60) return blendRgb(shallows, mid, distance / 60);
  if (distance < 400) return blendRgb(mid, deep, (distance - 60) / 340);
  return deep;
}

export function noise(column: number, row: number): number {
  return valueNoise(column, row, 8, 0);
}

export function noise2(column: number, row: number): number {
  return valueNoise(column, row, 5, 0x9e3779b9);
}

export function landColorAt(
  distance: number,
  forestNoise: number,
  rockNoise: number,
): readonly [number, number, number] {
  const sandGrassBlend = smoothstep(15, 25, distance);
  let red = sandColor[0] + (grassColor[0] - sandColor[0]) * sandGrassBlend;
  let green = sandColor[1] + (grassColor[1] - sandColor[1]) * sandGrassBlend;
  let blue = sandColor[2] + (grassColor[2] - sandColor[2]) * sandGrassBlend;
  const forestBlend = distance >= 40 ? smoothstep(0.51, 0.59, forestNoise) : 0;
  red += (forestColor[0] - red) * forestBlend;
  green += (forestColor[1] - green) * forestBlend;
  blue += (forestColor[2] - blue) * forestBlend;
  const rockBlend = smoothstep(140, 180, distance) * smoothstep(0.51, 0.59, rockNoise);
  red += (rockColor[0] - red) * rockBlend;
  green += (rockColor[1] - green) * rockBlend;
  blue += (rockColor[2] - blue) * rockBlend;
  return [red, green, blue];
}

function valueNoise(column: number, row: number, cellSize: number, hashOffset: number): number {
  const x = column / cellSize;
  const scaledY = row / cellSize;
  const left = Math.floor(x);
  const top = Math.floor(scaledY);
  const tx = x - left;
  const ty = scaledY - top;
  const upper = hashNoise(left, top, hashOffset) * (1 - tx) + hashNoise(left + 1, top, hashOffset) * tx;
  const lower = hashNoise(left, top + 1, hashOffset) * (1 - tx) + hashNoise(left + 1, top + 1, hashOffset) * tx;
  return upper * (1 - ty) + lower * ty;
}

function transformLine(
  input: Float64Array,
  length: number,
  output: Float64Array,
  sites: Int32Array,
  boundaries: Float64Array,
): void {
  let firstSite = -1;
  for (let index = 0; index < length; index += 1) {
    if (Number.isFinite(input[index])) {
      firstSite = index;
      break;
    }
  }
  if (firstSite < 0) {
    output.fill(infiniteDistance, 0, length);
    return;
  }

  let lastSite = 0;
  sites[0] = firstSite;
  boundaries[0] = Number.NEGATIVE_INFINITY;
  boundaries[1] = Number.POSITIVE_INFINITY;
  for (let index = firstSite + 1; index < length; index += 1) {
    if (!Number.isFinite(input[index])) continue;
    let site = sites[lastSite] ?? firstSite;
    let intersection = (
      (input[index] ?? infiniteDistance) + index * index
      - (input[site] ?? infiniteDistance) - site * site
    ) / (2 * (index - site));
    while (intersection <= (boundaries[lastSite] ?? Number.NEGATIVE_INFINITY)) {
      lastSite -= 1;
      site = sites[lastSite] ?? firstSite;
      intersection = (
        (input[index] ?? infiniteDistance) + index * index
        - (input[site] ?? infiniteDistance) - site * site
      ) / (2 * (index - site));
    }
    lastSite += 1;
    sites[lastSite] = index;
    boundaries[lastSite] = intersection;
    boundaries[lastSite + 1] = Number.POSITIVE_INFINITY;
  }

  let envelopeIndex = 0;
  for (let index = 0; index < length; index += 1) {
    while ((boundaries[envelopeIndex + 1] ?? Number.POSITIVE_INFINITY) < index) envelopeIndex += 1;
    const site = sites[envelopeIndex] ?? firstSite;
    output[index] = (index - site) ** 2 + (input[site] ?? infiniteDistance);
  }
}

function blendRgb(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  amount: number,
): readonly [number, number, number] {
  const t = Math.max(0, Math.min(1, amount));
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hashNoise(column: number, row: number, hashOffset: number): number {
  let value = Math.imul(column | 0, 0x1f123bb5) ^ Math.imul(row | 0, 0x5f356495) ^ hashOffset;
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value ^= value >>> 12;
  return (value >>> 0) / 0xffffffff;
}
