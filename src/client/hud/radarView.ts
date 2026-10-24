import { type Frigate } from "../../shared/sim.js";
import type { World } from "../../shared/world.js";
import { RADAR, radarBearing, radarRange, worldToRadar } from "../radar.js";
import { colours, ctx } from "../dom.js";
import { radarSweep, resetRadarSweep } from "../gameEvents.js";
import { client, type Snapshot } from "../state.js";

export function getRadarMap(worldState: World): HTMLCanvasElement {
  if (client.radarMapCanvas && client.radarMapWorld === worldState) return client.radarMapCanvas;
  const canvas = document.createElement("canvas");
  canvas.width = worldState.columns;
  canvas.height = worldState.rows;
  const mapContext = canvas.getContext("2d");
  if (mapContext) {
    const image = mapContext.createImageData(canvas.width, canvas.height);
    for (let index = 0; index < worldState.grid.length; index += 1) {
      if (!worldState.grid[index]) continue;
      const pixel = index * 4;
      image.data[pixel] = 93;
      image.data[pixel + 1] = 255;
      image.data[pixel + 2] = 172;
      image.data[pixel + 3] = 115;
    }
    mapContext.putImageData(image, 0, 0);
  }
  client.radarMapCanvas = canvas;
  client.radarMapWorld = worldState;
  return canvas;
}

const RADAR_OUTLINE = "#030d14";

export function drawRadarTriangle(x: number, y: number, angle: number, length: number, width: number, color: string): void {
  const axisX = Math.cos(angle);
  const axisY = Math.sin(angle);
  const perpendicularX = -axisY;
  const perpendicularY = axisX;
  const tipX = x + axisX * length / 2;
  const tipY = y + axisY * length / 2;
  const baseX = x - axisX * length / 2;
  const baseY = y - axisY * length / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + perpendicularX * width / 2, baseY + perpendicularY * width / 2);
  ctx.lineTo(baseX - perpendicularX * width / 2, baseY - perpendicularY * width / 2);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = RADAR_OUTLINE;
  ctx.stroke();
}

