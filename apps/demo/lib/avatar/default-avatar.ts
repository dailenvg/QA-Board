import { commenterColor, PAPER } from "../brand-palette";
import { contrast } from "../color";
import {
  adminIcon,
  buildingIcon,
  cardIcon,
  personIcon,
  silhouetteIcon,
  type Detail,
  type IconSpec,
} from "./avatar-icons";
import { mapFigmaPath, pen, r2, roundedRect, type Pen, type PointMap } from "./avatar-pen";

/**
 * Squint's default avatars: a colored chat bubble (Dailen's Figma shape) in
 * Squiggy's ink outline, with a solid icon breaking out of its top. Pure and
 * DOM-free, with literal colors only, so the app's SVG and the server's PNG
 * (satori) draw the same thing. Everything sits in a 0 to 100 box.
 */

/** Squiggy's ink: the outline, and the icons on a light bubble. */
export const AVATAR_INK = "#17213C";
/** A company without a brand color: Hip+Joint's magenta. */
export const COMPANY_DEFAULT_FILL = "#E03B9D";
/** The admin's Pumpkin. */
export const ADMIN_FILL = "#FEB651";
/** A workspace's lime (`--highlight`). */
export const WORKSPACE_FILL = "#DEFF5B";
/** The dark theme's light edge round the whole mark (`--line-strong` in light). */
export const AVATAR_EDGE = "#D4D4D8";
/** The light tile the server's PNG sits on (`--tile` in light). */
export const AVATAR_TILE = "#EDEDEF";

/**
 * Who the mark stands for. `workspace` is drawn and tested, but shown nowhere
 * yet: a company and its workspace are one record in the app today.
 */
export type AvatarKind = "person" | "company" | "workspace" | "admin";

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

export interface AvatarInitials {
  text: string;
  /** The heaviest Figtree the app loads (400 to 700). */
  fontWeight: number;
  /** The center of the text, in box units. */
  x: number;
  y: number;
  fontSize: number;
  letterSpacing: number;
  fill: string;
}

export interface AvatarDrawing {
  /** The background square, under everything; null without `tile`. */
  tile: AvatarShape | null;
  /** The light edge under the art, for dark surfaces; empty without `edge`. */
  edge: AvatarShape[];
  art: AvatarShape[];
  /** A person's initials (Figtree, centered on `x`, `y`); null for the other kinds. */
  initials: AvatarInitials | null;
}

export interface AvatarOptions {
  kind: AvatarKind;
  /** The bubble's color. */
  fill: string;
  /** The slot's side in CSS px: it sets the outline's weight and how much detail shows. */
  size: number;
  fit?: AvatarFit;
  /** Draws the light edge, for dark surfaces. */
  edge?: boolean;
  /** A background square in this color (the PNG's light tile); null draws none. */
  tile?: string | null;
  /** A person's initials. */
  initials?: string;
  /**
   * A person as head and shoulders, without initials: where a company badge
   * hangs over the bubble's lower left, which initials would run under.
   */
  silhouette?: boolean;
}

/** The fill path of "Union" in the Figma frame (viewBox 0 0 480 378), verbatim: only ever scaled. */
export const FIGMA_BUBBLE =
  "M299.609 6.5C373.834 6.5 434.005 66.671 434.005 140.896V236.892C434.005 265.044 425.346 291.172 410.551 312.765L467.613 350.131C477.19 356.402 472.749 371.287 461.303 371.287H140.896C66.671 371.287 6.5 311.116 6.5 236.892V140.896C6.5 66.671 66.671 6.5 140.896 6.5H299.609Z";

/** Measured on that path: the body's center, its top, the scale into the box and Figma's stroke. */
const FIGMA = { bodyCx: 220.2525, top: 6.5, scale: 0.2, stroke: 13 } as const;

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

/** The initials' weight: the app loads Figtree 400 to 700, so 700 is what renders. */
const INITIALS_WEIGHT = 700;

/** The outline never goes under this, in CSS px. */
const MIN_OUTLINE_PX = 1.5;

/** Figma's 13 on 480, scaled with the mark; never under 1.5px (48px and down). */
function outlinePx(size: number, fit: AvatarFit): number {
  return Math.max((FIGMA.stroke * FIGMA.scale * FITS[fit].scale * size) / 100, MIN_OUTLINE_PX);
}

/** The light edge's width beyond the outline, in CSS px. */
function edgePx(size: number): number {
  if (size >= 192) return 3;
  return size >= 96 ? 2 : 1.5;
}

function detailAt(size: number): Detail {
  if (size >= 96) return 2;
  return size >= 40 ? 1 : 0;
}

/**
 * Whichever of Squiggy's ink and paper reads better on `fill`: `readableInk`'s
 * rule, with the ink in place of navy (so magenta keeps an ink icon).
 */
export function avatarInkOn(fill: string): string {
  return contrast(fill, AVATAR_INK) >= contrast(fill, PAPER) ? AVATAR_INK : PAPER;
}

/** A company's bubble: its brand color, or magenta without one. */
export function companyFill(brandColor: string | null): string {
  return brandColor ?? COMPANY_DEFAULT_FILL;
}

