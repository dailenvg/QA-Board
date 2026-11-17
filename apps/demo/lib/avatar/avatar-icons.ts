import { circlePath, mapPairs, roundedRect, type Pen } from "./avatar-pen";

/**
 * The icons that break out of the default avatar's bubble, in their own
 * design grid (the bubble's top at y 26, centered on x 50). The pen places
 * them on the bubble. Smaller sizes drop detail: 2 is 96px and up, 1 is 40
 * to 48px, 0 is 28 to 36px.
 */

export type Detail = 0 | 1 | 2;

export interface IconSpec {
  /** The solid shapes, in ink. */
  pieces: string[];
  /** Details cut out of the icon, filled with the bubble's color. */
  knocks: string[];
}

/** A person: head and shoulders, the same at every size. */
export function personIcon(p: Pen): IconSpec {
  return {
    knocks: [],
    pieces: [circlePath(p, 50, 21.5, 12.5), mapPairs(p, shoulders(27, 73))],
  };
}

/** Head-and-shoulders' shoulders, between `x0` and `x1`. */
function shoulders(x0: number, x1: number): string {
  const c = (x0 + x1) / 2;
  const h = ((x1 - x0) / 2) * 0.55;
  return (
    `M${x0},59.5 C${x0},50.7 ${c - h},43.5 ${c},43.5 C${c + h},43.5 ${x1},50.7 ${x1},59.5 ` +
    `L${x1},60.5 Q${x1},63.5 ${x1 - 3},63.5 L${x0 + 3},63.5 Q${x0},63.5 ${x0},60.5 Z`
  );
}

/** A company: a building on its base, with windows down to 40px and a door at every size. */
export function buildingIcon(p: Pen, detail: Detail): IconSpec {
  const grid =
    detail === 2
      ? { xs: [37.5, 55.5], ys: [16, 26, 36], side: 7 }
      : detail === 1
        ? { xs: [37, 55], ys: [17, 30], side: 8 }
        : null;
  const windows = grid
    ? grid.xs.flatMap((x) => grid.ys.map((y) => roundedRect(p, x, y, grid.side, grid.side, 1.5)))
    : [];
  const door = mapPairs(
    p,
    "M45.5,59 L45.5,48.5 Q45.5,47 47,47 L53,47 Q54.5,47 54.5,48.5 L54.5,59 Z",
  );
  return {
    pieces: [roundedRect(p, 30, 10, 40, 52, 3), roundedRect(p, 24, 59, 52, 4.5, 2.25)],
    knocks: [...windows, door],
  };
}

/** A shield breaking out of the bubble's top, as the building does. */
const SHIELD =
  "M50,7 C56.5,11 63,13 70,13.5 L70,35 C70,50 61,59.5 50,65 C39,59.5 30,50 30,35 L30,13.5 C37,13 43.5,11 50,7 Z";

/** The cut-out person's shoulders, under its head. */
const SHIELD_SHOULDERS =
  "M38,49 C38,41.5 43.5,36 50,36 C56.5,36 62,41.5 62,49 L62,50 Q62,51.5 60.5,51.5 L39.5,51.5 Q38,51.5 38,50 Z";

/** The admin: a solid shield with a person cut out of it, the same at every size. */
export function adminIcon(p: Pen): IconSpec {
  return {
    pieces: [mapPairs(p, SHIELD)],
    knocks: [circlePath(p, 50, 26, 6.5), mapPairs(p, SHIELD_SHOULDERS)],
  };
}
