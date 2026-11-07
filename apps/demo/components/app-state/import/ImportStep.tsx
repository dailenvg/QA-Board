"use client";

import { motion, useIsPresent } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { useRevealVariants } from "@/lib/motion";

interface ImportStepProps {
  children: ReactNode;
  testId: string;
}

/**
 * One view of the import dialog, swapped in and out with a short reveal. On
 * mount it takes focus (its `data-autofocus` control, else itself), since the
 * control focused in the view before it is gone. Inert while it animates out,
 * so a second click can't land on a button that has already been pressed.
 */
export function ImportStep({ children, testId }: ImportStepProps) {
  const variants = useRevealVariants();
  const root = useRef<HTMLDivElement>(null);
  const present = useIsPresent();

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    (node.querySelector<HTMLElement>("[data-autofocus]") ?? node).focus({ preventScroll: true });
  }, []);

  return (
    <motion.div
      ref={root}
      tabIndex={-1}
      inert={!present}
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      data-testid={testId}
      className="flex flex-col gap-5 outline-none"
    >
      {children}
    </motion.div>
  );
}
