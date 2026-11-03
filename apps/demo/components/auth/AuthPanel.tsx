"use client";

import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
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
}

const STAGGER = staggerGroup();

/** The sign-in and password reset pages: one floating panel, centered, Squiggy on top. */
export function AuthPanel({ title, description, mood, children, footer }: AuthPanelProps) {
  const reveal = useRevealVariants();
  const titleId = useId();
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
          <div className="flex flex-col items-center gap-3 text-center">
            <Squiggy mood={mood} size={96} still label="Squiggy" />
            <h1 id={titleId} className="text-title font-bold text-balance">
              {title}
            </h1>
            <div className="text-body text-pretty text-muted">{description}</div>
          </div>
          {children}
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
