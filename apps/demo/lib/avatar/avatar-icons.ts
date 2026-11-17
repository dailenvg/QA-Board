import { circlePath, mapPairs, roundedRect, type Pen } from "./avatar-pen";

/**
 * The icons that break out of the default avatar's bubble, in their own
 * design grid (the bubble's top at y 26, centered on x 50). The pen places
 * them on the bubble. Smaller sizes drop detail: 2 is 96px and up, 1 is 40
 * to 48px, 0 is 28 to 36px.
 */

export type Detail = 0 | 1 | 2;

export interface IconPiece {
  d: string;
  /** Always ink, whatever the bubble: the building's base. */
  ink?: boolean;
  /** Set apart from what's under it by a line of the bubble's color: the admin's shield. */
  gap?: boolean;
}

export interface IconSpec {
  pieces: IconPiece[];
  /** Details cut out of the icon, filled with the bubble's color. */
  knocks: string[];
  /** Drawn on top of the knocks, in the icon's color: the card's picture. */
  onKnock: string[];
  /** Lines cut out of the icon in the bubble's color: the shield's check. */
  knockLines: string[];
  /** Where the initials sit, in the icon's grid: a person's. */
  initials: { x: number; y: number; fontSize: number } | null;
}

const EMPTY = { knocks: [], onKnock: [], knockLines: [], initials: null };

/** A person: a small head on top, their initials in the bubble under it. */
export function personIcon(p: Pen): IconSpec {
  return {
    ...EMPTY,
    pieces: [{ d: circlePath(p, 50, 21, 10.5) }],
    initials: { x: 50, y: 61, fontSize: 36 },
  };
}

/** A person as head and shoulders, no initials: the same at every size. */
export function silhouetteIcon(p: Pen): IconSpec {
  return {
    ...EMPTY,
    pieces: [{ d: circlePath(p, 50, 21.5, 12.5) }, { d: mapPairs(p, shoulders(27, 73)) }],
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
    ...EMPTY,
    pieces: [
      { d: roundedRect(p, 30, 10, 40, 52, 3) },
      { d: roundedRect(p, 24, 59, 52, 4.5, 2.25), ink: true },
    ],
    knocks: [...windows, door],
  };
}

/** A workspace: a project card with text lines and a picture (hills, and a sun from 96px). */
export function cardIcon(p: Pen, detail: Detail): IconSpec {
  const firstLine = roundedRect(p, 35, 16, 18, 5, 2.5);
  const secondLine = roundedRect(p, 35, 25, 30, 5, 2.5);
  const picture = roundedRect(p, 32, 34, 36, 25, 4);
  const sun = circlePath(p, 40.5, 41.5, 3.5);
  const hills = mapPairs(
    p,
    "M32,55 L42,47 L49,52.5 L58.5,42.5 L68,51 L68,55 Q68,59 64,59 L36,59 Q32,59 32,55 Z",
  );
  const pieces = [{ d: roundedRect(p, 28, 10, 44, 53, 7) }];
  if (detail === 0) return { ...EMPTY, pieces, knocks: [firstLine, picture] };
  return {
    ...EMPTY,
    pieces,
    knocks: [firstLine, secondLine, picture],
    onKnock: detail === 2 ? [hills, sun] : [hills],
  };
}

const SHIELD = "M67,35 L80,39.5 L80,50 C80,58.5 75,63.8 67,67 C59,63.8 54,58.5 54,50 L54,39.5 Z";

/** The admin: a person with a shield, its check from 40px (solid below). */
export function adminIcon(p: Pen, detail: Detail): IconSpec {
  return {
    ...EMPTY,
    pieces: [
      { d: mapPairs(p, shoulders(20, 62)) },
      { d: circlePath(p, 41, 21.5, 11.5) },
      { d: mapPairs(p, SHIELD), gap: true },
    ],
    knockLines: detail >= 1 ? [mapPairs(p, "M61,51 L65.2,55.2 L73,47.2")] : [],
  };
}
