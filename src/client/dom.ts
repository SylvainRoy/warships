import { APP_VERSION } from "../shared/version.js";

export function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Game page is missing ${selector}`);
  return element;
}

export const canvasElement = requireElement<HTMLCanvasElement>("#game");
export const lobby = requireElement<HTMLElement>("#lobby");
export const lobbyFooter = requireElement<HTMLElement>(".lobby-footer");
export const lobbyVersion = requireElement<HTMLElement>("#lobby-version");
lobbyVersion.textContent = `v${APP_VERSION}`;
export const form = requireElement<HTMLFormElement>("#join-form");
export const nameInput = requireElement<HTMLInputElement>("#player-name");
export const joinButton = requireElement<HTMLButtonElement>("#join-button");
export const errorBox = requireElement<HTMLElement>("#lobby-error");
export const roster = requireElement<HTMLUListElement>("#lobby-players");
export const freeSlots = requireElement<HTMLElement>("#free-slots");
export const fullNote = requireElement<HTMLElement>("#server-full");
const context = canvasElement.getContext("2d", { alpha: false });
if (!context) throw new Error("Canvas 2D is unavailable");
export const ctx = context;

export const colours = ["#4b9bff", "#ff6266", "#f3c94e", "#c084fc"];
