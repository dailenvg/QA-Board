type Input = "keyboard" | "pointer";

let last: Input = "keyboard";

if (typeof document !== "undefined") {
  document.addEventListener("keydown", () => (last = "keyboard"), true);
  document.addEventListener("pointerdown", () => (last = "pointer"), true);
}

/**
 * Whether the user's latest input was the keyboard. A browser decides `:focus-visible` for a
 * script's `focus()` from its own heuristics, which count typing in a field as keyboard use even
 * when the user then pressed a button with the mouse.
 */
export function lastInputWasKeyboard(): boolean {
  return last === "keyboard";
}
