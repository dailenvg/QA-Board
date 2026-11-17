import { adminIcon, buildingIcon, personIcon, type Detail, type IconSpec } from "./avatar-icons";
import { mapFigmaPath, pen, r2, roundedRect, type Pen, type PointMap } from "./avatar-pen";

/**
 * Squint's default avatars: a gray chat bubble (Dailen's Figma shape) in a
 * Gunmetal outline, with a solid icon breaking out of its top. One grayscale
 * system for everyone: the same bubble, and the kind picks the icon, never a
 * name or a brand color. Pure and DOM-free, with literal colors only, so the
 * app's SVG and the server's PNG (satori) draw the same thing. Everything
 * sits in a 0 to 100 box.
 */

/** The avatars' grays ("Steel and Mist"), darkest to lightest. */
export const AVATAR_GRAYS = {
  gunmetal: "#1A2028",
  stormGray: "#3A4450",
  slate: "#606C78",
  mistGray: "#8E9AA8",
  paleSteel: "#C4CDD6",
  cloudWhite: "#EDF0F4",
} as const;

/** The outline and every icon. */
export const AVATAR_INK = AVATAR_GRAYS.gunmetal;
/** The dark theme's light edge round the whole mark. */
export const AVATAR_EDGE = AVATAR_GRAYS.paleSteel;
/** The light tile the server's PNG sits on. */
export const AVATAR_TILE = AVATAR_GRAYS.cloudWhite;

/**
 * Who the mark stands for. `person` is anyone on the team or a client.
 * `workspace` draws the company's mark, and is shown nowhere yet: a company
 * and its workspace are one record in the app today.
 */
export type AvatarKind = "person" | "company" | "workspace" | "admin";

/** Every mark's bubble, and the company badge's square: the icon says who it is. */
export const AVATAR_FILL = AVATAR_GRAYS.paleSteel;

/**
 * The one stroke, in box units: 4% of the mark's square at every size, so a
 * mark is the same drawing at 28px and at 192px. The outline is this wide,
 * and so is the dark theme's edge beyond it.
 */
const STROKE = 4;

/**
 * How the mark sits in its square. `free`: the bubble's body centered, its
 * tail overhanging the right edge a little, never clipped. `circle` (a round
 * frame) and `tile` (a rounded square) shrink it so the tail clears the edge.
 */
export type AvatarFit = "free" | "circle" | "tile";

export interface AvatarShape {
  d: string;
  /** A hex color, or "none". */
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinejoin?: "round" | "miter";
}

export interface AvatarDrawing {
  /** The background square, under everything; null without `tile`. */
  tile: AvatarShape | null;
  /** The light edge under the art, for dark surfaces; empty without `edge`. */
  edge: AvatarShape[];
  art: AvatarShape[];
}

export interface AvatarOptions {
  kind: AvatarKind;
  /** The slot's side in CSS px: it sets how much detail shows. */
  size: number;
  fit?: AvatarFit;
  /** Draws the light edge, for dark surfaces. */
  edge?: boolean;
  /** A background square in this color (the PNG's light tile); null draws none. */
  tile?: string | null;
}

/** The fill path of "Union" in the Figma frame (viewBox 0 0 480 378), verbatim: only ever scaled. */
export const FIGMA_BUBBLE =
  "M299.609 6.5C373.834 6.5 434.005 66.671 434.005 140.896V236.892C434.005 265.044 425.346 291.172 410.551 312.765L467.613 350.131C477.19 356.402 472.749 371.287 461.303 371.287H140.896C66.671 371.287 6.5 311.116 6.5 236.892V140.896C6.5 66.671 66.671 6.5 140.896 6.5H299.609Z";

/** Measured on that path: the body's center, its top and the scale into the box. */
const FIGMA = { bodyCx: 220.2525, top: 6.5, scale: 0.2 } as const;

/** The bubble's top in the box: the icon above it and the outline below are centered top to bottom. */
const BUBBLE_TOP = 22.4;
/** The icons' grid at the box's scale, a little larger to fill the wide bubble. */
const ICON_SCALE = 1.12;
const ICON_GRID_TOP = 26;

const bubbleBase: PointMap = (x, y) => [
  50 + (x - FIGMA.bodyCx) * FIGMA.scale,
  BUBBLE_TOP + (y - FIGMA.top) * FIGMA.scale,
];
const iconBase: PointMap = (x, y) => [
  50 + (x - 50) * ICON_SCALE,
  BUBBLE_TOP + (y - ICON_GRID_TOP) * ICON_SCALE,
];

