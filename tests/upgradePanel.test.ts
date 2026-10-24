import { describe, expect, it } from "vitest";
import { emptyUpgrades } from "../src/shared/sim.js";
import { upgradePanelModel } from "../src/client/upgradePanelModel.js";

describe("upgrade panel model", () => {
  it("lists tracks in purchase order and marks the affordable row", () => {
    const model = upgradePanelModel(100, emptyUpgrades(), false);
    expect(model.lockMessage).toBeNull();
    expect(model.rows.map(({ track }) => track)).toEqual([
      "speed", "cannonRange", "hull", "cannonDamage", "torpedoSpeed", "torpedoDamage",
    ]);
    expect(model.rows[0]).toMatchObject({ level: 0, cost: 100, affordable: true });
    expect(model.rows[1]).toMatchObject({ cost: 100, affordable: true });
    expect(model.rows[2]).toMatchObject({ cost: 100, affordable: true });
  });

  it("dims unaffordable and locked rows and shows the exact lock text", () => {
    const upgrades = emptyUpgrades();
    upgrades.hull = 3;
    const affordable = upgradePanelModel(99, upgrades, false);
    expect(affordable.rows[0]).toMatchObject({ cost: 100, affordable: false });
    expect(affordable.rows[2]).toMatchObject({ maxed: true, cost: null, affordable: false });

    const locked = upgradePanelModel(1000, emptyUpgrades(), true);
    expect(locked.lockMessage).toBe("Under fire — leave the harbour and come back");
    expect(locked.rows.every((row) => !row.affordable)).toBe(true);
  });
});
