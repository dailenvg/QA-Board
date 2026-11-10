"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { arrowNudge, rowLift } from "@/lib/motion";
import { Icon } from "../../ui/Icon";

const MotionLink = motion.create(Link);

interface TileRowProps {
  href: string;
  /** The picture at the start: a project thumbnail. */
  thumb: ReactNode;
  /** The row's lines of text. */
  children: ReactNode;
  testId: string;
  /** `data-new` and such, for tests. */
  data?: Record<`data-${string}`, string | undefined>;
}

/**
 * One row of a tile's list, a link: a thumbnail, its text, and an arrow that
 * nudges forward as the row lifts on hover or keyboard focus and gives on
 * press. The tint and pressed fill stay with reduced motion, which drops the
 * lift. The focus ring sits inside the row, so a tile's edge never clips it.
 */
export function TileRow({ href, thumb, children, testId, data }: TileRowProps) {
  const reduce = useReducedMotion() ?? false;
  const motionProps = reduce
    ? {}
    : {
        variants: rowLift,
        initial: "rest",
        animate: "rest",
        whileHover: "hover",
        whileFocus: "hover",
        whileTap: "press",
      };
  return (
    <li>
      <MotionLink
        href={href}
        data-testid={testId}
        {...data}
        {...motionProps}
        className="flex min-h-11 items-center gap-3 rounded-row px-3 py-2 transition-colors hover:bg-hover focus-visible:-outline-offset-2 active:bg-seg"
      >
        {thumb}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</span>
        <motion.span variants={reduce ? undefined : arrowNudge} className="shrink-0 text-muted">
          <Icon name="chevronRight" className="size-4" />
        </motion.span>
      </MotionLink>
    </li>
  );
}
