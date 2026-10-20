import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../src/shared/config.js";
import {
  DEFAULT_EFFECTS_SETTINGS,
  damageTargetKey,
  formatHitFeedLine,
  floatingNumberStyle,
  leastFullResupplyFraction,
  mergeHitFeedLine,
  mergeHitNumber,
  parseEffectsSettings,
} from "../src/client/feedback.js";

describe("client feedback helpers", () => {
  it("parses effect settings and falls back for invalid values", () => {
    expect(parseEffectsSettings(null)).toEqual(DEFAULT_EFFECTS_SETTINGS);
    expect(parseEffectsSettings("not-json")).toEqual(DEFAULT_EFFECTS_SETTINGS);
    expect(parseEffectsSettings(JSON.stringify({ volume: 35, shake: false }))).toEqual({
      volume: DEFAULT_EFFECTS_SETTINGS.volume,
      shake: false,
    });
    expect(parseEffectsSettings(JSON.stringify({ volume: 40, shake: false }))).toEqual({ volume: 40, shake: false });
    expect(parseEffectsSettings(JSON.stringify({ volume: -10, shake: "off" }))).toEqual({
      volume: DEFAULT_EFFECTS_SETTINGS.volume,
      shake: DEFAULT_EFFECTS_SETTINGS.shake,
    });
    expect(parseEffectsSettings(JSON.stringify({ volume: 0, shake: true }))).toEqual({ volume: 0, shake: true });
  });

  it("uses distinct stable keys for frigates and turrets", () => {
    expect(damageTargetKey({ targetId: "p2" })).toBe("frigate:p2");
    expect(damageTargetKey({ baseId: "b4" })).toBe("turret:b4");
    expect(damageTargetKey({})).toBeNull();
  });

  it("uses the least-full hull, fuel, ammunition, or torpedo fraction for the resupply ring", () => {
    expect(leastFullResupplyFraction({ fuel: 0.8, shells: 0.7, torpedoes: 0.9, hull: 0.2 })).toBe(0.2);
    expect(leastFullResupplyFraction({ fuel: 1.2, shells: 1, torpedoes: 1, hull: 1 })).toBe(1);
  });

  it("shares rising and fading number animation timing", () => {
    const beforeFade = floatingNumberStyle(0.4, 1.2, 0.4, 30);
    expect(beforeFade.offset).toBeCloseTo(10);
    expect(beforeFade.alpha).toBe(1);
    const duringFade = floatingNumberStyle(1, 1.2, 0.4, 30);
    expect(duringFade.offset).toBeCloseTo(25);
    expect(duringFade.alpha).toBeCloseTo(0.5);
  });

  it("merges damage numbers for the same target only inside the configured window", () => {
    const first = mergeHitNumber(undefined, {
      targetKey: "frigate:p2", x: 100, y: 200, amount: 10,
    }, 1000);
    const merged = mergeHitNumber(first, {
      targetKey: "frigate:p2", x: 105, y: 205, amount: 10,
    }, 1000 + GAME_CONFIG.effects.hitMergeWindowMs);
    expect(merged).toMatchObject({ amount: 20, x: 105, y: 205, startedAt: 1000 });
    const separate = mergeHitNumber(merged, {
      targetKey: "frigate:p2", x: 110, y: 210, amount: 10,
    }, 1000 + GAME_CONFIG.effects.hitMergeWindowMs * 2 + 1);
    expect(separate).toMatchObject({
      amount: 10,
      startedAt: 1000 + GAME_CONFIG.effects.hitMergeWindowMs * 2 + 1,
    });
  });

  it("merges hit feed totals within one second and formats the local line", () => {
    const first = mergeHitFeedLine([], {
      targetKey: "turret:b4",
      label: "You hit Alice's turret",
      amount: 10,
    }, 1000);
    const merged = mergeHitFeedLine(first, {
      targetKey: "turret:b4",
      label: "You hit Alice's turret",
      amount: 10,
    }, 1000 + GAME_CONFIG.effects.feedMergeWindowMs);
    expect(merged).toEqual([{
      targetKey: "turret:b4",
      label: "You hit Alice's turret",
      amount: 20,
      at: 1000 + GAME_CONFIG.effects.feedMergeWindowMs,
    }]);
    expect(formatHitFeedLine(merged[0]!)).toBe("You hit Alice's turret (−20)");
    expect(mergeHitFeedLine(merged, {
      targetKey: "frigate:p2",
      label: "You hit Bob",
      amount: 20,
    }, 3000)).toHaveLength(2);
  });
});
