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
  mapSize: number;
  neutralBases: number;
  fuelCrossings: number;
  shells: number;
  torpedoes: number;
  resupplyTime: number;
  captureTime: number;
  repairTime: number;
  baseIncomeInterval: number;
  bots: number;
  botSkill: number;
  roundMinutes: number;
  treasures: boolean;
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
  mapSize: 1,
  neutralBases: 4,
  fuelCrossings: 2,
  shells: 50,
  torpedoes: 30,
  resupplyTime: 5,
  captureTime: 5,
  repairTime: 5,
  baseIncomeInterval: GAME_CONFIG.baseIncome.defaultInterval,
  bots: GAME_CONFIG.bots.defaultCount,
  botSkill: GAME_CONFIG.bots.defaultSkill,
  roundMinutes: GAME_CONFIG.rounds.defaultMinutes,
  treasures: true,
};

type NumericSetting = Exclude<keyof GameSettings, "treasures">;

export const SETTINGS_LIMITS: Record<NumericSetting, { min: number; max: number; step: number }> = {
  boatSpeedPct: { min: 50, max: 200, step: 10 },
  rotationPct: { min: 50, max: 200, step: 10 },
  cannonRotationPct: { min: 50, max: 200, step: 10 },
  torpedoRotationPct: { min: 50, max: 200, step: 10 },
  shellSpeedPct: { min: 50, max: 200, step: 10 },
  torpedoSpeedPct: { min: 50, max: 200, step: 10 },
  cannonReload: { min: 0.5, max: 10, step: 0.5 },
  torpedoReload: { min: 1, max: 20, step: 0.5 },
  landCoveragePct: { min: 5, max: 40, step: 5 },
  mapSize: { min: 0, max: 2, step: 1 },
  neutralBases: { min: 0, max: 8, step: 1 },
  fuelCrossings: { min: 1, max: 10, step: 1 },
  shells: { min: 10, max: 200, step: 10 },
  torpedoes: { min: 5, max: 100, step: 5 },
  resupplyTime: { min: 1, max: 30, step: 1 },
  captureTime: { min: 1, max: 30, step: 1 },
  repairTime: { min: 1, max: 30, step: 1 },
  baseIncomeInterval: { min: 0, max: 180, step: 30 },
  bots: { min: 0, max: 3, step: 1 },
  botSkill: { min: 0, max: 2, step: 1 },
  roundMinutes: { min: 0, max: 30, step: 5 },
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
  "mapSize",
  "neutralBases",
  "fuelCrossings",
  "shells",
  "torpedoes",
  "resupplyTime",
  "captureTime",
  "repairTime",
  "baseIncomeInterval",
  "bots",
  "botSkill",
  "roundMinutes",
  "treasures",
];

export const SETTING_LABELS: Record<keyof GameSettings, string> = {
  boatSpeedPct: "boat speed",
  rotationPct: "rotation",
  cannonRotationPct: "cannon rotation",
  torpedoRotationPct: "torpedo rotation",
  shellSpeedPct: "shell speed",
  torpedoSpeedPct: "torpedo speed",
  cannonReload: "cannon reload",
  torpedoReload: "torpedo reload",
  landCoveragePct: "land coverage",
  mapSize: "map size",
  neutralBases: "neutral bases",
  fuelCrossings: "fuel",
  shells: "shells",
  torpedoes: "torpedoes",
  resupplyTime: "resupply time",
  captureTime: "capture time",
  repairTime: "repair time",
  baseIncomeInterval: "base income",
  bots: "bots",
  botSkill: "bot skill",
  roundMinutes: "round length",
  treasures: "Treasures & upgrades",
};

export const MAP_SIZE_LABELS = GAME_CONFIG.world.mapSizes.map(({ label }) => label);
export const BOT_SKILL_LABELS = ["Easy", "Normal", "Hard"] as const;

export function formatMapSize(value: number): string {
  return MAP_SIZE_LABELS[value] ?? `${value}`;
}

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
    if (key === "treasures") {
      if (typeof setting !== "boolean") return null;
      settings.treasures = setting;
      continue;
    }
    const { min, max, step } = SETTINGS_LIMITS[key];
    if (typeof setting !== "number" || !Number.isFinite(setting) || setting < min || setting > max) return null;
    const stepCount = Math.round((setting - min) / step);
    const alignedSetting = min + stepCount * step;
    if (Math.abs(setting - alignedSetting) > 1e-6) return null;
    settings[key as NumericSetting] = alignedSetting;
  }
  return settings as GameSettings;
}

export function describeSettingsChanges(before: GameSettings, after: GameSettings): string[] {
  return SETTINGS_KEYS.flatMap((key) => {
    if (before[key] === after[key]) return [];
    if (key === "treasures") return [`${SETTING_LABELS[key]} ${after.treasures ? "On" : "Off"}`];
    const value = key === "mapSize"
      ? formatMapSize(after[key])
      : key === "baseIncomeInterval"
        ? after[key] === 0 ? "Off" : `every ${after[key]} s`
      : key === "botSkill"
        ? BOT_SKILL_LABELS[after[key]] ?? `${after[key]}`
      : key === "roundMinutes"
        ? after[key] === 0 ? "Endless" : `${after[key]} min`
      : key === "cannonReload" || key === "torpedoReload" || key === "resupplyTime" || key === "captureTime" || key === "repairTime"
      ? `${after[key].toFixed(1).replace(/\.0$/, "")} s`
      : key === "neutralBases" || key === "shells" || key === "torpedoes" || key === "bots"
        ? `${after[key]}`
        : key === "fuelCrossings"
          ? `${after[key]} crossings`
        : `${after[key]}%`;
    return [`${SETTING_LABELS[key]} ${value}`];
  });
}
