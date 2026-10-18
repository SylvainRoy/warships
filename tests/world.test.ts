import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { placeBases } from "../src/shared/bases.js";
import { GAME_CONFIG } from "../src/shared/config.js";
import {
  decodeWorld,
  encodeWorld,
  generateWorld,
  generateWorldWithFallback,
  isLandAt,
  mapDimensions,
  type World,
} from "../src/shared/world.js";

function countLand(grid: Uint8Array): number {
  let count = 0;
  for (const cell of grid) count += cell;
  return count;
}

function waterRegionCount(grid: Uint8Array, columns: number, rows: number): number {
  const visited = new Uint8Array(grid.length);
  const queue = new Int32Array(grid.length);
  let regions = 0;
  for (let start = 0; start < grid.length; start += 1) {
    if (grid[start] !== 0 || visited[start] !== 0) continue;
    regions += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++] ?? 0;
      const x = index % columns;
      const y = Math.floor(index / columns);
      const neighbors = [
        ...(x > 0 ? [index - 1] : []),
        ...(x + 1 < columns ? [index + 1] : []),
        ...(y > 0 ? [index - columns] : []),
        ...(y + 1 < rows ? [index + columns] : []),
      ];
      for (const next of neighbors) {
        if (grid[next] === 0 && visited[next] === 0) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
  }
  return regions;
}

function landSummedArea(grid: Uint8Array, columns: number, rows: number): Int32Array {
  const stride = columns + 1;
  const area = new Int32Array(stride * (rows + 1));
  for (let y = 0; y < rows; y += 1) {
    let rowTotal = 0;
    for (let x = 0; x < columns; x += 1) {
      rowTotal += grid[y * columns + x] ?? 0;
      area[(y + 1) * stride + x + 1] = area[y * stride + x + 1]! + rowTotal;
    }
  }
  return area;
}

function hasWaterSquare(area: Int32Array, x: number, y: number, size: number, columns: number, rows: number): boolean {
  const stride = columns + 1;
  for (let top = Math.max(0, y - size + 1); top <= Math.min(rows - size, y); top += 1) {
    for (let left = Math.max(0, x - size + 1); left <= Math.min(columns - size, x); left += 1) {
      const land = area[(top + size) * stride + left + size]!
        - area[top * stride + left + size]!
        - area[(top + size) * stride + left]!
        + area[top * stride + left]!;
      if (land === 0) return true;
    }
  }
  return false;
}

describe("procedural world", () => {
  it("keeps dimensions, coverage, connected water, and eight-tile channels for each map size", () => {
    for (const mapSize of [0, 1, 2]) {
      const dimensions = mapDimensions(mapSize);
      for (const seed of [1, 42, 12345]) {
        const world = generateWorld(seed, GAME_CONFIG.world.generation.targetLandCoverage, dimensions);
        const coverage = countLand(world.grid) / world.grid.length;
        const landArea = landSummedArea(world.grid, world.columns, world.rows);
        const channelSize = GAME_CONFIG.world.generation.minChannelTiles;
        const target = GAME_CONFIG.world.generation.targetLandCoverage;
        const tolerance = GAME_CONFIG.world.generation.landCoverageTolerance;
        expect(world).toMatchObject(dimensions);
        expect(coverage).toBeGreaterThanOrEqual(target - tolerance);
        expect(coverage).toBeLessThanOrEqual(target + tolerance);
        expect(waterRegionCount(world.grid, world.columns, world.rows)).toBe(1);
        for (let y = 0; y < world.rows; y += 1) {
          for (let x = 0; x < world.columns; x += 1) {
            if (world.grid[y * world.columns + x] === 0) {
              expect(hasWaterSquare(landArea, x, y, channelSize, world.columns, world.rows)).toBe(true);
            }
          }
        }
      }
    }
  }, 180_000);

  it("generates requested coverage with connected water", () => {
    const tolerance = GAME_CONFIG.world.generation.landCoverageTolerance;
    for (const target of [0.05, 0.25, 0.4]) {
      for (const seed of [1, 2]) {
        const world = generateWorld(seed, target, mapDimensions(2));
        const coverage = countLand(world.grid) / world.grid.length;
        expect(coverage).toBeGreaterThanOrEqual(target - tolerance);
        expect(coverage).toBeLessThanOrEqual(target + tolerance);
        expect(waterRegionCount(world.grid, world.columns, world.rows)).toBe(1);
      }
    }
  }, 120_000);

  it("tries the next seed when the requested coverage cannot be generated", () => {
    const dimensions = mapDimensions(2);
    expect(() => generateWorld(95028, 0.4, dimensions)).toThrow();
    expect(generateWorldWithFallback(95028, 0.4, dimensions).seed).toBe(95029);
  });

  it("is deterministic and round-trips the server-sent grid encoding", () => {
    const first = generateWorld(98765, GAME_CONFIG.world.generation.targetLandCoverage, mapDimensions(2));
    const second = generateWorld(98765, GAME_CONFIG.world.generation.targetLandCoverage, mapDimensions(2));
    expect(first.grid).toEqual(second.grid);
    expect(decodeWorld(encodeWorld(first.grid), first.columns * first.rows)).toEqual(first.grid);
    expect(isLandAt(first, -1, 0)).toBe(true);
    expect(isLandAt(first, first.width, 0)).toBe(true);
  }, 60_000);

  it("preserves the Big world grid and base placement identities from main", () => {
    const expected = new Map<number, { grid: string; bases: string }>([
      [1, {
        grid: "f21ab371292be3f014684f2c47b1b43a53028d9efd64ccade58580cc878139fd",
        bases: "5de7906e5f7c50908425a0e24c33e6dece7b746454c4ca78785df0dc0f917dbc",
      }],
      [42, {
        grid: "79e6db0904bffc2a23a1250dc2922f00f2c70846685dea521e5ba335afecc59e",
        bases: "de8b82501889526a8e2bcb0d9c78bf3b83d42cc725a24f0777abe927706b66f9",
      }],
      [12345, {
        grid: "884300b7fb63674791ae7765345c9f10100a0ac5c1d99a568c7b65864b15f768",
        bases: "5092cd6cc0a4824fee7605413d57352fc27074f200483ec1d30d3ab4f80a6599",
      }],
    ]);
    for (const seed of [1, 42, 12345]) {
      const world: World = generateWorld(seed, 0.25, mapDimensions(2));
      const gridHash = createHash("sha256").update(world.grid).digest("hex");
      const basesHash = createHash("sha256").update(JSON.stringify(placeBases(world, 4))).digest("hex");
      expect(gridHash).toBe(expected.get(seed)?.grid);
      expect(basesHash).toBe(expected.get(seed)?.bases);
    }
  }, 120_000);
});
