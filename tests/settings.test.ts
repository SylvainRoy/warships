import { describe, expect, it } from "vitest";
import {
  BOT_SKILL_LABELS,
  DEFAULT_SETTINGS,
  describeSettingsChanges,
  MAP_SIZE_LABELS,
  SETTINGS_LIMITS,
  SETTING_LABELS,
  sanitizeSettings,
} from "../src/shared/settings.js";

describe("game settings", () => {
  it("accepts defaults and valid edge values as fresh objects", () => {
    expect(DEFAULT_SETTINGS.landCoveragePct).toBe(25);
    expect(DEFAULT_SETTINGS.mapSize).toBe(1);
    expect(MAP_SIZE_LABELS).toEqual(["Small", "Standard", "Big"]);
    expect(SETTINGS_LIMITS.mapSize).toEqual({ min: 0, max: 2, step: 1 });
    expect(Object.keys(DEFAULT_SETTINGS).indexOf("mapSize")).toBe(Object.keys(DEFAULT_SETTINGS).indexOf("landCoveragePct") + 1);
    expect(DEFAULT_SETTINGS.neutralBases).toBe(4);
    expect(DEFAULT_SETTINGS.fuelCrossings).toBe(2);
    expect(DEFAULT_SETTINGS.shells).toBe(50);
    expect(DEFAULT_SETTINGS.torpedoes).toBe(30);
    expect(DEFAULT_SETTINGS.resupplyTime).toBe(5);
    expect(DEFAULT_SETTINGS.captureTime).toBe(5);
    expect(DEFAULT_SETTINGS.repairTime).toBe(5);
    expect(DEFAULT_SETTINGS.baseIncomeInterval).toBe(60);
    expect(SETTINGS_LIMITS.baseIncomeInterval).toEqual({ min: 0, max: 180, step: 30 });
    expect(DEFAULT_SETTINGS.bots).toBe(2);
    expect(DEFAULT_SETTINGS.botSkill).toBe(1);
    expect(SETTINGS_LIMITS.bots).toEqual({ min: 0, max: 3, step: 1 });
    expect(SETTINGS_LIMITS.botSkill).toEqual({ min: 0, max: 2, step: 1 });
    expect(BOT_SKILL_LABELS).toEqual(["Easy", "Normal", "Hard"]);
    expect(SETTING_LABELS.bots).toBe("bots");
    expect(SETTING_LABELS.botSkill).toBe("bot skill");
    expect(Object.keys(DEFAULT_SETTINGS).indexOf("bots")).toBe(Object.keys(DEFAULT_SETTINGS).indexOf("baseIncomeInterval") + 1);
    expect(Object.keys(DEFAULT_SETTINGS).indexOf("botSkill")).toBe(Object.keys(DEFAULT_SETTINGS).indexOf("bots") + 1);
    const defaults = sanitizeSettings(DEFAULT_SETTINGS);
    expect(defaults).toEqual(DEFAULT_SETTINGS);
    expect(defaults).not.toBe(DEFAULT_SETTINGS);

    expect(sanitizeSettings({
      boatSpeedPct: 50,
      rotationPct: 200,
      cannonRotationPct: 50,
      torpedoRotationPct: 200,
      shellSpeedPct: 50,
      torpedoSpeedPct: 200,
      cannonReload: 0.5,
      torpedoReload: 20,
      landCoveragePct: 5,
      mapSize: 0,
      neutralBases: 0,
      fuelCrossings: 1,
      shells: 10,
      torpedoes: 5,
      resupplyTime: 1,
      captureTime: 1,
      repairTime: 1,
      baseIncomeInterval: 0,
      bots: 0,
      botSkill: 0,
    })).toEqual({
      boatSpeedPct: 50,
      rotationPct: 200,
      cannonRotationPct: 50,
      torpedoRotationPct: 200,
      shellSpeedPct: 50,
      torpedoSpeedPct: 200,
      cannonReload: 0.5,
      torpedoReload: 20,
      landCoveragePct: 5,
      mapSize: 0,
      neutralBases: 0,
      fuelCrossings: 1,
      shells: 10,
      torpedoes: 5,
      resupplyTime: 1,
      captureTime: 1,
      repairTime: 1,
      baseIncomeInterval: 0,
      bots: 0,
      botSkill: 0,
    });
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, cannonReload: 10, torpedoReload: 1 })).toEqual({
      ...DEFAULT_SETTINGS,
      cannonReload: 10,
      torpedoReload: 1,
    });
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, boatSpeedPct: 150.0000005 })).toEqual({
      ...DEFAULT_SETTINGS,
      boatSpeedPct: 150,
    });
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, baseIncomeInterval: 180 })).toMatchObject({
      baseIncomeInterval: 180,
    });
  });

  it("rejects out-of-range, off-step, nonnumeric, missing, and extra values", () => {
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, boatSpeedPct: 40 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, cannonRotationPct: 210 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, torpedoRotationPct: 155 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, cannonReload: 10.5 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, torpedoReload: 0.5 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, boatSpeedPct: 105 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, cannonReload: 0.7 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, rotationPct: Number.NaN })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, shellSpeedPct: "150" })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, landCoveragePct: 2.5 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, landCoveragePct: 45 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, landCoveragePct: 12 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, mapSize: -1 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, mapSize: 3 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, mapSize: 1.5 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, neutralBases: -1 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, neutralBases: 9 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, neutralBases: 2.5 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, fuelCrossings: 0 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, fuelCrossings: 11 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, fuelCrossings: 1.5 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, shells: 0 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, shells: 210 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, shells: 55 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, torpedoes: 0 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, torpedoes: 105 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, torpedoes: 6 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, resupplyTime: 0 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, resupplyTime: 31 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, resupplyTime: 2.5 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, captureTime: 0 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, captureTime: 31 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, captureTime: 5.5 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, repairTime: 0 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, repairTime: 31 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, repairTime: 5.5 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, baseIncomeInterval: -30 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, baseIncomeInterval: 210 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, baseIncomeInterval: 45 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, bots: -1 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, bots: 4 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, bots: 1.5 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, botSkill: -1 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, botSkill: 3 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, botSkill: 1.5 })).toBeNull();

    const missing = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
    delete missing.torpedoReload;
    expect(sanitizeSettings(missing)).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, unexpected: 1 })).toBeNull();
    const oldSettings = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
    delete oldSettings.landCoveragePct;
    expect(sanitizeSettings(oldSettings)).toBeNull();
  });

  it("describes changed values in field order and formats reload times", () => {
    expect(describeSettingsChanges(DEFAULT_SETTINGS, {
      ...DEFAULT_SETTINGS,
      boatSpeedPct: 150,
      rotationPct: 120,
      cannonRotationPct: 150,
      shellSpeedPct: 80,
      torpedoSpeedPct: 200,
      cannonReload: 2,
      torpedoReload: 2.5,
      landCoveragePct: 15,
      mapSize: 0,
      neutralBases: 6,
      fuelCrossings: 4,
      shells: 100,
      torpedoes: 60,
      resupplyTime: 3,
      captureTime: 10,
      repairTime: 10,
      baseIncomeInterval: 30,
      bots: 3,
      botSkill: 2,
    })).toEqual([
      "boat speed 150%",
      "rotation 120%",
      "cannon rotation 150%",
      "shell speed 80%",
      "torpedo speed 200%",
      "cannon reload 2 s",
      "torpedo reload 2.5 s",
      "land coverage 15%",
      "map size Small",
      "neutral bases 6",
      "fuel 4 crossings",
      "shells 100",
      "torpedoes 60",
      "resupply time 3 s",
      "capture time 10 s",
      "repair time 10 s",
      "base income every 30 s",
      "bots 3",
      "bot skill Hard",
    ]);
    expect(describeSettingsChanges(DEFAULT_SETTINGS, {
      ...DEFAULT_SETTINGS,
      baseIncomeInterval: 0,
    })).toEqual(["base income Off"]);
  });
});
