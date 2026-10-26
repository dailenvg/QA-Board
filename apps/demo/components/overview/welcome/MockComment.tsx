"use client";

import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import type { CommenterColor } from "@/lib/brand-palette";
import { usePopVariants } from "@/lib/motion";

interface MockCommentProps {
  author: string;
  color: CommenterColor;
  children: ReactNode;
  /** Below the text: actions such as Resolve. */
  footer?: ReactNode;
}

/** A comment card beside the pin: the commenter's color dot, name and words. */
export function MockComment({ author, color, children, footer }: MockCommentProps) {
  const pop = usePopVariants();
  return (
    <motion.span
      data-testid="story-comment"
      data-author={author}
      className="absolute top-[12%] left-[51%] z-10 block w-[45%] rounded-tile bg-card p-2 shadow-pop ring-1 ring-line"
      style={{ originX: 0, originY: 1 }}
      variants={pop}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <span className="flex items-center gap-1.5 text-kbd font-semibold">
        <span
          style={{ "--dot": color.hex } as CSSProperties}
          className="size-2.5 rounded-full bg-(--dot)"
        />
        {author}
      </span>
      <span className="mt-1 block min-h-[2.6em] text-label leading-snug">{children}</span>
      {footer}
    </motion.span>
  );
}
