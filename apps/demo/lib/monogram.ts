import { NAVY, PAPER, readableInk } from "./brand-palette";

/**
 * A monogram tile: a name's initials on a color, standing in for a logo or
 * an avatar that hasn't been set (or won't load). DOM-free, so link preview
 * cards draw the same tile as the app.
 */
export interface Monogram {
  initials: string;
  background: string;
  /** Navy or paper, whichever reads better on `background`. */
  ink: string;
}

/** The tile's color without a brand color: the palette's navy, which carries no company's look. */
export const MONOGRAM_NEUTRAL = NAVY;

/** A name's first letter or digit, as a capital; null when it has none (only symbols). */
function initialOf(word: string): string | null {
  const first = Array.from(word).find((character) => /[\p{L}\p{N}]/u.test(character));
  return first ? first.toLocaleUpperCase() : null;
}

/**
 * Up to two initials: of the first two words with a letter or digit ("ONE
 * Agency" is "OA"), or one for a single word. A name with no letters or
 * digits keeps its first character.
 */
export function monogramInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .map(initialOf)
    .filter((initial): initial is string => initial !== null)
    .slice(0, 2)
    .join("");
  return initials || (Array.from(name.trim())[0] ?? "");
}

/** `name`'s monogram on `color` (a brand color), or on the neutral navy without one. */
export function monogram(name: string, color: string | null): Monogram {
  const background = color ?? MONOGRAM_NEUTRAL;
  return {
    initials: monogramInitials(name),
    background,
    ink: color ? readableInk(color).ink : PAPER,
  };
}