/**
 * Circle: 74%, centered so the tail's corner clears the edge with its outline.
 * Tile: 85%, clear of a 25% corner radius.
 */
const FITS: Record<AvatarFit, { map: PointMap | null; scale: number }> = {
  free: { map: null, scale: 1 },
  circle: { map: (x, y) => [50 + (x - 55) * 0.74, 50 + (y - 52) * 0.74], scale: 0.74 },
  tile: { map: (x, y) => [50 + (x - 52) * 0.85, 50 + (y - 50) * 0.85], scale: 0.85 },
};

/** The stroke's width in CSS px for a `size`px slot: what any border beside the mark matches. */
export function avatarStrokePx(size: number, fit: AvatarFit = "free"): number {
  return (STROKE * FITS[fit].scale * size) / 100;
}

function detailAt(size: number): Detail {
  if (size >= 96) return 2;
  return size >= 40 ? 1 : 0;
}

function iconFor(kind: AvatarKind, p: Pen, detail: Detail): IconSpec {
  switch (kind) {
    case "person":
      return personIcon(p);
    case "company":
    case "workspace":
      return buildingIcon(p, detail);
    case "admin":
      return adminIcon(p);
  }
}

function outlined(d: string, fill: string, width: number): AvatarShape {
  return { d, fill, stroke: fill, strokeWidth: r2(width), strokeLinejoin: "round" };
}

const SQUARE = "M0 0H100V100H0Z";

/** The mark for `kind`, sized for a `size`px slot. */
export function drawDefaultAvatar({
  kind,
  size,
  fit = "free",
  edge = false,
  tile = null,
}: AvatarOptions): AvatarDrawing {
  const fill = AVATAR_FILL;
  const stroke = STROKE * FITS[fit].scale;
  const fitMap = FITS[fit].map;
  const bubble = mapFigmaPath(pen(fitMap ? [bubbleBase, fitMap] : [bubbleBase]), FIGMA_BUBBLE);
  const iconPen = pen(fitMap ? [iconBase, fitMap] : [iconBase]);
  const icon = iconFor(kind, iconPen, detailAt(size));

  // The edge runs one stroke beyond the outline, and beyond the icon where it breaks out.
  const edgeShapes = edge
    ? [
        outlined(bubble, AVATAR_EDGE, 3 * stroke),
        ...icon.pieces.map((d) => outlined(d, AVATAR_EDGE, 2 * stroke)),
      ]
    : [];

  // Figma's join at the tail is a miter.
  const art: AvatarShape[] = [
    { d: bubble, fill, stroke: AVATAR_INK, strokeWidth: r2(stroke), strokeLinejoin: "miter" },
    ...icon.pieces.map((d) => ({ d, fill: AVATAR_INK })),
    ...icon.knocks.map((d) => ({ d, fill })),
  ];
  return { tile: tile ? { d: SQUARE, fill: tile } : null, edge: edgeShapes, art };
}

/** Under this, in CSS px, a company badge is its color alone. */
const BADGE_ICON_MIN = 16;

/**
 * The company badge without a logo: no bubble, a square in the bubble's gray
 * with a solid building on it, or only the gray under 16px.
 */
export function drawCompanyBadge(size: number): AvatarShape[] {
  const fill = AVATAR_FILL;
  const square = { d: SQUARE, fill };
  if (size < BADGE_ICON_MIN) return [square];
  const flat = pen([]);
  return [
    square,
    { d: roundedRect(flat, 31, 14, 38, 62, 5), fill: AVATAR_INK },
    { d: roundedRect(flat, 20, 72, 60, 10, 5), fill: AVATAR_INK },
  ];
}

function shapeMarkup({ d, fill, stroke, strokeWidth, strokeLinejoin }: AvatarShape): string {
  const outline = stroke
    ? ` stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="${strokeLinejoin}" stroke-linecap="round"`
    : "";
  return `<path d="${d}" fill="${fill}"${outline}/>`;
}

/** A drawing's shapes, bottom to top. */
export function avatarShapes({ tile, edge, art }: AvatarDrawing): AvatarShape[] {
  return tile ? [tile, ...edge, ...art] : [...edge, ...art];
}

/** Shapes as a standalone SVG document, for the server's PNG: paths and solid fills only. */
export function avatarSvg(shapes: readonly AvatarShape[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${shapes.map(shapeMarkup).join("")}</svg>`;
}
