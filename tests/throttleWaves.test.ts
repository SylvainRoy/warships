import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../src/shared/config.js";
import { throttleWaveOffsets } from "../src/client/throttleWaves.js";

describe("throttle wave offsets", () => {
  it("places one aft arc for astern throttle and none at stop", () => {
    const offsets = throttleWaveOffsets(-1);
    expect(offsets).toHaveLength(1);
    expect(offsets[0]).toBeLessThan(-14.5);
    expect(offsets).toEqual([GAME_CONFIG.effects.throttleWave.sternX]);
    expect(throttleWaveOffsets(0)).toEqual([]);
  });

  it("adds one forward arc for each ahead throttle level", () => {
    for (const throttle of [1, 2, 3]) {
      const offsets = throttleWaveOffsets(throttle);
      expect(offsets).toHaveLength(throttle);
      expect(offsets.every((offset) => offset > 16)).toBe(true);
      expect(offsets.every((offset, index) => index === 0 || offset > (offsets[index - 1] ?? offset))).toBe(true);
    }
  });

  it("clamps finite throttle levels and ignores invalid values", () => {
    expect(throttleWaveOffsets(7)).toHaveLength(3);
    expect(throttleWaveOffsets(-3)).toHaveLength(1);
    for (const throttle of [undefined, null, "2", Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(throttleWaveOffsets(throttle)).toEqual([]);
    }
  });
});
