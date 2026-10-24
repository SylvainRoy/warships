import { GAME_CONFIG } from "../shared/config.js";
import type { Frigate } from "../shared/sim.js";
import { ctx } from "./dom.js";
import { client } from "./state.js";
import { upgradePanelModel } from "./upgradePanelModel.js";

export function drawUpgradePanel(frigate: Frigate, logicalHeight: number): void {
  if (!client.upgradeMenuOpen || !client.gameSettings.treasures) return;
  const economy = client.latestSnapshot?.economy?.players.find((player) => player.playerId === client.ownId);
  if (!economy) return;
  const model = upgradePanelModel(economy.money, economy.upgrades, frigate.repairLockBaseId !== null);
  const x = 8;
  const y = logicalHeight - 340;
  const width = 286;
  const height = 184;
  ctx.save();
  ctx.fillStyle = "rgba(3, 13, 20, .9)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "rgba(243, 201, 78, .75)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + .5, y + .5, width - 1, height - 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#f3c94e";
  ctx.font = "700 12px DM Mono, monospace";
  ctx.fillText("BOAT UPGRADES", x + 12, y + 9);
  if (model.lockMessage) {
    ctx.fillStyle = "#e7a78d";
    ctx.font = "600 10px Manrope, sans-serif";
    ctx.fillText(model.lockMessage, x + 12, y + 27);
  }
  model.rows.forEach((row, index) => {
    const rowY = y + 47 + index * 21;
    ctx.globalAlpha = row.affordable || row.maxed ? 1 : .46;
    ctx.fillStyle = "#e8f1ef";
    ctx.font = "600 10px Manrope, sans-serif";
    ctx.fillText(`${index + 1}. ${row.label}`, x + 12, rowY);
    ctx.fillStyle = "#9bb6bf";
    ctx.font = "9px DM Mono, monospace";
    ctx.fillText(row.effect, x + 12, rowY + 10);
    for (let pip = 0; pip < GAME_CONFIG.economy.upgrades.maxLevel; pip += 1) {
      ctx.beginPath();
      ctx.arc(x + 157 + pip * 9, rowY + 6, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = pip < row.level ? "#f3c94e" : "rgba(155, 182, 191, .35)";
      ctx.fill();
    }
    ctx.textAlign = "right";
    ctx.fillStyle = row.maxed ? "#9bb6bf" : row.affordable ? "#f3c94e" : "#829ca4";
    ctx.font = "600 10px DM Mono, monospace";
    ctx.fillText(row.maxed ? "MAX" : `$${row.cost ?? 0}`, x + width - 12, rowY + 2);
    ctx.textAlign = "left";
  });
  ctx.restore();
}
