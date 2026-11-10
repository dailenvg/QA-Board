"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { duration, ease, sceneStep } from "@/lib/motion";
import { Squiggy } from "../../../brand/mascot/Squiggy";
import { MockPin } from "../../welcome/MockPin";
import { STORY_COMMENTER } from "../../welcome/story-script";
import { checkedPins } from "@/lib/overview/charts";

/** Pins in the row: few enough that the row and Squiggy sit beside the ring on a narrow tile. */
const PINS = 4;

interface StatusSceneProps {
  open: number;
  resolved: number;
  still: boolean;
}

/**
 * A row of pins checking off, as many as the resolved share of them, then Squiggy: cheering
 * once most comments are resolved, else thinking. Decorative.
 */
export function StatusScene({ open, resolved, still }: StatusSceneProps) {
  const checks = checkedPins(open, resolved, PINS);
  const [checked, setChecked] = useState(false);
  const done = still || checked;

  useEffect(() => {
    if (still) return;
    const timer = window.setTimeout(() => setChecked(true), sceneStep * 3 * 1000);
    return () => window.clearTimeout(timer);
  }, [still]);

  return (
    <span className="flex items-end gap-2">
      <span className="flex items-end gap-1">
        {Array.from({ length: PINS }, (_, index) => (
          <span
            key={index}
            data-testid="scene-pin"
            data-resolved={done && index < checks}
            className="relative block size-6"
          >
            <span className="absolute bottom-0 left-0 block size-0">
              <MockPin
                color={STORY_COMMENTER}
                number={index + 1}
                resolved={done && index < checks}
                delay={index * sceneStep * 0.5}
              />
            </span>
          </span>
        ))}
      </span>
      <motion.span
        className="block"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.component, ease: ease.out, delay: sceneStep * 4 }}
      >
        <Squiggy
          mood={resolved > open ? "resolved" : "thinking"}
          size="2.25rem"
          still
          blinks={false}
          followCursor={false}
          as="span"
        />
      </motion.span>
    </span>
  );
}
