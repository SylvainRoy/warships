import { GAME_CONFIG } from "./config.js";
import { mulberry32 } from "./rng.js";

export interface MapDimensions {
  columns: number;
  rows: number;
  width: number;
  height: number;
}

export interface World extends MapDimensions {
  seed: number;
  grid: Uint8Array;
}

const tileSize = GAME_CONFIG.world.tileSize;
const generation = GAME_CONFIG.world.generation;

export function mapDimensions(mapSize: number): MapDimensions {
  const size = GAME_CONFIG.world.mapSizes[mapSize];
  if (!size) throw new RangeError(`Invalid map size: ${mapSize}`);
  return {
    columns: size.columns,
    rows: size.rows,
    width: size.columns * tileSize,
    height: size.rows * tileSize,
  };
}

export function createEmptyWorld(dimensions: MapDimensions, seed = 0): World {
  return { ...dimensions, seed, grid: new Uint8Array(dimensions.columns * dimensions.rows) };
}

function makeNoiseLayer(random: () => number, width: number, height: number): Float32Array {
  const values = new Float32Array(width * height);
  for (let i = 0; i < values.length; i += 1) values[i] = random();
  return values;
}

function sampleNoise(layer: Float32Array, width: number, height: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx0 = x - x0;
  const ty0 = y - y0;
  const tx = tx0 * tx0 * (3 - 2 * tx0);
  const ty = ty0 * ty0 * (3 - 2 * ty0);
  const at = (px: number, py: number) => layer[Math.min(height - 1, py) * width + Math.min(width - 1, px)] ?? 0;
  const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
  const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

function buildField(seed: number, dimensions: MapDimensions): Float32Array {
  const { columns, rows, width, height } = dimensions;
  const random = mulberry32(seed);
  const scales = [160, 80, 40, 20];
  const weights = [0.52, 0.27, 0.14, 0.07];
  const layers = scales.map((scale) => {
    const layerWidth = Math.ceil(width / scale) + 1;
    const layerHeight = Math.ceil(height / scale) + 1;
    return { scale, width: layerWidth, height: layerHeight, values: makeNoiseLayer(random, layerWidth, layerHeight) };
  });
  const field = new Float32Array(columns * rows);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      let value = 0;
      for (let i = 0; i < layers.length; i += 1) {
        const layer = layers[i];
        if (layer) value += sampleNoise(layer.values, layer.width, layer.height, (x * tileSize) / layer.scale, (y * tileSize) / layer.scale) * (weights[i] ?? 0);
      }
      field[y * columns + x] = value;
    }
  }
  const islands = mulberry32(seed ^ 0x51f15e);
  const areaFactor = (columns * rows) / (800 * 450);
  for (let i = 0; i < Math.max(1, Math.round(18 * areaFactor)); i += 1) {
    const cx = 30 + islands() * (columns - 60);
    const cy = 30 + islands() * (rows - 60);
    const rx = 12 + islands() * 27;
    const ry = 10 + islands() * 23;
    paintIsland(field, cx, cy, rx, ry, 0.13 + islands() * 0.08, dimensions);
  }
  for (let i = 0; i < Math.max(1, Math.round(100 * areaFactor)); i += 1) {
    const cx = 12 + islands() * (columns - 24);
    const cy = 12 + islands() * (rows - 24);
    const radius = 2 + islands() * 5;
    paintIsland(field, cx, cy, radius, radius * (0.65 + islands() * 0.7), 0.1 + islands() * 0.08, dimensions);
  }
  return field;
}

function paintIsland(
  field: Float32Array,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  lift: number,
  dimensions: MapDimensions,
): void {
  const { columns, rows } = dimensions;
  const minX = Math.max(2, Math.floor(cx - rx));
  const maxX = Math.min(columns - 3, Math.ceil(cx + rx));
  const minY = Math.max(2, Math.floor(cy - ry));
  const maxY = Math.min(rows - 3, Math.ceil(cy + ry));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (distance < 1) field[y * columns + x] = (field[y * columns + x] ?? 0) + lift * (1 - distance * 0.35);
    }
  }
}

function summedArea(values: Uint8Array, width: number, height: number): Int32Array {
  const stride = width + 1;
  const result = new Int32Array(stride * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowTotal = 0;
    for (let x = 0; x < width; x += 1) {
      rowTotal += values[y * width + x] ?? 0;
      result[(y + 1) * stride + x + 1] = result[y * stride + x + 1]! + rowTotal;
    }
  }
  return result;
}

function rectangleSum(area: Int32Array, stride: number, left: number, top: number, right: number, bottom: number): number {
  return area[bottom * stride + right]!
    - area[top * stride + right]!
    - area[bottom * stride + left]!
    + area[top * stride + left]!;
}

function enforceChannels(grid: Uint8Array, dimensions: MapDimensions): Uint8Array {
  const { columns, rows } = dimensions;
  const cellCount = columns * rows;
  const channelSize = generation.minChannelTiles;
  const stride = columns + 1;
  const landArea = summedArea(grid, columns, rows);
  const eroded = new Uint8Array(cellCount);
  for (let top = 0; top <= rows - channelSize; top += 1) {
    for (let left = 0; left <= columns - channelSize; left += 1) {
      if (rectangleSum(landArea, stride, left, top, left + channelSize, top + channelSize) === 0) {
        eroded[top * columns + left] = 1;
      }
    }
  }
  const erodedArea = summedArea(eroded, columns, rows);
  const result = grid.slice();
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const index = y * columns + x;
      if (grid[index] !== 0) continue;
      const left = Math.max(0, x - channelSize + 1);
      const right = Math.min(x, columns - channelSize) + 1;
      const top = Math.max(0, y - channelSize + 1);
      const bottom = Math.min(y, rows - channelSize) + 1;
      if (left >= right || top >= bottom || rectangleSum(erodedArea, stride, left, top, right, bottom) === 0) result[index] = 1;
    }
  }
  return result;
}

