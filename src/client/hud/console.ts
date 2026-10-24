import { GAME_CONFIG } from "../../shared/config.js";
import type { Frigate } from "../../shared/sim.js";
import { mapDimensions } from "../../shared/world.js";
import { colours, ctx } from "../dom.js";
import { feed, incomeNumbers } from "../gameEvents.js";
import { drawRadar } from "./radarView.js";
import { drawFullScoreboard } from "./scoreboard.js";
import { drawMenu } from "../menu.js";
import { RADAR } from "../radar.js";
import { client, type Snapshot } from "../state.js";

export function drawConsoleDial(
  centerX: number,
  topY: number,
  label: string,
  value: string,
  fraction: number,
  arcColor: string,
  numberColor: string,
  fontSize: number,
): void {
  const centerY = topY + 32;
  const startAngle = 135 * Math.PI / 180;
  const endAngle = startAngle + 270 * Math.PI / 180;
  ctx.save();
  ctx.lineWidth = 6;
  ctx.lineCap = "butt";
  ctx.strokeStyle = "rgba(215, 237, 238, .17)";
  ctx.beginPath();
  ctx.arc(centerX, centerY, 27, startAngle, endAngle);
  ctx.stroke();
  ctx.strokeStyle = arcColor;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 27, startAngle, startAngle + (endAngle - startAngle) * Math.max(0, Math.min(1, fraction)));
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = numberColor;
  ctx.font = `600 ${fontSize}px DM Mono, monospace`;
  ctx.fillText(value, centerX, centerY + 6);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#90a8b0";
  ctx.font = "500 10px DM Mono, monospace";
  ctx.fillText(label, centerX, topY + 68);
  ctx.restore();
}

export function drawWeaponTile(
  x: number,
  y: number,
  label: string,
  count: number,
  capacity: number,
  readyAt: number,
  reloadTime: number,
  now: number,
): void {
  const tileWidth = 150;
  const tileHeight = 54;
  const empty = count < 1;
  const remaining = Math.max(0, readyAt - now);
  const reloading = !empty && remaining > 0;
  const countColor = empty
    ? "#ff776c"
    : count / capacity < 0.2
      ? "#ffb347"
      : "#e8f4f4";
  const status = empty ? "EMPTY" : reloading ? `${remaining.toFixed(1)} s` : "READY";
  const statusColor = empty ? "#ff776c" : reloading ? "#d7e5e9" : "#62d3b2";
  const reloadFraction = empty
    ? 0
    : reloading
      ? Math.max(0, Math.min(1, 1 - remaining / reloadTime))
      : 1;

  ctx.save();
  ctx.fillStyle = "rgba(215, 237, 238, .06)";
  ctx.fillRect(x, y, tileWidth, tileHeight);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#90a8b0";
  ctx.font = "500 10px DM Mono, monospace";
  ctx.fillText(label, x + 9, y + 7);
  ctx.textAlign = "right";
  ctx.fillStyle = statusColor;
  ctx.fillText(status, x + tileWidth - 9, y + 7);
  ctx.textAlign = "left";
  ctx.fillStyle = countColor;
  ctx.font = "600 20px DM Mono, monospace";
  const displayedCount = String(Math.floor(count));
  ctx.fillText(displayedCount, x + 9, y + 20);
  const countWidth = ctx.measureText(displayedCount).width;
  ctx.fillStyle = "#90a8b0";
  ctx.font = "500 11px DM Mono, monospace";
  ctx.fillText(` /${capacity}`, x + 9 + countWidth, y + 28);
  ctx.fillStyle = "rgba(215, 237, 238, .17)";
  ctx.fillRect(x, y + tileHeight - 3, tileWidth, 3);
  if (reloadFraction > 0) {
    ctx.fillStyle = reloading ? "#d7e5e9" : "#62d3b2";
    ctx.fillRect(x, y + tileHeight - 3, tileWidth * reloadFraction, 3);
  }
  ctx.restore();
}

