import { describe, expect, it } from "vitest";
import {
  euclideanDistanceField,
  landColorAt,
  noise,
  noise2,
  waterColorAtDistance,
} from "../src/client/terrainStyle.js";

describe("euclideanDistanceField", () => {
  it("measures exact center-to-center Euclidean distances", () => {
    const grid = new Uint8Array(25);
    grid[1 * 5 + 1] = 1;
    const distances = euclideanDistanceField(grid, 5, 5, true);

    expect(distances[2 * 5 + 2]).toBeCloseTo(20 * Math.SQRT2, 10);
    expect(distances[1 * 5 + 3]).toBe(40);
  });

  it("matches brute-force distances on a random 30 by 20 grid", () => {
    const width = 30;
    const height = 20;
    const grid = new Uint8Array(width * height);
    let randomState = 17;
    for (let index = 0; index < grid.length; index += 1) {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      grid[index] = randomState % 100 < 31 ? 1 : 0;
    }

    for (const targetIsLand of [false, true]) {
      const distances = euclideanDistanceField(grid, width, height, targetIsLand);
      const sources: Array<[number, number]> = [];
      for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
          if ((grid[row * width + column] === 1) === targetIsLand) sources.push([column, row]);
        }
      }

      for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
          const expected = Math.min(
            ...sources.map(([sourceColumn, sourceRow]) => Math.hypot(column - sourceColumn, row - sourceRow)),
          ) * 20;
          expect(distances[row * width + column]).toBeCloseTo(expected, 10);
        }
      }
    }
  });

  it("treats out-of-world cells as land", () => {
    const distances = euclideanDistanceField(new Uint8Array(25), 5, 5, true, true);

    expect(distances[2 * 5]).toBe(20);
    expect(distances[2 * 5 + 2]).toBe(60);
  });
});

describe("waterColorAtDistance", () => {
  it("uses the specified shallow, mid, and deep water endpoints", () => {
    expect(waterColorAtDistance(0)).toEqual([63, 183, 176]);
    expect(waterColorAtDistance(60)).toEqual([26, 95, 122]);
    expect(waterColorAtDistance(400)).toEqual([15, 61, 85]);
  });
});

describe("landColorAt", () => {
  it("blends sand into grass from 15 to 25 u", () => {
    expect(landColorAt(15, 0, 0)).toEqual([216, 198, 144]);
    expect(landColorAt(20, 0, 0)).toEqual([163.5, 176, 111.5]);
    expect(landColorAt(25, 0, 0)).toEqual([111, 154, 79]);
    expect(noise(20.25, 31.25)).not.toEqual(noise(20, 31));
    expect(noise2(20.25, 31.25)).not.toEqual(noise2(20, 31));
  });

  it("softens forest and rock edges with their independent noise fields", () => {
    expect(landColorAt(50, 0.51, 0)).toEqual([111, 154, 79]);
    const forestMidpoint = landColorAt(50, 0.55, 0);
    expect(forestMidpoint[0]).toBeCloseTo(87, 10);
    expect(forestMidpoint[1]).toBeCloseTo(130.5, 10);
    expect(forestMidpoint[2]).toBeCloseTo(67.5, 10);
    expect(landColorAt(50, 0.59, 0)).toEqual([63, 107, 56]);
    expect(landColorAt(180, 0, 0.51)).toEqual([111, 154, 79]);
    const rockMidpoint = landColorAt(160, 0, 0.55);
    expect(rockMidpoint[0]).toBeCloseTo(117.75, 10);
    expect(rockMidpoint[1]).toBeCloseTo(148.75, 10);
    expect(rockMidpoint[2]).toBeCloseTo(89, 10);
    expect(landColorAt(180, 0, 0.59)).toEqual([138, 133, 119]);
    expect(noise(20.5, 31.25)).not.toEqual(noise2(20.5, 31.25));
  });
});
