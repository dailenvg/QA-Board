"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePopVariants } from "@/lib/motion";
import { Icon } from "../ui/Icon";

/**
 * A 16px lock on the bottom-right corner of a team-only comment's pin (U6): the pin band's fill
 * with the white halo of `.pin-marker`, the same in both themes, so it reads on any page or image.
 * Decorative: the pin's label says "team only". It pops in and out, as the priority dot does.
 */
export function TeamOnlyBadge({ show }: { show: boolean }) {
  const variants = usePopVariants();
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.span
          key="team-only"
          aria-hidden="true"
          data-testid="team-only-badge"
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="pin-marker absolute -right-1.5 -bottom-1.5 grid size-4 place-items-center rounded-pill bg-pin-band text-pin-halo"
        >
          <Icon name="lock" className="size-3" />
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
