"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { spring } from "@/lib/motion";

interface MockPageProps {
  /** Drawn inside the page's button: anything aimed at it (cursor, pin, ripple). */
  onButton?: ReactNode;
  /** The button gives under a click. */
  pressed?: boolean;
  /** Floating over the page: comments. */
  children?: ReactNode;
}

/** A skeleton website in a window: nav, hero, a call-to-action button and some text. */
export function MockPage({ onButton, pressed = false, children }: MockPageProps) {
  return (
    <span className="absolute inset-x-[7%] top-[9%] -bottom-[8%] block rounded-tile bg-card shadow-float">
      <span className="absolute inset-x-[6%] top-[6%] flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-(--tint)" />
        <span className="h-1.5 w-8 rounded-pill bg-line-strong" />
        <span className="ml-auto h-1.5 w-5 rounded-pill bg-line" />
        <span className="h-1.5 w-5 rounded-pill bg-line" />
        <span className="h-1.5 w-5 rounded-pill bg-line" />
      </span>
      <span className="absolute inset-x-[6%] top-[18%] block h-[25%] rounded-field bg-(--tint)/15 p-[4%]">
        <span className="block h-2 w-1/2 rounded-pill bg-(--tint)/45" />
        <span className="mt-1.5 block h-2 w-1/3 rounded-pill bg-(--tint)/30" />
      </span>
      <motion.span
        className="absolute top-[50%] left-[6%] block h-[10%] w-[30%] rounded-pill bg-brand"
        animate={{ scale: pressed ? 0.9 : 1 }}
        transition={spring.snappy}
      >
        {onButton}
      </motion.span>
      <span className="absolute inset-x-[6%] top-[68%] flex flex-col gap-1.5">
        <span className="h-1.5 w-3/4 rounded-pill bg-line-strong" />
        <span className="h-1.5 w-1/2 rounded-pill bg-line" />
        <span className="h-1.5 w-2/3 rounded-pill bg-line" />
      </span>
      {children}
    </span>
  );
}
