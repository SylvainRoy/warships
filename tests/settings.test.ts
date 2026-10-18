import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, describeSettingsChanges, sanitizeSettings } from "../src/shared/settings.js";

describe("game settings", () => {
  it("accepts defaults and valid edge values as fresh objects", () => {
    expect(DEFAULT_SETTINGS.landCoveragePct).toBe(25);
    expect(DEFAULT_SETTINGS.neutralBases).toBe(4);
    expect(DEFAULT_SETTINGS.captureTime).toBe(5);
    expect(DEFAULT_SETTINGS.repairTime).toBe(5);
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
      neutralBases: 0,
      captureTime: 1,
      repairTime: 1,
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
      neutralBases: 0,
      captureTime: 1,
      repairTime: 1,
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
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, neutralBases: -1 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, neutralBases: 9 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, neutralBases: 2.5 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, captureTime: 0 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, captureTime: 31 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, captureTime: 5.5 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, repairTime: 0 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, repairTime: 31 })).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, repairTime: 5.5 })).toBeNull();

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
      neutralBases: 6,
      captureTime: 10,
      repairTime: 10,
    })).toEqual([
      "boat speed 150%",
      "rotation 120%",
      "cannon rotation 150%",
      "shell speed 80%",
      "torpedo speed 200%",
      "cannon reload 2 s",
      "torpedo reload 2.5 s",
      "land coverage 15%",
      "neutral bases 6",
      "capture time 10 s",
      "repair time 10 s",
    ]);
  });
});
