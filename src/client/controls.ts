export type ControlAction =
  | "throttleUp"
  | "throttleDown"
  | "hullLeft"
  | "hullRight"
  | "cannonLeft"
  | "cannonRight"
  | "rangeUp"
  | "rangeDown"
  | "fireCannon"
  | "torpedoLeft"
  | "torpedoRight"
  | "fireTorpedo";

export const CONTROL_ACTIONS: ReadonlyArray<{ action: ControlAction; label: string }> = [
  { action: "throttleUp", label: "Throttle up" },
  { action: "throttleDown", label: "Throttle down" },
  { action: "hullLeft", label: "Hull left" },
  { action: "hullRight", label: "Hull right" },
  { action: "cannonLeft", label: "Cannon left" },
  { action: "cannonRight", label: "Cannon right" },
  { action: "rangeUp", label: "Range +" },
  { action: "rangeDown", label: "Range −" },
  { action: "fireCannon", label: "Fire cannons" },
  { action: "torpedoLeft", label: "Torpedo left" },
  { action: "torpedoRight", label: "Torpedo right" },
  { action: "fireTorpedo", label: "Fire torpedoes" },
];

export type Bindings = Record<ControlAction, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  throttleUp: ["KeyW"],
  throttleDown: ["KeyS"],
  hullLeft: ["KeyA"],
  hullRight: ["KeyD"],
  cannonLeft: ["ArrowLeft"],
  cannonRight: ["ArrowRight"],
  rangeUp: ["ArrowUp"],
  rangeDown: ["ArrowDown"],
  fireCannon: ["ShiftRight"],
  torpedoLeft: ["BracketLeft"],
  torpedoRight: ["BracketRight"],
  fireTorpedo: ["Backslash", "IntlBackslash"],
};

export const RESERVED_CODES: ReadonlySet<string> = new Set(["Escape", "Tab", "F3"]);
export const BINDINGS_STORAGE_KEY = "warships.controls";

function copyBindings(bindings: Bindings): Bindings {
  return Object.fromEntries(
    CONTROL_ACTIONS.map(({ action }) => [action, [...bindings[action]]]),
  ) as Bindings;
}

function defaultBindingsCopy(): Bindings {
  return copyBindings(DEFAULT_BINDINGS);
}

export function assignBinding(bindings: Bindings, action: ControlAction, code: string): Bindings {
  if (RESERVED_CODES.has(code)) return bindings;
  const owner = CONTROL_ACTIONS.find(({ action: candidate }) => bindings[candidate].includes(code))?.action;
  const next = copyBindings(bindings);
  if (owner && owner !== action) next[owner] = [...bindings[action]];
  next[action] = [code];
  return next;
}

export function actionForCode(bindings: Bindings, code: string): ControlAction | undefined {
  return CONTROL_ACTIONS.find(({ action }) => bindings[action].includes(code))?.action;
}

export function loadBindings(raw: string | null): Bindings {
  if (raw === null) return defaultBindingsCopy();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return defaultBindingsCopy();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaultBindingsCopy();

  const source = parsed as Record<string, unknown>;
  const actions = CONTROL_ACTIONS.map(({ action }) => action);
  if (Object.keys(source).length !== actions.length || Object.keys(source).some((action) => !actions.includes(action as ControlAction))) {
    return defaultBindingsCopy();
  }

  const seen = new Set<string>();
  const loaded = {} as Bindings;
  for (const action of actions) {
    const codes = source[action];
    if (!Array.isArray(codes) || codes.length === 0) return defaultBindingsCopy();
    for (const code of codes) {
      if (typeof code !== "string" || code.length === 0 || RESERVED_CODES.has(code) || seen.has(code)) {
        return defaultBindingsCopy();
      }
      seen.add(code);
    }
    loaded[action] = [...codes];
  }
  return loaded;
}

export function serializeBindings(bindings: Bindings): string {
  return JSON.stringify(copyBindings(bindings));
}

export type KeyboardLayout = { get(code: string): string | undefined };

const friendlyLabels: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ShiftLeft: "Left Shift",
  ShiftRight: "Right Shift",
  Space: "Space",
};

export function keyLabel(code: string, layout?: KeyboardLayout): string {
  const friendly = friendlyLabels[code];
  if (friendly) return friendly;
  const printed = layout?.get(code);
  if (printed) return printed.toUpperCase();
  const letter = /^Key([A-Z])$/.exec(code)?.[1];
  if (letter) return letter;
  const digit = /^Digit([0-9])$/.exec(code)?.[1];
  if (digit) return digit;
  if (code === "BracketLeft") return "[";
  if (code === "BracketRight") return "]";
  if (code === "Backslash") return "\\";
  if (code === "IntlBackslash") return "ISO \\";
  return code;
}

export function bindingLabel(codes: string[], layout?: KeyboardLayout): string {
  return codes.map((code) => keyLabel(code, layout)).join(" / ");
}
