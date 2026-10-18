import { GAME_CONFIG } from "../shared/config.js";
import type { Base } from "../shared/bases.js";

export function drawBases(
  ctx: CanvasRenderingContext2D,
  bases: readonly Base[],
  colorForOwner: (ownerId: string) => string | undefined,
): void {
  const citySize = GAME_CONFIG.bases.citySize;
  const harbourSize = GAME_CONFIG.bases.harbourSize;
  for (const base of bases) {
    ctx.save();
    ctx.globalAlpha = base.active ? 1 : 0.4;
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(233, 247, 240, .55)";
    ctx.strokeRect(base.harbourX - harbourSize / 2, base.harbourY - harbourSize / 2, harbourSize, harbourSize);
    ctx.setLineDash([]);

    const facingX = Math.cos(base.facing);
    const facingY = Math.sin(base.facing);
    ctx.strokeStyle = "#806e51";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(base.cityX + facingX * citySize / 2, base.cityY + facingY * citySize / 2);
    ctx.lineTo(base.cityX + facingX * (citySize / 2 + 12), base.cityY + facingY * (citySize / 2 + 12));
    ctx.stroke();

    ctx.fillStyle = "#c9bea0";
    ctx.strokeStyle = "#6e654f";
    ctx.lineWidth = 2;
    ctx.fillRect(base.cityX - citySize / 2, base.cityY - citySize / 2, citySize, citySize);
    ctx.strokeRect(base.cityX - citySize / 2, base.cityY - citySize / 2, citySize, citySize);
    ctx.strokeStyle = "rgba(91, 81, 62, .75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(base.cityX - citySize / 2 + 5, base.cityY - 4);
    ctx.lineTo(base.cityX + citySize / 2 - 5, base.cityY - 4);
    ctx.moveTo(base.cityX - citySize / 2 + 5, base.cityY + 4);
    ctx.lineTo(base.cityX + citySize / 2 - 5, base.cityY + 4);
    ctx.stroke();

    if (base.turret === "active") {
      const barrelStart = 4;
      const barrelEnd = 14;
      ctx.strokeStyle = "#303434";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(base.cityX + facingX * barrelStart, base.cityY + facingY * barrelStart);
      ctx.lineTo(base.cityX + facingX * barrelEnd, base.cityY + facingY * barrelEnd);
      ctx.stroke();
      ctx.fillStyle = "#555b59";
      ctx.strokeStyle = "#282e2d";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(base.cityX, base.cityY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (base.turretHp < GAME_CONFIG.bases.turretHp) {
        const barWidth = 22;
        const barY = base.cityY - citySize / 2 - 6;
        ctx.fillStyle = "rgba(20, 24, 22, .85)";
        ctx.fillRect(base.cityX - barWidth / 2, barY, barWidth, 3);
        ctx.fillStyle = "#b65c50";
        ctx.fillRect(
          base.cityX - barWidth / 2,
          barY,
          barWidth * Math.max(0, base.turretHp) / GAME_CONFIG.bases.turretHp,
          3,
        );
      }
    } else if (base.turret === "destroyed") {
      ctx.fillStyle = "#696862";
      ctx.strokeStyle = "#514d46";
      ctx.lineWidth = 1;
      for (const [x, y, radius] of [[-6, -2, 4], [2, -4, 3], [5, 4, 4], [-2, 5, 3]] as const) {
        ctx.beginPath();
        ctx.moveTo(base.cityX + x - radius, base.cityY + y);
        ctx.lineTo(base.cityX + x - 1, base.cityY + y - radius);
        ctx.lineTo(base.cityX + x + radius, base.cityY + y - 1);
        ctx.lineTo(base.cityX + x + 1, base.cityY + y + radius);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = "#806e51";
      ctx.fillRect(base.cityX - 1, base.cityY - 1, 4, 3);
    }

    if (base.active) {
      const poleX = base.cityX - citySize / 2 + 9;
      const poleY = base.cityY - citySize / 2 + 8;
      ctx.strokeStyle = "#4a4a43";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(poleX, poleY + 13);
      ctx.lineTo(poleX, poleY);
      ctx.stroke();
      ctx.fillStyle = base.ownerId === null ? "#fff" : colorForOwner(base.ownerId) ?? "#fff";
      ctx.fillRect(poleX + 1, poleY, 9, 6);
    }
    ctx.restore();
  }
}

export function drawCaptureProgress(
  ctx: CanvasRenderingContext2D,
  frigate: { x: number; y: number },
  bases: readonly Base[],
  playerId: string,
  captureTime: number,
  _repairTime: number,
): void {
  const base = bases.find((candidate) => candidate.captureBy === playerId || candidate.repairBy === playerId);
  if (!base) return;
  const repairing = base.repairBy === playerId;
  const progress = repairing ? base.repairProgress : base.captureProgress;
  const label = repairing ? "Repairing turret" : `Capturing ${Math.ceil((1 - progress) * captureTime)} s`;
  const radius = GAME_CONFIG.frigate.length / 2 + 8;
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(238, 248, 246, .48)";
  ctx.beginPath();
  ctx.arc(frigate.x, frigate.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = repairing ? "#7ee0a1" : "#f6d47b";
  ctx.beginPath();
  ctx.arc(frigate.x, frigate.y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.stroke();
  ctx.font = "600 12px Manrope, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(3, 13, 20, .9)";
  ctx.strokeText(label, frigate.x, frigate.y + radius + 4);
  ctx.fillStyle = repairing ? "#d8ffe5" : "#fff3c5";
  ctx.fillText(label, frigate.x, frigate.y + radius + 4);
  ctx.restore();
}