function keepLargestWaterRegion(grid: Uint8Array, dimensions: MapDimensions): Uint8Array {
  const { columns, rows } = dimensions;
  const cellCount = columns * rows;
  const visited = new Uint8Array(cellCount);
  let largest: number[] = [];
  const queue = new Int32Array(cellCount);
  for (let start = 0; start < cellCount; start += 1) {
    if (grid[start] !== 0 || visited[start] !== 0) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++] ?? 0;
      const x = index % columns;
      const y = Math.floor(index / columns);
      const left = index - 1;
      const right = index + 1;
      const up = index - columns;
      const down = index + columns;
      if (x > 0 && visited[left] === 0 && grid[left] === 0) {
        visited[left] = 1;
        queue[tail++] = left;
      }
      if (x < columns - 1 && visited[right] === 0 && grid[right] === 0) {
        visited[right] = 1;
        queue[tail++] = right;
      }
      if (y > 0 && visited[up] === 0 && grid[up] === 0) {
        visited[up] = 1;
        queue[tail++] = up;
      }
      if (y < rows - 1 && visited[down] === 0 && grid[down] === 0) {
        visited[down] = 1;
        queue[tail++] = down;
      }
    }
    if (tail > largest.length) largest = Array.from(queue.subarray(0, tail));
  }
  const connected = new Uint8Array(cellCount);
  for (const index of largest) connected[index] = 1;
  const result = grid.slice();
  for (let i = 0; i < cellCount; i += 1) if (grid[i] === 0 && connected[i] === 0) result[i] = 1;
  return result;
}

function generateAtThreshold(field: Float32Array, threshold: number, dimensions: MapDimensions): Uint8Array {
  const { columns, rows } = dimensions;
  const cellCount = columns * rows;
  const grid = new Uint8Array(cellCount);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const border = x < generation.borderTiles || y < generation.borderTiles
        || x >= columns - generation.borderTiles || y >= rows - generation.borderTiles;
      grid[y * columns + x] = border || (field[y * columns + x] ?? 0) > threshold ? 1 : 0;
    }
  }
  return keepLargestWaterRegion(enforceChannels(grid, dimensions), dimensions);
}

export function generateWorld(seed: number, landCoverage: number, dimensions: MapDimensions): World {
  const normalizedSeed = seed >>> 0;
  const cellCount = dimensions.columns * dimensions.rows;
  const field = buildField(normalizedSeed, dimensions);
  let best: ReturnType<typeof generateAtThreshold> = new Uint8Array(cellCount);
  let bestDifference = Number.POSITIVE_INFINITY;
  let lowThreshold: number = generation.minNoiseThreshold;
  let highThreshold: number = generation.maxNoiseThreshold;
  for (let attempt = 0; attempt < generation.thresholdAttempts; attempt += 1) {
    const threshold = (lowThreshold + highThreshold) / 2;
    const candidate = generateAtThreshold(field, threshold, dimensions);
    let land = 0;
    for (const cell of candidate) land += cell;
    const coverage = land / cellCount;
    const difference = Math.abs(coverage - landCoverage);
    if (difference < bestDifference) {
      best = candidate;
      bestDifference = difference;
    }
    if (coverage >= landCoverage - generation.landCoverageTolerance && coverage <= landCoverage + generation.landCoverageTolerance) {
      return { ...dimensions, seed: normalizedSeed, grid: candidate };
    }
    if (coverage > landCoverage) lowThreshold = threshold;
    else highThreshold = threshold;
  }
  let bestLand = 0;
  for (const cell of best) bestLand += cell;
  const bestCoverage = bestLand / cellCount;
  if (
    bestCoverage < landCoverage - generation.landCoverageTolerance
    || bestCoverage > landCoverage + generation.landCoverageTolerance
  ) {
    throw new Error(`Could not generate world coverage in range for seed ${normalizedSeed}: ${bestCoverage}`);
  }
  return { ...dimensions, seed: normalizedSeed, grid: best };
}

export function generateWorldWithFallback(seed: number, landCoverage: number, dimensions: MapDimensions): World {
  let lastError: unknown;
  for (let offset = 0; offset < 8; offset += 1) {
    try {
      return generateWorld(seed + offset, landCoverage, dimensions);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function isLandAt(world: World, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return true;
  const column = Math.floor(x / tileSize);
  const row = Math.floor(y / tileSize);
  return world.grid[row * world.columns + column] === 1;
}

export function encodeWorld(grid: Uint8Array): number[] {
  const encoded: number[] = [];
  if (grid.length === 0) return encoded;
  let value = grid[0] ?? 0;
  let count = 0;
  for (const cell of grid) {
    if (cell === value && count < 0x7fffffff) count += 1;
    else {
      encoded.push(value, count);
      value = cell;
      count = 1;
    }
  }
  encoded.push(value, count);
  return encoded;
}

export function decodeWorld(encoded: readonly number[], cellCount: number): Uint8Array {
  const grid = new Uint8Array(cellCount);
  let offset = 0;
  for (let i = 0; i < encoded.length; i += 2) {
    const value = encoded[i];
    const count = encoded[i + 1];
    if ((value !== 0 && value !== 1) || !Number.isInteger(count) || (count ?? 0) <= 0 || offset + (count ?? 0) > cellCount) {
      throw new Error("Invalid world RLE");
    }
    grid.fill(value, offset, offset + (count ?? 0));
    offset += count ?? 0;
  }
  if (offset !== cellCount) throw new Error("Invalid world RLE length");
  return grid;
}
