import { DEFAULT_SETTINGS, describeSettingsChanges } from "../../shared/settings.js";
import { colours, ctx } from "../dom.js";
import { client, type Snapshot } from "../state.js";

export function drawFullScoreboard(snapshot: Snapshot, width: number, height: number): void {
  const changes = describeSettingsChanges(DEFAULT_SETTINGS, client.gameSettings);
  const customRules = changes.length > 0 ? `CUSTOM RULES · ${changes.join(" · ")}` : "";
  ctx.font = "500 11px DM Mono, monospace";
  const panelWidth = Math.min(width - 32, Math.max(490, customRules ? ctx.measureText(customRules).width + 48 : 490));
  const panelHeight = customRules ? 360 : 320;
  ctx.fillStyle = "rgba(3, 13, 20, .84)";
  ctx.fillRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight);
  ctx.fillStyle = "#9bb6bf";
  ctx.textAlign = "left";
  ctx.fillText("WATERSIDE SCOREBOARD", width / 2 - 215, height / 2 - 128);
  ctx.fillStyle = "#829ca4";
  ctx.font = "10px DM Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText("PTS", width / 2 + 60, height / 2 - 104);
  ctx.textAlign = "center";
  ctx.fillText("BASES", width / 2 + 117, height / 2 - 104);
  ctx.textAlign = "right";
  ctx.fillText("SUNK", width / 2 + 202, height / 2 - 104);
  snapshot.players.slice().sort((a, b) => b.score - a.score || a.sunk - b.sunk).forEach((player, index) => {
    const y = height / 2 - 89 + index * 48;
    ctx.fillStyle = player.playerId === client.ownId ? "rgba(96, 224, 203, .13)" : "rgba(225, 243, 244, .04)";
    ctx.fillRect(width / 2 - 222, y - 7, 444, 38);
    ctx.fillStyle = colours[player.slot - 1] ?? "#fff";
    ctx.beginPath();
    ctx.arc(width / 2 - 203, y + 11, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e5f1f2";
    ctx.font = "600 14px Manrope, sans-serif";
    ctx.fillText(`${player.host ? "♛ " : ""}${player.name}`, width / 2 - 187, y + 2);
    ctx.textAlign = "right";
    ctx.font = "12px DM Mono, monospace";
    const baseCount = client.bases.filter((base) => base.active && base.ownerId === player.playerId).length;
    ctx.fillText(`${player.score}`, width / 2 + 60, y + 4);
    ctx.textAlign = "center";
    ctx.fillText(`${baseCount}`, width / 2 + 117, y + 4);
    ctx.textAlign = "right";
    ctx.fillText(`${player.sunk}`, width / 2 + 202, y + 4);
    ctx.textAlign = "left";
  });
  if (customRules) {
    ctx.fillStyle = "#e4ad80";
    ctx.font = "500 11px DM Mono, monospace";
    ctx.fillText(customRules, width / 2 - panelWidth / 2 + 24, height / 2 + 127);
  }
}
