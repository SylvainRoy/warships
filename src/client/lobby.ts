import type { LobbyMessage } from "../shared/protocol.js";
import { bindingLabel, type ControlAction } from "./controls.js";
import { colours, freeSlots, fullNote, joinButton, lobby, lobbyFooter, roster } from "./dom.js";
import { sendJoin } from "./net.js";
import { client } from "./state.js";

export function renderLobby(state: LobbyMessage): void {
  if (!client.joined) lobby.hidden = false;
  freeSlots.textContent = `${state.freeSlots} BERTH${state.freeSlots === 1 ? "" : "S"} FREE`;
  fullNote.hidden = !state.full;
  joinButton.disabled = state.full;
  roster.replaceChildren();
  for (const player of state.players) {
    const line = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.backgroundColor = colours[player.slot - 1] ?? "#fff";
    const name = document.createElement("span");
    name.textContent = player.name;
    const meta = document.createElement("span");
    meta.className = "player-meta";
    meta.textContent = `${player.host ? "♛ HOST · " : ""}${player.connected ? "ONLINE" : "RECONNECTING"}`;
    line.append(dot, name, meta);
    roster.append(line);
  }
  if (client.shouldAutoJoin && state.freeSlots > 0 && !client.joined) {
    client.shouldAutoJoin = false;
    sendJoin();
  }
}

export function renderLobbyControlsHelp(): void {
  const label = (action: ControlAction) => bindingLabel(client.bindings[action], client.keyboardLayout);
  lobbyFooter.textContent = `${label("throttleUp")} / ${label("throttleDown")} throttle · ${label("hullLeft")} / ${label("hullRight")} steer · ${label("fireCannon")} fire · ${label("fireTorpedo")} torpedoes · Esc menu`;
}
