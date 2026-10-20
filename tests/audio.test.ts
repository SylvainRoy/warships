import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../src/shared/config.js";
import { SoundRateLimiter, stereoPanForOffset, worldSoundAttenuation } from "../src/client/audio.js";

describe("sound helpers", () => {
  it("attenuates world sounds from full volume to silence", () => {
    expect(worldSoundAttenuation(0)).toBe(1);
    expect(worldSoundAttenuation(GAME_CONFIG.audio.fullVolumeDistance)).toBe(1);
    expect(worldSoundAttenuation((GAME_CONFIG.audio.fullVolumeDistance + GAME_CONFIG.audio.maxDistance) / 2)).toBeCloseTo(0.5);
    expect(worldSoundAttenuation(GAME_CONFIG.audio.maxDistance)).toBe(0);
    expect(worldSoundAttenuation(GAME_CONFIG.audio.maxDistance + 1)).toBe(0);
  });

  it("maps x offsets to the configured bounded stereo pan", () => {
    expect(stereoPanForOffset(0)).toBe(0);
    expect(stereoPanForOffset(GAME_CONFIG.audio.panDistance)).toBe(GAME_CONFIG.audio.panScale);
    expect(stereoPanForOffset(-GAME_CONFIG.audio.panDistance)).toBe(-GAME_CONFIG.audio.panScale);
    expect(stereoPanForOffset(GAME_CONFIG.audio.panDistance * 2)).toBe(GAME_CONFIG.audio.panScale);
  });

  it("rate limits each sound kind and drops voices beyond the concurrency cap", () => {
    const limiter = new SoundRateLimiter(60, 2);
    expect(limiter.allow("fire", 100, 0)).toBe(true);
    expect(limiter.allow("fire", 159, 0)).toBe(false);
    expect(limiter.allow("fire", 160, 0)).toBe(true);
    expect(limiter.allow("hit", 160, 2)).toBe(false);
    expect(limiter.allow("hit", 160, 1)).toBe(true);
  });
});
