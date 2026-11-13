import { motion, type Transition } from "motion/react";
import { duration, ease, sceneStep, spring } from "@/lib/motion";
import { BODY_PATH, BRAND, EYE_LEFT_PATH, EYE_RIGHT_PATH } from "../../brand/mascot/paths";

/*
 * Squint's line art (the Overview's scenes, every empty state): everything drawn in one grey line (`--scene-line`) on the tile's own
 * panel, a second plane behind the words, with a lime Squiggy the only filled shape. Shapes
 * that overlap are filled with the panel, so the one in front hides the lines behind it.
 * Coordinates are each scene's viewBox units.
 */

/** Squint's lime (`--highlight`, the same in both themes), for a live `Squiggy`'s `color`. */
export const LIME = "#DEFF5B";

/** Props for an `<svg>` drawn in the line: no fill, round ends and joins. */
export const LINE_SVG = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "text-scene-line",
} as const;

/**
 * The surface the art sits on, as a shape's fill: it hides what's behind it without a fill of
 * its own. The panel unless a parent sets `--art-surface` (`EmptyArt`'s `surface`).
 */
export const SURFACE = "var(--art-surface, var(--color-panel))";

export function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/** A line drawing itself in, `order` scene steps after the scene starts. */
export function draw(order: number): {
  initial: { pathLength: number; opacity: number };
  animate: { pathLength: number; opacity: number };
  transition: Transition;
} {
  return {
    initial: { pathLength: 0, opacity: 0 },
    animate: { pathLength: 1, opacity: 1 },
    transition: { duration: duration.page, ease: ease.out, delay: order * sceneStep },
  };
}

/**
 * A dashed line fading in, `order` scene steps in: drawing in (`draw`) animates the dash
 * pattern itself, which would wipe out the dashes.
 */
export function dashed(order: number) {
  return {
    strokeDasharray: "3 4",
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: duration.page, ease: ease.out, delay: order * sceneStep },
  };
}

/** A shape dropping into place from `from` units above, `order` scene steps in. */
export function drop(order: number, from = 14) {
  return {
    initial: { opacity: 0, y: -from },
    animate: { opacity: 1, y: 0 },
    transition: { ...spring.jelly, delay: order * sceneStep },
  };
}

export type BubbleKind = "lines" | "line" | "dots" | "question" | "check";

interface LineBubbleProps {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Which end of its bottom edge the tail hangs from. */
  tail: "left" | "right";
  /** Degrees, about its middle. */
  tilt: number;
  /** What's written in it: two lines, one, an ellipsis, a question mark or a check. */
  kind: BubbleKind;
  /** Scene steps before it drops in. */
  order: number;
  /** How far it drops; a thrown one comes in from further off. */
  from?: number;
}

/** A speech bubble in one outline, its tail cut into the bottom edge. */
export function LineBubble({ x, y, w, h, tail, tilt, kind, order, from }: LineBubbleProps) {
  const r = Math.min(h / 2, 10);
  const bottom = y + h;
  const outline =
    tail === "left"
      ? `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${bottom - r}A${r} ${r} 0 0 1 ${x + w - r} ${bottom}H${x + 20}L${x + 10} ${bottom + 8}V${bottom}H${x + r}A${r} ${r} 0 0 1 ${x} ${bottom - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
      : `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${bottom - r}A${r} ${r} 0 0 1 ${x + w - r} ${bottom}H${x + w - 10}V${bottom + 8}L${x + w - 20} ${bottom}H${x + r}A${r} ${r} 0 0 1 ${x} ${bottom - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    <motion.g data-testid="scene-bubble" {...drop(order, from)}>
      <g transform={`rotate(${tilt} ${cx} ${cy})`}>
        <path d={outline} fill={SURFACE} />
        {kind === "lines" ? (
          <path d={`M${x + 9} ${cy - 3.5}H${x + w - 9}M${x + 9} ${cy + 3.5}H${x + w * 0.55}`} />
        ) : kind === "line" ? (
          <path d={`M${x + 9} ${cy}H${x + w - 12}`} />
        ) : kind === "check" ? (
          <path d={`M${cx - 6} ${cy}l4 4 8-8`} />
        ) : kind === "dots" ? (
          [-7, 0, 7].map((dx) => (
            <circle key={dx} cx={cx + dx} cy={cy} r={1.5} fill="currentColor" stroke="none" />
          ))
        ) : (
          <>
            <path d={`M${cx - 3} ${cy - 3}a3 3 0 1 1 3 3v1.5`} />
            <circle cx={cx} cy={cy + 5} r={0.9} fill="currentColor" stroke="none" />
          </>
        )}
      </g>
    </motion.g>
  );
}

interface LinePinProps {
  /** Where its sharp corner (its tip, bottom left) lands. */
  x: number;
  y: number;
  /** Its number, or a check once resolved. */
  number: number;
  resolved: boolean;
  order: number;
}

/** A comment pin in outline, the app's shape: a rounded square with a sharp bottom-left tip. */
export function LinePin({ x, y, number, resolved, order }: LinePinProps) {
  const size = 18;
  const r = 9;
  const outline = `M${x} ${y}V${y - size + r}A${r} ${r} 0 0 1 ${x + r} ${y - size}H${x + size - r}A${r} ${r} 0 0 1 ${x + size} ${y - size + r}V${y - r}A${r} ${r} 0 0 1 ${x + size - r} ${y}Z`;
  return (
    <motion.g data-testid="story-pin" data-resolved={resolved || undefined} {...drop(order)}>
      <path d={outline} fill={SURFACE} />
      {resolved ? (
        <path d={`M${x + 5} ${y - 9}l3 3 5.5-6`} />
      ) : (
        <text
          x={x + 9}
          y={y - 5.8}
          textAnchor="middle"
          fill="currentColor"
          stroke="none"
          className="text-[9px] font-bold"
        >
          {number}
        </text>
      )}
    </motion.g>
  );
}

/** Squiggy's mark spans 400 units of its own artboard, from (87, 320). */
const MARK = { x: 87, y: 320, width: 400 } as const;

interface LimeSquiggyProps {
  /** Its top left, and its width (its height is about 0.93 of it). */
  x: number;
  y: number;
  width: number;
  /** Degrees, about its middle. */
  tilt?: number;
  order: number;
}

/**
 * Squiggy as the line art draws it: Squint's lime, outlined in dark ink, its eyes in ink: the
 * one filled shape in the scene. It pops in after the lines it sits among.
 */
export function LimeSquiggy({ x, y, width, tilt = 0, order }: LimeSquiggyProps) {
  const scale = width / MARK.width;
  return (
    <motion.g
      data-testid="story-mascot"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...spring.jelly, delay: order * sceneStep }}
    >
      <g
        transform={`translate(${x} ${y}) rotate(${tilt} ${width / 2} ${width * 0.46}) scale(${scale}) translate(${-MARK.x} ${-MARK.y})`}
      >
        <path
          d={BODY_PATH}
          fill="var(--color-highlight)"
          stroke="var(--color-scene-ink)"
          strokeWidth={1.6}
          vectorEffect="non-scaling-stroke"
        />
        <path d={EYE_LEFT_PATH} fill={BRAND.ink} stroke="none" />
        <path d={EYE_RIGHT_PATH} fill={BRAND.ink} stroke="none" />
      </g>
    </motion.g>
  );
}
