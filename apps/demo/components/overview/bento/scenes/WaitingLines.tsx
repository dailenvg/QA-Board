import { motion } from "motion/react";
import { draw, LimeSquiggy, LINE_SVG, LineBubble, type BubbleKind } from "./line-art";

interface Bubble {
  x: number;
  y: number;
  w: number;
  h: number;
  tail: "left" | "right";
  tilt: number;
  kind: BubbleKind;
}

/** The pile on Squiggy, bottom first. */
const PILE: readonly Bubble[] = [
  { x: 214, y: 52, w: 50, h: 26, tail: "right", tilt: -5, kind: "lines" },
  { x: 262, y: 46, w: 46, h: 24, tail: "left", tilt: 7, kind: "dots" },
  { x: 232, y: 24, w: 44, h: 24, tail: "right", tilt: -3, kind: "line" },
];

/** Comments still in the air, on their way to the pile, the nearer one first. */
const THROWN: readonly Bubble[] = [
  { x: 140, y: 36, w: 34, h: 22, tail: "left", tilt: -6, kind: "question" },
  { x: 72, y: 58, w: 30, h: 20, tail: "left", tilt: -18, kind: "dots" },
];

/** One that slid off the pile, lying on the floor. */
const FALLEN: Bubble = { x: 304, y: 98, w: 34, h: 18, tail: "left", tilt: 14, kind: "line" };

/** The art's size (viewBox units): it keeps to the header's right end, under the tag's row. */
const WIDTH = 360;
const HEIGHT = 124;

interface WaitingLinesProps {
  open: number;
}

/**
 * Comments piling up on Squiggy: up to three on the pile, then up to two more thrown in along a
 * dashed arc, and a sixth slid off onto the floor. Line art on the tile's own panel, behind its
 * title (`line-art.tsx`); Squiggy, in lime, is the one filled shape. The floor is the header's
 * bottom edge. Decorative: the tile says the same in words.
 */
export function WaitingLines({ open }: WaitingLinesProps) {
  const pile = PILE.slice(0, Math.min(open, PILE.length));
  const thrown = THROWN.slice(0, Math.max(0, Math.min(open - PILE.length, THROWN.length)));
  const fallen = open > PILE.length + THROWN.length;
  return (
    <span className="absolute inset-0 block overflow-hidden border-b-[1.6px] border-scene-line">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMaxYMax meet"
        {...LINE_SVG}
        className={`absolute inset-0 size-full ${LINE_SVG.className}`}
      >
        {/* Stray dots and a spark, all below the title's row. */}
        <motion.circle cx={120} cy={96} r={2.5} {...draw(0)} />
        <motion.path d="M196 92v8M192 96h8" {...draw(1)} />
        <motion.circle cx={330} cy={72} r={2} {...draw(1)} />
        <LimeSquiggy x={236} y={76} width={50} tilt={-3} order={1} />
        {pile.map((bubble, index) => (
          <LineBubble key={`pile-${index}`} {...bubble} order={3 + index} />
        ))}
        {thrown.length > 0 ? (
          <>
            {/* The throw: a dashed arc in from the left, whoosh lines behind each comment. */}
            <motion.path d="M18 112C40 60 120 34 196 48" strokeDasharray="2 5" {...draw(2)} />
            <motion.path d="M176 30l4-5M182 36l6-3" {...draw(5)} />
            {thrown.length > 1 ? <motion.path d="M64 84l-6 3M60 76h-7" {...draw(6)} /> : null}
            {thrown.map((bubble, index) => (
              <LineBubble key={`thrown-${index}`} {...bubble} order={4 + index} from={0} />
            ))}
          </>
        ) : null}
        {fallen ? (
          <>
            <LineBubble {...FALLEN} order={7} />
            <motion.path d="M296 112c-3-4-3-8 0-12" {...draw(8)} />
          </>
        ) : null}
      </svg>
    </span>
  );
}
