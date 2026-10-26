"use client";

import { AnimatePresence, motion } from "motion/react";
import { mix } from "@/lib/color";
import { duration, ease, spring } from "@/lib/motion";
import { useTheme } from "@/lib/use-theme";
import { RESOLVED_APEX, RESOLVED_HOP, type Mood } from "./moods";
import { BRAND, CONFETTI_COLORS } from "./paths";

type Props = { mood: Mood; color: string; reduce: boolean };

const fadeOut = { opacity: 0, scale: 0.4, transition: { duration: duration.micro } };

/** Little extras that sell a mood: thought bubbles, snores, sparkles, confetti. */
export function MoodProps({ mood, color, reduce }: Props) {
  return (
    <AnimatePresence>
      {mood === "thinking" && <ThoughtBubbles key="thinking" color={color} reduce={reduce} />}
      {mood === "sleeping" && <Snores key="sleeping" color={color} reduce={reduce} />}
      {mood === "happy" && <Sparkles key="happy" color={color} reduce={reduce} />}
      {mood === "resolved" && <Resolved key="resolved" reduce={reduce} />}
    </AnimatePresence>
  );
}

const BUBBLES = [
  { cx: 458, cy: 326, r: 7 },
  { cx: 481, cy: 297, r: 10 },
  { cx: 508, cy: 263, r: 14 },
];

function ThoughtBubbles({ color, reduce }: Omit<Props, "mood">) {
  return (
    <motion.g exit={{ opacity: 0, transition: { duration: duration.micro } }}>
      {BUBBLES.map((b, i) => (
        <motion.circle
          key={i}
          {...b}
          fill={color}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, y: reduce ? 0 : [0, -4, 0] }}
          exit={fadeOut}
          transition={{
            scale: { ...spring.jelly, delay: i * 0.12 },
            opacity: { duration: duration.micro, delay: i * 0.12 },
            y: { duration: 1.6, ease: ease.breathe, repeat: Infinity, delay: i * 0.2 },
          }}
        />
      ))}
    </motion.g>
  );
}

const Z_PATH = "M-8 -9 H8 L-8 9 H8";
const SNORES = [
  { x: 446, y: 336, size: 0.8 },
  { x: 446, y: 336, size: 1 },
  { x: 446, y: 336, size: 1.25 },
];

/** Snores are thin strokes in the body color; on a dark theme that's about 3.4:1, so they lighten to 7.8:1. */
const DARK_SNORE_LIFT = 0.45;

function Snores({ color: body, reduce }: Omit<Props, "mood">) {
  const dark = useTheme() === "dark";
  const color = dark ? mix(body, "#FFFFFF", DARK_SNORE_LIFT) : body;
  if (reduce) {
    return (
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <path d={Z_PATH} transform="translate(470 300)" {...zStroke(color)} />
      </motion.g>
    );
  }
  return (
    <motion.g exit={{ opacity: 0, transition: { duration: duration.micro } }}>
      {SNORES.map((z, i) => (
        <g key={i} transform={`translate(${z.x} ${z.y})`}>
          <motion.path
            d={Z_PATH}
            {...zStroke(color)}
            initial={{ opacity: 0, scale: 0.5 * z.size, x: 0, y: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              scale: [0.5 * z.size, z.size],
              x: [0, 22, 40],
              y: [0, -40, -78],
            }}
            transition={{ duration: 2.8, ease: "easeOut", repeat: Infinity, delay: i * 0.93 }}
          />
        </g>
      ))}
    </motion.g>
  );
}