export function drawHud(snapshot: Snapshot, frigate: Frigate | undefined, now: number, logicalWidth: number, logicalHeight: number): void {
  const hudMargin = 8;
  const captainsPanelX = logicalWidth - hudMargin - 230;
  const captainsPanelY = hudMargin;
  const consolePanelX = hudMargin;
  const consolePanelHeight = 140;
  const consolePanelY = logicalHeight - hudMargin - consolePanelHeight;
  ctx.save();
  if (client.round?.phase === "playing" && client.round.endsAt !== null) {
    const seconds = Math.max(0, Math.ceil(client.round.endsAt - now));
    const timerColor = seconds < 10 ? "#ff776c" : seconds < 60 ? "#ffb347" : "#e8f4f4";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = timerColor;
    ctx.font = "600 17px DM Mono, monospace";
    ctx.fillText(`${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`, logicalWidth / 2, 15);
  }
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(5, 20, 29, .72)";
  const teamScores = snapshot.players.reduce((scores, player) => {
    scores[player.team] = (scores[player.team] ?? 0) + player.score;
    return scores;
  }, [...snapshot.teamBonus]);
  const teams = [...new Set(snapshot.players.map((player) => player.team))]
    .sort((a, b) => (teamScores[b] ?? 0) - (teamScores[a] ?? 0) || a - b);
  const grouped = teams.some((team) => snapshot.players.filter((player) => player.team === team).length >= 2);
  const rowCount = snapshot.players.length + (grouped ? teams.length : 0);
  const desiredRowHeight = grouped ? 27 : 34;
  const radarTop = logicalHeight - RADAR.margin - RADAR.radius * 2;
  const maxPanelHeight = Math.max(48, radarTop - captainsPanelY - 8);
  const panelHeight = Math.min(38 + rowCount * desiredRowHeight, maxPanelHeight);
  const rowHeight = (panelHeight - 38) / Math.max(1, rowCount);
  ctx.fillRect(captainsPanelX, captainsPanelY, 230, panelHeight);
  ctx.fillStyle = "#88a7b0";
  ctx.font = "500 10px DM Mono, monospace";
  ctx.fillText("CAPTAINS", captainsPanelX + 18, captainsPanelY + 11);
  let row = 0;
  const drawCaptain = (player: Snapshot["players"][number]) => {
    const y = captainsPanelY + 34 + row * rowHeight;
    row += 1;
    const own = player.playerId === client.ownId;
    if (own) {
      ctx.fillStyle = "rgba(100, 223, 202, .12)";
      ctx.fillRect(captainsPanelX + 10, y - 2, 210, Math.max(1, rowHeight - 2));
    }
    ctx.fillStyle = colours[player.team] ?? "#fff";
    ctx.beginPath();
    ctx.arc(captainsPanelX + 24, y + rowHeight / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    const nameColor = own ? "#f0fffa" : "#d7e5e9";
    ctx.fillStyle = nameColor;
    ctx.font = `${own ? 700 : 500} 12px Manrope, sans-serif`;
    ctx.fillText(`${player.host ? "♛ " : ""}${player.name}`, captainsPanelX + 35, y + rowHeight / 2 - 7);
    ctx.textAlign = "right";
    ctx.fillStyle = nameColor;
    ctx.fillText(`${teamScores[player.team] ?? 0}`, captainsPanelX + 218, y + rowHeight / 2 - 7);
    ctx.textAlign = "left";
  };
  if (grouped) {
    for (const team of teams) {
      const y = captainsPanelY + 34 + row * rowHeight;
      row += 1;
      ctx.fillStyle = colours[team] ?? "#fff";
      ctx.font = "700 11px DM Mono, monospace";
      ctx.fillText(`${GAME_CONFIG.teams.names[team]} · ${teamScores[team] ?? 0}`, captainsPanelX + 16, y + rowHeight / 2 - 6);
      snapshot.players
        .filter((player) => player.team === team)
        .sort((a, b) => a.slot - b.slot)
        .forEach(drawCaptain);
    }
  } else {
    snapshot.players
      .slice()
      .sort((a, b) => a.team - b.team || a.slot - b.slot)
      .forEach(drawCaptain);
  }
  if (frigate) {
    ctx.fillStyle = "rgba(5, 20, 29, .78)";
    ctx.fillRect(consolePanelX, consolePanelY, 440, consolePanelHeight);
    const hullX = consolePanelX + 14;
    const fuelX = hullX + 78 + 14;
    const weaponsX = fuelX + 78 + 14;
    const throttleX = weaponsX + 150 + 14;
    const dialY = consolePanelY + 12;
    const hullFraction = Math.max(0, Math.min(1, frigate.hp / GAME_CONFIG.player.maxHp));
    const hullColor = frigate.hp <= 35 ? "#ff776c" : "#62d3b2";
    drawConsoleDial(
      hullX + 39,
      dialY,
      "HULL",
      String(Math.ceil(frigate.hp)),
      hullFraction,
      hullColor,
      frigate.hp <= 35 ? "#ff776c" : "#e8f4f4",
      17,
    );
    const fuelCapacity = client.gameSettings.fuelCrossings * mapDimensions(client.gameSettings.mapSize).width;
    const fuelFraction = Math.max(0, Math.min(1, frigate.fuel / fuelCapacity));
    const fuelColor = frigate.fuel <= 0
      ? "#ff776c"
      : fuelFraction < 0.2
        ? "#ffb347"
        : "#62d3b2";
    const fuelNumberColor = frigate.fuel <= 0
      ? "#ff776c"
      : fuelFraction < 0.2
        ? "#ffb347"
        : "#e8f4f4";
    drawConsoleDial(
      fuelX + 39,
      dialY,
      "FUEL",
      `${Math.floor(fuelFraction * 100)}%`,
      fuelFraction,
      fuelColor,
      fuelNumberColor,
      15,
    );
    drawWeaponTile(weaponsX, consolePanelY + 12, "CANNON", frigate.shells, client.gameSettings.shells, frigate.cannonReadyAt, client.gameSettings.cannonReload, now);
    drawWeaponTile(
      weaponsX,
      consolePanelY + 12 + 54 + 8,
      "TORPEDO",
      frigate.torpedoes,
      client.gameSettings.torpedoes,
      frigate.torpedoReadyAt,
      client.gameSettings.torpedoReload,
      now,
    );
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#90a8b0";
    ctx.font = "500 10px DM Mono, monospace";
    ctx.fillText("THROTTLE", throttleX + 32, consolePanelY + 12);
    const steps = ["FULL", "2/3", "1/3", "STOP", "ASTERN"];
    const activeStep = 3 - client.throttleLevel;
    const stepY = consolePanelY + 26;
    const stepHeight = 18;
    const stepGap = 3;
    steps.forEach((label, index) => {
      const y = stepY + index * (stepHeight + stepGap);
      const selected = index === activeStep;
      ctx.fillStyle = selected ? "rgba(100, 223, 202, .3)" : "rgba(215, 237, 238, .08)";
      ctx.fillRect(throttleX, y, 64, stepHeight);
      ctx.fillStyle = selected ? "#bfffee" : "#91a8ae";
      ctx.font = "600 10px DM Mono, monospace";
      ctx.fillText(label, throttleX + 32, y + 4);
    });
    ctx.restore();
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }
  const feedNow = performance.now();
  const visibleFeed = feed.filter((entry) => feedNow - entry.at < 5000).slice(-5);
  ctx.textAlign = "left";
  visibleFeed.forEach((entry, index) => {
    const alpha = Math.min(1, (5000 - (feedNow - entry.at)) / 1000);
    ctx.globalAlpha = alpha;
    ctx.font = "500 12px Manrope, sans-serif";
    ctx.fillStyle = "#e4f2f3";
    ctx.fillText(entry.text, 20, 27 + index * 20);
  });
  ctx.globalAlpha = 1;
  if (frigate && frigate.status !== "alive") {
    const own = snapshot.frigates.find((candidate) => candidate.playerId === client.ownId);
    const selfSunk = own?.lastDamageSource === client.ownId;
    const killer = own?.lastDamageSource ? snapshot.players.find((player) => player.playerId === own.lastDamageSource)?.name ?? "the sea" : "the sea";
    const countdown = Math.max(0, frigate.respawnAt - now);
    ctx.fillStyle = "rgba(2, 12, 18, .62)";
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    ctx.textAlign = "center";
    ctx.fillStyle = "#f3f7f6";
    ctx.font = "800 34px Manrope, sans-serif";
    ctx.fillText(selfSunk ? "You sank your own frigate" : `Sunk by ${killer}`, logicalWidth / 2, logicalHeight / 2 - 28);
    ctx.fillStyle = "#a4bdc4";
    ctx.font = "500 14px DM Mono, monospace";
    ctx.fillText(`RESPAWNING IN ${countdown.toFixed(1)}s`, logicalWidth / 2, logicalHeight / 2 + 22);
  }
  if (client.round?.phase === "over") {
    const round = client.round;
    const grouped = round.results.some((result) =>
      round.results.filter((other) => other.team === result.team).length >= 2,
    );
    const winningTeams = round.winnerTeams.map((team) => GAME_CONFIG.teams.names[team]).filter((name) => name !== undefined);
    const winnerNames = round.winners
      .map((id) => round.results.find((result) => result.playerId === id)?.name)
      .filter((name): name is string => name !== undefined);
    const winnerLine = grouped
      ? winningTeams.length === 0
        ? "Draw"
        : `${winningTeams.join(" and ")} team${winningTeams.length === 1 ? "" : "s"} ${winningTeams.length === 1 ? "wins" : "win"}!`
      : winnerNames.length === 0
        ? "Draw"
        : `${winnerNames.length > 1 ? `${winnerNames.slice(0, -1).join(", ")} and ` : ""}${winnerNames.at(-1)} ${winnerNames.length === 1 ? "wins" : "win"}!`;
    const panelWidth = Math.min(900, logicalWidth - 48);
    const left = (logicalWidth - panelWidth) / 2;
    const top = logicalHeight / 2 - 230;
    ctx.fillStyle = "rgba(2, 12, 18, .84)";
    ctx.fillRect(left, top, panelWidth, 460);
    ctx.textAlign = "center";
    ctx.fillStyle = "#6be0cf";
    ctx.font = "800 22px Manrope, sans-serif";
    ctx.fillText("ROUND OVER", logicalWidth / 2, top + 24);
    ctx.fillStyle = "#f3f7f6";
    ctx.font = "700 18px Manrope, sans-serif";
    ctx.fillText(winnerLine, logicalWidth / 2, top + 62);
    const columns = [left + 38, left + 490, left + 560, left + 630, left + 750, left + 850];
    const headers = ["CAPTAIN", "SCORE", "SINKS", "DEATHS", "ACCURACY", "BASES"];
    ctx.font = "500 10px DM Mono, monospace";
    ctx.fillStyle = "#9bb6bf";
    headers.forEach((header, index) => {
      ctx.textAlign = index === 0 ? "left" : "right";
      ctx.fillText(header, columns[index] ?? left, top + 112);
    });
    const drawResult = (result: typeof round.results[number], y: number, score: number) => {
      if (result.playerId === client.ownId) {
        ctx.fillStyle = "rgba(96, 224, 203, .15)";
        ctx.fillRect(left + 24, y - 8, panelWidth - 48, 34);
      }
      ctx.textAlign = "left";
      ctx.fillStyle = colours[result.team] ?? "#fff";
      ctx.font = "600 13px Manrope, sans-serif";
      ctx.fillText(result.name, columns[0] ?? left, y);
      const values = [score, result.sinks, result.deaths, result.shots ? `${Math.round(result.hits / result.shots * 100)}%` : "—", result.bases];
      ctx.fillStyle = "#e5f1f2";
      ctx.font = "12px DM Mono, monospace";
      values.forEach((value, valueIndex) => {
        ctx.textAlign = "right";
        ctx.fillText(String(value), columns[valueIndex + 1] ?? left, y);
      });
    };
    if (grouped) {
      const teams = [...new Set(round.results.map((result) => result.team))]
        .sort((a, b) => (round.teamScores[b] ?? 0) - (round.teamScores[a] ?? 0) || a - b);
      let y = top + 143;
      for (const team of teams) {
        ctx.textAlign = "left";
        ctx.fillStyle = colours[team] ?? "#fff";
        ctx.font = "700 11px DM Mono, monospace";
        ctx.fillText(`${GAME_CONFIG.teams.names[team]} TEAM · ${round.teamScores[team] ?? 0}`, columns[0] ?? left, y);
        y += 25;
        round.results
          .filter((result) => result.team === team)
          .sort((a, b) => b.score - a.score || b.sinks - a.sinks || a.deaths - b.deaths)
          .forEach((result) => {
            drawResult(result, y, result.score);
            y += 34;
          });
      }
    } else {
      round.results
        .slice()
        .sort((a, b) => (round.teamScores[b.team] ?? 0) - (round.teamScores[a.team] ?? 0) || b.sinks - a.sinks || a.deaths - b.deaths)
        .forEach((result, index) => drawResult(result, top + 143 + index * 48, round.teamScores[result.team] ?? 0));
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "#a4bdc4";
    ctx.font = "500 13px DM Mono, monospace";
    ctx.fillText(`New round in ${Math.max(0, Math.ceil(round.nextRoundAt - now))} s`, logicalWidth / 2, top + 420);
  }
  if (client.tabHeld) drawFullScoreboard(snapshot, logicalWidth, logicalHeight);
  if (client.menuOpen) drawMenu(snapshot, logicalWidth, logicalHeight);
  if (client.debugVisible) {
    ctx.fillStyle = "rgba(4, 14, 21, .78)";
    ctx.fillRect(20, logicalHeight - 148, 190, 52);
    ctx.fillStyle = "#89f2db";
    ctx.font = "11px DM Mono, monospace";
    ctx.fillText(`FPS ${client.fps.toFixed(0)}`, 32, logicalHeight - 135);
    ctx.fillText(`PING ${client.ping.toFixed(0)} ms`, 32, logicalHeight - 118);
    ctx.fillText(`TICK ${snapshot.tick}`, 32, logicalHeight - 101);
  }
  ctx.restore();
  if (frigate && frigate.status !== "waiting") drawRadar(snapshot, frigate, now, logicalWidth, logicalHeight);
}
