import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, describeSettingsChanges, sanitizeSettings } from "../src/shared/settings.js";

describe("game settings", () => {
  it("accepts defaults and valid edge values as fresh objects", () => {
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
    })).toEqual({
      boatSpeedPct: 50,
      rotationPct: 200,
      cannonRotationPct: 50,
      torpedoRotationPct: 200,
      shellSpeedPct: 50,
      torpedoSpeedPct: 200,
      cannonReload: 0.5,
      torpedoReload: 20,
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

    const missing = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
    delete missing.torpedoReload;
    expect(sanitizeSettings(missing)).toBeNull();
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, unexpected: 1 })).toBeNull();
    const oldSettings = {
      boatSpeedPct: 100,
      rotationPct: 100,
      shellSpeedPct: 100,
      torpedoSpeedPct: 100,
      cannonReload: DEFAULT_SETTINGS.cannonReload,
      torpedoReload: DEFAULT_SETTINGS.torpedoReload,
    };
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
    })).toEqual([
      "boat speed 150%",
      "rotation 120%",
      "cannon rotation 150%",
      "shell speed 80%",
      "torpedo speed 200%",
      "cannon reload 2 s",
      "torpedo reload 2.5 s",
    ]);
  });
});