const zStroke = (color: string) => ({
  fill: "none",
  stroke: color,
  strokeWidth: 4.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

const STAR_PATH =
  "M0 -12 C1.6 -3.2 3.2 -1.6 12 0 C3.2 1.6 1.6 3.2 0 12 C-1.6 3.2 -3.2 1.6 -12 0 C-3.2 -1.6 -1.6 -3.2 0 -12 Z";
const STARS = [
  { x: 92, y: 330, size: 1.1 },
  { x: 496, y: 352, size: 0.85 },
  { x: 452, y: 286, size: 0.6 },
];

function Sparkles({ color, reduce }: Omit<Props, "mood">) {
  return (
    <motion.g exit={{ opacity: 0, transition: { duration: duration.micro } }}>
      {STARS.map((s, i) => (
        <g key={i} transform={`translate(${s.x} ${s.y}) scale(${s.size})`}>
          <motion.path
            d={STAR_PATH}
            fill={color}
            initial={{ scale: 0, rotate: 0 }}
            animate={reduce ? { scale: 1 } : { scale: [0, 1, 0], rotate: [0, 90] }}
            transition={
              reduce
                ? { duration: duration.micro }
                : { duration: 1.15, ease: "easeInOut", repeat: Infinity, delay: i * 0.38 }
            }
          />
        </g>
      ))}
    </motion.g>
  );
}

// Confetti bursts from the top of the bubble across the upper half-circle.
const BURST_ORIGIN = { x: 287, y: 322 };
const CONFETTI = Array.from({ length: 20 }, (_, i) => {
  const angle = ((-165 + (150 * i) / 19) * Math.PI) / 180;
  const distance = 130 + ((i * 37) % 70);
  return {
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    round: i % 3 === 0,
    spin: (i % 2 ? 1 : -1) * (180 + ((i * 47) % 180)),
    stagger: (i % 4) * 0.02,
  };
});

const BADGE = { cx: 452, cy: 350, r: 36 };
const CHECK_PATH = "M434 351 L447 364 L471 338";
// Drawn with a dash offset rather than pathLength, which renders partially in Chrome.
const CHECK_LENGTH = 54;

function Resolved({ reduce }: { reduce: boolean }) {
  return (
    <motion.g exit={{ opacity: 0, transition: { duration: duration.micro } }}>
      {!reduce && (
        <g transform={`translate(${BURST_ORIGIN.x} ${BURST_ORIGIN.y})`}>
          {CONFETTI.map((c, i) => {
            const loop = {
              duration: RESOLVED_HOP,
              repeat: Infinity,
              repeatDelay: RESOLVED_HOP,
              delay: RESOLVED_APEX + c.stagger,
            };
            // Round pieces are squares with full corner radius, so one element type covers both.
            const [w, h] = c.round ? [16, 16] : [11, 24];
            return (
              <motion.rect
                key={i}
                x={-w / 2}
                y={-h / 2}
                width={w}
                height={h}
                rx={c.round ? 8 : 4}
                fill={c.color}
                initial={{ opacity: 0 }}
                animate={{
                  x: [0, c.dx * 0.8, c.dx],
                  // Shoots out, then falls under "gravity".
                  y: [0, c.dy, c.dy + 120],
                  rotate: [0, c.spin],
                  scale: [0.4, 1, 0.8],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  default: { ...loop, ease: "easeOut" },
                  x: { ...loop, ease: "easeOut", times: [0, 0.45, 1] },
                  y: { ...loop, ease: ["easeOut", "easeIn"], times: [0, 0.45, 1] },
                  opacity: { ...loop, times: [0, 0.05, 0.75, 1] },
                }}
              />
            );
          })}
        </g>
      )}

      <motion.g
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        exit={fadeOut}
        transition={
          reduce ? { duration: duration.micro } : { ...spring.jelly, delay: RESOLVED_APEX }
        }
      >
        <circle {...BADGE} fill={BRAND.success} stroke={BRAND.eye} strokeWidth={8} />
        <motion.path
          d={CHECK_PATH}
          fill="none"
          stroke={BRAND.eye}
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={CHECK_LENGTH}
          initial={{ strokeDashoffset: reduce ? 0 : CHECK_LENGTH }}
          animate={{ strokeDashoffset: 0 }}
          transition={{
            duration: duration.component,
            ease: ease.out,
            delay: reduce ? 0 : RESOLVED_APEX + 0.12,
          }}
        />
      </motion.g>
    </motion.g>
  );
}
