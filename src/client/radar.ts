import type { SnapshotFrigate } from "../shared/protocol.js";

export const RADAR = { range: 3000, radius: 90, margin: 8, sweepPeriod: 4 } as const;

export type RadarContact = { kind: "position" | "direction"; x: number; y: number; color: string };

type RadarFrigate = Pick<SnapshotFrigate, "playerId" | "slot" | "x" | "y" | "status">;

export function radarContacts(
  frigates: readonly RadarFrigate[],
  ownId: string,
  colorForSlot: (slot: number) => string,
): RadarContact[] {
  return frigates
    .filter((frigate) => frigate.playerId !== ownId && frigate.status === "alive")
    .map((frigate) => ({
      kind: "direction",
      x: frigate.x,
      y: frigate.y,
      color: colorForSlot(frigate.slot),
    }));
}

export function radarBearing(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.atan2(toY - fromY, toX - fromX);
}

export function worldToRadar(dx: number, dy: number): [number, number] {
  const scale = RADAR.radius / RADAR.range;
  return [dx * scale, dy * scale];
}
