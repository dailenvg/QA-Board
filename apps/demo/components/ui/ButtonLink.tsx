"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { press } from "@/lib/motion";

const MotionLink = motion.create(Link);

export type ButtonVariant = "primary" | "secondary";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent shadow-soft hover:bg-accent-hover active:bg-accent-hover",
  secondary:
    "bg-raised text-ink ring-1 ring-rule-strong ring-inset hover:bg-sunken active:bg-sunken",
};

export const BUTTON_BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-6 text-small font-semibold transition-colors duration-150 select-none";

interface ButtonLinkProps {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  testId?: string;
  external?: boolean;
}

/** Link styled as a button, with spring hover and press feedback. */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
  testId,
  external = false,
}: ButtonLinkProps) {
  const reduce = useReducedMotion();
  return (
    <MotionLink
      href={href}
      data-testid={testId}
      className={`${BUTTON_BASE} ${VARIANTS[variant]} ${className}`}
      {...(reduce ? {} : press)}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {children}
    </MotionLink>
  );
}
