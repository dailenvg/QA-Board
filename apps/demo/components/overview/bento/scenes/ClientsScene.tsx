import { motion } from "motion/react";
import { duration, ease } from "@/lib/motion";
import {
  draw,
  LimeSquiggy,
  LINE_SVG,
  LinePin,
  roundedRect,
  SURFACE,
} from "../../../ui/line-art/line-art";

/** Where each pin's tip lands on the page (viewBox units): spread out, clear of each other. */
const PIN_TIPS: ReadonlyArray<readonly [number, number]> = [
  [52, 52],
  [116, 46],
  [84, 78],
  [140, 74],
  [62, 104],
  [112, 108],
];

/** The most pins the page shows; more news still shows in the count. */
export const SCENE_PINS = PIN_TIPS.length;

/** A pointer, its tip at 0,0. */
const CURSOR = "M0 0v17l5-5 4 8 3-1.5-4-8h7Z";

interface ClientsSceneProps {
  /** New client comments: one pin each, up to `SCENE_PINS`. */
  count: number;
}

/**
 * A client's cursor dropping numbered pins on a page, one per new comment, while a lime
 * Squiggy leans in from the left to listen: the welcome's Pin story cut down to its key beat,
 * in line art (`line-art.tsx`). Decorative: the tile says the same in words.
 */
export function ClientsScene({ count }: ClientsSceneProps) {
  const shown = Math.min(count, SCENE_PINS);
  const [lastX, lastY] = PIN_TIPS[Math.max(0, shown - 1)] ?? [100, 75];
  return (
    <svg viewBox="0 0 200 150" {...LINE_SVG} className={`size-full ${LINE_SVG.className}`}>
      <motion.path d={roundedRect(28, 14, 156, 122, 12)} fill={SURFACE} {...draw(0)} />
      <motion.path d="M28 30H184" {...draw(1)} />
      {[38, 46, 54].map((cx) => (
        <motion.circle key={cx} cx={cx} cy={22} r={2} {...draw(1)} />
      ))}
      <motion.path d="M42 40H96M42 124H120M42 116H150" {...draw(2)} />
      {Array.from({ length: shown }, (_, index) => {
        const [x, y] = PIN_TIPS[index] ?? [100, 75];
        return (
          <LinePin key={index} x={x} y={y} number={index + 1} resolved={false} order={3 + index} />
        );
      })}
      {/* The client's cursor glides in to where the last pin landed, and stays beside it. */}
      <motion.g
        initial={{ opacity: 0, x: lastX + 30, y: lastY + 22 }}
        animate={{ opacity: 1, x: lastX + 10, y: lastY + 2 }}
        transition={{ duration: duration.component, ease: ease.out }}
      >
        <path d={CURSOR} fill={SURFACE} />
      </motion.g>
      <LimeSquiggy x={-8} y={92} width={46} tilt={12} order={2} />
    </svg>
  );
}
