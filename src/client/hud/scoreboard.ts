import { GAME_CONFIG } from "../../shared/config.js";
import { DEFAULT_SETTINGS, describeSettingsChanges } from "../../shared/settings.js";
import { colours, ctx } from "../dom.js";
import { client, type Snapshot } from "../state.js";

export function drawFullScoreboard(snapshot: Snapshot, width: number, height: number): void {
  const changes = describeSettingsChanges(DEFAULT_SETTINGS, client.gameSettings);
  const customRules = changes.length > 0 ? `CUSTOM RULES · ${changes.join(" · ")}` : "";
  ctx.font = "500 11px DM Mono, monospace";
  const hasEconomy = client.gameSettings.treasures;
  const panelWidth = Math.min(width - 32, Math.max(hasEconomy ? 690 : 490, customRules ? ctx.measureText(customRules).width + 48 : 490));
  const panelHeight = customRules ? 360 : 320;
  ctx.fillStyle = "rgba(3, 13, 20, .84)";
  ctx.fillRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight);
  ctx.fillStyle = "#9bb6bf";
  ctx.textAlign = "left";
  ctx.fillText("WATERSIDE SCOREBOARD", width / 2 - 215, height / 2 - 128);
  ctx.fillStyle = "#829ca4";
  ctx.font = "10px DM Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText("PTS", width / 2 - 92, height / 2 - 104);
  ctx.textAlign = "center";
  ctx.fillText("BASES", width / 2 - 30, height / 2 - 104);
  ctx.textAlign = "right";
  ctx.fillText("SUNK", width / 2 + 34, height / 2 - 104);
  if (hasEconomy) {
    ctx.fillText("$", width / 2 + 125, height / 2 - 104);
    ctx.textAlign = "center";
    ctx.fillText("UPGRADES", width / 2 + 265, height / 2 - 104);
  }
  const teamScores = snapshot.players.reduce((scores, player) => {
    scores[player.team] = (scores[player.team] ?? 0) + player.score;
    return scores;
  }, [...snapshot.teamBonus]);
  const grouped = snapshot.players.some((player) => snapshot.players.filter((other) => other.team === player.team).length >= 2);
  const teams = [...new Set(snapshot.players.map((player) => player.team))]
    .sort((a, b) => (teamScores[b] ?? 0) - (teamScores[a] ?? 0));
  let row = 0;
  const drawPlayer = (player: Snapshot["players"][number], compact: boolean) => {
    const y = height / 2 - 89 + row * (compact ? 29 : 48);
    row += 1;
    ctx.fillStyle = player.playerId === client.ownId ? "rgba(96, 224, 203, .13)" : "rgba(225, 243, 244, .04)";
    ctx.fillRect(width / 2 - (panelWidth - 30) / 2, y - 7, panelWidth - 30, compact ? 26 : 38);
    ctx.fillStyle = colours[player.team] ?? "#fff";
    ctx.beginPath();
    ctx.arc(width / 2 - 203, y + 5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e5f1f2";
    ctx.font = "600 14px Manrope, sans-serif";
    ctx.fillText(`${player.host ? "♛ " : ""}${player.name}`, width / 2 - panelWidth / 2 + 24, y + 2);
    ctx.textAlign = "right";
    ctx.font = "12px DM Mono, monospace";
    const baseCount = client.bases.filter((base) => base.active && base.ownerTeam === player.team).length;
    ctx.fillText(`${teamScores[player.team] ?? 0}`, width / 2 - 92, y + 4);
    ctx.textAlign = "center";
    ctx.fillText(`${baseCount}`, width / 2 - 30, y + 4);
    ctx.textAlign = "right";
    ctx.fillText(`${player.sunk}`, width / 2 + 34, y + 4);
    if (hasEconomy) {
      const economy = snapshot.economy?.players.find((entry) => entry.playerId === player.playerId);
      ctx.fillStyle = GAME_CONFIG.economy.feedback.gold;
      ctx.fillText(`${economy?.money ?? 0}`, width / 2 + 125, y + 4);
      const levels = economy?.upgrades;
      const levelText = levels
        ? `S${levels.speed} R${levels.cannonRange} H${levels.hull} C${levels.cannonDamage} TS${levels.torpedoSpeed} TD${levels.torpedoDamage}`
        : "S0 R0 H0 C0 TS0 TD0";
      ctx.textAlign = "center";
      ctx.font = "9px DM Mono, monospace";
      ctx.fillStyle = "#d7e5e9";
      ctx.fillText(levelText, width / 2 + 265, y + 4);
    }
    ctx.textAlign = "left";
  };
  if (grouped) {
    for (const team of teams) {
      ctx.fillStyle = colours[team] ?? "#fff";
      ctx.font = "700 11px DM Mono, monospace";
      ctx.fillText(`${GAME_CONFIG.teams.names[team]} TEAM · ${teamScores[team] ?? 0}`, width / 2 - 215, height / 2 - 87 + row * 29);
      row += 1;
      snapshot.players.filter((player) => player.team === team).sort((a, b) => b.score - a.score).forEach((player) => drawPlayer(player, true));
    }
  } else {
    snapshot.players.slice().sort((a, b) => (teamScores[b.team] ?? 0) - (teamScores[a.team] ?? 0) || a.sunk - b.sunk).forEach((player) => drawPlayer(player, false));
  }
  if (customRules) {
    ctx.fillStyle = "#e4ad80";
    ctx.font = "500 11px DM Mono, monospace";
    ctx.fillText(customRules, width / 2 - panelWidth / 2 + 24, height / 2 + 127);
  }
}