export function drawRadar(snapshot: Snapshot, frigate: Frigate, now: number, logicalWidth: number, logicalHeight: number): void {
  if (!client.world) return;
  const range = radarRange(client.gameSettings.mapSize);
  if (client.radarSweepOwnerId !== frigate.playerId || client.radarSweepRange !== range) {
    resetRadarSweep();
    client.radarSweepOwnerId = frigate.playerId;
    client.radarSweepRange = range;
  }
  const centerX = logicalWidth - RADAR.margin - RADAR.radius;
  const centerY = logicalHeight - RADAR.margin - RADAR.radius;
  const worldScale = RADAR.radius / range;
  const worldLeft = centerX - frigate.x * worldScale;
  const worldTop = centerY - frigate.y * worldScale;
  const worldRight = worldLeft + client.world.width * worldScale;
  const worldBottom = worldTop + client.world.height * worldScale;
  const scopeLeft = centerX - RADAR.radius;
  const scopeTop = centerY - RADAR.radius;
  const scopeRight = centerX + RADAR.radius;
  const scopeBottom = centerY + RADAR.radius;

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, RADAR.radius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(5, 20, 29, .72)";
  ctx.fill();
  ctx.clip();

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    getRadarMap(client.world),
    worldLeft,
    worldTop,
    client.world.width * worldScale,
    client.world.height * worldScale,
  );

  ctx.fillStyle = "rgba(93, 255, 172, .45)";
  if (worldTop > scopeTop) {
    ctx.fillRect(scopeLeft, scopeTop, scopeRight - scopeLeft, Math.min(scopeBottom, worldTop) - scopeTop);
  }
  if (worldBottom < scopeBottom) {
    const boundaryTop = Math.max(scopeTop, worldBottom);
    ctx.fillRect(scopeLeft, boundaryTop, scopeRight - scopeLeft, scopeBottom - boundaryTop);
  }
  const boundaryTop = Math.max(scopeTop, worldTop);
  const boundaryBottom = Math.min(scopeBottom, worldBottom);
  if (boundaryBottom > boundaryTop && worldLeft > scopeLeft) {
    ctx.fillRect(scopeLeft, boundaryTop, Math.min(scopeRight, worldLeft) - scopeLeft, boundaryBottom - boundaryTop);
  }
  if (boundaryBottom > boundaryTop && worldRight < scopeRight) {
    const boundaryLeft = Math.max(scopeLeft, worldRight);
    ctx.fillRect(boundaryLeft, boundaryTop, scopeRight - boundaryLeft, boundaryBottom - boundaryTop);
  }

  ctx.globalAlpha = .15;
  ctx.strokeStyle = "#5dffac";
  ctx.lineWidth = 1;
  for (const fraction of [1 / 3, 2 / 3]) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, RADAR.radius * fraction, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(centerX, scopeTop);
  ctx.lineTo(centerX, scopeBottom);
  ctx.moveTo(scopeLeft, centerY);
  ctx.lineTo(scopeRight, centerY);
  ctx.stroke();

  const sweepAngle = now / RADAR.sweepPeriod * Math.PI * 2;
  if (client.previousRadarSweepAngle === null) {
    client.previousRadarSweepAngle = sweepAngle;
  } else {
    radarSweep.update(
      client.previousRadarSweepAngle,
      sweepAngle,
      frigate,
      snapshot.frigates,
      frigate.playerId,
      now,
      range,
    );
    client.previousRadarSweepAngle = sweepAngle;
  }
  ctx.globalAlpha = .1;
  ctx.fillStyle = "#5dffac";
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.arc(centerX, centerY, RADAR.radius, sweepAngle - Math.PI / 6, sweepAngle);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = .5;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX + Math.cos(sweepAngle) * RADAR.radius, centerY + Math.sin(sweepAngle) * RADAR.radius);
  ctx.stroke();
  ctx.globalAlpha = 1;

  for (const blip of radarSweep.blips(now)) {
    ctx.globalAlpha = blip.alpha;
    if (blip.kind === "position") {
      const dx = blip.x - frigate.x;
      const dy = blip.y - frigate.y;
      const [radarX, radarY] = worldToRadar(dx, dy, range);
      ctx.fillStyle = blip.color;
      ctx.beginPath();
      ctx.arc(centerX + radarX, centerY + radarY, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = RADAR_OUTLINE;
      ctx.stroke();
    } else {
      const distance = RADAR.radius - 6;
      drawRadarTriangle(
        centerX + Math.cos(blip.bearing) * distance,
        centerY + Math.sin(blip.bearing) * distance,
        blip.bearing,
        7,
        6,
        blip.color,
      );
    }
  }
  ctx.globalAlpha = 1;

  for (const base of client.bases) {
    if (!base.active) continue;
    const dx = base.harbourX - frigate.x;
    const dy = base.harbourY - frigate.y;
    const distance = Math.hypot(dx, dy);
    ctx.fillStyle = base.ownerTeam === null ? "#fff" : colours[base.ownerTeam] ?? "#fff";
    if (distance <= range) {
      const [radarX, radarY] = worldToRadar(dx, dy, range);
      const markerX = Math.round(centerX + radarX) - 3;
      const markerY = Math.round(centerY + radarY) - 3;
      ctx.fillRect(markerX, markerY, 6, 6);
      ctx.lineWidth = 1;
      ctx.strokeStyle = RADAR_OUTLINE;
      ctx.strokeRect(markerX - 0.5, markerY - 0.5, 7, 7);
    } else if (base.ownerTeam === frigate.team) {
      const bearing = radarBearing(frigate.x, frigate.y, base.harbourX, base.harbourY);
      const inner = RADAR.radius - 8;
      const outer = RADAR.radius - 2;
      const tickColour = ctx.fillStyle;
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(bearing) * inner, centerY + Math.sin(bearing) * inner);
      ctx.lineTo(centerX + Math.cos(bearing) * outer, centerY + Math.sin(bearing) * outer);
      ctx.lineWidth = 4;
      ctx.strokeStyle = RADAR_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = tickColour;
      ctx.stroke();
    }
  }

  drawRadarTriangle(centerX, centerY, frigate.heading, 6, 5, "#fff");
  ctx.globalAlpha = .6;
  ctx.strokeStyle = "#5dffac";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(centerX, centerY, RADAR.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
