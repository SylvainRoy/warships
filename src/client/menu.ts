import { GAME_CONFIG } from "../shared/config.js";
import { BOT_SKILL_LABELS, DEFAULT_SETTINGS, formatMapSize, SETTINGS_LIMITS, type GameSettings } from "../shared/settings.js";
import {
  CONTROL_ACTIONS,
  DEFAULT_BINDINGS,
  loadBindings,
  RESERVED_CODES,
  serializeBindings,
  bindingLabel,
} from "./controls.js";
import { ctx } from "./dom.js";
import { saveEffectsSettings } from "./gameEvents.js";
import { applyBindings, pressed, refreshKeyboardLayout } from "./input.js";
import { sendHost } from "./net.js";
import { client, type Snapshot } from "./state.js";

export const settingsRows: Array<{ key: keyof GameSettings; label: string }> = [
  { key: "boatSpeedPct", label: "Boat speed" },
  { key: "rotationPct", label: "Rotation speed" },
  { key: "cannonRotationPct", label: "Cannon rotation" },
  { key: "torpedoRotationPct", label: "Torpedo rotation" },
  { key: "shellSpeedPct", label: "Shell speed" },
  { key: "torpedoSpeedPct", label: "Torpedo speed" },
  { key: "cannonReload", label: "Cannon reload" },
  { key: "torpedoReload", label: "Torpedo reload" },
  { key: "landCoveragePct", label: "Land coverage" },
  { key: "mapSize", label: "Map size" },
  { key: "neutralBases", label: "Neutral bases" },
  { key: "fuelCrossings", label: "Fuel" },
  { key: "shells", label: "Shells" },
  { key: "torpedoes", label: "Torpedoes" },
  { key: "resupplyTime", label: "Resupply time" },
  { key: "captureTime", label: "Capture time" },
  { key: "repairTime", label: "Repair time" },
  { key: "baseIncomeInterval", label: "Base income" },
  { key: "bots", label: "Bots" },
  { key: "botSkill", label: "Bot skill" },
  { key: "roundMinutes", label: "Round length" },
];

function kickablePlayers(snapshot: Snapshot) {
  return snapshot.players
    .filter((player) => player.playerId !== client.ownId
      && !client.lobbyState?.players.some((lobbyPlayer) => lobbyPlayer.playerId === player.playerId && lobbyPlayer.bot))
    .sort((a, b) => a.slot - b.slot);
}

export function isOwnHost(snapshot: Snapshot | null = client.latestSnapshot): boolean {
  return Boolean(snapshot?.players.find((player) => player.playerId === client.ownId)?.host);
}

