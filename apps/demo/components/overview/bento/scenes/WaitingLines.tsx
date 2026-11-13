import { motion, type Transition } from "motion/react";
import { duration, ease, sceneStep } from "@/lib/motion";
import { StoryMascot } from "../../welcome/StoryMascot";

/** The most bubbles in the queue; a bigger count still shows in the tag. */
const QUEUE = 4;

/** Where each bubble stands, nearest Squiggy first (viewBox units). */
const BUBBLES = [
  { x: 194, y: 42, w: 52, h: 32 },
  { x: 140, y: 36, w: 46, h: 34 },
  { x: 95, y: 48, w: 38, h: 28 },
  { x: 60, y: 57, w: 30, h: 22 },
] as const;

/** The art's width (viewBox units); it sits at the header's right end, under the tag's row. */
const WIDTH = 300;

/** Where the floor is: the box's bottom edge, which draws it. */
const FLOOR = 112;

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/** A line drawing itself in, `order` steps after the scene starts. */
function draw(order: number): {
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

interface WaitingLinesProps {
  open: number;
}

/**
 * Comments queueing up for Squiggy: speech bubbles on little legs, one per open comment up to
 * four, lined up under a wall clock, drawing themselves in. Line art on the tile's own panel, a
 * second plane behind its title; Squiggy, peeking over the floor at the front of the queue, is
 * the one filled shape. Decorative: the tile says the same in words.
 */
export function WaitingLines({ open }: WaitingLinesProps) {
  const queue = BUBBLES.slice(0, Math.min(open, QUEUE));
  return (
    <span className="absolute inset-0 block overflow-hidden border-b-[1.5px] border-scene-line">
      <svg
        viewBox={`0 0 ${WIDTH} ${FLOOR}`}
        preserveAspectRatio="xMaxYMax meet"
        className="absolute inset-0 size-full text-scene-line"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* The wall clock everyone's waiting under, hands at ten to two. */}
        <motion.circle cx={28} cy={72} r={18} {...draw(0)} />
        <motion.path d="M28 72V61M28 72L37 67" {...draw(1)} />
        <motion.path d="M28 56V58M28 88V86M12 72H14M44 72H42" {...draw(1)} />
        {/*
          A spark of impatience over the queue, and a few stray dots; all below the title's row
          (the top 30 units), so nothing crosses the words.
        */}
        <motion.path d="M168 32V40M164 36H172" {...draw(2)} />
        <motion.circle cx={84} cy={40} r={2} {...draw(2)} />
        <motion.circle cx={262} cy={36} r={2.5} {...draw(3)} />
        {queue.map(({ x, y, w, h }, index) => {
          const order = queue.length - index + 2;
          const legs = [x + w * 0.35, x + w * 0.65];
          return (
            // Filled with the panel, so a bubble hides the lines behind it, not a fill of its own.
            <g key={index} data-testid="scene-bubble">
              <motion.path
                d={roundedRect(x, y, w, h, Math.min(10, h / 2))}
                fill="var(--color-panel)"
                {...draw(order)}
              />
              <motion.path
                d={`M${x + 8} ${y + h / 2 - 3}H${x + w - 8}M${x + 8} ${y + h / 2 + 4}H${x + w * 0.55}`}
                {...draw(order + 1)}
              />
              <motion.path
                d={legs.map((leg) => `M${leg} ${y + h}V${FLOOR - 1}H${leg + 4}`).join("")}
                {...draw(order + 1)}
              />
            </g>
          );
        })}
      </svg>
      <StoryMascot mood="thinking" playing={false} still edge="bottom-right" size="3.5rem" />
    </span>
  );
}
