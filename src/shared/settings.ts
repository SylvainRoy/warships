import { GAME_CONFIG } from "./config.js";

export interface GameSettings {
  boatSpeedPct: number;
  rotationPct: number;
  cannonRotationPct: number;
  torpedoRotationPct: number;
  shellSpeedPct: number;
  torpedoSpeedPct: number;
  cannonReload: number;
  torpedoReload: number;
  landCoveragePct: number;
  neutralBases: number;
  captureTime: number;
  repairTime: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  boatSpeedPct: 100,
  rotationPct: 100,
  cannonRotationPct: 100,
  torpedoRotationPct: 100,
  shellSpeedPct: 100,
  torpedoSpeedPct: 100,
  cannonReload: GAME_CONFIG.cannon.reload,
  torpedoReload: GAME_CONFIG.torpedo.reload,
  landCoveragePct: GAME_CONFIG.world.generation.targetLandCoverage * 100,
  neutralBases: 4,
  captureTime: 5,
  repairTime: 5,
};

export const SETTINGS_LIMITS: Record<keyof GameSettings, { min: number; max: number; step: number }> = {
  boatSpeedPct: { min: 50, max: 200, step: 10 },
  rotationPct: { min: 50, max: 200, step: 10 },
  cannonRotationPct: { min: 50, max: 200, step: 10 },
  torpedoRotationPct: { min: 50, max: 200, step: 10 },
  shellSpeedPct: { min: 50, max: 200, step: 10 },
  torpedoSpeedPct: { min: 50, max: 200, step: 10 },
  cannonReload: { min: 0.5, max: 10, step: 0.5 },
  torpedoReload: { min: 1, max: 20, step: 0.5 },
  landCoveragePct: { min: 5, max: 40, step: 5 },
  neutralBases: { min: 0, max: 8, step: 1 },
  captureTime: { min: 1, max: 30, step: 1 },
  repairTime: { min: 1, max: 30, step: 1 },
};

const SETTINGS_KEYS: readonly (keyof GameSettings)[] = [
  "boatSpeedPct",
  "rotationPct",
  "cannonRotationPct",
  "torpedoRotationPct",
  "shellSpeedPct",
  "torpedoSpeedPct",
  "cannonReload",
  "torpedoReload",
  "landCoveragePct",
  "neutralBases",
  "captureTime",
  "repairTime",
];

const SETTING_LABELS: Record<keyof GameSettings, string> = {
  boatSpeedPct: "boat speed",
  rotationPct: "rotation",
  cannonRotationPct: "cannon rotation",
  torpedoRotationPct: "torpedo rotation",
  shellSpeedPct: "shell speed",
  torpedoSpeedPct: "torpedo speed",
  cannonReload: "cannon reload",
  torpedoReload: "torpedo reload",
  landCoveragePct: "land coverage",
  neutralBases: "neutral bases",
  captureTime: "capture time",
  repairTime: "repair time",
};

export function sanitizeSettings(value: unknown): GameSettings | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== SETTINGS_KEYS.length
    || keys.some((key) => typeof key !== "string" || !SETTINGS_KEYS.includes(key as keyof GameSettings))
  ) return null;

  const source = value as Record<string, unknown>;
  const settings: Partial<GameSettings> = {};
  for (const key of SETTINGS_KEYS) {
    const setting = source[key];
    const { min, max, step } = SETTINGS_LIMITS[key];
    if (typeof setting !== "number" || !Number.isFinite(setting) || setting < min || setting > max) return null;
    const stepCount = Math.round((setting - min) / step);
    const alignedSetting = min + stepCount * step;
    if (Math.abs(setting - alignedSetting) > 1e-6) return null;
    settings[key] = alignedSetting;
  }
  return settings as GameSettings;
}

export function describeSettingsChanges(before: GameSettings, after: GameSettings): string[] {
  return SETTINGS_KEYS.flatMap((key) => {
    if (before[key] === after[key]) return [];
    const value = key === "cannonReload" || key === "torpedoReload" || key === "captureTime" || key === "repairTime"
      ? `${after[key].toFixed(1).replace(/\.0$/, "")} s`
      : key === "neutralBases"
        ? `${after[key]}`
        : `${after[key]}%`;
    return [`${SETTING_LABELS[key]} ${value}`];
  });
}