/** A person's bubble: their pin color, from the name their pins go by. */
export function personFill(name: string): string {
  return commenterColor(name).hex;
}

function iconFor(kind: AvatarKind, p: Pen, detail: Detail, silhouette: boolean): IconSpec {
  switch (kind) {
    case "person":
      return silhouette ? silhouetteIcon(p) : personIcon(p);
    case "company":
      return buildingIcon(p, detail);
    case "workspace":
      return cardIcon(p, detail);
    case "admin":
      return adminIcon(p, detail);
  }
}

function outlined(d: string, fill: string, stroke: string | null, width: number): AvatarShape {
  return stroke && width > 0
    ? { d, fill, stroke, strokeWidth: r2(width), strokeLinejoin: "round" }
    : { d, fill };
}

const SQUARE = "M0 0H100V100H0Z";

/** The mark for `kind`, sized for a `size`px slot. */
export function drawDefaultAvatar({
  kind,
  fill,
  size,
  fit = "free",
  edge = false,
  tile = null,
  initials = "",
  silhouette = false,
}: AvatarOptions): AvatarDrawing {
  const unit = 100 / size;
  const outline = outlinePx(size, fit) * unit;
  const fitMap = FITS[fit].map;
  const bubble = mapFigmaPath(pen(fitMap ? [bubbleBase, fitMap] : [bubbleBase]), FIGMA_BUBBLE);
  const iconPen = pen(fitMap ? [iconBase, fitMap] : [iconBase]);
  const icon = iconFor(kind, iconPen, detailAt(size), silhouette);
  const ink = avatarInkOn(fill);
  // On a dark fill the icon turns paper and takes the ink outline, so it still reads off the bubble.
  const iconStroke = ink === PAPER ? AVATAR_INK : null;

  const halo = edgePx(size) * unit * 2;
  const edgeShapes = edge
    ? [
        outlined(bubble, AVATAR_EDGE, AVATAR_EDGE, outline + halo),
        ...icon.pieces.map((piece) =>
          outlined(piece.d, AVATAR_EDGE, AVATAR_EDGE, (iconStroke ? outline : 0) + halo),
        ),
      ]
    : [];

  // Figma's join at the tail is a miter.
  const art: AvatarShape[] = [
    { d: bubble, fill, stroke: AVATAR_INK, strokeWidth: r2(outline), strokeLinejoin: "miter" },
  ];
  for (const piece of icon.pieces) {
    // 1px or more of the bubble's color between the shield and the shoulders.
    if (piece.gap) art.push(outlined(piece.d, "none", fill, Math.max(5, 2 * unit)));
    art.push(outlined(piece.d, piece.ink ? AVATAR_INK : ink, iconStroke, outline));
  }
  for (const d of icon.knocks) art.push({ d, fill });
  for (const d of icon.onKnock) art.push({ d, fill: ink });
  for (const d of icon.knockLines) art.push(outlined(d, "none", fill, Math.max(3.5, 1.25 * unit)));

  const text = icon.initials && initials ? icon.initials : null;
  const [x, y] = text ? iconPen.map(text.x, text.y) : [0, 0];
  return {
    tile: tile ? { d: SQUARE, fill: tile } : null,
    edge: edgeShapes,
    art,
    initials: text && {
      text: initials,
      fontWeight: INITIALS_WEIGHT,
      x: r2(x),
      y: r2(y),
      fontSize: r2(text.fontSize * iconPen.k),
      letterSpacing: r2(-0.5 * iconPen.k),
      fill: ink,
    },
  };
}

/** Under this, in CSS px, a company badge is its color alone. */
const BADGE_ICON_MIN = 16;

/**
 * The company badge without a logo: no bubble, a square of the company's
 * color with a solid building on it, or only the color under 16px.
 */
export function drawCompanyBadge(fill: string, size: number): AvatarShape[] {
  const square = { d: SQUARE, fill };
  if (size < BADGE_ICON_MIN) return [square];
  const flat = pen([]);
  const ink = avatarInkOn(fill);
  return [
    square,
    { d: roundedRect(flat, 31, 14, 38, 62, 5), fill: ink },
    { d: roundedRect(flat, 20, 72, 60, 10, 5), fill: ink },
  ];
}

function shapeMarkup({ d, fill, stroke, strokeWidth, strokeLinejoin }: AvatarShape): string {
  const outline = stroke
    ? ` stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="${strokeLinejoin}" stroke-linecap="round"`
    : "";
  return `<path d="${d}" fill="${fill}"${outline}/>`;
}

/** A drawing's shapes, bottom to top. Its initials are drawn apart, as text. */
export function avatarShapes({ tile, edge, art }: AvatarDrawing): AvatarShape[] {
  return tile ? [tile, ...edge, ...art] : [...edge, ...art];
}

/**
 * Shapes as a standalone SVG document, for the server's PNG: paths and solid
 * fills only. Initials aren't part of it: the renderer can't draw SVG text.
 */
export function avatarSvg(shapes: readonly AvatarShape[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${shapes.map(shapeMarkup).join("")}</svg>`;
}