export function drawMenu(snapshot: Snapshot, width: number, height: number): void {
  const host = snapshot.players.find((player) => player.playerId === client.ownId)?.host ?? false;
  if (!host && client.menuPending && client.menuPending.action !== "controls" && client.menuPending.action !== "effects") client.menuPending = null;
  const controlsPending = client.menuPending?.action === "controls" ? client.menuPending : null;
  const effectsPending = client.menuPending?.action === "effects" ? client.menuPending : null;
  const left = width / 2 - 184;
  const centerY = height / 2;
  const panelWidth = controlsPending || effectsPending ? 520 : 440;
  const settingsView = client.menuPending?.action === "settings";
  const panelHeight = controlsPending ? 560 : effectsPending ? 260 : settingsView ? 540 : 350;
  const panelTop = settingsView ? centerY - 230 : centerY - panelHeight / 2;
  ctx.fillStyle = "rgba(3, 13, 20, .88)";
  ctx.fillRect(width / 2 - panelWidth / 2, panelTop, panelWidth, panelHeight);
  ctx.fillStyle = "#eff8f6";
  ctx.font = "800 20px Manrope, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(
    controlsPending ? "PLAYER CONTROLS" : effectsPending ? "SOUND & EFFECTS" : host ? "HOST CONTROL" : "MENU",
    left,
    centerY - (controlsPending ? 242 : effectsPending ? 100 : 142),
  );
  ctx.fillStyle = "#9bb4bb";
  ctx.font = "12px Manrope, sans-serif";
  if (controlsPending) {
    const selected = CONTROL_ACTIONS[controlsPending.index];
    const hint = controlsPending.capturing
      ? controlsPending.hint || `Press a key for ${selected?.label ?? "action"}… Esc cancels`
      : controlsPending.hint || "Choose a row to change its binding.";
    ctx.fillText(hint, width / 2 - 236, centerY - 212);
    CONTROL_ACTIONS.forEach(({ action, label }, index) => {
      const y = centerY - 174 + index * 24;
      const selectedRow = index === controlsPending.index;
      const changed = client.bindings[action].length !== DEFAULT_BINDINGS[action].length
        || client.bindings[action].some((code, codeIndex) => code !== DEFAULT_BINDINGS[action][codeIndex]);
      if (selectedRow) {
        ctx.fillStyle = "rgba(107, 224, 207, .14)";
        ctx.fillRect(width / 2 - 236, y - 5, 472, 22);
      }
      ctx.fillStyle = selectedRow ? "#6be0cf" : "#d7e5e9";
      ctx.font = "600 12px Manrope, sans-serif";
      ctx.fillText(`${selectedRow ? "▸" : " "}  ${label}`, width / 2 - 228, y);
      ctx.textAlign = "right";
      ctx.fillStyle = changed ? "#e4ad80" : "#d7e5e9";
      ctx.font = "500 12px DM Mono, monospace";
      const value = controlsPending.capturing && selectedRow
        ? "…"
        : bindingLabel(client.bindings[action], client.keyboardLayout);
      ctx.fillText(value, width / 2 + 228, y);
      ctx.textAlign = "left";
    });
    ctx.fillStyle = "#8ea9b0";
    ctx.font = "10px DM Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText("↑↓ select · Enter change · D defaults · Esc back", width / 2, centerY + 256);
    ctx.textAlign = "left";
    return;
  }
  if (effectsPending) {
    ctx.fillText("Changes apply immediately and stay in this browser.", width / 2 - 236, centerY - 70);
    const rows = [
      { label: "Volume", value: `${client.effectsSettings.volume}%` },
      { label: "Screen shake", value: client.effectsSettings.shake ? "On" : "Off" },
    ];
    rows.forEach((row, index) => {
      const y = centerY - 25 + index * 42;
      const selected = index === effectsPending.index;
      if (selected) {
        ctx.fillStyle = "rgba(107, 224, 207, .14)";
        ctx.fillRect(width / 2 - 236, y - 7, 472, 28);
      }
      ctx.fillStyle = selected ? "#6be0cf" : "#d7e5e9";
      ctx.font = "600 14px Manrope, sans-serif";
      ctx.fillText(`${selected ? "▸" : " "}  ${row.label}`, width / 2 - 228, y);
      ctx.textAlign = "right";
      ctx.fillStyle = "#d7e5e9";
      ctx.font = "500 13px DM Mono, monospace";
      ctx.fillText(row.value, width / 2 + 228, y);
      ctx.textAlign = "left";
    });
    ctx.fillStyle = "#8ea9b0";
    ctx.font = "10px DM Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText("↑↓ SELECT · ←→ CHANGE · ESC BACK", width / 2, centerY + 104);
    ctx.textAlign = "left";
    return;
  }
  const mapChanged = client.menuPending?.action === "settings"
    && (client.menuPending.draft.landCoveragePct !== client.gameSettings.landCoveragePct
      || client.menuPending.draft.mapSize !== client.gameSettings.mapSize
      || client.menuPending.draft.neutralBases !== client.gameSettings.neutralBases);
  ctx.fillText(
    mapChanged
      ? "Enter: apply + new map"
      : client.menuPending?.action === "settings"
        ? "Adjust values for this battle."
        : host
          ? "Host actions · Controls for every captain."
          : "Configure your controls or return to battle.",
    left,
    centerY - 112,
  );
  if (client.menuPending?.action === "settings") {
    const pending = client.menuPending;
    settingsRows.forEach((row, index) => {
      const y = centerY - 85 + index * 18;
      const selected = index === pending.index;
      const value = pending.draft[row.key];
      if (selected) {
        ctx.fillStyle = "rgba(107, 224, 207, .14)";
        ctx.fillRect(width / 2 - 200, y - 5, 400, 20);
      }
      ctx.fillStyle = selected ? "#6be0cf" : "#d7e5e9";
      ctx.font = "600 12px Manrope, sans-serif";
      ctx.fillText(`${selected ? "▸" : " "}  ${row.label}`, left, y);
      ctx.textAlign = "right";
      ctx.fillStyle = value !== DEFAULT_SETTINGS[row.key] ? "#e4ad80" : "#d7e5e9";
      ctx.font = "500 12px DM Mono, monospace";
      const displayedValue = row.key === "mapSize"
        ? formatMapSize(value)
        : row.key === "baseIncomeInterval"
          ? value === 0 ? "Off" : `every ${value} s`
        : row.key === "bots"
          ? `${value}`
        : row.key === "botSkill"
          ? BOT_SKILL_LABELS[value] ?? `${value}`
        : row.key === "roundMinutes"
          ? value === 0 ? "Endless" : `${value} min`
        : row.key === "cannonReload" || row.key === "torpedoReload" || row.key === "resupplyTime" || row.key === "captureTime" || row.key === "repairTime"
          ? `${value.toFixed(1).replace(/\.0$/, "")} s`
          : row.key === "neutralBases" || row.key === "shells" || row.key === "torpedoes"
            ? `${value}`
            : row.key === "fuelCrossings"
              ? `${value} crossings`
              : `${value}%`;
      ctx.fillText(
        displayedValue,
        left + 368,
        y,
      );
      ctx.textAlign = "left";
    });
  } else if (client.menuPending?.action === "kickSelect") {
    ctx.fillStyle = "#e4ad80";
    ctx.fillText("Select a player to kick:", left, centerY - 65);
    const players = kickablePlayers(snapshot);
    players.forEach((player, index) => {
        ctx.fillText(`${index + 1}  ${player.name}`, left, centerY - 35 + index * 24);
      });
    if (players.length === 0) ctx.fillText("No human players available.", left, centerY - 35);
  } else if (client.menuPending) {
    ctx.fillStyle = client.menuPending.action === "kick" ? "#e4ad80" : "#6be0cf";
    const question = client.menuPending.action === "regenerate"
      ? "Regenerate the world? All frigates respawn; scores are kept."
      : client.menuPending.action === "resetScores"
        ? "Reset all scores and sunk counts?"
        : client.menuPending.action === "kick" ? `Kick ${client.menuPending.name}?` : "";
    ctx.fillText(question, left, centerY - 65);
  } else if (host) {
    ctx.fillStyle = "#6be0cf";
    ctx.fillText("R  Regenerate world", left, centerY - 65);
    ctx.fillText("X  Reset scores", left, centerY - 35);
    ctx.fillStyle = "#e4ad80";
    ctx.fillText("K  Kick player", left, centerY - 5);
    ctx.fillStyle = "#6be0cf";
    ctx.fillText("S  Settings", left, centerY + 25);
    ctx.fillText("C  Controls", left, centerY + 55);
    ctx.fillText("V  Sound & effects", left, centerY + 85);
  } else {
    ctx.fillStyle = "#6be0cf";
    ctx.fillText("C  Controls", left, centerY - 65);
    ctx.fillText("V  Sound & effects", left, centerY - 35);
  }
  ctx.fillStyle = "#8ea9b0";
  ctx.font = "10px DM Mono, monospace";
  const footer = client.menuPending?.action === "settings"
    ? "↑↓ SELECT · ←→ CHANGE · D DEFAULTS · ENTER APPLY · ESC BACK"
    : client.menuPending?.action === "kickSelect"
      ? "ESC BACK"
      : client.menuPending
        ? "ENTER CONFIRM · ESC CANCEL"
        : host
          ? "C CONTROLS · V SOUND & EFFECTS · ESC CLOSE"
          : "C CONTROLS · V SOUND & EFFECTS · ESC CLOSE";
  ctx.textAlign = "center";
  ctx.fillText(footer, width / 2, centerY + (client.menuPending?.action === "settings" ? 288 : 140));
  ctx.textAlign = "left";
}

