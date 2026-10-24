/**
 * Geometry in the folder's own units. The stage is drawn at 340 x 272 and
 * scaled to the folder's width, so the shapes can be fixed paths.
 */

export const W = 340;
export const H = 272;
/** Room above the back panel for the files to rise into. */
export const HEADROOM = 54;
export const FRONT_TOP = 74;
export const FRONT_H = H - FRONT_TOP;
export const SHEET_W = 272;
export const SHEET_H = 184;
/** Widest a folder is drawn on the Overview, in CSS px; columns past it center it. */
export const FOLDER_MAX_WIDTH = 250;
/** Newest files shown in the stack; older ones stay in the count. */
export const MAX_VISIBLE = 4;

/** How far the front panel falls forward while the files fan out, in degrees. */
export const HINGE_OPEN = -24;
/** The front panel's `perspective()`, in units. */
export const HINGE_PERSPECTIVE = 760;
/** The frost layer overhangs the front panel by this much, so the hinged outline still fits it. */
export const FROST_PAD = 32;

/**
 * Width over height of the whole component, headroom included. A fan still
 * reaches past this box: about 30 units at each side (spread, jitter and tilt
 * of the outer sheets) and 70 above it (the back sheet's lift and hover), so
 * layouts leave that much room around each folder.
 */
export const FOLDER_ASPECT = W / (H + HEADROOM);

export const BACK_PATH =
  "M0 56A22 22 0 0 1 22 34L146 34C170 34 172 0 198 0L318 0A22 22 0 0 1 340 22L340 250A22 22 0 0 1 318 272L22 272A22 22 0 0 1 0 250Z";

type Point = readonly [number, number];

/** Quarter-circle corners as cubics: control points sit this far along each tangent. */
const ARC = 0.5523;
const R = 22;

/** A rounded corner from `from` to `to` around `corner`, as cubic control points and end. */
function corner(from: Point, at: Point, to: Point): Point[] {
  return [
    [from[0] + (at[0] - from[0]) * ARC, from[1] + (at[1] - from[1]) * ARC],
    [to[0] + (at[0] - to[0]) * ARC, to[1] + (at[1] - to[1]) * ARC],
    to,
  ];
}

/**
 * The front panel's outline in its own box (340 x 198): a tab at the top
 * left, rounded corners. Every segment is a cubic or a line, always in the
 * same order, so two outlines can be interpolated by CSS.
 */
const FRONT_START: Point = [0, R];
const FRONT_SEGMENTS: Point[][] = [
  corner(FRONT_START, [0, 0], [R, 0]),
  [[118, 0]],
  [
    [144, 0],
    [146, 32],
    [172, 32],
  ],
  [[W - R, 32]],
  corner([W - R, 32], [W, 32], [W, 32 + R]),
  [[W, FRONT_H - R]],
  corner([W, FRONT_H - R], [W, FRONT_H], [W - R, FRONT_H]),
  [[R, FRONT_H]],
  corner([R, FRONT_H], [0, FRONT_H], [0, FRONT_H - R]),
];

/**
 * Where a point of the front panel lands on screen once the panel is turned
 * `deg` about its bottom edge, matching CSS `perspective() rotateX()` with
 * `transform-origin: 50% 100%`.
 */
function hinge([x, y]: Point, deg: number): Point {
  const angle = (deg * Math.PI) / 180;
  const dy = y - FRONT_H;
  const z = dy * Math.sin(angle);
  const s = HINGE_PERSPECTIVE / (HINGE_PERSPECTIVE - z);
  return [W / 2 + (x - W / 2) * s, FRONT_H + dy * Math.cos(angle) * s];
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

function outline(map: (point: Point) => Point): string {
  const [sx, sy] = map(FRONT_START);
  const parts = [`M${fmt(sx)} ${fmt(sy)}`];
  for (const segment of FRONT_SEGMENTS) {
    const points = segment.map(map).flatMap(([x, y]) => [fmt(x), fmt(y)]);
    parts.push(`${segment.length === 1 ? "L" : "C"}${points.join(" ")}`);
  }
  return `${parts.join("")}Z`;
}

/** The front panel, flat. */
export const FRONT_PATH = outline((point) => point);

/**
 * The front panel's silhouette turned `deg` about its hinge, offset into the
 * frost layer's padded box. At 0 it is FRONT_PATH, padded.
 */
export function frostPath(deg: number): string {
  return outline((point) => {
    const [x, y] = hinge(point, deg);
    return [x + FROST_PAD, y + FROST_PAD];
  });
}
