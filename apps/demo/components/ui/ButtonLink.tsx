"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { press } from "@/lib/motion";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button-styles";

const MotionLink = motion.create(Link);

interface ButtonLinkProps {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  testId?: string;
  external?: boolean;
  ariaLabel?: string;
  /**
   * Called for a client-side navigation only (not a new tab or window); call
   * `preventDefault` to navigate yourself, as inside a transition.
   */
  onNavigate?: (event: { preventDefault: () => void }) => void;
}

/** Link styled as a button, with spring hover and press feedback. */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  className = "",
  testId,
  external = false,
  ariaLabel,
  onNavigate,
}: ButtonLinkProps) {
  const reduce = useReducedMotion();
  return (
    <MotionLink
      href={href}
      data-testid={testId}
      aria-label={ariaLabel}
      onNavigate={onNavigate}
      className={`${buttonClass(variant, size)} ${className}`}
      {...(reduce ? {} : press)}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {children}
      {external && !ariaLabel ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </MotionLink>
  );
}
