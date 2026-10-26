"use client";

import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties } from "react";
import type { CommenterColor } from "@/lib/brand-palette";
import { duration, spring } from "@/lib/motion";
import { Icon } from "../../ui/Icon";

interface MockPinProps {
  color: CommenterColor;
  /** Fills green with a check, as resolved pins do. */
  resolved?: boolean;
}

const drop = {
  initial: { opacity: 0, y: -14, scale: 0.6 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.6, transition: { duration: duration.micro } },
};

const fill = {
  initial: { opacity: 0, scale: 0.4 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, transition: { duration: duration.micro } },
};

/**
 * Pin 1, in the app's teardrop: its sharp corner is the parent's top-right
 * corner, where the comment points. Mount it to drop it in.
 */
export function MockPin({ color, resolved = false }: MockPinProps) {
  return (
    <motion.span
      data-testid="story-pin"
      data-resolved={resolved || undefined}
      data-color={color.id}
      className="absolute top-0 left-full z-10 block"
      style={{ translate: "0 -100%", originX: 0, originY: 1 }}
      {...drop}
      transition={spring.jelly}
    >
      <span
        style={{ "--pin": color.hex, "--pin-ink": color.ink } as CSSProperties}
        className="pin-marker relative grid size-6 place-items-center rounded-pin bg-(--pin) text-kbd font-bold text-(--pin-ink)"
      >
        1
        <AnimatePresence initial={false}>
          {resolved && (
            <motion.span
              key="resolved"
              className="absolute inset-0 grid place-items-center rounded-pin bg-resolved-pin text-on-resolved-pin"
              style={{ originX: 0, originY: 1 }}
              {...fill}
              transition={spring.snappy}
            >
              1
              <span className="absolute -top-1.5 -right-1.5 grid size-3.5 place-items-center rounded-full bg-card text-resolved-text shadow-seg">
                <Icon name="check" className="size-2.5" />
              </span>
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </motion.span>
  );
}
