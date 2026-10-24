import { GAME_CONFIG } from "../shared/config.js";
import type { UpgradeLevels, UpgradeTrack } from "../shared/sim.js";

export type UpgradePanelRow = {
  track: UpgradeTrack;
  label: string;
  level: number;
  cost: number | null;
  effect: string;
  affordable: boolean;
  maxed: boolean;
};

const TRACKS: ReadonlyArray<{ track: UpgradeTrack; label: string; effect: string }> = [
  { track: "speed", label: "Speed", effect: "+10% speed" },
  { track: "cannonRange", label: "Cannon range", effect: "+100 u range" },
  { track: "hull", label: "Hull", effect: "+25 max HP" },
  { track: "cannonDamage", label: "Cannon damage", effect: "+3 boat damage" },
  { track: "torpedoSpeed", label: "Torpedo speed", effect: "+20% speed" },
  { track: "torpedoDamage", label: "Torpedo damage", effect: "+5 damage" },
];

export function upgradePanelModel(money: number, upgrades: UpgradeLevels, locked: boolean): {
  lockMessage: string | null;
  rows: UpgradePanelRow[];
} {
  const { maxLevel, costs } = GAME_CONFIG.economy.upgrades;
  return {
    lockMessage: locked ? "Under fire — leave the harbour and come back" : null,
    rows: TRACKS.map(({ track, label, effect }) => {
      const level = upgrades[track];
      const maxed = level >= maxLevel;
      const cost = maxed ? null : costs[level] ?? null;
      return {
        track,
        label,
        level,
        cost,
        effect,
        maxed,
        affordable: !locked && !maxed && cost !== null && money >= cost,
      };
    }),
  };
}