export function registerMenuKeyListener(): void {
window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (!client.joined || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || !client.menuOpen) return;
  if (event.code === "Escape") return;
  if (!isOwnHost() && client.menuPending && client.menuPending.action !== "controls" && client.menuPending.action !== "effects") client.menuPending = null;

  if (client.menuPending?.action === "effects") {
    const effectsPending = client.menuPending;
    const isArrow = event.code === "ArrowUp" || event.code === "ArrowDown"
      || event.code === "ArrowLeft" || event.code === "ArrowRight";
    if (isArrow) event.preventDefault();
    if ((event.code === "ArrowUp" || event.code === "ArrowDown") && !event.repeat) {
      const direction = event.code === "ArrowUp" ? -1 : 1;
      client.menuPending = { ...effectsPending, index: Math.max(0, Math.min(1, effectsPending.index + direction)) };
    } else if ((event.code === "ArrowLeft" || event.code === "ArrowRight") && !event.repeat) {
      const direction = event.code === "ArrowLeft" ? -1 : 1;
      if (effectsPending.index === 0) {
        saveEffectsSettings({
          ...client.effectsSettings,
          volume: Math.max(0, Math.min(100, client.effectsSettings.volume + direction * GAME_CONFIG.effects.volumeStep)),
        });
      } else {
        saveEffectsSettings({ ...client.effectsSettings, shake: !client.effectsSettings.shake });
      }
    }
    return;
  }

  if (client.menuPending?.action === "controls") {
    if (client.menuPending.capturing || event.repeat) return;
    if (event.code === "ArrowUp" || event.code === "ArrowDown") {
      event.preventDefault();
      const direction = event.code === "ArrowUp" ? -1 : 1;
      client.menuPending = {
        ...client.menuPending,
        index: (client.menuPending.index + direction + CONTROL_ACTIONS.length) % CONTROL_ACTIONS.length,
        hint: "",
      };
    } else if (event.code === "Enter" || event.code === "NumpadEnter") {
      event.preventDefault();
      void refreshKeyboardLayout();
      client.menuPending = { ...client.menuPending, capturing: true, hint: "" };
    } else if (event.code === "KeyD") {
      event.preventDefault();
      applyBindings(loadBindings(serializeBindings(DEFAULT_BINDINGS)));
      client.menuPending = { ...client.menuPending, hint: "" };
    }
    return;
  }

  const settingsPending = client.menuPending?.action === "settings" ? client.menuPending : null;
  const isSettingsArrow = event.code === "ArrowUp" || event.code === "ArrowDown"
    || event.code === "ArrowLeft" || event.code === "ArrowRight";
  if (settingsPending && isSettingsArrow) {
    event.preventDefault();
    if ((event.code === "ArrowUp" || event.code === "ArrowDown") && event.repeat) return;
    const direction = event.code === "ArrowUp" || event.code === "ArrowLeft" ? -1 : 1;
    if (event.code === "ArrowUp" || event.code === "ArrowDown") {
      client.menuPending = {
        ...settingsPending,
        index: Math.max(0, Math.min(settingsRows.length - 1, settingsPending.index + direction)),
      };
      return;
    }
    const row = settingsRows[settingsPending.index];
    if (!row) return;
    const limits = SETTINGS_LIMITS[row.key];
    const currentSteps = Math.round((settingsPending.draft[row.key] - limits.min) / limits.step);
    const totalSteps = Math.round((limits.max - limits.min) / limits.step);
    const value = Number((limits.min + Math.max(0, Math.min(totalSteps, currentSteps + direction)) * limits.step).toFixed(6));
    client.menuPending = { ...settingsPending, draft: { ...settingsPending.draft, [row.key]: value } };
    return;
  }

  if (event.repeat) return;
  const digit = /^(?:Digit|Numpad)([1-3])$/.exec(event.code);
  const isEnter = event.code === "Enter" || event.code === "NumpadEnter";
  if (isEnter || digit || (settingsPending && event.code === "KeyD")) event.preventDefault();
  if (settingsPending) {
    if (event.code === "KeyD") {
      client.menuPending = { ...settingsPending, draft: { ...DEFAULT_SETTINGS } };
      return;
    }
    if (isEnter) {
      sendHost("settings", { ...settingsPending.draft });
      client.menuPending = null;
      client.menuOpen = false;
    }
    return;
  }
  if (client.menuPending) {
    if (client.menuPending.action === "kickSelect" && digit && client.latestSnapshot) {
      const targetPlayer = kickablePlayers(client.latestSnapshot)[Number(digit[1]) - 1];
      if (targetPlayer) client.menuPending = { action: "kick", playerId: targetPlayer.playerId, name: targetPlayer.name };
      return;
    }
    if (client.menuPending.action !== "kickSelect" && isEnter) {
      if (client.menuPending.action === "kick") sendHost("kick", client.menuPending.playerId);
      else if (client.menuPending.action === "regenerate" || client.menuPending.action === "resetScores") sendHost(client.menuPending.action);
      client.menuPending = null;
      client.menuOpen = false;
    }
    return;
  }

  if (event.code === "KeyC") {
    event.preventDefault();
    void refreshKeyboardLayout();
    client.menuPending = { action: "controls", index: 0, capturing: false, hint: "" };
    return;
  }
  if (event.code === "KeyV") {
    event.preventDefault();
    client.menuPending = { action: "effects", index: 0 };
    return;
  }
  if (!isOwnHost()) return;
  if (event.code === "KeyS") {
    for (const code of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) pressed.delete(code);
    client.menuPending = { action: "settings", draft: { ...client.gameSettings }, index: 0 };
  } else if (event.code === "KeyR") client.menuPending = { action: "regenerate" };
  else if (event.code === "KeyX") client.menuPending = { action: "resetScores" };
  else if (event.code === "KeyK" && client.latestSnapshot) {
    if (kickablePlayers(client.latestSnapshot).length > 0) {
      client.menuPending = { action: "kickSelect" };
    }
  }
});
}
