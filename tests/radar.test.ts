import { describe, expect, it } from "vitest";
import type { SnapshotFrigate } from "../src/shared/protocol.js";
import { radarBearing, radarContacts, worldToRadar } from "../src/client/radar.js";

function frigate(
  playerId: string,
  slot: number,
  status: SnapshotFrigate["status"],
  x: number,
  y: number,
): SnapshotFrigate {
  return {
    playerId,
    name: playerId,
    slot,
    x,
    y,
    heading: 0,
    hp: 100,
    status,
    sinkingStartedAt: 0,
    spawnProtectedUntil: 0,
  };
}

describe("radar", () => {
  it("excludes self and boats that are not afloat, and colours alive direction contacts by slot", () => {
    const frigates = [
      frigate("own", 1, "alive", 0, 0),
      frigate("near", 2, "alive", 120, -45),
      frigate("far", 3, "alive", 5000, 2500),
      frigate("sinking", 4, "sinking", -20, 30),
      frigate("waiting", 1, "waiting", 0, 0),
    ];
    const colorForSlot = (slot: number) => ["#4b9bff", "#ff6266", "#f3c94e", "#c084fc"][slot - 1] ?? "#fff";

    expect(radarContacts(frigates, "own", colorForSlot)).toEqual([
      { kind: "direction", x: 120, y: -45, color: "#ff6266" },
      { kind: "direction", x: 5000, y: 2500, color: "#f3c94e" },
    ]);
  });

  it("uses canvas bearings with east at zero and south positive", () => {
    expect(radarBearing(0, 0, 1, 0)).toBe(0);
    expect(radarBearing(0, 0, 0, 1)).toBeCloseTo(Math.PI / 2);
    expect(radarBearing(0, 0, 0, -1)).toBeCloseTo(-Math.PI / 2);
  });

  it("scales world offsets to the radar radius", () => {
    expect(worldToRadar(3000, 0)).toEqual([90, 0]);
  });
});
