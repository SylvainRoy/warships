import { describe, expect, it } from "vitest";
import type { SnapshotFrigate } from "../src/shared/protocol.js";
import { RADAR, radarBearing, RadarSweep, worldToRadar } from "../src/client/radar.js";

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

const own = { x: 0, y: 0 };
const colorForSlot = (slot: number) => ["#4b9bff", "#ff6266", "#f3c94e", "#c084fc"][slot - 1] ?? "#fff";

describe("radar", () => {
  it("does not paint a boat before the sweep crosses its bearing", () => {
    const sweep = new RadarSweep(colorForSlot);

    sweep.update(0.1, 0.5, own, [frigate("other", 2, "alive", 1000, 0)], "own", 1);

    expect(sweep.blips(1)).toEqual([]);
  });

  it("paints an in-range blip when the sweep crosses a boat", () => {
    const sweep = new RadarSweep(colorForSlot);
    const other = frigate("other", 2, "alive", 1000, 1000);

    sweep.update(0.5, 1, own, [other], "own", 1);

    expect(sweep.blips(1)).toEqual([{
      playerId: "other",
      kind: "position",
      x: 1000,
      y: 1000,
      bearing: Math.PI / 4,
      color: "#ff6266",
      paintedAt: 1,
      alpha: 1,
    }]);
  });

  it("holds full alpha, fades linearly, and removes an expired blip", () => {
    const sweep = new RadarSweep(colorForSlot);
    sweep.update(0.1, 0.3, own, [frigate("other", 2, "alive", 1000, 200)], "own", 10);

    expect(sweep.blips(10.2)[0]?.alpha).toBe(1);
    expect(sweep.blips(11.3)[0]?.alpha).toBeCloseTo(0.5);
    expect(sweep.blips(12.4)).toEqual([]);
    expect(sweep.blips(12.4)).toEqual([]);
    expect(RADAR.blipHold).toBe(0.3);
    expect(RADAR.blipFade).toBe(2);
  });

  it("replaces a player's previous blip at the next pass", () => {
    const sweep = new RadarSweep(colorForSlot);
    sweep.update(0.05, 0.15, own, [frigate("other", 2, "alive", 1000, 100)], "own", 1);
    sweep.update(0.4, 0.5, own, [frigate("other", 2, "alive", 800, 400)], "own", 5);

    expect(sweep.blips(5)).toEqual([{
      playerId: "other",
      kind: "position",
      x: 800,
      y: 400,
      bearing: Math.atan2(400, 800),
      color: "#ff6266",
      paintedAt: 5,
      alpha: 1,
    }]);
  });

  it("paints an out-of-range direction contact with a frozen bearing", () => {
    const sweep = new RadarSweep(colorForSlot);
    const far = frigate("far", 3, "alive", 4000, 2000);
    const bearing = radarBearing(own.x, own.y, far.x, far.y);
    sweep.update(0.4, 0.5, own, [far], "own", 1);
    sweep.update(0.5, 0.7, own, [frigate("far", 3, "alive", -1000, 2000)], "own", 2);

    const blip = sweep.blips(2)[0];
    expect(blip).toMatchObject({
      playerId: "far",
      kind: "direction",
      x: 4000,
      y: 2000,
      bearing,
      color: "#f3c94e",
      paintedAt: 1,
    });
    expect(blip?.alpha).toBeCloseTo(0.65);
  });

  it("detects a boat across the zero-angle wrap", () => {
    const sweep = new RadarSweep(colorForSlot);

    sweep.update(350 * Math.PI / 180, 10 * Math.PI / 180, own, [
      frigate("east", 2, "alive", 1000, 0),
    ], "own", 1);

    expect(sweep.blips(1).map((blip) => blip.playerId)).toEqual(["east"]);
  });

  it("paints all eligible boats when the sweep gap is at least one full turn", () => {
    const sweep = new RadarSweep(colorForSlot);
    const first = frigate("first", 2, "alive", 1000 * Math.cos(1), 1000 * Math.sin(1));
    const second = frigate("second", 3, "alive", 1000 * Math.cos(4), 1000 * Math.sin(4));

    sweep.update(0, 2 * Math.PI, own, [first, second], "own", 1);

    expect(sweep.blips(1).map((blip) => blip.playerId)).toEqual(["first", "second"]);
  });

  it("does not paint sinking, waiting, or own boats, while existing blips keep fading", () => {
    const sweep = new RadarSweep(colorForSlot);
    const boats = [
      frigate("own", 1, "alive", 1000, 100),
      frigate("live", 2, "alive", 1000, 200),
      frigate("sinking", 3, "sinking", 1000, 300),
      frigate("waiting", 4, "waiting", 1000, 400),
    ];
    sweep.update(0.05, 0.45, own, boats, "own", 0);

    expect(sweep.blips(0).map((blip) => blip.playerId)).toEqual(["live"]);

    sweep.update(0.5, 0.6, own, [
      frigate("own", 1, "alive", 1000, 100),
      frigate("live", 2, "sinking", 1000, 200),
      boats[2]!,
      boats[3]!,
    ], "own", 0.7);

    expect(sweep.blips(0.7)).toHaveLength(1);
    expect(sweep.blips(0.7)[0]).toMatchObject({ playerId: "live", alpha: 0.8 });
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
