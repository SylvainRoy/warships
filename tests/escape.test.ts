import { describe, expect, it } from "vitest";
import { ESCAPE_GUARD_MS, escapeAction } from "../src/client/escape.js";

describe("Escape action", () => {
  it("closes an open upgrade panel", () => {
    expect(escapeAction({ upgradeMenuOpen: true, menuPending: false, guardUntil: 0 }, 100, false))
      .toBe("closeUpgrade");
  });

  it("ignores Escape within the guard and allows it after the guard", () => {
    const state = { upgradeMenuOpen: false, menuPending: false, guardUntil: 500 };
    expect(escapeAction(state, 499, false)).toBe("ignore");
    expect(escapeAction(state, 500, false)).toBe("toggleMenu");
  });

  it("cancels a pending menu action", () => {
    expect(escapeAction({ upgradeMenuOpen: false, menuPending: true, guardUntil: 0 }, 100, false))
      .toBe("cancelPending");
  });

  it("ignores repeated keydown events", () => {
    expect(escapeAction({ upgradeMenuOpen: false, menuPending: false, guardUntil: 0 }, 1000, true))
      .toBe("ignore");
  });

  it("extends the guard during a mashing sequence", () => {
    const state = { upgradeMenuOpen: true, menuPending: false, guardUntil: 0 };
    const press = (now: number) => {
      const action = escapeAction(state, now, false);
      if (action === "closeUpgrade") {
        state.upgradeMenuOpen = false;
        state.guardUntil = now + ESCAPE_GUARD_MS;
      } else if (action === "ignore" && now < state.guardUntil) {
        state.guardUntil = now + ESCAPE_GUARD_MS;
      }
      return action;
    };

    expect([press(0), press(150), press(300), press(450)]).toEqual([
      "closeUpgrade",
      "ignore",
      "ignore",
      "ignore",
    ]);
    expect(press(1000)).toBe("toggleMenu");
  });
});
