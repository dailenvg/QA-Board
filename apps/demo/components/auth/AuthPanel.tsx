"use client";

import { motion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { Logo } from "../brand/Logo";
import { Squiggy } from "../brand/mascot/Squiggy";
import type { Mood } from "../brand/mascot/moods";

interface AuthPanelProps {
  title: string;
  description: ReactNode;
  /** Squiggy follows the form: thinking while it works, surprised at an error, happy when done. */
  mood: Mood;
  children: ReactNode;
  /** Links under the form, such as back to sign in. */
  footer?: ReactNode;
  /**
   * Move focus to the title on mount. For panels that replace a form the user just submitted
   * (sent, expired), so focus doesn't fall back to the page and screen readers hear the change.
   */
  focusTitle?: boolean;
}

const STAGGER = staggerGroup();

/** The sign-in and password reset pages: one floating panel, centered, Squiggy on top. */
export function AuthPanel({
  title,
  description,
  mood,
  children,
  footer,
  focusTitle = false,
}: AuthPanelProps) {
  const reveal = useRevealVariants();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Runs when the panel swaps in (focusTitle is fixed per panel), not on every re-render.
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-8">
      <motion.div
        variants={STAGGER}
        initial="hidden"
        animate="visible"
        className="flex w-full max-w-md flex-col items-center gap-4"
      >
        <motion.div variants={reveal}>
          <Logo linked={false} caption="Visual review" />
        </motion.div>
        <motion.section
          variants={reveal}
          aria-labelledby={titleId}
          className="flex w-full flex-col gap-6 rounded-panel bg-panel px-5 py-8 shadow-float sm:px-8"
        >
          {/* display: contents: only orchestrates, so the section's gap still spaces its children. */}
          <motion.div variants={STAGGER} className="contents">
            <motion.div variants={reveal} className="flex flex-col items-center gap-3 text-center">
              <Squiggy mood={mood} size={96} still label="Squiggy" />
              <h1
                ref={titleRef}
                id={titleId}
                tabIndex={focusTitle ? -1 : undefined}
                className="text-title font-bold text-balance focus:outline-none"
              >
                {title}
              </h1>
              <div className="text-body text-pretty text-muted">{description}</div>
            </motion.div>
            <motion.div variants={reveal} className="flex flex-col gap-4">
              {children}
            </motion.div>
          </motion.div>
        </motion.section>
        {footer ? (
          <motion.div variants={reveal} className="flex flex-wrap justify-center gap-x-4">
            {footer}
          </motion.div>
        ) : null}
      </motion.div>
    </main>
  );
}
