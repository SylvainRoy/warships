import { describe, expect, it } from "vitest";
import {
  actionForCode,
  assignBinding,
  bindingLabel,
  BINDINGS_STORAGE_KEY,
  CONTROL_ACTIONS,
  DEFAULT_BINDINGS,
  keyLabel,
  loadBindings,
  RESERVED_CODES,
  serializeBindings,
} from "../src/client/controls.js";

describe("control bindings", () => {
  it("provides twelve unique default actions without reserved codes", () => {
    const codes = CONTROL_ACTIONS.flatMap(({ action }) => DEFAULT_BINDINGS[action]);
    expect(CONTROL_ACTIONS).toHaveLength(12);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.some((code) => RESERVED_CODES.has(code))).toBe(false);
    expect(DEFAULT_BINDINGS.fireCannon).toEqual(["Space"]);
    expect(DEFAULT_BINDINGS.torpedoRight).toEqual(["Backslash", "IntlBackslash"]);
    expect(DEFAULT_BINDINGS.fireTorpedo).toEqual(["BracketRight"]);
    expect(BINDINGS_STORAGE_KEY).toBe("warships.controls");
  });

  it("swaps an assigned code with all previous codes from its owner", () => {
    const next = assignBinding(DEFAULT_BINDINGS, "hullLeft", "KeyD");
    expect(next.hullLeft).toEqual(["KeyD"]);
    expect(next.hullRight).toEqual(["KeyA"]);
    expect(DEFAULT_BINDINGS.hullLeft).toEqual(["KeyA"]);
    expect(DEFAULT_BINDINGS.hullRight).toEqual(["KeyD"]);
  });

  it("reduces an action assigned one of its own codes to that code", () => {
    const next = assignBinding(DEFAULT_BINDINGS, "torpedoRight", "IntlBackslash");
    expect(next.torpedoRight).toEqual(["IntlBackslash"]);
    expect(next.fireCannon).toEqual(["Space"]);
  });

  it("returns the original bindings unchanged for a reserved code", () => {
    expect(assignBinding(DEFAULT_BINDINGS, "hullLeft", "Escape")).toBe(DEFAULT_BINDINGS);
    expect(assignBinding(DEFAULT_BINDINGS, "hullLeft", "Tab")).toBe(DEFAULT_BINDINGS);
    expect(assignBinding(DEFAULT_BINDINGS, "hullLeft", "F3")).toBe(DEFAULT_BINDINGS);
  });

  it("swaps the torpedo-right defaults to fire cannons when Space is assigned", () => {
    const next = assignBinding(DEFAULT_BINDINGS, "torpedoRight", "Space");
    expect(next.torpedoRight).toEqual(["Space"]);
    expect(next.fireCannon).toEqual(["Backslash", "IntlBackslash"]);
    expect(next.fireTorpedo).toEqual(["BracketRight"]);
  });

  it("looks up the action for a code", () => {
    expect(actionForCode(DEFAULT_BINDINGS, "KeyW")).toBe("throttleUp");
    expect(actionForCode(DEFAULT_BINDINGS, "IntlBackslash")).toBe("torpedoRight");
    expect(actionForCode(DEFAULT_BINDINGS, "Space")).toBe("fireCannon");
    expect(actionForCode(DEFAULT_BINDINGS, "BracketRight")).toBe("fireTorpedo");
    expect(actionForCode(DEFAULT_BINDINGS, "Escape")).toBeUndefined();
  });

  it("uses a fresh default copy for missing, malformed, or invalid stored data", () => {
    const missing = loadBindings(null);
    expect(missing).toEqual(DEFAULT_BINDINGS);
    expect(missing).not.toBe(DEFAULT_BINDINGS);

    const invalid = [
      "{",
      JSON.stringify({ ...DEFAULT_BINDINGS, fireTorpedo: undefined }),
      JSON.stringify({ ...DEFAULT_BINDINGS, extra: ["KeyQ"] }),
      JSON.stringify({ ...DEFAULT_BINDINGS, hullLeft: ["KeyD"] }),
      JSON.stringify({ ...DEFAULT_BINDINGS, hullLeft: ["Escape"] }),
      JSON.stringify({ ...DEFAULT_BINDINGS, hullLeft: [] }),
      JSON.stringify({ ...DEFAULT_BINDINGS, hullLeft: ["KeyA", 3] }),
      JSON.stringify({ ...DEFAULT_BINDINGS, hullLeft: ["KeyQ"], hullRight: ["KeyQ"] }),
    ];
    for (const raw of invalid) expect(loadBindings(raw)).toEqual(DEFAULT_BINDINGS);
  });

  it("serializes and reloads a valid binding set", () => {
    const changed = assignBinding(DEFAULT_BINDINGS, "hullLeft", "KeyQ");
    expect(loadBindings(serializeBindings(changed))).toEqual(changed);
  });

  it("formats fallback and layout-map key labels while keeping arrows and Shift friendly", () => {
    expect(keyLabel("KeyQ")).toBe("Q");
    expect(keyLabel("Digit7")).toBe("7");
    expect(keyLabel("ArrowLeft")).toBe("←");
    expect(keyLabel("ShiftRight")).toBe("Right Shift");
    expect(keyLabel("ShiftLeft")).toBe("Left Shift");
    expect(keyLabel("Space")).toBe("Space");
    expect(keyLabel("BracketLeft")).toBe("[");
    expect(keyLabel("BracketRight")).toBe("]");
    expect(keyLabel("Backslash")).toBe("\\");
    expect(keyLabel("IntlBackslash")).toBe("ISO \\");
    expect(keyLabel("UnknownCode")).toBe("UnknownCode");

    const layout = new Map([
      ["KeyQ", "a"],
      ["ArrowLeft", "x"],
      ["ShiftRight", "shift"],
      ["BracketLeft", "°"],
    ]);
    expect(keyLabel("KeyQ", layout)).toBe("A");
    expect(keyLabel("ArrowLeft", layout)).toBe("←");
    expect(keyLabel("ShiftRight", layout)).toBe("Right Shift");
    expect(keyLabel("BracketLeft", layout)).toBe("°");
    expect(bindingLabel(["KeyQ", "ArrowLeft"], layout)).toBe("A / ←");
  });
});
