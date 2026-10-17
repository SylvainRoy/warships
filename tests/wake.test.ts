import { describe, expect, it } from "vitest";
import { shouldResetWake, torpedoWakeLength, wakeArmOffset, wakeLife } from "../src/client/wake.js";

describe("wake helpers", () => {
  it("widens wake arms by age and speed", () => {
    expect(wakeArmOffset(2, 0.75, 10)).toBe(29);
  });

  it("caps the torpedo trail by the distance travelled", () => {
    expect(torpedoWakeLength(120, 30)).toBe(30);
    expect(torpedoWakeLength(120, 200)).toBe(150);
  });

  it("resets only when a boat jumps more than 50 units", () => {
    expect(shouldResetWake({ x: 0, y: 0 }, { x: 50, y: 0 })).toBe(false);
    expect(shouldResetWake({ x: 0, y: 0 }, { x: 50.1, y: 0 })).toBe(true);
  });

  it("uses shorter lives for astern wakes", () => {
    expect(wakeLife(24)).toBe(3);
    expect(wakeLife(-10)).toBe(1);
  });
});
