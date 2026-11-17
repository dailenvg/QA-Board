"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useId, useRef } from "react";
import { ease, instant, tally } from "@/lib/motion";

interface SparklineProps {
  /** One value per day, oldest first. */
  values: readonly number[];
  /** What the chart says, for screen readers (it's an image to them). */
  label: string;
  size?: "lg" | "sm";
  testId?: string;
}

/** The drawing's own units: stretched to the box, the line kept 2px by `vector-effect`. */
const W = 100;
const H = 40;
/** Room above the peak and below the floor, so the line's width never clips. */
const PAD = 2;

/** `sm` sits in a row: a fixed width on phones, the row's free width from `sm` up. */
const BOX = { lg: "h-24 w-full", sm: "h-8 w-20 shrink-0 sm:w-auto sm:min-w-0 sm:flex-1" } as const;

/** The line's points, `PAD` inside the box: an all-zero series is a flat line on the floor. */
function points(values: readonly number[]): Array<[number, number]> {
  const peak = Math.max(1, ...values);
  const step = values.length > 1 ? W / (values.length - 1) : 0;
  return values.map((value, index) => [index * step, H - PAD - (value / peak) * (H - PAD * 2)]);
}

function linePath(at: ReadonlyArray<[number, number]>): string {
  return at.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ");
}

/**
 * A day-by-day line with a soft fill under it. It wipes in, left to right
 * (a clip growing across it), the first time it's on screen; with reduced
 * motion it's simply there.
 */
export function Sparkline({ values, label, size = "lg", testId }: SparklineProps) {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const clipId = useId();
  const at = points(values);
  const line = linePath(at);
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  return (
    <div ref={ref} role="img" aria-label={label} data-testid={testId} className={BOX[size]}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="size-full overflow-visible"
      >
        <defs>
          <clipPath id={clipId}>
            {/* Past the box by the line's width, so its round ends and peaks are never cut. */}
            <motion.rect
              x={-PAD}
              y={-PAD}
              width={W + PAD * 2}
              height={H + PAD * 2}
              style={{ originX: 0 }}
              initial={{ scaleX: reduce ? 1 : 0 }}
              animate={{ scaleX: reduce || inView ? 1 : 0 }}
              transition={reduce ? instant : { duration: tally, ease: ease.out }}
            />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <path d={area} className="fill-brand-soft" />
          <path
            d={line}
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-brand-text"
          />
        </g>
      </svg>
    </div>
  );
}
