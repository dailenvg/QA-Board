/** What a keydown's target is, as far as Space goes. */
export interface SpaceTarget {
  tagName: string;
  role: string | null;
}

/** Roles whose element Space presses, checks or picks. */
const PRESSED_BY_SPACE = new Set([
  "button",
  "checkbox",
  "switch",
  "radio",
  "tab",
  "option",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
]);

/**
 * Whether Space already does something on `target`: it presses a button, ticks a checkbox,
 * opens a summary. Panning must never take that from a keyboard user.
 */
export function spacePresses(target: SpaceTarget | null): boolean {
  if (!target) return false;
  const tag = target.tagName.toUpperCase();
  if (tag === "BUTTON" || tag === "SUMMARY") return true;
  return target.role !== null && PRESSED_BY_SPACE.has(target.role);
}

export interface PanArming {
  /** Focus is in a text field (`isTyping`): Space types a space. */
  typing: boolean;
  /** Focus is on something Space presses (`spacePresses`). */
  pressing: boolean;
  /** A modal dialog is open over the viewer. */
  modalOpen: boolean;
  /** The surface is bigger than the stage, so there's somewhere to move to. */
  overflows: boolean;
  /** The pointer is over the surface, in the visible part of the stage. */
  overSurface: boolean;
}

/** Whether holding Space arms the hand, so a drag moves the zoomed surface around. */
export function canArmPan({
  typing,
  pressing,
  modalOpen,
  overflows,
  overSurface,
}: PanArming): boolean {
  return !typing && !pressing && !modalOpen && overflows && overSurface;
}
