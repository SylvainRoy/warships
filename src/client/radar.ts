import type { SnapshotFrigate } from "../shared/protocol.js";
import { mapDimensions } from "../shared/world.js";

export const RADAR = {
  bigRange: 3000,
  radius: 90,
  margin: 8,
  sweepPeriod: 4,
  blipHold: 0.3,
  blipFade: 2,
} as const;

export type RadarBlip = {
  playerId: string;
  kind: "position" | "direction";
  x: number;
  y: number;
  bearing: number;
  color: string;
  paintedAt: number;
  alpha: number;
};

type RadarFrigate = Pick<SnapshotFrigate, "playerId" | "slot" | "x" | "y" | "status">;
type StoredRadarBlip = Omit<RadarBlip, "alpha">;

export class RadarSweep {
  private readonly painted = new Map<string, StoredRadarBlip>();

  constructor(private readonly colorForSlot: (slot: number) => string) {}

  update(
    prevAngle: number,
    angle: number,
    own: { x: number; y: number },
    frigates: readonly RadarFrigate[],
    ownId: string,
    now: number,
    range: number,
  ): void {
    const fullSweep = angle - prevAngle >= Math.PI * 2;
    const sweepSpan = fullSweep ? Math.PI * 2 : positiveModulo(angle - prevAngle, Math.PI * 2);
    if (!fullSweep && sweepSpan === 0) return;

    const startAngle = positiveModulo(prevAngle, Math.PI * 2);
    for (const frigate of frigates) {
      if (frigate.playerId === ownId || frigate.status !== "alive") continue;
      const bearing = radarBearing(own.x, own.y, frigate.x, frigate.y);
      const bearingOffset = positiveModulo(bearing - startAngle, Math.PI * 2);
      if (!fullSweep && (bearingOffset === 0 || bearingOffset > sweepSpan)) continue;

      this.painted.set(frigate.playerId, {
        playerId: frigate.playerId,
        kind: Math.hypot(frigate.x - own.x, frigate.y - own.y) <= range ? "position" : "direction",
        x: frigate.x,
        y: frigate.y,
        bearing,
        color: this.colorForSlot(frigate.slot),
        paintedAt: now,
      });
    }
  }

  blips(now: number): RadarBlip[] {
    const blips: RadarBlip[] = [];
    for (const [playerId, blip] of this.painted) {
      const elapsed = now - blip.paintedAt;
      const alpha = elapsed <= RADAR.blipHold
        ? 1
        : 1 - (elapsed - RADAR.blipHold) / RADAR.blipFade;
      if (alpha <= 0) {
        this.painted.delete(playerId);
        continue;
      }
      blips.push({ ...blip, alpha });
    }
    return blips;
  }

  clear(): void {
    this.painted.clear();
  }
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

export function radarBearing(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.atan2(toY - fromY, toX - fromX);
}

export function radarRange(mapSize: number): number {
  return RADAR.bigRange * mapDimensions(mapSize).width / mapDimensions(2).width;
}

export function worldToRadar(dx: number, dy: number, range: number): [number, number] {
  const scale = RADAR.radius / range;
  return [dx * scale, dy * scale];
}
