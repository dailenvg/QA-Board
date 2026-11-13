import { motion } from "motion/react";
import { draw, LimeSquiggy, LINE_SVG, LinePin, roundedRect } from "./line-art";

/** Where each pin's tip lands on the page (before its tilt), in the order they drop. */
const PIN_TIPS: ReadonlyArray<readonly [number, number]> = [
  [70, 62],
  [124, 78],
  [100, 98],
  [30, 104],
];

/** The page's tilt, in degrees, about its middle. */
const TILT = -4;

interface HeroSceneProps {
  open: number;
  resolved: number;
}

/**
 * A project page in line art, a little askew: a picture of hills under a sun, text and a
 * button, with the workspace's pins dropping onto it (open ones numbered, then resolved ones
 * with a check, up to four in all), a magnifier over its corner, and a lime Squiggy peeking
 * over the top: the one filled shape (`line-art.tsx`). Decorative: the tile says the same.
 */
export function HeroScene({ open, resolved }: HeroSceneProps) {
  const openPins = Math.min(open, PIN_TIPS.length);
  const resolvedPins = Math.min(resolved, PIN_TIPS.length - openPins);
  const pins = [
    ...Array.from({ length: openPins }, () => false),
    ...Array.from({ length: resolvedPins }, () => true),
  ];
  return (
    <svg viewBox="0 0 200 150" {...LINE_SVG} className={`size-full ${LINE_SVG.className}`}>
      <g transform={`rotate(${TILT} 90 72)`}>
        <motion.path d={roundedRect(14, 16, 148, 110, 12)} fill="var(--color-panel)" {...draw(0)} />
        <motion.path d="M14 34H162" {...draw(1)} />
        {[25, 33, 41].map((cx) => (
          <motion.circle key={cx} cx={cx} cy={25} r={2.2} {...draw(1)} />
        ))}
        <motion.circle cx={56} cy={56} r={10} {...draw(2)} />
        <motion.path d="M26 92C44 70 58 70 74 84S106 62 126 76S146 90 150 86" {...draw(2)} />
        <motion.path d="M26 104H112M26 113H80" {...draw(3)} />
        <motion.path d={roundedRect(118, 102, 32, 14, 7)} {...draw(3)} />
        {pins.map((done, index) => {
          const [x, y] = PIN_TIPS[index] ?? [50, 50];
          return (
            <LinePin key={index} x={x} y={y} number={index + 1} resolved={done} order={4 + index} />
          );
        })}
      </g>
      <LimeSquiggy x={118} y={6} width={38} tilt={8} order={7} />
      {/* The magnifier over the page's corner: reviewing. */}
      <motion.circle cx={160} cy={108} r={22} fill="var(--color-panel)" {...draw(4)} />
      <motion.path d="M146 98a17 17 0 0 1 9-8" {...draw(5)} />
      <motion.path d="M176 124l15 15" strokeWidth={5} {...draw(5)} />
      <motion.circle cx={184} cy={22} r={2.5} {...draw(6)} />
      <motion.path d="M186 58v8M182 62h8" {...draw(6)} />
      <motion.path d="M2 140c8-6 16 6 24 0s16 6 24 0" {...draw(7)} />
    </svg>
  );
}
