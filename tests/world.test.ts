import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../src/shared/config.js";
import { decodeWorld, encodeWorld, generateWorld, isLandAt } from "../src/shared/world.js";

const { columns, rows } = GAME_CONFIG.world;

function countLand(grid: Uint8Array): number {
  let count = 0;
  for (const cell of grid) count += cell;
  return count;
}

function waterRegionCount(grid: Uint8Array): number {
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

function hasWater3x3(grid: Uint8Array, x: number, y: number): boolean {
  for (let top = Math.max(0, y - 2); top <= Math.min(rows - 3, y); top += 1) {
    for (let left = Math.max(0, x - 2); left <= Math.min(columns - 3, x); left += 1) {
      let allWater = true;
      for (let dy = 0; dy < 3 && allWater; dy += 1) {
        for (let dx = 0; dx < 3; dx += 1) {
          if (grid[(top + dy) * columns + left + dx] !== 0) {
            allWater = false;
            break;
          }
        }
      }
      if (allWater) return true;
    }
  }
  return false;
}

describe("procedural world", () => {
  it("keeps coverage, connectivity, and three-tile channels for five seeds", () => {
    for (const seed of [1, 2, 3, 17, 123456]) {
      const world = generateWorld(seed);
      const coverage = countLand(world.grid) / world.grid.length;
      expect(coverage).toBeGreaterThanOrEqual(0.2);
      expect(coverage).toBeLessThanOrEqual(0.3);
      expect(waterRegionCount(world.grid)).toBe(1);
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < columns; x += 1) {
          if (world.grid[y * columns + x] === 0) expect(hasWater3x3(world.grid, x, y)).toBe(true);
        }
      }
    }
  }, 120_000);

  it("is deterministic and round-trips the server-sent grid encoding", () => {
    const first = generateWorld(98765);
    const second = generateWorld(98765);
    expect(first.grid).toEqual(second.grid);
    expect(decodeWorld(encodeWorld(first.grid))).toEqual(first.grid);
    expect(isLandAt(first, -1, 0)).toBe(true);
    expect(isLandAt(first, GAME_CONFIG.world.width, 0)).toBe(true);
  }, 60_000);
});
