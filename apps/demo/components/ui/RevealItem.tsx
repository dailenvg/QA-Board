"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useRevealVariants } from "@/lib/motion";

interface RevealItemProps {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
  testId?: string;
}

/** Child of `Reveal`: fades up (or just fades, with reduced motion). */
export function RevealItem({ children, className, as = "div", testId }: RevealItemProps) {
  const variants = useRevealVariants();
  const Component = motion[as];
  return (
    <Component className={className} variants={variants} data-testid={testId}>
      {children}
    </Component>
  );
}
