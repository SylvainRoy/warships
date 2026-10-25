export const ESCAPE_GUARD_MS = 500;
export type EscapeAction = "ignore" | "closeUpgrade" | "cancelPending" | "toggleMenu";

export function escapeAction(
  state: { upgradeMenuOpen: boolean; menuPending: boolean; guardUntil: number },
  now: number,
  repeat: boolean,
): EscapeAction {
  if (repeat) return "ignore";
  if (state.upgradeMenuOpen) return "closeUpgrade";
  if (now < state.guardUntil) return "ignore";
  if (state.menuPending) return "cancelPending";
  return "toggleMenu";
}
